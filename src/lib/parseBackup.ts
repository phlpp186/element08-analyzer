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
  const result = backupFileSchema.safeParse(json);
  if (!result.success) {
    // Surface the FIRST issue with its path. Most validation failures stem
    // from a single root cause; a flood of nested errors is more confusing
    // than helpful for the user.
    const issue = result.error.issues[0];
    const where = issue.path.length > 0 ? ` (at ${issue.path.join('.')})` : '';
    throw new Error(issue.message + where);
  }
  return result.data;
}
