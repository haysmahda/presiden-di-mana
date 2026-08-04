/* Home page: hero answer, Leaflet map, current-location card, movement feed. */

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
  '&copy; <a href="https://carto.com/attributions">CARTO</a>';

const JEJAK_MAX = 8; // how many past points to trail on the map

const $ = id => document.getElementById(id);

function beaconIcon() {
  return L.divIcon({
    className: '',
    iconSize: [13, 13],
    html: '<div class="beacon">' +
            '<div class="beacon__ring"></div>' +
            '<div class="beacon__ring beacon__ring--2"></div>' +
            '<div class="beacon__core"></div>' +
          '</div>'
  });
}

function pastIcon() {
  return L.divIcon({ className: '', iconSize: [9, 9], html: '<div class="pastpin"></div>' });
}

function popupHtml(loc) {
  return `<b>${esc(loc.place)}</b><span>${esc(labelWilayah(loc))} — ${esc(waktuRelatif(loc.reported_at))}</span>`;
}

function renderHero(loc) {
  $('heroPlace').textContent  = loc.place;
  $('heroRegion').textContent = labelWilayah(loc);
  $('heroAgo').textContent    = waktuRelatif(loc.reported_at);
  document.title = `Presiden di ${loc.place} — Presiden Di Mana Sekarang?`;
}

function renderNowCard(loc) {
  $('nowStamp').textContent  = waktuRelatif(loc.reported_at);
  $('nowPlace').textContent  = loc.place;
  $('nowRegion').textContent = [labelWilayah(loc), loc.country_code !== 'ID' ? loc.country : null]
    .filter(Boolean).join(' · ');
  $('nowEvent').textContent  = loc.event_label_id || '—';
  $('nowDate').textContent   = tanggalPanjang(loc.reported_at);
  $('nowCoords').textContent = `${Number(loc.lat).toFixed(4)}, ${Number(loc.lng).toFixed(4)}`;

  const skor = Number(loc.confidence) || 0;
  $('confNum').textContent = `${skor}%`;
  $('confBars').innerHTML  = segmenKeyakinan(skor);
  $('confBars').setAttribute('aria-label', `Skor keyakinan ${skor} persen`);

  const jumlah = (loc.sources || []).length;
  const outlets = new Set((loc.sources || []).map(s => s.outlet)).size;
  $('confNote').textContent =
    `${jumlah} laporan dari ${outlets} media ${outlets > 1 ? 'independen' : ''}`.trim() + '.';

  $('nowSources').innerHTML = sourceButtons(loc.sources);
}

function renderFeed(list) {
  const feed = $('feed');

  if (!list.length) {
    feed.innerHTML = '<li class="feed__loading">Belum ada pergerakan yang tercatat.</li>';
    return;
  }

  feed.innerHTML = list.map((loc, i) => {
    const luarNegeri = loc.country_code !== 'ID';
    const chips = [
      i === 0 ? '<span class="chip chip--now">Terkini</span>' : '',
      `<span class="chip">${esc(loc.event_label_id || 'Kegiatan')}</span>`,
      luarNegeri ? `<span class="chip chip--luar">Luar Negeri</span>` : ''
    ].join('');

    return `
      <li class="entry${i === 0 ? ' entry--now' : ''}">
        <div class="entry__top">
          <span class="entry__ago">${esc(waktuRelatif(loc.reported_at))}</span>
          ${chips}
        </div>
        <h3 class="entry__place">${esc(loc.place)}</h3>
        <p class="entry__region">${esc(labelWilayah(loc))} — ${esc(tanggalPanjang(loc.reported_at))}</p>
        <p class="entry__conf">KEYAKINAN <b>${esc(loc.confidence)}%</b></p>
        <div class="entry__sources">${sourceButtons(loc.sources)}</div>
      </li>`;
  }).join('');
}

function renderMap(list, current) {
  const map = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: false,   // don't hijack the page scroll on mobile
    attributionControl: true
  });

  L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 18, subdomains: 'abcd' }).addTo(map);

  const jejak = list.slice(0, JEJAK_MAX);

  // dashed trail, oldest -> newest
  if (jejak.length > 1) {
    L.polyline([...jejak].reverse().map(l => [l.lat, l.lng]), {
      color: '#E1362C', weight: 1.2, opacity: .38, dashArray: '3 7'
    }).addTo(map);
  }

  jejak.slice(1).forEach(loc => {
    L.marker([loc.lat, loc.lng], { icon: pastIcon(), keyboard: false })
      .addTo(map).bindPopup(popupHtml(loc));
  });

  L.marker([current.lat, current.lng], { icon: beaconIcon(), zIndexOffset: 1000, title: current.place })
    .addTo(map).bindPopup(popupHtml(current)).openPopup();

  // Frame the recent trail, then bias the view towards the current pin.
  if (jejak.length > 1) {
    map.fitBounds(L.latLngBounds(jejak.map(l => [l.lat, l.lng])), {
      padding: [70, 70], maxZoom: 7
    });
  } else {
    map.setView([current.lat, current.lng], 9);
  }

  // Wheel zoom only after a deliberate click, and off again once the pointer
  // leaves — mouseleave (not Leaflet's mouseout) so moving onto a pin is fine.
  map.on('click', () => map.scrollWheelZoom.enable());
  map.getContainer().addEventListener('mouseleave', () => map.scrollWheelZoom.disable());
}

function renderStatus(data, list) {
  const outlets = new Set(list.flatMap(l => (l.sources || []).map(s => s.outlet)));
  $('statSources').textContent = outlets.size || '—';
  $('statChecked').textContent = data.generated_at ? waktuRelatif(data.generated_at) : '—';
  $('footUpdated').textContent = data.generated_at ? tanggalPanjang(data.generated_at) : '—';
  if (data.sample_data) $('sampleBanner').hidden = false;
}

function gagal(pesan) {
  $('heroPlace').textContent = 'Data tidak tersedia';
  $('heroRegion').textContent = pesan;
  $('nowPlace').textContent = 'Data tidak tersedia';
  $('feed').innerHTML = `<li class="feed__loading">${esc(pesan)}</li>`;
}

(async function init() {
  let data;
  try {
    data = await muatData();
  } catch (err) {
    gagal('Gagal memuat data lokasi. Coba muat ulang halaman.');
    console.error(err);
    return;
  }

  const list = urutBaru(data.locations || []);
  if (!list.length) {
    gagal('Belum ada lokasi yang tercatat.');
    return;
  }

  const current = list.find(l => l.id === data.current) || list[0];

  renderStatus(data, list);
  renderHero(current);
  renderNowCard(current);
  renderFeed(list.slice(0, 6));
  renderMap(list, current);
})();
