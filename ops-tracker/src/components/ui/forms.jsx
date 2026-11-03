// Form controls. Field wires label, hint and error to its control by id so
// screen readers announce them. Errors say what's wrong and how to fix it.
import { cloneElement, forwardRef, useId, useMemo, useRef, useState } from "react";
import { Search, X, Check, ChevronDown } from "lucide-react";
import { cx } from "../../lib/cx.js";

const CONTROL =
  "w-full rounded-lg border bg-surface text-sm text-ink placeholder:text-muted/80 " +
  "transition-[border-color,box-shadow] duration-150 ease-out " +
  "focus:outline-none focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15 " +
  "disabled:bg-subtle disabled:text-muted";
const borderFor = (invalid) => (invalid ? "border-critical" : "border-line-strong hover:border-ink-2/40");

export function Field({ label, hint, error, required, children, className }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const control = cloneElement(children, {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": [errId, hintId].filter(Boolean).join(" ") || undefined,
    "aria-required": required || undefined,
    invalid: error ? true : undefined,
  });
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-critical-ink" aria-hidden>*</span>}
      </label>
      {control}
      {error ? (
        <p id={errId} className="mt-1.5 text-[12px] text-critical-ink">{error}</p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-[12px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ invalid, className, ...rest }, ref) {
  return <input ref={ref} className={cx(CONTROL, borderFor(invalid), "h-9 px-3", className)} {...rest} />;
});

export const Textarea = forwardRef(function Textarea({ invalid, className, rows = 4, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cx(CONTROL, borderFor(invalid), "px-3 py-2 leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef(function Select({ invalid, className, children, ...rest }, ref) {
  return (
    <div className={cx("relative", className)}>
      <select ref={ref} className={cx(CONTROL, borderFor(invalid), "h-9 appearance-none pr-8 pl-3")} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
});

/** Compact select for filter bars: label is visually inline. */
export function FilterSelect({ label, value, onChange, children, className }) {
  const id = useId();
  return (
    <div className={cx("relative inline-flex", className)}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          "h-8 w-full appearance-none rounded-lg border bg-surface pr-7 pl-2.5 text-[13px] font-medium",
          value === "all" || value === "active" ? "border-line-strong text-ink-2" : "border-brand-600/50 bg-brand-50 text-brand-800",
          "focus:outline-none focus:ring-3 focus:ring-brand-600/15",
        )}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}

export const SearchInput = forwardRef(function SearchInput({ value, onChange, label = "Search", placeholder, shortcut, className }, ref) {
  return (
    <div className={cx("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        ref={ref}
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && value && (e.stopPropagation(), onChange(""))}
        placeholder={placeholder}
        className={cx(CONTROL, "h-8 border-line-strong pr-8 pl-8 text-[13px] [&::-webkit-search-cancel-button]:hidden")}
      />
      {value ? (
        <button type="button" onClick={() => onChange("")} className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded text-muted hover:bg-ink/5 hover:text-ink" aria-label="Clear search">
          <X className="size-3.5" aria-hidden />
        </button>
      ) : shortcut ? (
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-line px-1 text-[11px] text-muted" aria-hidden>{shortcut}</span>
      ) : null}
    </div>
  );
});

export function Switch({ checked, onChange, label, description, disabled }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
        {description && <p id={`${id}-d`} className="text-[13px] text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-200 ease-out disabled:opacity-50",
          checked ? "bg-brand-600" : "bg-line-strong",
        )}
      >
        <span className={cx("inline-block size-5 rounded-full bg-white shadow transition-transform duration-200 ease-out", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
    </div>
  );
}

/**
 * Segmented control (single choice). Arrow keys move the selection, like a
 * radio group.
 */
export function Segmented({ label, options, value, onChange, size = "sm" }) {
  const refs = useRef([]);
  function onKeyDown(e, i) {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + options.length) % options.length;
    onChange(options[next].id);
    refs.current[next]?.focus();
  }
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line-strong bg-subtle p-0.5">
      {options.map((o, i) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              "rounded-md px-2.5 font-medium transition-[background-color,color,box-shadow] duration-150 ease-out",
              size === "sm" ? "h-7 text-[13px]" : "h-8 text-sm",
              active ? "bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Searchable single-select (ARIA combobox pattern). Type to filter, arrows to
 * move, Enter to choose, Esc to close.
 */
export const Combobox = forwardRef(function Combobox(
  { options, value, onChange, placeholder = "Search…", invalid, id, renderOption, ...aria },
  ref,
) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? options.filter((o) => o.search.toLowerCase().includes(q)) : options).slice(0, 50);
  }, [options, query]);

  function choose(o) {
    onChange(o.value);
    setQuery("");
    setOpen(false);
  }
  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open && filtered[active]) {
      e.preventDefault();
      choose(filtered[active]);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
    }
  }
  return (
    <div className="relative">
      <input
        ref={ref}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
        value={open ? query : selected?.label ?? ""}
        placeholder={selected ? selected.label : placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        className={cx(CONTROL, borderFor(invalid), "h-9 pr-8 pl-3")}
        {...aria}
      />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
      {open && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full animate-fade-in overflow-auto rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow-pop)]">
          {filtered.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">No matches. Try a store number or city.</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
              onMouseEnter={() => setActive(i)}
              className={cx("flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[13px]", i === active && "bg-brand-50")}
            >
              <span className="min-w-0 truncate">{renderOption ? renderOption(o) : o.label}</span>
              {o.value === value && <Check className="size-4 shrink-0 text-brand-600" aria-hidden />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
