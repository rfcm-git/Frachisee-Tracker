/* Small shared building blocks: buttons, empty states and badges. */
import Icon from "./Icon.jsx";
import { copyText } from "../../state/toastStore.js";
import { CALL_OUTCOME_CLASS, ISSUE_STATES, PLATFORMS_UI, PLATFORM_SHORT } from "../../config/constants.js";
import { callFollowUpDue } from "../../domain/calls.js";
import { capDueState, capDueText, capStatusClass, formatDueDate, normalizeCapStatus } from "../../domain/caps.js";
import { issueStatusClass, shortStatus, statusCounts } from "../../domain/issues.js";
import { obPlatformName, obStatusClass, obStatusLabel } from "../../domain/onboarding.js";
import { platformChipClass, platformStatus, storeStatusClass } from "../../domain/records.js";
import { formatTimestamp } from "../../lib/format.js";

export function CopyButton({ value, title = "Copy" }) {
  return <button type="button" className="iconbtn mini" title={title} aria-label={title} onClick={(event) => { event.stopPropagation(); copyText(value); }}><Icon name="copy" /></button>;
}

/** Card with a centered icon, title and message. */
export function EmptyState({ icon, title, children, error = false, actions = null }) {
  return <div className="card"><div className={`state${error ? " error" : ""}`}>
    <div className="ic"><Icon name={icon} /></div><b>{title}</b>{children && <p>{children}</p>}
    {actions && <div className="cta">{actions}</div>}
  </div></div>;
}

export function LoadingState({ text = "Loading…" }) {
  return <div className="card"><div className="state"><div className="spinner" /><b>{text}</b></div></div>;
}

/** Red dot shown next to stores/franchisees with open issues. */
export function OpenIssueDot({ count }) {
  return count ? <span className="idot" title={`${count} issue${count > 1 ? "s" : ""} pending / not resolved`} /> : null;
}

export function IssueStatusBadge({ status, title }) {
  if (!status) return null;
  return <span className={`badge ${issueStatusClass(status)}`} title={title}>{status}</span>;
}

/** Status badge for one issue, or "Mixed" with counts for a multi-store issue. */
export function GroupStatusBadge({ items }) {
  const counts = statusCounts(items);
  const keys = ISSUE_STATES.filter((status) => counts[status]);
  if (keys.length === 1) return <span className={`badge ${issueStatusClass(keys[0])}`}>{keys[0]}</span>;
  const detail = keys.map((key) => `${counts[key]} ${shortStatus(key)}`).join(" · ");
  return <><span className="badge b-progress" title={detail}>Mixed</span><div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{detail}</div></>;
}

/** Short faded preview of a rich-text description; click or Enter opens the full details. */
export function DescPreview({ html, onOpen }) {
  const open = (event) => { event.stopPropagation(); event.preventDefault(); onOpen(); };
  return <div className="dpv" role="button" tabIndex={0} aria-label="Show the full issue details" onClick={open}
    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") open(event); }}>
    <div className="dpv-txt rt" dangerouslySetInnerHTML={{ __html: html }} />
    <span className="dpv-hint" aria-hidden="true"><Icon name="maximize-2" />Click to view all</span>
  </div>;
}

export function IssueNumber({ number, suffix = "" }) {
  return number ? <span className="ino" title="Issue number">#{number}{suffix}</span> : null;
}

export function StoreStatusBadge({ status, small = true }) {
  return <span className={`sst ${storeStatusClass(status)}${small ? " sm" : ""}`} title={`Store status: ${status}`}><span className="d" />{status}</span>;
}

/** Store status badge only when the store is not open. */
export function StoreStatusIfClosed({ status }) {
  return status === "Open" ? null : <StoreStatusBadge status={status} />;
}

/** UE / DD / GH / EZ chips colored by status. */
export function PlatformChips({ store }) {
  return <div className="plat">{PLATFORMS_UI.map(([key, name]) => {
    const status = platformStatus(store, key);
    return <span key={key} className={`chip ${platformChipClass(status)}`} title={`${name}: ${status}`}>{PLATFORM_SHORT[key]}</span>;
  })}</div>;
}

export function ObStatusBadge({ status }) {
  return <span className={`badge ${obStatusClass(status)}`}>{obStatusLabel(status)}</span>;
}

export function CapStatusBadge({ status }) {
  const value = normalizeCapStatus(status);
  return <span className={`badge ${capStatusClass(value)}`}>{value}</span>;
}

const CAP_DUE_ICONS = { overdue: "triangle-alert", today: "alarm-clock", soon: "calendar-clock", later: "calendar", done: "calendar-check" };

/** Due date state of a CAP: "Overdue by 3 days", "Due today", "Due in 2 days"… Completed CAPs show the date only. */
export function CapDueBadge({ record }) {
  const state = capDueState(record);
  if (state === "none") return null;
  const text = state === "done" ? formatDueDate(record.due_date) : capDueText(record);
  return <span className={`cap-due ${state}`} data-tip={`Submission due ${formatDueDate(record.due_date)}`}><Icon name={CAP_DUE_ICONS[state]} />{text}</span>;
}

export function ObPlatformTag({ platform }) {
  return <span className={`ob-plat p-${platform}`}>{obPlatformName(platform)}</span>;
}

export function CallOutcomeBadge({ outcome, emptyText = null }) {
  if (!outcome) return emptyText ? <span className="muted">{emptyText}</span> : null;
  return <span className={`badge ${CALL_OUTCOME_CLASS[outcome] || ""}`}>{outcome}</span>;
}

/** Follow-up state of a call. With onClick, a scheduled open follow-up opens the follow-up update. */
export function FollowUpBadge({ call, onClick }) {
  if (!call.follow_up) return null;
  if (!call.follow_up_done_at && call.next_follow_up_at) {
    const due = callFollowUpDue(call);
    const label = due ? "Follow-up due" : `Follow-up · ${new Date(call.next_follow_up_at).toLocaleDateString([], { month: "short", day: "numeric" })}`;
    const tip = `${due ? "Follow-up was due " : "Next follow-up "}${formatTimestamp(call.next_follow_up_at)}${onClick ? " — click to add a follow-up update" : ""}`;
    const content = <><Icon name={due ? "bell-ring" : "flag"} />{label}</>;
    return onClick
      ? <button type="button" className={`badge fu-click ${due ? "cl-fu-due" : "cl-fu-open"}`} data-tip={tip}
        onClick={(event) => { event.stopPropagation(); onClick(); }} onKeyDown={(event) => event.stopPropagation()}>{content}</button>
      : <span className={`badge ${due ? "cl-fu-due" : "cl-fu-open"}`} data-tip={tip}>{content}</span>;
  }
  return call.follow_up_done_at
    ? <span className="badge cl-fu-done" data-tip={`Follow-up completed ${formatTimestamp(call.follow_up_done_at)}`}><Icon name="check" />Follow-up done</span>
    : <span className="badge cl-fu-open" data-tip="This call needs a follow-up"><Icon name="flag" />Follow-up</span>;
}

/** Info "i" with a hover tip. */
export function InfoTip({ text }) {
  return <span className="db-i" data-tip={text} tabIndex={0} aria-label={text}><Icon name="info" /></span>;
}

/** Button showing a spinner while busy. */
export function BusyButton({ busy, busyLabel = "Saving…", children, className = "btn", disabled, spinner = true, ...rest }) {
  return <button type="button" className={className} disabled={busy || disabled} {...rest}>
    {busy ? <>{spinner && <span className="spin" />}{busyLabel}</> : children}
  </button>;
}
