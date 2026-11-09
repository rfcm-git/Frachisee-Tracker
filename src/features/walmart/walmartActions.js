/* Saving Walmart records. The store's Walmart status (Delivery Platforms) always follows the saved stage. */
import { TABLES, insertRows, mergeRowSave } from "../../services/api.js";
import { addRows, replaceRow } from "../../state/dataStore.js";
import { normalizeWmStage, wmHistory, wmPlatformStatus } from "../../domain/walmart.js";
import { nowIso } from "../../lib/format.js";
import { syncStorePlatforms } from "../stores/storeActions.js";

const isDuplicateError = (error) => error?.code === "23505";

const chunks = (list, size) => {
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
};

const failText = (result) => (result.error ? result.error.message || "error" : result.gone ? "was removed by a teammate" : "kept changing — try again");

/**
 * Saves an import plan: adds the new stores, changes the stages that differ, then sets each store's
 * Walmart status to match its stage. onProgress(done, total).
 * Returns { added, changed, synced, failures: [text], error }.
 */
export async function runWalmartImport(plan, onProgress = () => {}) {
  const syncRows = plan.storeSync;
  const total = plan.adds.length + plan.changes.length + syncRows.length;
  const failures = [];
  const saved = new Set();
  let added = 0;
  let changed = 0;
  let done = 0;
  let error = null;
  const step = (amount = 1) => { done += amount; onProgress(done, total); };

  try {
    for (const part of chunks(plan.adds, 200)) {
      const ts = nowIso();
      const result = await insertRows(TABLES.walmart, part.map((row) => ({
        store_num: row.num, stage: row.stage, notes: "", created_at: ts, updated_at: ts,
        history: [{ ts, kind: "created", source: "import", stage: row.stage }],
      })));
      if (result.error) {
        if (!isDuplicateError(result.error)) throw result.error;
        failures.push(`Some of stores ${part.map((row) => row.num).join(", ")} were added by a teammate meanwhile — click Refresh and import again`);
      } else {
        addRows("walmart", result.rows);
        result.rows.forEach((row) => saved.add(String(row.store_num)));
        added += result.rows.length;
      }
      step(part.length);
    }

    for (const part of chunks(plan.changes, 6)) {
      await Promise.all(part.map(async (row) => {
        const result = await mergeRowSave(TABLES.walmart, row.existingId, (fresh) => {
          const ts = nowIso();
          const from = normalizeWmStage(fresh.stage);
          return { stage: row.stage, updated_at: ts, history: [...wmHistory(fresh), { ts, kind: "update", source: "import", from, to: row.stage }] };
        });
        if (result.row) { replaceRow("walmart", result.row); saved.add(row.num); changed += 1; }
        else failures.push(`Store ${row.num}: ${failText(result)}`);
        step();
      }));
    }
  } catch (caught) {
    error = caught;
  }

  // Only stores whose Walmart record is saved (or already had this stage) get the new status, so the two never disagree.
  const items = syncRows.filter((row) => row.kind === "same" || saved.has(row.num))
    .map((row) => ({ num: row.num, platform: "wm", status: wmPlatformStatus(row.stage) }));
  try {
    await syncStorePlatforms(items);
  } catch (caught) {
    error = error || caught;
  }
  step(syncRows.length);
  return { added, changed, synced: items.length, failures, ...(error ? { error } : {}) };
}
