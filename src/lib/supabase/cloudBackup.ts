/**
 * pullCloudBackup — fetch the signed-in user's own logbook backup from the
 * shared Supabase project. The `account_backups` table holds one row per user
 * (`user_id` PK) whose `payload` jsonb IS the .e08backup.json envelope the app
 * writes — the same shape the analyzer parses from a dropped file. Owner-only
 * RLS means a user can only ever read their own row.
 *
 * Returns null when signed out or when the user has no cloud backup yet (they
 * back up from the app: Settings → Backup → Back up to cloud).
 */
import { supabase } from './client';

export interface CloudBackup {
  /** The raw backup envelope — validate with parseBackupObject before use. */
  payload: unknown;
  /** ISO timestamp of the last cloud backup. */
  updatedAt: string;
}

export async function pullCloudBackup(): Promise<CloudBackup | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;

  const { data, error } = await supabase
    .from('account_backups')
    .select('payload, updated_at')
    .eq('user_id', u.user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as { payload: unknown; updated_at: string };
  return { payload: row.payload, updatedAt: row.updated_at };
}
