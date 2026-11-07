/* Opening a mailto: link (Outlook) without leaving the page. */

/** Opens a mailto: link in the default mail app. */
export function openMailto(href) {
  const link = document.createElement("a");
  link.href = href;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
