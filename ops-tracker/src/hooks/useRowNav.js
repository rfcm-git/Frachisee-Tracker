/**
 * Arrow-key movement between focusable table rows ([data-row]). Enter on a
 * focused row runs `onOpen(row)`.
 */
export function rowKeyDown(e, onOpen) {
  const row = e.currentTarget;
  if (e.key === "Enter") {
    e.preventDefault();
    onOpen();
    return;
  }
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  const rows = [...row.closest("table").querySelectorAll("[data-row]")];
  const i = rows.indexOf(row);
  rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
}
