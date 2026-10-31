import { useEffect, useRef } from "react";

/*
 * Faint background of sandwich ingredients (tomato, cucumber, olive, onion, pepper, lettuce, cheese, sub rolls)
 * drifting behind the app. Pieces near the mouse are pushed away and spin, then drift back.
 * Drawn on one canvas at low opacity; it never takes clicks. Still image when the user prefers reduced motion.
 */

const TAU = Math.PI * 2;
const PUSH_RADIUS = 150;

/* ---------- ingredient sprites (drawn once to small canvases) ---------- */

function sprite(size, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size * 2;
  const g = canvas.getContext("2d");
  g.scale(2, 2);
  g.translate(size / 2, size / 2);
  draw(g, size / 2);
  return canvas;
}

const ring = (g, r, width, color) => { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.lineWidth = width; g.strokeStyle = color; g.stroke(); };
const disc = (g, r, color, x = 0, y = 0) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = color; g.fill(); };

const SPRITES = {
  tomato: (s) => sprite(s, (g, r) => {
    disc(g, r * 0.92, "#d8342a");
    disc(g, r * 0.78, "#f0644f");
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * TAU;
      g.save(); g.rotate(a);
      g.beginPath(); g.ellipse(r * 0.42, 0, r * 0.22, r * 0.14, 0, 0, TAU); g.fillStyle = "#ffb3a1"; g.fill();
      disc(g, r * 0.05, "#fff1c4", r * 0.42, 0);
      g.restore();
    }
    disc(g, r * 0.14, "#e8503f");
  }),
  cucumber: (s) => sprite(s, (g, r) => {
    disc(g, r * 0.92, "#2f7d32");
    disc(g, r * 0.8, "#cfe9a8");
    disc(g, r * 0.45, "#e9f6cf");
    for (let i = 0; i < 6; i += 1) { const a = (i / 6) * TAU; disc(g, r * 0.07, "#a9cf78", Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3); }
  }),
  olive: (s) => sprite(s, (g, r) => { ring(g, r * 0.62, r * 0.42, "#2b2b2b"); ring(g, r * 0.62, r * 0.08, "#4a4a4a"); }),
  onion: (s) => sprite(s, (g, r) => { ring(g, r * 0.85, r * 0.1, "#9b59b6"); ring(g, r * 0.62, r * 0.08, "#c39bd3"); ring(g, r * 0.4, r * 0.07, "#d7bde2"); }),
  pepper: (s) => sprite(s, (g, r) => {
    g.beginPath();
    for (let i = 0; i <= 60; i += 1) {
      const a = (i / 60) * TAU;
      const rr = r * (0.78 + 0.1 * Math.sin(a * 4));
      if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath(); g.lineWidth = r * 0.16; g.strokeStyle = "#3a9b2d"; g.stroke();
  }),
  lettuce: (s) => sprite(s, (g, r) => {
    g.beginPath();
    for (let i = 0; i <= 80; i += 1) {
      const a = (i / 80) * TAU;
      const rr = r * (0.7 + 0.12 * Math.sin(a * 9) + 0.08 * Math.sin(a * 3));
      const x = Math.cos(a) * rr * 1.05;
      const y = Math.sin(a) * rr * 0.75;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath(); g.fillStyle = "#7cc242"; g.fill();
    g.strokeStyle = "#c9ec9c"; g.lineWidth = r * 0.06;
    g.beginPath(); g.moveTo(-r * 0.6, 0); g.lineTo(r * 0.6, 0); g.stroke();
    for (let i = -2; i <= 2; i += 1) { g.beginPath(); g.moveTo(i * r * 0.2, 0); g.lineTo(i * r * 0.2 + r * 0.15, -r * 0.3); g.moveTo(i * r * 0.2, 0); g.lineTo(i * r * 0.2 + r * 0.15, r * 0.3); g.stroke(); }
  }),
  cheese: (s) => sprite(s, (g, r) => {
    g.beginPath(); g.moveTo(-r * 0.8, r * 0.6); g.lineTo(r * 0.8, r * 0.6); g.lineTo(0, -r * 0.8); g.closePath();
    g.fillStyle = "#ffc600"; g.fill();
    [[-0.3, 0.25, 0.12], [0.25, 0.3, 0.09], [0, -0.15, 0.1]].forEach(([x, y, rr]) => disc(g, r * rr, "#ffe17a", x * r, y * r));
  }),
  sub: (s) => sprite(s, (g, r) => {
    // A footlong seen from the side: lettuce and tomato peeking out of the roll.
    g.beginPath(); g.ellipse(0, r * 0.12, r * 0.95, r * 0.2, 0, 0, TAU); g.fillStyle = "#7cc242"; g.fill();
    g.fillStyle = "#e8503f"; for (let i = -3; i <= 3; i += 1) { g.beginPath(); g.ellipse(i * r * 0.26, r * 0.04, r * 0.11, r * 0.06, 0, 0, TAU); g.fill(); }
    g.beginPath(); g.ellipse(0, -r * 0.08, r * 0.92, r * 0.28, 0, Math.PI, TAU); g.fillStyle = "#d99a4e"; g.fill();
    g.beginPath(); g.ellipse(0, r * 0.26, r * 0.9, r * 0.14, 0, 0, Math.PI); g.fillStyle = "#c98a3e"; g.fill();
    g.fillStyle = "#fff2d6"; for (let i = -4; i <= 4; i += 1) { g.beginPath(); g.ellipse(i * r * 0.18, -r * 0.22 - Math.cos(i / 3) * r * 0.05, r * 0.035, r * 0.018, 0.4, 0, TAU); g.fill(); }
  }),
};

/** Kinds and how often they appear (the sub roll is the "hero" piece, less often). */
const KINDS = ["tomato", "tomato", "cucumber", "cucumber", "olive", "olive", "onion", "pepper", "lettuce", "lettuce", "cheese", "sub"];

function makePieces(width, height, sprites) {
  const count = Math.round(Math.min(34, Math.max(12, (width * height) / 52000)));
  return Array.from({ length: count }, (_, index) => {
    const kind = KINDS[index % KINDS.length];
    const depth = 0.55 + Math.random() * 0.75; // nearer pieces are bigger, faster and react more
    const size = (kind === "sub" ? 120 : kind === "lettuce" ? 70 : kind === "olive" ? 30 : 48) * depth;
    return {
      img: sprites[kind], size, depth,
      x: Math.random() * width, y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.18 * depth, vy: (0.08 + Math.random() * 0.14) * depth,
      ox: 0, oy: 0, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 0.004, kick: 0,
    };
  });
}

export default function SubwayBackdrop() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    if (!g) return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const sprites = Object.fromEntries(Object.entries(SPRITES).map(([kind, make]) => [kind, make(kind === "sub" ? 128 : 80)]));
    const mouse = { x: -9999, y: -9999, glow: 0 };
    let width = 0;
    let height = 0;
    let pieces = [];
    let frame = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      pieces = makePieces(width, height, sprites);
    };

    const draw = () => {
      g.clearRect(0, 0, width, height);
      if (mouse.glow > 0.01) {
        const glow = g.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, PUSH_RADIUS * 1.4);
        glow.addColorStop(0, `rgba(255,198,0,${0.5 * mouse.glow})`);
        glow.addColorStop(0.5, `rgba(140,198,63,${0.22 * mouse.glow})`);
        glow.addColorStop(1, "rgba(0,137,56,0)");
        g.fillStyle = glow;
        g.fillRect(mouse.x - PUSH_RADIUS * 1.4, mouse.y - PUSH_RADIUS * 1.4, PUSH_RADIUS * 2.8, PUSH_RADIUS * 2.8);
      }
      pieces.forEach((piece) => {
        g.save();
        g.translate(piece.x + piece.ox, piece.y + piece.oy);
        g.rotate(piece.rot);
        g.globalAlpha = 0.55 + 0.45 * Math.min(1, piece.depth);
        g.drawImage(piece.img, -piece.size / 2, -piece.size / 2, piece.size, piece.size);
        g.restore();
      });
    };

    const step = () => {
      const margin = 80;
      pieces.forEach((piece) => {
        piece.x += piece.vx;
        piece.y += piece.vy;
        if (piece.y > height + margin) { piece.y = -margin; piece.x = Math.random() * width; }
        if (piece.x < -margin) piece.x = width + margin;
        if (piece.x > width + margin) piece.x = -margin;

        // Push away from the mouse, then spring back to the drifting path.
        const dx = piece.x + piece.ox - mouse.x;
        const dy = piece.y + piece.oy - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist < PUSH_RADIUS && dist > 0.1) {
          const force = (1 - dist / PUSH_RADIUS) ** 2 * 7 * piece.depth;
          piece.ox += (dx / dist) * force;
          piece.oy += (dy / dist) * force;
          piece.kick = Math.min(0.08, piece.kick + force * 0.004);
        }
        piece.ox *= 0.94;
        piece.oy *= 0.94;
        piece.kick *= 0.95;
        piece.rot += piece.spin + piece.kick * Math.sign(piece.spin || 1);
      });
      mouse.glow += ((mouse.x > -999 ? 1 : 0) - mouse.glow) * 0.08;
    };

    const loop = () => {
      step();
      draw();
      frame = requestAnimationFrame(loop);
    };
    const start = () => { if (!frame && !reduce && !document.hidden) frame = requestAnimationFrame(loop); };
    const stop = () => { cancelAnimationFrame(frame); frame = 0; };

    const onMove = (event) => { mouse.x = event.clientX; mouse.y = event.clientY; };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onResize = () => { resize(); if (reduce) draw(); };

    resize();
    draw();
    start();
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="subway-backdrop" aria-hidden="true" />;
}
