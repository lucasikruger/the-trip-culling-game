import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { supabase } from '../../lib/supabase';
import { MAX_DISPLAY_NAME_LENGTH, normalizeDisplayName } from '../../lib/profile';
import { DestinationPhotoError, ensureImageFile } from '../../lib/destination-images';

const DEFAULT_AVATAR_PATH = '/default-avatar.webp';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/login', 302);

  const form = await request.formData();
  const rawDisplayName = String(form.get('display_name') ?? '').trim();
  const displayName = normalizeDisplayName(rawDisplayName, user.email);
  const avatarFile = form.get('avatar') as File | null;
  const emailNotificationsEnabled = form.get('email_notifications_enabled') === 'on';

  if (rawDisplayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return redirect('/profile?error=display_name_too_long', 302);
  }

  let avatarUrl = user.avatar_url || DEFAULT_AVATAR_PATH;

  if (avatarFile && avatarFile.size > 0) {
    let webpBuffer: Buffer;
    try {
      const buffer = await ensureImageFile(avatarFile);
      webpBuffer = await sharp(buffer)
        .resize(512, 512, { fit: 'cover', position: 'attention' })
        .webp({ quality: 84 })
        .toBuffer();
    } catch (error) {
      if (error instanceof DestinationPhotoError) {
        return redirect('/profile?error=invalid_image', 302);
      }
      throw error;
    }

    const filename = `avatars/${user.email.replace(/[^a-z0-9]/gi, '-')}-${randomUUID()}.webp`;
    const { error: uploadErr } = await supabase.storage
      .from('destinations')
      .upload(filename, webpBuffer, { contentType: 'image/webp', upsert: true });

    if (uploadErr) {
      console.error('[update-profile] avatar upload error:', uploadErr);
      return redirect('/profile?error=upload_failed', 302);
    }

    const { data: urlData } = supabase.storage.from('destinations').getPublicUrl(filename);
    avatarUrl = urlData.publicUrl;
  }

  const { error } = await supabase
    .from('participants')
    .update({
      display_name: displayName,
      avatar_url: avatarUrl,
      email_notifications_enabled: emailNotificationsEnabled,
    })
    .eq('email', user.email);

  if (error) {
    console.error('[update-profile] error:', error);
    return redirect('/profile?error=db_error', 302);
  }

  return redirect('/profile?success=true', 302);
};
