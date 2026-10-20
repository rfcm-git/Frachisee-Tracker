import Icon from "../../components/ui/Icon.jsx";
import { copyText, toast } from "../../state/toastStore.js";
import { formatPhone } from "../../lib/format.js";

const TYPES = [["email", "Email"], ["cell", "Cell"], ["other", "Other"]];
const typeIcon = (type) => (type === "email" ? "mail" : type === "cell" ? "phone" : "tag");
const placeholderFor = (type) => (type === "email" ? "name@email.com" : type === "cell" ? "(555) 123-4567" : "Value");

/** Editable list of contacts: rows = [{ key, type, value }]. */
export default function ContactEditor({ rows, onChange }) {
  const update = (key, patch) => onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return <div>
    {rows.map((row) => <div className="c-edit-row" key={row.key}>
      <span className="cico"><Icon name={typeIcon(row.type)} /></span>
      <select className="ctype" value={row.type} aria-label="Contact type"
        onChange={(event) => { const type = event.target.value; update(row.key, { type, value: type === "cell" ? formatPhone(row.value) : row.value }); }}>
        {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <input className="cval" value={row.value} placeholder={placeholderFor(row.type)} aria-label="Contact value"
        onChange={(event) => update(row.key, { value: row.type === "cell" ? formatPhone(event.target.value) : event.target.value })} />
      <button type="button" className="iconbtn mini" title="Copy" aria-label="Copy"
        onClick={() => { const value = row.value.trim(); if (!value) toast("Nothing to copy", "err"); else copyText(value); }}><Icon name="copy" /></button>
      <button type="button" className="iconbtn mini" title="Remove" aria-label="Remove contact" onClick={() => onChange(rows.filter((item) => item.key !== row.key))}><Icon name="x" /></button>
    </div>)}
  </div>;
}
