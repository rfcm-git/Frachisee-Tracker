import { useMemo } from "react";
import EmailTemplateEditor from "../../components/email/EmailTemplateEditor.jsx";
import { franchiseeName } from "../../domain/context.js";
import { obIsOpen, obOnEzTab, obOnTab } from "../../domain/onboarding.js";
import { DEFAULT_EZ_EMAIL, DEFAULT_OB_EMAIL, OB_EMAIL_FIELDS, OB_EMAIL_MULTI_FIELDS, OB_EMAIL_NOTE, buildOnboardingEmail, buildOnboardingEmailMulti, obFranchiseeStores } from "../../domain/onboardingEmail.js";
import { emailOf } from "../../domain/records.js";
import { compareNumbers } from "../../lib/text.js";
import { useDataContext } from "../../state/dataStore.js";
import { currentObEmail, saveObEmail, savedObEmail } from "./onboardingEmailActions.js";

/**
 * Edit the onboarding email (subject, message and CC rules) with a live preview for one store.
 * previewId picks the onboarding record whose store is shown in the preview.
 * scope: "ob" for the Onboarding tab's email, "ez" for the ezCater tab's email.
 */
export default function OnboardingEmailDialog({ previewId = null, scope = "ob" }) {
  const ctx = useDataContext();
  const ez = scope === "ez";
  const onTab = ez ? obOnEzTab : obOnTab;
  // One preview option per store: its open record (or latest record) stands for the store.
  const records = useMemo(() => {
    const byStore = new Map();
    ctx.onboarding.filter(onTab).forEach((record) => {
      const key = String(record.store_num);
      const current = byStore.get(key);
      if (!current || (obIsOpen(record) && !obIsOpen(current))) byStore.set(key, record);
    });
    return [...byStore.values()].sort((a, b) => compareNumbers(a.store_num, b.store_num));
  }, [ctx.onboarding, onTab]);
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
  // Several-stores preview: one option per franchisee with two or more stores still being onboarded.
  const seen = new Set();
  const multiOptions = records.flatMap((record) => {
    const store = ctx.storeByNum.get(String(record.store_num));
    if (!store || seen.has(store.franchisee_id)) return [];
    const stores = obFranchiseeStores(ctx, record);
    if (stores.length < 2) return [];
    seen.add(store.franchisee_id);
    return [{ id: record.id, label: `${franchiseeName(ctx, store.franchisee_id) || "Franchisee"} · ${stores.length} stores` }];
  }).sort((a, b) => a.label.localeCompare(b.label));

  return <EmailTemplateEditor title={ez ? "ezCater email message" : "Onboarding email message"}
    subtitle={ez ? `Used by the email button on each ezCater store. Opens in Outlook and adds “${OB_EMAIL_NOTE}” to its updates.`
      : `Used by the email button on each onboarding row. One email covers the store's platforms still being onboarded; “${OB_EMAIL_NOTE}” is added to their updates.`}
    fields={OB_EMAIL_FIELDS} initial={currentObEmail(ctx, scope)} defaults={ez ? DEFAULT_EZ_EMAIL : DEFAULT_OB_EMAIL}
    neverSaved={savedObEmail(ctx, scope) === null}
    starterText={<>This is a starter message. Edit it and click <b>Save message</b> — then the email button on each {ez ? "ezCater store" : "onboarding row"} is ready to use.</>}
    previewOptions={options} initialPreviewId={pickedOption?.id ?? firstWithEmail?.id ?? null}
    buildPreview={(values, id) => buildOnboardingEmail(ctx, records.find((item) => item.id === id), values)}
    emptyPreviewText={ez ? "Add a store to the ezCater tab to see a preview." : "Add a store to onboarding to see a preview."}
    multi={{
      fields: OB_EMAIL_MULTI_FIELDS, previewOptions: multiOptions,
      buildPreview: (values, id) => { const record = records.find((item) => item.id === id); return buildOnboardingEmailMulti(ctx, record, obFranchiseeStores(ctx, record), values); },
      emptyPreviewText: ez ? "No franchisee has two or more stores being onboarded on ezCater yet." : "No franchisee has two or more stores being onboarded yet.",
      help: <>Used when you choose <b>All stores of this franchisee</b> on the email button. {"{{Stores}}"} lists each store with its address{ez ? "" : " and the platforms still being onboarded"}.</>,
    }}
    onSave={(values) => saveObEmail(values, scope)} />;
}
