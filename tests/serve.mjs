// Мини-сервер для проверок: отдаёт dist/, адрес /trade → index.html (как rewrite на Vercel)
import http from "http"; import fs from "fs"; import path from "path";
const root = path.resolve(process.argv[2] || "dist"), port = Number(process.argv[3] || 8765);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split("?")[0]); if (p === "/" || p === "/trade") p = "/index.html";
  const f = path.join(root, p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); r.end(b); });
}).listen(port, () => console.log("serving", root, port));
