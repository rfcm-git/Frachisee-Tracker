/* Pickers used in forms: multi-select chips and single-select status buttons. */

/** Multi-select chips. options: string[] or [value, label][] */
export function ChipToggles({ options, selected, onToggle, label }) {
  return <div className="chips" role="group" aria-label={label}>
    {options.map((option) => {
      const [value, text] = Array.isArray(option) ? option : [option, option];
      const on = selected.includes(value);
      return <button type="button" key={value} className={`mchip${on ? " sel" : ""}`} aria-pressed={on} onClick={() => onToggle(value)}>{text}</button>;
    })}
  </div>;
}

/** Single-select buttons (status pickers). */
export function StatusButtons({ options, value, onChange, label }) {
  return <div className="sbtns" role="group" aria-label={label}>
    {options.map((option) => <button type="button" key={option} className={`sbtn${value === option ? " active" : ""}`} aria-pressed={value === option}
      onClick={() => onChange(option)}>{option}</button>)}
  </div>;
}
