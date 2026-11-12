import Icon from "./Icon.jsx";
import { emailKindLabel } from "../../domain/emailExempt.js";
import { openStore } from "../../state/dialogs.js";

/**
 * Stands in for a row's email button when the store is exempt from this email type.
 * Clearly not a send button; clicking opens the store window, where the exemption can be changed.
 */
export function ExemptMailButton({ store, storeNum, kind }) {
  const label = emailKindLabel(kind);
  const tip = `Store ${storeNum} is exempt from ${label} emails${store ? " — click to change it in the store window" : ""}`;
  return <button type="button" className="iconbtn mini cap-mailbtn exempt" data-tip={tip} aria-label={tip}
    onClick={(event) => { event.stopPropagation(); if (store) openStore(store.id); }}><Icon name="mail-x" /></button>;
}
