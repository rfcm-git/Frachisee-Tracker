import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { CopyButton } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { storesOf } from "../../domain/context.js";
import { contactsOf, emailOf } from "../../domain/records.js";
import { staffForStores } from "../../domain/staff.js";
import { telHref } from "../../lib/format.js";
import { useDataContext } from "../../state/dataStore.js";
import { closeAll } from "../../state/dialogs.js";
import { showFranchisee } from "../../state/uiStore.js";

function StaffLine({ members }) {
  if (!members.length) return <span className="muted">Not assigned</span>;
  return members.map(({ person }, index) => <span key={person.id}>
    {index > 0 && <br />}{person.name}{emailOf(person) && <> · <a href={`mailto:${emailOf(person)}`}>{emailOf(person)}</a></>}
  </span>);
}

/** Franchisee contact info and support team; groupId lists their stores in a multi-store issue. */
export default function FranchiseeInfoDialog({ franchiseeId, groupId }) {
  const ctx = useDataContext();
  const { close } = useDialog();
  const franchisee = ctx.frById.get(franchiseeId);
  if (!franchisee) return null;
  const stores = storesOf(ctx, franchisee.id);
  const contacts = contactsOf(franchisee).filter((contact) => contact.value);
  const issueStores = groupId ? ctx.issues.filter((issue) => issue.group_id === groupId && issue.franchisee_id === franchisee.id).map((issue) => issue.store_num).sort() : [];
  const team = staffForStores(ctx, stores);

  function openPage() {
    closeAll();
    showFranchisee(franchisee);
  }

  return <Modal size="small" icon="user-round" title={franchisee.name || "—"} subtitle={`Territory ${franchisee.territory || "—"} · ${stores.length} store${stores.length !== 1 ? "s" : ""}`}
    footer={<><button type="button" className="btn ghost" onClick={close}>Close</button>
      <button type="button" className="btn outline round" onClick={openPage}><Icon name="external-link" />Open franchisee page</button></>}>
    <div className="lc"><div className="lch"><Icon name="contact" />Franchisee Contact Information</div><div className="lcb">
      <div className="line" style={{ marginBottom: 4 }}><span className="k">Name</span><span className="v"><b>{franchisee.name}</b></span><CopyButton value={franchisee.name} /></div>
      {contacts.length ? contacts.map((contact, index) => {
        const href = contact.type === "email" ? `mailto:${contact.value}` : contact.type === "cell" ? telHref(contact.value) : "";
        return <div className="fr-cline" key={`${contact.type}-${index}`}>
          <span className="ci" title={contact.type === "email" ? "Email" : contact.type === "cell" ? "Cellphone" : "Other"}><Icon name={contact.type === "email" ? "mail" : contact.type === "cell" ? "phone" : "tag"} /></span>
          <span className="cv">{href ? <a href={href}>{contact.value}</a> : contact.value}</span><CopyButton value={contact.value} />
        </div>;
      }) : <div className="muted" style={{ fontSize: 12.5 }}>No contact info saved.</div>}
    </div></div>
    {issueStores.length > 0 && <div className="lc"><div className="lch"><Icon name="layers" />Their stores in this issue</div>
      <div className="lcb"><div className="tl-stores" style={{ margin: 0 }}>{issueStores.map((num) => <span key={num}>{num}</span>)}</div></div>
    </div>}
    <div className="lc" style={{ marginBottom: 0 }}><div className="lch"><Icon name="badge-check" />Support Team</div><div className="lcb">
      <div className="line"><span className="k">OM</span><span className="v"><StaffLine members={team.om} /></span></div>
      <div className="line"><span className="k">FBC</span><span className="v"><StaffLine members={team.fbc} /></span></div>
    </div></div>
  </Modal>;
}
