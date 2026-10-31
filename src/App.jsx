import AppShell from "./components/layout/AppShell.jsx";
import SubwayBackdrop from "./components/layout/SubwayBackdrop.jsx";
import DialogHost from "./components/dialogs/DialogHost.jsx";
import ToastHost from "./components/ui/ToastHost.jsx";
import TooltipHost from "./components/ui/TooltipHost.jsx";
import CallReminderHost from "./features/calls/CallReminderHost.jsx";
import CapsReminderHost from "./features/caps/CapsReminderHost.jsx";
import NotificationHost from "./features/notifications/NotificationHost.jsx";
import { useIdleRefresh } from "./hooks/useIdleRefresh.js";
import { useSearchShortcut } from "./hooks/useSearchShortcut.js";
import { useSessionRestore } from "./hooks/useSessionRestore.js";

export default function App() {
  useSessionRestore();
  useIdleRefresh();
  useSearchShortcut();

  return (
    <>
      <SubwayBackdrop />
      <AppShell />
      <DialogHost />
      <ToastHost />
      <TooltipHost />
      <CallReminderHost />
      <CapsReminderHost />
      <NotificationHost />
    </>
  );
}
