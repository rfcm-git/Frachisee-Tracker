import { createMockSource } from "./mockSource.js";
import { createSupabaseSource } from "./supabaseSource.js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Supabase when configured, otherwise the built-in dummy data. */
export const api = url && key ? createSupabaseSource(url, key) : createMockSource();
