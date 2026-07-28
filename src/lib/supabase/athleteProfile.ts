/**
 * pullAthleteGoals — fetch the signed-in user's own goals from the shared
 * `athlete_profiles` table (goals jsonb, same rows the app's Athlete Profile
 * writes). Owner-readable under the existing RLS; returns [] when signed out,
 * no row, or malformed rows (never throws for display code).
 */
import { supabase } from './client';
import type { CloudGoal } from '../analytics/progress';

export async function pullAthleteGoals(): Promise<CloudGoal[]> {
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return [];
    const { data, error } = await supabase
      .from('athlete_profiles')
      .select('goals')
      .eq('student_id', u.user.id)
      .maybeSingle();
    if (error || !data) return [];
    const goals = (data as { goals?: unknown }).goals;
    if (!Array.isArray(goals)) return [];
    return goals.filter(
      (g): g is CloudGoal =>
        !!g && typeof (g as CloudGoal).id === 'string' && typeof (g as CloudGoal).text === 'string',
    );
  } catch {
    return [];
  }
}
