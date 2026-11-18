import { useEffect, useRef } from "react";
import Icon from "./Icon.jsx";

/** Select-all box: checked, unchecked or partly checked. */
function SelectAll({ checked, partly, disabled, onChange, label }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = partly; }, [partly]);
  return <label className="dr-all"><input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

/**
 * "Not in this file — will be deleted" for spreadsheet imports. The imported list is the source of truth,
 * so everything not in it is ticked for deletion by default; the user can untick exceptions (kept).
 * items: [{ key, title, sub, warn }] · kept (Set of keys the user unticked) / setKept.
 * Two lists can share one kept set: each only changes its own items.
 */
export default function DeleteReview({ noun, nounPl, items, kept, setKept, disabled, note }) {
  if (!items.length) return null;
  const picked = items.length - items.filter((item) => kept.has(item.key)).length;
  const keep = (key, on) => setKept((current) => {
    const next = new Set(current);
    if (on) next.add(key); else next.delete(key);
    return next;
  });
  const setAll = (on) => setKept((current) => {
    const next = new Set(current);
    items.forEach((item) => (on ? next.delete(item.key) : next.add(item.key)));
    return next;
  });
  const many = (count) => `${count} ${count === 1 ? noun : nounPl}`;

  return <div className={`warnbox show dr-box${picked ? " on" : ""}`}><Icon name="trash-2" /><div>
    <div className="dr-opt"><span><b>{many(items.length)} not in this file {items.length === 1 ? "is" : "are"} deleted</b>
      {note ? <span className="dr-note"> · {note}</span> : null}</span></div>
    <div className="dr-help">Your imported list is the source of truth, so these are deleted to match it. Untick anything you want to keep.</div>
    <div className="dr-bar">
      <SelectAll checked={picked === items.length} partly={picked > 0 && picked < items.length} disabled={disabled} onChange={setAll}
        label={picked === items.length ? "All selected" : `Select all (${items.length})`} />
      <span className="muted" role="status">{picked} of {items.length} will be deleted{picked < items.length ? ` · ${items.length - picked} kept` : ""}</span>
    </div>
    <div className="bk-table bu-table dr-table"><table><thead><tr><th className="dr-col">Delete</th><th>{noun[0].toUpperCase() + noun.slice(1)}</th><th>Also affected</th></tr></thead><tbody>
      {items.map((item) => {
        const on = !kept.has(item.key);
        return <tr key={item.key} className={on ? "dr-on" : ""}>
          <td className="dr-col"><input type="checkbox" checked={on} disabled={disabled} aria-label={`Delete ${item.title}`} onChange={(event) => keep(item.key, !event.target.checked)} /></td>
          <td><b>{item.title}</b>{item.sub ? <div className="muted dr-sub">{item.sub}</div> : null}</td>
          <td className={item.warn ? "dr-warn" : "muted"}>{item.warn || "Nothing else"}</td>
        </tr>;
      })}
    </tbody></table></div>
    <div className="dr-foot"><Icon name="shield-check" />Deleting can't be undone from the app. Use <b>Backup first</b> before importing; the admin password is asked before anything is deleted.</div>
  </div></div>;
}
