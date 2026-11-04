// The intro overlay: loading screen with progress, the 3D canvas, Skip and
// "Don't show again" controls, and the hand-off to the site.
// Plain DOM, so the React app only has to call mountIntro().

import "./intro.css";
import { INTRO_DEFAULTS, markIntroSeen, setIntroDisabled, prefersReducedMotion } from "./settings.js";

// Relative weights for the progress ring. The site data keeps loading while the
// animation plays, so it carries real weight.
const WEIGHTS = { engine: 3, store: 1, street: 2, person: 1, car: 1, font: 1, data: 3 };
const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

let uid = 0;

/**
 * Shows the intro over the page.
 * @param {object}   options
 * @param {object}   [options.config]   overrides for INTRO_DEFAULTS
 * @param {Element}  [options.parent]   where to mount (default document.body)
 * @param {(report: (fraction: number) => void) => Promise<any>} [options.preload]
 *        site data to load while the intro plays; may call report(0..1) as it goes
 * @param {(reason: "complete"|"skip"|"error"|"unsupported") => void} [options.onFinish]
 * @returns {{ finish: (reason?: string) => void, destroy: () => void }}
 */
export function mountIntro({ config: overrides = {}, parent = document.body, preload, onFinish } = {}) {
  const config = { ...INTRO_DEFAULTS, ...overrides };
  const reduced = prefersReducedMotion();
  const still = reduced && config.reducedMotion === "still";
  const id = `tpdi-${++uid}`;

  const root = document.createElement("div");
  root.className = "tpdi";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", `${id}-title`);
  root.setAttribute("aria-describedby", `${id}-desc`);
  root.innerHTML = `
    <canvas class="tpdi-canvas" aria-hidden="true"></canvas>
    <div class="tpdi-shade" aria-hidden="true"></div>
    <h1 class="tpdi-sr" id="${id}-title"></h1>
    <p class="tpdi-sr" id="${id}-desc"></p>
    <div class="tpdi-brand" aria-hidden="true"><span class="tpdi-heading"></span><span class="tpdi-sub"></span></div>
    <div class="tpdi-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-labelledby="${id}-status">
      <svg class="tpdi-ring" viewBox="0 0 120 120" aria-hidden="true">
        <circle class="tpdi-ring-bg" cx="60" cy="60" r="59" />
        <circle class="tpdi-ring-track" cx="60" cy="60" r="${RING_R}" />
        <circle class="tpdi-ring-fill" cx="60" cy="60" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}" />
      </svg>
      <span class="tpdi-pct" aria-hidden="true">0<small>%</small></span>
    </div>
    <p class="tpdi-status" id="${id}-status">Loading</p>
    <div class="tpdi-controls">
      <label class="tpdi-check"><input type="checkbox" /> <span>Don't show the intro again</span></label>
      <button type="button" class="tpdi-skip">Skip intro <kbd aria-hidden="true">Esc</kbd></button>
    </div>
    <div class="tpdi-sr" aria-live="polite"></div>`;

  const $ = (sel) => root.querySelector(sel);
  $(`#${id}-title`).textContent = `${config.heading}, ${config.subheading}`;
  $(`#${id}-desc`).textContent = config.description;
  $(".tpdi-heading").textContent = config.heading;
  $(".tpdi-sub").textContent = config.subheading;
  const canvas = $(".tpdi-canvas");
  const meter = $(".tpdi-meter");
  const ringFill = $(".tpdi-ring-fill");
  const pctText = $(".tpdi-pct");
  const statusText = $(".tpdi-status");
  const live = root.querySelector("[aria-live]");
  const skipBtn = $(".tpdi-skip");
  const checkbox = $(".tpdi-check input");
  if (still) root.classList.add("is-still");

  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";
  const prevFocus = document.activeElement;
  parent.appendChild(root);
  skipBtn.focus({ preventScroll: true });

  /* -------------------------------------------------------------- progress */
  const progress = Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, 0]));
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  const target = () => Object.entries(progress).reduce((s, [k, f]) => s + WEIGHTS[k] * f, 0) / total;
  let shown = 0;
  let meterRaf = 0;
  let meterFull;
  const meterDone = new Promise((resolve) => (meterFull = resolve));
  const setStatus = (text) => (statusText.textContent = text);
  const report = (key, f) => (progress[key] = Math.max(progress[key], f));
  const tickMeter = () => {
    const goal = target();
    // Ease the readout toward the real value so it never jumps or runs backwards.
    shown = goal - shown < 0.002 ? goal : shown + (goal - shown) * (reduced ? 1 : 0.18);
    const pct = Math.round(shown * 100);
    ringFill.setAttribute("stroke-dashoffset", String(RING_C * (1 - shown)));
    pctText.firstChild.nodeValue = String(pct);
    meter.setAttribute("aria-valuenow", String(pct));
    if (pct >= 100) {
      // Everything is loaded: the ring turns green, then fades out of the corner.
      root.classList.add("is-loaded");
      setStatus("Loaded");
      meterFull();
      return;
    }
    meterRaf = requestAnimationFrame(tickMeter);
  };
  meterRaf = requestAnimationFrame(tickMeter);

  /* ---------------------------------------------------------------- finish */
  let scene = null;
  let finished = false;
  let resizeObs = null;

  function teardown() {
    cancelAnimationFrame(meterRaf);
    resizeObs?.disconnect();
    document.removeEventListener("keydown", onKey, true);
    scene?.dispose();
    scene = null;
    root.remove();
    document.documentElement.style.overflow = prevOverflow;
  }

  function finish(reason = "skip") {
    if (finished) return;
    finished = true;
    markIntroSeen();
    if (checkbox.checked) setIntroDisabled(true);
    root.classList.add("is-leaving");
    const done = () => {
      teardown();
      onFinish?.(reason);
      if (!onFinish && prevFocus instanceof HTMLElement) prevFocus.focus({ preventScroll: true });
    };
    if (reduced) done();
    else setTimeout(done, 600); // matches the .is-leaving transition
  }

  /* ---------------------------------------------------------- keyboard */
  function onKey(e) {
    if (finished) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finish("skip");
    } else if (e.key === "Tab") {
      // Keep focus inside the intro while it's open.
      const items = [checkbox, skipBtn];
      const i = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus();
    }
  }
  document.addEventListener("keydown", onKey, true);
  skipBtn.addEventListener("click", () => finish("skip"));

  /* -------------------------------------------------------------- loading */
  const dataReady = Promise.resolve()
    .then(() => preload?.((f) => report("data", Math.min(0.99, f))))
    .catch((err) => console.warn("[intro] site data preload failed", err))
    .finally(() => report("data", 1));

  setStatus("Loading 3D street scene");
  import("./scene.js")
    .then(async (mod) => {
      report("engine", 1);
      if (finished) return;
      if (!mod.supportsWebGL()) {
        Object.keys(progress).forEach((k) => report(k, 1));
        setStatus("Opening");
        await dataReady;
        return finish("unsupported");
      }
      const assets = await mod.loadAssets(config.assetBase, report);
      if (finished) return;

      scene = new mod.IntroScene(canvas, assets, {
        quality: mod.detectQuality(),
        heading: config.heading,
        subheading: config.subheading,
        wordmark: config.wordmark,
        still,
      });
      root.introScene = scene; // handy for debugging and the browser tests
      const fit = () => scene?.resize(root.clientWidth, root.clientHeight);
      fit();
      resizeObs = new ResizeObserver(fit);
      resizeObs.observe(root);

      // The scene starts as soon as it can; the ring moves to the corner and keeps
      // counting while the site data finishes loading in the background.
      setStatus("Loading store data");
      root.classList.add("is-playing");
      live.textContent = still ? "Intro ready. It closes on its own, or press Escape to skip." : "Intro playing. Press Escape to skip.";
      // Hand off only when the animation is done AND the site is ready, after the
      // ring has visibly reached 100%.
      const handOff = () =>
        dataReady
          .then(() => meterDone)
          .then(() => new Promise((r) => setTimeout(r, reduced ? 0 : 450)))
          .then(() => !finished && finish("complete"));
      if (still) {
        scene.start();
        if (config.autoHide) setTimeout(handOff, config.stillHoldMs);
      } else {
        scene.start({ holdMs: config.holdMs, onEnd: () => config.autoHide && handOff() });
      }
      root.dataset.state = "playing";
    })
    .catch(async (err) => {
      console.warn("[intro] couldn't start the 3D intro", err);
      await dataReady;
      finish("error");
    });

  return {
    finish,
    /** Remove immediately without a transition (e.g. on unmount). */
    destroy() {
      finished = true;
      teardown();
    },
  };
}
