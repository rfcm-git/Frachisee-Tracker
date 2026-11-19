import { useEffect, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { EmptyState, LoadingState } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { errorTitle } from "../../lib/errors.js";
import { formatTimestamp } from "../../lib/format.js";
import { deleteAccount, fetchAccounts } from "../../services/api.js";
import { useCurrentUser } from "../../state/authStore.js";
import { confirmAction, openAccountForm } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";

const initial = (account) => (account.displayName || account.username || "?").trim().charAt(0).toUpperCase();

/** Admins: everyone who can sign in, with add, edit and delete. */
export default function AccountsDialog() {
  const { close } = useDialog();
  const me = useCurrentUser();
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((value) => value + 1);

  useEffect(() => {
    let active = true;
    fetchAccounts().then((result) => {
      if (!active) return;
      setError(result.error || null);
      if (!result.error) setAccounts(result.accounts);
    });
    return () => { active = false; };
  }, [version]);

  function askDelete(account) {
    confirmAction({
      title: "Delete account",
      okLabel: "Delete",
      busyLabel: "Deleting…",
      text: `Delete the account "${account.username}"${account.displayName ? ` (${account.displayName})` : ""}? They won't be able to sign in any more. Their past work in the tracker stays.`,
      onConfirm: async () => {
        const failure = await deleteAccount(account.id);
        if (failure) { toast(errorTitle(failure), "err"); return false; }
        toast(`Account "${account.username}" deleted`, "ok");
        reload();
      },
    });
  }

  const add = <button type="button" className="btn" onClick={() => openAccountForm(null, reload)}><Icon name="user-round-plus" />Add account</button>;
  let body;
  if (error) body = <EmptyState error icon="circle-alert" title={errorTitle(error)} actions={<button type="button" className="btn" onClick={reload}>Try again</button>} />;
  else if (!accounts) body = <LoadingState text="Loading accounts…" />;
  else {
    body = <ul className="acct-list" aria-label="Accounts">
      {accounts.map((account) => {
        const self = String(account.id) === String(me?.id);
        return <li key={account.id} className={`acct-row${account.active ? "" : " off"}`}>
          <span className="av" aria-hidden="true">{initial(account)}</span>
          <div className="who">
            <b>{account.displayName || account.username}
              {account.role === "admin" && <span className="acct-tag admin">Admin</span>}
              {self && <span className="acct-tag you">You</span>}
              {!account.active && <span className="acct-tag off">Turned off</span>}
            </b>
            <span>@{account.username} · {account.lastLoginAt ? `last signed in ${formatTimestamp(account.lastLoginAt)}` : "never signed in"}</span>
          </div>
          <div className="acts">
            <button type="button" className="iconbtn" aria-label={`Edit ${account.username}`} data-tip="Edit, reset password, turn on or off"
              onClick={() => openAccountForm(account, reload)}><Icon name="pencil" /></button>
            {!self && <button type="button" className="iconbtn del" aria-label={`Delete ${account.username}`} data-tip="Delete account"
              onClick={() => askDelete(account)}><Icon name="trash-2" /></button>}
          </div>
        </li>;
      })}
    </ul>;
  }

  return <Modal icon="users" title="Accounts" subtitle="Who can sign in to the tracker"
    footer={<><button type="button" className="btn ghost" onClick={close}>Close</button>{add}</>}>
    {body}
  </Modal>;
}
