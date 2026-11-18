/* FBC / OM helpers. Each store has one FBC (stores.fbc_id) and one OM (stores.om_id). */
import { byName } from "../lib/text.js";
import { emailOf, hasRole } from "./records.js";
import { staffMember } from "./context.js";

/** Stores where the person is the FBC or the OM. */
export const storesHandled = (ctx, person) => ctx.stores.filter((store) => store.fbc_id === person.id || store.om_id === person.id);

/** {fbc: [person], om: [person]} for one store. */
export function staffForStore(ctx, store) {
  const fbc = store ? staffMember(ctx, store.fbc_id) : null;
  const om = store ? staffMember(ctx, store.om_id) : null;
  return { fbc: fbc ? [fbc] : [], om: om ? [om] : [] };
}

/** Team of a group of stores, most stores first: {fbc: [{person, count}], om: [...]} */
export function staffForStores(ctx, stores) {
  const fbc = new Map();
  const om = new Map();
  (stores || []).forEach((store) => {
    const fbcPerson = staffMember(ctx, store.fbc_id);
    const omPerson = staffMember(ctx, store.om_id);
    if (fbcPerson) fbc.set(fbcPerson.id, { person: fbcPerson, count: (fbc.get(fbcPerson.id)?.count || 0) + 1 });
    if (omPerson) om.set(omPerson.id, { person: omPerson, count: (om.get(omPerson.id)?.count || 0) + 1 });
  });
  const sorted = (map) => [...map.values()].sort((a, b) => b.count - a.count || byName(a.person, b.person));
  return { fbc: sorted(fbc), om: sorted(om) };
}

/** People with a role, sorted by name, as {id, name, email}. */
export const staffOptions = (ctx, role) => ctx.staff.filter((person) => hasRole(person, role)).sort(byName)
  .map((person) => ({ id: person.id, name: person.name || "", email: emailOf(person) || "" }));

/** Counts of stores as FBC and as OM. */
export function staffStoreCounts(ctx, personId) {
  let fbc = 0;
  let om = 0;
  ctx.stores.forEach((store) => { if (store.fbc_id === personId) fbc += 1; if (store.om_id === personId) om += 1; });
  return { fbc, om };
}
