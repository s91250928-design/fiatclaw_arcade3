/* 3D-модели для схемы «Почему безопасно»: кошелёк, ключ, биржа (столбики) и щит —
   хром с переливом, как знак Totum. Один холст поверх схемы, координаты = координаты SVG.
   Активный шаг крутится быстрее; на шаге «вывод» щит краснеет. */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const chrome = (c = 0x9cc4ff) => new THREE.MeshPhysicalMaterial({ color: c, metalness: 1, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06, iridescence: 1, iridescenceIOR: 1.55, iridescenceThicknessRange: [180, 650], envMapIntensity: 1.5 });
function wallet() {
  const g = new THREE.Group(), m = chrome();
  const body = new THREE.Mesh(new RoundedBoxGeometry(66, 46, 16, 6, 7), m);
  const flap = new THREE.Mesh(new RoundedBoxGeometry(30, 22, 20, 5, 6), chrome(0xb9d6ff));
  flap.position.set(22, 0, 1);
  const dot = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 4, 24), chrome(0x7dd3fc));
  dot.rotation.x = Math.PI / 2; dot.position.set(26, 0, 12);
  const card = new THREE.Mesh(new RoundedBoxGeometry(44, 10, 4, 3, 2), chrome(0xa78bfa));
  card.position.set(-6, 26, -3);
  g.add(body, flap, dot, card);
  return g;
}
function key() {
  const g = new THREE.Group(), m = chrome();
  const head = new THREE.Mesh(new THREE.TorusGeometry(15, 6, 24, 48), m);
  head.position.x = -22;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 48, 24), m);
  shaft.rotation.z = Math.PI / 2; shaft.position.x = 12;
  const t1 = new THREE.Mesh(new RoundedBoxGeometry(6, 14, 9, 3, 2), chrome(0xb9d6ff)); t1.position.set(26, -7, 0);
  const t2 = new THREE.Mesh(new RoundedBoxGeometry(6, 10, 9, 3, 2), chrome(0xb9d6ff)); t2.position.set(15, -5, 0);
  g.add(head, shaft, t1, t2);
  g.rotation.z = 0.5;
  return g;
}
function bars() {
  const g = new THREE.Group();
  [[-17, 28, 0x7dd3fc], [0, 46, 0x9cc4ff], [17, 36, 0xa78bfa]].forEach(([x, h, c]) => {
    const b = new THREE.Mesh(new RoundedBoxGeometry(13, h, 13, 4, 4), chrome(c));
    b.position.set(x, h / 2 - 22, 0); g.add(b);
  });
  const base = new THREE.Mesh(new RoundedBoxGeometry(56, 5, 18, 3, 2.4), chrome(0x6f84ab)); base.position.y = -24; g.add(base);
  return g;
}
function shield() {
  const s = new THREE.Shape();
  s.moveTo(0, 24); s.lineTo(19, 16); s.lineTo(19, 2); s.bezierCurveTo(19, -12, 9, -21, 0, -26); s.bezierCurveTo(-9, -21, -19, -12, -19, 2); s.lineTo(-19, 16); s.lineTo(0, 24);
  const g = new THREE.Group(), m = chrome(0xffb4c2);
  const sh = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 6, bevelEnabled: true, bevelThickness: 3, bevelSize: 2.4, bevelSegments: 6, curveSegments: 24 }), m);
  sh.position.z = -3;
  const ck = new THREE.Shape(); ck.moveTo(-9, 1); ck.lineTo(-3, -6); ck.lineTo(10, 8); ck.lineTo(7, 11); ck.lineTo(-3, 0); ck.lineTo(-6, 4);
  const c = new THREE.Mesh(new THREE.ExtrudeGeometry(ck, { depth: 3, bevelEnabled: true, bevelThickness: 1, bevelSize: 0.8, bevelSegments: 3 }), chrome(0xfff1f2));
  c.position.z = 7;
  g.add(sh, c); g.userData.mat = m;
  return g;
}
export function mountKeys(host, viz) {
  let r;
  try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); } catch { return null; }
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
  r.domElement.className = "kf3-canvas"; host.appendChild(r.domElement);
  const scene = new THREE.Scene(), pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  /* камера совпадает с системой координат SVG (viewBox 720×440) */
  const cam = new THREE.OrthographicCamera(0, 720, 0, -440, -500, 500); cam.position.z = 200;
  const l1 = new THREE.PointLight(0x38bdf8, 2.2e4, 900); l1.position.set(140, -60, 200);
  const l2 = new THREE.PointLight(0x8b5cf6, 1.8e4, 900); l2.position.set(600, -380, 200);
  scene.add(l1, l2, new THREE.DirectionalLight(0xffffff, 1.6));
  const items = [[wallet(), 110, 150, 0.82], [key(), 360, 150, 0.78], [bars(), 610, 150, 0.86], [shield(), 360, 316, 0.62]].map(([o, x, y, s]) => {
    o.position.set(x, -y, 0); o.scale.setScalar(s); scene.add(o); return { o, s, ph: Math.random() * 6 };
  });
  const active = { 0: [0, 1], 1: [1, 2], 2: [0, 3] };
  const size = () => { const w = host.clientWidth || 1, h = host.clientHeight || 1; r.setSize(w, h, false); };
  size(); const ro = new ResizeObserver(size); ro.observe(host);
  let vis = false, raf = 0, last = performance.now(), t = 0;
  const red = new THREE.Color(0xff5c7a), pink = new THREE.Color(0xffb4c2);
  function frame(now) {
    raf = 0; const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const st = Number(viz.dataset.st || 0), on = active[st] || [];
    items.forEach((it, k) => {
      const a = on.includes(k);
      it.spin = (it.spin || 0) + dt * (a ? 1.4 : 0.35);
      it.o.rotation.y = Math.sin(it.spin) * (a ? 0.9 : 0.45);
      it.o.rotation.x = 0.25 + Math.sin(t * 0.7 + it.ph) * 0.08;
      it.o.position.z = 0;
      const sc = it.s * (a ? 1.08 : 0.96);
      it.o.scale.lerp(new THREE.Vector3(sc, sc, sc), Math.min(1, dt * 6));
      it.o.position.y = -[150, 150, 150, 316][k] + Math.sin(t * 1.1 + it.ph) * 3;
    });
    const sm = items[3].o.userData.mat;
    sm.color.lerp(st === 2 ? red : pink, Math.min(1, dt * 4));
    r.render(scene, cam);
    if (vis && !document.hidden) raf = requestAnimationFrame(frame);
  }
  new IntersectionObserver(([e]) => { vis = e.isIntersecting; if (vis && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }).observe(host);
  host.classList.add("is3d");
  return { stop() { cancelAnimationFrame(raf); ro.disconnect(); } };
}
