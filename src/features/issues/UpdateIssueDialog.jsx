import { useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import RichTextEditor from "../../components/ui/RichTextEditor.jsx";
import { StatusButtons } from "../../components/ui/Choices.jsx";
import { IssueNumber } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { ISSUE_STATES } from "../../config/constants.js";
import { historyEntries, issueNumber, normalizeIssueStatus } from "../../domain/issues.js";
import { richHtml } from "../../lib/richText.js";
import { useDataContext } from "../../state/dataStore.js";
import { openIssueHistory } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { updateIssue } from "./issueActions.js";

export default function UpdateIssueDialog({ issueId }) {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const issue = ctx.issues.find((item) => item.id === issueId);
  const [status, setStatus] = useState(() => normalizeIssueStatus(issue?.status));
  const [saving, setSaving] = useState(false);
  const editorRef = useRef(null);
  if (!issue) return null;

  async function save() {
    const previous = normalizeIssueStatus(issue.status);
    const action = editorRef.current.getValue();
    if (status === previous && !action) { toast("Change the status or write the action taken", "err"); return; }
    setSaving(true);
    const ok = await updateIssue(issue, { status, action });
    setSaving(false);
    if (ok) close();
  }

  return <Modal size="wide" icon="refresh-cw" title={`Update Status · Store #${issue.store_num || ""}`}
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" disabled={saving} onClick={save}><Icon name="save" />Save update</button></>}>
    <div className="field" style={{ marginBottom: 12 }}><label>Issue <IssueNumber number={issueNumber(issue)} /></label>
      <div className="rt" style={{ fontSize: 13.5 }} dangerouslySetInnerHTML={{ __html: richHtml(issue.title) }} /></div>
    <div className="field" style={{ marginBottom: 13 }}><label>Pick a status</label>
      <StatusButtons options={ISSUE_STATES} value={status} onChange={(value) => { setStatus(value); setBusy(true); }} label="Status" /></div>
    {issue.action_taken && <div className="field" style={{ marginBottom: 12 }}><label>Last action taken</label>
      <div className="muted rt" style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: richHtml(issue.action_taken) }} /></div>}
    <div className="field"><label>Action taken (this update)</label>
      <RichTextEditor ref={editorRef} placeholder="What did you do this time?" autoFocus onInput={() => setBusy(true)} /></div>
    <div className="help"><button type="button" className="btn link" style={{ padding: 0 }} onClick={() => openIssueHistory(issue.id)}>
      <Icon name="history" />View all updates ({historyEntries(issue).length})</button></div>
  </Modal>;
}
