import Icon from "../../components/ui/Icon.jsx";
import { IssueNumber } from "../../components/ui/common.jsx";
import { issueNumber, sortOpenThenNewest, statusSummary } from "../../domain/issues.js";
import { notesOf } from "../../domain/records.js";
import { formatTimestamp } from "../../lib/format.js";
import { oneLine, richHtml } from "../../lib/richText.js";
import { useDataContext } from "../../state/dataStore.js";
import { openAddNote, openLogIssue, openStoreIssues } from "../../state/dialogs.js";

/** Right column of the store window: issue summary and notes. */
export default function StoreWindowRight({ store }) {
  const ctx = useDataContext();
  const issues = ctx.issues.filter((issue) => String(issue.store_num) === String(store.num)).sort(sortOpenThenNewest);
  const latest = issues.slice().sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))[0];
  const notes = notesOf(store).slice().reverse();

  return <>
    <div className="rpanel">
      <div className="rph"><Icon name="triangle-alert" />Issues<span className="act">
        <button type="button" className="btn sm outline round" onClick={() => openLogIssue(store.id)}><Icon name="plus" />Log issue</button></span></div>
      <div className="rpb">
        {issues.length ? <div className="iss-sum">
          <div className="iss-big"><b>{issues.length}</b><span>issue{issues.length !== 1 ? "s" : ""}</span></div>
          <div className="iss-info">
            <div className="ssum">{statusSummary(issues).map((item) => <span className="ss" key={item.status}><span className="d" style={{ background: item.color }} />{item.count} {item.status}</span>)}</div>
            {latest && <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>Latest: <IssueNumber number={issueNumber(latest)} /> {oneLine(latest.title, 70)} · {formatTimestamp(latest.updated_at || latest.created_at)}</div>}
          </div>
          <button type="button" className="btn sm round" onClick={() => openStoreIssues(store.num)}><Icon name="list" />View all issues</button>
        </div> : <p className="muted">No issues logged for this store.</p>}
      </div>
    </div>
    <div className="rpanel">
      <div className="rph"><Icon name="sticky-note" />Notes<span className="act">
        <button type="button" className="btn sm outline warn round" onClick={() => openAddNote(store.id)}><Icon name="plus" />Add note</button></span></div>
      <div className="rpb">
        {notes.length ? notes.map((note, index) => <div className="note-row" key={`${note.ts}-${index}`}>
          <span className="nt">{formatTimestamp(note.ts)}</span><span className="rt" dangerouslySetInnerHTML={{ __html: richHtml(note.text) }} />
        </div>) : <p className="muted">No notes yet.</p>}
      </div>
    </div>
  </>;
}
