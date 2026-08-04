/* Shared helpers for both pages. Plain browser JS, no build step. */

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
               'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/* Escape anything that came from the JSON feed before it touches innerHTML.
   Real news headlines land here in Step 3, so never skip this. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* Only allow links we'd actually want to render as a source button. */
function safeUrl(url) {
  const s = String(url ?? '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

function waktuRelatif(iso) {
  const then = new Date(iso);
  if (isNaN(then)) return '—';
  const detik = Math.floor((Date.now() - then.getTime()) / 1000);

  if (detik < 60)      return 'baru saja';
  const menit = Math.floor(detik / 60);
  if (menit < 60)      return `${menit} menit yang lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24)        return `${jam} jam yang lalu`;
  const hari = Math.floor(jam / 24);
  if (hari === 1)      return 'kemarin';
  if (hari < 7)        return `${hari} hari yang lalu`;
  if (hari < 31)       return `${Math.floor(hari / 7)} minggu yang lalu`;
  if (hari < 365)      return `${Math.floor(hari / 30)} bulan yang lalu`;
  return `${Math.floor(hari / 365)} tahun yang lalu`;
}

/* "4 Agustus 2026, 08.15 WIB" — always shown in Jakarta time. */
function tanggalPanjang(iso, withTime = true) {
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta', day: 'numeric', month: 'numeric',
      year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d).map(x => [x.type, x.value])
  );
  const tanggal = `${Number(p.day)} ${BULAN[Number(p.month) - 1]} ${p.year}`;
  return withTime ? `${tanggal}, ${p.hour}.${p.minute} WIB` : tanggal;
}

function tahunJakarta(iso) {
  const d = new Date(iso);
  return isNaN(d) ? null
    : Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', year: 'numeric' }).format(d));
}

/* Newest first. */
function urutBaru(locations) {
  return [...locations].sort((a, b) => new Date(b.reported_at) - new Date(a.reported_at));
}

function labelWilayah(loc) {
  return loc.country_code === 'ID'
    ? [loc.city, loc.region].filter(Boolean).join(', ')
    : [loc.city, loc.country].filter(Boolean).join(', ');
}

/* Source list rendered as full-width labelled buttons — outlet + headline,
   never a bare icon. */
function sourceButtons(sources) {
  const list = Array.isArray(sources) ? sources : [];
  if (!list.length) return '';

  return list.map(s => {
    const href = safeUrl(s.url);
    const inner = `
      <svg class="btn__i" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h11a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2V5Z"/>
        <path d="M17 9h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2M7 9h6M7 13h6M7 16h4"/>
      </svg>
      <span class="btn__body">
        <span class="btn__outlet">${esc(s.outlet)}</span>
        <span class="btn__title">${esc(s.title)}</span>
      </span>`;

    return href
      ? `<a class="btn btn--source" href="${esc(href)}" target="_blank" rel="noopener nofollow">${inner}</a>`
      : `<span class="btn btn--source" aria-disabled="true" title="Tautan contoh — belum aktif">${inner}</span>`;
  }).join('');
}

/* 8 segments so a 92 and a 76 don't both read as "full". */
const CONF_SEGMEN = 8;
function segmenKeyakinan(score) {
  const on = Math.max(1, Math.min(CONF_SEGMEN, Math.round(Number(score) / (100 / CONF_SEGMEN))));
  return Array.from({ length: CONF_SEGMEN },
    (_, i) => `<span class="conf__seg${i < on ? ' is-on' : ''}"></span>`).join('');
}

async function muatData() {
  const res = await fetch('data/locations.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Gagal memuat data (${res.status})`);
  return res.json();
}
