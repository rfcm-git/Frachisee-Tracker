// Builds the 3D intro's assets into public/intro/:
//   models/store.glb   Subway storefront with the rooftop "3PD HELPDESK" sign board
//   models/street.glb  road, sidewalks, neighbouring buildings, trees, lights, props
//   models/person.glb  low-poly pedestrian with "Walk" and "Idle" animation clips
//   models/car.glb     low-poly car
//   fonts/montserrat-black.typeface.json  subset of Montserrat Black (SIL OFL)
//
// Everything is generated from code so it can be tweaked and rebuilt:
//   npm run intro:assets
// Static meshes are merged per material, so each model is a handful of draw calls.

import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import opentype from "opentype.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "intro");
mkdirSync(join(OUT, "models"), { recursive: true });
mkdirSync(join(OUT, "fonts"), { recursive: true });

// GLTFExporter reads its output through FileReader, which Node doesn't have.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
    });
  }
};

/* ---------------------------------------------------------------- materials */

const palette = {};
function mat(name, color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ name, color, roughness: 0.85, metalness: 0, ...opts });
  palette[name] = m;
  return m;
}

// Brand colours: Subway green and yellow.
const M = {
  green: mat("SubwayGreen", "#00843d", { roughness: 0.55 }),
  yellow: mat("SubwayYellow", "#ffc20e", { roughness: 0.5 }),
  stucco: mat("Stucco", "#dccfb8"),
  stone: mat("Stone", "#5b5f5a", { roughness: 0.9 }),
  trim: mat("DarkTrim", "#28332c", { roughness: 0.6, metalness: 0.2 }),
  frame: mat("Frame", "#1f2622", { roughness: 0.4, metalness: 0.6 }),
  glass: mat("ShopGlass", "#2d4a4f", { roughness: 0.08, metalness: 0.4, emissive: "#ffcf8a", emissiveIntensity: 0.55 }),
  steel: mat("Steel", "#9aa3a0", { roughness: 0.35, metalness: 0.8 }),
  board: mat("SignBoard", "#0f2a1c", { roughness: 0.5 }),
  signLamp: mat("SignLamp", "#fff6d8", { emissive: "#fff2c4", emissiveIntensity: 1 }),
  asphalt: mat("Asphalt", "#3a3d40", { roughness: 0.95 }),
  paintWhite: mat("PaintWhite", "#e9e9e4", { roughness: 0.8 }),
  paintYellow: mat("PaintYellow", "#f2c230", { roughness: 0.8 }),
  concrete: mat("Concrete", "#b9b6ae", { roughness: 0.95 }),
  curb: mat("Curb", "#d2cfc8", { roughness: 0.9 }),
  grass: mat("Grass", "#7fa65a", { roughness: 1 }),
  lot: mat("ParkingLot", "#55595b", { roughness: 0.95 }),
  brick: mat("Brick", "#a5563f"),
  cream: mat("Cream", "#e8dcc2"),
  slate: mat("Slate", "#6f7f8c"),
  sand: mat("Sand", "#c9a77c"),
  sage: mat("Sage", "#9fb39a"),
  windows: mat("Windows", "#26363d", { roughness: 0.15, metalness: 0.5, emissive: "#9fc3d9", emissiveIntensity: 0.12 }),
  roof: mat("Roof", "#8a8d87", { roughness: 0.95 }),
  bark: mat("Bark", "#6b4a33"),
  leaves: mat("Leaves", "#4f8a3c", { flatShading: true }),
  leaves2: mat("LeavesLight", "#6aa84f", { flatShading: true }),
  lamp: mat("LampGlow", "#fff1c9", { emissive: "#ffe7a8", emissiveIntensity: 1.2 }),
  wood: mat("Wood", "#8a6243"),
  shrub: mat("Shrub", "#3f7a3a", { flatShading: true }),
  red: mat("HydrantRed", "#c8372d", { roughness: 0.5 }),
  awning: mat("Umbrella", "#00843d", { roughness: 0.7, side: THREE.DoubleSide }),
};

/* ------------------------------------------------------------ build helpers */

/** Collects primitives per material, then merges them into one mesh each. */
class Builder {
  constructor() {
    this.parts = new Map();
  }
  add(material, geometry) {
    if (!this.parts.has(material)) this.parts.set(material, []);
    geometry.deleteAttribute("uv");
    this.parts.get(material).push(geometry.index ? geometry.toNonIndexed() : geometry);
    return geometry;
  }
  /** Axis-aligned box from min/max corners. */
  box(material, x0, x1, y0, y1, z0, z1) {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return this.add(material, g);
  }
  cyl(material, rTop, rBottom, h, x, y, z, seg = 10) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
    g.translate(x, y + h / 2, z);
    return this.add(material, g);
  }
  ico(material, r, x, y, z, detail = 0, sy = 1) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    g.scale(1, sy, 1);
    g.translate(x, y, z);
    return this.add(material, g);
  }
  sphere(material, r, x, y, z, w = 10, h = 8) {
    const g = new THREE.SphereGeometry(r, w, h);
    g.translate(x, y, z);
    return this.add(material, g);
  }
  build(name) {
    const group = new THREE.Group();
    group.name = name;
    for (const [material, geoms] of this.parts) {
      // Pieces keep their own normals; mergeVertices only welds identical
      // position+normal pairs, so box edges stay hard.
      const mesh = new THREE.Mesh(mergeVertices(mergeGeometries(geoms, false), 1e-4), material);
      mesh.name = `${name}_${material.name}`;
      group.add(mesh);
    }
    return group;
  }
}

function anchor(parent, name, x, y, z) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

/* ------------------------------------------------------------------- layout */
// Metres. The store front faces +Z and sits on the sidewalk at z = 0.
// Sidewalk z 0..5, curb 5..5.2, road 5.2..15.2 (centre line z 10.2),
// far sidewalk 15.2..19, far buildings from z 19.5.
const SIDEWALK_Y = 0.15;

/* -------------------------------------------------------------------- store */

function buildStore() {
  const b = new Builder();
  const y0 = SIDEWALK_Y;

  // Shell
  b.box(M.stucco, -6, 6, y0, 4.6, -9, -0.02);
  b.box(M.roof, -6, 6, 4.5, 4.62, -9, -0.02); // roof
  b.box(M.trim, -6.3, 6.3, 4.5, 4.78, -0.3, 0.42); // cornice
  b.box(M.stone, -6, 6, y0, 0.6, -0.02, 0.1); // kick plate

  // Storefront glazing with mullions; door in the middle (x -0.9..0.9)
  b.box(M.glass, -5.6, 5.6, 0.6, 3.0, -0.06, 0.02);
  for (const x of [-5.6, -4.0, -2.45, -0.9, 0.9, 2.45, 4.0, 5.6]) b.box(M.frame, x - 0.06, x + 0.06, 0.6, 3.0, -0.02, 0.08);
  for (const y of [0.6, 2.4, 3.0]) b.box(M.frame, -5.66, 5.66, y - 0.05, y + 0.05, -0.02, 0.08);
  b.box(M.frame, -0.9, 0.9, y0, 0.6, -0.04, 0.06); // door threshold
  b.box(M.glass, -0.84, 0.84, y0 + 0.05, 0.62, -0.05, 0.03);
  b.box(M.frame, -0.04, 0.04, y0, 2.4, -0.02, 0.08); // door split
  for (const x of [-0.22, 0.22]) b.box(M.steel, x - 0.025, x + 0.025, 1.0, 1.7, 0.1, 0.15); // pull handles

  // Brand band: yellow stripe, green fascia
  b.box(M.yellow, -6.2, 6.2, 3.0, 3.16, -0.02, 0.3);
  b.box(M.green, -6.2, 6.2, 3.16, 4.5, -0.02, 0.36);

  // Rooftop sign board (text is added at runtime at the anchors)
  for (const x of [-4.2, 4.2]) {
    b.box(M.steel, x - 0.09, x + 0.09, 4.6, 5.4, -1.2, -1.02);
    b.box(M.steel, x - 0.07, x + 0.07, 4.6, 5.6, -2.6, -2.46); // back brace
    b.box(M.steel, x - 0.06, x + 0.06, 5.3, 5.42, -2.6, -1.0);
  }
  b.box(M.board, -5.7, 5.7, 5.3, 7.85, -1.28, -0.98);
  b.box(M.green, -5.82, 5.82, 5.22, 5.34, -1.32, -0.94); // trim, bottom
  b.box(M.green, -5.82, 5.82, 7.81, 7.93, -1.32, -0.94); // trim, top
  b.box(M.green, -5.82, -5.7, 5.22, 7.93, -1.32, -0.94);
  b.box(M.green, 5.7, 5.82, 5.22, 7.93, -1.32, -0.94);
  // Gooseneck lamps over the board
  for (const x of [-3.6, 0, 3.6]) {
    b.box(M.frame, x - 0.03, x + 0.03, 7.93, 8.25, -1.16, -1.1);
    b.box(M.frame, x - 0.03, x + 0.03, 8.19, 8.25, -1.16, -0.55);
    b.box(M.signLamp, x - 0.16, x + 0.16, 8.1, 8.2, -0.75, -0.45);
  }

  // Rooftop units for a bit of silhouette
  b.box(M.steel, -4.5, -2.7, 4.6, 5.5, -7.5, -5.6);
  b.box(M.steel, 1.8, 3.2, 4.6, 5.3, -7.8, -6.6);

  // Sidewalk seating: two bistro tables with umbrellas, chairs, planters, A-frame sign
  for (const x of [-3.6, 3.6]) {
    b.cyl(M.frame, 0.04, 0.04, 0.72, x, y0, 2.0, 6);
    b.cyl(M.frame, 0.42, 0.42, 0.04, x, y0 + 0.72, 2.0, 16);
    b.cyl(M.steel, 0.025, 0.025, 2.2, x, y0, 2.0, 6);
    const umb = new THREE.ConeGeometry(1.25, 0.45, 8, 1, true);
    umb.translate(x, y0 + 2.2, 2.0);
    b.add(M.awning, umb);
    for (const dx of [-0.75, 0.75]) {
      b.box(M.frame, x + dx - 0.2, x + dx + 0.2, y0 + 0.42, y0 + 0.47, 1.8, 2.2);
      b.box(M.frame, x + dx + (dx > 0 ? 0.16 : -0.2), x + dx + (dx > 0 ? 0.2 : -0.16), y0 + 0.47, y0 + 0.95, 1.8, 2.2);
      for (const [lx, lz] of [[-0.17, 1.83], [0.17, 1.83], [-0.17, 2.17], [0.17, 2.17]]) b.box(M.frame, x + dx + lx - 0.015, x + dx + lx + 0.015, y0, y0 + 0.42, lz - 0.015, lz + 0.015);
    }
  }
  for (const x of [-1.45, 1.45]) {
    b.box(M.trim, x - 0.35, x + 0.35, y0, y0 + 0.55, 0.25, 0.85);
    b.ico(M.shrub, 0.42, x, y0 + 0.8, 0.55, 1, 0.8);
  }
  // A-frame sandwich board
  const aframe = new THREE.BoxGeometry(0.62, 0.95, 0.04);
  for (const s of [-1, 1]) {
    const g = aframe.clone();
    g.rotateX(s * 0.2);
    g.translate(5.35, y0 + 0.47, 1.0 + s * 0.1);
    b.add(M.green, g);
  }

  const store = b.build("Store");
  // Where the runtime puts the 3D text
  anchor(store, "Anchor_Wordmark", 0, 3.83, 0.37);
  anchor(store, "Anchor_Heading", 0, 6.82, -0.97);
  anchor(store, "Anchor_Subheading", 0, 5.78, -0.97);
  anchor(store, "Anchor_SignLight", 0, 8.0, 1.5);
  return store;
}

/* ------------------------------------------------------------------- street */

function building(b, material, x0, x1, h, zFront, zBack, facing = 1) {
  // facing 1 = front at +z (store side), -1 = front at -z (far side)
  const [za, zb] = facing > 0 ? [zBack, zFront] : [zFront, zBack];
  b.box(material, x0, x1, SIDEWALK_Y, h, za, zb);
  const face = zFront + 0.03 * facing;
  const lip = facing > 0 ? [zFront - 0.02, face + 0.02] : [face - 0.02, zFront + 0.02];
  // ground floor shop window, upper window rows, cornice
  b.box(M.windows, x0 + 0.8, x1 - 0.8, 0.6, 2.9, ...lip);
  b.box(M.trim, x0 + 0.6, x1 - 0.6, 2.95, 3.25, ...(facing > 0 ? [zFront - 0.05, zFront + 0.25] : [zFront - 0.25, zFront + 0.05]));
  for (let y = 4; y + 1.4 < h; y += 2.6) {
    for (let x = x0 + 1; x + 1.4 <= x1 - 0.6; x += 2.2) b.box(M.windows, x, x + 1.4, y, y + 1.5, ...lip);
  }
  b.box(M.roof, x0, x1, h - 0.1, h + 0.02, ...(facing > 0 ? [zBack, zFront] : [zFront, zBack]));
  b.box(M.trim, x0 - 0.1, x1 + 0.1, h - 0.1, h + 0.3, ...(facing > 0 ? [zFront - 0.35, zFront + 0.2] : [zFront - 0.2, zFront + 0.35]));
}

function tree(b, x, z, s = 1) {
  b.cyl(M.bark, 0.1 * s, 0.14 * s, 2.4 * s, x, SIDEWALK_Y, z, 6);
  b.ico(M.leaves, 1.25 * s, x, SIDEWALK_Y + 3.0 * s, z, 1, 0.9);
  b.ico(M.leaves2, 0.85 * s, x + 0.45 * s, SIDEWALK_Y + 3.7 * s, z - 0.2 * s, 1, 0.9);
  b.box(M.trim, x - 0.6, x + 0.6, SIDEWALK_Y - 0.01, SIDEWALK_Y + 0.03, z - 0.6, z + 0.6);
}

function streetLight(b, x, z, dir) {
  b.cyl(M.frame, 0.07, 0.1, 5.6, x, SIDEWALK_Y, z, 8);
  b.box(M.frame, x - 0.04, x + 0.04, 5.6, 5.7, ...(dir > 0 ? [z, z + 1.5] : [z - 1.5, z]));
  b.box(M.lamp, x - 0.16, x + 0.16, 5.52, 5.62, ...(dir > 0 ? [z + 1.1, z + 1.55] : [z - 1.55, z - 1.1]));
}

function buildStreet() {
  const b = new Builder();
  const X0 = -70, X1 = 70;

  // Ground: road, sidewalks, curbs, grass and parking behind
  b.box(M.asphalt, X0, X1, -0.05, 0, 5.2, 15.2);
  b.box(M.concrete, X0, X1, 0, SIDEWALK_Y, -0.2, 5.0);
  b.box(M.curb, X0, X1, 0, SIDEWALK_Y + 0.02, 5.0, 5.2);
  b.box(M.concrete, X0, X1, 0, SIDEWALK_Y, 15.4, 19.6);
  b.box(M.curb, X0, X1, 0, SIDEWALK_Y + 0.02, 15.2, 15.4);
  b.box(M.lot, X0, X1, -0.06, 0.01, -40, -0.2);
  b.box(M.grass, X0, X1, -0.08, 0.0, 19.6, 70);
  // Sidewalk expansion joints
  for (let x = X0 + 2; x < X1; x += 2.5) b.box(M.curb, x - 0.02, x + 0.02, SIDEWALK_Y, SIDEWALK_Y + 0.004, -0.2, 5.0);

  // Markings: double yellow centre line, white edge lines, crosswalk
  b.box(M.paintYellow, X0, X1, 0, 0.012, 10.05, 10.15);
  b.box(M.paintYellow, X0, X1, 0, 0.012, 10.25, 10.35);
  b.box(M.paintWhite, X0, X1, 0, 0.012, 5.55, 5.67);
  b.box(M.paintWhite, X0, X1, 0, 0.012, 14.73, 14.85);
  for (let z = 5.8; z < 14.6; z += 0.9) b.box(M.paintWhite, 21, 24.2, 0, 0.014, z, z + 0.5);

  // Neighbouring buildings on the store side (front at z = 0)
  building(b, M.brick, -22, -7, 7.2, 0, -12);
  building(b, M.sand, -36, -22.4, 5.0, -0.4, -12);
  building(b, M.cream, 7, 19, 5.6, 0, -11);
  building(b, M.slate, 19.4, 33, 9.0, -0.3, -12);
  building(b, M.sage, 33.4, 46, 6.2, 0, -12);
  building(b, M.brick, -50, -36.4, 8.4, 0, -12);

  // Far side of the street (front at z = 19.6, facing -z)
  building(b, M.cream, -40, -24, 6.4, 19.8, 32, -1);
  building(b, M.slate, -23.6, -8, 10.2, 19.8, 32, -1);
  building(b, M.sand, -7.6, 6, 5.4, 19.8, 30, -1);
  building(b, M.brick, 6.4, 22, 8.0, 19.8, 32, -1);
  building(b, M.sage, 22.4, 38, 6.0, 19.8, 30, -1);

  // Trees and street lights
  for (const x of [-11.5, 10.5, -28, 27, 41]) tree(b, x, 4.45, x === 10.5 ? 1.05 : 0.95);
  for (const x of [-30, -12.5, 2.5, 16, 33]) tree(b, x, 16.6, 0.9);
  for (const x of [-17, 15.5, 38]) streetLight(b, x, 4.7, 1);
  for (const x of [-36, -5, 26]) streetLight(b, x, 15.9, -1);

  // Bench, bin, hydrant
  b.box(M.wood, -15.2, -13.4, 0.55, 0.62, 2.2, 2.65);
  b.box(M.wood, -15.2, -13.4, 0.66, 1.05, 2.12, 2.18);
  for (const x of [-15, -13.6]) b.box(M.frame, x - 0.04, x + 0.04, SIDEWALK_Y, 0.58, 2.2, 2.65);
  b.cyl(M.frame, 0.28, 0.25, 0.95, 7.4, SIDEWALK_Y, 4.3, 12);
  b.cyl(M.red, 0.13, 0.15, 0.62, -8.6, SIDEWALK_Y, 4.5, 10);
  b.sphere(M.red, 0.13, -8.6, SIDEWALK_Y + 0.62, 4.5);

  return b.build("Street");
}

/* ------------------------------------------------------------------- person */
// One pedestrian, facing +Z, feet at y = 0. Limb pivots are separate nodes so
// the clips can swing them. Shirt / Pants / Skin / Hair / Shoes materials are
// recoloured per instance at runtime.

function buildPerson() {
  const shirt = new THREE.MeshStandardMaterial({ name: "Shirt", color: "#3d6fb6", roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ name: "Pants", color: "#30343b", roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ name: "Skin", color: "#c99a72", roughness: 0.8 });
  const hair = new THREE.MeshStandardMaterial({ name: "Hair", color: "#2b211c", roughness: 0.9 });
  const shoes = new THREE.MeshStandardMaterial({ name: "Shoes", color: "#1b1b1d", roughness: 0.7 });

  const mesh = (geo, material, name, x = 0, y = 0, z = 0) => {
    geo.deleteAttribute("uv");
    const m = new THREE.Mesh(geo, material);
    m.name = name;
    m.position.set(x, y, z);
    return m;
  };
  const pivot = (name, x, y, z) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    return g;
  };

  const root = new THREE.Group();
  root.name = "Person";
  const body = pivot("Body", 0, 0, 0);
  root.add(body);

  const torso = new THREE.CapsuleGeometry(0.2, 0.36, 3, 8);
  torso.scale(1.05, 1, 0.62);
  body.add(mesh(torso, shirt, "TorsoMesh", 0, 1.24, 0));

  const head = pivot("Head", 0, 1.58, 0);
  head.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8), skin, "Neck", 0, -0.02, 0));
  head.add(mesh(new THREE.SphereGeometry(0.12, 12, 10), skin, "HeadMesh", 0, 0.11, 0));
  const hairGeo = new THREE.SphereGeometry(0.128, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  hairGeo.rotateX(-0.25);
  head.add(mesh(hairGeo, hair, "HairMesh", 0, 0.12, -0.01));
  body.add(head);

  for (const [side, sx] of [["Left", 1], ["Right", -1]]) {
    const arm = pivot(`${side}Arm`, 0.26 * sx, 1.44, 0);
    const sleeve = new THREE.CapsuleGeometry(0.055, 0.5, 2, 6);
    arm.add(mesh(sleeve, shirt, `${side}ArmMesh`, 0, -0.3, 0));
    arm.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), skin, `${side}Hand`, 0, -0.6, 0));
    body.add(arm);

    const leg = pivot(`${side}Leg`, 0.1 * sx, 0.92, 0);
    leg.add(mesh(new THREE.CapsuleGeometry(0.075, 0.74, 2, 6), pants, `${side}LegMesh`, 0, -0.44, 0));
    leg.add(mesh(new THREE.BoxGeometry(0.13, 0.08, 0.27), shoes, `${side}Shoe`, 0, -0.88, 0.05));
    body.add(leg);
  }

  // Walk: 1 s cycle (two steps). Legs and arms swing in opposition, body bobs.
  const q = (x, y = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, 0)).toArray();
  const times = [0, 0.25, 0.5, 0.75, 1];
  const swing = (amp) => [amp, 0, -amp, 0, amp].flatMap((a) => q(a));
  const walk = new THREE.AnimationClip("Walk", 1, [
    new THREE.QuaternionKeyframeTrack("LeftLeg.quaternion", times, swing(0.5)),
    new THREE.QuaternionKeyframeTrack("RightLeg.quaternion", times, swing(-0.5)),
    new THREE.QuaternionKeyframeTrack("LeftArm.quaternion", times, swing(-0.38)),
    new THREE.QuaternionKeyframeTrack("RightArm.quaternion", times, swing(0.38)),
    new THREE.VectorKeyframeTrack("Body.position", times, [0, 0, 0, 0, 0.035, 0, 0, 0, 0, 0, 0.035, 0, 0, 0, 0]),
  ]);
  // Idle: standing, slight sway and a glance around.
  const idleT = [0, 1.5, 3, 4.5, 6];
  const idle = new THREE.AnimationClip("Idle", 6, [
    new THREE.QuaternionKeyframeTrack("Head.quaternion", idleT, [q(0), q(0.05, 0.35), q(0), q(0.03, -0.3), q(0)].flat()),
    new THREE.QuaternionKeyframeTrack("LeftArm.quaternion", idleT, [q(0.04), q(-0.03), q(0.04), q(-0.03), q(0.04)].flat()),
    new THREE.QuaternionKeyframeTrack("RightArm.quaternion", idleT, [q(-0.03), q(0.04), q(-0.03), q(0.04), q(-0.03)].flat()),
    new THREE.VectorKeyframeTrack("Body.position", idleT, [0, 0, 0, 0, 0.01, 0, 0, 0, 0, 0, 0.01, 0, 0, 0, 0]),
  ]);
  return { root, animations: [walk, idle] };
}

/* ---------------------------------------------------------------------- car */
// Faces +X, wheels named Wheel_* so the runtime can spin them. Body paint is
// recoloured per instance.

function buildCar() {
  const paint = new THREE.MeshStandardMaterial({ name: "CarPaint", color: "#c23b32", roughness: 0.35, metalness: 0.5 });
  const b = new Builder();
  b.box(paint, -2.1, 2.1, 0.32, 0.95, -0.88, 0.88);
  b.box(paint, -1.15, 1.0, 0.95, 1.5, -0.8, 0.8);
  b.box(M.windows, -1.1, 0.95, 1.0, 1.44, -0.82, 0.82);
  b.box(M.windows, 0.96, 1.25, 0.98, 1.38, -0.74, 0.74);
  b.box(M.windows, -1.4, -1.12, 0.98, 1.38, -0.74, 0.74);
  b.box(M.lamp, 2.08, 2.13, 0.68, 0.82, -0.75, -0.45);
  b.box(M.lamp, 2.08, 2.13, 0.68, 0.82, 0.45, 0.75);
  const tail = new THREE.MeshStandardMaterial({ name: "TailLight", color: "#8f1d17", emissive: "#ff3b2f", emissiveIntensity: 0.6 });
  b.box(tail, -2.13, -2.08, 0.7, 0.84, -0.8, -0.5);
  b.box(tail, -2.13, -2.08, 0.7, 0.84, 0.5, 0.8);
  b.box(M.frame, -2.16, 2.16, 0.3, 0.42, -0.9, 0.9);
  const car = b.build("Car");
  const tyre = new THREE.MeshStandardMaterial({ name: "Tyre", color: "#151617", roughness: 0.9 });
  for (const [x, z] of [[1.35, 0.85], [1.35, -0.85], [-1.35, 0.85], [-1.35, -0.85]]) {
    const g = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14);
    g.deleteAttribute("uv");
    g.rotateX(Math.PI / 2);
    const w = new THREE.Mesh(g, tyre);
    w.name = `Wheel_${x > 0 ? "F" : "R"}${z > 0 ? "L" : "R"}`;
    w.position.set(x, 0.34, z);
    car.add(w);
  }
  return car;
}

/* ------------------------------------------------------------------- export */

function exportGLB(object, file, animations = []) {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      object,
      (buf) => {
        writeFileSync(join(OUT, "models", file), Buffer.from(buf));
        resolve(buf.byteLength);
      },
      reject,
      { binary: true, animations },
    );
  });
}

/* --------------------------------------------------------------------- font */
// Converts the TTF to three.js "typeface" JSON, keeping only the characters the
// intro can display, which keeps the file small.

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 &-.,'!?/";

function buildFont(ttfPath, outFile) {
  const font = opentype.parse(readFileSync(ttfPath).buffer);
  const r = (n) => Math.round(n);
  const glyphs = {};
  for (const ch of CHARSET) {
    const g = font.charToGlyph(ch);
    const parts = [];
    for (const c of g.path.commands) {
      // glyph.path is in font units, y-up, like typeface JSON; curves list the end point first
      if (c.type === "M") parts.push("m", r(c.x), r(c.y));
      else if (c.type === "L") parts.push("l", r(c.x), r(c.y));
      else if (c.type === "Q") parts.push("q", r(c.x), r(c.y), r(c.x1), r(c.y1));
      else if (c.type === "C") parts.push("b", r(c.x), r(c.y), r(c.x1), r(c.y1), r(c.x2), r(c.y2));
    }
    const bb = g.getBoundingBox();
    glyphs[ch] = { ha: r(g.advanceWidth), x_min: r(bb.x1), x_max: r(bb.x2), o: parts.join(" ") };
  }
  const head = font.tables.head;
  const data = {
    glyphs,
    familyName: font.names.fontFamily?.en ?? "Montserrat",
    ascender: font.ascender,
    descender: font.descender,
    underlinePosition: font.tables.post.underlinePosition,
    underlineThickness: font.tables.post.underlineThickness,
    boundingBox: { xMin: head.xMin, yMin: head.yMin, xMax: head.xMax, yMax: head.yMax },
    resolution: font.unitsPerEm,
    original_font_information: { license: "SIL Open Font License 1.1", copyright: font.names.copyright?.en ?? "" },
    cssFontWeight: "900",
    cssFontStyle: "normal",
  };
  writeFileSync(join(OUT, "fonts", outFile), JSON.stringify(data));
  return JSON.stringify(data).length;
}

/* --------------------------------------------------------------------- main */

const fontDir = join(ROOT, "node_modules", "@expo-google-fonts", "montserrat");
const sizes = {
  "fonts/montserrat-black.typeface.json": buildFont(join(fontDir, "900Black", "Montserrat_900Black.ttf"), "montserrat-black.typeface.json"),
};
copyFileSync(join(fontDir, "LICENSE_FONT"), join(OUT, "fonts", "OFL.txt"));

sizes["models/store.glb"] = await exportGLB(buildStore(), "store.glb");
sizes["models/street.glb"] = await exportGLB(buildStreet(), "street.glb");
const person = buildPerson();
sizes["models/person.glb"] = await exportGLB(person.root, "person.glb", person.animations);
sizes["models/car.glb"] = await exportGLB(buildCar(), "car.glb");

for (const [f, n] of Object.entries(sizes)) console.log(`${f.padEnd(40)} ${(n / 1024).toFixed(1)} KB`);
void palette;
