import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { mountIntro } from "./overlay.js";
import { INTRO_DEFAULTS, shouldShowIntro, PLAY_INTRO_EVENT, prefersReducedMotion } from "./settings.js";
import { useAuthStore } from "../state/authStore.js";

/**
 * Plays the 3D intro over the app on first load (see settings.js for the rules),
 * whenever "Play intro" is chosen, and behind the sign-in window whenever someone has to sign in. The app renders underneath the whole
 * time, so its data loads in the background; #root is inert until the intro ends.
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

  // Sign-in needed (first visit, after logging out, or a session that ended): the intro is the background.
  useEffect(() => {
    const skipForMotion = prefersReducedMotion() && { ...INTRO_DEFAULTS, ...config }.reducedMotion === "skip";
    const needsSignIn = (status) => status === "signedOut" || status === "unavailable";
    return useAuthStore.subscribe((state, previous) => {
      if (!skipForMotion && needsSignIn(state.status) && !needsSignIn(previous.status)) setShow(true);
    });
  }, [config]);

  // Layout effect: the overlay is in place before the first paint, so the app never flashes.
  useLayoutEffect(() => {
    if (!show) return;
    played.current = true;
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    // The sign-in window reads this to sit inside the intro instead of covering the page.
    document.documentElement.dataset.intro = "on";
    const intro = mountIntro({ config, preload, onFinish: () => setShow(false) });
    return () => {
      intro.destroy();
      root?.removeAttribute("inert");
      document.documentElement.dataset.intro = "off";
    };
  }, [show, config, preload]);

  // Once the app is interactive again, hand focus to the page content.
  useEffect(() => {
    if (show || !played.current) return;
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [show]);

  return children;
}
