// Мини-сервер для проверок: отдаёт dist/, адрес /trade → index.html (как rewrite на Vercel)
import http from "http"; import fs from "fs"; import path from "path"; import zlib from "zlib";
const root = path.resolve(process.argv[2] || "dist"), port = Number(process.argv[3] || 8765);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const hl = (await import(path.resolve("deploy/api/hl.mjs"))).default;
http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split("?")[0]);
  /* как на Vercel: /api/hl — сжатые списки рынков */
  if (p === "/api/hl") { const hd = {}; let code = 200; return hl(q, { setHeader: (k, v) => (hd[k] = v), status(c) { code = c; return this; }, send(b) { const z = zlib.gzipSync(Buffer.from(b)); r.writeHead(code, { ...hd, "content-encoding": "gzip", "content-length": z.length }); r.end(z); } }); } if (p === "/" || p === "/trade") p = "/index.html";
  const f = path.join(root, p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } const ty = types[path.extname(f)] || "application/octet-stream";
    /* как Vercel: текстовые файлы сжимаем, если браузер это умеет */
    if (/text|javascript|json|svg/.test(ty) && /gzip/.test(q.headers["accept-encoding"] || "")) { const z = zlib.gzipSync(b); r.writeHead(200, { "content-type": ty, "content-encoding": "gzip", "content-length": z.length }); return r.end(z); }
    r.writeHead(200, { "content-type": ty, "content-length": b.length }); r.end(b); });
}).listen(port, () => console.log("serving", root, port));
