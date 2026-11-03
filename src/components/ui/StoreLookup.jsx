import { useImperativeHandle, useMemo, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { StoreStatusIfClosed } from "./common.jsx";
import { useDataContext } from "../../state/dataStore.js";
import { franchiseeName, storesOf } from "../../domain/context.js";
import { storeAddressLine, storeStatus } from "../../domain/records.js";
import { findFranchiseesByName, findStoresByNumber } from "../../domain/search.js";
import { cleanStoreNumber, compareStores, looksLikeName } from "../../lib/text.js";

/**
 * Picks one store, or one franchisee with no specific store ("General").
 * Type a store # or a franchisee name; a picked franchisee lists their stores to choose from.
 *
 * value:          { franchiseeId, storeNum } — storeNum "" is General, null is not chosen yet
 * onChange(next)
 * allowGeneral:   offer "General — no specific store" once a franchisee is picked
 * allowUnknown:   a typed store # that is not in the store list can still be picked
 * lockFranchisee: the franchisee is fixed (no Change button)
 * storeTag(num):  optional short tag shown next to a store (e.g. "In CAP list")
 * ref exposes commitTyped() (picks what is still typed; returns the new value or null) and focus().
 */
export default function StoreLookup({ ref, value, onChange, allowGeneral = false, allowUnknown = false, lockFranchisee = false, storeTag, inputId, autoFocus = true, invalid = false, describedBy }) {
  const ctx = useDataContext();
  const inputRef = useRef(null);
  const [text, setText] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const franchisee = value?.franchiseeId != null ? ctx.frById.get(value.franchiseeId) : null;
  const storeNum = value?.storeNum ?? null;
  const picked = !!franchisee || !!storeNum;

  const suggestions = useMemo(() => {
    const typed = text.trim();
    if (!typed) return null;
    if (looksLikeName(typed)) {
      const hits = findFranchiseesByName(ctx, typed, 8, { withoutStores: allowGeneral });
      return { kind: hits.length ? "franchisees" : "none", items: hits };
    }
    const hits = findStoresByNumber(ctx, cleanStoreNumber(typed));
    return hits.length ? { kind: "stores", items: hits } : { kind: "nostore", items: [] };
  }, [ctx, text, allowGeneral]);

  function pickStore(num) {
    const store = ctx.storeByNum.get(num);
    setText("");
    setSuggestOpen(false);
    onChange({ franchiseeId: store ? store.franchisee_id ?? null : null, storeNum: num });
    return { franchiseeId: store ? store.franchisee_id ?? null : null, storeNum: num };
  }

  function pickFranchisee(id) {
    const stores = storesOf(ctx, id);
    // One store and no General choice: that store is the only answer.
    const next = { franchiseeId: id, storeNum: !allowGeneral && stores.length === 1 ? String(stores[0].num) : null };
    setText("");
    setSuggestOpen(false);
    onChange(next);
    return next;
  }

  /** Picks what is typed: an exact store #, or the best franchisee match. Returns the new value or null. */
  function submitTyped() {
    const typed = text.trim();
    if (!typed) return null;
    if (looksLikeName(typed)) {
      const hits = findFranchiseesByName(ctx, typed, 1, { withoutStores: allowGeneral });
      return hits.length ? pickFranchisee(hits[0].id) : null;
    }
    const num = cleanStoreNumber(typed);
    if (ctx.storeByNum.has(num) || (allowUnknown && /^\d+$/.test(num))) return pickStore(num);
    return null;
  }

  function reset() {
    onChange({ franchiseeId: null, storeNum: null });
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  useImperativeHandle(ref, () => ({
    commitTyped: () => (picked ? value : submitTyped()),
    focus: () => inputRef.current?.focus(),
  }));

  if (!picked) {
    return <div className="spick">
      <input id={inputId} ref={inputRef} placeholder="Type a store # or a franchisee name" autoComplete="off" autoFocus={autoFocus} value={text}
        className={invalid ? "bad" : ""} aria-invalid={invalid ? "true" : undefined} aria-describedby={describedBy}
        role="combobox" aria-expanded={!!(suggestOpen && suggestions)} aria-autocomplete="list"
        onChange={(event) => { setText(event.target.value); setSuggestOpen(true); }}
        onFocus={() => setSuggestOpen(true)}
        onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submitTyped(); } }} />
      <div className={`spick-sug${suggestOpen && suggestions ? " show" : ""}`} role="listbox">
        {suggestions?.kind === "franchisees" && <>
          <div className="sug-h">Franchisees — pick one to choose the store</div>
          {suggestions.items.map((item) => {
            const count = storesOf(ctx, item.id).length;
            return <div key={item.id} role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => pickFranchisee(item.id)}>
              <Icon name="user-round" className="si" /><span className="fn">{item.name}</span><span className="muted">{count} store{count !== 1 ? "s" : ""}</span>
            </div>;
          })}
        </>}
        {suggestions?.kind === "stores" && suggestions.items.map((store) => <div key={store.id} role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => pickStore(String(store.num))}>
          <b>{store.num}</b><span>{franchiseeName(ctx, store.franchisee_id) || "No franchisee"}{store.city ? ` · ${store.city}` : ""}</span>
        </div>)}
        {suggestions?.kind === "none" && <div className="nohit">No franchisee found</div>}
        {suggestions?.kind === "nostore" && <div className="nohit">{allowUnknown ? "Not in the store list — press Enter to use this number anyway" : "No store with that number"}</div>}
      </div>
    </div>;
  }

  if (!franchisee) {
    return <div className="slk-card"><span className="sf-av"><Icon name="store" /></span>
      <div className="slk-who"><b>Store {storeNum}</b><div className="muted" style={{ fontSize: 12 }}>{ctx.storeByNum.has(storeNum) ? "No franchisee on this store" : "Not in the store list"}</div></div>
      <button type="button" className="btn sm ghost round" onClick={reset}><Icon name="rotate-ccw" />Change</button></div>;
  }

  const stores = storesOf(ctx, franchisee.id).slice().sort(compareStores);
  const choose = (num) => onChange({ franchiseeId: franchisee.id, storeNum: num });
  return <div className="slk">
    <div className="slk-card"><span className="sf-av"><Icon name="user-round" /></span>
      <div className="slk-who"><b>{franchisee.name}</b><div className="muted" style={{ fontSize: 12 }}>Territory {franchisee.territory || "—"} · {stores.length} store{stores.length !== 1 ? "s" : ""}</div></div>
      {!lockFranchisee && <button type="button" className="btn sm ghost round" onClick={reset}><Icon name="rotate-ccw" />Change</button>}
    </div>
    <div className="slk-list" role="radiogroup" aria-label={`Store for ${franchisee.name}`}>
      {allowGeneral && <label className={`slk-row${storeNum === "" ? " on" : ""}`}>
        <input type="radio" name={`${inputId}_pick`} checked={storeNum === ""} onChange={() => choose("")} />
        <span className="n"><Icon name="building-2" /></span><span className="a"><b>General</b> — no specific store</span></label>}
      {stores.map((store) => {
        const num = String(store.num);
        const tag = storeTag?.(num);
        return <label className={`slk-row${storeNum === num ? " on" : ""}`} key={store.id}>
          <input type="radio" name={`${inputId}_pick`} checked={storeNum === num} onChange={() => choose(num)} />
          <span className="n">{num}</span><span className="a">{storeAddressLine(store) || "—"}<StoreStatusIfClosed status={storeStatus(store)} /></span>
          {tag && <span className="mfp-tag">{tag}</span>}
        </label>;
      })}
      {!stores.length && !allowGeneral && <div className="slk-empty muted">This franchisee has no stores.</div>}
    </div>
    {storeNum === null && <div className="help" style={{ marginTop: 6 }}>{allowGeneral ? "Pick a store, or General if no specific store is involved." : "Pick the store."}</div>}
  </div>;
}
