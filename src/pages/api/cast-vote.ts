import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { reconcileGameState } from '../../lib/game-state';
import { applyVoteBonus, getActiveVotePoints } from '../../lib/voting';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/login', 302);

  const { settings, stage } = await reconcileGameState({
    gameUrl: new URL('/', request.url).toString(),
  });
  if (stage !== 'voting' && stage !== 'draw') {
    return redirect('/vote?error=wrong_stage', 302);
  }

  const { data: participant } = await supabase
    .from('participants')
    .select('current_vote_bonus_points')
    .eq('email', user.email)
    .maybeSingle();

  let query = supabase
    .from('destinations')
    .select('id')
    .eq('is_removed', false)
    .eq('is_example', false);

  if (stage === 'draw') {
    query = query.eq('is_in_draw', true);
  }

  const { data: destinations } = await query;

  const activePoints = applyVoteBonus(
    getActiveVotePoints(settings?.vote_point_options ?? [10, 50, 100], destinations?.length ?? 0),
    participant?.current_vote_bonus_points ?? 0,
  );
  const form = await request.formData();

  if (activePoints.length === 0) {
    return redirect('/vote?error=invalid_points', 302);
  }

  const selections = activePoints.map(points => ({
    points,
    destinationId: (form.get(`destination_${points}`) as string | null)?.trim() ?? '',
  }));

  if (selections.some(selection => !selection.destinationId)) {
    return redirect('/vote?error=missing_fields', 302);
  }

  const destinationIds = selections.map(selection => selection.destinationId);
  if (new Set(destinationIds).size !== destinationIds.length) {
    return redirect('/vote?error=duplicate_destinations', 302);
  }

  const validDestinationIds = new Set((destinations ?? []).map(destination => destination.id));
  if (destinationIds.some(destinationId => !validDestinationIds.has(destinationId))) {
    return redirect('/vote?error=invalid_destination', 302);
  }

  const { error: deleteError } = await supabase
    .from('votes')
    .delete()
    .eq('participant_email', user.email);

  if (deleteError) {
    console.error('[cast-vote] delete error:', deleteError);
    return redirect('/vote?error=db_error', 302);
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from('votes').insert(
    selections.map(selection => ({
      participant_email: user.email,
      destination_id: selection.destinationId,
      points: selection.points,
      updated_at: now,
    }))
  );

  if (error) {
    console.error('[cast-vote] error:', error);
    return redirect('/vote?error=db_error', 302);
  }

  return redirect('/vote?success=true', 302);
};
