import { useEffect, useEffectEvent } from "react";
import Icon from "./Icon.jsx";
import { useDialog } from "../dialogs/dialogContext.js";

/**
 * Dialog shell (overlay + modal box) used by every dialog.
 *
 * size:       "" | "small" | "wide"
 * icon:       Lucide name for the header
 * title, subtitle
 * headExtra:  extra header content (buttons) shown before the close button
 * head:       replaces the whole header content (title block and buttons)
 * footer:     footer content
 * onClose:    close button / Escape (defaults to closing the dialog)
 * onEscape:   custom Escape handling; pass false to ignore Escape
 * showClose:  show the × button (default true)
 * bare:       render children without the padded .body wrapper
 */
export default function Modal({
  id, size = "", overlayClass = "", modalStyle, modalClass = "", icon, iconStyle, title, subtitle, headExtra, head,
  footer, footerId, bodyId, bodyClass = "", children, onClose, onEscape, showClose = true, role = "dialog", labelledBy, bare = false,
}) {
  const dialog = useDialog();
  const close = onClose || dialog.close;
  /** Returns true when Escape was handled. */
  const handleEscape = useEffectEvent(() => {
    if (onEscape === false) return false;
    (onEscape || close)();
    return true;
  });

  useEffect(() => {
    if (!dialog.isTop) return undefined;
    function handleKey(event) {
      if (event.key === "Escape" && handleEscape()) event.preventDefault();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [dialog.isTop]);

  return (
    <div className={`overlay show${overlayClass ? ` ${overlayClass}` : ""}`} id={id} style={{ zIndex: dialog.zIndex }} role={role} aria-modal="true" aria-labelledby={labelledBy}>
      <div className={`modal${size ? ` ${size}` : ""}${modalClass ? ` ${modalClass}` : ""}`} style={modalStyle}>
        <div className="head">
          {head || <>
            {icon && <Icon name={icon} style={iconStyle} />}
            {subtitle !== undefined
              ? <div style={headExtra ? { flex: 1, minWidth: 0 } : undefined}><h2 id={labelledBy}>{title}</h2><div className="subt">{subtitle}</div></div>
              : <h2 id={labelledBy}>{title}</h2>}
            {headExtra}
            {showClose && <button type="button" className="x" aria-label="Close" onClick={close} style={headExtra ? { marginLeft: 6 } : undefined}>&times;</button>}
          </>}
        </div>
        {bare ? children : <div className={`body${bodyClass ? ` ${bodyClass}` : ""}`} id={bodyId}>{children}</div>}
        {footer && <footer id={footerId}>{footer}</footer>}
      </div>
    </div>
  );
}
