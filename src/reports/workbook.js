/*
 * A report is built as a plain workbook model, then written as Excel or PDF.
 *   sheet = { name, rows: any[][], widths: number[], opts }
 *   opts  = { headerRow (default 0; -1 = key/value sheet), titleRows, filter, sectionRows: number[] }
 */
import { loadXlsx } from "../lib/xlsx.js";

export function createWorkbook() {
  const sheets = [];
  return {
    sheets,
    addSheet(name, rows, widths, opts = {}) { sheets.push({ name, rows, widths, opts }); },
  };
}

const HEADER_FILL = "0B8043";

function styleSheet(XLSX, sheet, opts) {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const headerRow = opts.headerRow ?? 0;
  const sectionRows = new Set(opts.sectionRows || []);
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      if (cell.t === "d") cell.z = "yyyy-mm-dd hh:mm";
      let style = { font: { name: "Arial", sz: 10 }, alignment: { vertical: "top", wrapText: true } };
      if (r === headerRow) style = { font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: HEADER_FILL } }, alignment: { vertical: "center", wrapText: true } };
      if (opts.titleRows && r < opts.titleRows) style = { ...style, font: { name: "Arial", sz: r === 0 ? 14 : 10, bold: r === 0 } };
      if (sectionRows.has(r) && c === 0) style = { font: { name: "Arial", sz: 11, bold: true, color: { rgb: HEADER_FILL } } };
      cell.s = style;
    }
  }
  if (opts.filter) sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: range.e.r, c: range.e.c } }) };
}

/** Writes the workbook as a styled .xlsx file. */
export async function writeXlsx(workbook, fileBase) {
  const XLSX = await loadXlsx();
  const book = XLSX.utils.book_new();
  workbook.sheets.forEach(({ name, rows, widths, opts }) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
    sheet["!cols"] = widths.map((wch) => ({ wch }));
    styleSheet(XLSX, sheet, opts);
    XLSX.utils.book_append_sheet(book, sheet, name.slice(0, 31));
  });
  XLSX.writeFile(book, `${fileBase}.xlsx`, { cellStyles: true });
}
