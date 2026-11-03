// Modal / Drawer (focus-trapped dialogs), Menu (keyboard dropdown) and Toasts.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, CircleCheck, CircleAlert, Info } from "lucide-react";
import { cx } from "../../lib/cx.js";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";

/**
 * Dialog. variant="center" (forms, confirmations) or "drawer" (detail
 * panels that keep the list visible behind). Esc and the backdrop close it;
 * focus returns to the control that opened it.
 */
export function Modal({ open, onClose, title, description, children, footer, variant = "center", size = "md", labelledBy }) {
  const ref = useRef(null);
  const titleId = useId();
  const descId = useId();
  useFocusTrap(ref, onClose, open);
  if (!open) return null;
  const drawer = variant === "drawer";
  return createPortal(
    <div className={cx("fixed inset-0 z-50 flex", drawer ? "justify-end" : "items-end justify-center p-0 sm:items-center sm:p-6")}>
      <div className="absolute inset-0 animate-fade-in bg-ink/30" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(
          "relative flex max-h-full flex-col bg-surface shadow-[var(--shadow-pop)] outline-none",
          drawer
            ? "h-full w-full max-w-[640px] animate-slide-in-right border-l border-line"
            : cx("w-full animate-pop-in rounded-t-2xl sm:rounded-2xl", size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg", "max-h-[92vh]"),
        )}
      >
        {title && (
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 id={titleId} className="text-base font-semibold text-ink">{title}</h2>
              {description && <p id={descId} className="mt-0.5 text-[13px] text-muted">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="-mr-1.5 grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink" aria-label="Close">
              <X className="size-4" aria-hidden />
            </button>
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-subtle px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Dropdown menu (ARIA menu button). Arrows/Home/End move, Enter/Space
 * activate, Esc closes and returns focus to the trigger.
 * items: [{ label, icon, onSelect, href, danger, divider, hint }]
 */
export function Menu({ trigger, items, align = "end", label }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const btnRef = useRef(null);
  const listRef = useRef(null);
  const menuId = useId();
  const actionable = items.filter((i) => !i.divider && !i.header);

  useLayoutEffect(() => {
    if (open) listRef.current?.querySelectorAll("[role=menuitem]")[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => !btnRef.current?.contains(e.target) && !listRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function close(refocus = true) {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }
  function onKeyDown(e) {
    const n = actionable.length;
    if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => (a + 1) % n));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => (a - 1 + n) % n));
    else if (e.key === "Home") (e.preventDefault(), setActive(0));
    else if (e.key === "End") (e.preventDefault(), setActive(n - 1));
    else if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), close());
    else if (e.key === "Tab") close(false);
  }
  function openWith(index) {
    setActive(index);
    setOpen(true);
  }

  // Position of each actionable item among actionable items (dividers/headers skipped).
  const actionIndex = items.map((_, i) => items.slice(0, i).filter((x) => !x.divider && !x.header).length);
  return (
    <div className="relative">
      {trigger({
        ref: btnRef,
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": open ? menuId : undefined,
        "aria-label": label,
        onClick: () => (open ? close(false) : openWith(0)),
        onKeyDown: (e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), openWith(0));
          if (e.key === "ArrowUp") (e.preventDefault(), openWith(actionable.length - 1));
        },
      })}
      {open && (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className={cx(
            "absolute z-40 mt-1.5 min-w-56 origin-top animate-pop-in rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-pop)]",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, i) => {
            if (item.divider) return <div key={`d${i}`} role="separator" className="my-1 h-px bg-line" />;
            if (item.header) return <div key={`h${i}`} className="px-2.5 pt-1.5 pb-1">{item.header}</div>;
            const idx = actionIndex[i];
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={idx === active ? 0 : -1}
                onMouseEnter={() => setActive(idx)}
                onClick={() => {
                  close(!item.keepFocusAway);
                  item.onSelect?.();
                }}
                className={cx(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] outline-none",
                  "focus:bg-ink/5",
                  item.danger ? "text-critical-ink" : "text-ink",
                )}
              >
                {Icon && <Icon className="size-4 shrink-0 text-muted" aria-hidden />}
                <span className="flex-1">{item.label}</span>
                {item.hint && <span className="text-[11px] text-muted">{item.hint}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const TOAST_ICON = { success: CircleCheck, error: CircleAlert, info: Info };
const TOAST_TONE = { success: "text-good-ink", error: "text-critical-ink", info: "text-info-ink" };

export function ToastViewport({ toasts, dismiss }) {
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => {
        const Icon = TOAST_ICON[t.type];
        return (
          <div key={t.id} role={t.type === "error" ? "alert" : "status"} className="pointer-events-auto flex animate-pop-in items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-[var(--shadow-pop)]">
            <Icon className={cx("mt-0.5 size-5 shrink-0", TOAST_TONE[t.type])} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{t.title}</p>
              {t.body && <p className="mt-0.5 text-[13px] text-muted">{t.body}</p>}
              {t.action && (
                <button type="button" onClick={() => (t.action.onClick(), dismiss(t.id))} className="mt-1.5 text-[13px] font-semibold text-brand-700 hover:underline">
                  {t.action.label}
                </button>
              )}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} className="-mr-1 grid size-6 place-items-center rounded text-muted hover:bg-ink/5" aria-label="Dismiss notification">
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
