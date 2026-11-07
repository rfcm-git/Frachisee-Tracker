import Icon from "../ui/Icon.jsx";
import Modal from "../ui/Modal.jsx";
import { useDialog } from "../dialogs/dialogContext.js";

/**
 * Asks whether to email about just the clicked store or all of the franchisee's stores in one email.
 * one / all: { title, text, run }. all.lines: [text] listed under the "all stores" choice. note: shown under the choices.
 */
export default function EmailScopeDialog({ heading, one, all, note }) {
  const { close } = useDialog();
  const choose = (choice) => { close(); choice.run(); };
  return <Modal icon="mail" title={heading} subtitle="Send one email for just this store, or one email covering all of this franchisee's stores"
    footer={<button type="button" className="btn ghost" onClick={close}>Cancel</button>}>
    <div className="ob-choice">
      <button type="button" className="ob-choice-btn" onClick={() => choose(one)}>
        <span className="ob-choice-ic"><Icon name="store" /></span>
        <span className="ob-choice-tx"><b>{one.title}</b><span>{one.text}</span></span>
        <Icon name="chevron-right" />
      </button>
      <button type="button" className="ob-choice-btn" onClick={() => choose(all)} autoFocus>
        <span className="ob-choice-ic"><Icon name="layers" /></span>
        <span className="ob-choice-tx"><b>{all.title}</b><span>{all.text}</span>
          <ul className="scope-lines">{all.lines.slice(0, 12).map((line) => <li key={line}>{line}</li>)}{all.lines.length > 12 && <li>…and {all.lines.length - 12} more</li>}</ul></span>
        <Icon name="chevron-right" />
      </button>
    </div>
    {note && <div className="help" style={{ marginTop: 10 }}>{note}</div>}
  </Modal>;
}
