/* ============================================================
   Three.js skeleton viewer — shows a rigged .glb's mesh + bones
   in-browser (no Blender). Exposes window.mountSkel(el, url, opts).
   opts: { skeleton:true, autorotate:false, onload:fn({bones}) }
   ============================================================ */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const ACCENT = 0x7cc4ff, BONE = 0xa9b8ff;

function mountSkel(container, url, opts) {
  opts = opts || {};
  container.innerHTML = "";
  container.classList.add("skel-host");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x202838, 1.4));
  const dl = new THREE.DirectionalLight(0xffffff, 1.5); dl.position.set(3, 8, 5); scene.add(dl);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.autoRotate = !!opts.autorotate; controls.autoRotateSpeed = 1.4;

  function resize() {
    const w = container.clientWidth || 400, h = container.clientHeight || 400;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize); ro.observe(container);

  let meshes = [], skelGroup = null, showSkel = opts.skeleton !== false;

  const btn = document.createElement("button");
  btn.className = "skel-toggle";
  btn.addEventListener("click", function (e) { e.stopPropagation(); showSkel = !showSkel; applyMode(); });
  container.appendChild(btn);

  function applyMode() {
    if (skelGroup) skelGroup.visible = showSkel;
    meshes.forEach(function (m) {
      var mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach(function (mat) {
        if (!mat) return;
        mat.transparent = true; mat.opacity = showSkel ? 0.30 : 1.0;
        mat.depthWrite = !showSkel; mat.needsUpdate = true;
      });
    });
    btn.textContent = showSkel ? "◍ rig shown — hide" : "◍ show rig";
  }

  new GLTFLoader().load(url, function (g) {
    const root = g.scene; scene.add(root);
    const box = new THREE.Box3().setFromObject(root);
    const sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const maxd = Math.max(sz.x, sz.y, sz.z) || 1;
    root.position.sub(c);
    root.updateMatrixWorld(true);
    camera.position.set(0, maxd * 0.12, maxd * 1.95);
    controls.target.set(0, 0, 0); controls.update();

    const bones = [];
    root.traverse(function (o) { if (o.isMesh) meshes.push(o); if (o.isBone) bones.push(o); });

    skelGroup = new THREE.Group();
    const r = maxd * 0.014;
    const sphGeo = new THREE.SphereGeometry(r, 16, 12);
    const sphMat = new THREE.MeshBasicMaterial({ color: ACCENT, depthTest: false, transparent: true, opacity: 0.95 });
    const lineMat = new THREE.LineBasicMaterial({ color: BONE, depthTest: false, transparent: true, opacity: 0.85 });
    const a = new THREE.Vector3(), b = new THREE.Vector3(), pts = [];
    bones.forEach(function (bone) {
      bone.getWorldPosition(a);
      const s = new THREE.Mesh(sphGeo, sphMat); s.position.copy(a); s.renderOrder = 11; skelGroup.add(s);
      if (bone.parent && bone.parent.isBone) { bone.parent.getWorldPosition(b); pts.push(b.clone(), a.clone()); }
    });
    if (pts.length) {
      const lg = new THREE.BufferGeometry().setFromPoints(pts);
      const ls = new THREE.LineSegments(lg, lineMat); ls.renderOrder = 10; skelGroup.add(ls);
    }
    scene.add(skelGroup);

    applyMode();
    if (opts.onload) opts.onload({ bones: bones.length });
  }, undefined, function (err) {
    container.innerHTML = '<div class="skel-err">couldn\'t load model</div>';
    console.error("skel load error:", err);
  });

  (function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();
  applyMode();
}

window.mountSkel = mountSkel;
