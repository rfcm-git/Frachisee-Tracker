import { useMemo, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { OpenIssueDot, PlatformChips, StoreStatusIfClosed } from "../../components/ui/common.jsx";
import { clickableProps } from "../../components/ui/clickable.js";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { PLATFORMS_UI } from "../../config/constants.js";
import { franchiseeName, staffMember, storeOpenIssues } from "../../domain/context.js";
import { platformStatus, storeStatus } from "../../domain/records.js";
import { freeTextQuery, storeMatches } from "../../domain/search.js";
import { fileSlug, formatNumber } from "../../lib/format.js";
import { compareStores } from "../../lib/text.js";
import { loadXlsx } from "../../lib/xlsx.js";
import { useDataContext } from "../../state/dataStore.js";
import { openStore } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { useUiStore } from "../../state/uiStore.js";
import { dashboardListTitle, dashboardStores } from "./dashboardModel.js";

const MAX_SHOWN = 300;

async function downloadList(ctx, stores, title, territory) {
  let XLSX;
  try { XLSX = await loadXlsx(); } catch { toast("Excel tool didn't load", "err"); return; }
  const rows = [["Store #", "Franchisee", "Status", "Address", "City", "State", "ZIP", "Territory", "Store phone", "Uber Eats", "DoorDash", "Grubhub", "ezCater", "GBP link", "FBC", "OM", "Open issues"]];
  stores.forEach((store) => {
    const fbc = staffMember(ctx, store.fbc_id);
    const om = staffMember(ctx, store.om_id);
    rows.push([store.num, franchiseeName(ctx, store.franchisee_id), storeStatus(store), store.address || "", store.city || "", store.state || "", store.zip || "", store.territory || "", store.phone || "",
      ...PLATFORMS_UI.map(([key]) => platformStatus(store, key)), store.gbp || "", fbc ? fbc.name : "", om ? om.name : "", storeOpenIssues(ctx, store.num)]);
  });
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [9, 28, 16, 30, 16, 7, 9, 10, 15, 11, 11, 11, 11, 30, 16, 16, 10].map((wch) => ({ wch }));
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
  for (let column = 0; column < rows[0].length; column += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (cell) cell.s = { font: { bold: true, color: { rgb: "FFFFFF" }, name: "Arial", sz: 10 }, fill: { fgColor: { rgb: "008938" } } };
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Stores");
  XLSX.writeFile(workbook, `${fileSlug(title).toLowerCase().slice(0, 60)}${territory ? `_terr-${territory}` : ""}.xlsx`, { cellStyles: true });
  toast("List downloaded", "ok");
}

/** Stores behind a dashboard number, with a filter box and Excel download. */
export default function DashboardListDialog({ storeKey }) {
  const ctx = useDataContext();
  const { close } = useDialog();
  const territory = useUiStore((state) => state.dashTerritory);
  const [query, setQuery] = useState("");
  const all = useMemo(() => dashboardStores(ctx, territory, storeKey).slice().sort(compareStores), [ctx, territory, storeKey]);
  const list = useMemo(() => {
    const sq = freeTextQuery(query);
    return sq.q ? all.filter((store) => storeMatches(ctx, store, sq)) : all;
  }, [ctx, all, query]);
  const title = dashboardListTitle(storeKey);

  return <Modal size="wide" icon="list" title={title} subtitle={`${formatNumber(list.length)} store${list.length !== 1 ? "s" : ""}${territory ? ` · Territory ${territory}` : ""}`}
    headExtra={<button type="button" className="btn sm outline round" style={{ marginLeft: "auto" }} data-tip="Download this list as an Excel file"
      onClick={() => downloadList(ctx, all, title, territory)}><Icon name="download" />Download Excel</button>}
    footer={<button type="button" className="btn ghost" onClick={close}>Close</button>}>
    <div className="search-wrap" style={{ marginBottom: 10 }}><span className="lead"><Icon name="search" /></span>
      <input type="search" placeholder="Filter by store #, name, city, ZIP…" aria-label="Filter stores" value={query} autoFocus onChange={(event) => setQuery(event.target.value)} /></div>
    {list.length ? <div className="dl-list">{list.slice(0, MAX_SHOWN).map((store) => <div className="store-line" key={store.id} {...clickableProps(() => { close(); openStore(store.id); })}>
      <div className="idot-col"><OpenIssueDot count={storeOpenIssues(ctx, store.num)} /></div>
      <span className="num">{String(store.num)}</span>
      <div className="meta"><div className="a">{franchiseeName(ctx, store.franchisee_id) || "—"}<StoreStatusIfClosed status={storeStatus(store)} /></div>
        <div className="b">{[store.address, [store.city, store.state].filter(Boolean).join(", "), `Terr ${store.territory || "—"}`].filter(Boolean).join(" · ")}</div></div>
      <PlatformChips store={store} />
      <Icon name="chevron-right" className="muted" />
    </div>)}</div> : <div className="db-empty"><Icon name="circle-check" />No stores in this list</div>}
    {list.length > MAX_SHOWN && <div className="help">Showing the first 300. Download Excel for the full list.</div>}
  </Modal>;
}
