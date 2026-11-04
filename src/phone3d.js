/* 3D-телефон для лендинга («Как начать»): титановый корпус, стекло, островок, боковые кнопки.
   На экране как текстура идёт запись нашего настоящего сайта. Покачивается и наклоняется
   за курсором; рисует, только пока виден на экране. */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ShapeGeometry(s, 24), p = g.attributes.position, uv = [];
  for (let i = 0; i < p.count; i++) uv.push((p.getX(i) - x) / w, (p.getY(i) - y) / h);
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
/* строка состояния iOS: время слева, справа — связь (4 столбика), Wi-Fi (3 дуги), батарея */
function statusTex() {
  const W = 1170, H = 162, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  x.fillStyle = "#0f1623"; x.fillRect(0, 0, W, H);
  x.fillStyle = "#fff"; x.textBaseline = "middle";
  x.font = "600 51px -apple-system, 'SF Pro Text', 'Helvetica Neue', Manrope, sans-serif";
  x.textAlign = "center"; x.fillText("9:41", 168, 92);
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.roundRect(X, Y, w, h, r); x.fill(); };
  /* связь */
  [[0, 15], [1, 22], [2, 30], [3, 38]].forEach(([k, h]) => rr(828 + k * 17, 110 - h, 12, h, 3));
  /* Wi-Fi: три дуги и точка */
  x.save(); x.translate(938, 111); x.strokeStyle = "#fff"; x.lineCap = "round";
  [[32, 8], [21, 8], [10, 0]].forEach(([r, w], k) => { if (k === 2) { x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 12, -Math.PI * 0.76, -Math.PI * 0.24); x.closePath(); x.fill(); return; } x.lineWidth = w; x.beginPath(); x.arc(0, 0, r + 8, -Math.PI * 0.76, -Math.PI * 0.24); x.stroke(); });
  x.restore();
  /* батарея: корпус, контакт, заряд */
  x.strokeStyle = "rgba(255,255,255,.42)"; x.lineWidth = 3.5; x.beginPath(); x.roundRect(1000, 74, 72, 36, 11); x.stroke();
  x.fillStyle = "rgba(255,255,255,.42)"; rr(1076, 85, 6, 14, 3);
  x.fillStyle = "#fff"; rr(1005, 79, 62, 26, 7);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export function mountPhone(host, video) {
  let r;
  try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); } catch { return null; }
  r.setPixelRatio(Math.min(Math.max(devicePixelRatio || 1, 1.5), 2.5));
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.domElement.className = "ph3-canvas";
  host.appendChild(r.domElement);
  const scene = new THREE.Scene(), pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50); cam.position.set(0, 0, 5.0);
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-2, 3, 4);
  const rim = new THREE.PointLight(0x38bdf8, 18, 10); rim.position.set(2.2, 1.2, 1.2);
  const rim2 = new THREE.PointLight(0x8b5cf6, 14, 10); rim2.position.set(-2.4, -1.4, 1);
  scene.add(key, rim, rim2);

  /* пропорции iPhone 16 Pro: 71,5 × 149,6 × 8,25 мм, радиус углов ~11 мм */
  const W = 0.765, H = 1.6, D = 0.088, R = 0.118;
  const group = new THREE.Group(); scene.add(group);
  /* корпус — титан: скруглённый прямоугольник, выдавленный в толщину, с мягкой фаской по краю */
  const outline = new THREE.Shape(), bx = -W / 2 + 0.012, by = -H / 2 + 0.012, bw = W - 0.024, bh = H - 0.024, br = R - 0.012;
  outline.moveTo(bx + br, by); outline.lineTo(bx + bw - br, by); outline.absarc(bx + bw - br, by + br, br, -Math.PI / 2, 0);
  outline.lineTo(bx + bw, by + bh - br); outline.absarc(bx + bw - br, by + bh - br, br, 0, Math.PI / 2);
  outline.lineTo(bx + br, by + bh); outline.absarc(bx + br, by + bh - br, br, Math.PI / 2, Math.PI);
  outline.lineTo(bx, by + br); outline.absarc(bx + br, by + br, br, Math.PI, Math.PI * 1.5);
  const bodyGeo = new THREE.ExtrudeGeometry(outline, { depth: D - 0.024, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 8, curveSegments: 48 });
  bodyGeo.translate(0, 0, -(D - 0.024) / 2);
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshPhysicalMaterial({ color: 0x3a4357, metalness: 1, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 1.35 }));
  group.add(body);
  /* стекло — чёрная рамка экрана */
  const glass = new THREE.Mesh(roundRect(W - 0.022, H - 0.022, R - 0.012), new THREE.MeshPhysicalMaterial({ color: 0x05070d, metalness: 0, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 }));
  glass.position.z = D / 2 + 0.0015; group.add(glass);
  /* экран: запись сайта + строка состояния */
  const SW = W - 0.07, SH = H - 0.07, SR = R - 0.035, SB = (SW - 2 * SR * 0.6) * (162 / 1170);
  const vt = new THREE.VideoTexture(video); vt.colorSpace = THREE.SRGBColorSpace;
  vt.minFilter = THREE.LinearFilter; vt.magFilter = THREE.LinearFilter; vt.generateMipmaps = false; vt.anisotropy = r.capabilities.getMaxAnisotropy();
  const vidH = SH - SB, vAsp = (video.videoWidth || 1080) / (video.videoHeight || 2248), aAsp = SW / vidH;
  /* видео встаёт без растяжения: лишнее обрезаем по краям (cover) */
  if (vAsp > aAsp) { const k = aAsp / vAsp; vt.repeat.set(k, 1); vt.offset.set((1 - k) / 2, 0); }
  else { const k = vAsp / aAsp; vt.repeat.set(1, k); vt.offset.set(0, 1 - k); }
  const scr = new THREE.Mesh(roundRect(SW, SH, SR), new THREE.MeshBasicMaterial({ color: 0x0f1623, toneMapped: false }));
  scr.position.z = D / 2 + 0.002; group.add(scr);
  const vid = new THREE.Mesh(new THREE.PlaneGeometry(SW, vidH), new THREE.MeshBasicMaterial({ map: vt, toneMapped: false }));
  vid.position.set(0, -SB / 2, D / 2 + 0.0025); group.add(vid);
  /* нижние углы видео скругляем маской из экрана: накрываем углы цветом стекла */
  const sb = new THREE.Mesh(new THREE.PlaneGeometry(SW - 2 * SR * 0.6, SB), new THREE.MeshBasicMaterial({ map: statusTex(), toneMapped: false }));
  sb.position.set(0, SH / 2 - SB / 2, D / 2 + 0.0026); group.add(sb);
  const isl = new THREE.Mesh(roundRect(0.2, 0.056, 0.028), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  isl.position.set(0, SH / 2 - SB / 2, D / 2 + 0.004); group.add(isl);
  /* скругление углов видео: стеклянные «уголки» поверх */
  const cornerMat = new THREE.MeshBasicMaterial({ color: 0x05070d });
  for (const [sx, sy] of [[-1, -1], [1, -1]]) {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(SR, 0); s.quadraticCurveTo(0, 0, 0, SR); s.lineTo(0, 0);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s, 12), cornerMat);
    m.position.set(sx * (SW / 2), sy * (SH / 2), D / 2 + 0.0028); m.scale.set(-sx, -sy, 1); group.add(m);
  }
  /* полоска «домой» iOS */
  const home = new THREE.Mesh(roundRect(0.22, 0.012, 0.006), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false }));
  home.position.set(0, -SH / 2 + 0.03, D / 2 + 0.0031); group.add(home);
  /* блик на стекле */
  const glare = new THREE.Mesh(roundRect(SW, SH, SR), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.035, depthWrite: false }));
  glare.position.z = D / 2 + 0.003; glare.scale.set(1, 1, 1); group.add(glare);
  /* боковые кнопки */
  const btnMat = body.material;
  [[-1, 0.38, 0.11], [-1, 0.2, 0.17], [-1, -0.0, 0.17], [1, 0.25, 0.26]].forEach(([s, y, h]) => {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.018, h, 0.035, 3, 0.008), btnMat);
    b.position.set(s * (W / 2 + 0.006), y, 0); group.add(b);
  });

  const size = () => { const w = host.clientWidth || 1, h = host.clientHeight || 1; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  size(); const ro = new ResizeObserver(size); ro.observe(host);
  const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  const onMove = (e) => { const b = host.getBoundingClientRect(); target.x = ((e.clientX - (b.left + b.width / 2)) / innerWidth) * 2; target.y = ((e.clientY - (b.top + b.height / 2)) / innerHeight) * 2; };
  addEventListener("pointermove", onMove, { passive: true });
  let visible = false, raf = 0, last = performance.now(), t = 0;
  function frame(now) {
    raf = 0; const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    cur.x += (target.x - cur.x) * Math.min(1, dt * 2.5); cur.y += (target.y - cur.y) * Math.min(1, dt * 2.5);
    group.rotation.y = -0.2 + Math.sin(t * 0.45) * 0.08 + cur.x * 0.25;
    group.rotation.x = 0.04 + Math.sin(t * 0.33) * 0.025 + cur.y * 0.14;
    group.position.y = Math.sin(t * 0.8) * 0.02;
    r.render(scene, cam);
    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } });
  io.observe(host);
  host.classList.add("is3d");
  return { stop() { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); removeEventListener("pointermove", onMove); } };
}
