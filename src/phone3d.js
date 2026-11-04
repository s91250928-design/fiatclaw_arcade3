/* 3D-телефон для лендинга («Как начать»): титановый корпус, стекло, островок, боковые кнопки.
   На экране как текстура идёт запись нашего настоящего сайта. Покачивается и наклоняется
   за курсором; рисует, только пока виден на экране. */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/* скруглённый прямоугольник с честными дугами (а не «квадратичными» углами — те и давали кривые углы) */
function rrShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return s;
}
function roundRect(w, h, r) {
  const g = new THREE.ShapeGeometry(rrShape(w, h, r), 32), p = g.attributes.position, uv = [];
  for (let i = 0; i < p.count; i++) uv.push((p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h);
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
/* строка состояния iOS (iPhone 16 Pro: 402 × 54 pt, рисуем ×3): время, связь, Wi-Fi, батарея */
function statusTex() {
  const W = 1206, H = 162, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  x.fillStyle = "#0f1623"; x.fillRect(0, 0, W, H);
  x.fillStyle = "#fff"; x.textBaseline = "middle";
  x.font = "600 52px -apple-system, 'SF Pro Text', 'Helvetica Neue', Manrope, sans-serif";
  x.textAlign = "center"; x.fillText("9:41", 186, 94);
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.roundRect(X, Y, w, h, r); x.fill(); };
  [[0, 15], [1, 22], [2, 30], [3, 38]].forEach(([k, h]) => rr(860 + k * 17, 112 - h, 12, h, 3));
  x.save(); x.translate(970, 113); x.strokeStyle = "#fff"; x.lineCap = "round";
  [[32, 8], [21, 8]].forEach(([r, w]) => { x.lineWidth = w; x.beginPath(); x.arc(0, 0, r + 8, -Math.PI * 0.76, -Math.PI * 0.24); x.stroke(); });
  x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 12, -Math.PI * 0.76, -Math.PI * 0.24); x.closePath(); x.fill();
  x.restore();
  x.strokeStyle = "rgba(255,255,255,.42)"; x.lineWidth = 3.5; x.beginPath(); x.roundRect(1032, 76, 72, 36, 11); x.stroke();
  x.fillStyle = "rgba(255,255,255,.42)"; rr(1108, 87, 6, 14, 3);
  x.fillStyle = "#fff"; rr(1037, 81, 62, 26, 7);
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

  /* iPhone 16 Pro в миллиметрах: корпус 71,5 × 149,6 × 8,25, радиус углов ~11,6; экран 402 × 874 pt
     (66,6 × 144,8 мм, радиус ~9,1), рамка ~2,4 мм со всех сторон. Масштаб: высота корпуса = 1,6 */
  const k = 1.6 / 149.6, W = 71.5 * k, H = 149.6 * k, D = 8.25 * k, R = 11.6 * k;
  const SW = 66.6 * k, SH = 144.8 * k, SR = 9.1 * k, PT = SH / 874; /* PT — один «пункт» iOS */
  const group = new THREE.Group(); scene.add(group);
  /* корпус — титан: контур, выдавленный в толщину, с мягкой фаской по краю */
  const BV = 0.6 * k;
  const bodyGeo = new THREE.ExtrudeGeometry(rrShape(W - 2 * BV, H - 2 * BV, R - BV), { depth: D - 2 * BV, bevelEnabled: true, bevelThickness: BV, bevelSize: BV, bevelSegments: 10, curveSegments: 64 });
  bodyGeo.translate(0, 0, -(D - 2 * BV) / 2);
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshPhysicalMaterial({ color: 0x3a4357, metalness: 1, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 1.35 }));
  group.add(body);
  /* стекло — чёрная рамка: чуть меньше передней грани корпуса, чтобы край не «лез» на фаску */
  const GW = W - 2 * BV - 0.4 * k, GH = H - 2 * BV - 0.4 * k, GR = R - BV - 0.2 * k;
  const glass = new THREE.Mesh(roundRect(GW, GH, GR), new THREE.MeshPhysicalMaterial({ color: 0x05070d, metalness: 0, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 }));
  glass.position.z = D / 2 + 0.0008; group.add(glass);
  /* экран — одна скруглённая поверхность: сверху строка состояния (54 pt), ниже — запись сайта.
     Запись сделана ровно под эту площадь (402 × 820 pt), поэтому ничего не обрезается и не тянется */
  const SB = 54 / 874;
  const vt = new THREE.VideoTexture(video); vt.colorSpace = THREE.NoColorSpace; /* экран берёт пиксели как есть */
  vt.minFilter = THREE.LinearFilter; vt.magFilter = THREE.LinearFilter; vt.generateMipmaps = false; vt.anisotropy = r.capabilities.getMaxAnisotropy();
  const vAsp = (video.videoWidth || 1206) / (video.videoHeight || 2460), aAsp = SW / (SH * (1 - SB));
  /* если вдруг пропорции записи другие — вписываем по ширине (contain), а не обрезаем края */
  const fit = vAsp > aAsp ? new THREE.Vector2(1, aAsp / vAsp) : new THREE.Vector2(vAsp / aAsp, 1);
  const scrMat = new THREE.ShaderMaterial({
    uniforms: { vid: { value: vt }, bar: { value: Object.assign(statusTex(), { colorSpace: THREE.NoColorSpace }) }, sb: { value: SB }, fit: { value: fit }, bg: { value: new THREE.Vector3(0x0f / 255, 0x16 / 255, 0x23 / 255) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform sampler2D vid; uniform sampler2D bar; uniform float sb; uniform vec2 fit; uniform vec3 bg; varying vec2 vUv;
      void main(){
        vec4 c;
        if (vUv.y > 1.0 - sb) c = texture2D(bar, vec2(vUv.x, (vUv.y - (1.0 - sb)) / sb));
        else {
          vec2 q = vec2(vUv.x, vUv.y / (1.0 - sb));
          q = (q - vec2(0.5, 1.0)) / fit + vec2(0.5, 1.0); /* прижато к верху */
          c = (q.x < 0.0 || q.x > 1.0 || q.y < 0.0) ? vec4(bg, 1.0) : texture2D(vid, q);
        }
        gl_FragColor = c; /* цвета записи — как есть, без второго перевода sRGB (иначе картинка бледнеет) */
      }`,
    toneMapped: false,
  });
  const scr = new THREE.Mesh(roundRect(SW, SH, SR), scrMat);
  scr.position.z = D / 2 + 0.0016; group.add(scr);
  /* Dynamic Island: 125 × 37 pt, 11 pt от верха */
  const isl = new THREE.Mesh(roundRect(125 * PT, 37 * PT, 18.5 * PT), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  isl.position.set(0, SH / 2 - (11 + 18.5) * PT, D / 2 + 0.0024); group.add(isl);
  /* полоска «домой»: 134 × 5 pt, 8 pt от низа */
  const home = new THREE.Mesh(roundRect(134 * PT, 5 * PT, 2.5 * PT), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false }));
  home.position.set(0, -SH / 2 + 10.5 * PT, D / 2 + 0.0024); group.add(home);
  /* лёгкий блик на стекле */
  const glare = new THREE.Mesh(roundRect(SW, SH, SR), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.03, depthWrite: false }));
  glare.position.z = D / 2 + 0.0028; group.add(glare);
  /* боковые кнопки */
  const btnMat = body.material;
  [[-1, 0.38, 0.11], [-1, 0.2, 0.17], [-1, -0.0, 0.17], [1, 0.25, 0.26]].forEach(([s, y, h]) => {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.018, h, 0.035, 3, 0.008), btnMat);
    b.position.set(s * (W / 2 + 0.004), y, 0); group.add(b);
  });

  /* холст больше коробки телефона (запас под наклон и тень). Меряем сам холст — иначе картинка
     растягивается CSS-ом и телефон теряет пропорции. Камера ставится так, чтобы корпус занял
     высоту коробки .gs-phone */
  const size = () => {
    const w = r.domElement.clientWidth || host.clientWidth || 1, h = r.domElement.clientHeight || host.clientHeight || 1, hb = host.clientHeight || h;
    r.setSize(w, h, false); cam.aspect = w / h;
    const t = Math.tan((cam.fov * Math.PI) / 360);
    cam.position.z = Math.max((H * h) / (2 * t * hb * 0.97), (W * 1.25) / (2 * t * cam.aspect));
    cam.updateProjectionMatrix();
  };
  size(); const ro = new ResizeObserver(size); ro.observe(host); ro.observe(r.domElement);
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
