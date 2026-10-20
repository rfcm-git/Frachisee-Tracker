import { useToastStore } from "../../state/toastStore.js";

export default function ToastHost() {
  const { message, type, visible } = useToastStore();
  return <div className={`toast${visible ? " show" : ""}${type ? ` ${type}` : ""}`} id="toast" role="status" aria-live="polite">{message}</div>;
}
