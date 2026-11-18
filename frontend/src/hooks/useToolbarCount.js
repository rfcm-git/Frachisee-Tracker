import { useEffect } from "react";
import { setCountText } from "../state/uiStore.js";

/** Shows a count like "12 of 340" in the toolbar while the view is on screen. */
export function useToolbarCount(text) {
  useEffect(() => { setCountText(text); }, [text]);
  useEffect(() => () => setCountText(""), []);
}
