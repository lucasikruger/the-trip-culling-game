import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { supabase } from './supabase';

export interface DestinationPhoto {
  url: string;
  caption: string;
}

export class DestinationPhotoError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export const MAX_PHOTOS = 5;
export const MAX_CAPTION_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 1200;

export function normalizeCaption(value: FormDataEntryValue | string | null | undefined): string {
  return String(value ?? '').trim().slice(0, MAX_CAPTION_LENGTH);
}

export function normalizeDescription(value: FormDataEntryValue | string | null | undefined): string {
  return String(value ?? '').trim().slice(0, MAX_DESCRIPTION_LENGTH);
}

export function getDestinationPhotos(destination: Record<string, any> | null | undefined): DestinationPhoto[] {
  const rawPhotos = Array.isArray(destination?.photos) ? destination.photos : [];
  const photos = rawPhotos
    .filter((photo: any) => typeof photo?.url === 'string' && photo.url.trim())
    .slice(0, MAX_PHOTOS)
    .map((photo: any) => ({
      url: photo.url.trim(),
      caption: normalizeCaption(photo.caption),
    }));

  if (photos.length > 0) return photos;

  if (typeof destination?.photo_url === 'string' && destination.photo_url.trim()) {
    return [{ url: destination.photo_url.trim(), caption: '' }];
  }

  return [];
}

export function getPrimaryPhoto(destination: Record<string, any> | null | undefined): DestinationPhoto | null {
  return getDestinationPhotos(destination)[0] ?? null;
}

export function getSecondaryPhotos(destination: Record<string, any> | null | undefined): DestinationPhoto[] {
  return getDestinationPhotos(destination).slice(1);
}

export async function ensureImageFile(file: File): Promise<Buffer> {
  if (!file || file.size === 0) {
    throw new DestinationPhotoError('invalid_image');
  }

  if (typeof file.type !== 'string' || !file.type.startsWith('image/')) {
    throw new DestinationPhotoError('invalid_image');
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.format) {
      throw new DestinationPhotoError('invalid_image');
    }
  } catch (error) {
    if (error instanceof DestinationPhotoError) {
      throw error;
    }
    throw new DestinationPhotoError('invalid_image');
  }

  return buffer;
}

export async function buildDestinationPhotos(
  form: FormData,
  options: {
    existingPhotos?: DestinationPhoto[];
    storagePrefix: string;
  }
): Promise<DestinationPhoto[]> {
  const existingPhotos = (options.existingPhotos ?? []).slice(0, MAX_PHOTOS);
  const nextPhotos: DestinationPhoto[] = [];

  for (let index = 0; index < MAX_PHOTOS; index += 1) {
    const photoFile = form.get(`photo_${index}`) as File | null;
    const rawCaption = String(form.get(`caption_${index}`) ?? '').trim();
    const caption = normalizeCaption(rawCaption);
    const shouldRemove = form.get(`remove_photo_${index}`) === 'on';
    const existingPhoto = existingPhotos[index] ?? null;

    if (rawCaption.length > MAX_CAPTION_LENGTH) {
      throw new DestinationPhotoError('caption_too_long');
    }

    if (!existingPhoto && (!photoFile || photoFile.size === 0) && rawCaption) {
      throw new DestinationPhotoError('caption_without_photo');
    }

    if (photoFile && photoFile.size > 0) {
      const buffer = await ensureImageFile(photoFile);
      const webpBuffer = await sharp(buffer)
        .resize(1600, 1200, { fit: 'cover', position: 'attention' })
        .webp({ quality: 82 })
        .toBuffer();

      const filename = `${options.storagePrefix}/${index}-${randomUUID()}.webp`;
      const { error: uploadErr } = await supabase.storage
        .from('destinations')
        .upload(filename, webpBuffer, { contentType: 'image/webp', upsert: true });

      if (uploadErr) {
        throw uploadErr;
      }

      const { data: urlData } = supabase.storage.from('destinations').getPublicUrl(filename);
      nextPhotos.push({
        url: urlData.publicUrl,
        caption,
      });
      continue;
    }

    if (existingPhoto && !shouldRemove) {
      nextPhotos.push({
        url: existingPhoto.url,
        caption,
      });
    }
  }

  return nextPhotos;
}
