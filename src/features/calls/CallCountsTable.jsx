import Pagination from "../../components/ui/Pagination.jsx";
import { clickableProps } from "../../components/ui/clickable.js";
import { usePaged } from "../../hooks/usePaged.js";
import { formatCallTime, formatNumber } from "../../lib/format.js";
import { showFranchiseeCalls, showStoreCalls } from "../../state/uiStore.js";

const lastCallText = (ms) => (ms ? formatCallTime(new Date(ms).toISOString()).date : "—");

/** Calls per franchisee or per store (by = "franchisee" | "store"), with an all-total row. Selecting a row shows its calls. */
export default function CallCountsTable({ rows, calls, by }) {
  const { items, pagerProps } = usePaged("cl", rows);
  const maxCalls = Math.max(1, ...rows.map((row) => row.calls));
  const total = {
    calls: calls.length,
    stores: new Set(calls.map((call) => call.store_num).filter(Boolean).map(String)).size,
    answered: rows.reduce((sum, row) => sum + row.answered, 0),
    followUps: rows.reduce((sum, row) => sum + row.followUps, 0),
    lastCall: Math.max(0, ...rows.map((row) => row.lastCall)),
  };
  const isStore = by === "store";

  return <div className="card" style={{ overflowX: "auto" }}>
    <table className="cl-table cl-counts"><thead><tr>
      {isStore ? <><th>Store Number</th><th>Franchisee Name</th></> : <><th>Franchisee Name</th><th className="num" data-tip="Different stores these calls were about">Stores</th></>}
      <th className="num">Calls</th><th className="num" data-tip="Outcome Answered, Requested more info or Completed">Answered</th>
      <th className="num" data-tip="Calls marked “Needs follow-up” that are not done yet">Follow-ups open</th><th>Last call</th>
    </tr></thead><tbody>
      {items.map((row) => {
        const open = isStore ? (row.storeNum ? () => showStoreCalls(row.storeNum) : null) : () => showFranchiseeCalls(row.name);
        const label = isStore ? (row.storeNum ? `store ${row.storeNum}` : "general calls") : row.name;
        return <tr key={row.key} className={open ? "click" : ""} aria-label={open ? `Show calls for ${label}` : undefined} {...(open ? clickableProps(open) : {})}>
          {isStore
            ? <><td className="cl-st">{row.storeNum ? <b>{row.storeNum}</b> : <span className="muted">General / no store</span>}</td><td className="cl-fr">{row.franchisee}</td></>
            : <><td className="cl-fr">{row.name}</td><td className="num">{formatNumber(row.stores)}</td></>}
          <td className="num cl-cnt"><span className="cl-cnt-bar" style={{ width: `${(row.calls / maxCalls) * 100}%` }} /><b>{formatNumber(row.calls)}</b></td>
          <td className="num">{formatNumber(row.answered)}</td>
          <td className="num">{row.followUps ? <b className="cl-fu-n">{formatNumber(row.followUps)}</b> : 0}</td>
          <td>{lastCallText(row.lastCall)}</td>
        </tr>;
      })}
    </tbody><tfoot><tr className="cl-total">
      {isStore
        ? <><td>All stores <span className="muted">({formatNumber(rows.length)})</span></td><td /></>
        : <><td>All franchisees <span className="muted">({formatNumber(rows.length)})</span></td><td className="num">{formatNumber(total.stores)}</td></>}
      <td className="num"><b>{formatNumber(total.calls)}</b></td><td className="num">{formatNumber(total.answered)}</td>
      <td className="num">{formatNumber(total.followUps)}</td><td>{lastCallText(total.lastCall)}</td>
    </tr></tfoot></table>
    <Pagination {...pagerProps} />
  </div>;
}
