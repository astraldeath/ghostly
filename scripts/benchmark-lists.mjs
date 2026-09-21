import { readFile, mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { parseList } from "../extension/shared/subscriptions.js";
import { createMatcher, compileRule } from "../extension/shared/rules.js";

const filename = process.argv[2];
if (!filename)
  throw new Error(
    "Usage: node scripts/benchmark-lists.mjs path/to/list.txt [--baseline]",
  );
const text = await readFile(filename, "utf8");
let start = performance.now();
const list = parseList(text);
const parseMs = performance.now() - start;
start = performance.now();
const matcher = createMatcher({
  lists: [{ ...list, enabled: true }],
  exclusions: [],
});
const indexMs = performance.now() - start;
const domain = list.rules.find((rule) => rule.type === "domain").value;
const count = 10000;
const measure = (url) => {
  const began = performance.now();
  for (let i = 0; i < count; i++) matcher.explain(url);
  return performance.now() - began;
};
const result = {
  bytes: Buffer.byteLength(text),
  rules: list.rules.length,
  urlsPerCase: count,
  parseMs,
  indexMs,
  missesMs: measure("https://unlisted.example.invalid/page"),
  hitsMs: measure(`https://${domain}/page`),
  subdomainHitsMs: measure(`https://sub.${domain}/page`),
  node: process.version,
};
if (process.argv.includes("--baseline")) {
  const old = list.rules.map(compileRule);
  start = performance.now();
  for (let i = 0; i < 10; i++)
    old.some((match) => match("https://unlisted.example.invalid/page"));
  result.linearTenMissesMs = performance.now() - start;
}
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/list-benchmark.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
