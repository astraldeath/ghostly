import {
  defaults,
  migrateSettings,
  validateSettings,
} from "../shared/settings.js";
import { createMatcher } from "../shared/rules.js";

const DAY = 86400000;
const emptyStats = () => ({
  totalDeleted: 0,
  totalRuns: 0,
  lastDeletedCount: 0,
  lastSuccessAt: 0,
});

export class CleanupController {
  constructor({
    history,
    storage,
    now = Date.now,
    batchSize = 500,
    matcherFactory = createMatcher,
  }) {
    Object.assign(this, { history, storage, now, batchSize, matcherFactory });
    this.busy = false;
    this.saving = false;
    this.generation = 0;
    this.settings = defaults();
    this.stats = emptyStats();
    this.job = { state: "idle" };
    this.previewResult = null;
  }

  async initialize() {
    const data = await this.storage.get(null);
    this.recoveryError = null;
    this.recoveryData = null;
    try {
      this.settings = migrateSettings(data);
    } catch (error) {
      this.settings = defaults();
      this.recoveryError = error.message;
      this.recoveryData = Object.fromEntries(
        [
          "settings",
          "patternLists",
          "patterns",
          "regexPatterns",
          "exclusionPatterns",
          "maxAgeDays",
        ]
          .filter((key) => Object.hasOwn(data, key))
          .map((key) => [key, data[key]]),
      );
    }
    this.stats = { ...emptyStats(), ...data.stats };
    this.job = data.job || { state: "idle" };
    if (this.recoveryError)
      this.job = {
        state: "error",
        error: "Settings need recovery. Automation is paused.",
      };
    this.matcher?.dispose?.();
    this.matcher = this.matcherFactory(this.settings);
    if (!this.recoveryError)
      await this.storage.set({ settings: this.settings, stats: this.stats });
    return this.getState();
  }

  getState() {
    return structuredClone({
      settings: this.settings,
      stats: this.stats,
      job: this.job,
      busy: this.busy || this.saving,
      recoveryError: this.recoveryError,
    });
  }
  getStatus() {
    return structuredClone({
      settings: {
        revision: this.settings.revision,
        paused: this.settings.paused,
        theme: this.settings.theme,
      },
      stats: this.stats,
      job: this.job,
      busy: this.busy || this.saving,
      recoveryError: this.recoveryError,
    });
  }

  async saveSettings(input) {
    if (this.saving)
      throw new Error("Already saving settings. Try again shortly.");
    const settings = validateSettings(input);
    if (settings.revision !== this.settings.revision)
      throw new Error(
        "Settings changed in another window. Reload before saving.",
      );
    settings.revision = this.settings.revision + 1;
    // Gate new work and cancel old jobs before awaiting persistence. Publish
    // settings and matcher together only after storage succeeds.
    this.saving = true;
    this.generation++;
    this.previewResult = null;
    try {
      const recoveryJob = this.recoveryError ? { state: "idle" } : null;
      await this.storage.set({
        settings,
        ...(recoveryJob ? { job: recoveryJob } : {}),
      });
      this.settings = settings;
      this.recoveryError = null;
      if (recoveryJob) this.job = recoveryJob;
      if (!this.busy) {
        this.matcher?.dispose?.();
        this.matcher = this.matcherFactory(settings);
      }
    } finally {
      this.saving = false;
    }
    return this.getState();
  }

  async setPaused(paused, revision) {
    if (this.recoveryError)
      throw new Error(
        "Repair and save your settings before enabling automation.",
      );
    return this.saveSettings({ ...this.settings, paused, revision });
  }

  getRecoveryBackup() {
    if (!this.recoveryData) throw new Error("No recovery backup is needed.");
    return structuredClone({ version: "recovery", data: this.recoveryData });
  }

  async preview(mode = "both") {
    const generation = this.generation;
    const result = await this.run({ mode, preview: true });
    if (generation !== this.generation)
      throw new Error("Settings changed. Preview again.");
    this.previewResult = {
      ...result,
      token: crypto.randomUUID(),
      revision: this.settings.revision,
      expires: this.now() + 15 * 60000,
      mode,
    };
    return structuredClone(this.previewResult);
  }

  async clean(token) {
    const p = this.previewResult;
    if (
      !p ||
      token !== p.token ||
      p.revision !== this.settings.revision ||
      p.expires < this.now()
    )
      throw new Error("Preview expired or settings changed. Preview again.");
    this.previewResult = null;
    return this.run({ mode: p.mode });
  }

  async resume() {
    if (this.job.state !== "running") return;
    if (this.job.revision !== this.settings.revision) {
      this.job = { ...this.job, state: "cancelled", pending: [] };
      await this.storage.set({ job: this.job });
      return;
    }
    return this.run({
      mode: this.job.mode,
      automatic: this.job.automatic,
      resume: true,
    });
  }

  async visit(item) {
    // A scheduled full pass catches visits arriving during another operation.
    if (this.busy || this.saving || this.settings.paused || !item.url) return;
    this.busy = true;
    const revision = this.settings.revision;
    const generation = this.generation;
    try {
      const match = await this.matcher.explain(item.url);
      if (generation !== this.generation || !match.matched || match.excluded)
        return;
      await this.history.deleteUrl({ url: item.url });
      this.stats.totalDeleted++;
      await this.storage.set({ stats: this.stats });
    } finally {
      this.busy = false;
      if (revision !== this.settings.revision) {
        this.matcher.dispose?.();
        this.matcher = this.matcherFactory(this.settings);
      }
    }
  }

  async run({
    mode = "both",
    preview = false,
    automatic = false,
    resume = false,
  } = {}) {
    if (this.busy) throw new Error("A cleanup or preview is already running.");
    if (this.saving)
      throw new Error("Settings are being saved. Try again shortly.");
    if (!["both", "patterns", "age"].includes(mode))
      throw new Error("Unknown cleanup mode.");
    if (automatic && this.settings.paused) return { count: 0 };
    this.busy = true;
    const settings = this.settings;
    const revision = settings.revision;
    const generation = this.generation;
    const matcher = this.matcher;
    const startedAt = resume ? this.job.startedAt : this.now();
    const cutoff = startedAt - settings.retentionDays * DAY;
    const job = resume
      ? structuredClone(this.job)
      : {
          state: "running",
          mode,
          revision,
          startedAt,
          automatic,
          pending: [[0, mode === "age" ? Math.max(0, cutoff) : startedAt]],
          deleted: 0,
          scanned: 0,
        };
    let count = 0;
    const samples = [];
    const seen = new Set();
    const checkCurrent = () => {
      if (this.generation !== generation)
        throw new Error("Settings changed. This run was cancelled.");
    };
    const persist = async () => {
      if (!preview) {
        this.job = structuredClone(job);
        await this.storage.set({ job: this.job, stats: this.stats });
      }
    };
    try {
      await persist();
      const hasPatterns = settings.lists.some(
        (x) => x.enabled && x.rules.length,
      );
      if (
        (mode === "patterns" && !hasPatterns) ||
        (mode === "age" && !settings.retentionDays) ||
        (mode === "both" && !hasPatterns && !settings.retentionDays)
      )
        job.pending = [];
      while (job.pending.length) {
        checkCurrent();
        const [startTime, endTime] = job.pending.at(-1);
        const items = await this.history.search({
          text: "",
          startTime,
          endTime,
          maxResults: this.batchSize + 1,
        });
        checkCurrent();
        if (items.length > this.batchSize) {
          if (endTime - startTime <= 1)
            throw new Error(
              "Too many URLs share one timestamp. No entries in this range were removed.",
            );
          const middle = Math.floor((startTime + endTime) / 2);
          job.pending.pop();
          job.pending.push([startTime, middle], [middle, endTime]);
          await persist();
          continue;
        }
        for (const item of items) {
          checkCurrent();
          if (!item.url || seen.has(item.url)) continue;
          seen.add(item.url);
          job.scanned++;
          const match = await matcher.explain(item.url);
          if (match.excluded) continue;
          const patternMatch = mode !== "age" && match.matched;
          const ageMatch =
            mode !== "patterns" &&
            settings.retentionDays > 0 &&
            item.lastVisitTime < cutoff;
          if (!patternMatch && !ageMatch) continue;
          if (!patternMatch) {
            const visits = await this.history.getVisits({ url: item.url });
            if (
              !visits.length ||
              visits.some(
                (v) => !Number.isFinite(v.visitTime) || v.visitTime >= cutoff,
              )
            )
              continue;
          }
          checkCurrent();
          count++;
          if (preview) {
            if (samples.length < 20)
              samples.push({
                url: item.url,
                reason: patternMatch ? match.list : "Retention",
              });
          } else {
            try {
              await this.history.deleteUrl({ url: item.url });
            } catch {
              throw new Error(
                "A history entry could not be removed. Check Firefox permissions and try again.",
              );
            }
            job.deleted++;
            this.stats.totalDeleted++;
          }
        }
        job.pending.pop();
        await persist();
      }
      checkCurrent();
      if (!preview) {
        job.state = "complete";
        job.finishedAt = this.now();
        this.stats.totalRuns++;
        this.stats.lastDeletedCount = job.deleted;
        this.stats.lastSuccessAt = job.finishedAt;
        await persist();
      }
      return { count, scanned: job.scanned, samples };
    } catch (error) {
      if (!preview) {
        job.state = this.generation !== generation ? "cancelled" : "error";
        job.error = error.message;
        await persist();
      }
      throw error;
    } finally {
      this.busy = false;
      if (revision !== this.settings.revision) {
        matcher.dispose?.();
        this.matcher = this.matcherFactory(this.settings);
      }
    }
  }
}
