import { useMemo } from "react";
import EmailTemplateEditor from "../../components/email/EmailTemplateEditor.jsx";
import { franchiseeName } from "../../domain/context.js";
import { obIsOpen, obVisible } from "../../domain/onboarding.js";
import { DEFAULT_OB_EMAIL, OB_EMAIL_FIELDS, OB_EMAIL_NOTE, buildOnboardingEmail } from "../../domain/onboardingEmail.js";
import { emailOf } from "../../domain/records.js";
import { compareNumbers } from "../../lib/text.js";
import { useDataContext } from "../../state/dataStore.js";
import { currentObEmail, saveObEmail, savedObEmail } from "./onboardingEmailActions.js";

/**
 * Edit the onboarding email (subject, message and CC rules) with a live preview for one store.
 * previewId picks the onboarding record whose store is shown in the preview.
 */
export default function OnboardingEmailDialog({ previewId = null }) {
  const ctx = useDataContext();
  // One preview option per store: its open record (or latest record) stands for the store.
  const records = useMemo(() => {
    const byStore = new Map();
    ctx.onboarding.filter(obVisible).forEach((record) => {
      const key = String(record.store_num);
      const current = byStore.get(key);
      if (!current || (obIsOpen(record) && !obIsOpen(current))) byStore.set(key, record);
    });
    return [...byStore.values()].sort((a, b) => compareNumbers(a.store_num, b.store_num));
  }, [ctx.onboarding]);
  const ownerOf = (record) => {
    const store = ctx.storeByNum.get(String(record.store_num));
    return store ? ctx.frById.get(store.franchisee_id) : null;
  };
  const options = records.map((record) => {
    const owner = ownerOf(record);
    const store = ctx.storeByNum.get(String(record.store_num));
    const name = store ? franchiseeName(ctx, store.franchisee_id) : "";
    return { id: record.id, label: `Store ${record.store_num}${name ? ` · ${name}` : ""}${owner && emailOf(owner) ? "" : " · no email"}` };
  });
  const picked = previewId != null ? ctx.onboarding.find((item) => item.id === previewId) : null;
  const pickedOption = picked ? records.find((record) => String(record.store_num) === String(picked.store_num)) : null;
  const firstWithEmail = records.find((record) => { const owner = ownerOf(record); return owner && emailOf(owner); }) || records[0];

  return <EmailTemplateEditor title="Onboarding email message"
    subtitle={`Used by the email button on each onboarding row. One email covers the store's platforms still being onboarded; “${OB_EMAIL_NOTE}” is added to their updates.`}
    fields={OB_EMAIL_FIELDS} initial={currentObEmail(ctx)} defaults={DEFAULT_OB_EMAIL}
    neverSaved={savedObEmail(ctx) === null}
    starterText={<>This is a starter message. Edit it and click <b>Save message</b> — then the email button on each onboarding row is ready to use.</>}
    previewOptions={options} initialPreviewId={pickedOption?.id ?? firstWithEmail?.id ?? null}
    buildPreview={(values, id) => buildOnboardingEmail(ctx, records.find((item) => item.id === id), values)}
    emptyPreviewText="Add a store to onboarding to see a preview."
    onSave={saveObEmail} />;
}
