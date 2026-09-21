import { readFile, writeFile, copyFile } from "node:fs/promises";
const names = [
  "ghost",
  "settings-2",
  "plus",
  "x",
  "trash-2",
  "shield",
  "chevron-down",
  "info",
  "search",
  "download",
  "upload",
  "arrow-right",
  "clock",
  "scan-eye",
];
const symbols = await Promise.all(
  names.map(async (name) => {
    const svg = await readFile(
      `node_modules/lucide-static/icons/${name}.svg`,
      "utf8",
    );
    const body = svg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/)[1];
    return `<symbol id="${name}" viewBox="0 0 24 24">${body}</symbol>`;
  }),
);
await writeFile(
  "extension/assets/lucide.svg",
  `<!-- Lucide 1.47.0, ISC license: lucide-LICENSE.txt -->\n<svg xmlns="http://www.w3.org/2000/svg">${symbols.join("\n")}</svg>\n`,
);
await copyFile(
  "node_modules/lucide-static/LICENSE",
  "extension/assets/lucide-LICENSE.txt",
);
const ghost = await readFile(
  "node_modules/lucide-static/icons/ghost.svg",
  "utf8",
);
await writeFile(
  "extension/assets/icon.svg",
  ghost
    .replace('width="24"', 'width="96"')
    .replace('height="24"', 'height="96"')
    .replace('stroke="currentColor"', 'stroke="#7868df"'),
);
console.log(`Bundled ${names.length} Lucide icons.`);
