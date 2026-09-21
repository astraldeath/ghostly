import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve("extension");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/preview-adapter.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(await readFile("scripts/preview-adapter.js"));
      return;
    }
    const relative =
      url.pathname === "/"
        ? "options/index.html"
        : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    let body = await readFile(file);
    if (relative === "options/index.js" || relative === "popup/index.js")
      body = 'import "/preview-adapter.js";\n' + body.toString();
    if (relative.endsWith(".html"))
      body = body
        .toString()
        .replace(
          /<body([^>]*)>/,
          '<body$1><div class="preview-banner">Design preview · synthetic history only</div>',
        );
    res.setHeader(
      "Content-Type",
      types[path.extname(file)] || "application/octet-stream",
    );
    res.setHeader("Cache-Control", "no-store");
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(4173, "127.0.0.1", () =>
  console.log("Ghostly preview: http://127.0.0.1:4173/options/index.html"),
);
