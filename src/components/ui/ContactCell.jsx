import Icon from "./Icon.jsx";
import { telHref } from "../../lib/format.js";

/** "(714) 863-8900" never splits across lines. */
const keepPhoneTogether = (value) => String(value || "").replace(/\) (?=\d)/g, ") ").replace(/(\d)-(\d)/g, "$1‑$2");

/**
 * Email and phone in one table cell (CAP, ezCater, Walmart lists): one line each with a small icon.
 * Long emails end in "…"; the tip shows the full value. Clicks on the links don't select the row.
 */
export default function ContactCell({ email, phone, className = "hide-sm cap-contact" }) {
  const stop = (event) => event.stopPropagation();
  return <td className={className}>
    <div className="cap-cline"><Icon name="mail" />{email
      ? <span data-tip={email}><a href={`mailto:${email}`} onClick={stop}>{email}</a></span> : <span className="muted">No email</span>}</div>
    <div className="cap-cline"><Icon name="phone" />{phone
      ? <span><a href={telHref(phone)} onClick={stop}>{keepPhoneTogether(phone)}</a></span> : <span className="muted">No phone</span>}</div>
  </td>;
}
