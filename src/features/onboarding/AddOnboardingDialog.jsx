import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { getContext } from "../../state/dataStore.js";
import { openNewOnboarding, openOnboardingImport } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";

const CHOICES = [
  { key: "single", icon: "store", title: "Add a store", text: "Search a store # or a franchisee. Picking a franchisee shows their stores to tick.", open: () => openNewOnboarding() },
  { key: "multiple", icon: "file-spreadsheet", title: "Add multiple stores", text: "Upload a spreadsheet of stores and platforms. You see a preview before anything is saved.", open: () => openOnboardingImport() },
];

/** The Onboarding tab's "Add store" button: pick one store, or many from a spreadsheet. */
export default function AddOnboardingDialog() {
  const { close } = useDialog();

  function choose(choice) {
    if (!getContext().onboardingReady) { toast("Run migrate-onboarding.sql first", "err"); return; }
    close();
    choice.open();
  }

  return <Modal icon="plus" title="Add store" subtitle="Add one store, or many at once from a spreadsheet"
    footer={<button type="button" className="btn ghost" onClick={close}>Cancel</button>}>
    <div className="ob-choice">
      {CHOICES.map((choice) => <button type="button" key={choice.key} className="ob-choice-btn" onClick={() => choose(choice)} autoFocus={choice.key === "single"}>
        <span className="ob-choice-ic"><Icon name={choice.icon} /></span>
        <span className="ob-choice-tx"><b>{choice.title}</b><span>{choice.text}</span></span>
        <Icon name="chevron-right" />
      </button>)}
    </div>
  </Modal>;
}
