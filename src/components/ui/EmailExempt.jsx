import { useRef } from "react";
import Icon from "./Icon.jsx";
import { emailKindLabel } from "../../domain/emailExempt.js";
import { toast } from "../../state/toastStore.js";

/**
 * Stands in for a row's email button when the store is exempt from this email type.
 * Clicking it shakes the icon and says emailing is turned off (and where to change that) — nothing is sent.
 */
export function ExemptMailButton({ storeNum, kind }) {
  const ref = useRef(null);
  const label = emailKindLabel(kind);
  const tip = `${label} emails to store ${storeNum} are turned off — change it in the store window (Email exemptions)`;
  function refuse(event) {
    event.stopPropagation();
    const button = ref.current;
    if (button) {
      // Restart the shake even when clicked again quickly.
      button.classList.remove("shake");
      void button.offsetWidth;
      button.classList.add("shake");
    }
    toast(`Sending ${label} emails to store ${storeNum} is turned off — change it in the store window (Email exemptions)`, "err");
  }
  return <button type="button" ref={ref} className="iconbtn mini cap-mailbtn exempt" data-tip={tip} aria-label={tip}
    onClick={refuse} onAnimationEnd={(event) => event.currentTarget.classList.remove("shake")}><Icon name="mail-x" /></button>;
}
