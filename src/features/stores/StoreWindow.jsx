import { useEffect, useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { STORE_STATES } from "../../config/constants.js";
import { storeStatus, storeStatusClass } from "../../domain/records.js";
import { useDataContext, useDataStore } from "../../state/dataStore.js";
import { toast } from "../../state/toastStore.js";
import StoreWindowLeft from "./StoreWindowLeft.jsx";
import StoreWindowRight from "./StoreWindowRight.jsx";
import { setStoreStatus } from "./storeActions.js";

/** Store status button with its menu (Open / Temporarily closed / Closed). */
function StoreStatusControl({ store }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const status = storeStatus(store);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function choose(value) {
    setOpen(false);
    if (value !== status) await setStoreStatus(store, value);
  }

  return <div className="sst-wrap" ref={rootRef}>
    <button type="button" className={`sst-btn ${storeStatusClass(status)}`} onClick={() => setOpen(!open)} title="Change store status" aria-haspopup="menu" aria-expanded={open}>
      <span className="d" /><span>{status}</span><Icon name="chevron-down" />
    </button>
    {open && <div className="sst-menu" role="menu"><div className="fdd-note" style={{ padding: "4px 8px 6px" }}>Store status</div>
      {STORE_STATES.map((value) => <button type="button" className={`fdd-opt${value === status ? " on" : ""}`} role="menuitemradio" aria-checked={value === status} key={value}
        onClick={() => choose(value)}><span className={`sst-dot ${storeStatusClass(value)}`} />{value}{value === status && <Icon name="check" className="ck" />}</button>)}
    </div>}
  </div>;
}

/** The store window: contact, location, support team, platforms, GBP, issues and notes. */
export default function StoreWindow({ storeId }) {
  const ctx = useDataContext();
  const { close } = useDialog();
  const store = ctx.stores.find((item) => item.id === storeId);
  const lastRefreshAt = useDataStore((state) => state.lastRefreshAt);
  const refreshAtOpen = useRef(lastRefreshAt);

  useEffect(() => {
    if (!store) {
      if (lastRefreshAt !== refreshAtOpen.current) toast("That store was removed by a teammate", "err");
      close();
    }
  }, [store, close, lastRefreshAt]);

  if (!store) return null;
  const owner = ctx.frById.get(store.franchisee_id);

  return <Modal id="storeOverlay" overlayClass="blur" onEscape={false}
    head={<>
      <Icon name="store" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="sw-titlerow"><h2>Store #{store.num || ""}</h2><StoreStatusControl store={store} /></div>
        <div className="subt">{owner?.name ? `${owner.name} · ` : ""}Territory {store.territory || "—"}</div>
      </div>
      <button type="button" className="x" aria-label="Close" onClick={close}>&times;</button>
    </>}
    bare>
    <div className="sw-cols">
      <div className="sw-left" id="sw_left"><StoreWindowLeft key={String(lastRefreshAt)} store={store} /></div>
      <div className="sw-right" id="sw_right"><StoreWindowRight store={store} /></div>
    </div>
  </Modal>;
}
