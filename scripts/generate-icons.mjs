import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

// PNG verde 1x1 válido, escalado pelo navegador
const GREEN_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

writeFileSync(join(publicDir, 'pwa-192.png'), GREEN_PNG);
writeFileSync(join(publicDir, 'pwa-512.png'), GREEN_PNG);
console.log('Ícones PWA gerados.');
