/* Home page: hero answer, Leaflet map, current-location card, movement feed. */

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
  '&copy; <a href="https://carto.com/attributions">CARTO</a>';

const JEJAK_MAX = 8;       // how many past points to trail on the map
const FEED_MAX = 6;        // entries in the movement feed
const NOWCARD_SOURCES = 3; // sources shown before the "more" toggle

const $ = id => document.getElementById(id);

let DATA = null;   // last loaded payload, so a language switch can re-render
let MAP = null;

/* --------------------------------------------------------------- markers */

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

/* ----------------------------------------------------------------- parts */

function renderHero(loc) {
  $('heroPlace').textContent  = loc.place;
  $('heroRegion').textContent = labelWilayah(loc);
  $('heroAgo').textContent    = waktuRelatif(loc.reported_at);
  document.title = LANG === 'en'
    ? `The President is at ${loc.place} — Presiden Di Mana Sekarang?`
    : `Presiden di ${loc.place} — Presiden Di Mana Sekarang?`;
}

/* The card floats over the map, so it must not grow without bound. Show a few
   sources and tuck the rest behind a toggle — every source stays reachable,
   and the full list is repeated in the feed below anyway. */
function nowCardSources(sources) {
  const list = Array.isArray(sources) ? sources : [];
  const shown = sourceButtons(list.slice(0, NOWCARD_SOURCES));
  const rest = list.slice(NOWCARD_SOURCES);
  if (!rest.length) return shown;

  return shown + `
    <details class="moresrc">
      <summary class="moresrc__toggle">
        <svg class="btn__i moresrc__chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        ${rest.length} ${esc(t('card.more'))}
      </summary>
      <div class="moresrc__list">${sourceButtons(rest)}</div>
    </details>`;
}

function renderNowCard(loc) {
  $('nowStamp').textContent  = waktuRelatif(loc.reported_at);
  $('nowPlace').textContent  = loc.place;
  $('nowRegion').textContent = [labelWilayah(loc), loc.country_code !== 'ID' ? loc.country : null]
    .filter(Boolean).join(' · ');
  $('nowEvent').textContent  = eventLabel(loc);
  $('nowDate').textContent   = tanggalPanjang(loc.reported_at);
  $('nowCoords').textContent = `${Number(loc.lat).toFixed(4)}, ${Number(loc.lng).toFixed(4)}`;

  const skor = Number(loc.confidence) || 0;
  $('confNum').textContent = `${skor}%`;
  $('confBars').innerHTML  = segmenKeyakinan(skor);
  $('confBars').setAttribute('aria-label', `${t('card.conf')} ${skor}%`);

  const jumlah = (loc.sources || []).length;
  const outlets = new Set((loc.sources || []).map(s => s.outlet)).size;
  $('confNote').textContent = LANG === 'en'
    ? `${jumlah} ${plural(jumlah, 'report')} from ${outlets} independent ${plural(outlets, 'outlet')}.`
    : `${jumlah} laporan dari ${outlets} media independen.`;

  $('nowSources').innerHTML = nowCardSources(loc.sources);
}

function renderFeed(list) {
  const feed = $('feed');

  if (!list.length) {
    feed.innerHTML = `<li class="feed__loading">${esc(t('feed.empty'))}</li>`;
    return;
  }

  feed.innerHTML = list.map((loc, i) => {
    const luarNegeri = loc.country_code !== 'ID';
    const chips = [
      i === 0 ? `<span class="chip chip--now">${esc(t('feed.latest'))}</span>` : '',
      `<span class="chip">${esc(eventLabel(loc))}</span>`,
      luarNegeri ? `<span class="chip chip--luar">${esc(t('feed.abroad'))}</span>` : ''
    ].join('');

    return `
      <li class="entry${i === 0 ? ' entry--now' : ''}">
        <div class="entry__top">
          <span class="entry__ago">${esc(waktuRelatif(loc.reported_at))}</span>
          ${chips}
        </div>
        <h3 class="entry__place">${esc(loc.place)}</h3>
        <p class="entry__region">${esc(labelWilayah(loc))} — ${esc(tanggalPanjang(loc.reported_at))}</p>
        <p class="entry__conf">${esc(t('feed.conf')).toUpperCase()} <b>${esc(loc.confidence)}%</b></p>
        <div class="entry__sources">${sourceButtons(loc.sources)}</div>
      </li>`;
  }).join('');
}

function renderMap(list, current) {
  MAP = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: false,   // don't hijack the page scroll on mobile
    attributionControl: true
  });

  L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 18, subdomains: 'abcd' }).addTo(MAP);

  const jejak = list.slice(0, JEJAK_MAX);

  // dashed trail, oldest -> newest
  if (jejak.length > 1) {
    L.polyline([...jejak].reverse().map(l => [l.lat, l.lng]), {
      color: '#E1362C', weight: 1.2, opacity: .38, dashArray: '3 7'
    }).addTo(MAP);
  }

  jejak.slice(1).forEach(loc => {
    L.marker([loc.lat, loc.lng], { icon: pastIcon(), keyboard: false })
      .addTo(MAP).bindPopup(popupHtml(loc));
  });

  L.marker([current.lat, current.lng], { icon: beaconIcon(), zIndexOffset: 1000, title: current.place })
    .addTo(MAP).bindPopup(popupHtml(current)).openPopup();

  if (jejak.length > 1) {
    MAP.fitBounds(L.latLngBounds(jejak.map(l => [l.lat, l.lng])), { padding: [70, 70], maxZoom: 7 });
  } else {
    MAP.setView([current.lat, current.lng], 9);
  }

  // Wheel zoom only after a deliberate click, and off again once the pointer
  // leaves — mouseleave (not Leaflet's mouseout) so moving onto a pin is fine.
  MAP.on('click', () => MAP.scrollWheelZoom.enable());
  MAP.getContainer().addEventListener('mouseleave', () => MAP.scrollWheelZoom.disable());
}

function renderStatus(data, list) {
  const outlets = new Set(list.flatMap(l => (l.sources || []).map(s => s.outlet)));
  $('statSources').textContent = outlets.size || '—';
  $('statChecked').textContent = data.generated_at ? waktuRelatif(data.generated_at) : '—';
  $('footUpdated').textContent = data.generated_at ? tanggalPanjang(data.generated_at) : '—';
  if (data.sample_data) $('sampleBanner').hidden = false;
}

function gagal(pesan) {
  $('heroPlace').textContent = t('err.na');
  $('heroRegion').textContent = pesan;
  $('nowPlace').textContent = t('err.na');
  $('feed').innerHTML = `<li class="feed__loading">${esc(pesan)}</li>`;
}

/* Everything that depends on language, redrawn. The Leaflet map is built once
   and only its popups need refreshing. */
function renderAll() {
  if (!DATA) return;
  const list = urutBaru(DATA.locations || []);
  const current = list.find(l => l.id === DATA.current) || list[0];

  renderStatus(DATA, list);
  renderHero(current);
  renderNowCard(current);
  renderFeed(list.slice(0, FEED_MAX));

  if (MAP) {
    MAP.eachLayer(layer => {
      if (layer instanceof L.Marker && layer.getPopup()) {
        const ll = layer.getLatLng();
        const match = list.find(l => l.lat === ll.lat && l.lng === ll.lng);
        if (match) layer.setPopupContent(popupHtml(match));
      }
    });
  }
}

(async function init() {
  initLangToggle();

  try {
    DATA = await muatData();
  } catch (err) {
    gagal(t('err.load'));
    console.error(err);
    return;
  }

  const list = urutBaru(DATA.locations || []);
  if (!list.length) {
    gagal(t('err.none'));
    return;
  }

  const current = list.find(l => l.id === DATA.current) || list[0];

  renderAll();
  renderMap(list, current);

  document.addEventListener('langchange', renderAll);
})();
