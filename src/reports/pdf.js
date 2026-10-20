/* Writes a report workbook as a landscape PDF (every sheet becomes a section). */
import { pad2 } from "../lib/format.js";

let loading = null;
function loadPdfLibraries() {
  if (!loading) {
    loading = Promise.all([import("jspdf"), import("jspdf-autotable")]).then(([pdf, table]) => ({
      jsPDF: pdf.jsPDF || pdf.default,
      autoTable: table.autoTable || table.default,
    })).catch((error) => { loading = null; throw error; });
  }
  return loading;
}

/** Characters the built-in PDF fonts cannot draw (everything except tab, newlines, Latin-1 and a few symbols). */
// eslint-disable-next-line no-control-regex
const UNPRINTABLE = /[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF–—•…€]/g;

/** Text the built-in PDF fonts can print. */
function pdfText(value) {
  if (value == null) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const time = value.getHours() || value.getMinutes() ? ` ${pad2(value.getHours())}:${pad2(value.getMinutes())}` : "";
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}${time}`;
  }
  return String(value).replace(/→/g, "->").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(UNPRINTABLE, "");
}

const GREEN = [0, 137, 56];
const LIME = [246, 250, 239];
const INK = [29, 42, 32];

/** Column widths: short columns (dates, numbers, codes) get just enough room; long text columns share the rest. */
function columnStyles(head, body, widths, fontSize, available) {
  const charWidth = fontSize * 0.56;
  const maxLength = head.map((label, index) => Math.max(...[label, ...body.slice(0, 300).map((row) => row[index])]
    .map((value) => String(value ?? "").split("\n").reduce((max, line) => Math.max(max, line.length), 0))));
  const styles = {};
  const shortWidth = {};
  let used = 0;
  head.forEach((label, index) => {
    if (maxLength[index] > 16) return;
    shortWidth[index] = Math.max(30, Math.min(110, Math.max(String(label).length * charWidth + 12, maxLength[index] * charWidth + 12)));
    used += shortWidth[index];
  });
  const longIndexes = head.map((_, index) => index).filter((index) => !(index in shortWidth));
  const longTotal = longIndexes.reduce((sum, index) => sum + (widths[index] || 12), 0) || 1;
  const left = Math.max(available - used, longIndexes.length * 60);
  head.forEach((_, index) => {
    styles[index] = { cellWidth: index in shortWidth ? shortWidth[index] : Math.max(60, ((widths[index] || 12) / longTotal) * left) };
  });
  const sum = Object.values(styles).reduce((total, style) => total + style.cellWidth, 0);
  if (sum > available) Object.values(styles).forEach((style) => { style.cellWidth *= available / sum; });
  return styles;
}

export async function writePdf(workbook, { title, fileBase, generatedText }) {
  const { jsPDF, autoTable } = await loadPdfLibraries();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 36;

  doc.setFillColor(...GREEN); doc.rect(0, 0, width, 54, "F");
  doc.setFillColor(255, 198, 0); doc.rect(0, 54, width, 4, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.text(pdfText(title), margin, 34);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  doc.text(pdfText(`Franchisee Tracker · 3PD Helpdesk · ${generatedText}`), width - margin, 34, { align: "right" });

  let y = 78;
  workbook.sheets.forEach((sheet, index) => {
    const rows = sheet.rows.map((row) => (row || []).map(pdfText));
    if (index > 0 && y > height - 120) { doc.addPage(); y = margin; }
    doc.setTextColor(0, 107, 44); doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); doc.text(pdfText(sheet.name), margin, y);
    y += 8;
    const opts = sheet.opts || {};
    if (opts.headerRow === -1) {
      const sections = new Set(opts.sectionRows || []);
      const body = [];
      const bodySections = new Set();
      rows.forEach((row, rowIndex) => {
        if (rowIndex < (opts.titleRows || 0) || !row.length || !row.some((cell) => cell !== "")) return;
        if (sections.has(rowIndex)) bodySections.add(body.length);
        body.push(row);
      });
      autoTable(doc, {
        startY: y, body, theme: "plain", margin: { left: margin, right: margin }, tableWidth: Math.min(520, width - 2 * margin),
        styles: { fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 6, right: 6 }, textColor: INK },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 230, textColor: [60, 75, 64] } },
        didParseCell: (data) => {
          if (data.section === "body" && bodySections.has(data.row.index)) {
            data.cell.styles.textColor = GREEN; data.cell.styles.fontSize = 10; data.cell.styles.fillColor = LIME; data.cell.styles.fontStyle = "bold";
          }
        },
      });
    } else {
      const head = rows[0] || [];
      const body = rows.slice(1);
      const fontSize = head.length > 14 ? 6.5 : head.length > 10 ? 7.2 : 8;
      autoTable(doc, {
        startY: y, head: [head], body: body.length ? body : [["No rows"]], margin: { left: margin, right: margin, top: margin, bottom: 40 },
        styles: { fontSize, cellPadding: 3, overflow: "linebreak", valign: "top", textColor: INK, lineColor: [223, 232, 214], lineWidth: 0.4 },
        headStyles: { fillColor: GREEN, textColor: 255, fontStyle: "bold", fontSize },
        alternateRowStyles: { fillColor: LIME },
        columnStyles: columnStyles(head, body, (sheet.widths || []).slice(0, head.length), fontSize, width - 2 * margin),
      });
    }
    y = doc.lastAutoTable.finalY + 26;
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page); doc.setFontSize(8); doc.setTextColor(120, 130, 124); doc.setFont("helvetica", "normal");
    doc.text(pdfText(title), margin, height - 18);
    doc.text(`Page ${page} of ${pages}`, width - margin, height - 18, { align: "right" });
  }
  doc.save(`${fileBase}.pdf`);
}
