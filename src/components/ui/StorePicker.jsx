import { useImperativeHandle, useMemo, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { useDataContext } from "../../state/dataStore.js";
import { toast } from "../../state/toastStore.js";
import { franchiseeName, storesOf } from "../../domain/context.js";
import { storeAddressLine } from "../../domain/records.js";
import { findFranchiseesByName, findStoresByNumber } from "../../domain/search.js";
import { compareStores, looksLikeName, splitStoreNumbers } from "../../lib/text.js";

/**
 * Picks several stores: type a store #, paste many, or type a franchisee name and tick their stores.
 * value: string[] of store numbers; onChange(next)
 * ref exposes commitTyped(): adds store numbers still typed in the box (call before saving).
 */
export default function StorePicker({ ref, value, onChange, inputId, autoFocus = true }) {
  const ctx = useDataContext();
  const inputRef = useRef(null);
  const [text, setText] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [pickerFr, setPickerFr] = useState(null);
  const [picked, setPicked] = useState([]);

  function addStores(raw) {
    const bad = [];
    const next = [...value];
    let added = 0;
    splitStoreNumbers(raw).forEach((num) => {
      if (!ctx.storeByNum.has(num)) { bad.push(num); return; }
      if (!next.includes(num)) { next.push(num); added += 1; }
    });
    setText("");
    setSuggestOpen(false);
    if (added) onChange(next);
    if (bad.length) toast(`Not found: ${bad.slice(0, 5).join(", ")}${bad.length > 5 ? "…" : ""}`, "err");
    else if (added) toast(`${added} store${added > 1 ? "s" : ""} added`, "ok");
  }

  function pickFranchisee(id) {
    setPickerFr(id);
    setPicked([]);
    setText("");
    setSuggestOpen(false);
  }

  function submitTyped() {
    const typed = text.trim();
    if (!typed) return;
    if (looksLikeName(typed)) {
      const hits = findFranchiseesByName(ctx, typed);
      if (hits.length) pickFranchisee(hits[0].id);
      else toast("No franchisee found", "err");
    } else {
      addStores(typed);
    }
  }

  useImperativeHandle(ref, () => ({
    /** Adds typed store numbers; returns the updated list. */
    commitTyped() {
      const typed = text.trim();
      if (!typed || looksLikeName(typed)) return value;
      const next = [...value];
      splitStoreNumbers(typed).forEach((num) => { if (ctx.storeByNum.has(num) && !next.includes(num)) next.push(num); });
      setText("");
      onChange(next);
      return next;
    },
    focus: () => inputRef.current?.focus(),
  }));

  const suggestions = useMemo(() => {
    const typed = text.trim();
    if (!typed) return null;
    if (looksLikeName(typed)) {
      const hits = findFranchiseesByName(ctx, typed);
      return { kind: hits.length ? "franchisees" : "none", items: hits };
    }
    const number = typed.replace(/^#/, "");
    if (!number || /[\s,;]/.test(number)) return null;
    const hits = findStoresByNumber(ctx, number, value);
    return hits.length ? { kind: "stores", items: hits } : null;
  }, [ctx, text, value]);

  const pickerFranchisee = pickerFr != null ? ctx.frById.get(pickerFr) : null;
  const pickerStores = pickerFranchisee ? storesOf(ctx, pickerFranchisee.id).slice().sort(compareStores) : [];
  const available = pickerStores.filter((store) => !value.includes(String(store.num))).map((store) => String(store.num));
  const selected = picked.filter((num) => available.includes(num));
  const allSelected = !!available.length && available.every((num) => selected.includes(num));

  function addPicked() {
    if (!selected.length) { toast("Tick at least one store", "err"); return; }
    onChange([...value, ...selected.filter((num) => !value.includes(num))]);
    setPickerFr(null);
    setPicked([]);
    toast(`${selected.length} store${selected.length > 1 ? "s" : ""} added`, "ok");
    inputRef.current?.focus();
  }

  return <>
    <div className="spick">
      <div style={{ display: "flex", gap: 8 }}>
        <input id={inputId} ref={inputRef} placeholder="e.g. 12345 · 12345, 22004 · Agrawal" autoComplete="off" style={{ flex: 1 }} autoFocus={autoFocus}
          value={text}
          onChange={(event) => { setText(event.target.value); setSuggestOpen(true); }}
          onFocus={() => setSuggestOpen(true)}
          onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submitTyped(); } }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text");
            if (!looksLikeName(pasted) && /[\s,;]/.test(pasted.trim())) { event.preventDefault(); addStores(`${text} ${pasted}`); }
          }} />
        <button type="button" className="btn sm outline round" style={{ height: 38 }} onClick={submitTyped}><Icon name="plus" />Add</button>
      </div>
      <div className={`spick-sug${suggestOpen && suggestions ? " show" : ""}`}>
        {suggestions?.kind === "franchisees" && <>
          <div className="sug-h">Franchisees — pick one to choose their stores</div>
          {suggestions.items.map((franchisee) => {
            const count = storesOf(ctx, franchisee.id).length;
            return <div key={franchisee.id} onMouseDown={(event) => event.preventDefault()} onClick={() => pickFranchisee(franchisee.id)}>
              <Icon name="user-round" className="si" /><span className="fn">{franchisee.name}</span><span className="muted">{count} store{count !== 1 ? "s" : ""}</span>
            </div>;
          })}
        </>}
        {suggestions?.kind === "stores" && suggestions.items.map((store) => <div key={store.id} onMouseDown={(event) => event.preventDefault()} onClick={() => addStores(String(store.num))}>
          <b>{store.num}</b><span>{franchiseeName(ctx, store.franchisee_id)} · {store.city || ""}</span>
        </div>)}
        {suggestions?.kind === "none" && <div className="nohit">No franchisee found</div>}
      </div>
    </div>

    {pickerFranchisee && <div className="mfp">
      <div className="mfp-h"><Icon name="user-round" /><b>{pickerFranchisee.name}</b>
        <span className="muted">· {pickerStores.length} store{pickerStores.length !== 1 ? "s" : ""}</span>
        <button type="button" className="iconbtn mini" style={{ marginLeft: "auto" }} title="Close" aria-label="Close" onClick={() => setPickerFr(null)}><Icon name="x" /></button>
      </div>
      <label className="mfp-row all"><span>Select all available</span>
        <input type="checkbox" checked={allSelected} disabled={!available.length}
          ref={(element) => { if (element) element.indeterminate = selected.length > 0 && !allSelected; }}
          onChange={(event) => setPicked(event.target.checked ? available : [])} /></label>
      <div className="mfp-list">{pickerStores.map((store) => {
        const num = String(store.num);
        const added = value.includes(num);
        return <label className={`mfp-row${added ? " added" : ""}`} key={store.id}>
          <span className="n">{num}</span><span className="a">{storeAddressLine(store)}</span>{added && <span className="mfp-tag">Added</span>}
          <input type="checkbox" className="mfp-ck" checked={added || selected.includes(num)} disabled={added}
            onChange={(event) => setPicked(event.target.checked ? [...new Set([...picked, num])] : picked.filter((item) => item !== num))} />
        </label>;
      })}</div>
      <div className="mfp-f"><span className="help" style={{ margin: 0 }}>{selected.length} selected</span>
        <button type="button" className="btn sm round" onClick={addPicked} disabled={!selected.length}><Icon name="plus" />Add selected stores</button></div>
    </div>}

    <div className="schips">{value.map((num) => {
      const store = ctx.storeByNum.get(num);
      const owner = store ? franchiseeName(ctx, store.franchisee_id) : "";
      return <span className="schip" key={num}>{num}{owner && <small>{owner}</small>}
        <button type="button" title="Remove" aria-label={`Remove store ${num}`} onClick={() => onChange(value.filter((item) => item !== num))}>&times;</button></span>;
    })}</div>
    <div className="help">{value.length ? `${value.length} store${value.length !== 1 ? "s" : ""} selected` : "No stores selected yet."}</div>
  </>;
}
