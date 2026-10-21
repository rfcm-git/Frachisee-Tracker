import { useEffect, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import { CopyButton, StoreStatusBadge } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { PLATFORMS, PLATFORMS_UI, PLATFORM_STATES } from "../../config/constants.js";
import { contactsOf, emailOf, googleSearchUrl, platformColor, platformStatus, storeStatus } from "../../domain/records.js";
import { staffForStore, staffOptions } from "../../domain/staff.js";
import { telHref } from "../../lib/format.js";
import { useDataContext } from "../../state/dataStore.js";
import { openStaffDetail } from "../../state/dialogs.js";
import { toggleFrCard, useUiStore } from "../../state/uiStore.js";
import { saveStoreFields, setStorePlatform } from "./storeActions.js";

function EditButton({ onClick }) {
  return <button type="button" className="iconbtn mini ed" title="Edit" aria-label="Edit" onClick={onClick}><Icon name="pencil" /></button>;
}

function SaveCancel({ onSave, onCancel, saving, style }) {
  return <div style={{ display: "flex", gap: 8, marginTop: 11, ...style }}>
    <button type="button" className="btn sm" disabled={saving} onClick={onSave}><Icon name="save" />Save</button>
    <button type="button" className="btn sm ghost" onClick={onCancel}>Cancel</button>
  </div>;
}

function StaffLink({ person }) {
  const email = emailOf(person);
  return <><button type="button" className="btn link" style={{ padding: 0, fontWeight: 600 }} onClick={() => openStaffDetail(person.id)}>{person.name}</button>
    {email && <div className="st-mail"><a href={`mailto:${email}`}>{email}</a><CopyButton value={email} /></div>}</>;
}

const contactIcon = (type) => (type === "email" ? "mail" : type === "cell" ? "phone" : "tag");
const contactTitle = (type) => (type === "email" ? "Email" : type === "cell" ? "Cellphone" : "Other");

/** Left column of the store window. Editing state is local; the dialog is marked busy while editing. */
export default function StoreWindowLeft({ store }) {
  const ctx = useDataContext();
  const { setBusy } = useDialog();
  const frCardOpen = useUiStore((state) => state.frCardOpen);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [platformMenu, setPlatformMenu] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setBusy(!!editing || !!platformMenu); }, [editing, platformMenu, setBusy]);

  const owner = ctx.frById.get(store.franchisee_id);
  const contacts = owner ? contactsOf(owner) : [];
  const team = staffForStore(ctx, store);

  function startEdit(section) {
    if (editing === section) { setEditing(null); return; }
    setPlatformMenu(null);
    setEditing(section);
    if (section === "location") setForm({ address: store.address || "", city: store.city || "", state: store.state || "", zip: store.zip || "", phone: store.phone || "" });
    if (section === "team") setForm({ fbc: store.fbc_id ? String(store.fbc_id) : "", om: store.om_id ? String(store.om_id) : "" });
    if (section === "gbp") setForm({ gbp: store.gbp || "" });
  }

  const field = (name) => ({ value: form[name] ?? "", onChange: (event) => setForm({ ...form, [name]: event.target.value }) });

  async function save(patch, message) {
    setSaving(true);
    const ok = await saveStoreFields(store, patch, message);
    setSaving(false);
    if (ok) setEditing(null);
  }

  const saveLocation = () => save({ address: form.address.trim(), city: form.city.trim(), state: form.state.trim(), zip: form.zip.trim(), phone: form.phone.trim() }, "Location saved");
  const saveTeam = () => save({ fbc_id: form.fbc ? +form.fbc : null, om_id: form.om ? +form.om : null }, "Support team saved");
  const saveGbp = () => save({ gbp: form.gbp.trim() }, "Saved");

  async function choosePlatform(key, status) {
    if (await setStorePlatform(store, key, status)) setPlatformMenu(null);
  }

  const menuPlatform = platformMenu ? PLATFORMS.find(([key]) => key === platformMenu) : null;

  return <>
    <div className={`lc collapsible${frCardOpen ? "" : " closed"}`}>
      <div className="lch" onClick={toggleFrCard} title={`${frCardOpen ? "Hide" : "Show"} franchisee contact information`}>
        <Icon name="contact" />Franchisee Contact Information
        {!frCardOpen && contacts.length > 0 && <span className="peek">· {contacts.length} contact{contacts.length > 1 ? "s" : ""}</span>}
        <button type="button" className="iconbtn mini ed tog" aria-label="Show or hide contact information" aria-expanded={frCardOpen}
          onClick={(event) => { event.stopPropagation(); toggleFrCard(); }}><Icon name="chevron-down" /></button>
      </div>
      <div className="lcb">
        <div className="line" style={{ marginBottom: 4 }}><span className="k">Name</span><span className="v"><b>{owner?.name || "—"}</b></span>{owner?.name && <CopyButton value={owner.name} />}</div>
        {contacts.length ? contacts.map((contact, index) => {
          const href = contact.type === "email" ? `mailto:${contact.value}` : contact.type === "cell" ? telHref(contact.value) : "";
          return <div className="fr-cline" key={`${contact.type}-${index}`}>
            <span className="ci" title={contactTitle(contact.type)}><Icon name={contactIcon(contact.type)} /></span>
            <span className="cv">{href ? <a href={href}>{contact.value}</a> : contact.value}</span><CopyButton value={contact.value || ""} />
          </div>;
        }) : <div className="muted" style={{ fontSize: 12.5 }}>No contact info saved. Add it with Edit on the franchisee.</div>}
      </div>
    </div>

    <div className="lc"><div className="lch"><Icon name="map-pin" />Location<EditButton onClick={() => startEdit("location")} /></div><div className="lcb">
      {editing === "location" ? <>
        <div className="fgrid">
          <div className="field full"><label htmlFor="sw_address">Address</label><input id="sw_address" {...field("address")} /></div>
          <div className="field"><label htmlFor="sw_city">City</label><input id="sw_city" {...field("city")} /></div>
          <div className="field"><label htmlFor="sw_state">State</label><input id="sw_state" {...field("state")} /></div>
          <div className="field"><label htmlFor="sw_zip">ZIP</label><input id="sw_zip" {...field("zip")} /></div>
          <div className="field"><label htmlFor="sw_phone">Store Phone Number</label><input id="sw_phone" {...field("phone")} /></div>
        </div>
        <SaveCancel saving={saving} onSave={saveLocation} onCancel={() => setEditing(null)} />
      </> : <>
        <div className="line"><span className="k">Status</span><span className="v"><StoreStatusBadge status={storeStatus(store)} /></span></div>
        <div className="line"><span className="k">Address</span><span className="v">{store.address || "—"}</span></div>
        <div className="line"><span className="k">City / State</span><span className="v">{[store.city, store.state].filter(Boolean).join(", ")}{store.zip ? ` ${store.zip}` : ""}</span></div>
        <div className="line"><span className="k">Store Phone Number</span><span className="v">{store.phone || <span className="muted">{"—"}</span>}</span>{store.phone && <CopyButton value={store.phone} />}</div>
      </>}
    </div></div>

    <div className="lc"><div className="lch"><Icon name="badge-check" />Support Team<EditButton onClick={() => startEdit("team")} /></div><div className="lcb">
      {editing === "team" ? <>
        <div className="fgrid">
          <div className="field"><label htmlFor="sw_fbc">FBC</label><select id="sw_fbc" {...field("fbc")}><option value="">— Not assigned —</option>
            {staffOptions(ctx, "FBC").map((option) => <option value={option.id} key={option.id}>{option.name}{option.email && ` · ${option.email}`}</option>)}</select></div>
          <div className="field"><label htmlFor="sw_om">OM</label><select id="sw_om" {...field("om")}><option value="">— Not assigned —</option>
            {staffOptions(ctx, "OM").map((option) => <option value={option.id} key={option.id}>{option.name}{option.email && ` · ${option.email}`}</option>)}</select></div>
        </div>
        <SaveCancel saving={saving} onSave={saveTeam} onCancel={() => setEditing(null)} />
      </> : <>
        <div className="line"><span className="k">FBC</span><span className="v">{team.fbc.length ? team.fbc.map((person) => <StaffLink person={person} key={person.id} />) : <span className="muted">Not assigned</span>}</span></div>
        <div className="line"><span className="k">OM</span><span className="v">{team.om.length ? team.om.map((person) => <StaffLink person={person} key={person.id} />) : <span className="muted">Not assigned</span>}</span></div>
        <div className="line"><span className="k">Territory</span><span className="v muted">{store.territory || "—"}</span></div>
      </>}
    </div></div>

    <div className="lc"><div className="lch"><Icon name="bike" />Delivery Platforms</div><div className="lcb">
      <div className="legend"><span><span className="d" style={{ background: "var(--ok)" }} />Active</span><span><span className="d" style={{ background: "var(--warn)" }} />Pending</span><span><span className="d" style={{ background: "var(--danger)" }} />Not enrolled</span><span><span className="d" style={{ background: "var(--idle)" }} />Exempted</span></div>
      <div className="pbtns">{PLATFORMS_UI.map(([key, name]) => {
        const status = platformStatus(store, key);
        return <button type="button" className="pbtn" title={`${name}: ${status}`} aria-expanded={platformMenu === key} key={key}
          onClick={() => { setEditing(null); setPlatformMenu(platformMenu === key ? null : key); }}>
          <span className="d" style={{ background: platformColor(status) }} />{name}</button>;
      })}</div>
      {menuPlatform && <div className="pmenu"><div className="lbl">Set {menuPlatform[1]} status</div><div className="sbtns">
        {PLATFORM_STATES.map((value) => <button type="button" className="sbtn" key={value} onClick={() => choosePlatform(menuPlatform[0], value)}>
          <span className="d" style={{ background: platformColor(value) }} />{value}</button>)}
      </div></div>}
    </div></div>

    <div className="lc"><div className="lch"><Icon name="map" />Google Business Profile<EditButton onClick={() => startEdit("gbp")} /></div><div className="lcb">
      {editing === "gbp" ? <>
        <div className="field"><label htmlFor="sw_gbp">Google Business Profile link</label><input id="sw_gbp" placeholder="https://…" {...field("gbp")} /></div>
        <SaveCancel saving={saving} onSave={saveGbp} onCancel={() => setEditing(null)} style={{ marginTop: 10 }} />
      </> : <>
        <div className="line"><span className="k">Profile</span><span className="v">{store.gbp ? <a href={store.gbp} target="_blank" rel="noopener noreferrer">Open profile</a> : <span className="muted">No link saved</span>}</span></div>
        <div style={{ marginTop: 9 }}><button type="button" className="btn sm ghost round" onClick={() => window.open(googleSearchUrl(store), "_blank", "noopener")}><Icon name="search" />Find on Google</button></div>
      </>}
    </div></div>
  </>;
}
