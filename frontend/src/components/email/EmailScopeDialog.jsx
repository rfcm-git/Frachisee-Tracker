import { useState } from "react";
import Icon from "../ui/Icon.jsx";
import Modal from "../ui/Modal.jsx";
import { useDialog } from "../dialogs/dialogContext.js";

/**
 * Asks whether to email about just the clicked store or several of the franchisee's stores in one email.
 * one: { title, text, run() }.
 * all: { title, text, items: [{ key, label, exempt, clicked }], run(keys) } — a checklist: the clicked store is always in,
 *   stores with emails turned off are shown but can't be ticked, and any other store can be unticked to leave it out.
 *   Leaving only the clicked store sends the one-store email.
 * note: shown under the choices.
 */
export default function EmailScopeDialog({ heading, one, all, note }) {
  const { close } = useDialog();
  const [picked, setPicked] = useState(() => new Set(all.items.filter((item) => !item.exempt).map((item) => item.key)));
  const exempt = all.items.filter((item) => item.exempt);
  const count = picked.size;
  const toggle = (key, on) => setPicked((current) => {
    const next = new Set(current);
    if (on) next.add(key); else next.delete(key);
    return next;
  });
  const sendOne = () => { close(); one.run(); };
  const sendPicked = () => {
    close();
    if (count < 2) one.run(); else all.run(all.items.filter((item) => picked.has(item.key)).map((item) => item.key));
  };

  return <Modal icon="mail" title={heading} subtitle="Send one email for just this store, or one email covering several of this franchisee's stores"
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" onClick={sendPicked} autoFocus><Icon name={count < 2 ? "store" : "layers"} />
        {count < 2 ? "Email just this store" : `Email ${count} stores in one email`}</button></>}>
    <div className="ob-choice">
      <button type="button" className="ob-choice-btn" onClick={sendOne}>
        <span className="ob-choice-ic"><Icon name="store" /></span>
        <span className="ob-choice-tx"><b>{one.title}</b><span>{one.text}</span></span>
        <Icon name="chevron-right" />
      </button>
      <div className="scope-all">
        <div className="scope-all-h"><span className="ob-choice-ic"><Icon name="layers" /></span>
          <span className="ob-choice-tx"><b>{all.title}</b><span>{all.text} Untick a store to leave it out.</span></span></div>
        <div className="scope-tools">
          <span className="muted">{count} of {all.items.length - exempt.length} included</span>
          <button type="button" className="btn link" onClick={() => setPicked(new Set(all.items.filter((item) => !item.exempt).map((item) => item.key)))}>Select all</button>
          <button type="button" className="btn link" onClick={() => setPicked(new Set(all.items.filter((item) => item.clicked).map((item) => item.key)))}>Clear</button>
        </div>
        <ul className="scope-pick" aria-label="Stores in the email">
          {all.items.map((item) => {
            const on = picked.has(item.key);
            return <li key={item.key} className={item.exempt ? "exempt" : on ? "on" : ""}>
              <label>
                <input type="checkbox" checked={on} disabled={item.exempt || item.clicked}
                  onChange={(event) => toggle(item.key, event.target.checked)} />
                <span className="scope-pick-lb">{item.label}</span>
                {item.clicked && <span className="scope-tag">This store</span>}
                {item.exempt && <span className="scope-tag off" data-tip="Turned off in the store window (Email exemptions)"><Icon name="mail-x" />Emails turned off</span>}
              </label>
            </li>;
          })}
        </ul>
        {exempt.length > 0 && <div className="scope-warn" role="status"><Icon name="mail-x" />
          {exempt.length === 1 ? `Store ${exempt[0].key} has` : `${exempt.length} stores have`} emails turned off, so {exempt.length === 1 ? "it isn't" : "they aren't"} included.</div>}
      </div>
    </div>
    {note && <div className="help" style={{ marginTop: 10 }}>{note}</div>}
  </Modal>;
}
