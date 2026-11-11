import { useEffect } from "react";
import Sidebar from "./Sidebar.jsx";
import Workspace from "./Workspace.jsx";
import { closeSidebarSm, useUiStore } from "../../state/uiStore.js";

export default function AppShell() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const expandedSm = useUiStore((state) => state.sidebarExpandedSm);

  // Phones: Escape closes the open side menu and returns focus to the menu button (unless a dialog is open).
  useEffect(() => {
    if (!expandedSm) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape" || document.querySelector(".overlay.show")) return;
      closeSidebarSm();
      document.getElementById("menu-btn")?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expandedSm]);

  return (
    <div className={`app${collapsed ? " collapsed" : ""}${expandedSm ? " expanded-sm" : ""}`} id="app">
      <Sidebar />
      {/* Phones: dims the page behind the open side menu; tap to close. */}
      {expandedSm && <div className="sb-scrim" aria-hidden="true" onClick={closeSidebarSm} />}
      <Workspace />
    </div>
  );
}
