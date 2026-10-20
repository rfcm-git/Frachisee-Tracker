import { useMemo, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { CopyButton, OpenIssueDot, StoreStatusIfClosed } from "../../components/ui/common.jsx";
import { clickableProps } from "../../components/ui/clickable.js";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { franchiseeName, storeOpenIssues } from "../../domain/context.js";
import { emailOf, storeStatus } from "../../domain/records.js";
import { storesHandled } from "../../domain/staff.js";
import { compareStores } from "../../lib/text.js";
import { useDataContext } from "../../state/dataStore.js";
import { openStaffForm, openStore } from "../../state/dialogs.js";
import { askDeleteStaff } from "./staffActions.js";

const PER_PAGE = 12;

/** One FBC / OM: contact, counts and the stores they handle. */
export default function StaffDetailDialog({ staffId }) {
  const ctx = useDataContext();
  const { close } = useDialog();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const person = ctx.staffById.get(staffId);

  const all = useMemo(() => (person ? storesHandled(ctx, person) : []), [ctx, person]);
  if (!person) return null;

  const asFbc = all.filter((store) => store.fbc_id === person.id);
  const asOm = all.filter((store) => store.om_id === person.id);
  const franchiseeCount = new Set(all.map((store) => store.franchisee_id)).size;
  const openIssues = all.reduce((sum, store) => sum + storeOpenIssues(ctx, store.num), 0);
  const email = emailOf(person);
  const q = query.trim().toLowerCase().replace(/^#/, "");
  const list = all
    .filter((store) => roleFilter === "all" || (roleFilter === "FBC" ? store.fbc_id === person.id : store.om_id === person.id))
    .filter((store) => !q || [store.num, store.city, store.state, store.address, franchiseeName(ctx, store.franchisee_id)].join(" ").toLowerCase().includes(q))
    .sort(compareStores);
  const pageCount = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pageStores = list.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
  const roles = asFbc.length && asOm.length ? [["all", `All ${all.length}`], ["FBC", `As FBC ${asFbc.length}`], ["OM", `As OM ${asOm.length}`]] : [];

  return <Modal size="wide" icon="id-card" title={person.name || "—"} subtitle={`${person.role || ""}${email ? ` · ${email}` : ""}`}
    footer={<>
      <button type="button" className="btn link danger" style={{ marginRight: "auto" }} onClick={() => askDeleteStaff(person)}>Delete</button>
      <button type="button" className="btn ghost" onClick={close}>Close</button>
      <button type="button" className="btn" onClick={() => { close(); openStaffForm(person.id); }}><Icon name="pencil" />Edit</button>
    </>}>
    <div className="sd-top">
      <div className="lc" style={{ margin: 0 }}><div className="lch"><Icon name="contact" />Contact</div><div className="lcb">
        <div className="line"><span className="k">Name</span><span className="v"><b>{person.name || "—"}</b></span><CopyButton value={person.name || ""} /></div>
        <div className="line"><span className="k">Email</span><span className="v">{email ? <a href={`mailto:${email}`}>{email}</a> : <span className="muted">{"—"}</span>}</span>{email && <CopyButton value={email} />}</div>
        <div className="line"><span className="k">Role</span><span className="v">{String(person.role || "—").split("&").map((item) => <span className="rl" key={item}>{item.trim()}</span>)}</span></div>
      </div></div>
      <div className="sd-stats">
        <div><b>{all.length}</b><span>stores</span></div><div><b>{franchiseeCount}</b><span>franchisees</span></div>
        <div><b>{asFbc.length}</b><span>as FBC</span></div><div><b>{asOm.length}</b><span>as OM</span></div>
        <div className={openIssues ? "warn" : ""}><b>{openIssues}</b><span>open issues</span></div>
      </div>
    </div>
    <div className="lc" style={{ margin: "14px 0 0" }}><div className="lch"><Icon name="store" />Stores they handle</div><div className="lcb">
      <div className="sd-tools">
        <div className="search-wrap" style={{ minWidth: 220 }}><span className="lead"><Icon name="search" /></span>
          <input type="search" placeholder="Search store #, city or franchisee" aria-label="Search stores" value={query} autoFocus
            onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></div>
        {roles.length > 0 && <div className="vtog">{roles.map(([value, label]) => <button type="button" key={value} className={roleFilter === value ? "on" : ""}
          onClick={() => { setRoleFilter(value); setPage(1); }}>{label}</button>)}</div>}
      </div>
      {pageStores.length ? <div className="sd-list">{pageStores.map((store) => {
        const location = [store.address, [store.city, store.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
        return <div className="store-line" key={store.id} {...clickableProps(() => { close(); openStore(store.id); })}>
          <div className="idot-col"><OpenIssueDot count={storeOpenIssues(ctx, store.num)} /></div><span className="num">{store.num}</span>
          <div className="meta"><div className="a">{franchiseeName(ctx, store.franchisee_id) || "—"} <StoreStatusIfClosed status={storeStatus(store)} /></div><div className="b">{location}</div></div>
          <span className="sd-tags">{store.fbc_id === person.id && <span className="rl">FBC</span>}{store.om_id === person.id && <span className="rl">OM</span>}</span>
          <Icon name="chevron-right" className="muted" />
        </div>;
      })}</div> : <p className="muted" style={{ margin: "8px 0" }}>{all.length ? "No stores match." : "No stores assigned yet."}</p>}
      {pageCount > 1 && <div className="pager" style={{ borderTop: "none", padding: "10px 0 0" }}>
        <span className="pg-range">{(currentPage - 1) * PER_PAGE + 1}–{Math.min(list.length, currentPage * PER_PAGE)} of {list.length}</span>
        <div className="pg-nav">
          <button type="button" className="pico" title="Previous" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><Icon name="chevron-left" /></button>
          <span className="pg">{currentPage} / {pageCount}</span>
          <button type="button" className="pico" title="Next" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><Icon name="chevron-right" /></button>
        </div>
      </div>}
    </div></div>
  </Modal>;
}
