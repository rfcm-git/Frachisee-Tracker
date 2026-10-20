import { useEffect } from "react";
import Clock from "./Clock.jsx";
import { PAGE_TITLES } from "../../config/constants.js";
import { useUiStore } from "../../state/uiStore.js";

export default function TopBar() {
  const tab = useUiStore((state) => state.tab);
  const issueSub = useUiStore((state) => state.issueSub);
  const [title, subtitle] = PAGE_TITLES[tab === "issues" ? issueSub : tab] || PAGE_TITLES.dashboard;

  useEffect(() => { document.title = `${title} · Franchisee Tracker`; }, [title]);

  return (
    <header className="mainbar">
      <div className="mb-title"><h1>{title}</h1><div className="mb-sub">{subtitle}</div></div>
      <Clock />
    </header>
  );
}
