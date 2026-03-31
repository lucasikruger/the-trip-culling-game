import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import {
  buildDestinationPhotos,
  DestinationPhotoError,
  MAX_DESCRIPTION_LENGTH,
  normalizeDescription,
} from '../../../lib/destination-images';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user?.is_admin) return redirect('/login', 302);

  const form = await request.formData();
  const name = (form.get('name') as string)?.trim();
  const rawDescription = String(form.get('description') ?? '').trim();
  const description = normalizeDescription(rawDescription);

  if (!name) {
    return redirect('/admin/example-new?error=missing_name', 302);
  }

  if (rawDescription.length > MAX_DESCRIPTION_LENGTH) {
    return redirect('/admin/example-new?error=description_too_long', 302);
  }

  const nameNormalized = name.toLowerCase().replace(/\s+/g, '');
  const { data: existing } = await supabase
    .from('destinations')
    .select('id')
    .eq('name_normalized', nameNormalized)
    .eq('is_removed', false)
    .single();

  if (existing) {
    return redirect('/admin/example-new?error=name_taken', 302);
  }

  let photos = [];
  try {
    photos = await buildDestinationPhotos(form, {
      storagePrefix: `examples/${nameNormalized}`,
    });
  } catch (uploadErr) {
    if (uploadErr instanceof DestinationPhotoError) {
      return redirect(`/admin/example-new?error=${uploadErr.code}`, 302);
    }
    console.error('[create-example] upload error:', uploadErr);
    return redirect('/admin/example-new?error=upload_failed', 302);
  }

  const { error } = await supabase.from('destinations').insert({
    name,
    name_normalized: nameNormalized,
    description,
    photo_url: photos[0]?.url ?? null,
    photos,
    created_by: null,
    is_example: true,
  });

  if (error) {
    console.error('[create-example] insert error:', error);
    return redirect('/admin/example-new?error=db_error', 302);
  }

  return redirect('/admin?success=example_created', 302);
};
