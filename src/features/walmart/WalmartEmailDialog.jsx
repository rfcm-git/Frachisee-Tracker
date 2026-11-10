import { useMemo } from "react";
import EmailTemplateEditor from "../../components/email/EmailTemplateEditor.jsx";
import { franchiseeName } from "../../domain/context.js";
import { emailOf } from "../../domain/records.js";
import { normalizeWmStage } from "../../domain/walmart.js";
import {
  DEFAULT_WM_EMAIL, WM_EMAIL_FIELDS, WM_EMAIL_MULTI_FIELDS, WM_EMAIL_PREFIX, buildWalmartEmail, buildWalmartEmailMulti, wmCanEmail, wmFranchiseeRecords,
} from "../../domain/walmartEmail.js";
import { compareNumbers } from "../../lib/text.js";
import { useDataContext } from "../../state/dataStore.js";
import { currentWmEmail, saveWmEmail, savedWmEmail } from "./walmartEmailActions.js";

const STAGES = ["Awaiting App", "Payment Setup"];

/**
 * Edit the Walmart email messages — Awaiting App and Payment Setup, each for one store and for several stores —
 * and the CC rules, with a live preview. previewId picks the Walmart record shown first.
 */
export default function WalmartEmailDialog({ previewId = null }) {
  const ctx = useDataContext();
  const records = useMemo(() => ctx.walmart.filter(wmCanEmail).sort((a, b) => compareNumbers(a.store_num, b.store_num)), [ctx.walmart]);

  const ownerEmail = (record) => {
    const store = ctx.storeByNum.get(String(record.store_num));
    const owner = store ? ctx.frById.get(store.franchisee_id) : null;
    return owner ? emailOf(owner) : "";
  };
  const optionsFor = (stage) => records.filter((record) => normalizeWmStage(record.stage) === stage).map((record) => {
    const store = ctx.storeByNum.get(String(record.store_num));
    const name = store ? franchiseeName(ctx, store.franchisee_id) : "";
    return { id: record.id, label: `Store ${record.store_num}${name ? ` · ${name}` : ""}${ownerEmail(record) ? "" : " · no email"}` };
  });
  const multiOptionsFor = (stage) => {
    const seen = new Set();
    return records.filter((record) => normalizeWmStage(record.stage) === stage).flatMap((record) => {
      const store = ctx.storeByNum.get(String(record.store_num));
      const group = wmFranchiseeRecords(ctx, record);
      if (!store || group.length < 2 || seen.has(store.franchisee_id)) return [];
      seen.add(store.franchisee_id);
      return [{ id: record.id, label: `${franchiseeName(ctx, store.franchisee_id) || "Franchisee"} · ${group.length} stores` }];
    }).sort((a, b) => a.label.localeCompare(b.label));
  };
  const find = (id) => records.find((item) => item.id === id);
  const picked = previewId != null ? find(previewId) : null;
  const pickedStage = picked ? normalizeWmStage(picked.stage) : STAGES[0];

  const modes = STAGES.flatMap((stage) => {
    const prefix = WM_EMAIL_PREFIX[stage];
    const options = optionsFor(stage);
    const firstWithEmail = options.find((option) => ownerEmail(find(option.id)))?.id ?? options[0]?.id ?? null;
    return [
      { key: `${prefix}One`, label: `${stage} · one store`, icon: "store", keys: { subject: `${prefix}Subject`, body: `${prefix}Body` },
        fields: WM_EMAIL_FIELDS, previewOptions: options, initialPreviewId: picked && pickedStage === stage ? picked.id : firstWithEmail,
        buildPreview: (values, id) => buildWalmartEmail(ctx, find(id), values),
        emptyPreviewText: `No store is at ${stage} right now.` },
      { key: `${prefix}Multi`, label: `${stage} · several stores`, icon: "layers", multi: true, keys: { subject: `${prefix}MultiSubject`, body: `${prefix}MultiBody` },
        fields: WM_EMAIL_MULTI_FIELDS, previewOptions: multiOptionsFor(stage),
        buildPreview: (values, id) => { const record = find(id); return buildWalmartEmailMulti(ctx, record, wmFranchiseeRecords(ctx, record), values); },
        emptyPreviewText: `No franchisee has two or more stores at ${stage} right now.`,
        help: <>Used when you choose <b>All of this franchisee's stores at {stage}</b> on the email button. {"{{Stores}}"} lists each store with its address.</> },
    ];
  });

  return <EmailTemplateEditor title="Walmart email messages"
    subtitle="Used by the email button on stores at Awaiting App or Payment Setup. Opens in Outlook and saves the date emailed."
    modes={modes} initialMode={`${WM_EMAIL_PREFIX[pickedStage]}One`}
    initial={currentWmEmail(ctx)} defaults={DEFAULT_WM_EMAIL}
    neverSaved={savedWmEmail(ctx) === null}
    starterText={<>These are starter messages for Awaiting App and Payment Setup. Edit them and click <b>Save message</b> — then the email button on each store is ready to use.</>}
    onSave={saveWmEmail} />;
}
