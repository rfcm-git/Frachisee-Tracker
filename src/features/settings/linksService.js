/*
 * Team links (sidebar "Links"). Saved in app_settings so the whole team shares them,
 * or on this computer when that table is not set up yet.
 */
import { STORAGE_KEYS } from "../../config/constants.js";
import { hasDb, readSetting, writeSetting } from "../../services/api.js";
import { local } from "../../lib/storage.js";

export const DEFAULT_LINKS = [
  { title: "Subway", icon: "utensils", links: [{ name: "The Feed Website", url: "https://thefeed.subway.com/" }] },
  { title: "Platforms", icon: "layout-dashboard", links: [
    { name: "Uber Eats Manager Portal", url: "https://merchants.ubereats.com/manager/stores" },
    { name: "DoorDash Merchant Portal", url: "https://merchant-portal.doordash.com/merchant/select-profile" },
    { name: "Grubhub Merchant Portal", url: "https://restaurant.grubhub.com/dashboard/8138584" },
    { name: "Foodja", url: "https://foodja.com/user/login/" },
    { name: "ezCater", url: "https://www.ezcater.com/partner_portal/sign_in?iss=https%3A%2F%2Faccount.ezcater.com%2F" },
  ] },
  { title: "Customer View", icon: "eye", links: [
    { name: "Uber Eats", url: "https://www.ubereats.com/" },
    { name: "DoorDash", url: "https://www.doordash.com/home" },
    { name: "Grubhub", url: "https://www.grubhub.com/" },
  ] },
  { title: "Others", icon: "bookmark", links: [
    { name: "Calendly", url: "https://calendly.com/3pd-helpdesk/helpdesk-3pd-support-franchisee-call" },
    { name: "Outlook", url: "https://outlook.cloud.microsoft/mail/" },
    { name: "Google Business Profile", url: "https://business.google.com/locations" },
    { name: "Subway Restaurant Locator", url: "https://www.subway.com/en-us/locator" },
  ] },
  { key: "onboarding", title: "Third-Party Delivery Onboarding", icon: "rocket", links: [
    { name: "Grubhub Onboarding", url: "https://l.gourl.es/l/ab4cb1a44ddfdcb2ba1732b5be4714f2e0117698?w=QXppemFAbWFyd2FoYWdyb3VwLmNvbQ&u=11148230" },
    { name: "DoorDash Onboarding", url: "https://lemonade.workflowcloud.com/forms/9545858c-0dac-4807-be4a-95fa9a996880?rID=92fde755a6c6bb5ae5814c58c579d2a4bc1ee187f58cc77d214f608354fb42d5" },
    { name: "Uber Eats Onboarding", url: "https://docs.google.com/forms/d/e/1FAIpQLSekSmIewMphDAruo9m-ux0lfscclGNjByCRMjvNya4LVcX8Tg/viewform" },
    { name: "Subway ezCater — Franchisee Agreement", url: "https://www.ezcater.com/company/grow-catering-business/subway/franchise-agreement/" },
    { name: "ezCater — Marketplace Opt-In Form", url: "https://ezcaterforms.formstack.com/forms/ezcater_marketplace_opt_in" },
    { name: "ezCater — ACH Collection Form", url: "https://ezcaterforms.formstack.com/forms/ach_collection_form_subway" },
  ] },
  { key: "forms", title: "Additional Forms", icon: "file-text", links: [
    { name: "DoorDash — Change of Ownership", url: "https://www.doordash.com/merchant/change-of-ownership/store-transfer?store_id=67344" },
  ] },
];

/** Sections added after launch: added once for the whole team, then edits and deletes stick. */
const SEED_KEYS = ["onboarding", "forms"];

const copy = (value) => JSON.parse(JSON.stringify(value));

export function normalizeUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function hostOf(url) {
  try { return new URL(normalizeUrl(url)).host.replace(/^www\./, ""); } catch { return url; }
}

async function saveSeeded(keys, shared) {
  const value = [...new Set(keys)];
  if (shared && hasDb()) await writeSetting("links_seeded", value);
  local.setJson(STORAGE_KEYS.linksSeeded, value);
}

/** Returns { links, shared } — shared is false when links are kept on this computer only. */
export async function loadLinks() {
  let stored = null;
  let seeded = [];
  let shared = false;
  if (hasDb()) {
    const result = await readSetting("links");
    if (!result.error) {
      shared = true;
      if (Array.isArray(result.value)) stored = result.value;
      const seededResult = await readSetting("links_seeded");
      if (!seededResult.error && Array.isArray(seededResult.value)) seeded = seededResult.value;
    }
  }
  if (!shared) {
    const localLinks = local.getJson(STORAGE_KEYS.links, null);
    if (Array.isArray(localLinks)) stored = localLinks;
    const localSeeded = local.getJson(STORAGE_KEYS.linksSeeded, []);
    if (Array.isArray(localSeeded)) seeded = localSeeded;
  }
  if (!stored) {
    await saveSeeded(SEED_KEYS, shared);
    return { links: copy(DEFAULT_LINKS), shared };
  }
  let links = stored;
  const missing = DEFAULT_LINKS.filter((section) => section.key && SEED_KEYS.includes(section.key) && !seeded.includes(section.key)
    && !links.some((item) => item.key === section.key || item.title === section.title));
  const newlySeeded = SEED_KEYS.filter((key) => !seeded.includes(key));
  if (missing.length) links = links.concat(copy(missing));
  if (newlySeeded.length) {
    if (missing.length) {
      if (shared) await writeSetting("links", links);
      local.setJson(STORAGE_KEYS.links, links);
    }
    await saveSeeded(seeded.concat(newlySeeded), shared);
  }
  return { links, shared };
}

/** Saves the links; returns true when they were shared with the team. */
export async function saveLinks(links) {
  let shared = false;
  if (hasDb()) shared = !(await writeSetting("links", links));
  local.setJson(STORAGE_KEYS.links, links);
  return shared;
}

export const defaultLinks = () => copy(DEFAULT_LINKS);
