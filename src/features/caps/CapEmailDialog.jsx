import { useMemo } from "react";
import EmailTemplateEditor from "../../components/email/EmailTemplateEditor.jsx";
import { CAP_EMAIL_FIELDS, CAP_EMAIL_MULTI_FIELDS, CAP_EMAIL_STATUS, DEFAULT_CAP_EMAIL, buildCapEmail, buildCapEmailMulti, capFranchiseeRecords } from "../../domain/capEmail.js";
import { franchiseeName } from "../../domain/context.js";
import { capContact } from "../../domain/caps.js";
import { compareNumbers } from "../../lib/text.js";
import { useDataContext } from "../../state/dataStore.js";
import { currentCapEmail, saveCapEmail, savedCapEmail } from "./capEmailActions.js";

/**
 * Edit the CAP email (subject, message and CC rules) with a live preview for one store.
 * previewCapId picks the store shown in the preview.
 */
export default function CapEmailDialog({ previewCapId = null }) {
  const ctx = useDataContext();
  const records = useMemo(() => ctx.caps.slice().sort((a, b) => compareNumbers(a.store_num, b.store_num)), [ctx.caps]);
  const options = useMemo(() => records.map((item) => {
    const contact = capContact(ctx, item);
    return { id: item.id, label: `Store ${item.store_num}${contact.name ? ` · ${contact.name}` : ""}${contact.email ? "" : " · no email"}` };
  }), [ctx, records]);
  const firstWithEmail = records.find((record) => capContact(ctx, record).email) || records[0];
  // Several-stores preview: one option per franchisee with two or more stores in the CAP list that are not Completed.
  const multiOptions = useMemo(() => {
    const seen = new Set();
    return records.flatMap((record) => {
      const group = capFranchiseeRecords(ctx, record);
      const store = ctx.storeByNum.get(String(record.store_num));
      if (group.length < 2 || !store || seen.has(store.franchisee_id)) return [];
      seen.add(store.franchisee_id);
      return [{ id: record.id, label: `${franchiseeName(ctx, store.franchisee_id) || "Franchisee"} · ${group.length} stores` }];
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [ctx, records]);

  return <EmailTemplateEditor title="CAP email message"
    subtitle={`Used by the email button on each store. Opens in Outlook and sets the status to ${CAP_EMAIL_STATUS}.`}
    fields={CAP_EMAIL_FIELDS} initial={currentCapEmail(ctx)} defaults={DEFAULT_CAP_EMAIL}
    neverSaved={savedCapEmail(ctx) === null}
    starterText={<>This is a starter message. Edit it and click <b>Save message</b> — then the email button on each store is ready to use.</>}
    previewOptions={options} initialPreviewId={previewCapId ?? firstWithEmail?.id ?? null}
    buildPreview={(values, id) => buildCapEmail(ctx, records.find((item) => item.id === id), values)}
    emptyPreviewText="Add a store to the CAP list to see a preview."
    multi={{
      fields: CAP_EMAIL_MULTI_FIELDS, previewOptions: multiOptions,
      buildPreview: (values, id) => { const record = records.find((item) => item.id === id); return buildCapEmailMulti(ctx, record, capFranchiseeRecords(ctx, record), values); },
      emptyPreviewText: "No franchisee has two or more open stores in the CAP list yet.",
      help: <>Used when you choose <b>All stores of this franchisee</b> on the email button. {"{{Stores}}"} lists each store with its address and due date.</>,
    }}
    onSave={saveCapEmail} />;
}
