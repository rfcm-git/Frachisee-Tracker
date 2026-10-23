import { useMemo } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import { OpenIssueDot } from "../../components/ui/common.jsx";
import { clickableProps } from "../../components/ui/clickable.js";
import { usePaged } from "../../hooks/usePaged.js";
import { useToolbarCount } from "../../hooks/useToolbarCount.js";
import { franchiseeOpenIssues, storesOf } from "../../domain/context.js";
import { searchQuery } from "../../domain/search.js";
import { useDataContext } from "../../state/dataStore.js";
import { openFranchiseeForm } from "../../state/dialogs.js";
import { selectFranchisee, toggleIssuesOnly, useUiStore } from "../../state/uiStore.js";
import { filterFranchisees } from "./franchiseeSelectors.js";
import FranchiseeDetail from "./FranchiseeDetail.jsx";

export default function FranchiseesView() {
  const ctx = useDataContext();
  const search = useUiStore((state) => state.search);
  const terrFilter = useUiStore((state) => state.terrFilter);
  const issuesOnly = useUiStore((state) => state.issuesOnly);
  const selectedFr = useUiStore((state) => state.selectedFr);
  const sq = useMemo(() => searchQuery(search), [search]);

  const list = useMemo(() => filterFranchisees(ctx, { sq, terrFilter, issuesOnly }), [ctx, sq, terrFilter, issuesOnly]);
  const { items, pagerProps } = usePaged("fr", list);
  useToolbarCount(`${list.length} of ${ctx.franchisees.length}`);

  const selected = list.some((entry) => entry.franchisee.id === selectedFr) ? ctx.frById.get(selectedFr) : null;

  return (
    <div className="split">
      <div className="card fr-panel">
        <div className="list-head">
          <div className="lh-title"><Icon name="users" /><span><b>{ctx.franchisees.length}</b> franchisees {"·"} <b>{ctx.stores.length}</b> stores</span></div>
          <button type="button" className="iconbtn" title="Add franchisee" aria-label="Add franchisee" onClick={() => openFranchiseeForm(null)}><Icon name="user-plus" /></button>
          <button type="button" className={`iconbtn${issuesOnly ? " on" : ""}`} title="Only franchisees with an issue" aria-pressed={issuesOnly} onClick={toggleIssuesOnly}><Icon name="triangle-alert" /></button>
        </div>
        <div className="fr-list" id="frList">
          {items.length ? items.map(({ franchisee, hint }) => {
            const storeCount = storesOf(ctx, franchisee.id).length;
            return <div className={`fr-item${franchisee.id === selected?.id ? " active" : ""}`} key={franchisee.id} {...clickableProps(() => selectFranchisee(franchisee.id))}>
              <div className="idot-col"><OpenIssueDot count={franchiseeOpenIssues(ctx, franchisee.id)} /></div>
              <div className="nm">{franchisee.name || ""}{franchisee.closed && <> <span className="badge b-inactive">Closed</span></>}
                <small>Terr {franchisee.territory || "—"}</small>
                {hint && <small className="mhint"><Icon name="search" />{hint}</small>}
              </div>
              <span className="fr-stc" title={`${storeCount} store${storeCount === 1 ? "" : "s"}`}><Icon name="store" />{storeCount}</span>
            </div>;
          }) : <div className="fr-detail-placeholder"><Icon name="search-x" /><div>No matches</div></div>}
        </div>
        <Pagination {...pagerProps} />
      </div>
      <div id="frDetailPane">
        {selected
          ? <FranchiseeDetail franchisee={selected} sq={sq} />
          : <div className="card"><div className="fr-detail-placeholder"><Icon name="mouse-pointer-click" /><div>Select a franchisee to see details</div></div></div>}
      </div>
    </div>
  );
}
