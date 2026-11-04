// Settings for the 3D intro and the rules for when it plays.
// Kept free of three.js so the app can decide whether to show the intro
// without downloading the 3D engine.

export const INTRO_DEFAULTS = {
  /** Master switch. */
  enabled: true,
  /** "session" = once per browser tab session, "always" = every load, "once" = first visit only. */
  frequency: "session",
  /** Close the intro on its own when the camera move finishes. */
  autoHide: true,
  /** How long to hold the last shot before closing, in ms. */
  holdMs: 1800,
  /** With "reduce motion" on: "still" shows the finished scene without movement, "skip" doesn't show the intro. */
  reducedMotion: "still",
  /** How long the still version stays up before closing, in ms. */
  stillHoldMs: 3500,
  /** Where models/ and fonts/ are served from. */
  assetBase: `${import.meta.env.BASE_URL}intro/`,
  heading: "3PD HELPDESK",
  subheading: "MGBD",
  wordmark: "SUBWAY",
  /** Accessible description of the animation for screen reader users. */
  description:
    "An animated street scene. The camera glides down a sunny street past people walking on the sidewalk and cars on the road, " +
    "then settles in front of a Subway restaurant with green and yellow branding. A sign on its roof lights up and reads " +
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

/** Ask the app to play the intro now (used by the sidebar's "Play intro" button). */
export function playIntro() {
  window.dispatchEvent(new Event(PLAY_INTRO_EVENT));
}
