// Plain-JavaScript integration example (used by intro.html).
import { mountIntro } from "./overlay.js";
import { shouldShowIntro } from "./settings.js";

// Override any INTRO_DEFAULTS here, e.g. { frequency: "always", autoHide: false }.
const config = {};

// Whatever your site needs before it's usable: API calls, images, etc.
const preload = () => fetch(`${import.meta.env.BASE_URL}favicon.svg`).then((r) => r.text());

const play = () =>
  mountIntro({
    config,
    preload,
    onFinish: (reason) => {
      document.getElementById("main").focus({ preventScroll: true });
      console.info("[intro] finished:", reason);
    },
  });

if (shouldShowIntro()) play();
document.getElementById("replay").addEventListener("click", play);
