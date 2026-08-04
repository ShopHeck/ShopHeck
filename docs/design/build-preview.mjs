// Builds the design-direction preview from preview.src.html.
//
// Two outputs, because the page has two homes with different contracts:
//
//   preview.html          Complete standalone document. This is what the README
//                         tells you to open and what a reviewer clicks in the
//                         repo, so it needs its own <head> — without a viewport
//                         meta, mobile Safari lays the page out at its 980px
//                         default and the max-width:860px rules never fire.
//
//   preview.artifact.html Body content only. The Artifact host supplies its own
//                         <!doctype>/<head>/<body> skeleton at publish time, so
//                         shipping a second full document there would nest them.
//
// Both inline Inter as base64 woff2: the Artifact CSP blocks font CDNs, and the
// standalone file is meant to survive being copied anywhere.
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
const body = src.replace('/*@FONTS@*/', faces);

// The <title> lives in the source because the Artifact host reads it from the
// content; the standalone document needs it hoisted into a real <head>.
const title = (body.match(/<title>([\s\S]*?)<\/title>/) || [, 'Design directions'])[1];
const standalone =
  '<!doctype html>\n<html lang="en">\n<head>\n' +
  '<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  `<title>${title}</title>\n` +
  `</head>\n<body>\n${body.replace(/<title>[\s\S]*?<\/title>\s*/, '')}</body>\n</html>\n`;

writeFileSync(join(here, 'preview.html'), standalone);
writeFileSync(join(here, 'preview.artifact.html'), body);
console.log(
  `built preview.html (${(standalone.length / 1024).toFixed(0)} KB standalone) ` +
  `and preview.artifact.html (${(body.length / 1024).toFixed(0)} KB body-only)`
);
