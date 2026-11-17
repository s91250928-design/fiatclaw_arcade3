export default function handler(req, res) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const origin = host ? `${proto}://${host}` : "";
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("access-control-allow-origin", "*");
  res.status(200).send(JSON.stringify({
    url: origin,
    name: "Totum",
    iconUrl: origin ? `${origin}/icon.png` : "",
  }));
}
