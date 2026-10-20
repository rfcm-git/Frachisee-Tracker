/* Directory reports: Stores, Franchisees and FBC / OM. */
import { CORE3 } from "../../config/constants.js";
import { franchiseeContactBits, hasOpenFollowUp } from "../../domain/calls.js";
import { franchiseeName, franchiseeOpenIssues, staffMember, storeOpenIssues, storesOf } from "../../domain/context.js";
import { obFranchiseeId, obIsOpen, obVisible } from "../../domain/onboarding.js";
import { coreActive, emailOf, hasGbp, hasRole, platformStatus, primaryTerritory, storeStatus } from "../../domain/records.js";
import { staffForStores, storesHandled } from "../../domain/staff.js";
import { percent } from "../../lib/format.js";
import { byName, compareStores } from "../../lib/text.js";
import { franchiseeInTerritory } from "../reportEngine.js";
import { average } from "./shared.js";

const isOpenStore = (store) => storeStatus(store) === "Open";
const openOnboardingFor = (ctx, predicate) => ctx.onboarding.filter((record) => obVisible(record) && obIsOpen(record) && predicate(record)).length;

/* ---------- Stores ---------- */

export const storesReport = {
  kind: "stores",
  title: "Store report",
  file: "store-report",
  noun: "store",
  nounPl: "stores",
  emptyText: "Nothing matches these choices",
  whichLabel: "Which stores",
  dateLabel: null,
  mainSheet: "stores",
  mainSheetLabel: "Stores",
  chips: [
    { key: "status", label: "Store status", options: [["Open", "Open"], ["Temporarily closed", "Temporarily closed"], ["Closed", "Closed"]], ok: (ctx, store, selected) => selected.includes(storeStatus(store)) },
    { key: "core", label: "Core 3PD active", options: [["3", "All 3"], ["2", "2 of 3"], ["1", "1 of 3"], ["0", "None"]], ok: (ctx, store, selected) => selected.includes(String(coreActive(store))) },
    { key: "gbp", label: "Google Business Profile", options: [["yes", "Linked"], ["no", "Not linked"]], ok: (ctx, store, selected) => selected.includes(hasGbp(store) ? "yes" : "no") },
    { key: "ez", label: "ezCater", options: [["Active", "Active"], ["Pending", "Pending"], ["Not enrolled", "Not enrolled"]], ok: (ctx, store, selected) => selected.includes(platformStatus(store, "ez")) },
    { key: "team", label: "Support team", options: [["both", "FBC + OM"], ["nofbc", "No FBC"], ["noom", "No OM"]],
      ok: (ctx, store, selected) => {
        const fbc = !!staffMember(ctx, store.fbc_id);
        const om = !!staffMember(ctx, store.om_id);
        return (selected.includes("both") && fbc && om) || (selected.includes("nofbc") && !fbc) || (selected.includes("noom") && !om);
      } },
  ],
  sheets: [["summary", "Summary", "Totals and coverage"], ["stores", "Stores", "One row per store"], ["byterr", "By territory", "Coverage per territory"], ["byfr", "By franchisee", "Coverage per franchisee"], ["gaps", "Coverage gaps", "Stores missing a core app, GBP or ezCater"]],
  defSheets: ["summary", "stores", "byterr"],
  cols: [
    ["num", "Store #"], ["fr", "Franchisee"], ["status", "Store status"], ["addr", "Address"], ["city", "City"], ["state", "State"], ["zip", "ZIP"], ["terr", "Territory"], ["phone", "Store phone"],
    ["ue", "Uber Eats"], ["dd", "DoorDash"], ["gh", "Grubhub"], ["ez", "ezCater"], ["core", "Core 3PD active (of 3)"], ["gbp", "GBP link"], ["fbc", "FBC"], ["fbcmail", "FBC email"], ["om", "OM"], ["ommail", "OM email"],
    ["issues", "Open concerns"], ["onb", "Open onboarding"], ["calls", "Calls"], ["lastcall", "Last call"], ["frcontact", "Franchisee email / phone"],
  ],
  defOff: ["zip", "fbcmail", "ommail", "frcontact", "lastcall"],
  items: (ctx) => ctx.stores,
  frOk: (ctx, store, id) => store.franchisee_id === id,
  storeOk: (ctx, store, num) => String(store.num) === num,
  terrOk: (ctx, store, territory) => primaryTerritory(store) === territory,
  countParts: (ctx, stores) => [[stores.length, "store", "stores"]],

  build(ctx, selected, state, workbook, h) {
    const stores = selected.slice().sort(compareStores);
    const live = stores.filter(isOpenStore);
    if (state.sheets.includes("summary")) {
      const allThree = live.filter((store) => coreActive(store) === 3).length;
      const gbp = live.filter(hasGbp).length;
      h.summarySheet(workbook, "Store Report", [{ title: "Totals", rows: [
        ["Stores", stores.length], ["Open", live.length], ["Temporarily closed", stores.filter((store) => storeStatus(store) === "Temporarily closed").length], ["Closed", stores.filter((store) => storeStatus(store) === "Closed").length],
        ["Open stores on all 3 core apps", `${allThree} (${percent(allThree, live.length)}%)`], ["Open stores with no core app", live.filter((store) => coreActive(store) === 0).length],
        ["GBP linked (open stores)", `${gbp} (${percent(gbp, live.length)}%)`], ["ezCater active (open stores)", live.filter((store) => platformStatus(store, "ez") === "Active").length],
        ["Stores without FBC", stores.filter((store) => !staffMember(ctx, store.fbc_id)).length], ["Stores without OM", stores.filter((store) => !staffMember(ctx, store.om_id)).length],
      ] }]);
    }
    const widths = { num: 9, fr: 28, status: 16, addr: 30, city: 14, state: 6, zip: 8, terr: 9, phone: 15, ue: 12, dd: 12, gh: 12, ez: 12, core: 10, gbp: 30, fbc: 14, fbcmail: 26, om: 14, ommail: 26, issues: 9, onb: 9, calls: 7, lastcall: 17, frcontact: 32 };
    if (state.sheets.includes("stores") && state.cols.length) {
      const columns = this.cols.filter(([key]) => state.cols.includes(key));
      const rows = [columns.map(([, label]) => label), ...stores.map((store) => {
        const fbc = staffMember(ctx, store.fbc_id);
        const om = staffMember(ctx, store.om_id);
        const contacts = franchiseeContactBits(ctx, store.franchisee_id);
        const calls = ctx.callLogs.filter((call) => String(call.store_num || "") === String(store.num));
        const lastCall = calls.map((call) => call.call_at).sort().pop();
        const value = {
          num: store.num, fr: franchiseeName(ctx, store.franchisee_id), status: storeStatus(store), addr: store.address || "", city: store.city || "", state: store.state || "", zip: store.zip || "",
          terr: primaryTerritory(store), phone: store.phone || "", ue: platformStatus(store, "ue"), dd: platformStatus(store, "dd"), gh: platformStatus(store, "gh"), ez: platformStatus(store, "ez"),
          core: coreActive(store), gbp: store.gbp || "", fbc: fbc ? fbc.name : "", fbcmail: fbc ? emailOf(fbc) : "", om: om ? om.name : "", ommail: om ? emailOf(om) : "",
          issues: storeOpenIssues(ctx, store.num), onb: openOnboardingFor(ctx, (record) => String(record.store_num) === String(store.num)),
          calls: calls.length, lastcall: lastCall ? h.date(lastCall) : "", frcontact: [...contacts.emails, ...contacts.phones].join(", "),
        };
        return columns.map(([key]) => value[key]);
      })];
      workbook.addSheet("Stores", rows, columns.map(([key]) => widths[key] || 12), { filter: true });
    }
    const coverage = (items) => {
      const open = items.filter(isOpenStore);
      return [items.length, open.length, average(open.map(coreActive), 0), `${percent(open.filter((store) => coreActive(store) === 3).length, open.length)}%`,
        `${percent(open.filter(hasGbp).length, open.length)}%`, `${percent(open.filter((store) => platformStatus(store, "ez") === "Active").length, open.length)}%`,
        items.reduce((sum, store) => sum + storeOpenIssues(ctx, store.num), 0)];
    };
    const coverageHeaders = ["Stores", "Open", "Avg core 3PD", "All 3 apps", "GBP linked", "ezCater active", "Open concerns"];
    if (state.sheets.includes("byterr")) {
      h.groupSheet(workbook, stores, { title: "By territory", key: primaryTerritory, head: (key) => [key], headers: ["Territory", ...coverageHeaders], widths: [10, 8, 8, 11, 10, 10, 12, 12], count: coverage, sort: (a, b) => (+a[0] || 0) - (+b[0] || 0) });
    }
    if (state.sheets.includes("byfr")) {
      h.groupSheet(workbook, stores, { title: "By franchisee", key: (store) => store.franchisee_id, head: (id) => [franchiseeName(ctx, id)], headers: ["Franchisee", ...coverageHeaders], widths: [30, 8, 8, 11, 10, 10, 12, 12], count: coverage });
    }
    if (state.sheets.includes("gaps")) {
      const rows = [["Store #", "Franchisee", "Territory", "Status", "Missing"]];
      live.forEach((store) => {
        const missing = [...CORE3.filter(([key]) => platformStatus(store, key) !== "Active").map(([, name]) => name), hasGbp(store) ? null : "GBP link",
          platformStatus(store, "ez") === "Active" ? null : "ezCater", staffMember(ctx, store.fbc_id) ? null : "FBC", staffMember(ctx, store.om_id) ? null : "OM"].filter(Boolean);
        if (missing.length) rows.push([store.num, franchiseeName(ctx, store.franchisee_id), primaryTerritory(store), storeStatus(store), missing.join(", ")]);
      });
      workbook.addSheet("Coverage gaps", rows, [9, 28, 9, 14, 60], { filter: true });
    }
  },
};

/* ---------- Franchisees ---------- */

const hasOpenOnboarding = (ctx, id) => ctx.onboarding.some((record) => obFranchiseeId(ctx, record) === id && obVisible(record) && obIsOpen(record));

export const franchiseesReport = {
  kind: "frs",
  title: "Franchisee report",
  file: "franchisee-report",
  noun: "franchisee",
  nounPl: "franchisees",
  emptyText: "Nothing matches these choices",
  whichLabel: "Which franchisees",
  dateLabel: null,
  mainSheet: "frs",
  mainSheetLabel: "Franchisees",
  chips: [{
    key: "act", label: "Activity", options: [["issues", "Has open concerns"], ["onb", "Has open onboarding"], ["fu", "Has open call follow-ups"], ["none", "None of these"]],
    ok: (ctx, franchisee, selected) => {
      const concerns = franchiseeOpenIssues(ctx, franchisee.id) > 0;
      const onboarding = hasOpenOnboarding(ctx, franchisee.id);
      const followUps = ctx.callLogs.some((call) => call.franchisee_id === franchisee.id && hasOpenFollowUp(call));
      return (selected.includes("issues") && concerns) || (selected.includes("onb") && onboarding) || (selected.includes("fu") && followUps) || (selected.includes("none") && !concerns && !onboarding && !followUps);
    },
  }],
  sheets: [["summary", "Summary", "Totals"], ["frs", "Franchisees", "One row per franchisee"], ["stores", "Their stores", "One row per store, grouped by franchisee"]],
  defSheets: ["summary", "frs"],
  cols: [
    ["name", "Franchisee"], ["terr", "Territories"], ["stores", "Stores"], ["open", "Open stores"], ["email", "Email"], ["phone", "Phone"], ["core", "Avg core 3PD"], ["gbp", "GBP linked"], ["ez", "ezCater active"],
    ["issues", "Open concerns"], ["onb", "Open onboarding"], ["calls", "Calls"], ["lastcall", "Last call"], ["fu", "Open follow-ups"], ["fbc", "FBC(s)"], ["om", "OM(s)"],
  ],
  defOff: ["fbc", "om"],
  items: (ctx) => ctx.franchisees,
  frOk: (ctx, franchisee, id) => franchisee.id === id,
  storeOk: (ctx, franchisee, num) => storesOf(ctx, franchisee.id).some((store) => String(store.num) === num),
  terrOk: (ctx, franchisee, territory) => franchiseeInTerritory(ctx, franchisee.id, territory),
  countParts: (ctx, list) => [[list.length, "franchisee", "franchisees"]],

  build(ctx, franchisees, state, workbook, h) {
    if (state.sheets.includes("summary")) {
      h.summarySheet(workbook, "Franchisee Report", [{ title: "Totals", rows: [
        ["Franchisees", franchisees.length], ["Stores", franchisees.reduce((sum, franchisee) => sum + storesOf(ctx, franchisee.id).length, 0)],
        ["With open concerns", franchisees.filter((franchisee) => franchiseeOpenIssues(ctx, franchisee.id) > 0).length],
        ["With open onboarding", franchisees.filter((franchisee) => hasOpenOnboarding(ctx, franchisee.id)).length],
        ["Called at least once", franchisees.filter((franchisee) => ctx.callLogs.some((call) => call.franchisee_id === franchisee.id)).length],
      ] }]);
    }
    const widths = { name: 30, terr: 12, stores: 8, open: 8, email: 30, phone: 16, core: 10, gbp: 10, ez: 10, issues: 10, onb: 10, calls: 7, lastcall: 17, fu: 10, fbc: 20, om: 20 };
    if (state.sheets.includes("frs") && state.cols.length) {
      const columns = this.cols.filter(([key]) => state.cols.includes(key));
      const rows = [columns.map(([, label]) => label), ...franchisees.map((franchisee) => {
        const stores = storesOf(ctx, franchisee.id);
        const open = stores.filter(isOpenStore);
        const contacts = franchiseeContactBits(ctx, franchisee.id);
        const calls = ctx.callLogs.filter((call) => call.franchisee_id === franchisee.id);
        const team = staffForStores(ctx, stores);
        const value = {
          name: franchisee.name, terr: [...new Set(stores.map(primaryTerritory))].join(", ") || franchisee.territory || "", stores: stores.length, open: open.length,
          email: contacts.emails.join(", "), phone: contacts.phones.join(", "),
          core: open.length ? average(open.map(coreActive)) : "", gbp: open.length ? `${percent(open.filter(hasGbp).length, open.length)}%` : "",
          ez: open.length ? `${percent(open.filter((store) => platformStatus(store, "ez") === "Active").length, open.length)}%` : "",
          issues: franchiseeOpenIssues(ctx, franchisee.id), onb: openOnboardingFor(ctx, (record) => obFranchiseeId(ctx, record) === franchisee.id),
          calls: calls.length, lastcall: calls.length ? h.date(calls.map((call) => call.call_at).sort().pop()) : "", fu: calls.filter(hasOpenFollowUp).length,
          fbc: team.fbc.map((entry) => entry.person.name).join(", "), om: team.om.map((entry) => entry.person.name).join(", "),
        };
        return columns.map(([key]) => value[key]);
      })];
      workbook.addSheet("Franchisees", rows, columns.map(([key]) => widths[key] || 12), { filter: true });
    }
    if (state.sheets.includes("stores")) {
      const rows = [["Franchisee", "Store #", "Status", "City", "Territory", "Uber Eats", "DoorDash", "Grubhub", "ezCater", "GBP linked"]];
      franchisees.forEach((franchisee) => storesOf(ctx, franchisee.id).slice().sort(compareStores).forEach((store) => rows.push([
        franchisee.name, store.num, storeStatus(store), store.city || "", primaryTerritory(store),
        platformStatus(store, "ue"), platformStatus(store, "dd"), platformStatus(store, "gh"), platformStatus(store, "ez"), hasGbp(store) ? "Yes" : "No",
      ])));
      workbook.addSheet("Their stores", rows, [28, 9, 16, 14, 9, 12, 12, 12, 12, 10], { filter: true });
    }
  },
};

/* ---------- FBC / OM ---------- */

export const staffReport = {
  kind: "staff",
  title: "FBC / OM report",
  file: "fbc-om-report",
  noun: "person",
  nounPl: "people",
  emptyText: "Nothing matches these choices",
  whichLabel: "Which FBCs / OMs",
  dateLabel: null,
  mainSheet: "people",
  mainSheetLabel: "People",
  chips: [{ key: "role", label: "Role", options: [["FBC", "FBC"], ["OM", "OM"]], ok: (ctx, person, selected) => selected.some((role) => hasRole(person, role)) }],
  sheets: [["summary", "Summary", "Totals"], ["people", "People", "One row per FBC / OM"], ["assign", "Store assignments", "Every store each person handles"], ["gaps", "Unassigned stores", "Stores with no FBC or no OM"]],
  defSheets: ["summary", "people", "assign"],
  cols: [["name", "Name"], ["email", "Email"], ["role", "Role"], ["asfbc", "Stores as FBC"], ["asom", "Stores as OM"], ["frs", "Franchisees"], ["terrs", "Territories"], ["issues", "Open concerns"], ["onb", "Open onboarding"], ["calls", "Calls to their stores"]],
  defOff: [],
  items: (ctx) => ctx.staff,
  frOk: (ctx, person, id) => storesOf(ctx, id).some((store) => store.fbc_id === person.id || store.om_id === person.id),
  storeOk: (ctx, person, num) => { const store = ctx.storeByNum.get(num); return !!store && (store.fbc_id === person.id || store.om_id === person.id); },
  terrOk: (ctx, person, territory) => storesHandled(ctx, person).some((store) => primaryTerritory(store) === territory),
  countParts: (ctx, people) => [[people.length, "person", "people"]],

  build(ctx, selected, state, workbook, h) {
    const inTerritory = (store) => !state.terr || primaryTerritory(store) === state.terr;
    const people = selected.slice().sort(byName);
    if (state.sheets.includes("summary")) {
      h.summarySheet(workbook, "FBC / OM Report", [{ title: "Totals", rows: [
        ["People", people.length], ["FBCs", people.filter((person) => hasRole(person, "FBC")).length], ["OMs", people.filter((person) => hasRole(person, "OM")).length],
        ["Stores without FBC", ctx.stores.filter((store) => inTerritory(store) && !staffMember(ctx, store.fbc_id)).length],
        ["Stores without OM", ctx.stores.filter((store) => inTerritory(store) && !staffMember(ctx, store.om_id)).length],
      ] }]);
    }
    if (state.sheets.includes("people") && state.cols.length) {
      const columns = this.cols.filter(([key]) => state.cols.includes(key));
      const widths = { name: 18, email: 30, role: 12, asfbc: 11, asom: 11, frs: 11, terrs: 20, issues: 11, onb: 12, calls: 12 };
      const rows = [columns.map(([, label]) => label), ...people.map((person) => {
        const stores = storesHandled(ctx, person).filter(inTerritory);
        const numbers = new Set(stores.map((store) => String(store.num)));
        const value = {
          name: person.name, email: emailOf(person), role: person.role || "", asfbc: stores.filter((store) => store.fbc_id === person.id).length, asom: stores.filter((store) => store.om_id === person.id).length,
          frs: new Set(stores.map((store) => store.franchisee_id)).size, terrs: [...new Set(stores.map(primaryTerritory))].sort().join(", "),
          issues: stores.reduce((sum, store) => sum + storeOpenIssues(ctx, store.num), 0), onb: openOnboardingFor(ctx, (record) => numbers.has(String(record.store_num))),
          calls: ctx.callLogs.filter((call) => numbers.has(String(call.store_num || ""))).length,
        };
        return columns.map(([key]) => value[key]);
      })];
      workbook.addSheet("People", rows, columns.map(([key]) => widths[key] || 12), { filter: true });
    }
    if (state.sheets.includes("assign")) {
      const rows = [["Person", "Role on store", "Store #", "Franchisee", "City", "Territory", "Store status"]];
      people.forEach((person) => storesHandled(ctx, person).filter(inTerritory).sort(compareStores).forEach((store) => rows.push([
        person.name, [store.fbc_id === person.id ? "FBC" : null, store.om_id === person.id ? "OM" : null].filter(Boolean).join(" & "),
        store.num, franchiseeName(ctx, store.franchisee_id), store.city || "", primaryTerritory(store), storeStatus(store),
      ])));
      workbook.addSheet("Store assignments", rows, [18, 12, 9, 28, 14, 9, 16], { filter: true });
    }
    if (state.sheets.includes("gaps")) {
      const rows = [["Store #", "Franchisee", "Territory", "Missing"]];
      ctx.stores.filter(inTerritory).sort(compareStores).forEach((store) => {
        const missing = [staffMember(ctx, store.fbc_id) ? null : "FBC", staffMember(ctx, store.om_id) ? null : "OM"].filter(Boolean);
        if (missing.length) rows.push([store.num, franchiseeName(ctx, store.franchisee_id), primaryTerritory(store), missing.join(", ")]);
      });
      workbook.addSheet("Unassigned stores", rows, [9, 28, 9, 14], { filter: true });
    }
  },
};
