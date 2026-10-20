import Sidebar from "./Sidebar.jsx";
import Workspace from "./Workspace.jsx";
import { useUiStore } from "../../state/uiStore.js";

export default function AppShell() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const expandedSm = useUiStore((state) => state.sidebarExpandedSm);
  return (
    <div className={`app${collapsed ? " collapsed" : ""}${expandedSm ? " expanded-sm" : ""}`} id="app">
      <Sidebar />
      <Workspace />
    </div>
  );
}
