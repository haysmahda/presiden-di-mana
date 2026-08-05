/* Bilingual layer. Indonesian is the default; English is a toggle.
   Loaded before util.js and the page scripts, which read LANG from here. */

const LANG_KEY = 'pdms-lang';

let LANG = (() => {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'id' || saved === 'en') return saved;
  } catch (_) { /* private mode — fall through */ }
  // Only default to English for browsers that clearly aren't Indonesian.
  const nav = (navigator.language || 'id').toLowerCase();
  return nav.startsWith('id') ? 'id' : (nav.startsWith('en') ? 'en' : 'id');
})();

const STRINGS = {
  /* --- chrome ------------------------------------------------------- */
  'nav.now':       { id: 'Sekarang',   en: 'Now' },
  'nav.history':   { id: 'Riwayat',    en: 'History' },
  'nav.how':       { id: 'Cara Kerja', en: 'How It Works' },
  'nav.aria':      { id: 'Navigasi utama', en: 'Main navigation' },
  'lang.switch':   { id: 'Ganti bahasa', en: 'Change language' },

  'rail.live':     { id: 'Pemantauan aktif', en: 'Monitoring active' },
  'rail.sources':  { id: 'Sumber',           en: 'Sources' },
  'rail.channels': { id: 'kanal berita',     en: 'news feeds' },
  'rail.checked':  { id: 'Pemeriksaan terakhir', en: 'Last checked' },

  /* --- hero --------------------------------------------------------- */
  'hero.kicker':   { id: 'Pertanyaannya sederhana', en: 'A simple question' },
  'hero.q':        { id: 'Presiden di&nbsp;mana <em>sekarang?</em>',
                     en: 'Where is the <em>President now?</em>' },
  'hero.label':    { id: 'Menurut pemberitaan terakhir, beliau berada di',
                     en: 'According to the latest reporting, he was at' },

  /* --- current card ------------------------------------------------- */
  'card.eyebrow':  { id: 'Lokasi Saat Ini', en: 'Current Location' },
  'card.event':    { id: 'Jenis kegiatan',  en: 'Type of activity' },
  'card.date':     { id: 'Tanggal laporan', en: 'Date reported' },
  'card.coords':   { id: 'Koordinat',       en: 'Coordinates' },
  'card.conf':     { id: 'Skor Keyakinan',  en: 'Confidence Score' },
  'card.note':     { id: 'Berdasarkan pemberitaan publik. <strong>Bukan pelacakan GPS</strong> dan bukan posisi real-time. Bisa saja tertunda atau keliru.',
                     en: 'Based on public news reports. <strong>Not GPS tracking</strong> and not a real-time position. It may be delayed or wrong.' },
  'card.more':     { id: 'laporan lain',    en: 'more reports' },

  /* --- feed --------------------------------------------------------- */
  'feed.title':    { id: 'Pergerakan Terakhir', en: 'Recent Movements' },
  'feed.sub':      { id: 'Setiap catatan bersumber dari pemberitaan media. Klik untuk membaca artikel aslinya.',
                     en: 'Every record comes from news reporting. Click through to read the original article.' },
  'feed.loading':  { id: 'Memuat pergerakan…', en: 'Loading movements…' },
  'feed.empty':    { id: 'Belum ada pergerakan yang tercatat.', en: 'No movements recorded yet.' },
  'feed.all':      { id: 'Lihat seluruh riwayat lokasi', en: 'See the full location history' },
  'feed.latest':   { id: 'Terkini',      en: 'Latest' },
  'feed.abroad':   { id: 'Luar Negeri',  en: 'Abroad' },
  'feed.conf':     { id: 'Keyakinan',    en: 'Confidence' },

  /* --- how it works -------------------------------------------------- */
  'how.title':     { id: 'Cara Kerjanya', en: 'How It Works' },
  'how.sub':       { id: 'Tidak ada perangkat pelacak, tidak ada orang dalam. Hanya membaca berita yang sudah terbit — secara otomatis.',
                     en: 'No tracking device, no inside source. It just reads published news — automatically.' },
  'how.1.t':       { id: 'Membaca kanal berita', en: 'Read the news feeds' },
  'how.1.b':       { id: 'Setiap dua jam, robot kami membaca umpan RSS dari situs resmi kepresidenan dan kantor berita besar Indonesia.',
                     en: 'Every two hours a robot reads RSS feeds from official government sites and major Indonesian news agencies.' },
  'how.2.t':       { id: 'Mencari nama tempat', en: 'Look for place names' },
  'how.2.b':       { id: 'Judul berita dicocokkan dengan daftar tempat — 38 provinsi, kota besar, istana kepresidenan, bandara, hingga ibu kota negara lain.',
                     en: 'Headlines are matched against a list of places — all 38 provinces, major cities, presidential palaces, airports and foreign capitals.' },
  'how.3.t':       { id: 'Meminta konfirmasi', en: 'Require confirmation' },
  'how.3.b':       { id: 'Satu berita saja belum cukup. Lokasi baru ditampilkan bila beberapa media independen melaporkan hal yang sama.',
                     en: 'One article is not enough. A location only appears once several independent outlets report the same thing.' },
  'how.4.t':       { id: 'Memberi skor', en: 'Score it' },
  'how.4.b':       { id: 'Sumber resmi dan kantor berita negara berbobot lebih tinggi. Berita terbaru mengalahkan yang lama. Hasilnya: skor keyakinan.',
                     en: 'Official and state news sources carry more weight. Newer reports outrank older ones. The result is a confidence score.' },

  /* --- history page --------------------------------------------------- */
  'hist.kicker':   { id: 'Arsip pergerakan', en: 'Movement archive' },
  'hist.q':        { id: 'Ke mana saja <em>selama ini?</em>',
                     en: 'Where has he <em>been so far?</em>' },
  'hist.sub':      { id: 'Seluruh lokasi yang pernah tercatat dari pemberitaan publik. Saring berdasarkan tahun, wilayah, atau jenis kegiatan.',
                     en: 'Every location ever recorded from public reporting. Filter by year, region or type of activity.' },
  'hist.loading':  { id: 'Memuat riwayat…', en: 'Loading history…' },

  'f.year':        { id: 'Tahun',   en: 'Year' },
  'f.allyears':    { id: 'Semua tahun', en: 'All years' },
  'f.region':      { id: 'Wilayah', en: 'Region' },
  'f.allregions':  { id: 'Semua wilayah', en: 'All regions' },
  'f.type':        { id: 'Jenis kegiatan', en: 'Type of activity' },
  'f.alltypes':    { id: 'Semua kegiatan', en: 'All activities' },
  'f.search':      { id: 'Cari tempat', en: 'Search place' },
  'f.placeholder': { id: 'mis. Bogor, Nusantara…', en: 'e.g. Bogor, Nusantara…' },
  'f.count':       { id: 'catatan ditampilkan', en: 'records shown' },
  'f.reset':       { id: 'Hapus semua filter', en: 'Clear all filters' },
  'f.none':        { id: 'Tidak ada catatan yang cocok dengan filter ini.', en: 'No records match these filters.' },

  'st.records':    { id: 'Catatan lokasi',   en: 'Location records' },
  'st.provinces':  { id: 'Provinsi dikunjungi', en: 'Provinces visited' },
  'st.jakarta':    { id: 'Hari tercatat di Jakarta', en: 'Days recorded in Jakarta' },
  'st.countries':  { id: 'Negara dikunjungi', en: 'Countries visited' },
  'st.top':        { id: 'Wilayah paling sering', en: 'Most frequent regions' },
  'st.split':      { id: 'Jakarta vs. bepergian', en: 'Jakarta vs. travelling' },
  'st.injkt':      { id: 'Di Jakarta',  en: 'In Jakarta' },
  'st.travel':     { id: 'Bepergian',   en: 'Travelling' },
  'st.abroad':     { id: 'Luar negeri', en: 'Abroad' },
  'st.days':       { id: 'hari',        en: 'days' },
  'st.visits':     { id: 'kunjungan',   en: 'visits' },
  'st.nodata':     { id: 'Belum cukup data untuk statistik.', en: 'Not enough data for statistics yet.' },

  /* --- shared -------------------------------------------------------- */
  'dis.tag':       { id: 'Penting / Important', en: 'Important / Penting' },
  'err.load':      { id: 'Gagal memuat data lokasi. Coba muat ulang halaman.',
                     en: 'Could not load location data. Try reloading the page.' },
  'err.none':      { id: 'Belum ada lokasi yang tercatat.', en: 'No locations recorded yet.' },
  'err.na':        { id: 'Data tidak tersedia', en: 'Data unavailable' },
  'loading':       { id: 'Memuat…', en: 'Loading…' },
  'foot.note':     { id: 'Proyek transparansi warga. Data diperbarui otomatis setiap 2 jam.',
                     en: 'A citizen transparency project. Data updates automatically every 2 hours.' },
  'foot.updated':  { id: 'Terakhir diperbarui', en: 'Last updated' },
  'foot.map':      { id: 'Peta', en: 'Map' }
};

/* Event labels come from the data as an Indonesian string plus a stable
   event_type slug — the slug is what we translate. */
const EVENT_LABELS = {
  pelantikan:            { id: 'Pelantikan',                 en: 'Swearing-in' },
  rapat:                 { id: 'Rapat Kabinet',              en: 'Cabinet Meeting' },
  bilateral:             { id: 'Pertemuan Bilateral',        en: 'Bilateral Meeting' },
  kunjungan_kenegaraan:  { id: 'Kunjungan Kenegaraan',       en: 'State Visit' },
  forum:                 { id: 'Forum Internasional',        en: 'International Forum' },
  peresmian:             { id: 'Peresmian',                  en: 'Inauguration of Works' },
  upacara:               { id: 'Upacara Kenegaraan',         en: 'State Ceremony' },
  militer:               { id: 'Kegiatan Militer',           en: 'Military Activity' },
  perjalanan:            { id: 'Keberangkatan / Kepulangan', en: 'Departure / Return' },
  kunjungan_kerja:       { id: 'Kunjungan Kerja',            en: 'Working Visit' },
  pidato:                { id: 'Pidato',                     en: 'Speech' },
  kenegaraan:            { id: 'Kegiatan Kenegaraan',        en: 'State Activity' }
};

function t(key) {
  const entry = STRINGS[key];
  if (!entry) return key;              // missing key shows itself — easy to spot
  return entry[LANG] ?? entry.id;
}

function eventLabel(loc) {
  const known = EVENT_LABELS[loc.event_type];
  return known ? (known[LANG] ?? known.id) : (loc.event_label_id || t('loading'));
}

/* Walk the page and fill in everything tagged with data-i18n. */
function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.innerHTML = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach(el => {
    // format: "placeholder:f.placeholder, aria-label:nav.aria"
    el.dataset.i18nAttr.split(',').forEach(pair => {
      const [attr, key] = pair.split(':').map(s => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    });
  });
  document.documentElement.lang = LANG;
}

function setLang(next) {
  if (next !== 'id' && next !== 'en') return;
  LANG = next;
  try { localStorage.setItem(LANG_KEY, next); } catch (_) { /* ignore */ }
  applyI18n();
  document.querySelectorAll('.langtoggle__opt').forEach(b => {
    const on = b.dataset.lang === LANG;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  // Page scripts re-render their dynamic content in response to this.
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: LANG } }));
}

function initLangToggle() {
  document.querySelectorAll('.langtoggle__opt').forEach(b => {
    b.addEventListener('click', () => setLang(b.dataset.lang));
  });
  setLang(LANG);
}
