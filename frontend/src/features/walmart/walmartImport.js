/*
 * Walmart's report: reading and checking rows before anything is saved.
 * Only four columns are read: DFP/BD (only "Marwaha" rows are kept), Restaurant # (the Store #),
 * Primary Owner Name (the franchisee) and Stage. Every other column is ignored.
 * The imported stage wins: the Walmart record and the store's Walmart status (Delivery Platforms) follow it.
 */
import { WM_STAGES } from "../../config/constants.js";
import { franchiseeName } from "../../domain/context.js";
import { platformStatus } from "../../domain/records.js";
import { normalizeWmStage, readWmStage, wmPlatformStatus } from "../../domain/walmart.js";
import { cleanStoreNumber, compareNumbers, normalizeName } from "../../lib/text.js";
import { loadXlsx } from "../../lib/xlsx.js";

export const WM_COLUMNS = ["DFP/BD", "Restaurant #", "Primary Owner Name", "Stage"];

/** Field of each column, with the header spellings accepted for it. */
const HEADERS = {
  group: ["dfp / bd", "dfp / db", "dfp", "bd", "dfp bd"],
  num: ["restaurant #", "restaurant", "restaurant number", "restaurant no", "store #", "store number", "store"],
  owner: ["primary owner name", "primary owner", "owner name", "owner", "franchisee", "franchisee name"],
  stage: ["stage", "status"],
};

const headerKey = (value) => String(value || "").replace(/\*/g, "").toLowerCase().replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ").trim();
const fieldOfHeader = (value) => Object.keys(HEADERS).find((field) => HEADERS[field].includes(headerKey(value))) || null;

/** Same person whatever the word order or punctuation: "Lakha, Madhu" = "Madhu Lakha". */
const nameKey = (value) => normalizeName(value).replace(/[.,]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
export const sameOwner = (a, b) => nameKey(a) === nameKey(b);

/** True for the Marwaha group ("Marwaha", "MARWAHA ", "Marwaha Group"). */
export const isMarwaha = (value) => /\bmarwaha\b/i.test(String(value || ""));

/* ---------- reading ---------- */

/** Reads the file. Returns { rows: [{ row, values }], sheet } or { error }. */
export async function readWalmartFile(file) {
  const XLSX = await loadXlsx();
  let workbook;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  } catch {
    return { error: "Couldn't read that file. Save it as .xlsx or .csv and try again." };
  }
  for (const name of workbook.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: false, blankrows: true });
    const headerIndex = grid.slice(0, 15).findIndex((cells) => cells.some((cell) => fieldOfHeader(cell) === "num"));
    if (headerIndex < 0) continue;
    const columns = grid[headerIndex].map(fieldOfHeader);
    // The first column of each kind wins, so a later "Store" or "Status" column can't replace it.
    const seen = new Set();
    const picked = columns.map((field) => (field && !seen.has(field) ? (seen.add(field), field) : null));
    const missing = ["group", "num", "owner", "stage"].filter((field) => !seen.has(field));
    if (missing.includes("group")) return { error: `The "DFP/BD" column is missing, so the Marwaha rows can't be picked out. The report needs: ${WM_COLUMNS.join(" | ")}.` };
    if (missing.includes("stage")) return { error: `The "Stage" column is missing. The report needs: ${WM_COLUMNS.join(" | ")}.` };
    const rows = grid.slice(headerIndex + 1).map((cells, index) => ({
      row: headerIndex + index + 2,
      values: Object.fromEntries(picked.map((field, column) => [field, String(cells[column] ?? "").trim()]).filter(([field]) => field)),
    })).filter((entry) => Object.values(entry.values).some(Boolean));
    return { rows, sheet: name };
  }
  return { error: `No "Restaurant #" column found. Upload Walmart's report — it needs: ${WM_COLUMNS.join(" | ")}.` };
}

/* ---------- checking ---------- */

/**
 * Checks the Marwaha rows against the store list and the Walmart tab, without saving.
 * Each row: { row, num, owner, stage, ok, kind, reason, msg, warnings, franchisee, existingId, before, storeBefore, storeAfter }.
 *   kind (ok rows):      "new" (not on the tab yet) | "change" (stage differs) | "same"
 *   reason (skipped):    "missingNum" | "repeat" | "missingStage" | "badStage" | "notFound" (Store # not in the tracker)
 *   warnings:            "Primary Owner Name is missing" / owner differs from the tracker's franchisee
 * Returns { rows, others (rows of other DFP/BD groups, ignored), adds, changes, same, storeSync, skipped, notInFile }.
 */
export function planWalmartImport(ctx, parsed) {
  const seen = {};
  const marwaha = parsed.rows.filter(({ values }) => isMarwaha(values.group));
  const rows = marwaha.map(({ row, values }) => {
    const out = { row, num: cleanStoreNumber(values.num), owner: String(values.owner || "").replace(/\s+/g, " ").trim(), stage: "", ok: false, kind: "", reason: "", msg: "", warnings: [] };
    const skip = (reason, msg) => Object.assign(out, { reason, msg });
    if (!out.num) return skip("missingNum", "Restaurant # is missing");
    if (seen[out.num]) return skip("repeat", `Duplicate Restaurant # — store ${out.num} is also on row ${seen[out.num]}`);
    seen[out.num] = row;
    const stage = readWmStage(values.stage);
    if (stage === "") return skip("missingStage", "Stage is missing");
    if (stage === null) return skip("badStage", `Unrecognized stage "${values.stage}" — use ${WM_STAGES.join(", ")}`);
    out.stage = stage;
    const store = ctx.storeByNum.get(out.num);
    if (!store) return skip("notFound", `Store ${out.num} is not in the tracker — add it under Franchisees first`);

    out.franchisee = franchiseeName(ctx, store.franchisee_id);
    if (!out.owner) out.warnings.push("Primary Owner Name is missing");
    else if (out.franchisee && !sameOwner(out.owner, out.franchisee)) out.warnings.push(`Walmart lists ${out.owner}; the tracker has ${out.franchisee}`);

    out.storeBefore = platformStatus(store, "wm");
    out.storeAfter = wmPlatformStatus(stage);
    const existing = ctx.walmart.find((record) => String(record.store_num) === out.num);
    out.ok = true;
    if (!existing) {
      out.kind = "new";
      out.msg = `New · ${stage}`;
    } else {
      out.existingId = existing.id;
      out.before = normalizeWmStage(existing.stage);
      out.kind = out.before === stage ? "same" : "change";
      out.msg = out.kind === "change" ? `${out.before} → ${stage}` : `Already ${stage}`;
    }
    return out;
  });

  const ok = rows.filter((row) => row.ok);
  const inFile = new Set(rows.map((row) => row.num).filter(Boolean));
  return {
    rows,
    total: parsed.rows.length,
    others: parsed.rows.length - marwaha.length,
    adds: ok.filter((row) => row.kind === "new"),
    changes: ok.filter((row) => row.kind === "change"),
    same: ok.filter((row) => row.kind === "same"),
    storeSync: ok.filter((row) => row.storeBefore !== row.storeAfter),
    warned: ok.filter((row) => row.warnings.length),
    skipped: rows.filter((row) => !row.ok),
    notInFile: ctx.walmart.filter((record) => !inFile.has(String(record.store_num)))
      .map((record) => ({ num: String(record.store_num), stage: normalizeWmStage(record.stage) }))
      .sort((a, b) => compareNumbers(a.num, b.num)),
  };
}

/** Number of saves the plan makes (new + stage changes + store-status-only updates). */
export const planCount = (plan) => plan.adds.length + plan.changes.length + plan.storeSync.filter((row) => row.kind === "same").length;
