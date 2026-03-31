// Seed default settings and the game master participant into Supabase.
// Runs automatically on container start.
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[seed] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ── Game masters ────────────────────────────────────────────
const rawGameMasterEmails = process.env.GAME_MASTER_EMAILS || process.env.GAME_MASTER_EMAIL || 'lucasikruger@gmail.com';
const gameMasterEmails = rawGameMasterEmails
  .split(',')
  .map(email => email.trim().toLowerCase())
  .filter(Boolean);

if (gameMasterEmails.length === 0) {
  console.error('[seed] Missing GAME_MASTER_EMAILS');
  process.exit(1);
}

const { error: pErr } = await supabase
  .from('participants')
  .upsert(
    gameMasterEmails.map(email => ({
      email,
      is_admin: true,
      is_super_admin: true,
      is_active: true,
    })),
    { onConflict: 'email' }
  );

if (pErr) { console.error('[seed] game master error:', pErr.message); process.exit(1); }
console.log(`[seed] game masters ready: ${gameMasterEmails.join(', ')}`);

// ── Default settings (only inserts if row doesn't exist) ───
const { error: sErr } = await supabase
  .from('settings')
  .upsert({
    id: 1,
    submission_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    voting_deadline:     new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    draw_duration_hours: 24,
    draw_duration_minutes: 24 * 60,
    vote_point_options:  [10, 50, 100],
    bonus_profile_photo_enabled: true,
    bonus_profile_photo_points: 1,
    bonus_submission_enabled: true,
    bonus_submission_points: 1,
  }, { onConflict: 'id', ignoreDuplicates: true });

if (sErr) { console.error('[seed] settings error:', sErr.message); process.exit(1); }
console.log('[seed] settings ready');

// ── Storage bucket ──────────────────────────────────────────
const { error: bErr } = await supabase.storage.createBucket('destinations', { public: true });
if (bErr && !bErr.message.includes('already exists')) {
  console.error('[seed] bucket error:', bErr.message);
}
console.log('[seed] storage bucket ready');

function uploadExampleImage(slug) {
  const assetPath = join(__dirname, `../misc/${slug}.webp`);
  if (!existsSync(assetPath)) {
    console.warn(`[seed] example image missing for ${slug}: ${assetPath}`);
    return null;
  }

  return readFileSync(assetPath);
}

// ── Example trips (non-voteable) ────────────────────────────
const exampleTrips = [
  {
    name: 'Water Seven',
    name_normalized: 'waterseven',
    description: 'The city of water and world-class shipwrights. Canals instead of streets, sea trains that cross the ocean, and the Galley-La Company. Bring a raincoat.',
    created_by: null,
    is_example: true,
  },
  {
    name: 'Dressrosa',
    name_normalized: 'dressrosa',
    description: 'A kingdom of flowers, passion, and a world-class colosseum. Flamenco music plays in the streets and the food is incredible. Ignore the birdcage.',
    created_by: null,
    is_example: true,
  },
  {
    name: 'Skypiea',
    name_normalized: 'skypiea',
    description: 'An island floating above the clouds. Ancient ruins of a golden city, cool technology called Dials, and breathtaking views. Getting there is half the adventure.',
    created_by: null,
    is_example: true,
  },
];

for (const trip of exampleTrips) {
  const imageBuffer = uploadExampleImage(trip.name_normalized);
  let photoUrl = null;

  if (imageBuffer) {
    const storagePath = `examples/${trip.name_normalized}.webp`;
    const { error: uploadErr } = await supabase.storage
      .from('destinations')
      .upload(storagePath, imageBuffer, { contentType: 'image/webp', upsert: true });

    if (uploadErr) {
      console.error(`[seed] example image upload error (${trip.name}):`, uploadErr.message);
    } else {
      const { data: urlData } = supabase.storage.from('destinations').getPublicUrl(storagePath);
      photoUrl = urlData.publicUrl;
    }
  }

  const { data: existing } = await supabase
    .from('destinations')
    .select('id')
    .eq('name_normalized', trip.name_normalized)
    .eq('is_example', true)
    .maybeSingle();

  const payload = {
    ...trip,
    photo_url: photoUrl,
    photos: photoUrl ? [{ url: photoUrl, caption: trip.name }] : [],
  };

  if (!existing) {
    const { error: exErr } = await supabase.from('destinations').insert(payload);
    if (exErr) console.error(`[seed] example trip error (${trip.name}):`, exErr.message);
    else console.log(`[seed] example trip added: ${trip.name}`);
  } else {
    const { error: updateErr } = await supabase
      .from('destinations')
      .update(payload)
      .eq('id', existing.id);

    if (updateErr) console.error(`[seed] example trip update error (${trip.name}):`, updateErr.message);
    else console.log(`[seed] example trip refreshed: ${trip.name}`);
  }
}

console.log('[seed] done!');
