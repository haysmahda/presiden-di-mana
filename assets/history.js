/* Riwayat page: headline stats, breakdown panels, and a filterable archive. */

const $ = id => document.getElementById(id);

let SEMUA = [];
let DATA = null;

/* --------------------------------------------------------------- helpers */

/* Distinct calendar days (Jakarta time) covered by a set of records. */
function hariUnik(list) {
  return new Set(list.map(l =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(l.reported_at))
  )).size;
}

const diJakarta = l => l.country_code === 'ID' && /jakarta/i.test(l.region || '');
const diLuar    = l => l.country_code !== 'ID';
const wilayahOf = l => (l.country_code === 'ID' ? l.region : l.country) || '—';

/* ----------------------------------------------------------- top figures */

function renderStats(list) {
  const provinsi   = new Set(list.filter(l => l.country_code === 'ID' && l.region).map(l => l.region));
  const luarNegeri = new Set(list.filter(diLuar).map(l => l.country));

  const kartu = [
    [list.length,                          t('st.records')],
    [provinsi.size,                        t('st.provinces')],
    [hariUnik(list.filter(diJakarta)),     t('st.jakarta')],
    [luarNegeri.size,                      t('st.countries')]
  ];

  $('stats').innerHTML = kartu.map(([n, k]) => `
    <div class="stat">
      <span class="stat__n"><em>${esc(n)}</em></span>
      <span class="stat__k">${esc(k)}</span>
    </div>`).join('');
}

/* ------------------------------------------------------ breakdown panels */

function renderPanels(list) {
  const panels = $('panels');

  if (list.length < 2) {
    panels.innerHTML = `<div class="panel"><p class="conf__note">${esc(t('st.nodata'))}</p></div>`;
    return;
  }

  panels.innerHTML = panelWilayah(list) + panelSplit(list);
}

/* Most-visited regions, as a ranked bar list. */
function panelWilayah(list) {
  const tally = new Map();
  for (const l of list) tally.set(wilayahOf(l), (tally.get(wilayahOf(l)) || 0) + 1);

  const rows = [...tally].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = rows[0][1];

  return `
    <div class="panel">
      <h3 class="panel__title">${esc(t('st.top'))}</h3>
      <ul class="barlist">
        ${rows.map(([nama, n], i) => `
          <li class="barlist__row">
            <div class="barlist__top">
              <span class="barlist__name">${esc(nama)}</span>
              <span class="barlist__n">${n} ${esc(t('st.visits'))}</span>
            </div>
            <div class="barlist__track">
              <div class="barlist__fill"
                   style="width:${Math.round((n / max) * 100)}%;animation-delay:${i * 70}ms"></div>
            </div>
          </li>`).join('')}
      </ul>
    </div>`;
}

/* Days in Jakarta vs elsewhere in Indonesia vs abroad. Counted in distinct
   days rather than records, so a busy news day doesn't skew it. */
function panelSplit(list) {
  const jkt    = hariUnik(list.filter(diJakarta));
  const abroad = hariUnik(list.filter(diLuar));
  const travel = hariUnik(list.filter(l => !diJakarta(l) && !diLuar(l)));
  const total  = jkt + travel + abroad;

  if (!total) return '';

  const pct = n => (n / total) * 100;
  const seg = (n, cls, i) => n === 0 ? '' : `
    <div class="split__seg split__seg--${cls}"
         style="width:${pct(n)}%;animation-delay:${i * 90}ms">${pct(n) > 11 ? n : ''}</div>`;

  const key = (n, cls, label) => n === 0 ? '' : `
    <div class="split__item">
      <span class="split__dot split__dot--${cls}"></span>
      <span>${esc(label)}</span>
      <span class="split__n">${n} ${esc(t('st.days'))} · ${Math.round(pct(n))}%</span>
    </div>`;

  return `
    <div class="panel">
      <h3 class="panel__title">${esc(t('st.split'))}</h3>
      <div class="split">
        <div class="split__bar">
          ${seg(jkt, 'jkt', 0)}${seg(travel, 'travel', 1)}${seg(abroad, 'abroad', 2)}
        </div>
        <div class="split__key">
          ${key(jkt, 'jkt', t('st.injkt'))}
          ${key(travel, 'travel', t('st.travel'))}
          ${key(abroad, 'abroad', t('st.abroad'))}
        </div>
      </div>
    </div>`;
}

/* ---------------------------------------------------------------- filters */

/* Rebuilt on language change, preserving whatever was selected. */
function bangunFilter(list) {
  const keep = {
    tahun: $('fTahun').value, wilayah: $('fWilayah').value, jenis: $('fJenis').value
  };

  const tahun   = [...new Set(list.map(l => tahunJakarta(l.reported_at)).filter(Boolean))].sort((a, b) => b - a);
  const wilayah = [...new Set(list.map(wilayahOf))].sort();
  const jenis   = [...new Set(list.map(l => l.event_type).filter(Boolean))]
    .map(type => [type, eventLabel({ event_type: type })])
    .sort((a, b) => a[1].localeCompare(b[1]));

  const fill = (el, semua, opsi, chosen) => {
    el.innerHTML = `<option value="">${esc(semua)}</option>` +
      opsi.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join('');
    el.value = chosen;
  };

  fill($('fTahun'),   t('f.allyears'),   tahun.map(y => [y, y]),         keep.tahun);
  fill($('fWilayah'), t('f.allregions'), wilayah.map(w => [w, w]),       keep.wilayah);
  fill($('fJenis'),   t('f.alltypes'),   jenis,                          keep.jenis);
}

function saring() {
  const tahun   = $('fTahun').value;
  const wilayah = $('fWilayah').value;
  const jenis   = $('fJenis').value;
  const cari    = $('fCari').value.trim().toLowerCase();

  return SEMUA.filter(l => {
    if (tahun && String(tahunJakarta(l.reported_at)) !== tahun) return false;
    if (wilayah && wilayahOf(l) !== wilayah) return false;
    if (jenis && l.event_type !== jenis) return false;
    if (cari) {
      const hay = [l.place, l.city, l.region, l.country].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(cari)) return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------------ list */

function renderList(list) {
  const feed = $('feed');
  $('hitung').textContent = list.length;

  if (!list.length) {
    feed.innerHTML = `<li class="empty">${esc(t('f.none'))}</li>`;
    return;
  }

  feed.innerHTML = list.map(loc => `
    <li class="entry">
      <div class="entry__top">
        <span class="entry__ago">${esc(tanggalPanjang(loc.reported_at, false))}</span>
        <span class="chip">${esc(eventLabel(loc))}</span>
        ${diLuar(loc) ? `<span class="chip chip--luar">${esc(t('feed.abroad'))}</span>` : ''}
      </div>
      <h3 class="entry__place">${esc(loc.place)}</h3>
      <p class="entry__region">${esc(labelWilayah(loc))} — ${esc(waktuRelatif(loc.reported_at))}</p>
      <p class="entry__conf">${esc(t('feed.conf')).toUpperCase()} <b>${esc(loc.confidence)}%</b></p>
      <div class="entry__sources">${sourceButtons(loc.sources)}</div>
    </li>`).join('');
}

function perbarui() { renderList(saring()); }

function renderAll() {
  if (!DATA) return;
  renderStats(SEMUA);
  renderPanels(SEMUA);
  bangunFilter(SEMUA);
  $('footUpdated').textContent = DATA.generated_at ? tanggalPanjang(DATA.generated_at) : '—';
  perbarui();
}

/* ------------------------------------------------------------------ init */

(async function init() {
  initLangToggle();

  try {
    DATA = await muatData();
  } catch (err) {
    $('feed').innerHTML = `<li class="empty">${esc(t('err.load'))}</li>`;
    console.error(err);
    return;
  }

  SEMUA = urutBaru(DATA.locations || []);
  if (DATA.sample_data) $('sampleBanner').hidden = false;

  renderAll();

  ['fTahun', 'fWilayah', 'fJenis'].forEach(id => $(id).addEventListener('change', perbarui));
  $('fCari').addEventListener('input', perbarui);
  $('reset').addEventListener('click', () => {
    ['fTahun', 'fWilayah', 'fJenis', 'fCari'].forEach(id => { $(id).value = ''; });
    perbarui();
  });

  document.addEventListener('langchange', renderAll);
})();
