/* Riwayat page: stats strip + filterable archive of every recorded location. */

const $ = id => document.getElementById(id);

let SEMUA = [];

/* --- stats -------------------------------------------------------------- */

function hariUnik(list) {
  return new Set(list.map(l =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(l.reported_at))
  )).size;
}

function renderStats(list) {
  const provinsi   = new Set(list.filter(l => l.country_code === 'ID' && l.region).map(l => l.region));
  const diJakarta  = hariUnik(list.filter(l => /jakarta/i.test(l.region || '')));
  const luarNegeri = new Set(list.filter(l => l.country_code !== 'ID').map(l => l.country));

  const kartu = [
    [list.length,        'Catatan lokasi'],
    [provinsi.size,      'Provinsi dikunjungi'],
    [diJakarta,          'Hari tercatat di Jakarta'],
    [luarNegeri.size,    'Negara dikunjungi']
  ];

  $('stats').innerHTML = kartu.map(([n, k]) => `
    <div class="stat">
      <span class="stat__n"><em>${esc(n)}</em></span>
      <span class="stat__k">${esc(k)}</span>
    </div>`).join('');
}

/* --- filters ------------------------------------------------------------ */

function isiPilihan(select, nilai) {
  select.insertAdjacentHTML('beforeend',
    nilai.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join(''));
}

function bangunFilter(list) {
  const tahun   = [...new Set(list.map(l => tahunJakarta(l.reported_at)).filter(Boolean))].sort((a, b) => b - a);
  const wilayah = [...new Set(list.map(l => l.country_code === 'ID' ? l.region : l.country).filter(Boolean))].sort();
  const jenis   = [...new Set(list.map(l => l.event_label_id).filter(Boolean))].sort();

  isiPilihan($('fTahun'), tahun);
  isiPilihan($('fWilayah'), wilayah);
  isiPilihan($('fJenis'), jenis);
}

function saring() {
  const tahun   = $('fTahun').value;
  const wilayah = $('fWilayah').value;
  const jenis   = $('fJenis').value;
  const cari    = $('fCari').value.trim().toLowerCase();

  return SEMUA.filter(l => {
    if (tahun && String(tahunJakarta(l.reported_at)) !== tahun) return false;
    if (wilayah && (l.country_code === 'ID' ? l.region : l.country) !== wilayah) return false;
    if (jenis && l.event_label_id !== jenis) return false;
    if (cari) {
      const haystack = [l.place, l.city, l.region, l.country].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(cari)) return false;
    }
    return true;
  });
}

/* --- list --------------------------------------------------------------- */

function renderList(list) {
  const feed = $('feed');
  $('hitung').textContent = list.length;

  if (!list.length) {
    feed.innerHTML = '<li class="empty">Tidak ada catatan yang cocok dengan filter ini.</li>';
    return;
  }

  feed.innerHTML = list.map(loc => {
    const luarNegeri = loc.country_code !== 'ID';
    return `
      <li class="entry">
        <div class="entry__top">
          <span class="entry__ago">${esc(tanggalPanjang(loc.reported_at, false))}</span>
          <span class="chip">${esc(loc.event_label_id || 'Kegiatan')}</span>
          ${luarNegeri ? '<span class="chip chip--luar">Luar Negeri</span>' : ''}
        </div>
        <h3 class="entry__place">${esc(loc.place)}</h3>
        <p class="entry__region">${esc(labelWilayah(loc))} — ${esc(waktuRelatif(loc.reported_at))}</p>
        <p class="entry__conf">KEYAKINAN <b>${esc(loc.confidence)}%</b></p>
        <div class="entry__sources">${sourceButtons(loc.sources)}</div>
      </li>`;
  }).join('');
}

function perbarui() { renderList(saring()); }

/* --- init --------------------------------------------------------------- */

(async function init() {
  let data;
  try {
    data = await muatData();
  } catch (err) {
    $('feed').innerHTML = '<li class="empty">Gagal memuat data. Coba muat ulang halaman.</li>';
    console.error(err);
    return;
  }

  SEMUA = urutBaru(data.locations || []);
  if (data.sample_data) $('sampleBanner').hidden = false;
  $('footUpdated').textContent = data.generated_at ? tanggalPanjang(data.generated_at) : '—';

  renderStats(SEMUA);
  bangunFilter(SEMUA);
  renderList(SEMUA);

  ['fTahun', 'fWilayah', 'fJenis'].forEach(id => $(id).addEventListener('change', perbarui));
  $('fCari').addEventListener('input', perbarui);

  $('reset').addEventListener('click', () => {
    ['fTahun', 'fWilayah', 'fJenis', 'fCari'].forEach(id => { $(id).value = ''; });
    perbarui();
  });
})();
