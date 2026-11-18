// Settings for the 3D intro and the rules for when it plays.
// Kept free of three.js so the app can decide whether to show the intro
// without downloading the 3D engine.

export const INTRO_DEFAULTS = {
  /** Master switch. */
  enabled: true,
  /** "session" = once per browser tab session, "always" = every load, "once" = first visit only. */
  frequency: "session",
  /** Open the site on its own once the animation has finished and the data has loaded. When false, it waits for Skip. */
  autoHide: true,
  /** How long the final shot holds after the camera move, before the site opens, in ms. */
  holdMs: 600,
  /** With "reduce motion" on: "still" shows the finished scene without movement, "skip" doesn't show the intro. */
  reducedMotion: "still",
  /** Shortest time the still version stays up, in ms. */
  stillHoldMs: 3500,
  /** Where models/ and fonts/ are served from. */
  assetBase: `${import.meta.env.BASE_URL}intro/`,
  heading: "3PD HELPDESK",
  subheading: "MGBD",
  wordmark: "SUBWAY",
  /** Letters of the wordmark before this index are yellow, the rest white (SUB / WAY). */
  wordmarkSplit: 3,
  /** Accessible description of the animation for screen reader users. */
  description:
    "An animated street scene. The camera glides down a sunny street past people walking on the sidewalk and cars on the road, " +
    "then settles in front of a two-storey Subway restaurant with green walls, red awnings and glass shop windows. A sign on its roof lights up and reads " +
    "3PD HELPDESK, with MGBD in smaller letters below.",
};

const OFF_KEY = "franchiseeTracker.intro.off";
const SEEN_SESSION_KEY = "franchiseeTracker.intro.seen";
const SEEN_EVER_KEY = "franchiseeTracker.intro.seenOnce";
export const PLAY_INTRO_EVENT = "franchiseetracker:play-intro";

function read(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}
function write(storage, key, value) {
  try {
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    /* storage blocked: preference lasts for this page only */
  }
}

export function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Should the intro play on this page load?
 * `?intro=1` forces it on, `?intro=0` forces it off (handy for testing and demos).
 */
export function shouldShowIntro(config = INTRO_DEFAULTS, search = typeof location !== "undefined" ? location.search : "") {
  const param = new URLSearchParams(search).get("intro");
  if (param === "1") return true;
  if (param === "0") return false;
  if (!config.enabled) return false;
  if (read(localStorage, OFF_KEY) === "1") return false;
  if (prefersReducedMotion() && config.reducedMotion === "skip") return false;
  if (config.frequency === "session" && read(sessionStorage, SEEN_SESSION_KEY) === "1") return false;
  if (config.frequency === "once" && read(localStorage, SEEN_EVER_KEY) === "1") return false;
  return true;
}

export function markIntroSeen() {
  write(sessionStorage, SEEN_SESSION_KEY, "1");
  write(localStorage, SEEN_EVER_KEY, "1");
}

export function isIntroDisabled() {
  return read(localStorage, OFF_KEY) === "1";
}

/** "Don't show the intro again" (true) or turn it back on (false). */
export function setIntroDisabled(off) {
  write(localStorage, OFF_KEY, off ? "1" : null);
}

/** Ask the app to play the intro now (used by Settings → Play intro). */
export function playIntro() {
  window.dispatchEvent(new Event(PLAY_INTRO_EVENT));
}
