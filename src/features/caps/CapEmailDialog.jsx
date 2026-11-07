import { useMemo } from "react";
import EmailTemplateEditor from "../../components/email/EmailTemplateEditor.jsx";
import { CAP_EMAIL_FIELDS, CAP_EMAIL_STATUS, DEFAULT_CAP_EMAIL, buildCapEmail } from "../../domain/capEmail.js";
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

  return <EmailTemplateEditor title="CAP email message"
    subtitle={`Used by the email button on each store. Opens in Outlook and sets the status to ${CAP_EMAIL_STATUS}.`}
    fields={CAP_EMAIL_FIELDS} initial={currentCapEmail(ctx)} defaults={DEFAULT_CAP_EMAIL}
    neverSaved={savedCapEmail(ctx) === null}
    starterText={<>This is a starter message. Edit it and click <b>Save message</b> — then the email button on each store is ready to use.</>}
    previewOptions={options} initialPreviewId={previewCapId ?? firstWithEmail?.id ?? null}
    buildPreview={(values, id) => buildCapEmail(ctx, records.find((item) => item.id === id), values)}
    emptyPreviewText="Add a store to the CAP list to see a preview."
    onSave={saveCapEmail} />;
}
