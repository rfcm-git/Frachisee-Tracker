/* Walmart tab: Walmart Marketplace onboarding, one record per store. */
import { WM_STAGES, WM_STAGE_PLATFORM } from "../config/constants.js";

/** One of WM_STAGES ("Awaiting App" when the saved value is unknown). */
export const normalizeWmStage = (stage) => (WM_STAGES.includes(stage) ? stage : WM_STAGES[0]);

/** Stages that still need the owner to act. */
export const WM_OPEN_STAGES = ["Awaiting App", "Payment Setup"];
export const wmIsOpen = (record) => WM_OPEN_STAGES.includes(normalizeWmStage(record.stage));

/** The store's Walmart status (Delivery Platforms) for a stage. */
export const wmPlatformStatus = (stage) => WM_STAGE_PLATFORM[normalizeWmStage(stage)];

/** Badge class of a stage. */
export const wmStageClass = (stage) => ({ "Awaiting App": "wm-await", "Payment Setup": "wm-pay", "Account Created": "wm-done", Exempted: "wm-exempt" })[normalizeWmStage(stage)];

/**
 * Stage written in Walmart's report, or null when it is not one of the stages.
 * Spelling, case and spacing don't matter ("awaiting application", "Payment set-up", "Exempt").
 */
const STAGE_WORDS = {
  "Awaiting App": ["awaiting app", "awaiting application", "awaiting apps", "awaiting"],
  "Payment Setup": ["payment setup", "payment set up", "payment"],
  "Account Created": ["account created", "account create", "created"],
  Exempted: ["exempted", "exempt"],
};
export function readWmStage(value) {
  const text = String(value || "").toLowerCase().replace(/[-_/]/g, " ").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return Object.keys(STAGE_WORDS).find((stage) => STAGE_WORDS[stage].includes(text)) || null;
}

/** Change log, oldest first: [{ ts, kind: "created" | "update", source?: "import", stage?, from?, to?, note? }] */
export function wmHistory(record) {
  try {
    const list = Array.isArray(record?.history) ? record.history : JSON.parse(record?.history || "[]");
    return (Array.isArray(list) ? list : []).slice().sort((a, b) => new Date(a.ts) - new Date(b.ts));
  } catch {
    return [];
  }
}

/** Counts per stage, the total and the % at Account Created. */
export function wmSummary(records) {
  const counts = Object.fromEntries(WM_STAGES.map((stage) => [stage, 0]));
  records.forEach((record) => { counts[normalizeWmStage(record.stage)] += 1; });
  const total = records.length;
  const done = counts["Account Created"];
  const share = (count) => (total ? Math.round((count / total) * 100) : 0);
  return { counts, total, done, open: counts["Awaiting App"] + counts["Payment Setup"], percent: share(done), share };
}
