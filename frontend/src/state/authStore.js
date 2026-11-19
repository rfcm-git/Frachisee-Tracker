/*
 * Who is signed in. status: "checking" (asking the backend) | "signedOut" | "signedIn" | "unavailable" (backend unreachable).
 * The sign-in screen shows while signed out; the data loads once signed in.
 */
import { create } from "zustand";
import { fetchCurrentUser, setSignedOutHandler, signIn, signOut } from "../services/api.js";

export const useAuthStore = create(() => ({ status: "checking", user: null, notice: "", error: null }));

const setAuth = (patch) => useAuthStore.setState(patch);
const listeners = new Set();

/** Runs fn(user) every time someone signs in (first load and after a session ends). */
export function onSignedIn(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const isAdmin = (user) => user?.role === "admin";
export const useCurrentUser = () => useAuthStore((state) => state.user);
export const useIsAdmin = () => useAuthStore((state) => isAdmin(state.user));
export const currentUser = () => useAuthStore.getState().user;

/** Resolves once someone is signed in. */
export function whenSignedIn() {
  if (useAuthStore.getState().status === "signedIn") return Promise.resolve(useAuthStore.getState().user);
  return new Promise((resolve) => {
    const stop = useAuthStore.subscribe((state) => {
      if (state.status !== "signedIn") return;
      stop();
      resolve(state.user);
    });
  });
}

function signedIn(user) {
  setAuth({ status: "signedIn", user, notice: "", error: null });
  listeners.forEach((fn) => fn(user));
}

/** Asks the backend whether this browser is already signed in. */
export async function checkSession() {
  setAuth({ status: "checking", error: null });
  try {
    const user = await fetchCurrentUser();
    if (user) signedIn(user);
    else setAuth({ status: "signedOut", user: null });
  } catch (error) {
    setAuth({ status: "unavailable", user: null, error });
  }
}

/** Returns null when signed in, otherwise the error to show. */
export async function logIn(username, password) {
  const result = await signIn(username, password);
  if (result.error) return result.error;
  signedIn(result.user);
  return null;
}

/** Signs out and reloads, so nothing from this session stays on screen. */
export async function logOut() {
  await signOut();
  window.location.reload();
}

// Any request answered "not signed in" (session ended, account turned off) brings the sign-in screen back.
setSignedOutHandler(() => {
  if (useAuthStore.getState().status !== "signedIn") return;
  setAuth({ status: "signedOut", notice: "Your session has ended. Sign in again to continue." });
});

// The page reads these to adapt (e.g. the intro hides its loading ring while sign-in is needed).
if (typeof document !== "undefined") {
  useAuthStore.subscribe((state) => {
    document.documentElement.dataset.auth = state.status;
  });
  document.documentElement.dataset.auth = useAuthStore.getState().status;
}
