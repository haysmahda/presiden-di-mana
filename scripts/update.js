#!/usr/bin/env node
/**
 * Presiden Di Mana Sekarang? — the updater.
 *
 * Reads Indonesian news RSS feeds, works out which places the President was
 * reported to be in, scores how confident we are, and prints what it found.
 *
 * STEP 2 BEHAVIOUR: this script only ever PRINTS. It does not touch
 * data/locations.json. Writing happens in Step 3.
 *
 * No dependencies — plain Node 18+ (uses the built-in fetch).
 *
 *   node scripts/update.js                 normal run, last 72 hours
 *   node scripts/update.js --hours=168     look back a week
 *   node scripts/update.js --verbose       also show what it rejected and why
 *   node scripts/update.js --json          machine-readable output (for Step 3)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GAZETTEER = path.join(ROOT, 'data', 'gazetteer.json');
const SOURCES   = path.join(ROOT, 'scripts', 'sources.json');
const LOCATIONS = path.join(ROOT, 'data', 'locations.json');

/* ---------------------------------------------------------------- options */

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const OPT = {
  hours:   Number(flag('hours', 72)),
  limit:   Number(flag('limit', 12)),
  json:    argv.includes('--json'),
  verbose: argv.includes('--verbose'),
  write:   argv.includes('--write'),
  timeout: Number(flag('timeout', 20)) * 1000
};

/* ------------------------------------------------------------------ pretty */

const TTY = process.stdout.isTTY && !OPT.json;
const c = (code, s) => (TTY ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const red = s => c('31', s), grey = s => c('90', s), bold = s => c('1', s);
const green = s => c('32', s), amber = s => c('33', s), cyan = s => c('36', s);

const out = [];
const say = (...a) => { if (OPT.json) out.push(a.join(' ')); else console.log(...a); };
const bar = (ch = '─', n = 68) => grey(ch.repeat(n));

/* --------------------------------------------------------- text utilities */

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', eacute: 'é'
};

function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}
function safeChar(code) {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}

function stripTags(s) {
  return String(s).replace(/<[^>]*>/g, ' ');
}

function clean(s) {
  return decodeEntities(stripTags(decodeEntities(s || '')))
    .replace(/\s+/g, ' ')
    .trim();
}

/* Lowercase, strip accents, punctuation -> space. Matching happens on this. */
function normalise(s) {
  return String(s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* "Jakarta (ANTARA) - ..." / "Jakarta - ..." datelines name the newsroom, not
   the President's location. Strip them or every article resolves to Jakarta. */
function stripDateline(s) {
  return String(s)
    .replace(/^\s*[A-Za-zÀ-ÿ .'-]{2,32}\s*\([^)]{2,40}\)\s*[-–—]+\s*/, '')
    .replace(/^\s*[A-Z][A-Za-zÀ-ÿ .'-]{1,28}\s*[-–—]+\s+/, '');
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ------------------------------------------------------------ subject test */

/* Is this article actually about the Indonesian President? Bare "presiden" is
   far too loose — it catches Presiden Trump, presiden klub, and the Wakil
   Presiden. So we drop those first, then look for a real signal. */
const NOT_SUBJECT = /\b(wakil presiden|wapres|mantan presiden|calon presiden|capres|presiden terpilih|presiden direktur|presiden klub|presiden fifa)\b/gi;
const IS_SUBJECT  = /\b(prabowo|presiden ri|presiden republik indonesia|presiden prabowo|kepala negara|presiden jokowi|presiden indonesia)\b/i;
/* Foreign heads of state get their own "Presiden X" — don't let those through
   on the strength of the word "presiden" alone. */
const FOREIGN_PRESIDENT = /\bpresiden\s+(amerika|as\b|trump|biden|putin|rusia|prancis|macron|xi|tiongkok|china|filipina|marcos|korea|turki|erdogan|brasil|lula|iran|mesir|ukraina|zelensky)/i;

function isAboutPresident(item) {
  const hay = `${item.title} ${item.summary}`;
  const stripped = hay.replace(NOT_SUBJECT, ' ');
  if (!IS_SUBJECT.test(stripped)) return false;
  // "Prabowo" by name is unambiguous; otherwise reject foreign-president items.
  if (/\bprabowo\b/i.test(stripped)) return true;
  return !FOREIGN_PRESIDENT.test(stripped);
}

/* ----------------------------------------------------------- feed fetching */

async function fetchFeed(feed, userAgent) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OPT.timeout);
  try {
    const res = await fetch(feed.url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': userAgent, accept: 'application/rss+xml, application/xml, text/xml, */*' }
    });
    if (!res.ok) return { feed, ok: false, error: `HTTP ${res.status}`, items: [] };
    const xml = await res.text();
    const items = parseFeed(xml).map(it => ({ ...it, outlet: feed.outlet, weight: feed.weight, official: feed.official }));
    return { feed, ok: true, items };
  } catch (err) {
    const msg = err.name === 'AbortError' ? `timeout after ${OPT.timeout / 1000}s` : err.message;
    return { feed, ok: false, error: msg, items: [] };
  } finally {
    clearTimeout(timer);
  }
}

/* Minimal RSS 2.0 + Atom reader. Feeds are simple and regular enough that a
   real XML parser would be a dependency we don't need. */
function parseFeed(xml) {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  return blocks.map(block => {
    const title = tag(block, 'title');
    const summary = tag(block, 'description') || tag(block, 'summary') || tag(block, 'content:encoded');
    const when = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date');
    const published = new Date(when);
    return {
      title: clean(title),
      summary: clean(stripDateline(clean(summary))).slice(0, 600),
      url: findLink(block),
      published: isNaN(published) ? null : published
    };
  }).filter(it => it.title);
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${escapeRe(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRe(name)}>`, 'i'));
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function findLink(block) {
  const plain = tag(block, 'link');
  if (plain && /^https?:\/\//i.test(plain.trim())) return plain.trim();
  const href = block.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i);
  if (href) return href[1];
  const guid = tag(block, 'guid');
  return /^https?:\/\//i.test(guid) ? guid : '';
}

/* -------------------------------------------------- location extraction */

/* Indonesian movement cues. A place right after one of these is far more
   likely to be where he actually is: "di Solo", "bertolak ke Beijing",
   "tiba di Makassar", "kunjungi Surabaya". */
const CUES = new Set([
  'di', 'ke', 'dari', 'menuju', 'tiba', 'mendarat', 'bertolak', 'berangkat',
  'kunjungi', 'mengunjungi', 'kunjungan', 'lawatan', 'sambangi', 'menyambangi',
  'singgah', 'tinjau', 'meninjau', 'resmikan', 'meresmikan', 'hadiri',
  'menghadiri', 'hadir', 'gelar', 'menggelar', 'pimpin', 'memimpin',
  'sampai', 'kembali', 'bermalam', 'menginap', 'buka', 'membuka'
]);

/* A place name straight after a role word describes a *person*, not where the
   President is: "PM Thailand", "Dubes Jepang", "Timnas Vietnam". */
const ROLES = new Set([
  'pm', 'perdana', 'menteri', 'presiden', 'wapres', 'raja', 'ratu', 'sultan',
  'pangeran', 'kaisar', 'kanselir', 'dubes', 'duta', 'besar', 'delegasi',
  'menlu', 'sekjen', 'ketua', 'utusan', 'pejabat', 'warga', 'wni', 'timnas',
  'tim', 'klub', 'pengusaha', 'investor', 'atlet', 'turis', 'wisatawan',
  'kedutaan', 'konsulat', 'produk', 'bank', 'mata', 'bahasa', 'masakan'
]);

/* A place inside one of these phrases is a *topic* of discussion, not a
   destination: "perdamaian di Myanmar", "kerja sama dengan Jepang". */
const TOPICS = new Set([
  'perdamaian', 'damai', 'konflik', 'krisis', 'situasi', 'perang', 'bencana',
  'gempa', 'banjir', 'kerjasama', 'kerja', 'sama', 'hubungan', 'kemitraan',
  'investasi', 'impor', 'ekspor', 'perdagangan', 'ekonomi', 'isu', 'soal',
  'tentang', 'terkait', 'harga', 'rute', 'penerbangan', 'maskapai', 'konsensus',
  'dukungan', 'bantuan', 'pengungsi', 'genosida', 'serangan', 'gencatan',
  'sanksi', 'tarif', 'ancaman', 'pasar', 'ekspansi', 'kasus'
]);

/* Is a foreign guest being received *here*? If so, every foreign place name in
   the article belongs to the visitor, not to the President. */
const HOSTING = new RegExp([
  '\\b(menjamu|jamu|jamuan)\\b',
  '\\b(menyambut|sambut|penyambutan)\\b',
  '\\bmenerima\\s+(kunjungan|kedatangan|lawatan|kehormatan)\\b',
  '\\bterima\\s+kunjungan\\b',
  '\\bkunjungan\\s+balasan\\b',
  '\\bkunjungan\\s+\\w+(\\s+\\w+)?\\s+ke\\s+indonesia\\b',
  '\\btiba\\s+di\\s+(indonesia|jakarta|bogor|halim)\\b'
].join('|'), 'i');

function buildMatchers(gazetteer) {
  const matchers = [];
  for (const place of gazetteer.places) {
    const entries = [
      ...[place.name, ...(place.aliases || [])].map(n => ({ n, weak: false })),
      ...(place.weak_aliases || []).map(n => ({ n, weak: true }))
    ];
    for (const { n, weak } of entries) {
      const norm = normalise(n);
      if (norm.length < 3) continue;
      matchers.push({
        place,
        label: n,
        weak,
        words: norm.split(' ').length,
        re: new RegExp(`(^|[^a-z0-9])(${escapeRe(norm)})(?![a-z0-9])`, 'g')
      });
    }
  }
  // Longer names first so "Istana Bogor" is considered before "Bogor".
  return matchers.sort((a, b) => b.words - a.words || b.re.source.length - a.re.source.length);
}

/* Per-article context that changes how we read any place name in it. */
function readContext(item) {
  const raw = `${item.title} ${item.summary}`;

  /* "Jakarta-Bangkok", "RI-Thailand" — pairs like this are routes or
     bilateral shorthand, never a statement of where he is. */
  const route = new Set();
  for (const m of raw.matchAll(/\b([A-Z][A-Za-z]{1,})\s*[-–—]\s*([A-Z][A-Za-z]{1,})\b/g)) {
    route.add(normalise(m[1]));
    route.add(normalise(m[2]));
  }

  return { hosting: HOSTING.test(raw), route };
}

/* How much a single hit is worth, by where it appeared and whether a movement
   cue preceded it. */
const PLACEMENT = {
  titleCue: 1.0,
  title:    0.75,
  bodyCue:  0.55,
  body:     0.25
};

function findPlaces(item, matchers) {
  const ctx = readContext(item);
  const fields = [
    { key: 'title', text: normalise(item.title) },
    { key: 'body',  text: normalise(item.summary) }
  ];
  const best = new Map();    // place.name -> best hit for that place
  const rejects = [];        // kept for --verbose

  for (const field of fields) {
    if (!field.text) continue;
    for (const m of matchers) {
      m.re.lastIndex = 0;
      let hit;
      while ((hit = m.re.exec(field.text)) !== null) {
        const at = hit.index + hit[1].length;
        const words = field.text.slice(Math.max(0, at - 40), at).trim().split(' ').filter(Boolean);
        const prevWord = words[words.length - 1];
        const window = words.slice(-4);
        const norm = normalise(m.label);

        const veto =
          ctx.route.has(norm)                                   ? 'bagian rute/pasangan negara'
          : ROLES.has(prevWord)                                 ? `jabatan "${prevWord}" di depannya`
          : window.some(w => TOPICS.has(w))                     ? 'disebut sebagai topik, bukan tujuan'
          : (ctx.hosting && m.place.country_code !== 'ID')      ? 'Presiden sedang menjamu tamu di dalam negeri'
          : null;

        if (veto) { rejects.push({ label: m.label, veto }); continue; }

        const hasCue = CUES.has(prevWord);
        const placement = field.key === 'title'
          ? (hasCue ? 'titleCue' : 'title')
          : (hasCue ? 'bodyCue'  : 'body');

        let strength = PLACEMENT[placement] * (1 + (m.place.specificity || 1) * 0.12);
        if (m.weak) strength *= 0.35;

        const prev = best.get(m.place.name);
        if (!prev || strength > prev.strength) {
          best.set(m.place.name, { place: m.place, placement, strength, via: m.label, weak: m.weak });
        }
      }
    }
  }

  if (!best.size) return { match: null, rejects, ctx };

  /* One article, one location. Prefer the strongest hit; break ties towards
     the more specific place (Istana Bogor beats Bogor beats Jawa Barat). */
  const match = [...best.values()].sort((a, b) =>
    b.strength - a.strength || (b.place.specificity || 1) - (a.place.specificity || 1)
  )[0];

  return { match, rejects, ctx };
}

/* ----------------------------------------------------------- confidence */

/**
 * Confidence, as described in CLAUDE.MD:
 *   - more independent outlets reporting the same place -> higher
 *   - official sources (Setkab, Antara) count for more
 *   - newer reports outrank older ones
 *
 * Each outlet contributes once, at its best hit. The total goes through a
 * saturating curve so a single source can never look certain:
 *   one major outlet  ~45   one official   ~55
 *   two outlets       ~75   three          ~90
 */
function scoreCluster(reports) {
  const perOutlet = new Map();
  for (const r of reports) {
    const value = r.weight * r.match.strength;
    if (!perOutlet.has(r.outlet) || perOutlet.get(r.outlet) < value) perOutlet.set(r.outlet, value);
  }
  const raw = [...perOutlet.values()].reduce((a, b) => a + b, 0);
  const confidence = Math.round(100 * (1 - Math.exp(-raw / 2.6)));

  /* A bare country name never establishes presence. "Prabowo dan PM Thailand"
     says nothing about him being in Thailand — so a place backed only by weak
     aliases is not reportable, however many outlets repeat it. */
  const weakOnly = reports.every(r => r.match.weak);

  return {
    confidence: Math.max(20, Math.min(98, confidence)),
    outlets: [...perOutlet.keys()],
    outlet_scores: Object.fromEntries(
      [...perOutlet].map(([outlet, v]) => [outlet, Math.round(v * 1000) / 1000])
    ),
    official: reports.some(r => r.official),
    confirmed: perOutlet.size >= 2 && !weakOnly,
    weakOnly
  };
}

/* Group reports that point at the same place. Reports more than `hours` apart
   describe different visits, so they become separate clusters. */
function cluster(reports, hours) {
  const byPlace = new Map();
  for (const r of reports) {
    const key = r.match.place.name;
    if (!byPlace.has(key)) byPlace.set(key, []);
    byPlace.get(key).push(r);
  }

  const clusters = [];
  const windowMs = hours * 3600e3;

  for (const [, group] of byPlace) {
    group.sort((a, b) => b.published - a.published);
    let current = [];
    for (const r of group) {
      if (current.length && current[current.length - 1].published - r.published > windowMs) {
        clusters.push(current);
        current = [];
      }
      current.push(r);
    }
    if (current.length) clusters.push(current);
  }

  const built = clusters.map(reports => {
    const score = scoreCluster(reports);
    const latest = reports[0];
    return {
      place: latest.match.place,
      reported_at: latest.published,
      reports,
      ...score
    };
  });

  return rollup(built, windowMs)
    .sort((a, b) => b.reported_at - a.reported_at || b.confidence - a.confidence);
}

/* Does the broad place `outer` contain the specific place `inner`? Only a
   province (or the catch-all "Jakarta" entry) swallows anything — so
   Istana Merdeka absorbs "Jakarta", but Bogor never absorbs Bandung even
   though both sit in Jawa Barat. */
function contains(outer, inner) {
  return outer.country_code === inner.country_code
    && !!outer.region && outer.region === inner.region
    && (outer.specificity || 1) < (inner.specificity || 1)
    && (outer.type === 'provinsi' || (outer.specificity || 1) === 1);
}

/* "Presiden di Semarang" and "Presiden di Jawa Tengah" on the same day are one
   visit, not two. Fold the vaguer one into the more specific one. */
function rollup(clusters, windowMs) {
  const kept = [...clusters].sort((a, b) => (b.place.specificity || 1) - (a.place.specificity || 1));
  const dropped = new Set();

  for (const specific of kept) {
    if (dropped.has(specific)) continue;
    for (const broad of kept) {
      if (broad === specific || dropped.has(broad)) continue;
      if (!contains(broad.place, specific.place)) continue;
      if (Math.abs(specific.reported_at - broad.reported_at) > windowMs) continue;

      specific.reports = specific.reports.concat(broad.reports)
        .sort((a, b) => b.published - a.published);
      specific.reported_at = specific.reports[0].published;
      Object.assign(specific, scoreCluster(specific.reports));
      specific.rolled_up = (specific.rolled_up || []).concat(broad.place.name);
      dropped.add(broad);
    }
  }

  return kept.filter(cl => !dropped.has(cl));
}

/* ----------------------------------------------------- event type guessing */

/* First pattern that matches wins, so the specific ones come first. */
const EVENTS = [
  ['pelantikan',          'Pelantikan',                 /\b(pelantikan|melantik|dilantik|mengambil sumpah)\b/i],
  ['rapat',               'Rapat Kabinet',              /\b(rapat terbatas|ratas|sidang kabinet|rapat kabinet|rapat paripurna|memimpin rapat)\b/i],
  /* Host-language first: when a foreign guest is received here the articles
     also say "kunjungan kenegaraan", but that is the guest's trip, not his. */
  ['bilateral',           'Pertemuan Bilateral',        /\b(menjamu|jamuan|jamu|menyambut|menerima kunjungan|pertemuan bilateral|bertemu dengan|kunjungan kehormatan)\b/i],
  ['kunjungan_kenegaraan','Kunjungan Kenegaraan',       /\b(kunjungan kenegaraan|lawatan|kunjungan resmi|state visit)\b/i],
  ['forum',               'Forum Internasional',        /\b(ktt|konferensi tingkat tinggi|summit|forum internasional|sidang umum pbb|g20|asean)\b/i],
  ['peresmian',           'Peresmian',                  /\b(meresmikan|resmikan|peresmian|groundbreaking|pencanangan|revitalisasi)\b/i],
  ['upacara',             'Upacara Kenegaraan',         /\b(upacara|hut ke|peringatan hari|apel|detik-detik proklamasi)\b/i],
  ['militer',             'Kegiatan Militer',           /\b(latihan (gabungan|militer|perang)|defile|alutsista|panglima tni|prajurit)\b/i],
  ['perjalanan',          'Keberangkatan / Kepulangan', /\b(bertolak|lepas landas|tiba di tanah air|mendarat|kembali ke tanah air|tinggalkan)\b/i],
  ['kunjungan_kerja',     'Kunjungan Kerja',            /\b(kunjungan kerja|kunker|meninjau|tinjau|blusukan|menyerahkan bantuan)\b/i],
  ['pidato',              'Pidato',                     /\b(pidato|sambutan|orasi|menyampaikan keterangan)\b/i]
];

function classifyEvent(reports) {
  const hay = reports.map(r => `${r.title} ${r.summary}`).join(' ');
  for (const [type, label, re] of EVENTS) {
    if (re.test(hay)) return { event_type: type, event_label_id: label };
  }
  return { event_type: 'kenegaraan', event_label_id: 'Kegiatan Kenegaraan' };
}

/* ---------------------------------------------------------- writing to disk */

const MAX_SOURCES = 8;    // per location — keeps locations.json small
const MAX_ENTRIES = 500;  // history cap
const MERGE_WINDOW_MS = 36 * 3600e3;

function jakartaParts(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date).map(x => [x.type, x.value]));
  return p;
}

function makeId(place, date) {
  const p = jakartaParts(date);
  const slug = normalise(place.name).replace(/ /g, '-').slice(0, 24);
  return `loc-${p.year}${p.month}${p.day}-${p.hour}${p.minute}-${slug}`;
}

/* Turn a scored cluster into the shape the website reads. `outlet_scores`
   is kept so a later run can merge into this entry without losing the
   evidence that produced the original confidence. */
function toEntry(cl) {
  const sources = cl.reports
    .filter(r => r.url)
    .sort((a, b) => b.published - a.published)
    .slice(0, MAX_SOURCES)
    .map(r => ({
      outlet: r.outlet,
      title: r.title,
      url: r.url,
      published_at: r.published.toISOString()
    }));

  return {
    id: makeId(cl.place, cl.reported_at),
    place: cl.place.name,
    city: cl.place.city,
    region: cl.place.region,
    country: cl.place.country,
    country_code: cl.place.country_code,
    lat: cl.place.lat,
    lng: cl.place.lng,
    ...classifyEvent(cl.reports),
    reported_at: cl.reported_at.toISOString(),
    confidence: cl.confidence,
    outlet_scores: cl.outlet_scores,
    sources
  };
}

/* Same place, same visit? Then it's the entry we already have — top it up
   rather than adding a second pin to the map. */
function sameVisit(entry, cl) {
  return entry.place === cl.place.name
    && Math.abs(new Date(entry.reported_at) - cl.reported_at) <= MERGE_WINDOW_MS;
}

function mergeEntry(existing, incoming) {
  const bySource = new Map();
  for (const s of [...(incoming.sources || []), ...(existing.sources || [])]) {
    if (s.url && !bySource.has(s.url)) bySource.set(s.url, s);
  }
  const sources = [...bySource.values()]
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
    .slice(0, MAX_SOURCES);

  /* Outlets keep their best-ever contribution, so confidence can rise as more
     outlets report the same visit, but never falls just because a later run
     saw fewer articles. */
  const scores = { ...(existing.outlet_scores || {}) };
  for (const [outlet, value] of Object.entries(incoming.outlet_scores || {})) {
    scores[outlet] = Math.max(scores[outlet] ?? 0, value);
  }
  const raw = Object.values(scores).reduce((a, b) => a + b, 0);

  const newer = new Date(incoming.reported_at) > new Date(existing.reported_at);

  return {
    ...existing,
    ...(newer ? { reported_at: incoming.reported_at, event_type: incoming.event_type, event_label_id: incoming.event_label_id } : {}),
    confidence: Math.max(20, Math.min(98, Math.round(100 * (1 - Math.exp(-raw / 2.6))))),
    outlet_scores: scores,
    sources
  };
}

function writeLocations(clusters, file) {
  const prior = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};

  /* The shipped sample entries are fabricated. The moment real data arrives
     they go, rather than sitting alongside it. */
  const startedFromSample = prior.sample_data === true;
  const history = startedFromSample ? [] : (prior.locations || []);

  const added = [], updated = [];
  for (const cl of clusters) {
    const incoming = toEntry(cl);
    const hit = history.find(e => sameVisit(e, cl));
    if (hit) {
      Object.assign(hit, mergeEntry(hit, incoming));
      updated.push(hit);
    } else {
      history.push(incoming);
      added.push(incoming);
    }
  }

  history.sort((a, b) => new Date(b.reported_at) - new Date(a.reported_at));
  const locations = history.slice(0, MAX_ENTRIES);

  const payload = {
    schema_version: 1,
    sample_data: false,
    generated_at: new Date().toISOString(),
    current: locations.length ? locations[0].id : null,
    locations
  };

  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
  return { added, updated, total: locations.length, purgedSample: startedFromSample };
}

/* Nothing new to publish, but we still checked — record that so the site can
   say when it last looked. */
function touchTimestamp(file) {
  if (!fs.existsSync(file)) return false;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.sample_data === true) return false;   // don't stamp fabricated data
  data.generated_at = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  return true;
}

/* ------------------------------------------------------------------- main */

async function main() {
  const gazetteer = JSON.parse(fs.readFileSync(GAZETTEER, 'utf8'));
  const config    = JSON.parse(fs.readFileSync(SOURCES, 'utf8'));
  const matchers  = buildMatchers(gazetteer);
  const since     = new Date(Date.now() - OPT.hours * 3600e3);

  say('');
  say(bold('  Presiden Di Mana Sekarang? — pemindaian berita'));
  say(grey(`  ${gazetteer.places.length} tempat dikenal · ${matchers.length} pola nama · jendela ${OPT.hours} jam`));
  say('');

  /* -- 1. fetch ---------------------------------------------------------- */
  say(bold('  1. Membaca kanal berita'));
  say('  ' + bar());
  const results = await Promise.all(config.feeds.map(f => fetchFeed(f, config.user_agent)));

  let all = [];
  for (const r of results) {
    const status = r.ok ? green('ok   ') : red('gagal');
    const detail = r.ok ? `${String(r.items.length).padStart(3)} artikel` : red(r.error);
    say(`  ${status} ${r.feed.name.padEnd(28)} ${detail}`);
    all = all.concat(r.items);
  }
  const liveFeeds = results.filter(r => r.ok).length;
  say('');
  say(grey(`  ${all.length} artikel dari ${liveFeeds}/${config.feeds.length} kanal`));
  say('');

  if (!all.length) {
    say(red('  Tidak ada artikel sama sekali. Cek koneksi internet.'));
    return finish(1);
  }

  /* -- 2. filter --------------------------------------------------------- */
  say(bold('  2. Menyaring artikel tentang Presiden'));
  say('  ' + bar());

  const fresh = all.filter(it => it.published && it.published >= since);
  const about = fresh.filter(isAboutPresident);

  say(`  ${String(all.length).padStart(4)} artikel diambil`);
  say(`  ${String(fresh.length).padStart(4)} terbit dalam ${OPT.hours} jam terakhir`);
  say(`  ${String(about.length).padStart(4)} menyebut Presiden / Prabowo / Kepala Negara`);
  say('');

  /* -- 3. locate --------------------------------------------------------- */
  say(bold('  3. Mencari nama tempat'));
  say('  ' + bar());

  const located = [];
  const missed = [];
  let vetoed = 0;
  for (const item of about) {
    const { match, rejects } = findPlaces(item, matchers);
    vetoed += rejects.length;
    if (match) located.push({ ...item, match });
    else missed.push({ ...item, rejects });
  }

  say(`  ${String(located.length).padStart(4)} artikel menyebut tempat yang dikenal`);
  say(`  ${String(missed.length).padStart(4)} tanpa tempat yang cocok`);
  say(`  ${String(vetoed).padStart(4)} sebutan tempat ditolak (nama negara tamu, topik, rute)`);
  say('');

  if (OPT.verbose && missed.length) {
    say(grey('  Tidak cocok — kandidat untuk ditambahkan ke gazetteer:'));
    for (const m of missed.slice(0, 15)) {
      say(grey(`    · ${m.title.slice(0, 84)}`));
      for (const r of m.rejects.slice(0, 3)) say(grey(`        ✗ "${r.label}" — ${r.veto}`));
    }
    say('');
  }

  if (!located.length) {
    say(amber('  Tidak ada lokasi yang bisa disimpulkan dari jendela waktu ini.'));
    say(grey('  Coba perlebar: node scripts/update.js --hours=168'));
    return nothingToPublish();
  }

  /* -- 4. score ---------------------------------------------------------- */
  const all_clusters = cluster(located, 36);
  const clusters = all_clusters.filter(cl => !cl.weakOnly);
  const discarded = all_clusters.filter(cl => cl.weakOnly);

  if (!clusters.length) {
    say(amber('  Semua kandidat hanya berdasar nama negara — tidak cukup kuat.'));
    return nothingToPublish();
  }

  const best = [...clusters].sort((a, b) =>
    b.confidence - a.confidence || b.reported_at - a.reported_at)[0];
  const current = clusters.find(cl => cl.confirmed) || best;

  say(bold('  4. Hasil — lokasi yang terdeteksi'));
  say('  ' + bar());
  say('');

  for (const cl of clusters.slice(0, OPT.limit)) {
    const isCurrent = cl === current;
    const wilayah = cl.place.country_code === 'ID'
      ? [cl.place.city, cl.place.region].filter(Boolean).join(', ')
      : [cl.place.city, cl.place.country].filter(Boolean).join(', ');

    const head = isCurrent ? red('▶ ' + bold(cl.place.name)) : '  ' + bold(cl.place.name);
    const badge = cl.confirmed ? green('terkonfirmasi') : amber('sumber tunggal');

    say(`  ${head}`);
    say(`    ${grey(wilayah)}  ${grey('·')}  ${cyan(cl.confidence + '%')}  ${grey('·')}  ${badge}`);
    say(`    ${grey(cl.reported_at.toISOString().replace('T', ' ').slice(0, 16) + ' UTC')}  ${grey('·')}  ${grey(cl.outlets.join(', '))}`);
    for (const r of cl.reports.slice(0, 3)) {
      say(`      ${grey('·')} ${grey('[' + r.outlet + ']')} ${r.title.slice(0, 76)}`);
      if (OPT.verbose) say(grey(`        cocok "${r.match.via}" (${r.match.placement}) ${r.url}`));
    }
    if (cl.reports.length > 3) say(grey(`      … dan ${cl.reports.length - 3} artikel lain`));
    say('');
  }

  if (discarded.length) {
    say(grey(`  Diabaikan (hanya disebut lewat nama negara, bukan tujuan): ${discarded.map(d => d.place.name).join(', ')}`));
    say('');
  }

  /* -- 5. verdict -------------------------------------------------------- */
  say(bold('  5. Kesimpulan'));
  say('  ' + bar());
  const wilayah = current.place.country_code === 'ID'
    ? [current.place.city, current.place.region].filter(Boolean).join(', ')
    : [current.place.city, current.place.country].filter(Boolean).join(', ');

  say('');
  say(`  Presiden kemungkinan berada di  ${red(bold(current.place.name))}`);
  say(`  ${grey(wilayah)}`);
  say(`  Keyakinan ${cyan(current.confidence + '%')} dari ${current.outlets.length} media: ${grey(current.outlets.join(', '))}`);
  if (!current.confirmed) {
    say('');
    say(amber('  Peringatan: baru satu media. Belum memenuhi syarat tampil di situs.'));
  }
  say('');

  /* -- 6. publish -------------------------------------------------------- */
  say(bold('  6. Menyimpan ke situs'));
  say('  ' + bar());

  /* CLAUDE.MD rule: nothing reaches the website until at least two
     independent outlets agree on it. */
  const publishable = clusters.filter(cl => cl.confirmed);
  const held = clusters.filter(cl => !cl.confirmed);

  if (!OPT.write) {
    say(grey('  Mode baca-saja. Tidak ada file yang diubah.'));
    say(grey(`  ${publishable.length} lokasi siap terbit, ${held.length} ditahan (sumber tunggal).`));
    say(grey('  Untuk benar-benar menyimpan:  node scripts/update.js --write'));
  } else if (!publishable.length) {
    const stamped = touchTimestamp(LOCATIONS);
    say(amber('  Tidak ada lokasi yang dikonfirmasi 2+ media. Tidak ada yang diterbitkan.'));
    say(grey(stamped
      ? '  Waktu pemeriksaan diperbarui agar situs tahu kita sudah mengecek.'
      : '  data/locations.json dibiarkan apa adanya.'));
  } else {
    const res = writeLocations(publishable, LOCATIONS);
    if (res.purgedSample) say(amber('  Data contoh dihapus, digantikan pemberitaan asli.'));
    for (const e of res.added)   say(`  ${green('baru   ')} ${e.place} ${grey('· ' + e.confidence + '% · ' + e.sources.length + ' sumber')}`);
    for (const e of res.updated) say(`  ${cyan('diperbarui')} ${e.place} ${grey('· ' + e.confidence + '% · ' + e.sources.length + ' sumber')}`);
    say('');
    say(`  ${res.total} lokasi tersimpan di ${grey('data/locations.json')}`);
    if (held.length) {
      say(grey(`  Ditahan (baru satu media): ${held.map(h => h.place.name).join(', ')}`));
    }
    say(grey('  Muat ulang situs untuk melihat hasilnya.'));
  }
  say('');

  return finish(0, { current, clusters });
}

/* The feeds were read fine, there was just nothing worth publishing. Record
   that we looked, so the site can still say when it last checked. */
function nothingToPublish() {
  if (OPT.write && touchTimestamp(LOCATIONS)) {
    say('');
    say(grey('  Lokasi lama dibiarkan. Waktu pemeriksaan diperbarui.'));
  }
  say('');
  return finish(0);
}

function finish(code, payload) {
  if (OPT.json && payload) {
    process.stdout.write(JSON.stringify({
      generated_at: new Date().toISOString(),
      current: serialise(payload.current),
      clusters: payload.clusters.map(serialise)
    }, null, 2) + '\n');
  }
  process.exitCode = code;
}

function serialise(cl) {
  if (!cl) return null;
  return {
    place: cl.place.name,
    city: cl.place.city,
    region: cl.place.region,
    country: cl.place.country,
    country_code: cl.place.country_code,
    lat: cl.place.lat,
    lng: cl.place.lng,
    reported_at: cl.reported_at.toISOString(),
    confidence: cl.confidence,
    confirmed: cl.confirmed,
    outlets: cl.outlets,
    sources: cl.reports.map(r => ({
      outlet: r.outlet, title: r.title, url: r.url,
      published_at: r.published ? r.published.toISOString() : null
    }))
  };
}

main().catch(err => {
  console.error(red('\n  Script berhenti karena error:\n'), err);
  process.exitCode = 1;
});
