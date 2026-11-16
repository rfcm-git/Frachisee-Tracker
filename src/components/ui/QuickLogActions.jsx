import Icon from "./Icon.jsx";
import { useDataContext } from "../../state/dataStore.js";
import { openCallLog, openLogIssue, openNewOnboarding } from "../../state/dialogs.js";

/**
 * Log issue / Log call / Log onboarding for one store (store) or one franchisee (franchiseeId).
 * Each form opens with the store or franchisee filled in. Buttons whose table is not set up yet are hidden.
 */
export default function QuickLogActions({ store = null, franchiseeId = null }) {
  const ctx = useDataContext();
  const ownerId = store ? store.franchisee_id ?? null : franchiseeId;
  const storeNum = store ? String(store.num || "") : "";

  const actions = [
    { key: "issue", icon: "triangle-alert", label: "Log issue", tip: store ? `Log an issue for store ${storeNum}` : "Log an issue for one of their stores, or a general one",
      run: () => (store ? openLogIssue(store.id) : openLogIssue(null, franchiseeId)) },
    ctx.callLogsReady && { key: "call", icon: "phone", label: "Log call", tip: ownerId ? "Log a call to this franchisee" : "This store has no franchisee — pick who you called",
      run: () => openCallLog(ownerId, null, ownerId ? store?.id ?? null : null) },
    ctx.onboardingReady && { key: "ob", icon: "rocket", label: "Log onboarding", tip: store ? `Start onboarding for store ${storeNum}` : "Start onboarding for their stores",
      run: () => openNewOnboarding(store ? { storeNums: [storeNum] } : { franchiseeId }) },
  ].filter(Boolean);

  return <div className="qlog" role="group" aria-label="Log">
    {actions.map((action) => <button type="button" key={action.key} className={`qlog-btn q-${action.key}`} data-tip={action.tip} onClick={action.run}>
      <span className="qi"><Icon name={action.icon} /></span>{action.label}</button>)}
  </div>;
}
