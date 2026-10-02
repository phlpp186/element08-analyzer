/**
 * pullCloudBackup — fetch the signed-in user's own logbook backup from the
 * shared Supabase project. Returns the raw .e08backup.json envelope, the same
 * shape the analyzer parses from a dropped file.
 *
 * WHERE IT LIVES. Since the app's 2026-09-25 update the backup is a gzipped
 * file in Storage (`account-backups/<uid>/backup.json.gz`); the old jsonb row
 * in `account_backups` is written only when that upload fails. Like the app's
 * restore, this takes the NEWER of the two, and fails rather than silently
 * showing the older copy when the newer one cannot be read. Reading the row
 * alone showed September logbooks, or "no backup yet" to anyone whose first
 * backup came after the switch (app audit 2026-10-02 #7). Both are owner-only
 * (RLS / storage policies), so a user can only ever read their own.
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

const BUCKET = 'account-backups';
const FILE = 'backup.json.gz';

/** The file's last-modified time, or null when there is none. Only a missing
 *  bucket means "no file"; any other listing error is thrown, so a network
 *  blip cannot make the newer file look absent. */
async function fileTime(uid: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).list(uid, { search: FILE, limit: 1 });
  if (error) {
    if (/not found/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  const f = data?.find((o) => o.name === FILE);
  return f?.updated_at ?? f?.created_at ?? null;
}

async function downloadFile(uid: string): Promise<unknown> {
  const { data, error } = await supabase.storage.from(BUCKET).download(`${uid}/${FILE}`);
  if (error || !data) throw new Error(error?.message ?? 'Could not download your cloud backup.');
  const text = await new Response(data.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(text);
}

const newer = (a: string | null, b: string | null) =>
  !a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b;

export async function pullCloudBackup(): Promise<CloudBackup | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const uid = u.user.id;

  // Timestamps first: the row's payload can be tens of MB and is only fetched
  // when it is the copy we want.
  const [file, rowRes] = await Promise.all([
    fileTime(uid),
    supabase.from('account_backups').select('updated_at').eq('user_id', uid).maybeSingle(),
  ]);
  if (rowRes.error) throw new Error(rowRes.error.message);
  const row = (rowRes.data as { updated_at: string } | null)?.updated_at ?? null;

  const when = newer(file, row);
  if (!when) return null;
  if (file && when === file) return { payload: await downloadFile(uid), updatedAt: file };

  const { data, error } = await supabase
    .from('account_backups')
    .select('payload')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { payload: (data as { payload: unknown }).payload, updatedAt: row! };
}
