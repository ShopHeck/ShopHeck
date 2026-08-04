// Inlines Inter woff2 files as data URIs into the design-direction preview page.
// The Artifact CSP blocks font CDNs, so the faces must ship inside the document.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fontDir = join(here, '../../node_modules/@fontsource/inter/files');
const weights = [400, 500, 700, 800, 900];

const faces = weights.map(w => {
  const b64 = readFileSync(join(fontDir, `inter-latin-${w}-normal.woff2`)).toString('base64');
  return `@font-face{font-family:Inter;font-style:normal;font-weight:${w};font-display:swap;` +
         `src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
}).join('\n');

const src = readFileSync(join(here, 'preview.src.html'), 'utf8');
if (!src.includes('/*@FONTS@*/')) throw new Error('missing /*@FONTS@*/ placeholder');
const out = src.replace('/*@FONTS@*/', faces);
writeFileSync(join(here, 'preview.html'), out);
console.log(`built preview.html — ${(out.length / 1024).toFixed(0)} KB`);
