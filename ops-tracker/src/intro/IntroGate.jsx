import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { mountIntro } from "./overlay.js";
import { INTRO_DEFAULTS, shouldShowIntro, PLAY_INTRO_EVENT } from "./settings.js";

/**
 * Plays the 3D intro over the app on first load (see settings.js for the rules)
 * and whenever "Play intro" is chosen. The app renders underneath the whole
 * time, so its data loads in the background; it is inert until the intro ends.
 *
 * Pass `config` and `preload` as stable references (module-level constants).
 */
export function IntroGate({ children, config, preload }) {
  const [show, setShow] = useState(() => shouldShowIntro({ ...INTRO_DEFAULTS, ...config }));
  const played = useRef(false);

  useEffect(() => {
    const play = () => setShow(true);
    window.addEventListener(PLAY_INTRO_EVENT, play);
    return () => window.removeEventListener(PLAY_INTRO_EVENT, play);
  }, []);

  // Layout effect: the overlay is in place before the first paint, so the app never flashes.
  useLayoutEffect(() => {
    if (!show) return;
    played.current = true;
    const intro = mountIntro({ config, preload, onFinish: () => setShow(false) });
    return () => intro.destroy();
  }, [show, config, preload]);

  // Once the app is interactive again, hand focus to the page content.
  useEffect(() => {
    if (show || !played.current) return;
    const main = document.getElementById("main");
    if (!main) return;
    if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    main.focus({ preventScroll: true });
  }, [show]);

  return <div inert={show || undefined}>{children}</div>;
}
