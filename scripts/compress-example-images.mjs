import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const names = ['dressrosa', 'skypiea', 'waterseven'];

for (const name of names) {
  const input = path.join(rootDir, 'misc', `${name}.png`);
  const output = path.join(rootDir, 'misc', `${name}.webp`);

  await sharp(input)
    .resize(1200, 900, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(output);

  console.log(`${name} -> ${output}`);
}
