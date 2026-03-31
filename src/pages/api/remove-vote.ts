import { getSiteUrl } from '../../lib/site';
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { reconcileGameState } from '../../lib/game-state';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/login', 302);

  const { stage } = await reconcileGameState({
    gameUrl: getSiteUrl(),
  });
  if (stage !== 'voting' && stage !== 'draw') {
    return redirect('/vote?error=wrong_stage', 302);
  }

  const { error } = await supabase
    .from('votes')
    .delete()
    .eq('participant_email', user.email);

  if (error) {
    console.error('[remove-vote] error:', error);
    return redirect('/vote?error=db_error', 302);
  }

  return redirect('/vote?success=removed', 302);
};
