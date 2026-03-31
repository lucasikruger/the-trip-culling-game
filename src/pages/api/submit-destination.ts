import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { reconcileGameState } from '../../lib/game-state';
import {
  buildDestinationPhotos,
  DestinationPhotoError,
  MAX_DESCRIPTION_LENGTH,
  normalizeDescription,
} from '../../lib/destination-images';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/login', 302);

  // Check stage
  const { stage } = await reconcileGameState({
    gameUrl: new URL('/', request.url).toString(),
  });
  if (stage !== 'submission') {
    return redirect('/submit?error=wrong_stage', 302);
  }

  // Check user hasn't already submitted an active destination
  const { data: existing } = await supabase
    .from('destinations')
    .select('id')
    .eq('created_by', user.email)
    .eq('is_removed', false)
    .single();

  if (existing) {
    return redirect('/submit?error=already_submitted', 302);
  }

  const form = await request.formData();
  const name        = (form.get('name')        as string)?.trim();
  const rawDescription = String(form.get('description') ?? '').trim();
  const description = normalizeDescription(rawDescription);

  if (!name) {
    return redirect('/submit?error=missing_name', 302);
  }

  if (rawDescription.length > MAX_DESCRIPTION_LENGTH) {
    return redirect('/submit?error=description_too_long', 302);
  }

  const nameNormalized = name.toLowerCase().replace(/\s+/g, '');

  // Check name uniqueness
  const { data: nameTaken } = await supabase
    .from('destinations')
    .select('id')
    .eq('name_normalized', nameNormalized)
    .eq('is_removed', false)
    .single();

  if (nameTaken) {
    return redirect('/submit?error=name_taken', 302);
  }

  let photos = [];

  try {
    photos = await buildDestinationPhotos(form, {
      storagePrefix: `user-submissions/${user.email.replace(/[^a-z0-9]/gi, '-')}`,
    });
  } catch (uploadErr) {
    if (uploadErr instanceof DestinationPhotoError) {
      return redirect(`/submit?error=${uploadErr.code}`, 302);
    }
    console.error('[submit] upload error:', uploadErr);
    return redirect('/submit?error=upload_failed', 302);
  }

  const { error: insertErr } = await supabase.from('destinations').insert({
    name,
    name_normalized: nameNormalized,
    description,
    photo_url: photos[0]?.url ?? null,
    photos,
    created_by: user.email,
  });

  if (insertErr) {
    console.error('[submit] insert error:', insertErr);
    return redirect('/submit?error=db_error', 302);
  }

  return redirect('/submit?success=true', 302);
};
