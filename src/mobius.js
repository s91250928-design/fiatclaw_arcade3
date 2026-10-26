/* Живой хромовый знак Totum (лента Мёбиуса) для лендинга на компьютере.
   Грузится отдельным файлом только на лендинге. Медленно вращается и
   наклоняется вслед за курсором. Рисует, только пока виден на экране. */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export function mountMobius(host) {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let r;
  try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); }
  catch { return null; }                                          // нет WebGL — остаётся картинка
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.domElement.className = "mob-canvas";
  host.appendChild(r.domElement);

  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100); cam.position.set(0, 0, 9);
  const l1 = new THREE.PointLight(0x38bdf8, 60, 30); l1.position.set(-4, 3, 4);
  const l2 = new THREE.PointLight(0x8b5cf6, 50, 30); l2.position.set(4, -3, 3);
  const l3 = new THREE.DirectionalLight(0xffffff, 1.2); l3.position.set(2, 5, 6);
  scene.add(l1, l2, l3);
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0x9cc4ff, metalness: 1, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05,
    iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 700], envMapIntensity: 1.4 });

  // лента Мёбиуса с плоским овальным сечением — та же форма, что в логотипе
  const R = 1.62, a = 0.58, b = 0.13, NU = 300, NV = 40, pos = [], idx = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU * Math.PI * 2, ang = u / 2, cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= NV; j++) {
      const t = j / NV * Math.PI * 2, ex = Math.cos(t) * a, ey = Math.sin(t) * b;
      const dx = ex * Math.cos(ang) - ey * Math.sin(ang), dy = ex * Math.sin(ang) + ey * Math.cos(ang);
      pos.push((R + dx) * cu, (R + dx) * su, dy);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const A = i * (NV + 1) + j, B = A + NV + 1; idx.push(A, B, A + 1, B, B + 1, A + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const tilt = new THREE.Group(), spin = new THREE.Mesh(g, chrome);
  tilt.add(spin); scene.add(tilt);
  tilt.rotation.set(-0.72, 0.32, 0);

  const size = () => { const w = host.clientWidth || 1, h = host.clientHeight || 1; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  size();
  const ro = new ResizeObserver(size); ro.observe(host);

  // наклон за курсором (плавно догоняет)
  const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  const onMove = (e) => { target.x = (e.clientX / innerWidth - 0.5) * 2; target.y = (e.clientY / innerHeight - 0.5) * 2; };
  addEventListener("pointermove", onMove, { passive: true });

  let visible = true, raf = 0, last = performance.now();
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible && !raf && !still) raf = requestAnimationFrame(frame); });
  io.observe(host);

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    cur.x += (target.x - cur.x) * Math.min(1, dt * 3); cur.y += (target.y - cur.y) * Math.min(1, dt * 3);
    spin.rotation.z += dt * 0.35;
    tilt.rotation.x = -0.72 + cur.y * 0.28;
    tilt.rotation.y = 0.32 + cur.x * 0.42;
    r.render(scene, cam);
    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && visible && !raf && !still) { last = performance.now(); raf = requestAnimationFrame(frame); } });
  if (still) { spin.rotation.z = 0.25; r.render(scene, cam); } else raf = requestAnimationFrame(frame);
  host.classList.add("live");
  return { stop() { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); removeEventListener("pointermove", onMove); } };
}
