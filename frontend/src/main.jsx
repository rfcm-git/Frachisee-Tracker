import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { IntroGate } from "./intro/IntroGate.jsx";
import LoginScreen from "./components/auth/LoginScreen.jsx";
import { connectSaved, loadAll } from "./state/appActions.js";
import { checkSession, onSignedIn, whenSignedIn } from "./state/authStore.js";
import { useDataStore } from "./state/dataStore.js";
import "./styles.css";

// Sign-in first; the data loads once someone is signed in (and loads again after a session ends and they sign back in).
let firstSignIn = true;
onSignedIn(() => {
  if (firstSignIn) connectSaved();
  else loadAll({ silent: true });
  firstSignIn = false;
});
checkSession();

// The intro's loading ring follows the database load (after sign-in), table by table,
// waiting up to 15 seconds once signed in, so the tracker is ready when the intro ends.
// While nobody is signed in, the intro waits on the sign-in window.
const waitForData = (report) =>
  whenSignedIn().then(() => new Promise((resolve) => {
    const done = () => useDataStore.getState().phase !== "loading";
    if (done()) return resolve();
    const timer = setTimeout(finish, 15000);
    const unsubscribe = useDataStore.subscribe((state) => {
      report(state.loadProgress);
      if (done()) finish();
    });
    function finish() {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    }
  }));

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <IntroGate preload={waitForData}>
      <App />
    </IntroGate>
    <LoginScreen />
  </StrictMode>,
);
