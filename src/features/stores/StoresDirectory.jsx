import { useMemo } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import { EmptyState, OpenIssueDot, PlatformChips, StoreStatusIfClosed } from "../../components/ui/common.jsx";
import { clickableProps } from "../../components/ui/clickable.js";
import { usePaged } from "../../hooks/usePaged.js";
import { useToolbarCount } from "../../hooks/useToolbarCount.js";
import { franchiseeName, storeOpenIssues } from "../../domain/context.js";
import { storeStatus, territorySet } from "../../domain/records.js";
import { searchQuery, storeMatches, storeRank } from "../../domain/search.js";
import { compareStores } from "../../lib/text.js";
import { useDataContext } from "../../state/dataStore.js";
import { openStore } from "../../state/dialogs.js";
import { useUiStore } from "../../state/uiStore.js";

/** Stores matching the toolbar search and filters, best matches first. */
function filterStores(ctx, { sq, terrFilter, issuesOnly, closedOnly }) {
  return ctx.stores.filter((store) => {
    if (terrFilter && !territorySet(store.territory).has(terrFilter)) return false;
    if (issuesOnly && !storeOpenIssues(ctx, store.num)) return false;
    if (closedOnly && storeStatus(store) === "Open") return false;
    return storeMatches(ctx, store, sq);
  }).sort((a, b) => (sq.q ? storeRank(a, sq) - storeRank(b, sq) : 0) || compareStores(a, b));
}

export default function StoresDirectory() {
  const ctx = useDataContext();
  const search = useUiStore((state) => state.search);
  const terrFilter = useUiStore((state) => state.terrFilter);
  const issuesOnly = useUiStore((state) => state.issuesOnly);
  const closedOnly = useUiStore((state) => state.closedOnly);
  const list = useMemo(() => filterStores(ctx, { sq: searchQuery(search), terrFilter, issuesOnly, closedOnly }), [ctx, search, terrFilter, issuesOnly, closedOnly]);
  const { items, pagerProps } = usePaged("st", list);
  useToolbarCount(`${list.length} of ${ctx.stores.length}`);

  if (!list.length) return <EmptyState icon="store" title="No stores match">Try a different search, territory, or filter.</EmptyState>;

  return <div className="card"><table><thead><tr>
    <th>Store #</th><th>Franchisee</th><th className="hide-sm">Address</th><th className="hide-sm">Phone</th><th>Platforms</th><th aria-label="Open" />
  </tr></thead><tbody>
    {items.map((store) => <tr className="click" key={store.id} {...clickableProps(() => openStore(store.id))}>
      <td className="store"><OpenIssueDot count={storeOpenIssues(ctx, store.num)} />{store.num || ""}
        {storeStatus(store) !== "Open" && <div style={{ marginTop: 3 }}><StoreStatusIfClosed status={storeStatus(store)} /></div>}</td>
      <td>{franchiseeName(ctx, store.franchisee_id)}</td>
      <td className="hide-sm muted">{store.address || ""}<br />{[store.city, store.state].filter(Boolean).join(", ")}</td>
      <td className="hide-sm muted">{store.phone || ""}</td>
      <td><PlatformChips store={store} /></td>
      <td style={{ textAlign: "right" }}><Icon name="chevron-right" /></td>
    </tr>)}
  </tbody></table>
    <Pagination {...pagerProps} />
  </div>;
}
