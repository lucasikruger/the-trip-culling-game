import { getSiteUrl } from '../../../lib/site';
import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import { parseDateTimeLocalToIso } from '../../../lib/datetime-local';
import { sendPhaseUpdateNotification } from '../../../lib/email';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user?.is_admin) return redirect('/login', 302);

  const form = await request.formData();
  const submissionDeadline = form.get('submission_deadline') as string | null;
  const votingDeadline = form.get('voting_deadline') as string | null;
  const timezoneOffsetMinutes = (form.get('timezone_offset_minutes') as string | null)?.trim();

  if (!submissionDeadline || !votingDeadline) {
    return redirect('/admin?error=missing_fields', 302);
  }

  const submissionIso = parseDateTimeLocalToIso(submissionDeadline, timezoneOffsetMinutes);
  const votingIso = parseDateTimeLocalToIso(votingDeadline, timezoneOffsetMinutes);
  const submissionDate = submissionIso ? new Date(submissionIso) : new Date('');
  const votingDate = votingIso ? new Date(votingIso) : new Date('');
  const now = new Date();

  if (Number.isNaN(submissionDate.getTime()) || Number.isNaN(votingDate.getTime())) {
    return redirect('/admin?error=missing_fields', 302);
  }

  if (submissionDate <= now || votingDate <= now) {
    return redirect('/admin?error=deadlines_must_be_future', 302);
  }

  if (votingDate <= submissionDate) {
    return redirect('/admin?error=voting_before_submission', 302);
  }

  const { error: votesErr } = await supabase.from('votes').delete().neq('participant_email', '');
  if (votesErr) {
    console.error('[request-restart-game] votes error:', votesErr);
    return redirect('/admin?error=db_error', 302);
  }

  const { error: settingsErr } = await supabase
    .from('settings')
    .update({ submission_deadline: submissionIso, voting_deadline: votingIso, draw_deadline: null })
    .eq('id', 1);

  if (settingsErr) {
    console.error('[request-restart-game] settings error:', settingsErr);
    return redirect('/admin?error=db_error', 302);
  }

  await supabase.from('destinations').update({ is_in_draw: false }).neq('id', '');
  await supabase
    .from('participants')
    .update({
      current_vote_bonus_points: 0,
      current_vote_bonus_profile_photo_points: 0,
      current_vote_bonus_submission_points: 0,
    })
    .neq('email', '');

  const gameUrl = getSiteUrl();
  const { data: activeParticipants } = await supabase
    .from('participants')
    .select('email, email_notifications_enabled')
    .eq('is_active', true);

  await Promise.allSettled(
    (activeParticipants ?? [])
      .filter((participant) => participant.email_notifications_enabled !== false)
      .map((participant) => sendPhaseUpdateNotification(participant.email, {
        stage: 'submission',
        gameUrl,
        customIntro: 'The game has been restarted and the submission phase is open again.',
      })),
  );

  return redirect('/admin?success=game_restarted', 302);
};
