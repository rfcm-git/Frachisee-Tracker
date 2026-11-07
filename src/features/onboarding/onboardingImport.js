/*
 * Onboarding spreadsheet: template, reading and checking rows.
 * One row per store: Store Number, a column per platform marked Y, an optional Status and Details.
 * Each marked platform becomes one store + platform item. Items already on the onboarding list are not added again:
 * they are updated when the status differs or Details is filled in, and left alone otherwise.
 * Nothing is saved here — the import dialog shows the plan first, then onboardingActions.saveOnboardingPlan saves it.
 */
import { OB_PLATFORMS, OB_STATES } from "../../config/constants.js";
import { cleanStoreNumber } from "../../lib/text.js";
import { loadXlsx } from "../../lib/xlsx.js";
import { latestOnboarding, storePlatformStatuses } from "./onboardingSelectors.js";

const SHEET_NAME = "Onboarding";
const PLATFORM_COLUMNS = OB_PLATFORMS.map(([, name]) => name);
/** Columns of the template, in order. */
export const OB_COLUMNS = ["Store Number", ...PLATFORM_COLUMNS, "Status", "Details"];
const COLUMN_WIDTHS = [14, ...PLATFORM_COLUMNS.map(() => 11), 18, 50];

/** Field of each column, with the header spellings accepted for it. Other columns are ignored. */
const HEADERS = {
  num: ["store number", "store #", "store", "store no", "store num"],
  ue: ["uber eats", "ubereats", "uber", "ue"],
  dd: ["doordash", "door dash", "dd"],
  gh: ["grubhub", "grub hub", "gh"],
  ez: ["ezcater", "ez cater", "ez"],
  wm: ["walmart", "wal mart", "wm"],
  status: ["status", "onboarding status"],
  details: ["details", "notes", "note", "onboarding details", "comments"],
};

/** Values that mark a platform. Blank (or anything in NO) leaves it out. */
const YES = ["y", "yes", "x", "1", "true", "✓", "✔"];
const NO = ["", "n", "no", "0", "false", "-"];

/** File status -> status. A blank status means Not enrolled. Old names are accepted. */
const STATUS_WORDS = {
  "": "Not enrolled", "not enrolled": "Not enrolled", "not onboarded": "Not enrolled", pending: "Not enrolled", new: "Not enrolled",
  "work in progress": "Work in Progress", wip: "Work in Progress", "in progress": "Work in Progress", "email sent": "Work in Progress", "email sent/text message": "Work in Progress",
  onboarded: "Onboarded", active: "Onboarded", done: "Onboarded",
  exempted: "Exempted", exempt: "Exempted",
};

const words = (value) => String(value || "").toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
const headerKey = (value) => String(value || "").replace(/\*/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const fieldOfHeader = (value) => Object.keys(HEADERS).find((field) => HEADERS[field].includes(headerKey(value))) || null;

/** One of OB_STATES, or null when the value is not known. */
export const readObStatus = (value) => STATUS_WORDS[words(value)] ?? null;

/** true (marked), false (blank / no) or null (not understood). */
export function readMark(value) {
  const text = words(value);
  if (YES.includes(text)) return true;
  if (NO.includes(text)) return false;
  return null;
}

/* ---------- template ---------- */

function instructionsSheet(XLSX) {
  /** marked = platform keys with a Y. */
  const example = (num, marked, status, details) => [num, ...OB_PLATFORMS.map(([key]) => (marked.includes(key) ? "Y" : "")), status, details];
  const sheet = XLSX.utils.aoa_to_sheet([
    ["How to fill the Onboarding sheet"], [""],
    ["• One row = one store. Store Number is required and must be unique in the file. The store must already be in All Stores."],
    [`• Put Y under each platform to onboard (${PLATFORM_COLUMNS.join(", ")}). Leave the others blank. Each Y becomes its own onboarding record.`],
    [`• Status is optional: ${OB_STATES.join(", ")}. A blank Status means Not enrolled. The same status is set in the store's Delivery Platforms.`],
    ["• Details is optional: what was requested or done, e.g. \"New owner, links sent by email\"."],
    ["• A store + platform already on the onboarding list is not added again. It is updated when the Status is different or Details is filled in (Details is added as a progress update); otherwise it is left as it is."],
    ["• A platform where the store is already Onboarded or Exempted keeps that status."],
    ["• For a store + platform already on the list, a blank Status keeps its current status."],
    ["• Nothing is saved until you check the preview and click Import in the app."], [""],
    ["Example rows (do not paste these into the Onboarding sheet):"],
    OB_COLUMNS,
    example("99901", ["ue", "dd"], "", "New owner wants Uber Eats and DoorDash"),
    example("99902", ["gh", "wm"], "Work in Progress", "Sent the onboarding links by text"),
    [""],
    ["Row 1: adds store 99901 on Uber Eats and DoorDash as Not enrolled. Row 2: adds store 99902 on Grubhub and Walmart as Work in Progress."],
  ]);
  sheet["!cols"] = COLUMN_WIDTHS.map((wch) => ({ wch }));
  return sheet;
}

export async function downloadOnboardingTemplate() {
  const XLSX = await loadXlsx();
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([OB_COLUMNS]);
  sheet["!cols"] = COLUMN_WIDTHS.map((wch) => ({ wch }));
  OB_COLUMNS.forEach((_, column) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (cell) cell.s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "008938" } } };
  });
  XLSX.utils.book_append_sheet(workbook, sheet, SHEET_NAME);
  XLSX.utils.book_append_sheet(workbook, instructionsSheet(XLSX), "Instructions");
  XLSX.writeFile(workbook, "onboarding-template.xlsx");
}

/* ---------- reading ---------- */

/** Reads the file. Returns { rows: [{ row, values }] } or { error }. */
export async function readOnboardingFile(file) {
  const XLSX = await loadXlsx();
  let workbook;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  } catch {
    return { error: "Couldn't read that file. Save it as .xlsx or .csv and try again." };
  }
  const names = [...workbook.SheetNames].sort((a, b) => (b === SHEET_NAME) - (a === SHEET_NAME));
  for (const name of names.filter((sheetName) => sheetName !== "Instructions")) {
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: false, blankrows: true });
    const headerIndex = grid.slice(0, 10).findIndex((cells) => cells.some((cell) => fieldOfHeader(cell) === "num"));
    if (headerIndex < 0) continue;
    const columns = grid[headerIndex].map(fieldOfHeader);
    if (!OB_PLATFORMS.some(([key]) => columns.includes(key))) {
      return { error: `No platform columns found. Use the template — its columns are: ${OB_COLUMNS.join(" | ")}.` };
    }
    const rows = grid.slice(headerIndex + 1).map((cells, index) => ({
      row: headerIndex + index + 2,
      values: Object.fromEntries(columns.map((field, column) => [field, String(cells[column] ?? "").trim()]).filter(([field]) => field)),
    })).filter((entry) => Object.values(entry.values).some(Boolean));
    return { rows };
  }
  return { error: `No "Store Number" column found. Use the template — its columns are: ${OB_COLUMNS.join(" | ")}.` };
}

/* ---------- checking ---------- */

/**
 * Checks every row against the store list and the onboarding list, without saving.
 * Each row: { row, num, status, details, ok, reason, msg, items: [{ platform, kind, before, after }] }.
 * item kind: "new" | "update" (on the list, status differs or Details filled in) | "same" (on the list, nothing to change).
 * reason (skipped rows): "missing" | "repeat" | "notFound" | "noPlatform" | "badMark" | "badStatus".
 * Returns the rows plus make / updates ready for saveOnboardingPlan, and counts for the summary.
 */
export function planOnboardingImport(ctx, parsed) {
  const seen = {};
  const make = [];
  const updates = [];
  const rows = parsed.rows.map(({ row, values }) => {
    const out = { row, num: cleanStoreNumber(values.num), status: "", details: String(values.details || "").trim(), ok: false, reason: "", msg: "", items: [] };
    const skip = (reason, msg) => Object.assign(out, { reason, msg });
    if (!out.num) return skip("missing", "Store Number is missing");
    if (seen[out.num]) return skip("repeat", `Store ${out.num} is repeated (row ${seen[out.num]})`);
    seen[out.num] = row;
    if (!ctx.storeByNum.has(out.num)) return skip("notFound", `Store ${out.num} is not in the database`);
    const unclear = OB_PLATFORMS.filter(([key]) => readMark(values[key]) === null);
    if (unclear.length) {
      const [key, name] = unclear[0];
      return skip("badMark", `${name} "${values[key]}" is not understood — use Y or leave it blank`);
    }
    const platforms = OB_PLATFORMS.filter(([key]) => readMark(values[key])).map(([key]) => key);
    if (!platforms.length) return skip("noPlatform", "No platform marked with Y");
    const statusGiven = !!String(values.status || "").trim();
    out.status = readObStatus(values.status);
    if (!out.status) return skip("badStatus", `Status "${values.status}" is not known — use ${OB_STATES.join(", ")}`);

    out.ok = true;
    const statuses = storePlatformStatuses(ctx, out.num);
    platforms.forEach((platform) => {
      const record = latestOnboarding(ctx, out.num, platform);
      if (!record) {
        // The store wins when it is already Onboarded or Exempted on the platform.
        const delivery = statuses.find((entry) => entry.key === platform)?.delivery;
        const kept = delivery === "Onboarded" || delivery === "Exempted";
        const after = kept ? delivery : out.status;
        out.items.push({ platform, kind: "new", before: "", after, kept });
        make.push({ num: out.num, platform, exempt: delivery === "Exempted", status: after, details: out.details, group: out.num });
        return;
      }
      // On the list already: a blank Status keeps the record's status.
      const target = statusGiven ? out.status : record.status;
      if (record.status !== target || out.details) {
        out.items.push({ platform, kind: "update", before: record.status, after: target });
        updates.push({ num: out.num, platform, record, status: target, text: out.details });
      } else {
        out.items.push({ platform, kind: "same", before: record.status, after: record.status });
      }
    });
    return out;
  });

  const ok = rows.filter((row) => row.ok);
  const skipped = rows.filter((row) => !row.ok);
  const items = ok.flatMap((row) => row.items);
  return {
    rows,
    make,
    updates,
    newCount: items.filter((item) => item.kind === "new").length,
    updateCount: items.filter((item) => item.kind === "update").length,
    sameCount: items.filter((item) => item.kind === "same").length,
    notFound: skipped.filter((row) => row.reason === "notFound"),
    problems: skipped.filter((row) => row.reason !== "notFound"),
    skipped,
  };
}
