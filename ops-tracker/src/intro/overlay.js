// The intro overlay: loading screen with progress, the 3D canvas, Skip and
// "Don't show again" controls, and the hand-off to the site.
// Plain DOM so it can be dropped into any page (see intro.html), not just React.

import "./intro.css";
import { INTRO_DEFAULTS, markIntroSeen, setIntroDisabled, prefersReducedMotion } from "./settings.js";

// Relative weights for the progress bar.
const WEIGHTS = { engine: 3, store: 1, street: 2, person: 1, car: 1, font: 1, data: 1 };

let uid = 0;

/**
 * Shows the intro over the page.
 * @param {object}   options
 * @param {object}   [options.config]   overrides for INTRO_DEFAULTS
 * @param {Element}  [options.parent]   where to mount (default document.body)
 * @param {() => Promise<any>} [options.preload]  site data to load while the intro loads
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
    <div class="tpdi-loader">
      <div class="tpdi-brand" aria-hidden="true"><span class="tpdi-heading"></span><span class="tpdi-sub"></span></div>
      <div class="tpdi-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-labelledby="${id}-status">
        <div class="tpdi-bar"><span></span></div>
        <div class="tpdi-readout"><span class="tpdi-status" id="${id}-status">Loading</span><span class="tpdi-pct">0%</span></div>
      </div>
    </div>
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
  const barFill = $(".tpdi-bar span");
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
  const setStatus = (text) => (statusText.textContent = text);
  const report = (key, f) => (progress[key] = Math.max(progress[key], f));
  const tickMeter = () => {
    const goal = target();
    // Ease the readout toward the real value so it never jumps or runs backwards.
    shown = goal - shown < 0.002 ? goal : shown + (goal - shown) * (reduced ? 1 : 0.18);
    const pct = Math.round(shown * 100);
    barFill.style.transform = `scaleX(${shown})`;
    pctText.textContent = `${pct}%`;
    meter.setAttribute("aria-valuenow", String(pct));
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
    .then(() => preload?.())
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
      setStatus("Loading store data");
      await dataReady;
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

      setStatus("Ready");
      // Let the readout catch up to 100% before the scene fades in.
      for (let waited = 0; shown < 0.995 && waited < 1200; waited += 50) await new Promise((r) => setTimeout(r, 50));
      await new Promise((r) => setTimeout(r, reduced ? 0 : 250));
      if (finished) return;
      root.classList.add("is-playing");
      live.textContent = still ? "Intro ready. It closes on its own, or press Escape to skip." : "Intro playing. Press Escape to skip.";
      if (still) {
        scene.start();
        if (config.autoHide) setTimeout(() => finish("complete"), config.stillHoldMs);
      } else {
        scene.start({ holdMs: config.holdMs, onEnd: () => config.autoHide && finish("complete") });
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
