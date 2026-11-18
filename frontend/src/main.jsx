import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { IntroGate } from "./intro/IntroGate.jsx";
import { connectSaved } from "./state/appActions.js";
import { useDataStore } from "./state/dataStore.js";
import "./styles.css";

connectSaved();

// The intro's loading ring also follows the database load (connectSaved above),
// table by table, waiting up to 15 seconds, so the tracker is ready when the intro ends.
const waitForData = (report) =>
  new Promise((resolve) => {
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
  });

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <IntroGate preload={waitForData}>
      <App />
    </IntroGate>
  </StrictMode>,
);
