import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

async function generateWithSharp(svg) {
  const { default: sharp } = await import('sharp');
  const sizes = [
    { name: 'pwa-192.png', size: 192 },
    { name: 'pwa-512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'icon-512-maskable.png', size: 512 },
  ];
  for (const { name, size } of sizes) {
    await sharp(svg).resize(size, size).png().toFile(join(publicDir, name));
  }
  await sharp(svg).resize(32, 32).png().toFile(join(publicDir, 'favicon.png'));
}

function copyIfExists(from, to) {
  const src = join(publicDir, from);
  if (existsSync(src)) copyFileSync(src, join(publicDir, to));
}

try {
  const svg = readFileSync(join(publicDir, 'icon.svg'));
  await generateWithSharp(svg);
  console.log('Ícones PWA gerados via sharp.');
} catch {
  // Fallback: usa pwa-512.png existente ou placeholder
  if (existsSync(join(publicDir, 'pwa-512.png'))) {
    copyIfExists('pwa-512.png', 'pwa-192.png');
    copyIfExists('pwa-512.png', 'apple-touch-icon.png');
    copyIfExists('pwa-512.png', 'icon-512-maskable.png');
    console.log('Ícones PWA copiados de pwa-512.png.');
  } else {
    const GREEN_PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    for (const name of ['pwa-192.png', 'pwa-512.png', 'apple-touch-icon.png', 'icon-512-maskable.png']) {
      writeFileSync(join(publicDir, name), GREEN_PNG);
    }
    console.log('Ícones PWA placeholder gerados.');
  }
}
