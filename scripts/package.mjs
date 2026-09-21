import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import yauzl from "yauzl";

const manifest = JSON.parse(await readFile("extension/manifest.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
if (manifest.version !== pkg.version)
  throw new Error("Package and manifest versions must match.");
const source = path.resolve("extension");
async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) =>
      e.isDirectory()
        ? listFiles(path.join(dir, e.name))
        : path.join(dir, e.name),
    ),
  );
  return nested.flat();
}
const files = await listFiles(source);
for (const file of files)
  if (!/\.(js|html|css|json|svg|png|txt)$/.test(file))
    throw new Error(`Unexpected extension asset: ${file}`);
await mkdir("artifacts", { recursive: true });
// Invoke the pinned CLI so ZIP behavior matches development and CI.
const cli = fileURLToPath(
  new URL("../node_modules/web-ext/bin/web-ext.js", import.meta.url),
);
const filename = `ghostly-${manifest.version}.zip`;
const result = spawnSync(
  process.execPath,
  [
    cli,
    "build",
    "--source-dir",
    source,
    "--artifacts-dir",
    "artifacts",
    "--filename",
    filename,
    "--overwrite-dest",
  ],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status || 1);
const zip = await readFile(`artifacts/${filename}`);
const archive = await new Promise((resolve, reject) => {
  yauzl.fromBuffer(zip, { lazyEntries: true }, (error, reader) => {
    if (error) {
      reject(error);
      return;
    }
    const entries = new Map();
    reader.on("error", reject);
    reader.on("end", () => resolve(entries));
    reader.on("entry", (entry) => {
      if (entry.fileName.endsWith("/")) {
        reader.readEntry();
        return;
      }
      reader.openReadStream(entry, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => {
          if (entries.has(entry.fileName)) {
            reject(new Error("Duplicate archive entry"));
            return;
          }
          entries.set(entry.fileName, Buffer.concat(chunks));
          reader.readEntry();
        });
      });
    });
    reader.readEntry();
  });
});
if (archive.size !== files.length)
  throw new Error("Archive contains missing or unexpected files.");
for (const file of files) {
  const relative = path.relative(source, file).replaceAll("\\", "/");
  if (!archive.get(relative)?.equals(await readFile(file)))
    throw new Error(`Archive verification failed: ${relative}`);
}
if (JSON.parse(archive.get("manifest.json").toString()).version !== pkg.version)
  throw new Error("Archive manifest mismatch.");
const digest = createHash("sha256").update(zip).digest("hex");
await writeFile(`artifacts/${filename}.sha256`, `${digest}  ${filename}\n`);
await writeFile(
  "artifacts/package-files.txt",
  files
    .map((file) => path.relative(source, file).replaceAll("\\", "/"))
    .sort()
    .join("\n") + "\n",
);
console.log(
  `Verified ${files.length} archive assets against source; SHA-256 ${digest}`,
);
