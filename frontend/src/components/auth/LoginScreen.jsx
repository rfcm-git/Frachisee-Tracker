import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Icon from "../ui/Icon.jsx";
import { friendlyError } from "../../lib/errors.js";
import { checkSession, logIn, useAuthStore } from "../../state/authStore.js";

/** True while the 3D intro is on screen (IntroGate sets <html data-intro="on">). */
const readIntroOn = () => document.documentElement.dataset.intro === "on";
function subscribeIntro(onChange) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-intro"] });
  return () => observer.disconnect();
}
const useIntroOn = () => useSyncExternalStore(subscribeIntro, readIntroOn);

/** Keeps Tab inside the window. */
function trapTab(event, box) {
  if (event.key !== "Tab" || !box) return;
  const items = [...box.querySelectorAll("input, button")].filter((el) => !el.disabled);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function SignInForm() {
  const notice = useAuthStore((state) => state.notice);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const passwordRef = useRef(null);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) { setError("Enter your username and password."); return; }
    setBusy(true);
    setError("");
    const failure = await logIn(username.trim(), password);
    setBusy(false);
    if (!failure) return;
    setError(friendlyError(failure).title);
    setPassword("");
    passwordRef.current?.focus();
  }

  return <form className="auth-form" onSubmit={submit} noValidate>
    {notice && <p className="auth-notice" role="status"><Icon name="clock" />{notice}</p>}
    <div className="field">
      <label htmlFor="auth_user">Username</label>
      <input id="auth_user" name="username" autoComplete="username" autoCapitalize="none" spellCheck="false" autoFocus
        value={username} aria-invalid={Boolean(error) || undefined} onChange={(event) => { setUsername(event.target.value); setError(""); }} />
    </div>
    <div className="field">
      <label htmlFor="auth_pass">Password</label>
      <div className="auth-pass">
        <input id="auth_pass" ref={passwordRef} name="password" type={showPassword ? "text" : "password"} autoComplete="current-password"
          value={password} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? "auth_err" : undefined}
          onChange={(event) => { setPassword(event.target.value); setError(""); }} />
        <button type="button" className="auth-eye" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}
          onClick={() => setShowPassword(!showPassword)}><Icon name={showPassword ? "eye-off" : "eye"} /></button>
      </div>
    </div>
    <p className="auth-error" id="auth_err" role="alert">{error && <><Icon name="circle-alert" />{error}</>}</p>
    <button type="submit" className="btn auth-submit" disabled={busy} aria-busy={busy}>
      {busy ? <><span className="auth-spin" aria-hidden="true" />Signing in…</> : <><Icon name="log-in" />Sign in</>}
    </button>
    <p className="auth-help">Forgot your password? Ask an admin to reset it.</p>
  </form>;
}

function Unavailable() {
  const error = useAuthStore((state) => state.error);
  const [busy, setBusy] = useState(false);
  const info = friendlyError(error);
  async function retry() {
    setBusy(true);
    await checkSession();
    setBusy(false);
  }
  return <div className="auth-form">
    <p className="auth-error is-block" role="alert"><Icon name="circle-alert" />{info.title}</p>
    {info.body && <p className="auth-help">{info.body}</p>}
    <button type="button" className="btn auth-submit" disabled={busy} onClick={retry} autoFocus>
      {busy ? <><span className="auth-spin" aria-hidden="true" />Trying…</> : <><Icon name="refresh-cw" />Try again</>}
    </button>
  </div>;
}

/**
 * The sign-in window. Over the 3D intro it takes the loading ring's place (the intro waits for it);
 * without the intro it is a full-page sign-in. Shown whenever nobody is signed in.
 */
export default function LoginScreen() {
  const status = useAuthStore((state) => state.status);
  const introOn = useIntroOn();
  const boxRef = useRef(null);
  const visible = status === "signedOut" || status === "unavailable";

  // The app behind can't be reached while the window is up (IntroGate does the same while the intro plays).
  useEffect(() => {
    if (!visible) return undefined;
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    return () => { if (document.documentElement.dataset.intro !== "on") root?.removeAttribute("inert"); };
  }, [visible, introOn]);

  if (!visible) return null;
  return createPortal(
    <div className={`auth-screen${introOn ? " over-intro" : ""}`} data-auth-screen="">
      <div className="auth-card" ref={boxRef} role="dialog" aria-modal="true" aria-labelledby="auth_title" aria-describedby="auth_sub"
        onKeyDown={(event) => trapTab(event, boxRef.current)}>
        <div className="auth-head">
          <div className="mark" aria-hidden="true">3PD</div>
          <div>
            <h2 id="auth_title">Franchisee Tracker</h2>
            <p id="auth_sub">{status === "unavailable" ? "Can't sign in right now" : "Sign in to continue"}</p>
          </div>
        </div>
        {status === "unavailable" ? <Unavailable /> : <SignInForm />}
      </div>
    </div>,
    document.body,
  );
}
