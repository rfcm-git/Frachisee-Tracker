import { useEffect } from "react";
import AppShell from "./components/layout/AppShell.jsx";
import DialogHost from "./components/dialogs/DialogHost.jsx";
import ToastHost from "./components/ui/ToastHost.jsx";
import TooltipHost from "./components/ui/TooltipHost.jsx";
import CallReminderHost from "./features/calls/CallReminderHost.jsx";
import { useIdleRefresh } from "./hooks/useIdleRefresh.js";
import { useSessionRestore } from "./hooks/useSessionRestore.js";
import { connectSaved } from "./state/appActions.js";

let started = false;

export default function App() {
  useSessionRestore();
  useIdleRefresh();
  useEffect(() => {
    if (started) return;
    started = true;
    connectSaved();
  }, []);

  return (
    <>
      <AppShell />
      <DialogHost />
      <ToastHost />
      <TooltipHost />
      <CallReminderHost />
    </>
  );
}
