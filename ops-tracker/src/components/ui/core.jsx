// Core building blocks: Button, Card, Skeleton, EmptyState, Kbd, Avatar,
// Spinner, Delta. Documented in docs/COMPONENTS.md.
import { forwardRef } from "react";
import { LoaderCircle, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { initials, pctChange } from "../../lib/format.js";

import { cx } from "../../lib/cx.js";

const BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap select-none " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out " +
  "active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none";
const BTN_VARIANT = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-[inset_0_-1px_0_rgb(0_0_0/0.12)]",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-subtle hover:border-ink-2/40",
  ghost: "text-ink-2 hover:bg-ink/5 hover:text-ink",
  danger: "bg-surface text-critical-ink border border-critical/40 hover:bg-critical-bg",
};
const BTN_SIZE = { sm: "h-8 px-2.5 text-[13px]", md: "h-9 px-3.5 text-sm", icon: "h-9 w-9", iconSm: "h-8 w-8" };

export const Button = forwardRef(function Button(
  { variant = "secondary", size = "md", icon: Icon, loading = false, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className)} disabled={loading || rest.disabled} aria-busy={loading || undefined} {...rest}>
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
});

export function Card({ as: As = "section", className, children, ...rest }) {
  return (
    <As className={cx("min-w-0 rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]", className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, subtitle, actions, id, className }) {
  return (
    <div className={cx("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}

export function EmptyState({ icon: Icon, title, children, action, className }) {
  return (
    <div className={cx("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {Icon && (
        <div className="mb-3 grid size-11 place-items-center rounded-full bg-brand-50 text-brand-600">
          <Icon className="size-5" aria-hidden />
        </div>
      )}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {children && <p className="mt-1 max-w-sm text-[13px] text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-10 text-center">
      <p className="font-semibold text-critical-ink">Couldn&apos;t load this data</p>
      <p className="mt-1 max-w-sm text-[13px] text-muted">{error?.message || "The data source didn't respond."} Check your connection and try again.</p>
      {onRetry && <Button className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Kbd({ children }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-subtle px-1 font-sans text-[11px] font-medium text-ink-2">{children}</kbd>;
}

const AVATAR_TINTS = ["bg-brand-100 text-brand-800", "bg-info-bg text-info-ink", "bg-warning-bg text-warning-ink", "bg-serious-bg text-serious-ink", "bg-[#efeafc] text-[#4a3aa7]"];
export function Avatar({ name, size = "md" }) {
  const tint = AVATAR_TINTS[(name || "").length % AVATAR_TINTS.length];
  const dim = size === "sm" ? "size-6 text-[10px]" : size === "lg" ? "size-10 text-sm" : "size-8 text-xs";
  return (
    <span className={cx("inline-grid shrink-0 place-items-center rounded-full font-semibold", tint, dim)} aria-hidden>
      {initials(name) || "?"}
    </span>
  );
}

export function Spinner({ label = "Loading" }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-muted">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * Signed change vs. the previous period. Color = direction x whether up is
 * good, always with an arrow icon and text so it never relies on color.
 */
export function Delta({ value, prev, goodWhen = "up", format = (v) => `${(Math.abs(v) * 100).toFixed(1)}%`, mode = "pct", className }) {
  const change = mode === "pct" ? pctChange(value, prev) : value - prev;
  if (change == null || Number.isNaN(change)) return <span className={cx("text-[12px] text-muted", className)}>No prior data</span>;
  const flat = Math.abs(change) < 0.0005;
  const up = change > 0;
  const good = flat ? null : (up && goodWhen === "up") || (!up && goodWhen === "down");
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const tone = flat ? "text-muted" : good ? "text-good-ink" : "text-critical-ink";
  return (
    <span className={cx("inline-flex items-center gap-0.5 text-[12px] font-medium tnum", tone, className)}>
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{flat ? "Unchanged" : up ? "Up" : "Down"}</span>
      {flat ? "0.0%" : format(change)}
    </span>
  );
}
