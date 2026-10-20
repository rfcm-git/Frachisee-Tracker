/*
 * Rich text (bold, bullets, indent) used in issue descriptions, notes and updates.
 * Everything is cleaned before it is saved and before it is shown.
 */

const ALLOWED_TAGS = { B: 1, STRONG: "B", I: 1, EM: "I", UL: 1, OL: 1, LI: 1, BR: 1, DIV: 1, P: "DIV", BLOCKQUOTE: 1 };
const DROPPED_TAGS = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, TEMPLATE: 1, SVG: 1, MATH: 1, LINK: 1, META: 1 };
const RICH_TAG_RE = /<\/?(b|strong|i|em|ul|ol|li|br|div|p|blockquote)\b/i;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Keeps only the allowed formatting tags and strips every attribute. */
export function sanitizeRich(html) {
  const doc = new DOMParser().parseFromString(`<div>${String(html || "")}</div>`, "text/html");
  const root = doc.body.firstChild;
  if (!root) return "";
  const clean = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) return;
      if (child.nodeType !== 1) { child.remove(); return; }
      const tag = child.tagName.toUpperCase();
      if (DROPPED_TAGS[tag]) { child.remove(); return; }
      clean(child);
      if (tag === "SPAN" && /font-weight\s*:\s*(bold|[6-9]00)/i.test(child.getAttribute("style") || "")) {
        const bold = doc.createElement("b");
        while (child.firstChild) bold.appendChild(child.firstChild);
        child.replaceWith(bold);
        return;
      }
      const allowed = ALLOWED_TAGS[tag];
      if (!allowed) { child.replaceWith(...[...child.childNodes]); return; }
      if (typeof allowed === "string") {
        const replacement = doc.createElement(allowed);
        while (child.firstChild) replacement.appendChild(child.firstChild);
        child.replaceWith(replacement);
        return;
      }
      [...child.attributes].forEach((attribute) => child.removeAttribute(attribute.name));
    });
  };
  clean(root);
  return root.innerHTML;
}

/** Safe HTML for showing a saved value (plain text keeps its line breaks). */
export function richHtml(value) {
  const text = String(value ?? "");
  return RICH_TAG_RE.test(text) ? sanitizeRich(text) : escapeHtml(text).replace(/\n/g, "<br>");
}

/** Converts saved rich text to plain text with bullets and indents (used in Excel/PDF and search). */
export function richToPlain(value) {
  const text = String(value ?? "");
  if (!RICH_TAG_RE.test(text)) return text;
  const doc = new DOMParser().parseFromString(`<div>${sanitizeRich(text)}</div>`, "text/html");
  let out = "";
  const newline = () => { if (out && !out.endsWith("\n")) out += "\n"; };
  const walk = (node, indent) => node.childNodes.forEach((child) => {
    if (child.nodeType === 3) { out += child.textContent; return; }
    const tag = child.tagName;
    if (tag === "BR") { out += `\n${indent}`; return; }
    if (tag === "LI") { newline(); out += `${indent}• `; walk(child, `${indent}   `); newline(); return; }
    if (tag === "UL" || tag === "OL") { walk(child, indent); return; }
    if (tag === "BLOCKQUOTE") { newline(); out += `${indent}    `; walk(child, `${indent}    `); newline(); return; }
    if (tag === "DIV") { newline(); out += indent; walk(child, indent); newline(); return; }
    walk(child, indent);
  });
  walk(doc.body.firstChild, "");
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** One-line preview, shortened to max characters. */
export function oneLine(value, max = 140) {
  const text = richToPlain(value).replace(/\s*\n+\s*/g, " · ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Turns the editor's HTML into the value to save:
 * empty string when blank, plain text when no formatting was used, cleaned HTML otherwise.
 */
export function editorValue(html) {
  const cleaned = sanitizeRich(html).replace(/(<br>|<div><br><\/div>|\s|&nbsp;)+$/gi, "").trim();
  const plain = richToPlain(cleaned).trim();
  if (!plain) return "";
  if (!/<(b|i|ul|ol|li|blockquote)\b/i.test(cleaned)) return plain;
  return cleaned;
}
