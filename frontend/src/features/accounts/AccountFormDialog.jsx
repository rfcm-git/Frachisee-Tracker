import { useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { BusyButton } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { errorTitle } from "../../lib/errors.js";
import { createAccount, updateAccount } from "../../services/api.js";
import { useAuthStore, useCurrentUser } from "../../state/authStore.js";
import { toast } from "../../state/toastStore.js";

const MIN_PASSWORD = 8;

/** Add an account, or edit one (name, username, role, new password, on/off). onSaved() refreshes the list. */
export default function AccountFormDialog({ account = null, onSaved }) {
  const { close, setBusy } = useDialog();
  const me = useCurrentUser();
  const self = Boolean(account) && String(account.id) === String(me?.id);
  const [form, setForm] = useState(() => ({
    displayName: account?.displayName || "",
    username: account?.username || "",
    role: account?.role || "user",
    password: "",
    active: account ? account.active : true,
  }));
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (name, value) => { setForm((current) => ({ ...current, [name]: value })); setBusy(true); setError(""); };

  function problem() {
    if (!/^[a-z0-9._-]{3,40}$/i.test(form.username.trim())) return "Username: 3–40 letters, numbers, dots, dashes or underscores.";
    if (!account && form.password.length < MIN_PASSWORD) return `Password: at least ${MIN_PASSWORD} characters.`;
    if (account && form.password && form.password.length < MIN_PASSWORD) return `New password: at least ${MIN_PASSWORD} characters.`;
    return "";
  }

  async function save() {
    const issue = problem();
    if (issue) { setError(issue); return; }
    setSaving(true);
    const fields = { displayName: form.displayName.trim(), username: form.username.trim() };
    if (!self) Object.assign(fields, { role: form.role, active: form.active });
    if (form.password) fields.password = form.password;
    const result = account ? await updateAccount(account.id, fields) : await createAccount(fields);
    setSaving(false);
    if (result.error) { setError(errorTitle(result.error)); return; }
    if (self) useAuthStore.setState({ user: result.account });
    toast(account ? `Account "${result.account.username}" saved` : `Account "${result.account.username}" added`, "ok");
    onSaved?.();
    close();
  }

  return <Modal size="small" icon={account ? "user-cog" : "user-round-plus"} title={account ? `Edit ${account.username}` : "Add account"}
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <BusyButton busy={saving} onClick={save}>{account ? "Save" : "Add account"}</BusyButton></>}>
    <form onSubmit={(event) => { event.preventDefault(); save(); }} noValidate>
      <div className="fgrid" style={{ marginBottom: 13 }}>
        <div className="field"><label htmlFor="ac_name">Name</label>
          <input id="ac_name" placeholder="e.g. Sam Rivera" autoFocus value={form.displayName} onChange={(event) => set("displayName", event.target.value)} /></div>
        <div className="field"><label htmlFor="ac_user">Username</label>
          <input id="ac_user" placeholder="e.g. sam" autoCapitalize="none" spellCheck="false" autoComplete="off" value={form.username}
            onChange={(event) => set("username", event.target.value)} /></div>
      </div>
      <div className="field" style={{ marginBottom: 13 }}><label htmlFor="ac_role">Role</label>
        <select id="ac_role" value={form.role} disabled={self} onChange={(event) => set("role", event.target.value)}>
          <option value="user">User: uses the whole tracker</option>
          <option value="admin">Admin: also manages accounts, deletes franchisees, imports and restores</option>
        </select>
        {self && <div className="help">You can't change your own role.</div>}
      </div>
      <div className="field"><label htmlFor="ac_pass">{account ? "New password" : "Password"}</label>
        <div className="auth-pass">
          <input id="ac_pass" type={showPassword ? "text" : "password"} autoComplete="new-password"
            placeholder={account ? "Leave empty to keep the current one" : `At least ${MIN_PASSWORD} characters`}
            value={form.password} onChange={(event) => set("password", event.target.value)} />
          <button type="button" className="auth-eye" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}
            onClick={() => setShowPassword(!showPassword)}><Icon name={showPassword ? "eye-off" : "eye"} /></button>
        </div>
        {account && <div className="help">{self ? "Changing it signs you out on your other browsers." : "Setting a new one signs them out everywhere."}</div>}
      </div>
      {account && !self && <label className="acct-check"><input type="checkbox" checked={form.active} onChange={(event) => set("active", event.target.checked)} />
        Can sign in {form.active ? "" : "(turned off: they're signed out and can't sign in)"}</label>}
      <p className="auth-error" role="alert">{error && <><Icon name="circle-alert" />{error}</>}</p>
      <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
    </form>
  </Modal>;
}
