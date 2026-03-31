import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

export const POST: APIRoute = async ({ locals, redirect }) => {
  const user = locals.user;
  if (!user?.is_super_admin) return redirect('/login', 302);

  const now = Date.now();
  const submissionDeadline = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  const votingDeadline = new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { error: votesError } = await supabase
    .from('votes')
    .delete()
    .neq('participant_email', '');

  if (votesError) {
    console.error('[request-reset-database] votes error:', votesError);
    return redirect('/admin?error=db_error', 302);
  }

  const { error: destinationsError } = await supabase
    .from('destinations')
    .delete()
    .not('id', 'is', null);

  if (destinationsError) {
    console.error('[request-reset-database] destinations error:', destinationsError);
    return redirect('/admin?error=db_error', 302);
  }

  const { error: participantsError } = await supabase
    .from('participants')
    .delete()
    .eq('is_super_admin', false);

  if (participantsError) {
    console.error('[request-reset-database] participants error:', participantsError);
    return redirect('/admin?error=db_error', 302);
  }

  const { error: gameMastersError } = await supabase
    .from('participants')
    .update({
      is_admin: true,
      is_super_admin: true,
      is_active: true,
      email_notifications_enabled: true,
      current_vote_bonus_points: 0,
      current_vote_bonus_profile_photo_points: 0,
      current_vote_bonus_submission_points: 0,
    })
    .eq('is_super_admin', true);

  if (gameMastersError) {
    console.error('[request-reset-database] game masters error:', gameMastersError);
    return redirect('/admin?error=db_error', 302);
  }

  const { error: settingsError } = await supabase
    .from('settings')
    .update({
      submission_deadline: submissionDeadline,
      voting_deadline: votingDeadline,
      draw_deadline: null,
      draw_duration_hours: 24,
      draw_duration_minutes: 24 * 60,
      vote_point_options: [10, 50, 100],
      bonus_profile_photo_enabled: true,
      bonus_profile_photo_points: 1,
      bonus_submission_enabled: true,
      bonus_submission_points: 1,
    })
    .eq('id', 1);

  if (settingsError) {
    console.error('[request-reset-database] settings error:', settingsError);
    return redirect('/admin?error=db_error', 302);
  }

  return redirect('/admin?success=database_reset', 302);
};
