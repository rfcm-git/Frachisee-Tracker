/* "Needs action today": the team's work list — filter by type, sort by urgency or date, paged. */
import { useMemo, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import { usePaged } from "../../hooks/usePaged.js";
import { openCallFollowUp, openCapForm, openStore, openUpdateIssue } from "../../state/dialogs.js";
import { setPage } from "../../state/uiStore.js";
import { sendOnboardingEmail } from "../onboarding/onboardingEmailActions.js";
import { sendWalmartEmail } from "../walmart/walmartEmailActions.js";
import { ACTION_TYPES, OLD_ISSUE_DAYS, actionCounts } from "./needsAction.js";

const TYPE = Object.fromEntries(ACTION_TYPES.map(([key, label, icon]) => [key, { label, icon }]));
const RUN = { cap: openCapForm, followup: openCallFollowUp, issue: openUpdateIssue, obEmail: sendOnboardingEmail, wmEmail: sendWalmartEmail };
const SEVERITY_ICON = { critical: "triangle-alert", warning: "alarm-clock" };

export function NeedsActionCard({ ctx, items }) {
  const [type, setType] = useState("");
  const [sort, setSort] = useState({ key: "urgency", dir: 1 });
  const counts = useMemo(() => actionCounts(items), [items]);
  const rows = useMemo(() => {
    const list = type ? items.filter((item) => item.type === type) : items;
    if (sort.key === "urgency") return sort.dir > 0 ? list : list.slice().reverse();
    return list.slice().sort((a, b) => (a.sortTime - b.sortTime) * sort.dir);
  }, [items, type, sort]);
  const { items: shown, pagerProps } = usePaged("na", rows);

  const pick = (value) => { setType(value); setPage("na", 1); };
  const sortBy = (key) => setSort((current) => ({ key, dir: current.key === key ? -current.dir : 1 }));
  const sortIcon = (key) => (sort.key === key ? (sort.dir > 0 ? "arrow-up" : "arrow-down") : "arrow-down-up");

  return <section className="dc-card na-card" aria-labelledby="na-title">
    <header className="dc-h">
      <div><h3 id="na-title">Needs action today</h3><span>Overdue and due CAPs, call follow-ups due, issues open {OLD_ISSUE_DAYS}+ days, and onboarding stores not emailed yet</span></div>
    </header>
    <div className="na-chips" role="group" aria-label="Show">
      <button type="button" className={`na-chip${!type ? " on" : ""}`} aria-pressed={!type} onClick={() => pick("")}>All <b>{items.length.toLocaleString()}</b></button>
      {ACTION_TYPES.map(([key, label, icon]) => <button type="button" key={key} className={`na-chip${type === key ? " on" : ""}${counts[key] ? "" : " zero"}`} aria-pressed={type === key}
        onClick={() => pick(type === key ? "" : key)}><Icon name={icon} />{label} <b>{counts[key].toLocaleString()}</b></button>)}
    </div>
    {!rows.length ? <div className="dc-empty"><Icon name="circle-check" />{items.length ? "Nothing of this type needs action." : "Nothing needs action right now."}</div> : <>
      <div style={{ overflowX: "auto" }}><table className="is-table na-table"><thead><tr>
        <th className="na-type"><button type="button" className={sort.key === "urgency" ? "on" : ""} onClick={() => sortBy("urgency")} data-tip="Most urgent first">Type<Icon name={sortIcon("urgency")} /></button></th>
        <th>Store #</th><th className="hide-sm">Franchisee</th><th>What's needed</th>
        <th className="na-when"><button type="button" className={sort.key === "date" ? "on" : ""} onClick={() => sortBy("date")} data-tip="Sort by due date or age">Due / age<Icon name={sortIcon("date")} /></button></th>
        <th className="c-act"><span className="sr-only">Action</span></th>
      </tr></thead><tbody>
        {shown.map((item) => {
          const store = item.num ? ctx.storeByNum.get(item.num) : null;
          return <tr key={item.key}>
            <td className="na-type"><span className={`na-badge t-${item.type}`}><Icon name={TYPE[item.type].icon} />{TYPE[item.type].label}</span></td>
            <td>{store ? <button type="button" className="ob-snum" data-tip="Open store information" onClick={() => openStore(store.id)}>{item.num}</button> : item.num || <span className="muted">—</span>}</td>
            <td className="hide-sm">{item.franchisee || <span className="muted">—</span>}</td>
            <td className="na-what"><b>{item.what}</b>{item.detail && <span>{item.detail}</span>}</td>
            <td className={`na-when ${item.severity}`} data-tip={item.whenTip}>{SEVERITY_ICON[item.severity] && <Icon name={SEVERITY_ICON[item.severity]} />}{item.when}</td>
            <td className="c-act"><button type="button" className="btn sm outline round na-go" onClick={() => RUN[item.action.kind](item.action.id)}>
              <Icon name={item.action.kind.endsWith("Email") ? "send" : "arrow-right"} />{item.action.label}</button></td>
          </tr>;
        })}
      </tbody></table></div>
      <Pagination {...pagerProps} />
    </>}
  </section>;
}
