import { useState } from "react";
import Icon from "./Icon.jsx";

/** Page number box; remounted (key) when the page changes. */
function PageInput({ page, onGo }) {
  const [draft, setDraft] = useState(String(page));
  return <input className="pgin" value={draft} title="Type a page number, then Enter" aria-label="Page number"
    onChange={(event) => setDraft(event.target.value)}
    onKeyDown={(event) => { if (event.key === "Enter") { onGo(draft); event.currentTarget.blur(); } }}
    onBlur={() => { if (draft !== String(page)) onGo(draft); }} />;
}

/**
 * Pager with page size, range and page navigation.
 * Hidden when everything fits on the smallest page size.
 */
export default function Pagination({ page, pageSize, pageOptions, pageCount, count, onPage, onPageSize, style }) {
  if (count <= pageOptions[0] && pageCount <= 1) return null;

  const from = count ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(count, page * pageSize);
  const go = (target) => {
    const value = parseInt(target, 10);
    onPage(Number.isNaN(value) ? 1 : Math.min(pageCount, Math.max(1, value)));
  };

  return (
    <div className="pager" style={style}>
      <label className="pg-size" title="Items per page">Show <select value={pageSize} onChange={(event) => onPageSize(event.target.value)}>
        {pageOptions.map((size) => <option key={size} value={size}>{size}</option>)}
      </select><span className="pg-range">{from}{"–"}{to} of {count}</span></label>
      {pageCount > 1 && <div className="pg-nav">
        <button type="button" className="pico" title="Start" disabled={page <= 1} onClick={() => go(1)}><Icon name="chevrons-left" /></button>
        <button type="button" className="pico" title="Previous" disabled={page <= 1} onClick={() => go(page - 1)}><Icon name="chevron-left" /></button>
        <span className="pg"><PageInput key={page} page={page} onGo={go} /> / {pageCount}</span>
        <button type="button" className="pico" title="Next" disabled={page >= pageCount} onClick={() => go(page + 1)}><Icon name="chevron-right" /></button>
        <button type="button" className="pico" title="End" disabled={page >= pageCount} onClick={() => go(pageCount)}><Icon name="chevrons-right" /></button>
      </div>}
    </div>
  );
}
