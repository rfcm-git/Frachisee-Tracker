import { Modal } from "../ui/overlays.jsx";
import { Kbd } from "../ui/core.jsx";

const GROUPS = [
  {
    name: "Anywhere",
    keys: [
      [["Ctrl", "K"], "Search and jump to a store, issue or page"],
      [["/"], "Open search"],
      [["N"], "Flag a new issue"],
      [["?"], "Show this list"],
    ],
  },
  {
    name: "Go to",
    keys: [
      [["G", "D"], "Dashboard"],
      [["G", "I"], "Issues"],
      [["G", "S"], "Stores"],
      [["G", "P"], "3PD settings"],
      [["G", "U"], "Users"],
    ],
  },
  {
    name: "Lists, charts and dialogs",
    keys: [
      [["↑", "↓"], "Move between rows; Enter opens"],
      [["←", "→"], "Step through days on a focused chart"],
      [["Esc"], "Close a dialog or clear a search"],
    ],
  },
];

export function ShortcutsDialog({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" size="sm">
      <div className="space-y-5 px-5 py-4">
        {GROUPS.map((g) => (
          <section key={g.name}>
            <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">{g.name}</h3>
            <dl className="space-y-2">
              {g.keys.map(([keys, desc]) => (
                <div key={desc} className="flex items-center justify-between gap-4 text-[13px]">
                  <dt className="text-ink-2">{desc}</dt>
                  <dd className="flex shrink-0 gap-1">{keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
