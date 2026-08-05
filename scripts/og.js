#!/usr/bin/env node
/**
 * Builds og.png — the preview card WhatsApp, X and Facebook show when someone
 * shares the site. It bakes in the current location, so a shared link says
 * "Istana Merdeka" rather than something generic.
 *
 * Run from the deploy workflow, after the site folder is assembled:
 *   node scripts/og.js _site/og.png
 *
 * @resvg/resvg-js is installed at deploy time only — nothing to install to
 * work on this project normally.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOCATIONS = path.join(ROOT, 'data', 'locations.json');
const FONT = path.join(ROOT, 'assets', 'fonts', 'InstrumentSerif-Regular.ttf');
const OUT = process.argv[2] || path.join(ROOT, 'og.png');

const W = 1200, H = 630;
const INK = '#0A0B0D', BONE = '#EDE8DF', DIM = '#9CA3AE', MERAH = '#E1362C';

const xml = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
));

/* Instrument Serif is roughly 0.42em average advance. Shrink the headline
   until it fits the 1030px text column rather than letting it overflow. */
function fitSize(text, max, ideal, min) {
  const est = len => len * 0.42;
  let size = ideal;
  while (size > min && est(text.length) * size > max) size -= 4;
  return size;
}

function build(data) {
  const loc = (data.locations || []).find(l => l.id === data.current) || (data.locations || [])[0];

  const place  = loc ? loc.place : 'Belum ada data';
  const region = loc
    ? (loc.country_code === 'ID'
        ? [loc.city, loc.region].filter(Boolean).join(', ')
        : [loc.city, loc.country].filter(Boolean).join(', '))
    : 'Menunggu pemberitaan';

  const outlets = loc ? new Set((loc.sources || []).map(s => s.outlet)).size : 0;
  const meta = loc
    ? `${loc.event_label_id}  ·  KEYAKINAN ${loc.confidence}%  ·  ${outlets} MEDIA`
    : 'MEMANTAU PEMBERITAAN PUBLIK';

  /* "beliau berada di / Belum ada data" would be nonsense — swap the lead-in
     when there is nothing to announce. */
  const lead = loc
    ? 'Menurut pemberitaan terakhir, beliau berada di'
    : 'Status pemantauan';

  const placeSize = fitSize(place, 1030, 104, 46);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="82%" cy="6%" r="62%">
      <stop offset="0%"   stop-color="${MERAH}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="${MERAH}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="4%" cy="100%" r="52%">
      <stop offset="0%"   stop-color="${MERAH}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${MERAH}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${INK}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>
  <rect x="0" y="0" width="7" height="${H}" fill="${MERAH}"/>

  <!-- masthead -->
  <circle cx="78" cy="72" r="20" fill="${MERAH}" opacity="0.16"/>
  <circle cx="78" cy="72" r="12" fill="${MERAH}" opacity="0.30"/>
  <circle cx="78" cy="72" r="6.5" fill="${MERAH}"/>
  <text x="112" y="80" font-family="Instrument Serif" font-size="27"
        fill="${BONE}" letter-spacing="5">PRESIDEN DI MANA SEKARANG?</text>

  <line x1="78" y1="118" x2="${W - 78}" y2="118" stroke="#262B33" stroke-width="1"/>

  <!-- the answer -->
  <text x="78" y="212" font-family="Instrument Serif" font-size="30"
        fill="${DIM}" letter-spacing="1">${xml(lead)}</text>

  <text x="78" y="${212 + placeSize + 34}" font-family="Instrument Serif"
        font-size="${placeSize}" fill="${MERAH}">${xml(place)}</text>

  <text x="78" y="${212 + placeSize + 92}" font-family="Instrument Serif" font-size="38"
        fill="${BONE}">${xml(region)}</text>

  <text x="78" y="${212 + placeSize + 148}" font-family="Instrument Serif" font-size="23"
        fill="${DIM}" letter-spacing="3.5">${xml(meta.toUpperCase())}</text>

  <!-- footer -->
  <line x1="78" y1="${H - 92}" x2="${W - 78}" y2="${H - 92}" stroke="#262B33" stroke-width="1"/>
  <text x="78" y="${H - 48}" font-family="Instrument Serif" font-size="24"
        fill="${DIM}" letter-spacing="2">haysmahda.github.io/presiden-di-mana</text>
  <text x="${W - 78}" y="${H - 48}" text-anchor="end" font-family="Instrument Serif"
        font-size="24" fill="#6B7280" letter-spacing="2">BUKAN PELACAKAN GPS</text>
</svg>`;
}

function main() {
  let Resvg;
  try {
    ({ Resvg } = require('@resvg/resvg-js'));
  } catch (_) {
    console.error('og.js: @resvg/resvg-js is not installed — skipping image generation.');
    console.error('       Install it first:  npm install @resvg/resvg-js');
    process.exitCode = 0;   // never break a deploy over the share image
    return;
  }

  const data = JSON.parse(fs.readFileSync(LOCATIONS, 'utf8'));
  const svg = build(data);

  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { fontFiles: [FONT], loadSystemFonts: false, defaultFontFamily: 'Instrument Serif' }
  }).render().asPng();

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, png);

  const loc = (data.locations || []).find(l => l.id === data.current);
  console.log(`og.js: wrote ${OUT} (${(png.length / 1024).toFixed(0)} KB) — "${loc ? loc.place : 'no data'}"`);
}

main();
