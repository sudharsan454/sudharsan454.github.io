/* Baby Travel Map · app logic · v2.3 · 13 Oct 2026 · v2.3: 'Stayed the night here' (family home / hotel / homestay, nights from the dates) plays as a night in the story: the stay icon pops up, the map fades to night with stars and a moon, the window lights, then dawn before the next leg; weather per entry (12 options, chosen by hand) plays as rain, drizzle, storm, snow, wind, fog, cloud, heat, cold and haze over the map, and shows on cards. v2.2 · 13 Oct 2026 · v2.2: People. Add the people in his life (name, relationship, photo) in Settings or the new People tab; tap their faces on a trip to say who came along; the People tab shows everyone across all trips; trips, the timeline, the trip story, the year story and the family link show the faces. v2.1 · 13 Oct 2026 · v2.1: a trip starts from home (or an optional 'Started from' place) and can close the loop: 'Back home after this' on the last entry asks how you reached home, when and how far; the ride, the map route, the trip sheet and every km total include the way back. v2.0 · 13 Oct 2026 · v2.0: his profile photo (Settings); 'Play this trip' and the year story move him along a dotted route from home through each place, sitting in the actual vehicle (car, train, plane, bus, boat, two-wheeler, pram for on foot) with his face in the window; the open trip's route is drawn dotted on the main map. v1.9 · 13 Oct 2026 · v1.9: 'The story should linger here' checkbox removed (it did nothing in the story); the highlight column is no longer written. v1.8 · 13 Oct 2026 · v1.8: date pickers no longer block or move dates (no min/max, no auto-clamping); a new entry fills only Arrived (= the day the previous entry ended), Left stays empty; all date rules run at Save; an entry outside its trip offers 'Extend the trip and save'. v1.7 · 13 Oct 2026 · v1.7: trip cover photo (in the trip form) + entry cover (an entry's own photo wins wherever that entry is shown; falls back to the trip cover, then the place's first letter); 'Make cover' on entry thumbnails; one pin per place shows the latest visit's cover; deleting an entry deletes its photos. v1.6 · 13 Oct 2026 · v1.6: a new entry starts on the day the previous entry ended; one info line under the dates shows the previous entry's place and dates, with a tap to start from it. v1.5 · 13 Oct 2026 · v1.5: Reorder now saves (v1.4 changed the order in memory before comparing, so nothing was written) and re-reads to confirm; dates are validated as you pick them: To/Left can't be before From/Arrived, and an entry's dates must sit inside its trip's From–To; trip dates no longer change on their own. v1.4 · 13 Oct 2026 · v1.4: entries always in date order (same-day entries in your chosen order) in the trip, the editor and the story; Reorder mode in the trip sheet; trip dates follow its entries; 'Left' before 'Arrived' is refused; km recalculated after a reorder unless you typed it. v1.3 · 12 Oct 2026 · v1.3: places the geocoder does not know (villages like Vallichunai) can be added by hand: pick the nearest town, tap the map, done. v1.2 · 12 Oct 2026 · v1.2: 'What he ate' on every entry; 'Another first' and purpose 'Other' open a text box for your own words. v1.1 · 12 Oct 2026 · v1.1: retry the first load up to 3 times (Supabase can reject a token for ~1 s after sign-in with 'JWT issued at future'); clearer error text. v1.0 · 10 Oct 2026 · Claude for Sudharsan R
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

// ---------- entry order: date first, then your order within the same day ----------
const entryDay = (s, trip) => s.arrived_on || trip?.start_date || '';
function sortStops(stops, trip) {
  return [...stops].sort((a, b) => entryDay(a, trip).localeCompare(entryDay(b, trip)) || (a.seq - b.seq) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
}
// After entries move: renumber 1..n, recalc km for entries whose km was the auto (straight-line) figure, fit the trip dates to its entries.
async function normaliseTrip(trip, before) {
  const stops = sortStops(trip.stops, trip);
  const origSeq = new Map((before || stops).map(s => [s.id, s._origSeq ?? s.seq]));
  const oldPrev = new Map(); (before || stops).forEach((s, i) => oldPrev.set(s.id, i > 0 ? (before || stops)[i - 1].place : tripStart(trip)));
  const writes = [];
  stops.forEach((s, i) => {
    const prev = i > 0 ? stops[i - 1].place : tripStart(trip);
    const patch = {};
    if (origSeq.get(s.id) !== i + 1) patch.seq = i + 1;
    const op = oldPrev.get(s.id);
    const wasAuto = !op ? s.km_from_prev === 0 : (s.place && s.km_from_prev === haversine(op, s.place));
    if (wasAuto && s.place) { const k = prev ? haversine(prev, s.place) : 0; if (k !== s.km_from_prev) patch.km_from_prev = k; }
    if (Object.keys(patch).length) writes.push(sb.from('trip_stop').update(patch).eq('id', s.id));
  });
  for (const w of writes) { const r = await w; if (r.error) throw r.error; }
  const fresh = (await sb.from('trip_stop').select('km_from_prev').eq('trip_id', trip.id)).data || [];
  const r = await sb.from('trip').update({ km_total: fresh.reduce((a, s) => a + (s.km_from_prev || 0), 0) + returnKm(trip) }).eq('id', trip.id); if (r.error) throw r.error;
}

// ---------- state ----------
const S = { session: null, child: null, people: [], tripPeople: [], places: [], trips: [], media: [], milestones: [], shares: [], year: 'all', map: null, markers: [], editor: null, player: null };

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
    const q = input.value.trim();
    if (q.length >= 2) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'manual';
      b.innerHTML = `Not in the list? <b>Add “${esc(q)}” by hand</b><small>pick the nearest town, then tap the map where it is</small>`;
      b.onclick = () => openManualPlace(q, p => { hidden.value = JSON.stringify(p); input.value = p.name; box.innerHTML = ''; onPick && onPick(p); });
      box.appendChild(b);
    }
  }
  function btn(p, sub) {
    const b = document.createElement('button'); b.type = 'button';
    b.innerHTML = `${esc(p.name)}<small>${esc(sub)}</small>`;
    b.onclick = () => { hidden.value = JSON.stringify(p); input.value = p.name; box.innerHTML = ''; onPick && onPick(p); };
    return b;
  }
}

// ---------- manual place (for villages the geocoder does not know) ----------
const PA = { map: null, marker: null, near: null, lat: null, lng: null, done: null };
function openManualPlace(name, done) {
  PA.done = done; PA.near = null; PA.lat = null; PA.lng = null;
  $('#pa-name').value = name; $('#pa-near').value = ''; $('#pa-near-results').innerHTML = ''; $('#pa-near-picked').textContent = '';
  $('#pa-city').value = ''; $('#pa-district').value = ''; $('#pa-state').value = ''; $('#pa-country').value = 'India';
  $('#pa-coords').textContent = 'No pin yet. Pick a town above, then tap the map.';
  $('#placeadd').hidden = false;
  if (!PA.map) {
    PA.map = new maplibregl.Map({ container: 'pa-map', style: MAP_STYLE, center: INDIA.center, zoom: INDIA.zoom, attributionControl: { compact: true } });
    PA.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    PA.map.on('click', e => setManualPin(e.lngLat.lng, e.lngLat.lat));
  } else { PA.map.jumpTo({ center: INDIA.center, zoom: INDIA.zoom }); if (PA.marker) { PA.marker.remove(); PA.marker = null; } }
  setTimeout(() => PA.map.resize(), 60);
}
function setManualPin(lng, lat) {
  PA.lat = +lat.toFixed(6); PA.lng = +lng.toFixed(6);
  if (!PA.marker) { const el = document.createElement('div'); el.className = 'pin'; el.textContent = ($('#pa-name').value || '?').slice(0, 1); PA.marker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([lng, lat]).addTo(PA.map); PA.marker.on('dragend', () => { const ll = PA.marker.getLngLat(); setManualPin(ll.lng, ll.lat); }); }
  else PA.marker.setLngLat([lng, lat]);
  const h = home(); $('#pa-coords').textContent = `Pin at ${PA.lat}, ${PA.lng}` + (h ? ` · about ${haversine(h, { lat: PA.lat, lng: PA.lng })} km from home` : '') + '. Drag the pin to adjust.';
}
(() => {
  const input = $('#pa-near'), box = $('#pa-near-results'); let t;
  input.addEventListener('input', () => { clearTimeout(t); const q = input.value.trim(); if (q.length < 3) { box.innerHTML = ''; return; }
    t = setTimeout(async () => { const r = await geocode(q); if (input.value.trim() !== q) return; box.innerHTML = '';
      r.forEach(p => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `${esc(p.name)}<small>${esc(placeLine(p))}</small>`; b.onclick = () => pickNear(p); box.appendChild(b); }); }, 350); });
  function pickNear(p) {
    PA.near = p; input.value = p.name; box.innerHTML = ''; $('#pa-near-picked').textContent = placeLine(p);
    const townish = /city|town|village|suburb|hamlet|locality|municipality/.test(p.kind || '');
    $('#pa-city').value = townish ? p.name : (p.city || p.name); $('#pa-district').value = p.district || ''; $('#pa-state').value = p.state || ''; $('#pa-country').value = p.country || 'India';
    PA.map.flyTo({ center: [p.lng, p.lat], zoom: 12, duration: 1200 });
  }
  $('#pa-cancel').onclick = () => { $('#placeadd').hidden = true; };
  $('#pa-use').onclick = () => {
    const name = $('#pa-name').value.trim(); if (!name) return toast('Give the place a name');
    if (PA.lat === null) return toast('Tap the map where it is');
    const place = { name, locality: name, city: $('#pa-city').value.trim() || null, district: $('#pa-district').value.trim() || null, state: $('#pa-state').value.trim() || null, country: $('#pa-country').value.trim() || 'India', lat: PA.lat, lng: PA.lng, kind: 'custom', osm_ref: null };
    $('#placeadd').hidden = true; PA.done && PA.done(place);
  };
})();

// ---------- data ----------
async function loadAll() {
  const [c, p, t, s, m, ms, sh, pe, tp] = await Promise.all([
    sb.from('child').select('*').limit(1).maybeSingle(),
    sb.from('place').select('*'),
    sb.from('trip').select('*').order('start_date', { ascending: false }),
    sb.from('trip_stop').select('*').order('seq'),
    sb.from('media').select('*').order('created_at'),
    sb.from('milestone').select('*'),
    sb.from('share_link').select('*').order('created_at', { ascending: false }),
    sb.from('person').select('*').order('name'),
    sb.from('trip_person').select('trip_id,person_id')
  ]);
  for (const r of [c, p, t, s, m, ms, sh, pe, tp]) if (r.error) throw r.error;
  S.people = pe.data || []; S.tripPeople = tp.data || [];
  S.child = c.data; S.places = p.data; S.media = m.data; S.milestones = ms.data; S.shares = sh.data;
  const byPlace = Object.fromEntries(S.places.map(x => [x.id, x]));
  S.trips = t.data.map(tr => ({
    ...tr,
    stops: sortStops(s.data.filter(x => x.trip_id === tr.id).map(x => ({ ...x, place: byPlace[x.place_id], milestones: S.milestones.filter(mm => mm.stop_id === x.id) })), tr),
    media: S.media.filter(x => x.trip_id === tr.id),
    start_place: tr.start_place_id ? (byPlace[tr.start_place_id] || null) : null,
    people: S.tripPeople.filter(x => x.trip_id === tr.id).map(x => S.people.find(q => q.id === x.person_id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))
  }));
}
const years = () => [...new Set(S.trips.map(t => +t.start_date.slice(0, 4)))].sort();
const tripsForYear = y => y === 'all' ? S.trips : S.trips.filter(t => t.start_date.startsWith(String(y)));
// Covers. Trip-level photos have stop_id null; the trip cover is the one flagged is_cover.
// An entry's cover: its flagged photo, else its first photo, else the trip cover, else nothing (the place's first letter shows).
const entryPhotos = (trip, stopId) => trip.media.filter(m => m.stop_id === stopId);
const ownEntryCover = (trip, stopId) => { const ph = entryPhotos(trip, stopId); return ph.find(m => m.is_cover) || ph[0] || null; };
const tripOwnCover = trip => trip.media.find(m => !m.stop_id && m.is_cover) || null;
const tripCover = trip => tripOwnCover(trip) || trip.stops.map(s => ownEntryCover(trip, s.id)).find(Boolean) || null;
const entryCover = (trip, stopId) => ownEntryCover(trip, stopId) || tripOwnCover(trip);
const home = () => S.places.find(p => p.id === S.child?.home_place_id) || null;
// v2.1 where a trip starts (its own 'Started from', else home) and the way back home
const placeById = id => S.places.find(p => p.id === id) || null;
const tripStart = (trip, homeP = home()) => trip.start_place || (trip.start_place_id ? placeById(trip.start_place_id) : null) || homeP || null;
const lastStopPlace = trip => { const st = sortStops(trip.stops || [], trip).filter(x => x.place); return st.length ? st[st.length - 1].place : null; };
const returnKm = (trip, homeP = home()) => { if (!trip.return_mode) return 0; if (trip.return_km != null) return trip.return_km; const l = lastStopPlace(trip); return l && homeP ? haversine(l, homeP) : 0; };
// ---------- v2.2 people ----------
const RELATIONS = ['Amma', 'Appa', 'Paati', 'Thatha', 'Ammamma', 'Appappa', 'Chithi', 'Chithappa', 'Periyamma', 'Periyappa', 'Mama', 'Mami', 'Athai', 'Athimber', 'Anna', 'Akka', 'Cousin', 'Friend', 'Neighbour'];
const personPhoto = p => p?.photo_path ? mediaUrl(p.photo_path) : null;
const initialsOf = n => (n || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const hueOf = n => [...(n || '')].reduce((a, ch) => a + ch.charCodeAt(0) * 7, 0) % 360;
const avatarHtml = (p, cls = '') => { const u = personPhoto(p); return `<span class="pav ${cls}" style="${u ? `background-image:url('${esc(u)}')` : `background-color:hsl(${hueOf(p.name)} 42% 34%)`}" title="${esc(p.name)}${p.relationship ? ' · ' + esc(p.relationship) : ''}" aria-label="${esc(p.name)}">${u ? '' : esc(initialsOf(p.name))}</span>`; };
const facesHtml = (people, max = 5) => people.length ? `<span class="faces">${people.slice(0, max).map(x => avatarHtml(x, 'sm')).join('')}${people.length > max ? `<span class="pav sm more">+${people.length - max}</span>` : ''}</span>` : '';
const namesLine = people => { const n = people.map(x => x.name); return n.length <= 2 ? n.join(' and ') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1]; };
const tripsWith = pid => S.trips.filter(t => (t.people || []).some(x => x.id === pid)).sort((a, b) => a.start_date.localeCompare(b.start_date));
const tripKm = (trip, homeP = home()) => (trip.stops || []).reduce((a, x) => a + (x.km_from_prev || 0), 0) + returnKm(trip, homeP);

// ---------- views ----------
function show(view) {
  $$('#main .view').forEach(v => v.hidden = v.id !== 'view-' + view);
  $$('#bottomnav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('#fab').hidden = view === 'settings' || view === 'people';
  if (view === 'map' && S.map) setTimeout(() => S.map.resize(), 50);
  if (view === 'timeline') renderTimeline();
  if (view === 'story') renderStoryPicker();
  if (view === 'settings') renderSettings();
  if (view === 'people') renderPeople();
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
    const cv = visits.slice().sort((a, b) => entryDay(b.stop, b.trip).localeCompare(entryDay(a.stop, a.trip))).map(v => entryCover(v.trip, v.stop.id)).find(Boolean); // same place on several trips: the latest visit's cover
    if (cv) el.style.backgroundImage = `url("${mediaUrl(cv.storage_path)}")`; else el.textContent = p.name.slice(0, 1);
    if (visits.some(v => v.stop.stayed_overnight)) { const b = document.createElement('span'); b.className = 'stay-badge'; b.textContent = '🛏'; b.title = 'Stayed the night here'; el.appendChild(b); }
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
function closeSheet() { $('#sheet').hidden = true; $('#scrim').hidden = true; hideTripRoute(); }
function openPlaceSheet(p, visits) {
  const rows = visits.sort((a, b) => b.trip.start_date.localeCompare(a.trip.start_date)).map(({ trip, stop }) => {
    const cv = entryCover(trip, stop.id);
    return `<div class="visit" data-trip="${trip.id}">${cv ? `<img src="${mediaUrl(cv.storage_path)}" alt="">` : '<div class="ph"></div>'}
      <div><b>${esc(trip.title)}</b><div class="muted small">${fmtDate(stop.arrived_on || trip.start_date)} · ${MODE_WORDS[stop.mode_to_here] || stop.mode_to_here}</div></div>
      <div class="age">${ageLabel(S.child.dob, stop.arrived_on || trip.start_date)}</div></div>`;
  }).join('');
  openSheet(`<h2>${esc(p.name)}</h2><p class="muted">${esc(placeLine(p))} · ${visits.length} visit${visits.length > 1 ? 's' : ''}</p>${rows}`);
  $$('#sheet .visit').forEach(el => el.onclick = () => openTripSheet(S.trips.find(t => t.id === el.dataset.trip)));
}
function openTripSheet(trip, reorder = false) {
  if (reorder) return openReorder(trip);
  const km = tripKm(trip);
  const nights = Math.round((new Date(trip.end_date) - new Date(trip.start_date)) / 86400000);
  const entries = trip.stops.map((s, i) => {
    const thumbs = thumbsHtml(trip, s.id);
    const firsts = s.milestones.map(m => `<span class="chip on">${m.kind === 'other' && m.note ? 'First: ' + esc(m.note) : esc(FIRSTS.find(f => f[0] === m.kind)?.[1] || m.kind) + (m.note ? ': ' + esc(m.note) : '')}</span>`).join(' ');
    return `<div class="entry">
      <div class="top"><b>${i + 1}. ${esc(s.place?.name || '?')}</b><span class="age">${ageLabel(S.child.dob, s.arrived_on || trip.start_date)}</span></div>
      <div class="muted small">${fmtDate(s.arrived_on || trip.start_date)}${s.left_on ? ' – ' + fmtDate(s.left_on) : ''} · ${MODE_WORDS[s.mode_to_here] || s.mode_to_here}${s.km_from_prev ? ', about ' + s.km_from_prev + ' km' : ''}</div>
      <dl>${s.stayed_overnight ? `<dt>Night</dt><dd>${stayLine(s)}</dd>` : (s.stayed_at ? `<dt>Stayed</dt><dd>${esc(s.stayed_at)}</dd>` : '')}${(s.weather || []).length ? `<dt>Weather</dt><dd>${weatherLine(s.weather)}</dd>` : ''}${s.what_we_did ? `<dt>We did</dt><dd>${esc(s.what_we_did)}</dd>` : ''}${s.what_he_saw ? `<dt>He did</dt><dd>${esc(s.what_he_saw)}</dd>` : ''}${s.what_he_hated ? `<dt>He hated</dt><dd>${esc(s.what_he_hated)}</dd>` : ''}${s.what_he_ate ? `<dt>He ate</dt><dd>${esc(s.what_he_ate)}</dd>` : ''}</dl>
      ${s.memory ? `<div class="mem">“${esc(s.memory)}”</div>` : ''}
      ${firsts ? `<div class="chips wrap" style="margin-top:8px">${firsts}</div>` : ''}
      ${thumbs ? `<div class="thumbs">${thumbs}</div>` : ''}
      <div class="actions"><button class="btn" data-edit-stop="${s.id}" type="button">Edit entry</button></div>
    </div>`;
  }).join('');
  const tc = tripCover(trip);
  openSheet(`${tc ? `<img class="trip-cover" src="${mediaUrl(tc.storage_path)}" alt="">` : ''}<div class="trip-head"><div><h2>${esc(trip.title)}</h2><p class="muted">${fmtDate(trip.start_date)} – ${fmtDate(trip.end_date)} · ${esc(trip.purpose)}</p></div><span class="age">${ageLabel(S.child.dob, trip.start_date)}</span></div>
    ${trip.summary ? `<p>${esc(trip.summary)}</p>` : ''}${trip.start_place ? `<p class="muted small">Started from ${esc(trip.start_place.name)}</p>` : ''}
    <div class="stat-row"><span><b>${trip.stops.length}</b> entr${trip.stops.length === 1 ? 'y' : 'ies'}</span><span><b>${km}</b> km</span><span><b>${nights}</b> night${nights === 1 ? '' : 's'}</span></div>
    <div class="with-block"><div class="muted small">With him on this trip <span class="hint-inline">(tap a face to add or remove)</span></div><div id="trip-people" class="people-picker"></div></div>
    <div class="actions">${trip.album_url ? `<a class="btn" href="${esc(trip.album_url)}" target="_blank" rel="noopener">Open album</a>` : ''}${trip.stops.some(s => s.place) ? '<button class="btn primary" id="btn-play-trip" type="button">Play this trip</button>' : ''}<button class="btn" id="btn-add-entry-to" type="button">Add entry</button>${trip.stops.length > 1 ? '<button class="btn" id="btn-reorder" type="button">Reorder</button>' : ''}<button class="btn" id="btn-edit-trip" type="button">Edit trip</button><button class="btn danger" id="btn-del-trip" type="button">Delete trip</button></div>
    ${entries}${trip.return_mode ? `<div class="entry home-entry"><div class="top"><b>Back home${home() ? ' · ' + esc(home().name) : ''}</b></div><div class="muted small">${trip.return_on ? fmtDate(trip.return_on) + ' · ' : ''}${MODE_WORDS[trip.return_mode] || trip.return_mode}${returnKm(trip) ? ', about ' + returnKm(trip) + ' km' : ''}</div></div>` : ''}`);
  $$('#sheet [data-edit-stop]').forEach(b => b.onclick = () => openEditor({ trip, stop: trip.stops.find(s => s.id === b.dataset.editStop) }));
  wireMakeCover('#sheet', trip, () => openTripSheet(S.trips.find(t => t.id === trip.id) || trip));
  $('#btn-add-entry-to').onclick = () => openEditor({ trip, stop: null });
  if ($('#btn-play-trip')) $('#btn-play-trip').onclick = () => { closeSheet(); playStory('trip', { trips: [trip], tripMode: true }); };
  showTripRoute(trip);
  renderTripPeople(trip);
  if ($('#btn-reorder')) $('#btn-reorder').onclick = () => openReorder(trip);
  $('#btn-edit-trip').onclick = () => openEditor({ trip, stop: trip.stops[0] || null, tripOnly: true });
  $('#btn-del-trip').onclick = async () => {
    if (!(await confirmSheet(`Delete “${trip.title}” with its ${trip.stops.length} entries and ${trip.media.length} photos?`))) return;
    for (const m of trip.media) await sb.storage.from(BUCKET).remove([m.storage_path]);
    const { error } = await sb.from('trip').delete().eq('id', trip.id); if (error) return toast(error.message);
    closeSheet(); await refresh(); toast('Trip deleted');
  };
}
function openReorder(trip) {
  const before = sortStops(trip.stops, trip).map(s => ({ ...s, _origSeq: s.seq }));
  let list = before.map(s => ({ ...s }));
  const draw = () => {
    const rows = list.map((s, i) => {
      const day = entryDay(s, trip), upSame = i > 0 && entryDay(list[i - 1], trip) === day, downSame = i < list.length - 1 && entryDay(list[i + 1], trip) === day;
      const newDay = i === 0 || entryDay(list[i - 1], trip) !== day;
      return `${newDay ? `<div class="day-h">${fmtDate(day)}</div>` : ''}<div class="reorder-row"><span class="n">${i + 1}</span><div class="r-main"><b>${esc(s.place?.name || '?')}</b><div class="muted small">${MODE_WORDS[s.mode_to_here] || s.mode_to_here}${s.memory ? ' · “' + esc(s.memory.slice(0, 40)) + (s.memory.length > 40 ? '…' : '') + '”' : ''}</div></div>
        <button class="btn icon" data-up="${i}" type="button" aria-label="Move ${esc(s.place?.name || '')} up" ${upSame ? '' : 'disabled'}>↑</button><button class="btn icon" data-down="${i}" type="button" aria-label="Move ${esc(s.place?.name || '')} down" ${downSame ? '' : 'disabled'}>↓</button></div>`;
    }).join('');
    $('#sheet-body').innerHTML = `<h2>Reorder · ${esc(trip.title)}</h2>
      <p class="muted small">Entries always run in date order. Within one day, move them into the order they happened. To move an entry to another day, change its date with Edit entry.</p>
      ${rows}
      <div class="actions"><button class="btn primary" id="r-save" type="button">Save order</button><button class="btn" id="r-cancel" type="button">Cancel</button></div>`;
    $$('#sheet-body [data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up; [list[i - 1], list[i]] = [list[i], list[i - 1]]; draw(); $(`#sheet-body [data-up="${i - 1}"]`)?.focus(); });
    $$('#sheet-body [data-down]').forEach(b => b.onclick = () => { const i = +b.dataset.down; [list[i + 1], list[i]] = [list[i], list[i + 1]]; draw(); $(`#sheet-body [data-down="${i + 1}"]`)?.focus(); });
    $('#r-cancel').onclick = () => openTripSheet(trip);
    $('#r-save').onclick = async () => {
      const btn = $('#r-save'); btn.disabled = true;
      try {
        list.forEach((s, i) => s.seq = i + 1);
        await normaliseTrip({ ...trip, stops: list }, before);
        await refresh();
        const now = S.trips.find(x => x.id === trip.id);
        const ok = now && now.stops.map(s => s.id).join() === list.map(s => s.id).join();
        openTripSheet(now); toast(ok ? 'Order saved' : 'Saved, but the order on the server differs. Try again.', ok ? 2600 : 5000);
      } catch (e) { btn.disabled = false; toast(e.message || String(e), 4000); }
    };
  };
  $('#sheet').hidden = false; $('#scrim').hidden = false; draw();
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
    const cv = tripCover(t); const places = [...new Set(t.stops.map(s => s.place?.name).filter(Boolean))].join(' → ');
    html += `<div class="visit" data-trip="${t.id}">${cv ? `<img src="${mediaUrl(cv.storage_path)}" alt="">` : '<div class="ph"></div>'}<div><b>${esc(t.title)}</b><div class="muted small">${esc(places)}<br>${fmtDate(t.start_date)} · ${[...new Set(t.stops.map(s => MODE_WORDS[s.mode_to_here]))].join(', ')}</div>${facesHtml(t.people || [])}</div><div class="age">${ageLabel(S.child.dob, t.start_date)}</div></div>`;
  });
  box.innerHTML = html;
  $$('#timeline-list .visit').forEach(el => el.onclick = () => openTripSheet(S.trips.find(t => t.id === el.dataset.trip)));
}

// ---------- editor ----------
function buildFirsts(selected = []) {
  const box = $('#e-firsts'); box.innerHTML = '';
  FIRSTS.forEach(([k, label]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (selected.includes(k) ? ' on' : ''); b.dataset.kind = k; b.textContent = label; b.onclick = () => { b.classList.toggle('on'); syncFirstOther(); }; box.appendChild(b); });
  syncFirstOther();
}
function syncFirstOther() { const on = !!$('#e-firsts .chip.on[data-kind="other"]'); $('#e-first-other-wrap').hidden = !on; if (on) $('#e-first-other').focus(); }
function syncPurposeOther() { const other = $('#t-purpose').value === 'other'; $('#t-purpose-other-wrap').hidden = !other; }
$('#t-purpose').addEventListener('change', syncPurposeOther);
let pendingPhotos = [], pendingTripCover = null;
function openEditor({ trip = null, stop = null, tripOnly = false } = {}) {
  closeSheet();
  S.editor = { trip, stop, tripOnly }; pendingPhotos = []; pendingTripCover = null;
  $('#editor').hidden = false;
  $('#editor-title').textContent = trip ? (tripOnly ? 'Edit trip' : (stop ? 'Edit entry' : 'New entry')) : 'New trip';
  $('#fs-trip').hidden = !!(trip && !tripOnly);
  $('#fs-entry').hidden = !!tripOnly;
  $('#editor-more').hidden = !!(stop || tripOnly);
  $('#editor-danger').hidden = !(stop && !tripOnly);
  const today = new Date().toISOString().slice(0, 10);
  $('#t-title').value = trip?.title || ''; $('#t-start').value = trip?.start_date || today; $('#t-end').value = trip?.end_date || today;
  const knownPurposes = [...$('#t-purpose').options].map(o => o.value);
  const purpose = trip?.purpose || 'holiday';
  $('#t-purpose').value = knownPurposes.includes(purpose) ? purpose : 'other';
  $('#t-purpose-other').value = knownPurposes.includes(purpose) ? '' : purpose;
  syncPurposeOther();
  $('#t-album').value = trip?.album_url || ''; $('#t-summary').value = trip?.summary || '';
  pendingPeople = new Set((trip?.people || []).map(x => x.id)); renderFormPeople();
  $('#t-from').value = ''; $('#t-from-results').innerHTML = ''; $('#t-from-json').value = trip?.start_place ? JSON.stringify(trip.start_place) : ''; renderFromLine();
  $('#entry-legend').textContent = stop ? `Entry ${(trip.stops.findIndex(s => s.id === stop.id) + 1)}` : `Entry ${(trip?.stops.length || 0) + 1}`;
  $('#e-place').value = stop?.place?.name || ''; $('#e-place-json').value = stop?.place ? JSON.stringify(stop.place) : ''; $('#e-place-picked').textContent = stop?.place ? placeLine(stop.place) : ''; $('#e-place-results').innerHTML = '';
  // The entry just before this one in date order (for a new entry: the last one in the trip).
  const ordered = trip ? sortStops(trip.stops, trip) : [];
  const idx = stop ? ordered.findIndex(s => s.id === stop.id) : ordered.length;
  const prevStop = idx > 0 ? ordered[idx - 1] : null;
  const lastStop = prevStop;
  const nextDay = prevStop ? (prevStop.left_on || prevStop.arrived_on || trip.start_date) : (trip?.start_date || today);
  S.editorPrev = prevStop;
  $('#e-arrived').value = stop?.arrived_on || nextDay; $('#e-left').value = stop?.left_on || ''; // Left is yours to fill
  delete $('#e-arrived').dataset.touched;
  $('#e-mode').value = stop?.mode_to_here || 'car'; $('#e-km').value = stop?.km_from_prev ?? '';
  $('#e-overnight').checked = !!stop?.stayed_overnight; delete $('#e-overnight').dataset.touched; delete $('#e-stay-kind').dataset.touched;
  stayKind = stop?.stay_kind || guessStayKind(stop?.stayed_at); pendingWeather = new Set(stop?.weather || []); renderWeatherChips();
  $('#e-stayed').value = stop?.stayed_at || ''; $('#e-did').value = stop?.what_we_did || ''; $('#e-saw').value = stop?.what_he_saw || ''; $('#e-hated').value = stop?.what_he_hated || ''; $('#e-ate').value = stop?.what_he_ate || ''; $('#e-memory').value = stop?.memory || '';
  $('#e-first-other').value = stop ? (stop.milestones.find(m => m.kind === 'other')?.note || '') : '';
  buildFirsts(stop ? stop.milestones.map(m => m.kind) : []);
  $('#e-photos').value = ''; renderEditorThumbs();
  $('#t-cover').value = ''; const tcv = trip ? tripOwnCover(trip) : null; $('#t-cover-preview').innerHTML = tcv ? `<img src="${mediaUrl(tcv.storage_path)}" alt="">` : '';
  applyDateLimitsSoft();
  syncStay();
  renderPrevInfo(trip, prevStop);
  // 'Back home after this': only on a new entry or the trip's last entry by date
  const isLast = !stop || (ordered.length && ordered[ordered.length - 1].id === stop.id);
  $('#e-home-wrap').hidden = !isLast;
  $('#e-home').checked = !!trip?.return_mode;
  $('#e-home-mode').value = trip?.return_mode || stop?.mode_to_here || 'car';
  $('#e-home-on').value = trip?.return_on || '';
  $('#e-home-km').value = trip?.return_km ?? '';
  syncHomeBlock();
  $('#t-title').focus();
}
// v2.3 overnight + weather in the entry form
let stayKind = 'home', pendingWeather = new Set();
function syncStay() {
  const on = $('#e-overnight').checked; $('#e-stay-kind').hidden = !on;
  $$('#e-stay-kind [data-kind]').forEach(b => b.classList.toggle('on', b.dataset.kind === stayKind));
  const a = $('#e-arrived').value, l = $('#e-left').value;
  const n = on ? ((a && l && l > a) ? Math.round((new Date(l) - new Date(a)) / 86400000) : 1) : 0;
  $('#e-nights-hint').textContent = on ? `${n} night${n === 1 ? '' : 's'}${(a && l && l > a) ? ' (from Arrived and Left)' : (l ? '' : ' (set Left for more)')}` : '';
}
function autoOvernight() { if ($('#e-overnight').dataset.touched) return; const a = $('#e-arrived').value, l = $('#e-left').value; $('#e-overnight').checked = !!(a && l && l > a); syncStay(); }
$('#e-overnight').addEventListener('change', () => { $('#e-overnight').dataset.touched = '1'; syncStay(); });
['#e-arrived', '#e-left'].forEach(id => $(id).addEventListener('change', autoOvernight));
$('#e-stayed').addEventListener('input', () => { if (!$('#e-stay-kind').dataset.touched) { stayKind = guessStayKind($('#e-stayed').value); syncStay(); } });
$$('#e-stay-kind [data-kind]').forEach(b => b.onclick = () => { stayKind = b.dataset.kind; $('#e-stay-kind').dataset.touched = '1'; syncStay(); });
function renderWeatherChips() {
  const box = $('#e-weather'); box.innerHTML = WEATHER.map(([k, e, l]) => `<button type="button" class="chip${pendingWeather.has(k) ? ' on' : ''}" data-wx="${k}" aria-pressed="${pendingWeather.has(k)}">${e} ${l}</button>`).join('');
  $$('#e-weather [data-wx]').forEach(b => b.onclick = () => { const k = b.dataset.wx; pendingWeather.has(k) ? pendingWeather.delete(k) : pendingWeather.add(k); renderWeatherChips(); });
}
function renderFromLine() {
  const f = formStart(), h = home(), box = $('#t-from-current');
  box.innerHTML = f ? `Starts from <b>${esc(f.name)}</b>. <button type="button" class="linkbtn" id="t-from-clear">Start from home instead</button>` : (h ? `Starts from home, ${esc(h.name)}.` : 'Starts from home (set Home in Settings).');
  if ($('#t-from-clear')) $('#t-from-clear').onclick = () => { $('#t-from-json').value = ''; renderFromLine(); };
}
function syncHomeBlock() {
  const on = $('#e-home').checked; $('#e-home-fields').hidden = !on;
  if (on && !$('#e-home-on').value) $('#e-home-on').value = $('#e-left').value || $('#e-arrived').value || '';
  const h = home(), pj = $('#e-place-json').value; let here = null; try { here = pj ? JSON.parse(pj) : null; } catch (e) { /* none */ }
  $('#e-home-km').placeholder = h && here ? `auto: ~${haversine(here, h)} km` : 'auto';
  $('#e-home-hint').textContent = h ? `Back to ${h.name}. The ride and the map close the loop.` : 'Set Home in Settings so the trip can end there.';
  markDates();
}
$('#e-home').addEventListener('change', syncHomeBlock);
$('#e-home-on').addEventListener('change', markDates);
function renderPrevInfo(trip, prevStop) {
  const box = $('#e-prev-info');
  if (!trip) { box.textContent = ''; box.hidden = true; return; }
  box.hidden = false;
  if (!prevStop) { box.innerHTML = `First entry of this trip · trip runs ${fmtDate(trip.start_date)} – ${fmtDate(trip.end_date)}`; return; }
  const a = prevStop.arrived_on || trip.start_date, l = prevStop.left_on || a;
  box.innerHTML = `Previous: <b>${esc(prevStop.place?.name || '?')}</b> · ${fmtDate(a)}${l !== a ? ' – ' + fmtDate(l) : ''} <button type="button" class="linkbtn" id="e-prev-use">Start on ${fmtDate(l)}</button>`;
  $('#e-prev-use').onclick = () => { $('#e-arrived').value = l; $('#e-arrived').dataset.touched = '1'; if ($('#e-left').value && $('#e-left').value < l) $('#e-left').value = ''; markDates(); };
}
// ---------- covers: thumbnails with "Make cover" ----------
function thumbsHtml(trip, stopId) {
  const ph = entryPhotos(trip, stopId); if (!ph.length) return '';
  const cv = ownEntryCover(trip, stopId);
  return ph.map(m => `<div class="thumb"><img src="${mediaUrl(m.storage_path)}" alt="">${m === cv ? '<span class="cover-tag">Cover</span>' : `<button type="button" class="make-cover" data-cover="${m.id}" data-stop="${stopId}">Make cover</button>`}</div>`).join('');
}
async function makeEntryCover(trip, stopId, mediaId) {
  const a = await sb.from('media').update({ is_cover: false }).eq('stop_id', stopId).neq('id', mediaId); if (a.error) throw a.error;
  const b = await sb.from('media').update({ is_cover: true }).eq('id', mediaId).select('id,is_cover').single(); if (b.error) throw b.error;
  if (!b.data?.is_cover) throw new Error('Cover not saved. Try again.');
  S.media.forEach(m => { if (m.stop_id === stopId) m.is_cover = m.id === mediaId; });
}
function wireMakeCover(root, trip, after) {
  $$(root + ' [data-cover]').forEach(b => b.onclick = async e => {
    e.preventDefault(); e.stopPropagation(); b.disabled = true;
    try { await makeEntryCover(trip, b.dataset.stop, b.dataset.cover); renderMarkers(); renderTimeline(); toast('Cover changed'); after && after(); }
    catch (err) { toast(err.message || String(err), 4000); b.disabled = false; }
  });
}
function renderEditorThumbs() {
  const ed = S.editor, box = $('#e-photo-preview');
  if (!ed?.stop) { box.innerHTML = ''; return; }
  box.innerHTML = thumbsHtml(ed.trip, ed.stop.id);
  wireMakeCover('#e-photo-preview', ed.trip, renderEditorThumbs);
}
// v1.8: the pickers never block a day or move a date; every rule is checked at Save.
function applyDateLimitsSoft() { ['#t-start', '#t-end', '#e-arrived', '#e-left'].forEach(id => { $(id).removeAttribute('min'); $(id).removeAttribute('max'); }); markDates(); }
// Outline an obviously wrong pair (end before start) while you edit; nothing is changed for you.
function markDates() {
  const ts = $('#t-start').value, te = $('#t-end').value, ea = $('#e-arrived').value, el = $('#e-left').value;
  $('#t-end').classList.toggle('bad-date', !!(ts && te && te < ts));
  $('#e-left').classList.toggle('bad-date', !!(ea && el && el < ea));
  const rh = $('#e-home-on').value; $('#e-home-on').classList.toggle('bad-date', !!($('#e-home').checked && rh && rh < (el || ea || rh)));
}
function closeEditor() { $('#editor').hidden = true; S.editor = null; }
// ---------- date rules: end never before start; an entry stays inside its trip ----------
function tripRangeForEditor() {
  const ed = S.editor;
  if (ed && ed.trip && !ed.tripOnly && $('#fs-trip').hidden) return [ed.trip.start_date, ed.trip.end_date];
  return [$('#t-start').value, $('#t-end').value];
}
// New trip: Arrived follows the trip's From until you pick Arrived yourself.
$('#t-start').addEventListener('change', () => { if (S.editor && !S.editor.trip && !$('#e-arrived').dataset.touched) $('#e-arrived').value = $('#t-start').value; });
$('#e-arrived').addEventListener('change', () => { $('#e-arrived').dataset.touched = '1'; });
['#t-start', '#t-end', '#e-arrived', '#e-left'].forEach(id => $(id).addEventListener('change', markDates));
// An entry outside its trip: offer to stretch the trip to fit (nothing changes unless you say yes).
const homeOnIfAny = () => (!$('#e-home-wrap').hidden && $('#e-home').checked && $('#e-home-on').value) || '';
async function fitTripToEntry() {
  if ($('#fs-entry').hidden) return true;
  const ea = $('#e-arrived').value, el = $('#e-left').value;
  if (!ea || (el && el < ea)) return true; // checkDates explains these
  const [from, to] = tripRangeForEditor(); if (!from || !to || to < from) return true;
  const rh = homeOnIfAny(); const lo = ea, hi = [el || ea, rh || ''].sort().pop();
  if (lo >= from && hi <= to) return true;
  const nf = lo < from ? lo : from, nt = hi > to ? hi : to;
  const yes = await ask(`This entry (${fmtDate(lo)}${hi !== lo ? ' – ' + fmtDate(hi) : ''}) is outside the trip (${fmtDate(from)} – ${fmtDate(to)}).`, `Extend the trip to ${fmtDate(nf)} – ${fmtDate(nt)} and save`, 'Change the date');
  if (!yes) return false;
  if (!$('#fs-trip').hidden) { $('#t-start').value = nf; $('#t-end').value = nt; return true; }
  const tr = S.editor.trip;
  const r = await sb.from('trip').update({ start_date: nf, end_date: nt, updated_at: new Date().toISOString() }).eq('id', tr.id).select('start_date,end_date').single();
  if (r.error) throw r.error;
  tr.start_date = r.data.start_date; tr.end_date = r.data.end_date; return true;
}
function ask(msg, yesLabel, noLabel) {
  return new Promise(res => {
    const box = document.createElement('div'); box.className = 'ask';
    box.innerHTML = `<div class="ask-card"><p>${esc(msg)}</p><div class="actions"><button class="btn primary" type="button" data-a="y">${esc(yesLabel)}</button><button class="btn" type="button" data-a="n">${esc(noLabel)}</button></div></div>`;
    document.body.appendChild(box);
    box.onclick = e => { const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; box.remove(); res(a === 'y'); };
  });
}
function checkDates() {
  const ts = $('#t-start').value, te = $('#t-end').value, ea = $('#e-arrived').value, el = $('#e-left').value;
  const ed = S.editor;
  if (!$('#fs-trip').hidden && ts && te && te < ts) return '"To" is before "From".';
  if (ed && ed.tripOnly && ed.trip) {
    const out = ed.trip.stops.filter(s => (s.arrived_on && (s.arrived_on < ts || s.arrived_on > te)) || (s.left_on && (s.left_on < ts || s.left_on > te)));
    if (ed.trip.return_on && (ed.trip.return_on < ts || ed.trip.return_on > te)) return `You reached home on ${fmtDate(ed.trip.return_on)}, outside ${fmtDate(ts)} – ${fmtDate(te)}. Widen the trip, or change that date on the last entry.`;
    if (out.length) return `These entries fall outside ${fmtDate(ts)} – ${fmtDate(te)}: ${out.map(s => s.place?.name).join(', ')}. Change their dates first, or widen the trip.`;
  }
  if (!$('#fs-entry').hidden) {
    const [from, to] = tripRangeForEditor();
    if (!ea) return 'Pick the Arrived date.';
    const rh = homeOnIfAny(); if (rh && rh < (el || ea)) return '"Reached home" is before you left this place.';
    if (ea && el && el < ea) return '"Left" is before "Arrived".';
    if (from && to && ((ea && (ea < from || ea > to)) || (el && (el < from || el > to)))) return `This entry's dates must be inside the trip, ${fmtDate(from)} – ${fmtDate(to)}. Edit the trip to widen it.`;
  }
  return null;
}

function prevPlaceFor(trip, stop, day) {
  if (!trip) return formStart() || home();
  const others = sortStops((trip.stops || []).filter(s => !stop || s.id !== stop.id), trip);
  const d = day || (stop ? entryDay(stop, trip) : '9999');
  const before = others.filter(s => entryDay(s, trip) <= d);
  return before.length ? before[before.length - 1].place : tripStart(trip);
}
// The 'Started from' picked in the trip form (null = home).
function formStart() { const j = $('#t-from-json').value; try { return j ? JSON.parse(j) : null; } catch (e) { return null; } }
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
$('#t-cover').addEventListener('change', async e => {
  pendingTripCover = null; const f = e.target.files[0]; if (!f) return;
  pendingTripCover = await compressImage(f); $('#t-cover-preview').innerHTML = `<img src="${URL.createObjectURL(pendingTripCover.blob)}" alt="">`;
});
$('#e-photos').addEventListener('change', async e => {
  pendingPhotos = []; renderEditorThumbs(); const prev = $('#e-photo-preview');
  const files = [...e.target.files].slice(0, 3);
  for (const f of files) { const c = await compressImage(f); pendingPhotos.push(c); const img = document.createElement('img'); img.src = URL.createObjectURL(c.blob); prev.appendChild(img); }
  if (e.target.files.length > 3) toast('Only the first 3 photos are kept');
});
async function saveEditor(addAnother = false) {
  const ed = S.editor; if (!ed) return;
  const btn = $('#editor-save'); btn.disabled = true;
  try {
    let trip = ed.trip;
    if (checkDates() === null || /inside the trip/.test(checkDates() || '')) { if (!(await fitTripToEntry())) return; }
    const dateProblem = checkDates(); if (dateProblem) throw new Error(dateProblem);
    // 1. the trip
    if (!trip || ed.tripOnly) {
      const payload = { child_id: S.child.id, title: $('#t-title').value.trim(), start_date: $('#t-start').value, end_date: $('#t-end').value, purpose: ($('#t-purpose').value === 'other' && $('#t-purpose-other').value.trim()) ? $('#t-purpose-other').value.trim() : $('#t-purpose').value, album_url: $('#t-album').value.trim() || null, summary: $('#t-summary').value.trim() || null, start_place_id: formStart() ? (await ensurePlace(formStart())).id : null, updated_at: new Date().toISOString() };
      if (!payload.title || !payload.start_date || !payload.end_date) throw new Error('Title and dates are needed');
      const r = trip ? await sb.from('trip').update(payload).eq('id', trip.id).select().single() : await sb.from('trip').insert(payload).select().single();
      if (r.error) throw r.error; trip = { ...r.data, stops: trip?.stops || [], media: trip?.media || [] };
      // 1b. the trip cover (trip-level photo: stop_id null). The old one stays as a trip photo, no longer the cover.
      if (pendingTripCover) {
        const path = `${trip.id}/${uuid()}.jpg`;
        const up = await sb.storage.from(BUCKET).upload(path, pendingTripCover.blob, { contentType: 'image/jpeg', cacheControl: '2592000', upsert: false });
        if (up.error) throw up.error;
        const off = await sb.from('media').update({ is_cover: false }).eq('trip_id', trip.id).is('stop_id', null); if (off.error) throw off.error;
        const mr = await sb.from('media').insert({ trip_id: trip.id, stop_id: null, storage_path: path, is_cover: true, width: pendingTripCover.w, height: pendingTripCover.h, bytes: pendingTripCover.blob.size });
        if (mr.error) throw mr.error; pendingTripCover = null;
      }
    }
    // 1c. who came along (trip form)
    if (!$('#fs-trip').hidden) {
      const had = new Set((ed.trip?.people || []).map(x => x.id));
      const add = [...pendingPeople].filter(id => !had.has(id)), del = [...had].filter(id => !pendingPeople.has(id));
      if (add.length) { const r = await sb.from('trip_person').insert(add.map(person_id => ({ trip_id: trip.id, person_id }))); if (r.error) throw r.error; }
      if (del.length) { const r = await sb.from('trip_person').delete().eq('trip_id', trip.id).in('person_id', del); if (r.error) throw r.error; }
    }
    // 2. the entry
    if (!ed.tripOnly) {
      const pj = $('#e-place-json').value; if (!pj) throw new Error('Pick the place from the list');
      const place = await ensurePlace(JSON.parse(pj));
      const arr = $('#e-arrived').value;
      const prev = prevPlaceFor(trip, ed.stop, arr); // the saved trip: its 'Started from' counts for the first entry
      const kmInput = $('#e-km').value; const km = kmInput !== '' ? +kmInput : (prev ? haversine(prev, place) : 0);
      const entry = { trip_id: trip.id, place_id: place.id, seq: ed.stop ? ed.stop.seq : (Math.max(0, ...trip.stops.map(s => s.seq || 0)) + 1), arrived_on: $('#e-arrived').value || null, left_on: $('#e-left').value || null, mode_to_here: $('#e-mode').value, km_from_prev: km, stayed_at: $('#e-stayed').value.trim() || null, stayed_overnight: $('#e-overnight').checked, stay_kind: $('#e-overnight').checked ? stayKind : null, weather: [...pendingWeather].filter(k => WX[k]), what_we_did: $('#e-did').value.trim() || null, what_he_saw: $('#e-saw').value.trim() || null, what_he_hated: $('#e-hated').value.trim() || null, what_he_ate: $('#e-ate').value.trim() || null, memory: $('#e-memory').value.trim() || null };
      const r = ed.stop ? await sb.from('trip_stop').update(entry).eq('id', ed.stop.id).select().single() : await sb.from('trip_stop').insert(entry).select().single();
      if (r.error) throw r.error; const stop = r.data;
      // firsts
      const kinds = $$('#e-firsts .chip.on').map(b => b.dataset.kind);
      if (ed.stop) { const d = await sb.from('milestone').delete().eq('stop_id', stop.id); if (d.error) throw d.error; }
      if (kinds.length) { const otherNote = $('#e-first-other').value.trim() || null; const m = await sb.from('milestone').insert(kinds.map(k => ({ stop_id: stop.id, kind: k, note: k === 'other' ? otherNote : null }))); if (m.error) throw m.error; }
      // photos
      for (let i = 0; i < pendingPhotos.length; i++) {
        const ph = pendingPhotos[i]; const path = `${trip.id}/${uuid()}.jpg`;
        const up = await sb.storage.from(BUCKET).upload(path, ph.blob, { contentType: 'image/jpeg', cacheControl: '2592000', upsert: false });
        if (up.error) throw up.error;
        const stopHasPhotos = trip.media.some(m => m.stop_id === stop.id); // an entry's first photo is its cover
        const mr = await sb.from('media').insert({ trip_id: trip.id, stop_id: stop.id, storage_path: path, is_cover: !stopHasPhotos && i === 0, width: ph.w, height: ph.h, bytes: ph.blob.size });
        if (mr.error) throw mr.error;
      }
      // the way back home (stored on the trip; only offered on the trip's last entry)
      if (!$('#e-home-wrap').hidden) {
        const want = $('#e-home').checked, kmIn = $('#e-home-km').value;
        const patch = want ? { return_mode: $('#e-home-mode').value, return_on: $('#e-home-on').value || null, return_km: kmIn === '' ? null : +kmIn } : { return_mode: null, return_on: null, return_km: null };
        const cur = S.trips.find(x => x.id === trip.id) || trip;
        if (['return_mode', 'return_on', 'return_km'].some(k => (cur[k] ?? null) !== patch[k])) { const rr = await sb.from('trip').update(patch).eq('id', trip.id); if (rr.error) throw rr.error; }
      }
      // keep numbering, trip dates and km_total in step with the entries
      await refresh();
      const now = S.trips.find(x => x.id === trip.id); if (now) await normaliseTrip(now, now.stops);
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
  // Remove the entry's photos first: the media→entry link is ON DELETE SET NULL, which would leave them looking like trip covers.
  const ph = entryPhotos(ed.trip, ed.stop.id);
  if (ph.length) { await sb.storage.from(BUCKET).remove(ph.map(m => m.storage_path)); const dm = await sb.from('media').delete().in('id', ph.map(m => m.id)); if (dm.error) return toast(dm.error.message); }
  const { error } = await sb.from('trip_stop').delete().eq('id', ed.stop.id); if (error) return toast(error.message);
  await refresh(); const tr = S.trips.find(x => x.id === ed.trip.id); if (tr && tr.stops.length) { try { await normaliseTrip(tr, tr.stops); } catch (e) { /* keep going */ } }
  closeEditor(); await refresh(); toast('Entry deleted');
};
wirePlaceSearch('#t-from', '#t-from-results', '#t-from-json', () => renderFromLine());
wirePlaceSearch('#e-place', '#e-place-results', '#e-place-json', p => {
  $('#e-place-picked').textContent = placeLine(p);
  const prev = prevPlaceFor(S.editor?.trip && $('#fs-trip').hidden ? S.editor.trip : (S.editor?.trip ? { ...S.editor.trip, start_place: formStart(), start_place_id: null } : null), S.editor?.stop, $('#e-arrived').value); if (prev && $('#e-km').value === '') $('#e-km').placeholder = `auto: ~${haversine(prev, p)} km`;
});

// ---------- story ----------
function renderStoryPicker() {
  const box = $('#story-years'); box.innerHTML = ''; const ys = years();
  $('#story-years-empty').hidden = ys.length > 0;
  [...ys, 'all'].forEach(y => { if (y === 'all' && ys.length < 2) return; const b = document.createElement('button'); b.className = 'chip'; b.textContent = y === 'all' ? 'Since he was born' : y; b.onclick = () => playStory(y); box.appendChild(b); });
}
function storyData(y, trips, child, homeP) {
  trips = [...trips].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const stops = trips.flatMap(t => sortStops(t.stops, t).map(s => ({ ...s, trip: t })));
  const km = trips.reduce((a, t) => a + tripKm(t, homeP), 0);
  const nights = trips.reduce((a, t) => a + Math.round((new Date(t.end_date) - new Date(t.start_date)) / 86400000), 0);
  const places = new Set(stops.map(s => s.place?.id).filter(Boolean)), states = new Set(stops.map(s => s.place?.state).filter(Boolean)), countries = new Set(stops.map(s => s.place?.country).filter(Boolean));
  const modes = [...new Set(stops.map(s => s.mode_to_here))];
  const firsts = stops.flatMap(s => (s.milestones || []).map(m => ({ ...m, stop: s })));
  const far = homeP ? stops.map(s => ({ s, d: s.place ? haversine(homeP, s.place) : 0 })).sort((a, b) => b.d - a.d)[0] : null;
  const pm = new Map(); trips.forEach(t => (t.people || []).forEach(x => { const e = pm.get(x.id) || { p: x, n: 0 }; e.n++; pm.set(x.id, e); }));
  const people = [...pm.values()].sort((a, b) => b.n - a.n || a.p.name.localeCompare(b.p.name));
  return { y, trips, stops, km, people, nights, places: places.size, states: states.size, countries: countries.size, modes, firsts, far,
    ageFrom: trips.length ? ageLabel(child.dob, trips[0].start_date) : '', ageTo: trips.length ? ageLabel(child.dob, trips[trips.length - 1].end_date) : '' };
}
// ---------- v2.0 the ride: Sathyavijay in the actual vehicle, travelling a dotted route ----------
// Each vehicle is drawn facing right in a 96×64 box; face = [cx, cy, r] of the round window his photo sits in.
const INK = '#1a1206', GOLD = '#f2b544', GOLD2 = '#d99a2b', CREAM = '#fff4dc', TYRE = '#22272c', HUB = '#a7ada8', RED = '#c4462f';
const wheel = (x, y, r = 7) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${TYRE}"/><circle cx="${x}" cy="${y}" r="${r * 0.4}" fill="${HUB}"/>`;
const RIDERS = {
  car: { face: [57, 27, 10.5], svg: `<path d="M6 46 Q6 37 15 36 L27 35 L37 20 Q40 16 46 16 L66 16 Q71 16 74 20 L83 34 Q91 35 91 43 L91 47 Q91 50 88 50 L9 50 Q6 50 6 47Z" fill="${GOLD}"/><rect x="41" y="18.5" width="31" height="17" rx="6" fill="${CREAM}"/><rect x="85" y="39" width="5" height="4" rx="1.5" fill="${CREAM}"/><rect x="6" y="40" width="5" height="4" rx="1.5" fill="${RED}"/>${wheel(25, 50)}${wheel(72, 50)}` },
  train: { face: [62, 27, 10], svg: `<rect x="0" y="57" width="96" height="2" fill="${HUB}"/><rect x="4" y="12" width="78" height="38" rx="7" fill="${GOLD}"/><path d="M82 18 Q92 22 93 34 L93 48 L82 50Z" fill="${GOLD2}"/><rect x="4" y="12" width="78" height="6" rx="3" fill="${RED}"/><rect x="10" y="21" width="14" height="12" rx="3" fill="${CREAM}"/><rect x="28" y="21" width="14" height="12" rx="3" fill="${CREAM}"/><rect x="50" y="17" width="24" height="20" rx="6" fill="${CREAM}"/><rect x="4" y="40" width="89" height="4" fill="${RED}"/>${wheel(16, 52, 5)}${wheel(32, 52, 5)}${wheel(62, 52, 5)}${wheel(78, 52, 5)}` },
  flight: { face: [70, 30, 9], svg: `<path d="M10 30 L4 12 L14 12 L28 27Z" fill="${GOLD2}"/><ellipse cx="48" cy="33" rx="42" ry="11" fill="#f3ede2"/><path d="M84 28 Q94 31 90 37 Q86 41 78 42Z" fill="#f3ede2"/><rect x="10" y="35" width="74" height="3" fill="${GOLD}"/><path d="M36 36 L58 36 L44 56 L36 56Z" fill="${GOLD}"/><circle cx="26" cy="30" r="2.6" fill="#7aa6c9"/><circle cx="34" cy="30" r="2.6" fill="#7aa6c9"/><circle cx="42" cy="30" r="2.6" fill="#7aa6c9"/><circle cx="50" cy="30" r="2.6" fill="#7aa6c9"/><circle cx="70" cy="30" r="11" fill="#7aa6c9"/>` },
  bus: { face: [80, 25, 9], svg: `<rect x="4" y="10" width="88" height="40" rx="8" fill="${GOLD}"/><rect x="4" y="38" width="88" height="5" fill="${RED}"/><rect x="10" y="17" width="12" height="14" rx="3" fill="${CREAM}"/><rect x="26" y="17" width="12" height="14" rx="3" fill="${CREAM}"/><rect x="42" y="17" width="12" height="14" rx="3" fill="${CREAM}"/><rect x="58" y="17" width="10" height="24" rx="3" fill="${GOLD2}"/><rect x="70" y="14" width="20" height="22" rx="5" fill="${CREAM}"/>${wheel(22, 51)}${wheel(74, 51)}` },
  boat: { face: [48, 23, 10], svg: `<path d="M0 54 Q12 50 24 54 T48 54 T72 54 T96 54 L96 60 L0 60Z" fill="#4a86b3"/><path d="M4 38 L92 38 L82 54 L14 54Z" fill="${GOLD}"/><rect x="4" y="38" width="88" height="4" fill="${RED}"/><rect x="30" y="10" width="38" height="28" rx="6" fill="#f3ede2"/><circle cx="48" cy="23" r="12" fill="#7aa6c9"/><rect x="62" y="2" width="4" height="10" fill="${GOLD2}"/>` },
  bike: { face: [44, 13, 10.5], svg: `<rect x="38" y="22" width="13" height="14" rx="5" fill="${RED}"/><path d="M22 40 Q24 30 38 32 L60 32 Q66 32 68 26 L74 16 L78 16 L72 30 Q70 40 60 42 L30 42Z" fill="${GOLD}"/><rect x="34" y="30" width="22" height="5" rx="2.5" fill="${INK}"/><rect x="74" y="13" width="8" height="3" rx="1.5" fill="${INK}"/>${wheel(22, 48, 8)}${wheel(74, 48, 8)}` },
  walk: { face: [40, 29, 10.5], svg: `<path d="M20 38 Q20 14 44 14 L46 14 L46 38Z" fill="${GOLD2}"/><path d="M18 36 L74 36 Q76 48 62 50 L30 50 Q18 48 18 36Z" fill="${GOLD}"/><path d="M74 36 L84 18 L90 18" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>${wheel(30, 54, 6)}${wheel(64, 54, 6)}` }
};
RIDERS.default = RIDERS.car;
function riderEl(mode, photoUrl, initial) {
  const r = RIDERS[mode] || RIDERS.default, [cx, cy, rad] = r.face;
  const el = document.createElement('div'); el.className = 'rider'; el.dataset.mode = mode || 'car';
  const left = (cx - rad) / 96 * 100, top = (cy - rad) / 64 * 100, w = rad * 2 / 96 * 100, h = rad * 2 / 64 * 100;
  el.style.setProperty('--fl', left + '%'); el.style.setProperty('--flr', (100 - left - w) + '%');
  el.innerHTML = `<div class="rider-body"><svg viewBox="0 0 96 64" aria-hidden="true">${r.svg}</svg><div class="rider-face" style="top:${top}%;width:${w}%;height:${h}%">${photoUrl ? `<img src="${esc(photoUrl)}" alt="">` : `<span>${esc(initial || '•')}</span>`}</div></div>`;
  el.setAttribute('role', 'img'); el.setAttribute('aria-label', `${initial || 'He'} ${MODE_WORDS[mode] || ''}`.trim());
  return el;
}
const riderFaceUrl = child => child?.photo_path ? mediaUrl(child.photo_path) : null;
const reducedMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
// A gentle curve between two [lng,lat] points; flights bow more.
function routeCurve(a, b, mode, n = 64) {
  const dx = b[0] - a[0], dy = b[1] - a[1], k = mode === 'flight' ? 0.22 : 0.1;
  const c = [(a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k], out = [];
  for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); }
  return out;
}
const ROUTE_LAYERS = ['route-trail', 'route-leg'];
function ensureRouteLayers(map) {
  ROUTE_LAYERS.forEach(id => {
    if (map.getSource(id)) return;
    map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id, type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#f2b544', 'line-width': id === 'route-leg' ? 5 : 4, 'line-opacity': id === 'route-leg' ? 1 : 0.8, 'line-dasharray': [0, 2] } });
  });
}
function clearRoute(map) { ROUTE_LAYERS.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); }); }
const lineFC = lines => ({ type: 'FeatureCollection', features: lines.filter(l => l.length > 1).map(c => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: c } })) });
// legs: [{ from:{lng,lat}, to:{lng,lat}, mode }]. The trail shows done legs at once.
function drawTrail(map, legs) { ensureRouteLayers(map); map.getSource('route-trail').setData(lineFC(legs.map(l => routeCurve([l.from.lng, l.from.lat], [l.to.lng, l.to.lat], l.mode)))); map.getSource('route-leg').setData(lineFC([])); }
// Animate one leg: camera frames both ends, the dotted line grows, the rider travels it. Resolves on arrival (or at once if cancelled).
let rideSeq = 0;
function cancelRide() { rideSeq++; }
function rideLeg(map, leg, rider, opts = {}) {
  const my = ++rideSeq, a = [leg.from.lng, leg.from.lat], b = [leg.to.lng, leg.to.lat];
  const pts = routeCurve(a, b, leg.mode), km = haversine(leg.from, leg.to);
  ensureRouteLayers(map);
  const pad = opts.padding || { top: 90, bottom: 280, left: 60, right: 60 };
  const bounds = pts.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(a, a));
  const setDir = (p, q) => { if (Math.abs(q[0] - p[0]) > 1e-9) rider.el.classList.toggle('flip', q[0] < p[0]); }; // no change on the last point (p = q)
  rider.marker.setLngLat(a); setDir(a, b);
  if (km < 0.05) { rider.marker.setLngLat(b); return Promise.resolve(true); }
  if (reducedMotion() || opts.instant) {
    map.fitBounds(bounds, { padding: pad, maxZoom: 12, duration: 0 });
    map.getSource('route-leg').setData(lineFC([pts])); rider.marker.setLngLat(b); return Promise.resolve(true);
  }
  map.fitBounds(bounds, { padding: pad, maxZoom: 12, duration: 1100, essential: true });
  const dur = Math.max(2200, Math.min(5200, 1800 + km * 3));
  return new Promise(res => {
    rider.el.classList.add('moving');
    setTimeout(() => {
      if (my !== rideSeq) { rider.el.classList.remove('moving'); return res(false); }
      const t0 = performance.now();
      const step = now => {
        if (my !== rideSeq) { rider.el.classList.remove('moving'); return res(false); }
        const t = Math.min(1, (now - t0) / dur), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const f = e * (pts.length - 1), i = Math.floor(f), frac = f - i, p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)];
        const here = [p[0] + (q[0] - p[0]) * frac, p[1] + (q[1] - p[1]) * frac];
        map.getSource('route-leg')?.setData(lineFC([[...pts.slice(0, i + 1), here]]));
        rider.marker.setLngLat(here); setDir(p, q);
        if (t < 1) requestAnimationFrame(step); else { rider.el.classList.remove('moving'); res(true); }
      };
      requestAnimationFrame(step);
    }, 1100);
  });
}
// The legs of one trip in date order: home → first place → … (a missing place is skipped).
function tripLegs(trip, homeP) {
  const legs = []; const start = tripStart(trip, homeP); let prev = start, any = false;
  sortStops(trip.stops, trip).forEach(s => { if (!s.place) return; if (prev) legs.push({ from: prev, to: s.place, mode: s.mode_to_here, stop: s }); prev = s.place; any = true; });
  if (trip.return_mode && homeP && any) legs.push({ from: prev, to: homeP, mode: trip.return_mode, back: true });
  return legs;
}
// Main map: a still dotted route for the trip whose sheet is open.
function showTripRoute(trip) { if (!S.map || !S.map.isStyleLoaded || !S.map.isStyleLoaded()) return; try { drawTrail(S.map, tripLegs(trip, home())); } catch (e) { /* map not ready */ } }
function hideTripRoute() { if (S.map) try { clearRoute(S.map); } catch (e) { /* ignore */ } }

// ---------- v2.3 weather and night ----------
// Weather is chosen by hand per entry (multi-select). The story draws it on a canvas layer over the map;
// the night is a fading layer (deep blue, stars, moon) over the map with the stay icon lit above it.
const WEATHER = [
  ['sunny', '☀️', 'Sunny / pleasant'], ['hot', '🔥', 'Very hot'], ['cloudy', '☁️', 'Cloudy'], ['fog', '🌫️', 'Foggy / misty'],
  ['drizzle', '🌦️', 'Drizzle'], ['rain', '🌧️', 'Heavy rain'], ['storm', '⛈️', 'Thunderstorm'], ['windy', '💨', 'Windy'],
  ['chilly', '🍃', 'Chilly / cool'], ['cold', '🥶', 'Severe cold'], ['snow', '❄️', 'Snow'], ['humid', '💧', 'Humid / sticky']
];
const WX = Object.fromEntries(WEATHER.map(([k, e, l]) => [k, { e, l }]));
const weatherLine = list => (list || []).filter(k => WX[k]).map(k => `${WX[k].e} ${WX[k].l}`).join(' · ');
const STAYS = { home: ['🏠', 'Family home'], hotel: ['🏨', 'Hotel'], homestay: ['🏡', 'Homestay'] };
const nightsOf = s => { if (!s.stayed_overnight) return 0; const a = s.arrived_on, l = s.left_on; if (!a || !l || l <= a) return 1; return Math.max(1, Math.round((new Date(l) - new Date(a)) / 86400000)); };
const stayLine = s => { if (!s.stayed_overnight) return ''; const st = STAYS[s.stay_kind] || STAYS.home; const n = nightsOf(s); return `${st[0]} ${s.stayed_at ? esc(s.stayed_at) : st[1]} · ${n} night${n === 1 ? '' : 's'}`; };
const guessStayKind = txt => /hotel|resort|inn|lodge|residency|suites?\b/i.test(txt || '') ? 'hotel' : /homestay|home stay|airbnb|cottage/i.test(txt || '') ? 'homestay' : 'home';
// The stay icon drawn like the vehicles: a house, a hotel, a homestay, each with one window that lights up at night.
const STAY_SVG = {
  home: '<path d="M8 30 L32 10 L56 30 L56 56 L8 56 Z" fill="#f2b544"/><path d="M4 32 L32 8 L60 32" stroke="#c4462f" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="26" y="40" width="12" height="16" rx="2" fill="#7a4a1c"/><rect class="win" x="14" y="34" width="9" height="9" rx="1.5"/><rect class="win" x="41" y="34" width="9" height="9" rx="1.5"/>',
  hotel: '<rect x="12" y="8" width="40" height="48" rx="3" fill="#d99a2b"/><rect x="8" y="52" width="48" height="4" fill="#7a4a1c"/><rect class="win" x="18" y="14" width="8" height="7"/><rect class="win" x="38" y="14" width="8" height="7"/><rect class="win" x="18" y="26" width="8" height="7"/><rect class="win" x="38" y="26" width="8" height="7"/><rect x="27" y="40" width="10" height="16" fill="#7a4a1c"/><rect x="20" y="2" width="24" height="7" rx="2" fill="#c4462f"/>',
  homestay: '<path d="M10 32 L32 14 L54 32 L54 56 L10 56 Z" fill="#e8c27a"/><path d="M6 34 L32 11 L58 34" stroke="#3f7f4f" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="27" y="42" width="10" height="14" rx="2" fill="#7a4a1c"/><rect class="win" x="15" y="37" width="9" height="8" rx="1.5"/><circle cx="50" cy="50" r="6" fill="#3f7f4f"/>'
};
const stayIconHtml = kind => `<svg viewBox="0 0 64 60" aria-hidden="true">${STAY_SVG[kind] || STAY_SVG.home}</svg><span class="zzz">z<b>z</b><i>z</i></span>`;

function createWeather(canvas, host) {
  const ctx = canvas.getContext('2d'); let kinds = new Set(), parts = {}, raf = 0, t0 = 0, night = false, flash = 0, nextFlash = 0, w = 0, h = 0, dpr = 1;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const size = () => { dpr = Math.min(2, window.devicePixelRatio || 1); w = canvas.clientWidth; h = canvas.clientHeight; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  const has = k => kinds.has(k);
  function build() {
    const wind = has('windy') ? 1 : 0;
    const rainN = has('storm') ? 260 : has('rain') ? 200 : has('drizzle') ? 70 : 0;
    parts.rain = Array.from({ length: rainN }, () => ({ x: rnd(-50, w + 50), y: rnd(-h, h), v: has('drizzle') && !has('rain') && !has('storm') ? rnd(6, 9) : rnd(13, 19), l: has('drizzle') && !has('rain') && !has('storm') ? rnd(6, 10) : rnd(14, 24), a: rnd(.25, .55) }));
    parts.slant = wind ? 0.45 : (has('storm') ? 0.25 : 0.08);
    parts.snow = has('snow') ? Array.from({ length: 110 }, () => ({ x: rnd(0, w), y: rnd(-h, h), r: rnd(1.2, 3.6), v: rnd(.5, 1.6), p: rnd(0, 6.3) })) : [];
    parts.gust = wind ? Array.from({ length: 22 }, () => ({ x: rnd(-w, w), y: rnd(0, h), l: rnd(60, 160), v: rnd(9, 16), a: rnd(.15, .35) })) : [];
    parts.leaf = wind ? Array.from({ length: 12 }, () => ({ x: rnd(-w, 0), y: rnd(0, h), v: rnd(3, 6), p: rnd(0, 6.3), s: rnd(4, 7) })) : [];
    parts.fog = has('fog') || has('humid') ? Array.from({ length: has('fog') ? 7 : 4 }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(w * .25, w * .5), v: rnd(.15, .4), p: rnd(0, 6.3) })) : [];
    parts.cloud = has('cloudy') || has('storm') ? Array.from({ length: 4 }, () => ({ x: rnd(-w * .5, w), y: rnd(0, h), r: rnd(w * .2, w * .35), v: rnd(.25, .5) })) : [];
    parts.drops = has('rain') || has('storm') || has('humid') ? Array.from({ length: has('humid') && !has('rain') ? 14 : 22 }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(2, 6), v: rnd(.05, .4) })) : [];
    parts.heat = has('hot') ? Array.from({ length: 9 }, (_, i) => ({ y: h - i * (h / 9), p: rnd(0, 6.3) })) : [];
    nextFlash = performance.now() + rnd(1500, 3500);
  }
  function frame(now) {
    const dt = Math.min(3, (now - (t0 || now)) / 16.7); t0 = now; const t = now / 1000;
    ctx.clearRect(0, 0, w, h);
    // light: sun glow (not at night)
    if ((has('sunny') || has('hot')) && !night) { const g = ctx.createRadialGradient(w * .88, h * .1, 0, w * .88, h * .1, Math.max(w, h) * (has('hot') ? .75 : .55)); g.addColorStop(0, has('hot') ? 'rgba(255,190,90,.55)' : 'rgba(255,236,170,.45)'); g.addColorStop(.25, has('hot') ? 'rgba(255,140,40,.18)' : 'rgba(255,230,160,.12)'); g.addColorStop(1, 'rgba(255,200,120,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
    // heat shimmer: faint wavy bands rising
    parts.heat && parts.heat.forEach(b => { b.y -= .6 * dt; if (b.y < -20) b.y = h + 10; ctx.strokeStyle = 'rgba(255,220,180,.10)'; ctx.lineWidth = 6; ctx.beginPath(); for (let x = 0; x <= w; x += 20) { const y = b.y + Math.sin(x / 40 + t * 3 + b.p) * 4; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); });
    // cloud shadows
    parts.cloud && parts.cloud.forEach(c => { c.x += c.v * dt; if (c.x - c.r > w) c.x = -c.r; const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r); g.addColorStop(0, 'rgba(20,25,35,.28)'); g.addColorStop(1, 'rgba(20,25,35,0)'); ctx.fillStyle = g; ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2); });
    // fog / humid haze
    parts.fog && parts.fog.forEach(f => { f.x += f.v * dt; if (f.x - f.r > w) f.x = -f.r; const a = (has('fog') ? .42 : .2) * (.75 + .25 * Math.sin(t * .6 + f.p)); const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r); g.addColorStop(0, `rgba(235,238,240,${a})`); g.addColorStop(1, 'rgba(235,238,240,0)'); ctx.fillStyle = g; ctx.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2); });
    // rain
    if (parts.rain && parts.rain.length) { ctx.lineCap = 'round'; ctx.lineWidth = has('drizzle') && !has('rain') && !has('storm') ? 1 : 1.4; parts.rain.forEach(d => { d.y += d.v * dt; d.x += d.v * parts.slant * dt; if (d.y > h) { d.y = rnd(-60, -10); d.x = rnd(-50, w + 50); } ctx.strokeStyle = night ? `rgba(200,215,255,${d.a})` : `rgba(170,190,215,${d.a + .1})`; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * parts.slant, d.y - d.l); ctx.stroke(); }); }
    // drops sliding on the glass
    parts.drops && parts.drops.forEach(d => { d.y += d.v * dt; if (d.y > h + 10) { d.y = -10; d.x = rnd(0, w); } ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.3); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(d.x - d.r * .3, d.y - d.r * .3, d.r * .3, 0, 6.3); ctx.fill(); });
    // snow
    parts.snow && parts.snow.forEach(f => { f.y += f.v * dt; f.x += (Math.sin(t + f.p) * .5 + (has('windy') ? 2 : 0)) * dt; if (f.y > h) { f.y = -5; f.x = rnd(0, w); } if (f.x > w + 5) f.x = -5; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.3); ctx.fill(); });
    // wind gusts and leaves
    parts.gust && parts.gust.forEach(g => { g.x += g.v * dt; if (g.x > w + 20) { g.x = rnd(-w * .6, -g.l); g.y = rnd(0, h); } ctx.strokeStyle = `rgba(255,255,255,${g.a})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.quadraticCurveTo(g.x + g.l * .5, g.y - 8, g.x + g.l, g.y); ctx.stroke(); });
    parts.leaf && parts.leaf.forEach(l => { l.x += l.v * dt; l.y += Math.sin(t * 2 + l.p) * 1.2 * dt; if (l.x > w + 10) { l.x = rnd(-80, -10); l.y = rnd(0, h); } ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(t * 3 + l.p); ctx.fillStyle = 'rgba(122,170,80,.85)'; ctx.beginPath(); ctx.ellipse(0, 0, l.s, l.s * .45, 0, 0, 6.3); ctx.fill(); ctx.restore(); });
    // frost at the edges for chilly / severe cold
    if (has('chilly') || has('cold')) { const k = has('cold') ? .55 : .25; const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * (has('cold') ? .32 : .42), w / 2, h / 2, Math.max(w, h) * .72); g.addColorStop(0, 'rgba(220,240,255,0)'); g.addColorStop(1, `rgba(220,240,255,${k})`); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
    // lightning
    if (has('storm')) { if (now > nextFlash) { flash = 1; nextFlash = now + rnd(2500, 6000); } if (flash > 0) { ctx.fillStyle = `rgba(235,240,255,${flash * .55})`; ctx.fillRect(0, 0, w, h); flash -= .08 * dt; } }
  }
  const loop = now => { frame(now); raf = requestAnimationFrame(loop); };
  return {
    start(list) {
      this.stop(); kinds = new Set((list || []).filter(k => WX[k])); if (!kinds.size) return;
      size(); build(); [...kinds].forEach(k => host.classList.add('wx-' + k)); host.classList.add('wx-on');
      if (reducedMotion()) { frame(performance.now()); return; } // a still frame + tint, no movement
      t0 = 0; raf = requestAnimationFrame(loop);
    },
    stop() { cancelAnimationFrame(raf); raf = 0; kinds = new Set(); parts = {}; flash = 0; if (w) ctx.clearRect(0, 0, w, h); [...host.classList].filter(c => c.startsWith('wx-')).forEach(c => host.classList.remove(c)); },
    setNight(v) { night = !!v; if (!raf && kinds.size) frame(performance.now()); },
    get active() { return kinds.size > 0; }
  };
}
// Night: fade to night over the map, light the stay icon, hold, then dawn. Resolves false if the scene changed.
function playNight(P, map, s, token, isLive) {
  const layer = $('#player-night'), stayEl = $('#player-stay'), lbl = $('#player-night-label');
  const kind = STAYS[s.stay_kind] ? s.stay_kind : 'home';
  stayEl.innerHTML = stayIconHtml(kind); stayEl.hidden = false;
  const place = () => { const pt = map.project([s.place.lng, s.place.lat]); stayEl.style.left = pt.x + 'px'; stayEl.style.top = pt.y + 'px'; };
  if (map._bbStayMove) map.off('move', map._bbStayMove); place(); map.on('move', place); map._bbStayMove = place;
  const n = nightsOf(s), st = STAYS[kind];
  lbl.innerHTML = `${st[0]} Night ${n > 1 ? `× ${n}` : ''} at <b>${esc(s.stayed_at || st[1])}</b>`;
  const wait = ms => new Promise(r => setTimeout(r, reducedMotion() ? Math.min(ms, 400) : ms));
  return (async () => {
    P.classList.add('has-stay'); stayEl.classList.add('pop'); await wait(700); // he goes inside: the vehicle fades, the house takes its place if (!isLive()) return false;
    layer.classList.add('on'); P.classList.add('is-night'); S.weather && S.weather.setNight(true); await wait(1300); if (!isLive()) return false;
    lbl.classList.add('on'); await wait(2400); if (!isLive()) return false;
    lbl.classList.remove('on'); layer.classList.remove('on'); P.classList.remove('is-night'); layer.classList.add('dawn'); S.weather && S.weather.setNight(false); await wait(1300); layer.classList.remove('dawn');
    return isLive();
  })();
}
function resetNight(map) {
  const layer = $('#player-night'), stayEl = $('#player-stay'), lbl = $('#player-night-label');
  if (!layer) return; layer.classList.remove('on', 'dawn'); lbl.classList.remove('on'); $('#player').classList.remove('is-night', 'has-stay');
  stayEl.hidden = true; stayEl.classList.remove('pop'); stayEl.innerHTML = '';
  if (map && map._bbStayMove) { map.off('move', map._bbStayMove); map._bbStayMove = null; }
}

function playStory(y, opts = {}) {
  const child = opts.child || S.child, homeP = opts.home || home();
  const d = storyData(y, opts.trips || tripsForYear(y), child, homeP);
  if (!d.trips.length) return toast('No trips in ' + y);
  const P = $('#player'); P.hidden = true; P.hidden = false;
  if (!S.player) {
    S.player = new maplibregl.Map({ container: 'player-map', style: MAP_STYLE, center: [60, 10], zoom: 1.2, interactive: false, attributionControl: { compact: true } });
    S.player.on('style.load', () => { try { S.player.setProjection({ type: 'globe' }); } catch (e) { /* older build: flat map */ } });
    S.player.once('load', () => { S.playerReady = true; });
  }
  const map = S.player, ov = $('#player-overlay'), dots = $('#player-dots');
  let markers = [];
  if (!S.weather) S.weather = createWeather($('#player-weather'), $('#player'));
  const clearMarkers = () => { cancelRide(); S.weather.stop(); resetNight(map); markers.forEach(m => m.remove()); markers = []; if (map.getLayer('arc')) { map.removeLayer('arc'); map.removeSource('arc'); } clearRoute(map); };
  const faceUrl = riderFaceUrl(child), initial = (child?.name || '?').slice(0, 1);
  const addRider = mode => { const el = riderEl(mode, faceUrl, initial); const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, 6] }).setLngLat([0, 0]).addTo(map); markers.push(marker); return { el, marker }; };
  let auto = !!opts.tripMode, autoT = null; const stopAuto = () => { auto = false; clearTimeout(autoT); };
  const name = child?.name || 'He';
  const yearWord = y === 'all' ? 'Since he was born' : String(y);
  const storyItems = []; d.stops.forEach((s, k) => { storyItems.push({ s }); const nx = d.stops[k + 1]; if (s.trip.return_mode && homeP && (!nx || nx.trip.id !== s.trip.id)) storyItems.push({ home: true, trip: s.trip }); });
  function homeScene(t) { return () => { map.stop(); clearMarkers(); clearTimeout(autoT);
    const legs = tripLegs(t, homeP), k = legs.findIndex(l => l.back), leg = legs[k], me = i_now();
    drawTrail(map, legs.slice(0, k));
    legs.slice(0, k).forEach(l => { const e = el('pin small'); const c0 = entryCover(t, l.stop.id); if (c0) e.style.backgroundImage = `url("${mediaUrl(c0.storage_path)}")`; else e.textContent = l.to.name[0]; markers.push(new maplibregl.Marker({ element: e }).setLngLat([l.to.lng, l.to.lat]).addTo(map)); });
    markers.push(new maplibregl.Marker({ element: el('pin home') }).setLngLat([homeP.lng, homeP.lat]).addTo(map));
    const rk = Math.round(returnKm(t, homeP)), all = Math.round(tripKm(t, homeP));
    const arrive = () => { if (i_now() !== me) return;
      map.flyTo({ center: [homeP.lng, homeP.lat], zoom: Math.max(map.getZoom(), 10), pitch: 30, duration: 1400, essential: true });
      ov.innerHTML = `<div class="scene"><div class="eyebrow">${esc(t.title)}${t.return_on ? ' · ' + fmtDate(t.return_on) : ''}</div><h2>Back home</h2><p>${esc(name)} reached ${esc(homeP.name)} ${esc(MODE_WORDS[t.return_mode] || t.return_mode)}${rk ? `, about ${rk.toLocaleString('en-IN')} km` : ''}.</p><div class="line">The whole trip, there and back: about ${all.toLocaleString('en-IN')} km.</div></div>`;
      if (auto && me < scenes.length - 1) autoT = setTimeout(() => { if (auto && i_now() === me) go(me + 1); }, 5200); };
    ov.innerHTML = `<div class="scene slim"><div class="eyebrow">${esc(t.title)}</div><p>${esc(name)} is on the way <b>home</b>, ${esc(MODE_WORDS[t.return_mode] || t.return_mode)}${rk ? `, about ${rk.toLocaleString('en-IN')} km` : ''}.</p></div>`;
    rideLeg(map, leg, addRider(t.return_mode)).then(ok => { if (ok) arrive(); });
  }; }
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
      d.stops.forEach((s, i) => setTimeout(() => { if (!s.place) return; const e = el('pin'); const cv = entryCover(s.trip, s.id); if (cv) e.style.backgroundImage = `url("${mediaUrl(cv.storage_path)}")`; else e.textContent = s.place.name[0]; markers.push(new maplibregl.Marker({ element: e }).setLngLat([s.place.lng, s.place.lat]).addTo(map)); }, 900 + i * 350));
      if (homeP && d.stops.length) addArcs(map, homeP, d.stops);
      ov.innerHTML = `<div class="scene"><h2>${esc(yearWord)} on the map</h2><div class="kv"><div><b>${d.trips.length}</b><span>trip${d.trips.length === 1 ? '' : 's'}</span></div><div><b>${d.places}</b><span>place${d.places === 1 ? '' : 's'}</span></div><div><b>${d.states}</b><span>state${d.states === 1 ? '' : 's'}</span></div><div><b>${d.km.toLocaleString('en-IN')}</b><span>km</span></div><div><b>${d.nights}</b><span>night${d.nights === 1 ? '' : 's'} away</span></div></div><p class="muted">${esc(d.modes.map(m => MODE_WORDS[m] || m).join(', '))}${d.far?.s.place ? ` · farthest from home: ${esc(d.far.s.place.name)}, about ${d.far.d} km` : ''}</p></div>`; },
    // 3 entry by entry: he rides the dotted route from the previous place (or home) to this one, then the card opens
    ...storyItems.map((it, i) => it.home ? homeScene(it.trip) : () => { const s = it.s; map.stop(); clearMarkers(); clearTimeout(autoT); S.weather.start(s.weather || []);
      const legs = tripLegs(s.trip, homeP), k = legs.findIndex(l => l.stop.id === s.id), leg = k >= 0 ? legs[k] : null;
      drawTrail(map, k > 0 ? legs.slice(0, k) : []);
      legs.slice(0, Math.max(0, k)).forEach(l => { const e = el('pin small'); const c0 = entryCover(s.trip, l.stop.id); if (c0) e.style.backgroundImage = `url("${mediaUrl(c0.storage_path)}")`; else e.textContent = l.to.name[0]; markers.push(new maplibregl.Marker({ element: e }).setLngLat([l.to.lng, l.to.lat]).addTo(map)); });
      if (homeP && k >= 0 && legs[0].from === homeP) markers.push(new maplibregl.Marker({ element: el('pin home') }).setLngLat([homeP.lng, homeP.lat]).addTo(map));
      const cv = entryCover(s.trip, s.id), me = i_now(); // scene index (go() sets it before running the scene)
      const card = () => `<div class="scene">${cv ? `<img class="cover" src="${mediaUrl(cv.storage_path)}" alt="">` : ''}<div class="eyebrow">${esc(s.trip.title)} · ${fmtDate(s.arrived_on || s.trip.start_date)}</div><h2>${esc(s.place?.name || '')}</h2><p><b>${esc(ageLabel(child.dob, s.arrived_on || s.trip.start_date))}</b> old · ${esc(MODE_WORDS[s.mode_to_here] || s.mode_to_here)}${s.km_from_prev ? `, about ${s.km_from_prev} km` : ''}${s.stayed_at ? ` · stayed at ${esc(s.stayed_at)}` : ''}</p>${(s.weather || []).length ? `<p class="wx-line">${weatherLine(s.weather)}</p>` : ''}${s.stayed_overnight ? `<p class="stay-line">${stayLine(s)}</p>` : ''}${s.what_we_did ? `<p>${esc(s.what_we_did)}</p>` : ''}${s.what_he_saw ? `<p>${esc(name)}: ${esc(s.what_he_saw)}</p>` : ''}${s.what_he_ate ? `<p>Ate: ${esc(s.what_he_ate)}</p>` : ''}${s.what_he_hated ? `<p class="muted">Hated: ${esc(s.what_he_hated)}</p>` : ''}${s.memory ? `<div class="line">“${esc(s.memory)}”</div>` : ''}</div>`;
      const arrive = () => {
        if (i_now() !== me) return;
        if (s.place) map.flyTo({ center: [s.place.lng, s.place.lat], zoom: Math.max(map.getZoom(), s.place.kind === 'city' ? 9 : 11), pitch: 40, duration: 1400, essential: true });
        ov.innerHTML = card();
        const next = ms => { if (auto && me < scenes.length - 1) autoT = setTimeout(() => { if (auto && i_now() === me) go(me + 1); }, ms); };
        if (s.stayed_overnight && s.place) {
          const live = () => i_now() === me && !P.hidden;
          setTimeout(() => { if (!live()) return; playNight(P, map, s, me, live).then(ok => { if (ok) next(1500); }); }, 2200);
        } else next(5200);
      };
      if (leg) {
        ov.innerHTML = `<div class="scene slim"><div class="eyebrow">${esc(s.trip.title)}</div><p>${esc(name)} is on the way to <b>${esc(s.place.name)}</b>, ${esc(MODE_WORDS[leg.mode] || leg.mode || '')}${s.km_from_prev ? `, about ${s.km_from_prev} km` : ''}.</p></div>`;
        const rider = addRider(leg.mode);
        rideLeg(map, leg, rider).then(ok => { if (ok) arrive(); });
      } else {
        if (s.place) { const e = el('pin'); if (cv) e.style.backgroundImage = `url("${mediaUrl(cv.storage_path)}")`; else e.textContent = s.place.name[0]; markers.push(new maplibregl.Marker({ element: e }).setLngLat([s.place.lng, s.place.lat]).addTo(map)); }
        arrive();
      }
    }),
    // 4 firsts
    ...(d.firsts.length ? [() => { map.stop(); clearMarkers(); map.easeTo({ pitch: 60, zoom: Math.max(map.getZoom() - 2, 4), duration: 1500 });
      ov.innerHTML = `<div class="scene"><h2>Firsts</h2><div class="firsts">${d.firsts.map((f, i) => `<div class="first" style="animation-delay:${i * .25}s"><b>${f.kind === 'other' && f.note ? 'First: ' + esc(f.note) : esc(FIRSTS.find(x => x[0] === f.kind)?.[1] || f.kind)}</b><div class="muted small">${esc(f.stop.place?.name || '')} · ${esc(ageLabel(child.dob, f.stop.arrived_on || f.stop.trip.start_date))}${f.note && f.kind !== 'other' ? ' · ' + esc(f.note) : ''}</div></div>`).join('')}</div></div>`; }] : []),
    // 4b who came along (year story and family link; a single trip shows faces on its first card instead)
    ...(d.people.length && !opts.tripMode ? [() => { map.stop(); clearMarkers(); map.easeTo({ pitch: 20, duration: 1200 });
      ov.innerHTML = `<div class="scene"><h2>Who came along</h2><div class="people-scene">${d.people.map((x, k) => `<div class="pp" style="animation-delay:${k * .12}s">${avatarHtml(x.p, 'lg')}<b>${esc(x.p.name)}</b><span class="muted small">${esc(x.p.relationship || '')}${x.n > 1 ? ` · ${x.n} trips` : ''}</span></div>`).join('')}</div></div>`; }] : []),
    // 5 how far
    () => { map.stop(); clearMarkers(); map.easeTo({ pitch: 0, zoom: 3.2, center: homeP ? [homeP.lng, homeP.lat] : INDIA.center, duration: 1800 });
      const total = S.trips.length ? S.trips.reduce((a, t) => a + tripKm(t, homeP), 0) : d.km;
      ov.innerHTML = `<div class="scene"><h2>How far he has come</h2>${arcsSvg(d, homeP)}<div class="kv"><div><b>${d.km.toLocaleString('en-IN')}</b><span>km ${esc(yearWord === 'all' ? 'so far' : 'in ' + yearWord)}</span></div>${y !== 'all' && !opts.trips ? `<div><b>${total.toLocaleString('en-IN')}</b><span>km since birth</span></div>` : ''}</div></div>`; },
    // 6 photo wall
    () => { map.stop(); clearMarkers();
      const imgs = d.trips.flatMap(t => { const tc = tripOwnCover(t); return [...(tc ? [tc] : []), ...t.media.filter(m => m !== tc)].map(m => ({ m, t })); }); // each trip's cover leads its photos
      ov.innerHTML = `<div class="scene"><h2>The photos</h2>${imgs.length ? `<div class="wall">${imgs.map(({ m, t }) => `<a href="${esc(t.album_url || mediaUrl(m.storage_path))}" target="_blank" rel="noopener"><img src="${mediaUrl(m.storage_path)}" alt="${esc(t.title)}"></a>`).join('')}</div>` : '<p class="muted">No photos yet.</p>'}<p class="muted small">Each opens the trip's album. Made by Appa.</p></div>`; }
  ];
  if (opts.tripMode) {
    const t = d.trips[0], km = tripKm(t, homeP);
    scenes.splice(scenes.length - 2, 1); scenes.splice(1, 1); // no year map, no "how far" scene for a single trip
    scenes[0] = () => { map.stop(); clearMarkers(); clearTimeout(autoT);
      const pts = d.stops.filter(x => x.place).map(x => [x.place.lng, x.place.lat]); if (homeP) pts.push([homeP.lng, homeP.lat]);
      if (pts.length) map.fitBounds(pts.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0])), { padding: { top: 90, bottom: 300, left: 60, right: 60 }, maxZoom: 10, duration: 1600 });
      if (homeP) { markers.push(new maplibregl.Marker({ element: el('pin home') }).setLngLat([homeP.lng, homeP.lat]).addTo(map)); const r = addRider(tripLegs(t, homeP)[0]?.mode || 'car'); const st = tripStart(t, homeP); r.marker.setLngLat([st.lng, st.lat]); }
      ov.innerHTML = `<div class="scene center"><div class="eyebrow">${esc(name)}</div><div class="big trip-title">${esc(t.title)}</div><div class="line">${fmtDate(t.start_date)} – ${fmtDate(t.end_date)} · ${esc(ageLabel(child.dob, t.start_date))} old</div><p class="muted">${d.stops.length} place${d.stops.length === 1 ? '' : 's'} · about ${Math.round(km).toLocaleString('en-IN')} km${t.return_mode ? ', there and back' : ''}</p>${(t.people || []).length ? `<div class="with-line">${facesHtml(t.people, 8)}<span>With ${esc(namesLine(t.people))}</span></div>` : ''}</div>`;
      if (auto) autoT = setTimeout(() => { if (auto && i_now() === 0) go(1); }, 3200); };
  }
  let i = 0; const i_now = () => i;
  const go = n => { i = Math.max(0, Math.min(scenes.length - 1, n)); dots.innerHTML = scenes.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join(''); scenes[i](); $('#player-prev').disabled = i === 0; $('#player-next').textContent = i === scenes.length - 1 ? 'Again' : 'Next'; };
  $('#player-next').onclick = () => { stopAuto(); go(i === scenes.length - 1 ? 0 : i + 1); };
  $('#player-prev').onclick = () => { stopAuto(); go(i - 1); };
  $('#player-exit').onclick = () => { stopAuto(); map.stop(); clearMarkers(); P.hidden = true; if (opts.onExit) opts.onExit(); };
  let x0 = null; P.ontouchstart = e => x0 = e.touches[0].clientX; P.ontouchend = e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 60) { stopAuto(); go(dx < 0 ? i + 1 : i - 1); } x0 = null; };
  document.onkeydown = e => { if (P.hidden) return; if (e.key === 'ArrowRight') { stopAuto(); go(i + 1); } if (e.key === 'ArrowLeft') { stopAuto(); go(i - 1); } if (e.key === 'Escape') $('#player-exit').click(); };
  const start = () => { map.resize(); go(0); };
  if (S.playerReady) start(); else map.once('load', () => { S.playerReady = true; start(); }); // map.loaded() is false while the map is moving, so a second story could never start
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
let pendingPeople = new Set();
// Faces you tap to say who came along. In the trip form it is local until Save; in the trip sheet each tap saves.
function pickerHtml(selected) {
  if (!S.people.length) return '<p class="muted small">No people yet. <button type="button" class="linkbtn" data-add-person>Add the people who travel with him</button></p>';
  return S.people.map(x => `<button type="button" class="pick${selected.has(x.id) ? ' on' : ''}" data-pick="${x.id}" aria-pressed="${selected.has(x.id)}">${avatarHtml(x)}<span>${esc(x.name)}</span></button>`).join('') + '<button type="button" class="pick add" data-add-person aria-label="Add a person"><span class="pav plus">+</span><span>Add</span></button>';
}
function renderFormPeople() {
  const box = $('#t-people'); box.innerHTML = pickerHtml(pendingPeople);
  $$('#t-people [data-pick]').forEach(b => b.onclick = () => { const id = b.dataset.pick; pendingPeople.has(id) ? pendingPeople.delete(id) : pendingPeople.add(id); renderFormPeople(); });
  $$('#t-people [data-add-person]').forEach(b => b.onclick = () => openPersonEditor(null, { inEditor: true }));
}
function renderTripPeople(trip) {
  const box = $('#trip-people'); if (!box) return;
  const sel = new Set((trip.people || []).map(x => x.id)); box.innerHTML = pickerHtml(sel);
  $$('#trip-people [data-pick]').forEach(b => b.onclick = async () => {
    const id = b.dataset.pick, on = sel.has(id); b.disabled = true;
    const r = on ? await sb.from('trip_person').delete().eq('trip_id', trip.id).eq('person_id', id) : await sb.from('trip_person').insert({ trip_id: trip.id, person_id: id });
    if (r.error) { b.disabled = false; return toast(r.error.message, 4000); }
    await refresh(); const fresh = S.trips.find(t => t.id === trip.id); if (fresh) { renderTripPeople(fresh); trip.people = fresh.people; }
    const pr = S.people.find(x => x.id === id); toast(on ? `${pr?.name || 'Removed'} taken off this trip` : `${pr?.name || 'Added'} came along`);
  });
  $$('#trip-people [data-add-person]').forEach(b => b.onclick = () => openPersonEditor(null, { afterSave: () => openTripSheet(S.trips.find(t => t.id === trip.id) || trip) }));
}
function renderPeopleCard() {
  const box = $('#people-list');
  box.innerHTML = S.people.length ? S.people.map(x => `<button type="button" class="person-row" data-person="${x.id}">${avatarHtml(x)}<span><b>${esc(x.name)}</b><span class="muted small">${esc(x.relationship || 'No relationship set')} · ${tripsWith(x.id).length} trip${tripsWith(x.id).length === 1 ? '' : 's'}</span></span><span class="muted small">Edit</span></button>`).join('') : '<p class="muted small">Nobody yet. Add Amma, Appa, Paati… then tap their faces on each trip.</p>';
  $$('#people-list [data-person]').forEach(b => b.onclick = () => openPersonEditor(S.people.find(x => x.id === b.dataset.person)));
}
function renderPeople() {
  const box = $('#people-grid');
  const rows = S.people.map(x => ({ p: x, trips: tripsWith(x.id) })).sort((a, b) => b.trips.length - a.trips.length || a.p.name.localeCompare(b.p.name));
  $('#people-sub').textContent = S.people.length ? `${S.people.length} ${S.people.length === 1 ? 'person' : 'people'} across ${S.trips.length} trip${S.trips.length === 1 ? '' : 's'}` : '';
  box.innerHTML = rows.length ? rows.map(({ p: x, trips }) => `<button type="button" class="person-card" data-person="${x.id}">${avatarHtml(x, 'lg')}<b>${esc(x.name)}</b><span class="rel">${esc(x.relationship || '')}</span><span class="muted small">${trips.length ? `${trips.length} trip${trips.length === 1 ? '' : 's'} together<br>first: ${esc(trips[0].title)}, ${esc(ageLabel(S.child.dob, trips[0].start_date))} old` : 'No trips yet'}</span></button>`).join('') : '<div class="card"><p>Nobody here yet.</p><p class="muted">Add the people who travel with him: name, how they are related, and a photo if you have one.</p></div>';
  $$('#people-grid [data-person]').forEach(b => b.onclick = () => openPersonSheet(S.people.find(x => x.id === b.dataset.person)));
}
function openPersonSheet(x) {
  const trips = tripsWith(x.id);
  openSheet(`<div class="person-head">${avatarHtml(x, 'xl')}<div><h2>${esc(x.name)}</h2><p class="muted">${esc(x.relationship || '')}</p></div></div>
    <div class="stat-row"><span><b>${trips.length}</b> trip${trips.length === 1 ? '' : 's'}</span><span><b>${Math.round(trips.reduce((a, t) => a + tripKm(t), 0)).toLocaleString('en-IN')}</b> km together</span></div>
    <div class="actions"><button class="btn" id="btn-edit-person" type="button">Edit</button></div>
    ${trips.length ? trips.map(t => `<div class="visit" data-trip="${t.id}">${tripCover(t) ? `<img src="${mediaUrl(tripCover(t).storage_path)}" alt="">` : '<div class="ph"></div>'}<div><b>${esc(t.title)}</b><div class="muted small">${fmtDate(t.start_date)}</div></div><div class="age">${ageLabel(S.child.dob, t.start_date)}</div></div>`).join('') : '<p class="muted">No trips together yet. Open a trip and tap their face.</p>'}`);
  $('#btn-edit-person').onclick = () => openPersonEditor(x);
  $$('#sheet .visit').forEach(el => el.onclick = () => openTripSheet(S.trips.find(t => t.id === el.dataset.trip)));
}
let pendingPersonPhoto = null;
function openPersonEditor(x, opts = {}) {
  pendingPersonPhoto = null;
  const html = `<h2>${x ? 'Edit ' + esc(x.name) : 'Add a person'}</h2>
    <div class="photo-row"><span id="pe-avatar">${avatarHtml(x || { name: '?' }, 'xl')}</span><div class="actions"><label class="btn" for="pe-photo">${x?.photo_path ? 'Change photo' : 'Add photo'}</label></div></div>
    <input id="pe-photo" type="file" accept="image/*" hidden>
    <label for="pe-name">Name</label><input id="pe-name" type="text" value="${esc(x?.name || '')}" placeholder="Paati" autocomplete="off">
    <label for="pe-rel">Relationship to ${esc(S.child?.name || 'him')}</label><input id="pe-rel" type="text" list="pe-rels" value="${esc(x?.relationship || '')}" placeholder="Grandmother, Chithi, friend…" autocomplete="off">
    <datalist id="pe-rels">${RELATIONS.map(r => `<option value="${r}">`).join('')}</datalist>
    <div class="actions"><button class="btn primary" id="pe-save" type="button">Save</button><button class="btn" id="pe-cancel" type="button">Cancel</button>${x ? '<button class="btn danger" id="pe-del" type="button">Remove</button>' : ''}</div>`;
  if (opts.inEditor) { $('#person-inline').innerHTML = `<div class="card">${html}</div>`; $('#person-inline').hidden = false; $('#person-inline').scrollIntoView({ block: 'center' }); }
  else openSheet(html);
  const root = opts.inEditor ? '#person-inline ' : '#sheet ';
  const done = () => { if (opts.inEditor) { $('#person-inline').hidden = true; $('#person-inline').innerHTML = ''; } else closeSheet(); };
  $(root + '#pe-photo').onchange = async e => { const f = e.target.files[0]; if (!f) return; pendingPersonPhoto = await compressSquare(f, 360); $(root + '#pe-avatar').innerHTML = `<span class="pav xl" style="background-image:url('${URL.createObjectURL(pendingPersonPhoto.blob)}')"></span>`; };
  $(root + '#pe-name').addEventListener('input', e => { if (!pendingPersonPhoto && !x?.photo_path) $(root + '#pe-avatar').innerHTML = avatarHtml({ name: e.target.value || '?' }, 'xl'); });
  $(root + '#pe-cancel').onclick = done;
  $(root + '#pe-save').onclick = async () => {
    const btn = $(root + '#pe-save'); const name = $(root + '#pe-name').value.trim(); if (!name) return toast('Add a name');
    btn.disabled = true;
    try {
      const payload = { name, relationship: $(root + '#pe-rel').value.trim() || null, updated_at: new Date().toISOString() };
      if (pendingPersonPhoto) { const path = `people/${uuid()}.jpg`; const up = await sb.storage.from(BUCKET).upload(path, pendingPersonPhoto.blob, { contentType: 'image/jpeg', cacheControl: '2592000', upsert: false }); if (up.error) throw up.error; payload.photo_path = path; }
      const r = x ? await sb.from('person').update(payload).eq('id', x.id).select().single() : await sb.from('person').insert({ ...payload, child_id: S.child.id }).select().single();
      if (r.error) throw r.error; if (!r.data?.id) throw new Error('Not saved. Try again.');
      await refresh(); done(); toast(x ? 'Saved' : `${name} added`);
      if (opts.inEditor) { pendingPeople.add(r.data.id); renderFormPeople(); }
      if (opts.afterSave) opts.afterSave(r.data);
      if (!$('#view-settings').hidden) renderSettings(); if (!$('#view-people').hidden) renderPeople();
    } catch (err) { toast(err.message || String(err), 4000); btn.disabled = false; }
  };
  if (x) $(root + '#pe-del').onclick = async () => {
    const n = tripsWith(x.id).length;
    if (!(await ask(`Remove ${x.name}?${n ? ` They will be taken off ${n} trip${n === 1 ? '' : 's'}.` : ''} Trips and photos stay.`, `Remove ${x.name}`, 'Keep'))) return;
    const r = await sb.from('person').delete().eq('id', x.id); if (r.error) return toast(r.error.message, 4000);
    await refresh(); done(); toast(`${x.name} removed`); if (!$('#view-settings').hidden) renderSettings(); if (!$('#view-people').hidden) renderPeople();
  };
}
$('#btn-add-person').onclick = () => openPersonEditor(null);
$('#btn-add-person-2').onclick = () => openPersonEditor(null);
function renderBrandPhoto() { const d = $('.brand .dot'); const u = riderFaceUrl(S.child); d.classList.toggle('photo', !!u); d.style.backgroundImage = u ? `url("${u}")` : ''; }
function renderPhotoCard() {
  const u = riderFaceUrl(S.child), av = $('#child-photo-preview');
  av.style.backgroundImage = u ? `url("${u}")` : ''; av.textContent = u ? '' : (S.child?.name || '?').slice(0, 1);
  $('#child-photo-remove').hidden = !u;
  const box = $('#rider-preview'); box.innerHTML = '';
  ['car', 'train', 'flight', 'bus', 'boat', 'bike', 'walk'].forEach(m => { const f = document.createElement('figure'); f.appendChild(riderEl(m, u, (S.child?.name || '?').slice(0, 1))); const c = document.createElement('figcaption'); c.textContent = MODE_WORDS[m]; f.appendChild(c); box.appendChild(f); });
}
async function compressSquare(file, size = 480, q = 0.86) {
  const bmp = await createImageBitmap(file); const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas'); c.width = c.height = Math.min(size, side);
  c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); return { blob, w: c.width, h: c.height };
}
$('#child-photo').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    toast('Uploading his photo…');
    const ph = await compressSquare(f); const path = `profile/${uuid()}.jpg`;
    const up = await sb.storage.from(BUCKET).upload(path, ph.blob, { contentType: 'image/jpeg', cacheControl: '2592000', upsert: false }); if (up.error) throw up.error;
    const r = await sb.from('child').update({ photo_path: path, updated_at: new Date().toISOString() }).eq('id', S.child.id).select('photo_path').single(); if (r.error) throw r.error;
    if (r.data.photo_path !== path) throw new Error('Photo not saved. Try again.'); // the old photo file stays in storage; nothing is deleted
    await refresh(); renderSettings(); renderBrandPhoto(); toast('Photo saved');
  } catch (err) { toast(err.message || String(err), 4000); }
  finally { e.target.value = ''; }
});
$('#child-photo-remove').onclick = async () => {
  const r = await sb.from('child').update({ photo_path: null, updated_at: new Date().toISOString() }).eq('id', S.child.id); if (r.error) return toast(r.error.message);
  await refresh(); renderSettings(); renderBrandPhoto(); toast('Photo removed');
};
function renderSettings() {
  renderPhotoCard(); renderPeopleCard();
  $('#child-name').value = S.child?.name || ''; $('#child-dob').value = S.child?.dob || '';
  const h = home(); $('#child-home-current').textContent = h ? `Home today: ${h.name}, ${placeLine(h)}` : 'No home set yet.'; $('#child-home').value = ''; $('#child-home-json').value = '';
  const used = S.media.reduce((a, m) => a + (m.bytes || 0), 0); $('#storage-used').textContent = `${(used / 1048576).toFixed(1)} MB of 1,024 MB used · ${S.media.length} photo${S.media.length === 1 ? '' : 's'}`; $('#storage-bar').style.width = Math.min(100, used / 1073741824 * 100) + '%';
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
  const trips = (data.trips || []).map(t => ({ ...t, stops: sortStops((t.stops || []).map(s => ({ ...s, milestones: s.milestones || [] })), t), media: t.media || [], people: t.people || [] }));
  // Ages come precomputed from the server; the child's date of birth never leaves the database on this path.
  const child = { name: data.child_name, dob: null, photo_path: data.child_photo || null };
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
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await loadAll(); lastErr = null; break; }
    catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); }
  }
  if (lastErr) {
    const m = lastErr.message || String(lastErr);
    $('#view-auth').hidden = false;
    $('#auth-msg').innerHTML = /issued at future/i.test(m)
      ? 'Signed in, but the server rejected the fresh token for a moment (clock skew on Supabase\'s side). <a href="#" id="auth-retry">Try again</a>.'
      : /schema/i.test(m)
        ? 'Could not read the database: ' + esc(m) + '. The "memories" schema must be exposed in Supabase → Project Settings → Data API.'
        : 'Could not read the database: ' + esc(m) + '. <a href="#" id="auth-retry">Try again</a>.';
    const r = $('#auth-retry'); if (r) r.onclick = ev => { ev.preventDefault(); location.reload(); };
    return;
  }
  if (!S.child) { $('#view-auth').hidden = true; $('#view-setup').hidden = false; return; }
  $('#view-setup').hidden = true; $('#view-auth').hidden = true;
  $('#topbar').hidden = false; $('#main').hidden = false; $('#bottomnav').hidden = false; $('#fab').hidden = false;
  $('#brand-name').textContent = `${S.child.name}'s map`; renderBrandPhoto();
  renderYearChips(); initMap(); show('map');
}
boot();
})();
