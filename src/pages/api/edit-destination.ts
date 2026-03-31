import { getSiteUrl } from '../../lib/site';
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { reconcileGameState } from '../../lib/game-state';
import {
  buildDestinationPhotos,
  DestinationPhotoError,
  getDestinationPhotos,
  MAX_DESCRIPTION_LENGTH,
  normalizeDescription,
} from '../../lib/destination-images';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/login', 302);

  const form          = await request.formData();
  const destinationId = (form.get('destination_id') as string)?.trim();
  const name          = (form.get('name')            as string)?.trim();
  const rawDescription = String(form.get('description') ?? '').trim();
  const description = normalizeDescription(rawDescription);

  if (!destinationId || !name) {
    return redirect(`/edit?id=${destinationId}&error=missing_name`, 302);
  }

  if (rawDescription.length > MAX_DESCRIPTION_LENGTH) {
    return redirect(`/edit?id=${destinationId}&error=description_too_long`, 302);
  }

  // Fetch destination
  const { data: dest } = await supabase
    .from('destinations')
    .select('*')
    .eq('id', destinationId)
    .eq('is_removed', false)
    .single();

  if (!dest) return redirect('/submit?error=not_found', 302);

  // Permission: creator during submission phase, or admin at any time
  const { stage } = await reconcileGameState({
    gameUrl: getSiteUrl(),
  });

  const isCreator = dest.created_by === user.email;
  const isAdmin   = user.is_admin;

  if (!isAdmin && (!isCreator || stage !== 'submission')) {
    return redirect('/submit?error=forbidden', 302);
  }

  // Name uniqueness (exclude current destination)
  const nameNormalized = name.toLowerCase().replace(/\s+/g, '');
  if (nameNormalized !== dest.name_normalized) {
    const { data: taken } = await supabase
      .from('destinations')
      .select('id')
      .eq('name_normalized', nameNormalized)
      .eq('is_removed', false)
      .neq('id', destinationId)
      .single();

    if (taken) return redirect(`/edit?id=${destinationId}&error=name_taken`, 302);
  }

  let photos = getDestinationPhotos(dest);
  try {
    photos = await buildDestinationPhotos(form, {
      existingPhotos: photos,
      storagePrefix: `destinations/${destinationId}`,
    });
  } catch (uploadErr) {
    if (uploadErr instanceof DestinationPhotoError) {
      return redirect(`/edit?id=${destinationId}&error=${uploadErr.code}`, 302);
    }
    console.error('[edit] upload error:', uploadErr);
    return redirect(`/edit?id=${destinationId}&error=upload_failed`, 302);
  }

  const updates: Record<string, unknown> = {
    name,
    name_normalized: nameNormalized,
    description,
    photos,
    photo_url: photos[0]?.url ?? null,
  };

  const { error } = await supabase
    .from('destinations')
    .update(updates)
    .eq('id', destinationId);

  if (error) {
    console.error('[edit] update error:', error);
    return redirect(`/edit?id=${destinationId}&error=db_error`, 302);
  }

  const returnTo = dest.is_example ? '/admin?success=edited' : '/submit?success=edited';
  return redirect(returnTo, 302);
};
