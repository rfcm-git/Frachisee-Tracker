import { useEffect } from "react";
import Icon from "../ui/Icon.jsx";
import Sidebar from "./Sidebar.jsx";
import Workspace from "./Workspace.jsx";
import { closeSidebarSm, toggleSidebar, useUiStore } from "../../state/uiStore.js";

/**
 * Collapse / expand the menu: a small round handle in the middle of the menu's edge.
 * It shows while the mouse is over the menu (always on touch screens and when focused); hidden on phones (drawer).
 */
function SidebarHandle({ collapsed, expandedSm }) {
  // Under 900px wide the menu is an icon rail that opens wider (expandedSm); above, it collapses (collapsed).
  const rail = typeof window !== "undefined" && window.innerWidth <= 900;
  const isOpen = rail ? expandedSm : !collapsed;
  const label = isOpen ? "Collapse menu" : "Expand menu";
  return <button type="button" className="sb-handle" aria-label={label} data-tip={label} aria-controls="sidebar" aria-expanded={isOpen}
    onClick={toggleSidebar}><Icon name={isOpen ? "chevron-left" : "chevron-right"} /></button>;
}

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
      <SidebarHandle collapsed={collapsed} expandedSm={expandedSm} />
      {/* Phones: dims the page behind the open side menu; tap to close. */}
      {expandedSm && <div className="sb-scrim" aria-hidden="true" onClick={closeSidebarSm} />}
      <Workspace />
    </div>
  );
}
