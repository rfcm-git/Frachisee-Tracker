import { useEffect, useRef } from "react";
import Icon from "./Icon.jsx";

/** Select-all box: checked, unchecked or partly checked. */
function SelectAll({ checked, partly, disabled, onChange, label }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = partly; }, [partly]);
  return <label className="dr-all"><input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

/**
 * "Also delete what is not in this file" for spreadsheet imports. Off by default.
 * When turned on it lists every record that would be deleted, each with a checkbox (all ticked) and Select all;
 * only ticked records are deleted.
 * items: [{ key, title, sub, warn }] · enabled / onEnabled: the opt-in · selected (Set of keys) / setSelected.
 */
export default function DeleteReview({ noun, nounPl, items, enabled, onEnabled, selected, setSelected, disabled, note }) {
  if (!items.length) return null;
  const picked = items.filter((item) => selected.has(item.key)).length;
  const toggle = (key, on) => setSelected((current) => {
    const next = new Set(current);
    if (on) next.add(key); else next.delete(key);
    return next;
  });
  const setAll = (on) => setSelected(on ? new Set(items.map((item) => item.key)) : new Set());
  const many = (count) => `${count} ${count === 1 ? noun : nounPl}`;

  return <div className={`warnbox show dr-box${enabled ? " on" : ""}`}><Icon name="trash-2" /><div>
    <label className="dr-opt"><input type="checkbox" checked={enabled} disabled={disabled} onChange={(event) => onEnabled(event.target.checked)} />
      <span><b>Also delete the {many(items.length)} not in this file</b>{note ? <span className="dr-note"> · {note}</span> : null}</span></label>
    {enabled && <>
      <div className="dr-bar">
        <SelectAll checked={picked === items.length} partly={picked > 0 && picked < items.length} disabled={disabled} onChange={setAll}
          label={picked === items.length ? "All selected" : `Select all (${items.length})`} />
        <span className="muted" role="status">{picked} of {items.length} will be deleted</span>
      </div>
      <div className="bk-table bu-table dr-table"><table><thead><tr><th className="dr-col">Delete</th><th>{noun[0].toUpperCase() + noun.slice(1)}</th><th>Also affected</th></tr></thead><tbody>
        {items.map((item) => {
          const on = selected.has(item.key);
          return <tr key={item.key} className={on ? "dr-on" : ""}>
            <td className="dr-col"><input type="checkbox" checked={on} disabled={disabled} aria-label={`Delete ${item.title}`} onChange={(event) => toggle(item.key, event.target.checked)} /></td>
            <td><b>{item.title}</b>{item.sub ? <div className="muted dr-sub">{item.sub}</div> : null}</td>
            <td className={item.warn ? "dr-warn" : "muted"}>{item.warn || "Nothing else"}</td>
          </tr>;
        })}
      </tbody></table></div>
      <div className="dr-foot"><Icon name="shield-check" />Deleting can't be undone from the app. Use <b>Backup first</b> before importing, and the admin password is asked before anything is deleted.</div>
    </>}
  </div></div>;
}
