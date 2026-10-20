/* Supabase connection: credentials and the active client. */
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_SUPABASE_KEY, DEFAULT_SUPABASE_URL, STORAGE_KEYS } from "../config/constants.js";
import { local } from "../lib/storage.js";

let client = null;

export const getDb = () => client;

export function createDb(url, key) {
  client = createClient(url, key);
  return client;
}

export function clearDb() {
  client = null;
}

export function getSavedCredentials() {
  return {
    url: local.get(STORAGE_KEYS.url) || DEFAULT_SUPABASE_URL,
    key: local.get(STORAGE_KEYS.key) || DEFAULT_SUPABASE_KEY,
  };
}

export function saveCredentials(url, key) {
  local.set(STORAGE_KEYS.url, url);
  local.set(STORAGE_KEYS.key, key);
}

export function clearCredentials() {
  local.remove(STORAGE_KEYS.url);
  local.remove(STORAGE_KEYS.key);
}
