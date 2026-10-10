/* Baby Travel Map · app logic · v1.0 · 10 Oct 2026 · Claude for Sudharsan R
   Supabase Project Zero (schema memories) + MapLibre GL JS (OpenFreeMap tiles) + Photon/Nominatim geocoding.
   Everything the signed-in owner does goes through RLS; the family link goes through memories.story_for_token(). */
(() => {
'use strict';
const SUPABASE_URL = 'https://bxzmneeacjjtwmtdsrjd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dcwUfURxdPF8AquVEs7KzA_xpcJQR1b'; // publishable key: safe in the browser; RLS does the gating
const OWNER_EMAIL = 'sudharsan454@gmail.com';
const BUCKET = 'memories-media';
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const INDIA = { center: [80.2, 19.5], zoom: 3.6 };
const FIRSTS = [
  ['first_flight','First flight'],['first_train','First train'],['first_sea','First time at the sea'],['first_hill','First hills'],
  ['first_temple','First temple'],['first_snow','First snow'],['first_outside_state','First time outside Tamil Nadu'],['first_outside_india','First time outside India'],
  ['first_boat','First boat'],['first_zoo','First zoo'],['other','Another first']
];
const MODE_WORDS = { car:'by car', train:'by train', flight:'by flight', bus:'by bus', boat:'by boat', walk:'on foot', bike:'on the two-wheeler' };

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: 'memories' } });
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const toast = (msg, ms = 2600) => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, ms); };
const mediaUrl = path => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));

// Age the way parents say it. Mirrors memories.age_label() in the database.
let ageLabelImpl = null; // share mode swaps this for a lookup of server-computed ages
const ageLabel = (dob, on) => ageLabelImpl ? ageLabelImpl(dob, on) : baseAgeLabel(dob, on);
function baseAgeLabel(dob, on) {
  if (!dob || !on) return '';
  const a = new Date(dob + 'T00:00:00'), b = new Date(on + 'T00:00:00');
  if (b < a) return 'before he was born';
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months--;
  if (months < 1) return Math.round((b - a) / 86400000) + ' days';
  if (months < 24) return months + ' months';
  return Math.floor(months / 12) + ' y ' + (months % 12) + ' m';
}
function haversine(a, b) {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

// ---------- state ----------
const S = { session: null, child: null, places: [], trips: [], media: [], milestones: [], shares: [], year: 'all', map: null, markers: [], editor: null, player: null };

// ---------- geocoding (Photon first, Nominatim fallback; results cached per query) ----------
const geoCache = new Map();
async function geocode(q) {
  q = q.trim(); if (q.length < 3) return [];
  if (geoCache.has(q)) return geoCache.get(q);
  let out = [];
  try {
    const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en&lat=13.06&lon=80.27`);
    const j = await r.json();
    out = (j.features || []).map(f => ({
      name: f.properties.name || q, locality: f.properties.locality || f.properties.district || null,
      city: f.properties.city || f.properties.county || null, district: f.properties.county || null,
      state: f.properties.state || null, country: f.properties.country || 'India',
      lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
      kind: f.properties.osm_value || 'place', osm_ref: `${f.properties.osm_type || ''}/${f.properties.osm_id || ''}`
    }));
  } catch (e) { /* fall through */ }
  if (!out.length) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=6&addressdetails=1`);
      const j = await r.json();
      out = j.map(x => ({
        name: x.name || x.display_name.split(',')[0], locality: x.address.suburb || x.address.neighbourhood || x.address.village || null,
        city: x.address.city || x.address.town || x.address.county || null, district: x.address.state_district || x.address.county || null,
        state: x.address.state || null, country: x.address.country || 'India', lat: +x.lat, lng: +x.lon, kind: x.type || 'place', osm_ref: `${x.osm_type}/${x.osm_id}`
      }));
    } catch (e) { /* no results */ }
  }
  geoCache.set(q, out); return out;
}
function placeLine(p) { return [p.locality && p.locality !== p.name ? p.locality : null, p.city, p.state, p.country !== 'India' ? p.country : null].filter(Boolean).join(', '); }

// Wire a search input to show known places first, then geocoder results. onPick(placeObj) receives either an existing place (with id) or a new one.
function wirePlaceSearch(inputId, resultsId, jsonId, onPick) {
  const input = $(inputId), box = $(resultsId), hidden = $(jsonId);
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t); hidden.value = '';
    const q = input.value.trim().toLowerCase();
    const known = S.places.filter(p => (p.name + ' ' + (p.city || '') + ' ' + (p.state || '')).toLowerCase().includes(q)).slice(0, 4);
    render(known, []);
    if (q.length >= 3) t = setTimeout(async () => { const r = await geocode(q); if (input.value.trim().toLowerCase() === q) render(known, r); }, 350);
  });
  function render(known, found) {
    box.innerHTML = '';
    known.forEach(p => box.appendChild(btn(p, 'already on the map')));
    found.forEach(p => box.appendChild(btn(p, placeLine(p))));
  }
  function btn(p, sub) {
    const b = document.createElement('button'); b.type = 'button';
    b.innerHTML = `${esc(p.name)}<small>${esc(sub)}</small>`;
    b.onclick = () => { hidden.value = JSON.stringify(p); input.value = p.name; box.innerHTML = ''; onPick && onPick(p); };
    return b;
  }
}

// ---------- data ----------
async function loadAll() {
  const [c, p, t, s, m, ms, sh] = await Promise.all([
    sb.from('child').select('*').limit(1).maybeSingle(),
    sb.from('place').select('*'),
    sb.from('trip').select('*').order('start_date', { ascending: false }),
    sb.from('trip_stop').select('*').order('seq'),
    sb.from('media').select('*').order('created_at'),
    sb.from('milestone').select('*'),
    sb.from('share_link').select('*').order('created_at', { ascending: false })
  ]);
  for (const r of [c, p, t, s, m, ms, sh]) if (r.error) throw r.error;
  S.child = c.data; S.places = p.data; S.media = m.data; S.milestones = ms.data; S.shares = sh.data;
  const byPlace = Object.fromEntries(S.places.map(x => [x.id, x]));
  S.trips = t.data.map(tr => ({
    ...tr,
    stops: s.data.filter(x => x.trip_id === tr.id).map(x => ({ ...x, place: byPlace[x.place_id], milestones: S.milestones.filter(mm => mm.stop_id === x.id) })),
    media: S.media.filter(x => x.trip_id === tr.id)
  }));
}
const years = () => [...new Set(S.trips.map(t => +t.start_date.slice(0, 4)))].sort();
const tripsForYear = y => y === 'all' ? S.trips : S.trips.filter(t => t.start_date.startsWith(String(y)));
const cover = (trip, stopId) => (trip.media.find(m => m.is_cover && (!stopId || m.stop_id === stopId)) || trip.media.find(m => !stopId || m.stop_id === stopId) || trip.media[0]) || null;
const home = () => S.places.find(p => p.id === S.child?.home_place_id) || null;

// ---------- views ----------
function show(view) {
  $$('#main .view').forEach(v => v.hidden = v.id !== 'view-' + view);
  $$('#bottomnav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('#fab').hidden = view === 'settings';
  if (view === 'map' && S.map) setTimeout(() => S.map.resize(), 50);
  if (view === 'timeline') renderTimeline();
  if (view === 'story') renderStoryPicker();
  if (view === 'settings') renderSettings();
}
function renderYearChips() {
  const box = $('#year-chips'); box.innerHTML = '';
  const ys = years(); if (!ys.length) return;
  ['all', ...ys].forEach(y => {
    const b = document.createElement('button'); b.className = 'chip' + (String(S.year) === String(y) ? ' on' : ''); b.textContent = y === 'all' ? 'All years' : y;
    b.onclick = () => { S.year = y; renderYearChips(); renderMarkers(); renderTimeline(); }; box.appendChild(b);
  });
}

// ---------- map ----------
function initMap() {
  if (S.map) return;
  S.map = new maplibregl.Map({ container: 'map', style: MAP_STYLE, center: INDIA.center, zoom: INDIA.zoom, attributionControl: { compact: true } });
  S.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  S.map.on('load', () => { renderMarkers(); fitToTrips(); });
}
function renderMarkers() {
  if (!S.map) return;
  S.markers.forEach(m => m.remove()); S.markers = [];
  const trips = tripsForYear(S.year);
  const perPlace = new Map();
  trips.forEach(t => t.stops.forEach(s => { if (!s.place) return; const arr = perPlace.get(s.place.id) || []; arr.push({ trip: t, stop: s }); perPlace.set(s.place.id, arr); }));
  $('#map-empty').hidden = S.trips.length > 0;
  const h = home();
  if (h) { const el = document.createElement('div'); el.className = 'pin home'; el.title = 'Home'; S.markers.push(new maplibregl.Marker({ element: el }).setLngLat([h.lng, h.lat]).addTo(S.map)); }
  perPlace.forEach((visits, pid) => {
    const p = S.places.find(x => x.id === pid); if (!p) return;
    const el = document.createElement('div'); el.className = 'pin';
    const cv = visits.map(v => cover(v.trip, v.stop.id)).find(Boolean);
    if (cv) el.style.backgroundImage = `url("${mediaUrl(cv.storage_path)}")`; else el.textContent = p.name.slice(0, 1);
    if (visits.length > 1) { const n = document.createElement('span'); n.className = 'n'; n.textContent = visits.length; el.appendChild(n); }
    el.onclick = () => openPlaceSheet(p, visits);
    S.markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(S.map));
  });
}
function fitToTrips() {
  const pts = []; tripsForYear(S.year).forEach(t => t.stops.forEach(s => s.place && pts.push([s.place.lng, s.place.lat])));
  const h = home(); if (h) pts.push([h.lng, h.lat]);
  if (pts.length >= 2) { const b = pts.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0])); S.map.fitBounds(b, { padding: 80, maxZoom: 11, duration: 1200 }); }
  else if (pts.length === 1) S.map.flyTo({ center: pts[0], zoom: 10 });
}

// ---------- sheets ----------
function openSheet(html) { $('#sheet-body').innerHTML = html; $('#sheet').hidden = false; $('#scrim').hidden = false; }
function closeSheet() { $('#sheet').hidden = true; $('#scrim').hidden = true; }
function openPlaceSheet(p, visits) {
  const rows = visits.sort((a, b) => b.trip.start_date.localeCompare(a.trip.start_date)).map(({ trip, stop }) => {
    const cv = cover(trip, stop.id);
    return `<div class="visit" data-trip="${trip.id}">${cv ? `<img src="${mediaUrl(cv.storage_path)}" alt="">` : '<div class="ph"></div>'}
      <div><b>${esc(trip.title)}</b><div class="muted small">${fmtDate(stop.arrived_on || trip.start_date)} · ${MODE_WORDS[stop.mode_to_here] || stop.mode_to_here}</div></div>
      <div class="age">${ageLabel(S.child.dob, stop.arrived_on || trip.start_date)}</div></div>`;
  }).join('');
  openSheet(`<h2>${esc(p.name)}</h2><p class="muted">${esc(placeLine(p))} · ${visits.length} visit${visits.length > 1 ? 's' : ''}</p>${rows}`);
  $$('#sheet .visit').forEach(el => el.onclick = () => openTripSheet(S.trips.find(t => t.id === el.dataset.trip)));
}
function openTripSheet(trip) {
  const km = trip.stops.reduce((a, s) => a + (s.km_from_prev || 0), 0);
  const nights = Math.round((new Date(trip.end_date) - new Date(trip.start_date)) / 86400000);
  const entries = trip.stops.map((s, i) => {
    const thumbs = trip.media.filter(m => m.stop_id === s.id).map(m => `<img src="${mediaUrl(m.storage_path)}" alt="">`).join('');
    const firsts = s.milestones.map(m => `<span class="chip on">${esc(FIRSTS.find(f => f[0] === m.kind)?.[1] || m.kind)}${m.note ? ': ' + esc(m.note) : ''}</span>`).join(' ');
    return `<div class="entry">
      <div class="top"><b>${i + 1}. ${esc(s.place?.name || '?')}</b><span class="age">${ageLabel(S.child.dob, s.arrived_on || trip.start_date)}</span></div>
      <div class="muted small">${fmtDate(s.arrived_on || trip.start_date)}${s.left_on ? ' – ' + fmtDate(s.left_on) : ''} · ${MODE_WORDS[s.mode_to_here] || s.mode_to_here}${s.km_from_prev ? ', about ' + s.km_from_prev + ' km' : ''}</div>
      <dl>${s.stayed_at ? `<dt>Stayed</dt><dd>${esc(s.stayed_at)}</dd>` : ''}${s.what_we_did ? `<dt>We did</dt><dd>${esc(s.what_we_did)}</dd>` : ''}${s.what_he_saw ? `<dt>He did</dt><dd>${esc(s.what_he_saw)}</dd>` : ''}${s.what_he_hated ? `<dt>He hated</dt><dd>${esc(s.what_he_hated)}</dd>` : ''}</dl>
      ${s.memory ? `<div class="mem">“${esc(s.memory)}”</div>` : ''}
      ${firsts ? `<div class="chips wrap" style="margin-top:8px">${firsts}</div>` : ''}
      ${thumbs ? `<div class="thumbs">${thumbs}</div>` : ''}
      <div class="actions"><button class="btn" data-edit-stop="${s.id}" type="button">Edit entry</button></div>
    </div>`;
  }).join('');
  openSheet(`<div class="trip-head"><div><h2>${esc(trip.title)}</h2><p class="muted">${fmtDate(trip.start_date)} – ${fmtDate(trip.end_date)} · ${esc(trip.purpose)}</p></div><span class="age">${ageLabel(S.child.dob, trip.start_date)}</span></div>
    ${trip.summary ? `<p>${esc(trip.summary)}</p>` : ''}
    <div class="stat-row"><span><b>${trip.stops.length}</b> entr${trip.stops.length === 1 ? 'y' : 'ies'}</span><span><b>${km}</b> km</span><span><b>${nights}</b> night${nights === 1 ? '' : 's'}</span></div>
    <div class="actions">${trip.album_url ? `<a class="btn" href="${esc(trip.album_url)}" target="_blank" rel="noopener">Open album</a>` : ''}<button class="btn" id="btn-add-entry-to" type="button">Add entry</button><button class="btn" id="btn-edit-trip" type="button">Edit trip</button><button class="btn danger" id="btn-del-trip" type="button">Delete trip</button></div>
    ${entries}`);
  $$('#sheet [data-edit-stop]').forEach(b => b.onclick = () => openEditor({ trip, stop: trip.stops.find(s => s.id === b.dataset.editStop) }));
  $('#btn-add-entry-to').onclick = () => openEditor({ trip, stop: null });
  $('#btn-edit-trip').onclick = () => openEditor({ trip, stop: trip.stops[0] || null, tripOnly: true });
  $('#btn-del-trip').onclick = async () => {
    if (!(await confirmSheet(`Delete “${trip.title}” with its ${trip.stops.length} entries and ${trip.media.length} photos?`))) return;
    for (const m of trip.media) await sb.storage.from(BUCKET).remove([m.storage_path]);
    const { error } = await sb.from('trip').delete().eq('id', trip.id); if (error) return toast(error.message);
    closeSheet(); await refresh(); toast('Trip deleted');
  };
}
function confirmSheet(msg) {
  return new Promise(res => {
    const body = $('#sheet-body'); const prev = body.innerHTML;
    body.innerHTML = `<h3>${esc(msg)}</h3><div class="actions"><button class="btn danger" id="c-yes" type="button">Yes, delete</button><button class="btn" id="c-no" type="button">Keep it</button></div>`;
    $('#c-yes').onclick = () => res(true); $('#c-no').onclick = () => { body.innerHTML = prev; res(false); };
  });
}

// ---------- timeline ----------
function renderTimeline() {
  const box = $('#timeline-list'); const trips = tripsForYear(S.year);
  if (!trips.length) { box.innerHTML = '<p class="muted">Nothing logged yet.</p>'; return; }
  let html = '', y = '';
  trips.forEach(t => {
    const ty = t.start_date.slice(0, 4); if (ty !== y) { y = ty; html += `<div class="year-h">${y}</div>`; }
    const cv = cover(t); const places = [...new Set(t.stops.map(s => s.place?.name).filter(Boolean))].join(' → ');
    html += `<div class="visit" data-trip="${t.id}">${cv ? `<img src="${mediaUrl(cv.storage_path)}" alt="">` : '<div class="ph"></div>'}<div><b>${esc(t.title)}</b><div class="muted small">${esc(places)}<br>${fmtDate(t.start_date)} · ${[...new Set(t.stops.map(s => MODE_WORDS[s.mode_to_here]))].join(', ')}</div></div><div class="age">${ageLabel(S.child.dob, t.start_date)}</div></div>`;
  });
  box.innerHTML = html;
  $$('#timeline-list .visit').forEach(el => el.onclick = () => openTripSheet(S.trips.find(t => t.id === el.dataset.trip)));
}

// ---------- editor ----------
function buildFirsts(selected = []) {
  const box = $('#e-firsts'); box.innerHTML = '';
  FIRSTS.forEach(([k, label]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (selected.includes(k) ? ' on' : ''); b.dataset.kind = k; b.textContent = label; b.onclick = () => b.classList.toggle('on'); box.appendChild(b); });
}
let pendingPhotos = [];
function openEditor({ trip = null, stop = null, tripOnly = false } = {}) {
  closeSheet();
  S.editor = { trip, stop, tripOnly }; pendingPhotos = [];
  $('#editor').hidden = false;
  $('#editor-title').textContent = trip ? (tripOnly ? 'Edit trip' : (stop ? 'Edit entry' : 'New entry')) : 'New trip';
  $('#fs-trip').hidden = !!(trip && !tripOnly);
  $('#fs-entry').hidden = !!tripOnly;
  $('#editor-more').hidden = !!(stop || tripOnly);
  $('#editor-danger').hidden = !(stop && !tripOnly);
  const today = new Date().toISOString().slice(0, 10);
  $('#t-title').value = trip?.title || ''; $('#t-start').value = trip?.start_date || today; $('#t-end').value = trip?.end_date || today;
  $('#t-purpose').value = trip?.purpose || 'holiday'; $('#t-album').value = trip?.album_url || ''; $('#t-summary').value = trip?.summary || '';
  $('#entry-legend').textContent = stop ? `Entry ${(trip.stops.findIndex(s => s.id === stop.id) + 1)}` : `Entry ${(trip?.stops.length || 0) + 1}`;
  $('#e-place').value = stop?.place?.name || ''; $('#e-place-json').value = stop?.place ? JSON.stringify(stop.place) : ''; $('#e-place-picked').textContent = stop?.place ? placeLine(stop.place) : ''; $('#e-place-results').innerHTML = '';
  $('#e-arrived').value = stop?.arrived_on || trip?.start_date || today; $('#e-left').value = stop?.left_on || trip?.end_date || today;
  $('#e-mode').value = stop?.mode_to_here || 'car'; $('#e-km').value = stop?.km_from_prev ?? '';
  $('#e-stayed').value = stop?.stayed_at || ''; $('#e-did').value = stop?.what_we_did || ''; $('#e-saw').value = stop?.what_he_saw || ''; $('#e-hated').value = stop?.what_he_hated || ''; $('#e-memory').value = stop?.memory || '';
  $('#e-highlight').checked = !!stop?.highlight; buildFirsts(stop ? stop.milestones.map(m => m.kind) : []);
  $('#e-photos').value = ''; $('#e-photo-preview').innerHTML = stop ? (trip.media.filter(m => m.stop_id === stop.id).map(m => `<img src="${mediaUrl(m.storage_path)}" alt="">`).join('')) : '';
  $('#t-title').focus();
}
function closeEditor() { $('#editor').hidden = true; S.editor = null; }
function prevPlaceFor(trip, stop) {
  if (!trip) return home();
  const idx = stop ? trip.stops.findIndex(s => s.id === stop.id) : trip.stops.length;
  return idx > 0 ? trip.stops[idx - 1].place : home();
}
async function ensurePlace(obj) {
  if (obj.id) return obj;
  const existing = S.places.find(p => Math.abs(p.lat - obj.lat) < 1e-4 && Math.abs(p.lng - obj.lng) < 1e-4);
  if (existing) return existing;
  const { data, error } = await sb.from('place').insert({ name: obj.name, locality: obj.locality, city: obj.city, district: obj.district, state: obj.state, country: obj.country || 'India', lat: obj.lat, lng: obj.lng, kind: obj.kind || 'place', osm_ref: obj.osm_ref }).select().single();
  if (error) throw error; S.places.push(data); return data;
}
async function compressImage(file, max = 1600, q = 0.82) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return { blob: file, w: null, h: null };
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
  return { blob, w: c.width, h: c.height };
}
$('#e-photos').addEventListener('change', async e => {
  pendingPhotos = []; const prev = $('#e-photo-preview'); prev.innerHTML = '';
  const files = [...e.target.files].slice(0, 3);
  for (const f of files) { const c = await compressImage(f); pendingPhotos.push(c); const img = document.createElement('img'); img.src = URL.createObjectURL(c.blob); prev.appendChild(img); }
  if (e.target.files.length > 3) toast('Only the first 3 photos are kept as covers');
});
async function saveEditor(addAnother = false) {
  const ed = S.editor; if (!ed) return;
  const btn = $('#editor-save'); btn.disabled = true;
  try {
    let trip = ed.trip;
    // 1. the trip
    if (!trip || ed.tripOnly) {
      const payload = { child_id: S.child.id, title: $('#t-title').value.trim(), start_date: $('#t-start').value, end_date: $('#t-end').value, purpose: $('#t-purpose').value, album_url: $('#t-album').value.trim() || null, summary: $('#t-summary').value.trim() || null, updated_at: new Date().toISOString() };
      if (!payload.title || !payload.start_date || !payload.end_date) throw new Error('Title and dates are needed');
      if (payload.end_date < payload.start_date) throw new Error('"To" is before "From"');
      const r = trip ? await sb.from('trip').update(payload).eq('id', trip.id).select().single() : await sb.from('trip').insert(payload).select().single();
      if (r.error) throw r.error; trip = { ...r.data, stops: trip?.stops || [], media: trip?.media || [] };
    }
    // 2. the entry
    if (!ed.tripOnly) {
      const pj = $('#e-place-json').value; if (!pj) throw new Error('Pick the place from the list');
      const place = await ensurePlace(JSON.parse(pj));
      const prev = prevPlaceFor(ed.trip, ed.stop);
      const kmInput = $('#e-km').value; const km = kmInput !== '' ? +kmInput : (prev ? haversine(prev, place) : 0);
      const entry = { trip_id: trip.id, place_id: place.id, seq: ed.stop ? ed.stop.seq : (trip.stops.length + 1), arrived_on: $('#e-arrived').value || null, left_on: $('#e-left').value || null, mode_to_here: $('#e-mode').value, km_from_prev: km, stayed_at: $('#e-stayed').value.trim() || null, what_we_did: $('#e-did').value.trim() || null, what_he_saw: $('#e-saw').value.trim() || null, what_he_hated: $('#e-hated').value.trim() || null, memory: $('#e-memory').value.trim() || null, highlight: $('#e-highlight').checked };
      const r = ed.stop ? await sb.from('trip_stop').update(entry).eq('id', ed.stop.id).select().single() : await sb.from('trip_stop').insert(entry).select().single();
      if (r.error) throw r.error; const stop = r.data;
      // firsts
      const kinds = $$('#e-firsts .chip.on').map(b => b.dataset.kind);
      if (ed.stop) { const d = await sb.from('milestone').delete().eq('stop_id', stop.id); if (d.error) throw d.error; }
      if (kinds.length) { const m = await sb.from('milestone').insert(kinds.map(k => ({ stop_id: stop.id, kind: k }))); if (m.error) throw m.error; }
      // photos
      for (let i = 0; i < pendingPhotos.length; i++) {
        const ph = pendingPhotos[i]; const path = `${trip.id}/${uuid()}.jpg`;
        const up = await sb.storage.from(BUCKET).upload(path, ph.blob, { contentType: 'image/jpeg', cacheControl: '2592000', upsert: false });
        if (up.error) throw up.error;
        const hasCover = trip.media.some(m => m.is_cover);
        const mr = await sb.from('media').insert({ trip_id: trip.id, stop_id: stop.id, storage_path: path, is_cover: !hasCover && i === 0, width: ph.w, height: ph.h, bytes: ph.blob.size });
        if (mr.error) throw mr.error;
      }
      // km_total cache
      const tot = (await sb.from('trip_stop').select('km_from_prev').eq('trip_id', trip.id)).data?.reduce((a, s) => a + (s.km_from_prev || 0), 0) || 0;
      await sb.from('trip').update({ km_total: tot }).eq('id', trip.id);
    }
    await refresh();
    const fresh = S.trips.find(t => t.id === trip.id);
    toast(ed.stop ? 'Entry saved' : 'Saved. ' + (S.child ? ageLabel(S.child.dob, fresh.start_date) + ' old that day.' : ''));
    if (addAnother) openEditor({ trip: fresh, stop: null }); else { closeEditor(); openTripSheet(fresh); }
  } catch (e) { toast(e.message || String(e), 4000); }
  finally { btn.disabled = false; }
}
$('#editor-save').onclick = () => saveEditor(false);
$('#btn-add-entry').onclick = () => saveEditor(true);
$('#editor-close').onclick = closeEditor;
$('#editor-form').addEventListener('submit', e => { e.preventDefault(); saveEditor(false); });
$('#btn-delete-entry').onclick = async () => {
  const ed = S.editor; if (!ed?.stop) return;
  const { error } = await sb.from('trip_stop').delete().eq('id', ed.stop.id); if (error) return toast(error.message);
  closeEditor(); await refresh(); toast('Entry deleted');
};
wirePlaceSearch('#e-place', '#e-place-results', '#e-place-json', p => {
  $('#e-place-picked').textContent = placeLine(p);
  const prev = prevPlaceFor(S.editor?.trip, S.editor?.stop); if (prev && $('#e-km').value === '') $('#e-km').placeholder = `auto: ~${haversine(prev, p)} km`;
});

// ---------- story ----------
function renderStoryPicker() {
  const box = $('#story-years'); box.innerHTML = ''; const ys = years();
  $('#story-years-empty').hidden = ys.length > 0;
  [...ys, 'all'].forEach(y => { if (y === 'all' && ys.length < 2) return; const b = document.createElement('button'); b.className = 'chip'; b.textContent = y === 'all' ? 'Since he was born' : y; b.onclick = () => playStory(y); box.appendChild(b); });
}
function storyData(y, trips, child, homeP) {
  trips = [...trips].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const stops = trips.flatMap(t => t.stops.map(s => ({ ...s, trip: t })));
  const km = stops.reduce((a, s) => a + (s.km_from_prev || 0), 0);
  const nights = trips.reduce((a, t) => a + Math.round((new Date(t.end_date) - new Date(t.start_date)) / 86400000), 0);
  const places = new Set(stops.map(s => s.place?.id).filter(Boolean)), states = new Set(stops.map(s => s.place?.state).filter(Boolean)), countries = new Set(stops.map(s => s.place?.country).filter(Boolean));
  const modes = [...new Set(stops.map(s => s.mode_to_here))];
  const firsts = stops.flatMap(s => (s.milestones || []).map(m => ({ ...m, stop: s })));
  const far = homeP ? stops.map(s => ({ s, d: s.place ? haversine(homeP, s.place) : 0 })).sort((a, b) => b.d - a.d)[0] : null;
  return { y, trips, stops, km, nights, places: places.size, states: states.size, countries: countries.size, modes, firsts, far,
    ageFrom: trips.length ? ageLabel(child.dob, trips[0].start_date) : '', ageTo: trips.length ? ageLabel(child.dob, trips[trips.length - 1].end_date) : '' };
}
function playStory(y, opts = {}) {
  const child = opts.child || S.child, homeP = opts.home || home();
  const d = storyData(y, opts.trips || tripsForYear(y), child, homeP);
  if (!d.trips.length) return toast('No trips in ' + y);
  const P = $('#player'); P.hidden = true; P.hidden = false;
  if (!S.player) {
    S.player = new maplibregl.Map({ container: 'player-map', style: MAP_STYLE, center: [60, 10], zoom: 1.2, interactive: false, attributionControl: { compact: true } });
    S.player.on('style.load', () => { try { S.player.setProjection({ type: 'globe' }); } catch (e) { /* older build: flat map */ } });
  }
  const map = S.player, ov = $('#player-overlay'), dots = $('#player-dots');
  let markers = [];
  const clearMarkers = () => { markers.forEach(m => m.remove()); markers = []; if (map.getLayer('arc')) { map.removeLayer('arc'); map.removeSource('arc'); } };
  const name = child?.name || 'He';
  const yearWord = y === 'all' ? 'Since he was born' : String(y);
  const scenes = [
    // 1 opening
    () => { map.stop(); map.jumpTo({ center: [60, 10], zoom: 1.0, pitch: 0, bearing: 0 }); spin(map);
      ov.innerHTML = `<div class="scene center"><div class="eyebrow">${esc(name)}</div><div class="big">${esc(yearWord)}</div><div class="line">${d.ageFrom === d.ageTo ? `He was ${esc(d.ageFrom)} old.` : `He was ${esc(d.ageFrom)} old when it started and ${esc(d.ageTo)} by the end.`}</div></div>`; },
    // 2 the year on the map
    () => { map.stop(); clearMarkers();
      const pts = d.stops.filter(s => s.place).map(s => [s.place.lng, s.place.lat]); if (homeP) pts.push([homeP.lng, homeP.lat]);
      const b = pts.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
      map.fitBounds(b, { padding: { top: 80, bottom: 260, left: 40, right: 40 }, maxZoom: 9, duration: 2200, pitch: 30 });
      if (homeP) markers.push(new maplibregl.Marker({ element: el('pin home') }).setLngLat([homeP.lng, homeP.lat]).addTo(map));
      d.stops.forEach((s, i) => setTimeout(() => { if (!s.place) return; const e = el('pin'); const cv = cover(s.trip, s.id); if (cv) e.style.backgroundImage = `url("${mediaUrl(cv.storage_path)}")`; else e.textContent = s.place.name[0]; markers.push(new maplibregl.Marker({ element: e }).setLngLat([s.place.lng, s.place.lat]).addTo(map)); }, 900 + i * 350));
      if (homeP && d.stops.length) addArcs(map, homeP, d.stops);
      ov.innerHTML = `<div class="scene"><h2>${esc(yearWord)} on the map</h2><div class="kv"><div><b>${d.trips.length}</b><span>trip${d.trips.length === 1 ? '' : 's'}</span></div><div><b>${d.places}</b><span>place${d.places === 1 ? '' : 's'}</span></div><div><b>${d.states}</b><span>state${d.states === 1 ? '' : 's'}</span></div><div><b>${d.km.toLocaleString('en-IN')}</b><span>km</span></div><div><b>${d.nights}</b><span>night${d.nights === 1 ? '' : 's'} away</span></div></div><p class="muted">${esc(d.modes.map(m => MODE_WORDS[m] || m).join(', '))}${d.far?.s.place ? ` · farthest from home: ${esc(d.far.s.place.name)}, about ${d.far.d} km` : ''}</p></div>`; },
    // 3 entry by entry (one scene per entry)
    ...d.stops.map((s, i) => () => { map.stop(); clearMarkers();
      if (s.place) { map.flyTo({ center: [s.place.lng, s.place.lat], zoom: s.place.kind === 'city' ? 9 : 12, pitch: 45, bearing: (i * 37) % 60 - 30, duration: 2400, essential: true }); const e = el('pin'); const cv = cover(s.trip, s.id); if (cv) e.style.backgroundImage = `url("${mediaUrl(cv.storage_path)}")`; else e.textContent = s.place.name[0]; markers.push(new maplibregl.Marker({ element: e }).setLngLat([s.place.lng, s.place.lat]).addTo(map)); }
      const cv = cover(s.trip, s.id);
      ov.innerHTML = `<div class="scene">${cv ? `<img class="cover" src="${mediaUrl(cv.storage_path)}" alt="">` : ''}<div class="eyebrow">${esc(s.trip.title)} · ${fmtDate(s.arrived_on || s.trip.start_date)}</div><h2>${esc(s.place?.name || '')}</h2><p><b>${esc(ageLabel(child.dob, s.arrived_on || s.trip.start_date))}</b> old · ${esc(MODE_WORDS[s.mode_to_here] || s.mode_to_here)}${s.km_from_prev ? `, about ${s.km_from_prev} km` : ''}${s.stayed_at ? ` · stayed at ${esc(s.stayed_at)}` : ''}</p>${s.what_we_did ? `<p>${esc(s.what_we_did)}</p>` : ''}${s.what_he_saw ? `<p>${esc(name)}: ${esc(s.what_he_saw)}</p>` : ''}${s.what_he_hated ? `<p class="muted">Hated: ${esc(s.what_he_hated)}</p>` : ''}${s.memory ? `<div class="line">“${esc(s.memory)}”</div>` : ''}</div>`; }),
    // 4 firsts
    ...(d.firsts.length ? [() => { map.stop(); clearMarkers(); map.easeTo({ pitch: 60, zoom: Math.max(map.getZoom() - 2, 4), duration: 1500 });
      ov.innerHTML = `<div class="scene"><h2>Firsts</h2><div class="firsts">${d.firsts.map((f, i) => `<div class="first" style="animation-delay:${i * .25}s"><b>${esc(FIRSTS.find(x => x[0] === f.kind)?.[1] || f.kind)}</b><div class="muted small">${esc(f.stop.place?.name || '')} · ${esc(ageLabel(child.dob, f.stop.arrived_on || f.stop.trip.start_date))}${f.note ? ' · ' + esc(f.note) : ''}</div></div>`).join('')}</div></div>`; }] : []),
    // 5 how far
    () => { map.stop(); clearMarkers(); map.easeTo({ pitch: 0, zoom: 3.2, center: homeP ? [homeP.lng, homeP.lat] : INDIA.center, duration: 1800 });
      const total = S.trips.length ? S.trips.flatMap(t => t.stops).reduce((a, s) => a + (s.km_from_prev || 0), 0) : d.km;
      ov.innerHTML = `<div class="scene"><h2>How far he has come</h2>${arcsSvg(d, homeP)}<div class="kv"><div><b>${d.km.toLocaleString('en-IN')}</b><span>km ${esc(yearWord === 'all' ? 'so far' : 'in ' + yearWord)}</span></div>${y !== 'all' && !opts.trips ? `<div><b>${total.toLocaleString('en-IN')}</b><span>km since birth</span></div>` : ''}</div></div>`; },
    // 6 photo wall
    () => { map.stop(); clearMarkers();
      const imgs = d.trips.flatMap(t => t.media.map(m => ({ m, t })));
      ov.innerHTML = `<div class="scene"><h2>The photos</h2>${imgs.length ? `<div class="wall">${imgs.map(({ m, t }) => `<a href="${esc(t.album_url || mediaUrl(m.storage_path))}" target="_blank" rel="noopener"><img src="${mediaUrl(m.storage_path)}" alt="${esc(t.title)}"></a>`).join('')}</div>` : '<p class="muted">No covers yet.</p>'}<p class="muted small">Each opens the trip's album. Made by Appa.</p></div>`; }
  ];
  let i = 0;
  const go = n => { i = Math.max(0, Math.min(scenes.length - 1, n)); dots.innerHTML = scenes.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join(''); scenes[i](); $('#player-prev').disabled = i === 0; $('#player-next').textContent = i === scenes.length - 1 ? 'Again' : 'Next'; };
  $('#player-next').onclick = () => go(i === scenes.length - 1 ? 0 : i + 1);
  $('#player-prev').onclick = () => go(i - 1);
  $('#player-exit').onclick = () => { map.stop(); clearMarkers(); P.hidden = true; if (opts.onExit) opts.onExit(); };
  let x0 = null; P.ontouchstart = e => x0 = e.touches[0].clientX; P.ontouchend = e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 60) go(dx < 0 ? i + 1 : i - 1); x0 = null; };
  document.onkeydown = e => { if (P.hidden) return; if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); if (e.key === 'Escape') $('#player-exit').click(); };
  const start = () => { map.resize(); go(0); };
  if (map.loaded()) start(); else map.once('load', start);
  function el(cls) { const e = document.createElement('div'); e.className = cls; return e; }
}
function spin(map) {
  let on = true; map.once('movestart', () => { on = false; });
  const step = () => { if (!on || $('#player').hidden) return; const c = map.getCenter(); c.lng += 0.25; map.jumpTo({ center: c }); requestAnimationFrame(step); };
  requestAnimationFrame(step);
  map._spinStop = () => on = false;
}
function addArcs(map, homeP, stops) {
  const feats = stops.filter(s => s.place).map(s => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: arc([homeP.lng, homeP.lat], [s.place.lng, s.place.lat]) } }));
  map.addSource('arc', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
  map.addLayer({ id: 'arc', type: 'line', source: 'arc', paint: { 'line-color': '#f2b544', 'line-width': 2, 'line-opacity': 0.8 } });
}
function arc(a, b, n = 40) { const out = []; for (let i = 0; i <= n; i++) { const t = i / n; const lng = a[0] + (b[0] - a[0]) * t, lat = a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * Math.min(3, Math.abs(b[0] - a[0]) * 0.12); out.push([lng, lat]); } return out; }
function arcsSvg(d, homeP) {
  if (!homeP) return '';
  const items = d.stops.filter(s => s.place).map(s => ({ name: s.place.name, km: haversine(homeP, s.place), date: s.arrived_on || s.trip.start_date })).sort((a, b) => a.date.localeCompare(b.date));
  const max = Math.max(1, ...items.map(x => x.km)); const W = 520, H = 40 + items.length * 26;
  const rows = items.map((x, i) => { const y = 30 + i * 26, w = Math.max(4, (x.km / max) * (W - 200)); return `<text x="0" y="${y + 4}" fill="#a7ada8" font-size="12">${esc(x.name).slice(0, 22)}</text><path d="M150 ${y} q ${w / 2} -18 ${w} 0" stroke="#f2b544" stroke-width="2" fill="none" style="stroke-dasharray:${w * 1.2};stroke-dashoffset:${w * 1.2};animation:dash 1.2s ${i * .15}s ease forwards"/><text x="${150 + w + 6}" y="${y + 4}" fill="#f3ede2" font-size="12">${x.km} km</text>`; }).join('');
  return `<svg class="arcs" viewBox="0 0 ${W} ${H}" role="img" aria-label="Distance from home for each place"><style>@keyframes dash{to{stroke-dashoffset:0}}</style><text x="0" y="14" fill="#f2b544" font-size="12">From ${esc(homeP.name)}</text>${rows}</svg>`;
}

// ---------- settings ----------
function renderSettings() {
  $('#child-name').value = S.child?.name || ''; $('#child-dob').value = S.child?.dob || '';
  const h = home(); $('#child-home-current').textContent = h ? `Home today: ${h.name}, ${placeLine(h)}` : 'No home set yet.'; $('#child-home').value = ''; $('#child-home-json').value = '';
  const used = S.media.reduce((a, m) => a + (m.bytes || 0), 0); $('#storage-used').textContent = `${(used / 1048576).toFixed(1)} MB of 1,024 MB used · ${S.media.length} cover photo${S.media.length === 1 ? '' : 's'}`; $('#storage-bar').style.width = Math.min(100, used / 1073741824 * 100) + '%';
  $('#account-email').textContent = S.session?.user?.email || '';
  const list = $('#share-list'); const ys = years();
  list.innerHTML = `<div class="actions">${[...ys, 'all'].map(y => `<button class="btn" data-share-year="${y}" type="button">New link: ${y === 'all' ? 'everything' : y}</button>`).join('')}</div>` +
    S.shares.filter(s => !s.revoked_at).map(s => `<div class="share-row"><div><b>${s.year || 'Everything'}</b> · ${fmtDate(s.created_at.slice(0, 10))}<br><code>${location.origin}${location.pathname}?s=${s.token}</code></div><div class="actions"><button class="btn" data-copy="${s.token}" type="button">Copy</button><button class="btn danger" data-revoke="${s.id}" type="button">Revoke</button></div></div>`).join('');
  $$('[data-share-year]').forEach(b => b.onclick = async () => { const y = b.dataset.shareYear; const { error } = await sb.from('share_link').insert({ child_id: S.child.id, year: y === 'all' ? null : +y }); if (error) return toast(error.message); await refresh(); renderSettings(); toast('Link created'); });
  $$('[data-copy]').forEach(b => b.onclick = async () => { const url = `${location.origin}${location.pathname}?s=${b.dataset.copy}`; try { await navigator.clipboard.writeText(url); toast('Copied'); } catch (e) { prompt('Copy this link', url); } });
  $$('[data-revoke]').forEach(b => b.onclick = async () => { const { error } = await sb.from('share_link').update({ revoked_at: new Date().toISOString() }).eq('id', b.dataset.revoke); if (error) return toast(error.message); await refresh(); renderSettings(); toast('Link revoked'); });
}
$('#child-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const payload = { name: $('#child-name').value.trim(), dob: $('#child-dob').value, updated_at: new Date().toISOString() };
    const hj = $('#child-home-json').value; if (hj) payload.home_place_id = (await ensurePlace(JSON.parse(hj))).id;
    const { error } = await sb.from('child').update(payload).eq('id', S.child.id); if (error) throw error;
    await refresh(); renderSettings(); toast('Saved');
  } catch (err) { toast(err.message); }
});
wirePlaceSearch('#child-home', '#child-home-results', '#child-home-json');
$('#btn-signout').onclick = async () => { await sb.auth.signOut(); location.reload(); };

// ---------- auth + boot ----------
async function refresh() { await loadAll(); renderYearChips(); renderMarkers(); if (!$('#view-timeline').hidden) renderTimeline(); }
$('#auth-form').addEventListener('submit', async e => {
  e.preventDefault(); const email = $('#auth-email').value.trim();
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  $('#auth-msg').textContent = error ? error.message : `Link sent to ${email}. Open it on this device.`;
});
$('#setup-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const hj = $('#setup-home-json').value; const hp = hj ? await ensurePlace(JSON.parse(hj)) : null;
    const { error } = await sb.from('child').insert({ name: $('#setup-name').value.trim(), dob: $('#setup-dob').value, home_place_id: hp?.id || null }); if (error) throw error;
    await boot();
  } catch (err) { toast(err.message); }
});
wirePlaceSearch('#setup-home', '#setup-home-results', '#setup-home-json');
$$('#bottomnav button').forEach(b => b.onclick = () => show(b.dataset.view));
$('#fab').onclick = () => openEditor();
$('#scrim').onclick = closeSheet;

async function shareMode(token) {
  $$('.view').forEach(v => v.hidden = true);
  const { data, error } = await sb.rpc('story_for_token', { p_token: token });
  if (error || !data) { document.body.innerHTML = `<div class="auth-card"><div class="eyebrow">Baby Travel Map</div><h1>This link is not live.</h1><p class="muted">It may have been revoked. Ask for a new one.</p></div>`; return; }
  const trips = (data.trips || []).map(t => ({ ...t, stops: (t.stops || []).map(s => ({ ...s, milestones: s.milestones || [] })), media: t.media || [] }));
  // Ages come precomputed from the server; the child's date of birth never leaves the database on this path.
  const child = { name: data.child_name, dob: null };
  const all = trips.flatMap(t => [[t.start_date, t.age], ...t.stops.map(s => [s.arrived_on || t.start_date, s.age])]);
  ageLabelImpl = (_dob, on) => { const hit = all.find(([d]) => d === on); return hit ? hit[1] : ''; };
  document.body.classList.add('share');
  playStory(data.year || 'all', { trips, child, home: data.home, onExit: () => location.href = location.pathname });
}

async function boot() {
  const u = new URL(location.href); const token = u.searchParams.get('s');
  if (token) return shareMode(token);
  const { data: { session } } = await sb.auth.getSession(); S.session = session;
  sb.auth.onAuthStateChange((_e, s) => { if (!!s !== !!S.session) location.reload(); });
  if (!session) { $('#view-auth').hidden = false; return; }
  if (session.user.email !== OWNER_EMAIL) { $('#view-auth').hidden = false; $('#auth-msg').textContent = 'This map belongs to another account.'; await sb.auth.signOut(); return; }
  if (location.hash) history.replaceState(null, '', location.pathname);
  try { await loadAll(); } catch (e) { $('#view-auth').hidden = false; $('#auth-msg').textContent = 'Could not read the database: ' + (e.message || e) + '. If this is the first run, the "memories" schema must be exposed in Supabase → Project Settings → API.'; return; }
  if (!S.child) { $('#view-auth').hidden = true; $('#view-setup').hidden = false; return; }
  $('#view-setup').hidden = true; $('#view-auth').hidden = true;
  $('#topbar').hidden = false; $('#main').hidden = false; $('#bottomnav').hidden = false; $('#fab').hidden = false;
  $('#brand-name').textContent = `${S.child.name}'s map`;
  renderYearChips(); initMap(); show('map');
}
boot();
})();
