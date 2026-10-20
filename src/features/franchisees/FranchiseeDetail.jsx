import { useMemo } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import { CopyButton, IssueNumber, IssueStatusBadge, OpenIssueDot, PlatformChips, StoreStatusIfClosed } from "../../components/ui/common.jsx";
import { clickableProps } from "../../components/ui/clickable.js";
import { usePaged } from "../../hooks/usePaged.js";
import { franchiseeOpenIssues, storesOf } from "../../domain/context.js";
import { normalizeIssueStatus, issueNumber } from "../../domain/issues.js";
import { contactsOf, emailOf, storeStatus } from "../../domain/records.js";
import { staffForStores } from "../../domain/staff.js";
import { formatTimestamp, telHref } from "../../lib/format.js";
import { oneLine } from "../../lib/richText.js";
import { useDataContext } from "../../state/dataStore.js";
import { openAddStore, openCallLog, openFranchiseeForm, openStaffDetail, openStore } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import FranchiseeCallsPanel from "../calls/FranchiseeCallsPanel.jsx";
import { askRemoveStore } from "../stores/storeActions.js";
import { askDeleteFranchisee } from "./franchiseeActions.js";
import { franchiseeIssues, franchiseeStores } from "./franchiseeSelectors.js";

function TeamBadges({ members }) {
  if (!members.length) return <span className="muted">Not assigned</span>;
  return members.map(({ person, count }) => (
    <span className="staff-badge" key={person.id} title={emailOf(person) || "no email"} {...clickableProps(() => openStaffDetail(person.id))}>
      <Icon name="user-round" />{person.name} <span className="muted">· {count} store{count !== 1 ? "s" : ""}</span>
    </span>
  ));
}

export default function FranchiseeDetail({ franchisee, sq }) {
  const ctx = useDataContext();
  const stores = useMemo(() => franchiseeStores(ctx, franchisee, sq), [ctx, franchisee, sq]);
  const { items: pageStores, pagerProps } = usePaged("frst", stores);
  const issues = useMemo(() => franchiseeIssues(ctx, franchisee.id), [ctx, franchisee.id]);
  const team = useMemo(() => staffForStores(ctx, storesOf(ctx, franchisee.id)), [ctx, franchisee.id]);
  const contacts = contactsOf(franchisee);
  const territory = franchisee.territory || "—";

  const openIssueStore = (issue) => {
    const store = ctx.storeByNum.get(String(issue.store_num));
    if (store) openStore(store.id, { focusIssues: true, storeNum: store.num });
    else toast("No matching store to open");
  };

  return <>
    <div className="detail-head">
      <div style={{ flex: 1 }}>
        <h2 style={{ margin: "2px 0" }}><OpenIssueDot count={franchiseeOpenIssues(ctx, franchisee.id)} />{franchisee.name}{franchisee.closed && <> <span className="badge b-inactive">Closed</span></>}</h2>
        <div className="muted" style={{ fontSize: 13.5 }}>Territory {territory} · {stores.length} store{stores.length !== 1 ? "s" : ""}</div>
      </div>
      <div className="hd-actions">
        <button type="button" className="call-btn lg" data-tip="Log Call" aria-label={`Log a call to ${franchisee.name}`} onClick={() => openCallLog(franchisee.id)}><Icon name="phone" /></button>
        <button type="button" className="btn outline round xs" title="Edit franchisee" onClick={() => openFranchiseeForm(franchisee.id)}><Icon name="pencil" />Edit</button>
        <button type="button" className="iconbtn del" title="Delete franchisee (password required)" aria-label="Delete franchisee" onClick={() => askDeleteFranchisee(franchisee.id)}><Icon name="trash-2" /></button>
      </div>
    </div>
    <div className="grid2">
      <div className="panel"><div className="ph"><Icon name="mail" />Contacts</div><div className="pb">
        {contacts.length ? contacts.map((contact, index) => {
          const href = contact.type === "email" ? `mailto:${contact.value}` : contact.type === "cell" ? telHref(contact.value) : "";
          return <div className="contact-row" key={`${contact.type}-${index}`}>
            <span className="type">{contact.type || "other"}</span><span className="val">{href ? <a href={href}>{contact.value}</a> : contact.value}</span>
            {(contact.type === "email" || contact.type === "cell") && <CopyButton value={contact.value} />}
          </div>;
        }) : <p className="muted">No contacts yet.</p>}
      </div></div>
      <div className="panel"><div className="ph"><Icon name="badge-check" />Support team</div><div className="pb">
        <div className="kv"><span className="k">OM</span><span><TeamBadges members={team.om} /></span></div>
        <div className="kv"><span className="k">FBC</span><span><TeamBadges members={team.fbc} /></span></div>
        <div className="kv"><span className="k">Area</span><span className="muted">{territory}</span></div>
      </div></div>

      <div className="panel" style={{ gridColumn: "1 / -1" }}>
        <div className="ph"><Icon name="store" />Stores <span className="badge-num" style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>{stores.length}</span>
          <span className="ph-act"><button type="button" className="iconbtn" title="Add store" aria-label="Add store" onClick={() => openAddStore(franchisee.id)}><Icon name="plus" /></button></span>
        </div>
        <div className="pb">
          {stores.length ? <>
            {pageStores.map(({ store, hit, openIssues }) => <div className={`store-line${hit ? " hit" : ""}`} key={store.id} {...clickableProps(() => openStore(store.id))}>
              <div className="idot-col"><OpenIssueDot count={openIssues} /></div><span className="num">{store.num || ""}</span>
              <div className="meta"><div className="a">{store.address || ""}<StoreStatusIfClosed status={storeStatus(store)} />{hit && <span className="hit-tag">Searched</span>}</div>
                <div className="b">{[store.city, store.state].filter(Boolean).join(", ")}{store.phone && <> {"·"} {store.phone}</>}</div>
              </div>
              <PlatformChips store={store} />
              <button type="button" className="iconbtn mini rm" title="Remove store from franchisee" aria-label="Remove store" onClick={(event) => { event.stopPropagation(); askRemoveStore(store.id); }}><Icon name="trash-2" /></button>
              <Icon name="chevron-right" />
            </div>)}
            <Pagination {...pagerProps} />
          </> : <p className="muted">No stores.</p>}
        </div>
      </div>

      <div className="panel" style={{ gridColumn: "1 / -1" }}><div className="ph"><Icon name="triangle-alert" />Issues</div><div className="pb">
        {issues.length ? issues.map((issue) => <div className="issue-line" key={issue.id} {...clickableProps(() => openIssueStore(issue))}>
          <IssueStatusBadge status={normalizeIssueStatus(issue.status)} />
          <span className="val"><IssueNumber number={issueNumber(issue)} /> {oneLine(issue.title)}{issue.store_num && <> <span className="muted">(#{issue.store_num})</span></>}</span>
          <span className="muted" style={{ fontSize: 11.5 }}>{formatTimestamp(issue.updated_at || issue.created_at)}</span>
        </div>) : <p className="muted">No issues logged.</p>}
      </div></div>

      <FranchiseeCallsPanel franchisee={franchisee} />

      {franchisee.notes && <div className="panel" style={{ gridColumn: "1 / -1" }}><div className="ph"><Icon name="sticky-note" />Notes</div>
        <div className="pb" style={{ whiteSpace: "pre-wrap", fontSize: 13.5 }}>{franchisee.notes}</div></div>}
    </div>
  </>;
}
