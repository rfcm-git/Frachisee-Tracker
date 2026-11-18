import { useEffect } from "react";
import Clock from "./Clock.jsx";
import { PAGE_TITLES } from "../../config/constants.js";
import Icon from "../ui/Icon.jsx";
import { toggleSidebar, useUiStore } from "../../state/uiStore.js";

export default function TopBar() {
  const tab = useUiStore((state) => state.tab);
  const [title, subtitle] = PAGE_TITLES[tab] || PAGE_TITLES.dashboard;
  const menuOpen = useUiStore((state) => state.sidebarExpandedSm);

  useEffect(() => { document.title = `${title} · Franchisee Tracker`; }, [title]);

  return (
    <header className="mainbar">
      {/* Phones only (CSS): opens the side menu drawer. */}
      <button type="button" id="menu-btn" className="mb-menu" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen}
        aria-controls="sidebar" onClick={toggleSidebar}><Icon name={menuOpen ? "x" : "menu"} /></button>
      <div className="mb-title"><h1>{title}</h1><div className="mb-sub">{subtitle}</div></div>
      <Clock />
    </header>
  );
}
