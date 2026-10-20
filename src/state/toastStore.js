/* Short notifications at the bottom of the screen. */
import { create } from "zustand";
import { copyToClipboard } from "../lib/browser.js";

export const useToastStore = create(() => ({ message: "", type: "", visible: false, seq: 0 }));

let timer = null;

/** type: "" | "ok" | "err" */
export function toast(message, type = "") {
  window.clearTimeout(timer);
  useToastStore.setState((state) => ({ message: String(message ?? ""), type, visible: true, seq: state.seq + 1 }));
  timer = window.setTimeout(() => useToastStore.setState({ visible: false, type: "" }), 2600);
}

/** Copies text and confirms with a toast. */
export async function copyText(text) {
  if (await copyToClipboard(String(text ?? ""))) toast("Copied", "ok");
}
