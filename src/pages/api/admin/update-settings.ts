import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import { parseDateTimeLocalToIso } from '../../../lib/datetime-local';
import { getDrawDurationMinutes, getStage } from '../../../lib/stage';
import { normalizeVotePointOptions, MAX_VOTE_OPTIONS } from '../../../lib/voting';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user?.is_admin) return redirect('/login', 302);

  const { data: currentSettings } = await supabase.from('settings').select('*').single();
  const currentStage = getStage(currentSettings);
  const form = await request.formData();

  const submissionDeadline = form.get('submission_deadline') as string | null;
  const votingDeadline     = form.get('voting_deadline')     as string | null;
  const drawDurationHoursRaw = (form.get('draw_duration_hours') as string | null)?.trim();
  const drawDurationMinutesRaw = (form.get('draw_duration_minutes') as string | null)?.trim();
  const pointOptionsRaw    = (form.get('vote_point_options') as string)?.trim();
  const bonusProfilePhotoEnabled = form.get('bonus_profile_photo_enabled') === 'on';
  const bonusProfilePhotoPointsRaw = (form.get('bonus_profile_photo_points') as string | null)?.trim();
  const bonusSubmissionEnabled = form.get('bonus_submission_enabled') === 'on';
  const bonusSubmissionPointsRaw = (form.get('bonus_submission_points') as string | null)?.trim();
  const timezoneOffsetMinutes = (form.get('timezone_offset_minutes') as string | null)?.trim();

  const updates: Record<string, unknown> = {};

  if (submissionDeadline) {
    const iso = parseDateTimeLocalToIso(submissionDeadline, timezoneOffsetMinutes);
    if (!iso) return redirect('/admin?error=missing_fields', 302);
    updates.submission_deadline = iso;
  }
  if (votingDeadline) {
    const iso = parseDateTimeLocalToIso(votingDeadline, timezoneOffsetMinutes);
    if (!iso) return redirect('/admin?error=missing_fields', 302);
    updates.voting_deadline = iso;
  }
  if (drawDurationHoursRaw !== undefined || drawDurationMinutesRaw !== undefined) {
    const hours = drawDurationHoursRaw ? Number(drawDurationHoursRaw) : Math.floor(getDrawDurationMinutes(currentSettings) / 60);
    const minutes = drawDurationMinutesRaw ? Number(drawDurationMinutesRaw) : (getDrawDurationMinutes(currentSettings) % 60);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || minutes < 0 || minutes > 59) {
      return redirect('/admin?error=invalid_draw_duration', 302);
    }
    const totalMinutes = Math.trunc(hours) * 60 + Math.trunc(minutes);
    if (totalMinutes < 1) return redirect('/admin?error=invalid_draw_duration', 302);
    updates.draw_duration_hours = Math.max(1, Math.ceil(totalMinutes / 60));
    updates.draw_duration_minutes = totalMinutes;
  }
  if (pointOptionsRaw) {
    const parsedRaw = pointOptionsRaw.split(',').map(v => v.trim()).filter(Boolean);
    const parsed = normalizeVotePointOptions(parsedRaw.map(v => parseInt(v, 10)));

    if (parsed.length === 0) {
      return redirect('/admin?error=invalid_points', 302);
    }
    if (parsedRaw.length > MAX_VOTE_OPTIONS) {
      return redirect('/admin?error=too_many_points', 302);
    }
    if (currentStage === 'voting' && JSON.stringify(parsed) !== JSON.stringify(normalizeVotePointOptions(currentSettings?.vote_point_options ?? []))) {
      return redirect('/admin?error=vote_points_locked', 302);
    }
    updates.vote_point_options = parsed;
  }

  const bonusProfilePhotoPoints = bonusProfilePhotoPointsRaw ? Number(bonusProfilePhotoPointsRaw) : Number(currentSettings?.bonus_profile_photo_points ?? 1);
  if (!Number.isFinite(bonusProfilePhotoPoints) || bonusProfilePhotoPoints < 0) {
    return redirect('/admin?error=invalid_bonus_points', 302);
  }
  updates.bonus_profile_photo_enabled = bonusProfilePhotoEnabled;
  updates.bonus_profile_photo_points = Math.trunc(bonusProfilePhotoPoints);

  const bonusSubmissionPoints = bonusSubmissionPointsRaw ? Number(bonusSubmissionPointsRaw) : Number(currentSettings?.bonus_submission_points ?? 1);
  if (!Number.isFinite(bonusSubmissionPoints) || bonusSubmissionPoints < 0) {
    return redirect('/admin?error=invalid_bonus_points', 302);
  }
  updates.bonus_submission_enabled = bonusSubmissionEnabled;
  updates.bonus_submission_points = Math.trunc(bonusSubmissionPoints);

  if (Object.keys(updates).length === 0) {
    return redirect('/admin?error=no_changes', 302);
  }

  const { error } = await supabase
    .from('settings')
    .update(updates)
    .eq('id', 1);

  if (error) {
    console.error('[update-settings] error:', error);
    return redirect('/admin?error=db_error', 302);
  }

  return redirect('/admin?success=settings_updated', 302);
};
