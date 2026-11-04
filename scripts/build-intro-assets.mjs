// Builds the 3D intro's assets into public/intro/:
//   models/store.glb   Subway storefront with the rooftop "3PD HELPDESK" sign board
//   models/street.glb  road, sidewalks, neighbouring buildings, trees, lights, props
//   models/person.glb  low-poly pedestrian with "Walk" and "Idle" animation clips
//   models/car.glb     low-poly car
//   fonts/montserrat-black.typeface.json  subset of Montserrat Black (SIL OFL)
//
// Everything is generated from code so it can be tweaked and rebuilt:
//   npm run intro:assets   (from the project root)
// Static meshes are merged per material, so each model is a handful of draw calls.

import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as fontkit from "fontkit";

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
  // Placeholder look; the intro swaps in a see-through physical glass at runtime.
  glass: mat("ShopGlass", "#cfe3e6", { roughness: 0.05, metalness: 0, transparent: true, opacity: 0.25 }),
  // Store interior
  tileA: mat("FloorTileA", "#ddd5c4", { roughness: 0.6 }),
  tileB: mat("FloorTileB", "#b5a891", { roughness: 0.6 }),
  wallIn: mat("InteriorWall", "#efe5cf"),
  wainscot: mat("Wainscot", "#2f6b45", { roughness: 0.5 }),
  ceiling: mat("Ceiling", "#f4efe4"),
  counterFront: mat("CounterFront", "#4a3527", { roughness: 0.6 }),
  menuBoard: mat("MenuBoard", "#16251c", { roughness: 0.4 }),
  menuText: mat("MenuGlow", "#ffffff", { emissive: "#fffbea", emissiveIntensity: 0.9 }),
  menuPhoto: mat("MenuPhoto", "#e8a04a", { emissive: "#f0a850", emissiveIntensity: 0.7 }),
  pendant: mat("PendantGlow", "#fff4d6", { emissive: "#ffe2a0", emissiveIntensity: 2.2 }),
  cooler: mat("CoolerGlow", "#dff0ff", { emissive: "#cfe8ff", emissiveIntensity: 0.9 }),
  lettuce: mat("Lettuce", "#6fb53f"),
  tomato: mat("Tomato", "#d1402f"),
  cheese: mat("Cheese", "#f2c84b"),
  onion: mat("Onion", "#efe9f3"),
  bread: mat("Bread", "#c98c4a"),
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
  awningRed: mat("Awning", "#d63a2c", { roughness: 0.75, side: THREE.DoubleSide }),
  greenDark: mat("SubwayGreenDark", "#006a31", { roughness: 0.55 }),
  doorGreen: mat("DoorGreen", "#0e7a3a", { roughness: 0.45 }),
  windowFrame: mat("WindowFrame", "#e4e8e6", { roughness: 0.4, metalness: 0.3 }),
  // Upper-floor windows; the intro swaps in a reflective glass at runtime.
  upperGlass: mat("UpperGlass", "#2b4658", { roughness: 0.1, metalness: 0.4 }),
  planterBlue: mat("PlanterBlue", "#3f6f8f", { roughness: 0.6 }),
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

/** What you see through the windows: floor, walls, counter, menu boards, lights. */
function buildInterior(b, y0) {
  const X0 = -5.8, X1 = 5.8, ZB = -8.8, ZF = -0.3, H = 3.05;
  // Checkered floor tiles
  for (let x = X0, i = 0; x < X1 - 0.01; x += 0.8, i++) {
    for (let z = ZB, j = 0; z < ZF - 0.01; z += 0.8, j++) {
      // Only the top is ever seen, so a flat square instead of a box.
      const w = Math.min(x + 0.8, X1) - x, d = Math.min(z + 0.8, ZF) - z;
      const tile = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x + w / 2, y0 + 0.012, z + d / 2);
      b.add((i + j) % 2 ? M.tileA : M.tileB, tile);
    }
  }
  // Walls: cream above, green tile wainscot below; ceiling
  b.box(M.wallIn, X0, X1, y0, H, ZB, ZB + 0.06);
  b.box(M.wallIn, X0, X0 + 0.06, y0, H, ZB, ZF);
  b.box(M.wallIn, X1 - 0.06, X1, y0, H, ZB, ZF);
  b.box(M.wainscot, X0, X1, y0, 1.1, ZB + 0.06, ZB + 0.09);
  b.box(M.wainscot, X0 + 0.06, X0 + 0.09, y0, 1.1, ZB, ZF);
  b.box(M.wainscot, X1 - 0.09, X1 - 0.06, y0, 1.1, ZB, ZF);
  b.box(M.ceiling, X0, X1, H, H + 0.06, ZB, ZF);

  // Menu boards on the back wall, with glowing item rows and photos
  for (const cx of [-3.1, 0, 3.1]) {
    b.box(M.menuBoard, cx - 1.35, cx + 1.35, 1.75, 2.85, ZB + 0.06, ZB + 0.12);
    b.box(M.menuPhoto, cx - 1.2, cx - 0.3, 2.25, 2.72, ZB + 0.12, ZB + 0.13);
    for (let r = 0; r < 4; r++) {
      const y = 2.62 - r * 0.2;
      b.box(M.menuText, cx - 0.15, cx + 0.85, y, y + 0.05, ZB + 0.12, ZB + 0.13);
      b.box(M.cheese, cx + 0.95, cx + 1.18, y, y + 0.05, ZB + 0.12, ZB + 0.13);
    }
    for (let r = 0; r < 2; r++) b.box(M.menuText, cx - 1.2, cx + 1.18, 1.95 - r * 0.12, 1.99 - r * 0.12, ZB + 0.12, ZB + 0.13);
  }

  // Back counter with the bread oven, and the drinks cooler
  b.box(M.steel, -5.6, -3.4, y0, 1.0, ZB + 0.1, ZB + 0.75);
  b.box(M.frame, -5.4, -4.6, 1.0, 1.75, ZB + 0.15, ZB + 0.7);
  b.box(M.pendant, -5.3, -4.7, 1.15, 1.55, ZB + 0.7, ZB + 0.71);
  b.box(M.frame, 4.1, 5.6, y0, 2.15, ZB + 0.1, ZB + 0.8);
  b.box(M.cooler, 4.2, 5.5, y0 + 0.15, 2.05, ZB + 0.8, ZB + 0.81);
  for (let r = 0; r < 4; r++) {
    const y = y0 + 0.35 + r * 0.45;
    for (let k = 0; k < 6; k++) b.box([M.tomato, M.cheese, M.slate, M.lettuce][(r + k) % 4], 4.3 + k * 0.2, 4.42 + k * 0.2, y, y + 0.26, ZB + 0.55, ZB + 0.78);
  }

  // Sandwich counter: wood front, steel top, ingredient bins, sneeze-guard frame
  b.box(M.counterFront, -4.6, 3.2, y0, 1.0, -6.3, -5.6);
  b.box(M.steel, -4.65, 3.25, 1.0, 1.06, -6.4, -5.5);
  const bins = [M.lettuce, M.tomato, M.cheese, M.onion, M.bread, M.lettuce, M.tomato, M.cheese, M.onion, M.bread];
  bins.forEach((m, i) => b.box(m, -4.4 + i * 0.7, -3.9 + i * 0.7, 1.06, 1.12, -6.25, -5.95));
  for (const x of [-4.55, -1.0, 2.5]) b.box(M.steel, x - 0.02, x + 0.02, 1.06, 1.5, -5.62, -5.58);
  b.box(M.steel, -4.6, 3.2, 1.48, 1.51, -5.9, -5.56);

  // Pendant lights over the counter and the seating
  for (const [x, z] of [[-3.4, -5.9], [-1.0, -5.9], [1.4, -5.9], [-3.6, -2.0], [3.6, -2.0]]) {
    b.box(M.frame, x - 0.01, x + 0.01, 2.6, H, z - 0.01, z + 0.01);
    b.cyl(M.pendant, 0.12, 0.2, 0.18, x, 2.45, z, 12);
  }

  // Tables and stools by the windows
  for (const x of [-3.6, 3.6]) {
    b.cyl(M.frame, 0.03, 0.03, 0.72, x, y0, -2.0, 6);
    b.cyl(M.wood, 0.45, 0.45, 0.04, x, y0 + 0.72, -2.0, 16);
    for (const dx of [-0.7, 0.7]) {
      b.cyl(M.frame, 0.025, 0.025, 0.45, x + dx, y0, -2.0, 6);
      b.cyl(M.green, 0.2, 0.2, 0.05, x + dx, y0 + 0.45, -2.0, 12);
    }
  }
}

/**
 * Two-storey corner Subway, modelled on the reference picture:
 *  - ground floor: big shop windows (front bay) and a green door (left bay),
 *    each under a sloped red awning with a yellow valance
 *  - a red band and a projecting green belt above the awnings
 *  - upper floor: green walls with a row of framed windows; the left bay
 *    sticks out as a green box with its own windows and cap
 *  - a green fascia over the front bay that curves back into the roof; the
 *    SUBWAY lettering goes on it (added at runtime)
 *  - the 3PD HELPDESK sign board on the roof
 */
function awning(b, x0, x1, top, drop, depth) {
  // Sloped red canopy from the wall (y = top, z = 0) out to (y = top - drop, z = depth)
  const len = Math.hypot(depth, drop);
  const slope = new THREE.BoxGeometry(x1 - x0, 0.06, len);
  slope.rotateX(Math.atan2(drop, depth));
  slope.translate((x0 + x1) / 2, top - drop / 2, depth / 2);
  b.add(M.awningRed, slope);
  // Yellow valance hanging from the front edge
  b.box(M.yellow, x0, x1, top - drop - 0.42, top - drop + 0.02, depth - 0.02, depth + 0.05);
  // Red side panels
  for (const x of [x0, x1 - 0.05]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, top);
    shape.lineTo(depth, top - drop);
    shape.lineTo(0, top - drop);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
    g.rotateY(-Math.PI / 2); // shape x -> world z, extrusion -> world -x
    g.translate(x + 0.05, 0, 0);
    b.add(M.awningRed, g);
  }
}

function windowRow(b, x0, x1, y0, y1, z, panes) {
  // Glass just proud of the wall face at z, with light frames around and between the panes
  const w = (x1 - x0) / panes;
  b.box(M.upperGlass, x0, x1, y0, y1, z - 0.01, z + 0.03);
  b.box(M.windowFrame, x0 - 0.08, x1 + 0.08, y0 - 0.1, y0, z - 0.01, z + 0.12); // sill
  b.box(M.windowFrame, x0 - 0.08, x1 + 0.08, y1, y1 + 0.08, z - 0.01, z + 0.08); // head
  for (let i = 0; i <= panes; i++) {
    const x = x0 + i * w;
    b.box(M.windowFrame, x - 0.05, x + 0.05, y0, y1, z - 0.01, z + 0.08);
  }
}

function buildStore() {
  const b = new Builder();
  const y0 = SIDEWALK_Y;
  const XL = -6, XR = 6, XB = -2.3; // left edge, right edge, split between the left and front bays
  const G1 = 3.6; // top of the ground floor
  const FRONT_TOP = 7.3, LEFT_TOP = 6.55;

  /* --- Ground floor: hollow, so the interior shows through the glass --- */
  b.box(M.green, XL, XL + 0.2, y0, G1, -9, -0.02); // side walls
  b.box(M.green, XR - 0.2, XR, y0, G1, -9, -0.02);
  b.box(M.green, XL, XR, y0, G1, -9, -8.8); // back wall
  b.box(M.stucco, XL + 0.2, XR - 0.2, 3.1, 3.85, -8.8, -0.3); // floor slab above the shop

  // Pilasters: corners and between the bays
  for (const [a, c] of [[XL, XL + 0.25], [XB - 0.15, XB + 0.15], [XR - 0.25, XR]]) b.box(M.green, a, c, y0, G1, -0.3, 0.12);
  b.box(M.trim, XL, XR, 2.75, G1, -0.3, -0.02); // wall behind the awnings

  // Front bay: shop windows with silver frames
  b.box(M.stone, XB + 0.15, XR - 0.25, y0, 0.55, -0.3, 0.08);
  b.box(M.glass, XB + 0.15, XR - 0.25, 0.55, 2.75, -0.06, 0.02);
  for (const x of [XB + 0.15, -0.15, 1.95, 3.85, XR - 0.25]) b.box(M.steel, x - 0.05, x + 0.05, 0.55, 2.75, -0.04, 0.07);
  for (const y of [0.55, 2.35, 2.75]) b.box(M.steel, XB + 0.15, XR - 0.25, y - 0.04, y + 0.04, -0.04, 0.07);

  // Left bay: green door with a poster, a narrow window beside it, wall either side
  b.box(M.green, XL + 0.25, -5.1, y0, 2.75, -0.3, -0.02);
  b.box(M.doorGreen, -5.1, -3.95, y0, 2.5, -0.06, 0.04);
  // Light door frame so the green door stands out from the green wall
  b.box(M.windowFrame, -5.2, -3.85, 2.5, 2.6, -0.08, 0.08);
  b.box(M.windowFrame, -5.2, -5.1, y0, 2.5, -0.08, 0.08);
  b.box(M.windowFrame, -3.95, -3.85, y0, 2.5, -0.08, 0.08);
  b.box(M.upperGlass, -4.85, -4.2, 2.1, 2.4, 0.04, 0.06); // small glass panel above the poster
  b.box(M.menuPhoto, -4.85, -4.2, 1.15, 2.05, 0.04, 0.06); // door poster
  b.box(M.steel, -4.15, -4.1, 0.95, 1.5, 0.04, 0.12); // handle
  b.box(M.green, -3.95, -3.75, y0, 2.75, -0.3, -0.02);
  b.box(M.stone, -3.75, XB - 0.15, y0, 0.55, -0.3, 0.08);
  b.box(M.glass, -3.75, XB - 0.15, 0.55, 2.75, -0.06, 0.02);
  b.box(M.steel, -3.75, XB - 0.15, 2.71, 2.79, -0.04, 0.07);

  // Awnings, then the red band and projecting green belt above them
  awning(b, XB + 0.1, XR + 0.1, 3.5, 0.6, 1.4);
  awning(b, XL - 0.1, XB - 0.1, 3.35, 0.55, 1.25);
  b.box(M.awningRed, XL, XR, 3.5, 3.85, -0.02, 0.08);
  b.box(M.green, XL - 0.1, XR + 0.1, 3.85, 4.15, -0.02, 0.3);

  /* --- Upper floor: solid (no interior); reflective windows --- */
  b.box(M.green, XB, XR, 4.15, FRONT_TOP, -9, -0.02);
  windowRow(b, XB + 0.35, XR - 0.4, 4.5, 6.05, -0.02, 5);
  // Left bay: a green box sticking out, with its own windows and a cap
  b.box(M.green, XL, XB, 4.15, LEFT_TOP, -9, 0.55);
  windowRow(b, XL + 0.45, XB - 0.4, 4.55, 6.0, 0.55, 2);
  b.box(M.greenDark, XL - 0.12, XB + 0.05, LEFT_TOP, LEFT_TOP + 0.28, -0.4, 0.75);
  b.box(M.roof, XL, XB, LEFT_TOP + 0.28, LEFT_TOP + 0.32, -9, -0.4);

  // Fascia over the front bay, curving back into the roof (SUBWAY goes here)
  const R = 0.9;
  b.box(M.green, XB, XR + 0.05, 6.3, FRONT_TOP, -0.02, 0.35);
  const curve = new THREE.CylinderGeometry(R, R, XR + 0.05 - XB, 20, 1, false, 0, Math.PI / 2);
  curve.rotateZ(Math.PI / 2); // axis along x; the arc runs from facing front to facing up
  curve.translate((XB + XR + 0.05) / 2, FRONT_TOP, 0.35 - R);
  b.add(M.green, curve);
  b.box(M.green, XB, XR + 0.05, FRONT_TOP, FRONT_TOP + R, -9, 0.35 - R); // mass behind the curve
  b.box(M.roof, XB + 0.1, XR - 0.1, FRONT_TOP + R, FRONT_TOP + R + 0.04, -8.9, 0.3 - R);
  const roofTop = FRONT_TOP + R; // 8.2

  /* --- Rooftop sign board (text is added at runtime at the anchors) --- */
  const S = roofTop - 4.78 + 0.18; // lifts the old sign layout onto the new roof
  for (const [x, base] of [[-4.2, LEFT_TOP + 0.3], [4.2, roofTop]]) {
    b.box(M.steel, x - 0.09, x + 0.09, base, 5.4 + S, -1.2, -1.02);
    b.box(M.steel, x - 0.07, x + 0.07, base, 5.6 + S, -2.6, -2.46);
    b.box(M.steel, x - 0.06, x + 0.06, 5.3 + S, 5.42 + S, -2.6, -1.0);
  }
  b.box(M.board, -5.7, 5.7, 5.3 + S, 7.85 + S, -1.28, -0.98);
  b.box(M.green, -5.82, 5.82, 5.22 + S, 5.34 + S, -1.32, -0.94);
  b.box(M.green, -5.82, 5.82, 7.81 + S, 7.93 + S, -1.32, -0.94);
  b.box(M.green, -5.82, -5.7, 5.22 + S, 7.93 + S, -1.32, -0.94);
  b.box(M.green, 5.7, 5.82, 5.22 + S, 7.93 + S, -1.32, -0.94);
  for (const x of [-3.6, 0, 3.6]) {
    b.box(M.frame, x - 0.03, x + 0.03, 7.93 + S, 8.25 + S, -1.16, -1.1);
    b.box(M.frame, x - 0.03, x + 0.03, 8.19 + S, 8.25 + S, -1.16, -0.55);
    b.box(M.signLamp, x - 0.16, x + 0.16, 8.1 + S, 8.2 + S, -0.75, -0.45);
  }
  b.box(M.steel, 1.2, 2.8, roofTop, roofTop + 0.6, -7.5, -5.8); // rooftop unit

  /* --- Interior and sidewalk props --- */
  buildInterior(b, y0);
  // Red bins against the shop windows, yellow bollards by the curb, planters
  for (const x of [0.7, 5.2]) {
    b.cyl(M.red, 0.3, 0.27, 0.95, x, y0, 0.75, 14);
    b.cyl(M.trim, 0.32, 0.32, 0.06, x, y0 + 0.95, 0.75, 14);
  }
  for (const x of [-1.5, 2.2, 6.6]) {
    b.cyl(M.yellow, 0.11, 0.11, 0.85, x, y0, 4.35, 10);
    b.cyl(M.trim, 0.12, 0.12, 0.05, x, y0 + 0.85, 4.35, 10);
  }
  b.cyl(M.planterBlue, 0.32, 0.26, 0.6, -5.55, y0, 0.75, 12);
  b.ico(M.shrub, 0.4, -5.55, y0 + 0.9, 0.75, 1, 0.9);
  b.cyl(M.planterBlue, 0.32, 0.26, 0.6, -3.3, y0, 0.75, 12);
  b.ico(M.shrub, 0.36, -3.3, y0 + 0.85, 0.75, 1, 0.9);

  const store = b.build("Store");
  // Where the runtime puts the 3D text and lights
  anchor(store, "Anchor_Wordmark", (XB + XR) / 2, 6.8, 0.37);
  anchor(store, "Anchor_Heading", 0, 6.82 + S, -0.97);
  anchor(store, "Anchor_Subheading", 0, 5.78 + S, -0.97);
  anchor(store, "Anchor_SignLight", 0, 8.0 + S, 1.5);
  anchor(store, "Anchor_InteriorLight", 0, 2.6, -4.2);
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

/* ------------------------------------------------------- glyph clean-up */
// Some Montserrat glyphs (B, for one) draw two counters as ONE outline that
// crosses itself through a thin sliver. Browsers fill that correctly, but
// three.js triangulates each outline as a simple polygon and loses a hole.
// untangledContours() splits every self-crossing outline at its crossings
// (straight edges only, which is where these crossings are) into simple loops.

const signedArea = (loop) => {
  let a = 0;
  for (const { from, to } of loop) a += from[0] * to[1] - to[0] * from[1];
  return a / 2;
};

function lineCross(s1, s2) {
  const [x1, y1] = s1.from, [x2, y2] = s1.to, [x3, y3] = s2.from, [x4, y4] = s2.to;
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / d;
  const eps = 1e-6;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null; // touching at ends is fine
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

/** Split a closed loop of segments at its first straight-edge self-crossing, recursively. */
function splitLoop(loop, depth = 0) {
  if (depth > 8) return [loop];
  for (let i = 0; i < loop.length; i++) {
    for (let j = i + 2; j < loop.length; j++) {
      if (i === 0 && j === loop.length - 1) continue; // neighbours across the closing point
      const a = loop[i], b = loop[j];
      if (a.type !== "L" || b.type !== "L") continue;
      const X = lineCross(a, b);
      if (!X) continue;
      const one = [{ type: "L", from: X, to: a.to }, ...loop.slice(i + 1, j), { type: "L", from: b.from, to: X }];
      const two = [{ type: "L", from: X, to: b.to }, ...loop.slice(j + 1), ...loop.slice(0, i), { type: "L", from: a.from, to: X }];
      return [...splitLoop(one, depth + 1), ...splitLoop(two, depth + 1)];
    }
  }
  return [loop];
}

function untangledContours(commands, ch) {
  // Commands -> closed loops of segments {type, from, to, c, c2}
  const loops = [];
  let loop = null, start = null, pen = null;
  const close = () => {
    if (loop?.length) {
      if (pen[0] !== start[0] || pen[1] !== start[1]) loop.push({ type: "L", from: pen, to: start });
      loops.push(loop);
    }
    loop = null;
  };
  for (const { command, args: a } of commands) {
    if (command === "moveTo") { close(); loop = []; start = pen = [a[0], a[1]]; }
    else if (command === "lineTo") { loop.push({ type: "L", from: pen, to: [a[0], a[1]] }); pen = [a[0], a[1]]; }
    else if (command === "quadraticCurveTo") { loop.push({ type: "Q", from: pen, c: [a[0], a[1]], to: [a[2], a[3]] }); pen = [a[2], a[3]]; }
    else if (command === "bezierCurveTo") { loop.push({ type: "C", from: pen, c: [a[0], a[1]], c2: [a[2], a[3]], to: [a[4], a[5]] }); pen = [a[4], a[5]]; }
    else if (command === "closePath") close();
  }
  close();

  const out = [];
  for (const original of loops) {
    const pieces = splitLoop(original);
    if (pieces.length === 1) { out.push(original); continue; }
    // Solid outlines wind clockwise here (negative area), holes counter-clockwise.
    const solid = signedArea(original) < 0;
    for (const piece of pieces) {
      const sameWay = signedArea(piece) < 0 === solid;
      if (Math.abs(signedArea(piece)) < 1) continue;
      if (sameWay) out.push(piece);
      // A piece that winds the other way is a sliver: inside a hole outline it is
      // ink the outer outline already covers, so it is dropped. (Inside a solid
      // outline it would also be ink, so it is kept, reversed.)
      else if (solid) out.push(piece.slice().reverse().map((sg) => ({ ...sg, from: sg.to, to: sg.from, c: sg.c2 ?? sg.c, c2: sg.c2 ? sg.c : undefined })));
    }
    console.log(`  font: untangled "${ch}" outline into ${pieces.length} loops`);
  }
  return out;
}

function buildFont(ttfPath, outFile) {
  // fontkit reads Montserrat correctly (opentype.js 2.0 garbles B, M, G and others).
  const font = fontkit.openSync(ttfPath);
  const r = (n) => Math.round(n);
  const glyphs = {};
  for (const ch of CHARSET) {
    const g = font.glyphForCodePoint(ch.codePointAt(0));
    const parts = [];
    // Font units, y-up, like typeface JSON; curves list the end point first.
    for (const loop of untangledContours(g.path.commands, ch)) {
      parts.push("m", r(loop[0].from[0]), r(loop[0].from[1]));
      for (const seg of loop) {
        const [x, y] = seg.to;
        if (seg.type === "L") parts.push("l", r(x), r(y));
        else if (seg.type === "Q") parts.push("q", r(x), r(y), r(seg.c[0]), r(seg.c[1]));
        else parts.push("b", r(x), r(y), r(seg.c[0]), r(seg.c[1]), r(seg.c2[0]), r(seg.c2[1]));
      }
    }
    const bb = g.bbox;
    glyphs[ch] = { ha: r(g.advanceWidth), x_min: r(bb.minX), x_max: r(bb.maxX), o: parts.join(" ") };
  }
  // Kerning for every pair of characters (only the non-zero ones are stored).
  const kern = {};
  for (const a of CHARSET) {
    for (const b of CHARSET) {
      const run = font.layout(a + b);
      const k = run.positions[0].xAdvance - run.glyphs[0].advanceWidth;
      if (k) kern[a + b] = k;
    }
  }
  const data = {
    glyphs,
    kern,
    familyName: font.familyName,
    ascender: font.ascent,
    descender: font.descent,
    underlinePosition: font.underlinePosition,
    underlineThickness: font.underlineThickness,
    boundingBox: { xMin: font.bbox.minX, yMin: font.bbox.minY, xMax: font.bbox.maxX, yMax: font.bbox.maxY },
    resolution: font.unitsPerEm,
    original_font_information: { license: "SIL Open Font License 1.1", copyright: font.copyright ?? "" },
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
