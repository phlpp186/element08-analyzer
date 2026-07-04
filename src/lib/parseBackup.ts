/**
 * parseBackup — turn raw File / text into a validated ParsedBackup.
 *
 * Errors are surfaced as user-readable strings, not Zod stack traces. The
 * DropZone catches these and shows them inline.
 */
import { backupFileSchema, type ParsedBackup } from '../schema/backup';

export async function parseBackupFile(file: File): Promise<ParsedBackup> {
  if (!file) throw new Error('No file selected.');
  if (file.size === 0) throw new Error('File is empty.');
  if (file.size > 200 * 1024 * 1024) {
    // 200 MB ceiling — back-of-envelope: 5 years of dense oximeter sessions
    // serialized as JSON sits around 50-80 MB. 200 MB leaves headroom and
    // catches accidental drops of the wrong file (e.g. a video).
    throw new Error('File is larger than 200 MB. That isn’t a backup.');
  }

  const text = await file.text();
  return parseBackupText(text);
}

export function parseBackupText(text: string): ParsedBackup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  return parseBackupObject(json);
}

/**
 * Validate an already-parsed JSON value (e.g. the `account_backups.payload`
 * jsonb pulled from the cloud) into a ParsedBackup. Same validation as a
 * dropped file, minus the JSON.parse step.
 */
export function parseBackupObject(json: unknown): ParsedBackup {
  const result = backupFileSchema.safeParse(json);
  if (!result.success) {
    throw new Error(friendlyError(result.error.issues, json));
  }
  return result.data;
}

interface ZodIssueLite {
  message: string;
}

/** Turn the first Zod issue into plain language a diver can act on, instead
 *  of a schema path like "at data.sessions.0.dives". Most failures come from
 *  one root cause (wrong file, unsupported version), so we lead with that. */
function friendlyError(issues: ZodIssueLite[], json: unknown): string {
  const obj = json as { appId?: unknown; schemaVersion?: unknown; data?: unknown } | null;

  // Wrong file entirely — no ELEMENT | 08 envelope.
  if (!obj || typeof obj !== 'object' || obj.appId === undefined) {
    return "This doesn't look like an ELEMENT | 08 backup. Export one from the app under Settings → Backup → Export a File, then drop that here.";
  }
  if (obj.appId !== 'element08') {
    return 'This file is from a different app, not ELEMENT | 08.';
  }
  // Backup from a newer app version than this analyzer understands.
  if (typeof obj.schemaVersion === 'number' && obj.schemaVersion > 3) {
    return `This backup is from a newer app version (format ${obj.schemaVersion}) than the analyzer supports yet. Update the analyzer, or export again from a matching app version.`;
  }
  if (obj.data === undefined) {
    return 'This backup is missing its data. It may be truncated — try exporting a fresh copy from the app.';
  }

  // Fall back to the first issue, but drop the raw schema path.
  const first = issues[0];
  return first
    ? `This backup couldn't be read: ${first.message}. Try exporting a fresh copy from the app.`
    : "This backup couldn't be read. Try exporting a fresh copy from the app.";
}
