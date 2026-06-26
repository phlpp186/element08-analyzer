/**
 * Supabase client for the analyzer — points at the SAME EU (Frankfurt) project
 * as the ELEMENT | 08 app and the coach portal, so a signed-in user can load the
 * logbook they backed up from the app. The publishable key is client-safe (RLS
 * restricts every row to its owner); it's the same key the app ships. Override
 * via Vite env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) at build time.
 *
 * Note: only the AUTH session is persisted (in localStorage, by supabase-js).
 * The logbook itself is never persisted — it lives in useBackupStore in memory
 * only, so the "your data stays in this tab" promise still holds.
 */
import { createClient } from '@supabase/supabase-js';

const URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  'https://gtgoqdaapnzwkrvanaab.supabase.co';
const KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  'sb_publishable_EqsQtlSzqWILFpr7ioss_Q_9sK-YJLl';

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
