import { useMemo, useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import RichTextEditor from "../../components/ui/RichTextEditor.jsx";
import { StatusButtons } from "../../components/ui/Choices.jsx";
import { IssueNumber, IssueStatusBadge } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { ISSUE_STATES } from "../../config/constants.js";
import { groupMembers, issueNumber, normalizeIssueStatus } from "../../domain/issues.js";
import { issuePlatforms, storeAddressLine } from "../../domain/records.js";
import { formatTimestamp } from "../../lib/format.js";
import { richHtml } from "../../lib/richText.js";
import { useDataContext } from "../../state/dataStore.js";
import { openFranchiseeInfo, openGroupHistory } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { askDeleteIssues, updateIssueGroup } from "./issueActions.js";

/** Update some or all stores of a multi-store issue. */
export default function GroupUpdateDialog({ groupId, preselectId }) {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const members = useMemo(() => groupMembers(ctx.issues, groupId), [ctx.issues, groupId]);
  const [selected, setSelected] = useState(() => groupMembers(ctx.issues, groupId).filter((issue) => !preselectId || preselectId === issue.id).map((issue) => issue.id));
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef(null);
  if (!members.length) return null;

  const issue = members[0];
  const memberIds = members.map((item) => item.id);
  const selectedIds = selected.filter((id) => memberIds.includes(id));
  const allSelected = selectedIds.length === members.length;
  const platforms = issuePlatforms(issue);

  async function save() {
    if (!selectedIds.length) { toast("Select at least one store", "err"); return; }
    const action = editorRef.current.getValue();
    if (!status && !action) { toast("Pick a status or write the action taken", "err"); return; }
    setSaving(true);
    const ok = await updateIssueGroup(selectedIds, { status, action });
    setSaving(false);
    if (ok) close();
  }

  function deleteSelected() {
    if (!selectedIds.length) { toast("Select at least one store", "err"); return; }
    askDeleteIssues(selectedIds);
  }

  return <Modal size="wide" icon="refresh-cw" title="Update Status · Multi-store issue" subtitle={`${members.length} stores · logged ${formatTimestamp(issue.created_at)}`}
    footer={<>
      <button type="button" className="btn link danger" style={{ marginRight: "auto" }} onClick={deleteSelected}><Icon name="trash-2" />Delete selected</button>
      <button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" disabled={saving} onClick={save}><Icon name="save" />Save update</button>
    </>}>
    <div className="field" style={{ marginBottom: 12 }}><label>Issue</label>
      <div className="rt" style={{ fontSize: 14 }} dangerouslySetInnerHTML={{ __html: richHtml(issue.title) }} />
      {platforms.length > 0 && <div className="chips" style={{ marginTop: 6 }}>{platforms.map((platform) => <span className="tag" key={platform}>{platform}</span>)}</div>}</div>
    <div className="field" style={{ marginBottom: 13 }}><label>Stores to update — pick which ones</label>
      <div className="cklist">
        <label className="ckrow all"><span>All stores</span><input type="checkbox" id="grp_all" checked={allSelected}
          ref={(element) => { if (element) element.indeterminate = selectedIds.length > 0 && !allSelected; }}
          onChange={(event) => setSelected(event.target.checked ? memberIds : [])} /></label>
        {members.map((member) => {
          const store = ctx.storeByNum.get(String(member.store_num));
          const owner = member.franchisee_id ? ctx.frById.get(member.franchisee_id) : null;
          return <label className="ckrow" key={member.id}><div className="ck-main">
            <div className="ck-l1"><span className="n">{String(member.store_num || "")}</span>
              {member.franchisee_id ? <button type="button" className="o fr-link" title="View franchisee info"
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); openFranchiseeInfo(member.franchisee_id, groupId); }}><span className="nm">{owner?.name || ""}</span></button>
                : <span className="o">{"—"}</span>}
              <IssueNumber number={issueNumber(member)} /></div>
            {store && <div className="ck-addr">{storeAddressLine(store)}</div>}
            <div className="ck-st"><IssueStatusBadge status={normalizeIssueStatus(member.status)} /></div>
          </div>
            <input type="checkbox" className="grp-ck" checked={selectedIds.includes(member.id)}
              onChange={(event) => setSelected(event.target.checked ? [...new Set([...selectedIds, member.id])] : selectedIds.filter((id) => id !== member.id))} />
          </label>;
        })}
      </div>
      <div className="help">{selectedIds.length} of {members.length} selected</div></div>
    <div className="field" style={{ marginBottom: 13 }}><label>Pick a status</label>
      <StatusButtons options={ISSUE_STATES} value={status} onChange={(value) => { setStatus(value); setBusy(true); }} label="Status" /></div>
    <div className="field"><label>Action taken (applies to selected stores)</label>
      <RichTextEditor ref={editorRef} placeholder="What did you do this time?" onInput={() => setBusy(true)} /></div>
    <div className="help"><button type="button" className="btn link" style={{ padding: 0 }} onClick={() => { close(); openGroupHistory(groupId); }}><Icon name="history" />View all updates</button></div>
  </Modal>;
}
