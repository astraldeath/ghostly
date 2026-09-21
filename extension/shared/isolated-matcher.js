// Regex runs off the UI/background thread and has a hard time budget.
export function isolatedMatcher(settings) {
  let worker;
  let first = true;
  let pendingReject;
  let timer;
  return {
    explain(url) {
      if (pendingReject) return Promise.reject(new Error("Matcher is busy."));
      worker ||= new Worker(new URL("./matcher-worker.js", import.meta.url), {
        type: "module",
      });
      return new Promise((resolve, reject) => {
        pendingReject = reject;
        const finish = (error, result) => {
          clearTimeout(timer);
          pendingReject = null;
          error ? reject(error) : resolve(result);
        };
        timer = setTimeout(() => {
          worker.terminate();
          worker = null;
          first = true;
          finish(
            new Error("A regex took too long. Simplify your advanced rules."),
          );
        }, 1500);
        worker.onmessage = ({ data }) =>
          finish(data.error ? new Error(data.error) : null, data.result);
        worker.onerror = () => {
          worker.terminate();
          worker = null;
          first = true;
          finish(new Error("Rule evaluation failed."));
        };
        worker.postMessage({ settings: first ? settings : undefined, url });
        first = false;
      });
    },
    dispose() {
      clearTimeout(timer);
      worker?.terminate();
      worker = null;
      first = true;
      pendingReject?.(new Error("Rule evaluation cancelled."));
      pendingReject = null;
    },
  };
}
