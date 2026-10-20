import { useMemo } from "react";
import Icon from "../../components/ui/Icon.jsx";
import { clickableProps } from "../../components/ui/clickable.js";
import { useToolbarCount } from "../../hooks/useToolbarCount.js";
import { emailOf, hasRole, rolesOf } from "../../domain/records.js";
import { parseQuery } from "../../domain/search.js";
import { staffStoreCounts, storesHandled } from "../../domain/staff.js";
import { byName } from "../../lib/text.js";
import { useDataContext } from "../../state/dataStore.js";
import { openStaffDetail } from "../../state/dialogs.js";
import { setStaffRole, useUiStore } from "../../state/uiStore.js";

const GROUPS = [
  { role: "OM", label: "Operations Managers (OM)", icon: "user-cog" },
  { role: "FBC", label: "Field Business Consultants (FBC)", icon: "badge-check" },
];

function filterStaff(ctx, search) {
  const { mode, q } = parseQuery(search);
  return ctx.staff.filter((person) => {
    if (!q) return true;
    if (mode === "store") return storesHandled(ctx, person).some((store) => String(store.num || "").toLowerCase().includes(q));
    return [person.name, emailOf(person), person.role].join(" ").toLowerCase().includes(q);
  }).sort(byName);
}

function StaffCard({ person, role, counts }) {
  const storeCount = role === "FBC" ? counts.fbc : counts.om;
  const otherCount = role === "FBC" ? counts.om : counts.fbc;
  const email = emailOf(person);
  return <div className="pcard sf-card" {...clickableProps(() => openStaffDetail(person.id))}>
    <div className="sf-top">
      <span className="sf-av">{(person.name || "?").slice(0, 1).toUpperCase()}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <h3>{person.name}</h3>
        <div className="sf-roles">{rolesOf(person).map((item) => <span className="rl" key={item}>{item}</span>)}</div>
      </div>
    </div>
    <div className="sf-mail">{email ? <><Icon name="mail" /><span>{email}</span></> : <span className="muted">No email</span>}</div>
    <div className="sf-stats"><span><b>{storeCount}</b> store{storeCount !== 1 ? "s" : ""} as {role}</span>
      {otherCount > 0 && <span className="muted">+{otherCount} as {role === "FBC" ? "OM" : "FBC"}</span>}
    </div>
  </div>;
}

export default function StaffDirectory() {
  const ctx = useDataContext();
  const search = useUiStore((state) => state.search);
  const role = useUiStore((state) => state.staffRole);
  const people = useMemo(() => filterStaff(ctx, search), [ctx, search]);
  useToolbarCount(`${people.length} people`);

  return <>
    <div className="vtog" style={{ marginBottom: 14 }}>
      {[["all", "Everyone"], ["OM", "OM"], ["FBC", "FBC"]].map(([value, label]) => (
        <button type="button" key={value} className={role === value ? "on" : ""} aria-pressed={role === value} onClick={() => setStaffRole(value)}>{label}</button>
      ))}
    </div>
    <div className="help" style={{ margin: "-6px 0 14px" }}>
      Each store has one FBC and one OM. Aziza and Charlena lead all of California. Click a person to see their stores.
    </div>
    {GROUPS.filter((group) => role === "all" || role === group.role).map((group) => {
      const members = people.filter((person) => hasRole(person, group.role));
      return <section key={group.role}>
        <div className="sf-h"><Icon name={group.icon} />{group.label}<span className="badge-num">{members.length}</span></div>
        <div className="cards sf-cards">
          {members.length ? members.map((person) => <StaffCard key={person.id} person={person} role={group.role} counts={staffStoreCounts(ctx, person.id)} />)
            : <p className="muted">None found.</p>}
        </div>
      </section>;
    })}
  </>;
}
