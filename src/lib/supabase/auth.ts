/**
 * Auth helpers over the shared Supabase project — the SAME accounts as the
 * ELEMENT | 08 app and coach portal. Sign in here to load the logbook you backed
 * up from the app. Reading your own backup only needs a sign-in (it is not
 * Pro-gated — same as restore in the app); backing up FROM the app is the Pro
 * feature.
 */
import { supabase } from './client';

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('user already registered'))
    return 'That email already has an account — sign in instead.';
  if (m.includes('email not confirmed'))
    return 'Check your inbox to confirm your email, then sign in.';
  return message;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(friendly(error.message));
}

export async function signUp(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw new Error(friendly(error.message));
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
