import { useEffect, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { CopyButton, EmptyState } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { toast } from "../../state/toastStore.js";
import { defaultLinks, hostOf, loadLinks, normalizeUrl, saveLinks } from "./linksService.js";

let rowSeq = 0;
const nextId = () => { rowSeq += 1; return rowSeq; };

/** Sections with ids so rows can be edited in place. */
const toDraft = (links) => links.map((section) => ({ id: nextId(), title: section.title || "", icon: section.icon || "folder", key: section.key || "",
  links: (section.links || []).map((link) => ({ id: nextId(), name: link.name || "", url: link.url || "" })) }));

const fromDraft = (draft) => draft.map((section) => ({
  title: section.title.trim() || "Links", icon: section.icon || "folder", ...(section.key ? { key: section.key } : {}),
  links: section.links.map((link) => ({ name: link.name.trim(), url: normalizeUrl(link.url) })).filter((link) => link.url),
}));

function Favicon({ host }) {
  const [failed, setFailed] = useState(false);
  return <span className="fav">{failed ? <Icon name="globe" />
    : <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`} alt="" onError={() => setFailed(true)} />}</span>;
}

function LinkSections({ links }) {
  const sections = links.filter((section) => (section.links || []).length);
  if (!sections.length) return <EmptyState icon="link" title="No links yet">Click the pencil to add some.</EmptyState>;
  return sections.map((section, index) => <div className="lk-sec" key={`${section.title}-${index}`}>
    <h4><Icon name={section.icon || "folder"} />{section.title}</h4>
    <div className="lk-grid">{section.links.map((link, linkIndex) => {
      const url = normalizeUrl(link.url);
      const host = hostOf(link.url);
      return <div className="lk" key={`${url}-${linkIndex}`}>
        <button type="button" className="lk-open" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          title={`${link.name ? `${link.name}\n` : ""}${url}`}>
          <Favicon host={host} /><span className="t"><b>{link.name || host}</b><small>{host}</small></span>
        </button>
        <CopyButton value={url} title={`Copy ${link.name || host} link`} />
      </div>;
    })}</div>
  </div>);
}

export default function LinksDialog() {
  const { setBusy } = useDialog();
  const [links, setLinks] = useState(null);
  const [shared, setShared] = useState(true);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    loadLinks().then((result) => { if (active) { setLinks(result.links); setShared(result.shared); } });
    return () => { active = false; };
  }, []);
  useEffect(() => { setBusy(!!draft); }, [draft, setBusy]);

  const updateSection = (id, change) => setDraft(draft.map((section) => (section.id === id ? change(section) : section)));

  async function save() {
    const next = fromDraft(draft);
    setSaving(true);
    const wasShared = await saveLinks(next);
    setSaving(false);
    setShared(wasShared);
    setLinks(next);
    setDraft(null);
    toast(wasShared ? "Links saved for the team" : "Saved on this computer only", "ok");
  }

  const editing = !!draft;
  return <Modal icon="link" modalStyle={{ maxWidth: 880 }} title={editing ? "Edit links" : "Links"}
    headExtra={!editing && links && <button type="button" className="iconbtn" title="Edit links" aria-label="Edit links" style={{ marginLeft: "auto" }} onClick={() => setDraft(toDraft(links))}><Icon name="pencil" /></button>}
    footer={editing && <>
      <button type="button" className="btn link" style={{ marginRight: "auto" }} onClick={() => setDraft(toDraft(defaultLinks()))}><Icon name="rotate-ccw" />Reset to default</button>
      <button type="button" className="btn ghost" onClick={() => setDraft(null)}>Cancel</button>
      <button type="button" className="btn" disabled={saving} onClick={save}><Icon name="save" />Save links</button>
    </>}>
    {!links ? <div className="state"><div className="spinner" /></div>
      : !editing ? <LinkSections links={links} />
        : <>
          <div>{draft.map((section) => <div className="lke-sec" key={section.id}>
            <div className="sh"><input className="st" placeholder="Section name" aria-label="Section name" value={section.title}
              onChange={(event) => updateSection(section.id, (item) => ({ ...item, title: event.target.value }))} />
              <button type="button" className="iconbtn mini" title="Remove section" aria-label="Remove section" onClick={() => setDraft(draft.filter((item) => item.id !== section.id))}><Icon name="trash-2" /></button></div>
            <div className="rows">{section.links.map((link) => <div className="lke-row" key={link.id}>
              <input className="nm" placeholder="Name" aria-label="Link name" value={link.name}
                onChange={(event) => updateSection(section.id, (item) => ({ ...item, links: item.links.map((row) => (row.id === link.id ? { ...row, name: event.target.value } : row)) }))} />
              <input className="url" placeholder="https://…" aria-label="Link address" value={link.url}
                onChange={(event) => updateSection(section.id, (item) => ({ ...item, links: item.links.map((row) => (row.id === link.id ? { ...row, url: event.target.value } : row)) }))} />
              <button type="button" className="iconbtn mini" title="Remove link" aria-label="Remove link"
                onClick={() => updateSection(section.id, (item) => ({ ...item, links: item.links.filter((row) => row.id !== link.id) }))}><Icon name="x" /></button>
            </div>)}</div>
            <button type="button" className="btn link" onClick={() => updateSection(section.id, (item) => ({ ...item, links: [...item.links, { id: nextId(), name: "", url: "" }] }))}><Icon name="plus" />Add link</button>
          </div>)}</div>
          <button type="button" className="btn outline round sm" onClick={() => setDraft([...draft, { id: nextId(), title: "", icon: "folder", key: "", links: [{ id: nextId(), name: "", url: "" }] }])}><Icon name="folder-plus" />Add section</button>
          {!shared && <div className="help" style={{ marginTop: 10 }}>Links table not set up yet — edits save on this computer only. Run migrate-links.sql to share with the team.</div>}
        </>}
  </Modal>;
}
