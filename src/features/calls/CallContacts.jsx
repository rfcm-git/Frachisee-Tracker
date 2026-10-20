import Icon from "../../components/ui/Icon.jsx";
import { CopyButton } from "../../components/ui/common.jsx";
import { franchiseeContactBits } from "../../domain/calls.js";
import { telHref } from "../../lib/format.js";

/** Phone and email links of a franchisee. variant "row" (table cell) or "detail" (dialogs, with copy buttons). */
export default function CallContacts({ ctx, franchiseeId, variant = "detail", emptyText }) {
  const { phones, emails } = franchiseeContactBits(ctx, franchiseeId);
  if (variant === "row") {
    if (!phones.length && !emails.length) return <small className="cl-nocon">No contact saved</small>;
    return <div className="cl-con">
      {phones.slice(0, 2).map((phone) => <a key={phone} href={telHref(phone)} onClick={(event) => event.stopPropagation()} data-tip={`Call ${phone}`}><Icon name="phone" />{phone}</a>)}
      {emails.slice(0, 2).map((email) => <a key={email} href={`mailto:${email}`} onClick={(event) => event.stopPropagation()} data-tip={`Email ${email}`}><Icon name="mail" /><span>{email}</span></a>)}
    </div>;
  }
  const items = [...phones.map((value) => ({ type: "phone", value, href: telHref(value), action: "Call" })), ...emails.map((value) => ({ type: "email", value, href: `mailto:${value}`, action: "Email" }))];
  if (!items.length) return <span className="muted" style={{ fontSize: 12.5 }}>{emptyText}</span>;
  return items.map((item, index) => <span className="clv-ci" key={`${item.type}-${index}`}>
    <Icon name={item.type === "phone" ? "phone" : "mail"} /><a href={item.href} data-tip={`${item.action} ${item.value}`}>{item.value}</a><CopyButton value={item.value} />
  </span>);
}
