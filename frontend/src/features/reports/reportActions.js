/* Running reports from the Reports tab. */
import { REPORTS } from "../../reports/catalog.js";
import { defaultReportState, downloadReport } from "../../reports/reportEngine.js";
import { getContext } from "../../state/dataStore.js";
import { toast } from "../../state/toastStore.js";

/** Downloads a report with the given state and confirms with a toast. Returns true when downloaded. */
export async function runReport(definition, state) {
  const result = await downloadReport(getContext(), definition, state);
  if (result.error) { toast(result.error, "err"); return false; }
  toast(state.fmt === "pdf" ? "PDF downloaded" : "Report downloaded", "ok");
  return true;
}

/** Quick report: default choices plus the preset, straight to a file. */
export function runQuickReport(quick, format) {
  const definition = REPORTS[quick.kind];
  const state = { ...defaultReportState(definition, quick.preset), fmt: format };
  return runReport(definition, state);
}
