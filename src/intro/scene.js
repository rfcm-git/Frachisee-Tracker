// Three.js side of the intro: loads the models and font, builds the street
// scene, and plays the camera move. Loaded on demand by overlay.js, so the 3D
// engine is never part of the app's main bundle.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";

export const ASSET_FILES = {
  store: "models/store.glb",
  street: "models/street.glb",
  person: "models/person.glb",
  car: "models/car.glb",
  font: "fonts/montserrat-black.typeface.json",
};

export function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

/** Rough device tier: fewer people, no shadows and a lower pixel ratio on "low". */
export function detectQuality() {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 8;
  return coarse || cores <= 4 || memory <= 4 ? "low" : "high";
}

/**
 * Loads every asset through one THREE.LoadingManager.
 * `report(key, fraction)` is called as each file progresses (0..1).
 */
export function loadAssets(base, report = () => {}) {
  const manager = new THREE.LoadingManager();
  const gltf = new GLTFLoader(manager);
  const fonts = new FontLoader(manager);
  const one = (key, loader) =>
    new Promise((resolve, reject) => {
      loader.load(
        base + ASSET_FILES[key],
        (result) => {
          report(key, 1);
          resolve(result);
        },
        (e) => {
          if (e?.lengthComputable && e.total) report(key, Math.min(0.99, e.loaded / e.total));
        },
        (err) => reject(new Error(`Couldn't load ${ASSET_FILES[key]}: ${err?.message ?? err}`)),
      );
    });
  return Promise.all([one("store", gltf), one("street", gltf), one("person", gltf), one("car", gltf), one("font", fonts)]).then(
    ([store, street, person, car, font]) => ({ store, street, person, car, font }),
  );
}

/* ----------------------------------------------------------------- helpers */

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => {
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One mesh per letter so letters can animate in one after another. Centred on
 * the group origin. `material` may be a function (letterIndex) => material.
 */
function letterGroup(font, text, { size, depth, material, maxWidth }) {
  const materialFor = typeof material === "function" ? material : () => material;
  let index = 0;
  const group = new THREE.Group();
  const scale = size / font.data.resolution;
  const cache = new Map();
  const letters = [];
  const kern = font.data.kern ?? {};
  let x = 0;
  let prev = "";
  for (const ch of text) {
    const glyph = font.data.glyphs[ch] ?? font.data.glyphs["?"];
    x += (kern[prev + ch] ?? 0) * scale;
    prev = ch;
    if (ch.trim()) {
      let geo = cache.get(ch);
      if (!geo) {
        geo = new TextGeometry(ch, {
          font,
          size,
          depth,
          curveSegments: 4,
          bevelEnabled: true,
          bevelThickness: depth * 0.2,
          bevelSize: size * 0.01,
          bevelSegments: 1,
        });
        geo.computeBoundingBox();
        // Read the centre before translate(), which recomputes the bounding box.
        const cx = (geo.boundingBox.min.x + geo.boundingBox.max.x) / 2;
        geo.translate(-cx, 0, -depth / 2);
        geo.userData.cx = cx;
        cache.set(ch, geo);
      }
      const mesh = new THREE.Mesh(geo, materialFor(index));
      mesh.position.x = x + geo.userData.cx;
      mesh.castShadow = true;
      group.add(mesh);
      letters.push(mesh);
    }
    index++;
    x += (glyph?.ha ?? font.data.resolution * 0.3) * scale;
  }
  const capHeight = size * 0.7;
  for (const m of letters) {
    m.position.x -= x / 2;
    m.position.y = -capHeight / 2;
    m.userData.baseY = m.position.y;
  }
  if (maxWidth && x > maxWidth) group.scale.setScalar(maxWidth / x);
  return { group, letters, width: x };
}

/* --------------------------------------------------------------- the scene */

// Camera keyframes (equally spaced in time; eased as one move).
const CAMERA_PATH = [
  { pos: [46, 19, 11], look: [8, 1, 4] }, // high above the road, looking down the street
  { pos: [25, 6.5, 13.5], look: [2, 2.4, 2] }, // descending over the road
  { pos: [10, 1.9, 9.2], look: [-3, 1.7, 2.5] }, // street level beside the walkers
  { pos: [-7, 4.0, 14], look: [0, 5.0, 0] }, // swing across to face the store
  { pos: [0, 5.4, 18.6], look: [0, 6.0, -0.5] }, // final front-on shot, from the far sidewalk
];
export const MOVE_SECONDS = 8;
// Cars are timed so none passes in front of the camera during the final shot.
const CAR_LANES = [
  { z: 12.7, dir: 1, speed: 9.5, xAtEnd: -20 },
  { z: 7.7, dir: -1, speed: 8.5, xAtEnd: -45 },
  { z: 12.7, dir: 1, speed: 10.5, xAtEnd: 32 },
  { z: 7.7, dir: -1, speed: 9, xAtEnd: 58 },
];
const END_SECONDS = 8.6;
const REVEAL = { lamps: 4.5, heading: 4.8, letterStagger: 0.055, letterDur: 0.5, subheading: 5.8 };

const SHIRTS = ["#3d6fb6", "#d2553d", "#f0c04a", "#5a9e6f", "#8a5bb8", "#e7e2d6", "#2f3d4f", "#d97aa0", "#4fa3a5", "#b8472f"];
const PANTS = ["#30343b", "#3b4a66", "#5a4a3a", "#26292e", "#6b6f75", "#7b6a52"];
const SKIN = ["#f1c9a5", "#d9a77d", "#b9825a", "#8d5a3b", "#5f3d29", "#e8b896"];
const HAIR = ["#2b211c", "#4a3424", "#1b1a1a", "#8b5a2b", "#c9a56a", "#6c6c6c"];
const CARS = ["#c23b32", "#2f5d9e", "#e8e6df", "#2b2e33", "#7a8a96"];

export class IntroScene {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} assets  result of loadAssets()
   * @param {{quality?: "high"|"low", heading: string, subheading: string, wordmark: string, still?: boolean}} opts
   */
  constructor(canvas, assets, opts) {
    this.opts = opts;
    this.quality = opts.quality ?? "high";
    this.still = !!opts.still;
    this.time = 0;
    this.ended = false;
    this.mixers = [];
    this.walkers = [];
    this.cars = [];
    this.onEnd = null;

    const high = this.quality === "high";
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: high, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1.25));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = high;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog("#cfe2f2", 60, 170);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.3, 400);

    this.#buildSky();
    this.#buildLights(high);
    this.#buildWorld(assets);
    this.#buildGlass(high);
    this.#buildText(assets.font);
    this.#buildPeople(assets.person, high ? 14 : 8);
    this.#buildCars(assets.car);

    const path = (key) => new THREE.CatmullRomCurve3(CAMERA_PATH.map((k) => new THREE.Vector3(...k[key])), false, "centripetal");
    this.posCurve = path("pos");
    this.lookCurve = path("look");
    this.lookAt = new THREE.Vector3();

    this.timer = new THREE.Timer();
  }

  #buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(300, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color("#2f7fd6") }, horizon: { value: new THREE.Color("#cfe4f5") } },
        vertexShader: "varying float vH; void main(){ vH = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader:
          "uniform vec3 top; uniform vec3 horizon; varying float vH;\nvoid main(){ float t = pow(clamp(vH,0.0,1.0),0.55); gl_FragColor = vec4(mix(horizon, top, t),1.0);\n#include <colorspace_fragment>\n}",
      }),
    );
    sky.renderOrder = -1;
    this.scene.add(sky);

    // A few soft low-poly clouds
    const cloudMat = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.55, roughness: 1, flatShading: true, fog: false });
    const puff = new THREE.IcosahedronGeometry(1, 1);
    const rand = mulberry32(3);
    for (const [x, y, z, s] of [[-60, 46, -120, 9], [10, 58, -160, 12], [70, 42, -110, 8], [-120, 52, -60, 10], [120, 50, -40, 9], [-30, 62, -200, 14]]) {
      const cloud = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const m = new THREE.Mesh(puff, cloudMat);
        const r = s * (0.55 + rand() * 0.5);
        m.scale.set(r * 1.3, r * 0.8, r);
        m.position.set((i - 2) * s * 0.75, (rand() - 0.3) * s * 0.4, (rand() - 0.5) * s * 0.4);
        cloud.add(m);
      }
      cloud.position.set(x, y, z);
      this.scene.add(cloud);
    }
  }

  #buildLights(high) {
    this.scene.add(new THREE.HemisphereLight("#d6eaff", "#8f8a70", 1.6));
    const sun = new THREE.DirectionalLight("#fff4e2", 3.0);
    sun.position.set(-24, 40, 30);
    sun.target.position.set(0, 0, 4);
    if (high) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 30, bottom: -30, near: 5, far: 110 });
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.03;
    }
    this.scene.add(sun, sun.target);
  }

  #buildWorld({ store, street }) {
    const flat = /Asphalt|Concrete|Curb|Grass|ParkingLot|Paint/;
    for (const root of [street.scene, store.scene]) {
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.receiveShadow = true;
        o.castShadow = !flat.test(o.name);
        o.matrixAutoUpdate = false;
        o.updateMatrix();
      });
      this.scene.add(root);
    }
    this.store = store.scene;
    // Sign lamps and shop glass start dim and light up during the reveal.
    store.scene.traverse((o) => {
      if (o.isMesh && o.material.name === "SignLamp") this.lampMaterial = o.material;
    });
    if (this.lampMaterial) this.lampMaterial.emissiveIntensity = 0;
    const lightAnchor = store.scene.getObjectByName("Anchor_SignLight");
    this.signLight = new THREE.PointLight("#fff1cf", 0, 14, 1.6);
    if (lightAnchor) this.signLight.position.copy(lightAnchor.position);
    store.scene.add(this.signLight);
    // Warm light inside the shop; it also spills onto the sidewalk through the glass.
    const inside = new THREE.PointLight("#ffd9a8", 7, 13, 1.4);
    inside.position.copy(store.scene.getObjectByName("Anchor_InteriorLight")?.position ?? new THREE.Vector3(0, 2.6, -4.2));
    store.scene.add(inside);
  }

  /**
   * Shop windows: clear glass that shows the interior, tinted slightly green
   * at grazing angles, with reflections of the street (an environment map
   * captured from the middle of the road). Low-end devices get a cheaper
   * transparent glass with the same reflections.
   */
  #buildGlass(high) {
    let envMap = null;
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      envMap = pmrem.fromScene(this.scene, 0.02, 0.5, 200, { size: 128, position: new THREE.Vector3(0, 1.8, 10) }).texture;
      pmrem.dispose();
      this.envMap = envMap;
    } catch {
      /* no reflections; the glass still works */
    }
    const glass = high
      ? new THREE.MeshPhysicalMaterial({
          name: "ShopGlass",
          color: "#f2fbf8",
          metalness: 0,
          roughness: 0.03,
          transmission: 1,
          thickness: 0.04,
          ior: 1.52,
          specularIntensity: 1,
          envMap,
          envMapIntensity: 1.25,
        })
      : new THREE.MeshStandardMaterial({
          name: "ShopGlass",
          color: "#b9d6db",
          metalness: 0.2,
          roughness: 0.04,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          envMap,
          envMapIntensity: 1.4,
        });
    const upper = new THREE.MeshPhysicalMaterial({
      name: "UpperGlass",
      color: "#1f3a4d",
      metalness: 0.15,
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMap,
      envMapIntensity: 1.8,
    });
    this.store.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material.name === "ShopGlass") {
        o.material.dispose();
        o.material = glass;
        o.castShadow = false;
        o.renderOrder = 2;
      } else if (o.material.name === "UpperGlass") {
        o.material.dispose();
        o.material = upper;
      }
    });
  }

  #buildText(font) {
    const { heading, subheading, wordmark } = this.opts;
    const anchor = (name) => this.store.getObjectByName(name);
    const white = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.12, roughness: 0.45 });
    const yellow = new THREE.MeshStandardMaterial({ color: "#ffc20e", emissive: "#ffb000", emissiveIntensity: 0.12, roughness: 0.45 });
    this.headingMaterial = white;

    const wordWhite = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.08, roughness: 0.45 });
    const split = this.opts.wordmarkSplit ?? wordmark.length;
    const word = letterGroup(font, wordmark, { size: 0.95, depth: 0.14, material: (i) => (i < split ? yellow : wordWhite), maxWidth: 7.6 });
    word.group.position.copy(anchor("Anchor_Wordmark").position);
    this.store.add(word.group);

    this.heading = letterGroup(font, heading, { size: 1.05, depth: 0.2, material: white, maxWidth: 10.6 });
    this.heading.group.position.copy(anchor("Anchor_Heading").position);
    this.heading.group.position.z += 0.12;
    this.store.add(this.heading.group);

    this.sub = letterGroup(font, subheading, { size: 0.6, depth: 0.14, material: yellow, maxWidth: 8 });
    this.sub.group.position.copy(anchor("Anchor_Subheading").position);
    this.sub.group.position.z += 0.1;
    this.store.add(this.sub.group);
  }

  #buildPeople(person, count) {
    const rand = mulberry32(7);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const walk = THREE.AnimationClip.findByName(person.animations, "Walk");
    const idle = THREE.AnimationClip.findByName(person.animations, "Idle");

    const spawn = (override = {}) => {
      const p = person.scene.clone(true);
      const colors = { Shirt: pick(SHIRTS), Pants: pick(PANTS), Skin: pick(SKIN), Hair: pick(HAIR), ...override };
      const made = {};
      p.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        const name = o.material.name;
        if (colors[name]) {
          made[name] ??= o.material.clone();
          made[name].color.set(colors[name]);
          o.material = made[name];
        }
      });
      if (rand() < 0.35) p.scale.setScalar(0.94 + rand() * 0.1);
      this.scene.add(p);
      const mixer = new THREE.AnimationMixer(p);
      this.mixers.push(mixer);
      return { p, mixer };
    };

    // Inside, seen through the glass: a sandwich artist behind the counter (in
    // Subway green) and two customers ordering.
    for (const [x, z, ry, shirt] of [[-0.9, -6.95, 0, "#1e7a3c"], [0.5, -4.85, Math.PI, null], [1.6, -4.6, Math.PI + 0.35, null]]) {
      const { p, mixer } = spawn(shirt ? { Shirt: shirt, Pants: "#26292e" } : {});
      p.position.set(x, 0.15, z);
      p.rotation.y = ry;
      const a = mixer.clipAction(idle);
      a.time = rand() * idle.duration;
      a.play();
    }

    // People standing by the store: two chatting by the door, one reading the A-frame.
    for (const [x, z, ry] of [[2.1, 1.35, -2.2], [2.75, 1.85, 1.0], [-2.9, 1.9, -0.5]]) {
      const { p, mixer } = spawn();
      p.position.set(x, 0.15, z);
      p.rotation.y = ry;
      const a = mixer.clipAction(idle);
      a.time = rand() * idle.duration;
      a.play();
    }

    // Walkers on both sidewalks, going both ways.
    const lanes = [
      { z: 3.2, dir: 1 },
      { z: 3.85, dir: -1 },
      { z: 17.3, dir: -1 },
      { z: 18.1, dir: 1 },
    ];
    for (let i = 0; i < count; i++) {
      const lane = lanes[i % lanes.length];
      const { p, mixer } = spawn();
      const speed = 1.15 + rand() * 0.45;
      p.position.set(-45 + rand() * 90, 0.15, lane.z + (rand() - 0.5) * 0.25);
      p.rotation.y = lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      const a = mixer.clipAction(walk);
      a.time = rand();
      a.timeScale = speed / 1.4;
      a.play();
      this.walkers.push({ p, speed: speed * lane.dir });
    }
  }

  #buildCars(car) {
    for (const [i, s] of CAR_LANES.entries()) {
      const c = car.scene.clone(true);
      const paint = new THREE.MeshStandardMaterial();
      c.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        if (o.material.name === "CarPaint") {
          paint.copy(o.material);
          paint.color.set(CARS[i % CARS.length]);
          o.material = paint;
        }
      });
      const wrap = (x) => ((((x + 72) % 144) + 144) % 144) - 72;
      c.position.set(wrap(this.still ? s.xAtEnd : s.xAtEnd - s.speed * s.dir * END_SECONDS), 0, s.z);
      c.rotation.y = s.dir > 0 ? 0 : Math.PI;
      const wheels = [];
      c.traverse((o) => o.name.startsWith("Wheel_") && wheels.push(o));
      this.scene.add(c);
      this.cars.push({ c, speed: s.speed * s.dir, wheels });
    }
  }

  resize(width, height) {
    if (!width || !height) return;
    const aspect = width / height;
    // Keep the 13.5 m wide store front in frame on narrow (portrait) screens.
    const halfFit = 7.4 / 18.6;
    const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(halfFit / aspect));
    this.camera.fov = THREE.MathUtils.clamp(vfov, 42, 78);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.still || this.ended) this.renderFrame(0);
  }

  #applyTimeline(t) {
    // Camera
    const u = easeInOutCubic(clamp01(t / MOVE_SECONDS));
    this.posCurve.getPoint(u, this.camera.position);
    this.lookCurve.getPoint(u, this.lookAt);
    // If the site is still loading after the move, keep the shot alive with a slow sway.
    if (Number.isFinite(t) && t > MOVE_SECONDS) {
      const d = t - MOVE_SECONDS;
      const k = easeInOutCubic(clamp01(d / 2.5));
      this.camera.position.x += Math.sin(d * 0.35) * 2.2 * k;
      this.camera.position.y += Math.sin(d * 0.23) * 0.35 * k;
    }
    this.camera.lookAt(this.lookAt);

    // Sign lamps flicker on, then the letters pop up one by one.
    const lt = t - REVEAL.lamps;
    let lamp = lt < 0 ? 0 : lt < 0.12 ? 1 : lt < 0.22 ? 0.15 : lt < 0.3 ? 1 : lt < 0.36 ? 0.4 : Math.min(1, 0.6 + lt);
    if (this.lampMaterial) this.lampMaterial.emissiveIntensity = 1.4 * lamp;
    this.signLight.intensity = 9 * lamp;
    this.headingMaterial.emissiveIntensity = 0.12 + 0.35 * lamp;

    const pop = (letters, start, stagger) =>
      letters.forEach((m, i) => {
        const k = clamp01((t - start - i * stagger) / REVEAL.letterDur);
        const s = k === 0 ? 0.0001 : easeOutBack(k);
        m.scale.set(1, s, 1);
        m.position.y = m.userData.baseY - (1 - easeOutCubic(k)) * 0.5;
        m.visible = k > 0;
      });
    pop(this.heading.letters, REVEAL.heading, REVEAL.letterStagger);
    pop(this.sub.letters, REVEAL.subheading, REVEAL.letterStagger * 1.5);
  }

  /** Advance the world by dt seconds and draw. */
  renderFrame(dt) {
    if (!this.still) {
      for (const m of this.mixers) m.update(dt);
      for (const w of this.walkers) {
        w.p.position.x += w.speed * dt;
        if (w.p.position.x > 50) w.p.position.x -= 100;
        if (w.p.position.x < -50) w.p.position.x += 100;
      }
      for (const c of this.cars) {
        c.c.position.x += c.speed * dt;
        if (c.c.position.x > 72) c.c.position.x -= 144;
        if (c.c.position.x < -72) c.c.position.x += 144;
        const spin = (Math.abs(c.speed) / 0.34) * dt;
        for (const w of c.wheels) w.rotation.z -= spin;
      }
    }
    this.#applyTimeline(this.still ? Infinity : this.time);
    this.renderer.render(this.scene, this.camera);
  }

  /** Plays the camera move; calls onEnd once the final shot has been held for holdMs. */
  start({ holdMs = 1800, onEnd } = {}) {
    this.onEnd = onEnd;
    if (this.still) {
      for (const m of this.mixers) m.update(0.01); // pose people mid-stride
      this.renderFrame(0);
      return;
    }
    const endAt = MOVE_SECONDS + holdMs / 1000;
    this.timer.connect(document); // pauses while the tab is hidden
    this.renderer.setAnimationLoop((now) => {
      this.timer.update(now);
      // Capped step so a slow frame doesn't make the camera jump.
      const dt = Math.min(this.timer.getDelta(), 0.1);
      this.time += dt;
      this.renderFrame(dt);
      if (!this.ended && this.time >= endAt) {
        this.ended = true;
        this.onEnd?.();
      }
    });
  }

  /** Stops rendering and frees GPU memory. */
  dispose() {
    this.renderer.setAnimationLoop(null);
    this.timer.dispose();
    const seen = new Set();
    this.scene.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) {
        seen.add(o.geometry);
        o.geometry.dispose();
      }
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) if (!seen.has(m)) (seen.add(m), m.dispose());
    });
    this.envMap?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
