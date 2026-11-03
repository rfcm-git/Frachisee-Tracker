// Status vocabulary. Every status shows an icon + label, never color alone.
import {
  CircleAlert, TriangleAlert, CircleDot, Circle, Clock, Hourglass, CircleCheck,
  Wifi, CirclePause, WifiOff, CircleOff, ShieldCheck, Eye, Activity,
} from "lucide-react";
import { PLATFORM_BY_ID, SEVERITY_BY_ID, STATUS_BY_ID, ROLE_BY_ID } from "../../lib/constants.js";
import { cx } from "../../lib/cx.js";

const TONE = {
  critical: "bg-critical-bg text-critical-ink",
  serious: "bg-serious-bg text-serious-ink",
  warning: "bg-warning-bg text-warning-ink",
  good: "bg-good-bg text-good-ink",
  info: "bg-info-bg text-info-ink",
  neutral: "bg-ink/[0.06] text-ink-2",
  brand: "bg-brand-50 text-brand-700",
};

export function Pill({ tone = "neutral", icon: Icon, children, className, title }) {
  return (
    <span title={title} className={cx("inline-flex h-6 items-center gap-1 rounded-full px-2 text-[12px] font-medium whitespace-nowrap", TONE[tone], className)}>
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
      {children}
    </span>
  );
}

const SEVERITY_STYLE = {
  critical: { tone: "critical", icon: CircleAlert },
  high: { tone: "serious", icon: TriangleAlert },
  medium: { tone: "warning", icon: CircleDot },
  low: { tone: "neutral", icon: Circle },
};
export function SeverityBadge({ severity }) {
  const s = SEVERITY_STYLE[severity];
  return <Pill tone={s.tone} icon={s.icon}>{SEVERITY_BY_ID[severity].label}</Pill>;
}

const STATUS_STYLE = {
  open: { tone: "info", icon: CircleDot },
  in_progress: { tone: "brand", icon: Clock },
  waiting: { tone: "warning", icon: Hourglass },
  resolved: { tone: "good", icon: CircleCheck },
};
export function StatusBadge({ status }) {
  const s = STATUS_STYLE[status];
  return <Pill tone={s.tone} icon={s.icon}>{STATUS_BY_ID[status].label}</Pill>;
}

const HEALTH = {
  good: { tone: "good", icon: ShieldCheck, label: "Healthy" },
  watch: { tone: "warning", icon: Eye, label: "Watch" },
  critical: { tone: "critical", icon: Activity, label: "At risk" },
};
export function HealthBadge({ level }) {
  const h = HEALTH[level];
  return <Pill tone={h.tone} icon={h.icon}>{h.label}</Pill>;
}

const CONNECTION = {
  online: { tone: "good", icon: Wifi, label: "Online" },
  paused: { tone: "warning", icon: CirclePause, label: "Paused" },
  offline: { tone: "critical", icon: WifiOff, label: "Offline" },
  not_listed: { tone: "neutral", icon: CircleOff, label: "Not listed" },
  connected: { tone: "good", icon: Wifi, label: "Connected" },
  degraded: { tone: "warning", icon: TriangleAlert, label: "Degraded" },
  disconnected: { tone: "critical", icon: WifiOff, label: "Disconnected" },
};
export function ConnectionBadge({ status }) {
  const c = CONNECTION[status] ?? CONNECTION.not_listed;
  return <Pill tone={c.tone} icon={c.icon}>{c.label}</Pill>;
}

export function RoleBadge({ role }) {
  return <Pill tone={role === "admin" ? "brand" : "neutral"}>{ROLE_BY_ID[role]?.label ?? role}</Pill>;
}

/**
 * Logo stand-in: a monogram tile in the platform's chart color, so the logo
 * and the chart legend share one identity. Replace with official artwork by
 * adding /public/logos/<id>.svg and setting USE_LOGO_FILES = true.
 */
const USE_LOGO_FILES = false;
export function PlatformLogo({ id, size = "md" }) {
  const p = PLATFORM_BY_ID[id];
  const dim = size === "sm" ? "size-5 text-[9px] rounded" : size === "lg" ? "size-9 text-[12px] rounded-lg" : "size-6 text-[10px] rounded-md";
  if (USE_LOGO_FILES) return <img src={`/logos/${id}.svg`} alt="" className={dim} />;
  return (
    <span aria-hidden className={cx("inline-grid shrink-0 place-items-center font-bold tracking-tight text-white", dim)} style={{ background: p.strong }}>
      {p.short}
    </span>
  );
}

export function PlatformTag({ id, size }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <PlatformLogo id={id} size={size ?? "sm"} />
      <span>{PLATFORM_BY_ID[id].name}</span>
    </span>
  );
}
