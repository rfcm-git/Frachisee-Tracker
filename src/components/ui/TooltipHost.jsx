import { useEffect, useRef, useState } from "react";

/**
 * One tooltip for the whole app: any element with data-tip="…" shows it on hover or focus.
 */
export default function TooltipHost() {
  const tipRef = useRef(null);
  const currentRef = useRef(null);
  const [text, setText] = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const place = (x, y) => {
      const tip = tipRef.current;
      if (!tip) return;
      const rect = tip.getBoundingClientRect();
      let left = x + 14;
      let top = y + 16;
      if (left + rect.width > window.innerWidth - 8) left = x - rect.width - 14;
      if (top + rect.height > window.innerHeight - 8) top = y - rect.height - 14;
      tip.style.left = `${Math.max(8, left)}px`;
      tip.style.top = `${Math.max(8, top)}px`;
    };
    const hide = () => { setVisible(false); currentRef.current = null; };
    const show = (element, x, y) => {
      if (element !== currentRef.current) {
        currentRef.current = element;
        setText(element.dataset.tip);
        setVisible(true);
      }
      requestAnimationFrame(() => place(x, y));
    };
    const onOver = (event) => {
      const element = event.target.closest?.("[data-tip]");
      if (!element) { hide(); return; }
      show(element, event.clientX, event.clientY);
    };
    const onMove = (event) => { if (currentRef.current) place(event.clientX, event.clientY); };
    const onFocus = (event) => {
      const element = event.target.closest?.("[data-tip]");
      if (!element) return;
      const rect = element.getBoundingClientRect();
      show(element, rect.left, rect.bottom);
    };
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("scroll", hide, true);
    };
  }, []);

  return <div id="dbTip" role="tooltip" ref={tipRef} className={visible ? "show" : ""}>{text}</div>;
}
