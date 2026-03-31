import { getSiteUrl } from '../../../lib/site';
import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import { sendPhaseUpdateNotification, sendWinnerAnnouncement } from '../../../lib/email';
import { getStage } from '../../../lib/stage';
import type { Stage } from '../../../lib/stage';
import { reconcileGameState } from '../../../lib/game-state';

const nextStageByCurrent: Record<Stage, Stage | null> = {
  submission: 'voting',
  voting: 'decided',
  draw: 'decided',
  decided: null,
};

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user?.is_admin) return redirect('/login', 302);

  const { data: settings, error: settingsError } = await supabase.from('settings').select('*').single();
  if (settingsError || !settings) {
    console.error('[request-next-phase] settings error:', settingsError);
    return redirect('/admin?error=db_error', 302);
  }

  const currentStage = getStage(settings);
  const nextStage = nextStageByCurrent[currentStage];
  if (!nextStage) return redirect('/admin?error=no_changes', 302);

  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60_000).toISOString();
  const payload: Record<string, unknown> = {};

  if (currentStage === 'submission') {
    payload.submission_deadline = oneMinuteAgo;
    if (!settings.voting_deadline || new Date(settings.voting_deadline) <= now) {
      payload.voting_deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    }
  } else if (currentStage === 'voting') {
    payload.submission_deadline = settings.submission_deadline ?? oneMinuteAgo;
    payload.voting_deadline = oneMinuteAgo;
  } else if (currentStage === 'draw') {
    payload.draw_deadline = oneMinuteAgo;
  }

  const { error } = await supabase
    .from('settings')
    .update(payload)
    .eq('id', 1);

  if (error) {
    console.error('[request-next-phase] update error:', error);
    return redirect('/admin?error=db_error', 302);
  }

  const gameUrl = getSiteUrl();
  const { data: activeParticipants } = await supabase
    .from('participants')
    .select('email, avatar_url, email_notifications_enabled')
    .eq('is_active', true);

  const { settings: updatedSettings, stage: updatedStage, autoStartedDraw } = await reconcileGameState({
    gameUrl,
  });

  if (updatedStage === 'voting') {
    const { data: activeDestinations } = await supabase
      .from('destinations')
      .select('created_by')
      .eq('is_removed', false)
      .eq('is_example', false);

    const submittedEmails = new Set(
      (activeDestinations ?? [])
        .map((destination) => destination.created_by)
        .filter(Boolean),
    );

    const participantsWithBonuses = (activeParticipants ?? []).map((participant) => {
      const hasProfilePhoto = Boolean(
        participant.avatar_url &&
        participant.avatar_url !== '/default-avatar.webp' &&
        !participant.avatar_url.includes('default-avatar'),
      );
      const profilePhotoBonus = updatedSettings?.bonus_profile_photo_enabled && hasProfilePhoto
        ? Number(updatedSettings?.bonus_profile_photo_points ?? 0)
        : 0;
      const submissionBonus = updatedSettings?.bonus_submission_enabled && submittedEmails.has(participant.email)
        ? Number(updatedSettings?.bonus_submission_points ?? 0)
        : 0;

      return {
        email: participant.email,
        current_vote_bonus_profile_photo_points: profilePhotoBonus,
        current_vote_bonus_submission_points: submissionBonus,
        current_vote_bonus_points: profilePhotoBonus + submissionBonus,
      };
    });

    if (participantsWithBonuses.length > 0) {
      const { error: bonusError } = await supabase
        .from('participants')
        .upsert(participantsWithBonuses, { onConflict: 'email' });

      if (bonusError) {
        console.error('[request-next-phase] bonus error:', bonusError);
      }
    }
  }

  const participantEmails = (activeParticipants ?? [])
    .filter((participant) => participant.email_notifications_enabled !== false)
    .map((participant) => participant.email);

  if (!autoStartedDraw) {
    await Promise.allSettled(
      participantEmails.map((email) => sendPhaseUpdateNotification(email, {
        stage: updatedStage,
        gameUrl,
      })),
    );
  }

  if (!autoStartedDraw && updatedStage === 'decided') {
    const { data: destinations } = await supabase
      .from('destinations')
      .select('id, name')
      .eq('is_removed', false)
      .eq('is_example', false);
    const { data: votes } = await supabase.from('votes').select('destination_id, points');

    const totals = new Map<string, number>();
    (votes ?? []).forEach((vote) => {
      totals.set(vote.destination_id, (totals.get(vote.destination_id) ?? 0) + vote.points);
    });

    const ranked = (destinations ?? [])
      .map((destination) => ({
        ...destination,
        totalPoints: totals.get(destination.id) ?? 0,
      }))
      .sort((left, right) => right.totalPoints - left.totalPoints);

    const winner = ranked[0];
    if (winner) {
      await Promise.allSettled(
        participantEmails.map((email) => sendWinnerAnnouncement(email, {
          gameUrl,
          winnerName: winner.name,
          winnerPoints: winner.totalPoints,
          secondPlaceName: ranked[1]?.name ?? null,
          thirdPlaceName: ranked[2]?.name ?? null,
        })),
      );
    }
  }

  return redirect('/admin?success=phase_advanced', 302);
};
