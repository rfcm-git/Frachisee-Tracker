import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles/index.css";
import App from "./App.jsx";
import { IntroGate } from "./intro/IntroGate.jsx";
import { api } from "./data/index.js";

// Data the intro's loading screen waits for: the signed-in user, lookups, and
// the code for the most-used pages, so the app is ready when the intro ends.
const preloadSiteData = () =>
  Promise.all([
    api.getCurrentUser(),
    api.getLookups(),
    import("./pages/issues/IssuesPage.jsx"),
    import("./pages/stores/StoresPage.jsx"),
  ]);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <IntroGate preload={preloadSiteData}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </IntroGate>
  </StrictMode>,
);
