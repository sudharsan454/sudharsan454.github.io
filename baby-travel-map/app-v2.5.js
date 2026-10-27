/* Baby Travel Map · app logic · v2.5 · 27 Oct 2026 · v2.5: Activities per entry: a multi-select dropdown with 36 activities in 6 groups plus Other (own words); each has its own drawing, shown as a tile on the card, the trip sheet, the pins and the timeline, and played as a short animated postcard above the place after the card opens in the story (no faces), before the night. v2.4 · 13 Oct 2026 · v2.4: two more stay types: Overnight journey (the night falls during the ride, he sleeps on the train or bus, dawn on arrival, no house; that ride is a little slower so the night is seen) and Mutt (a mutt icon with lit windows); the night layer now sits under the map pins and the vehicle so they stay visible at night; fix: the night skipped one scene check after the stay icon. v2.3 · 13 Oct 2026 · v2.3: 'Stayed the night here' (family home / hotel / homestay, nights from the dates) plays as a night in the story: the stay icon pops up, the map fades to night with stars and a moon, the window lights, then dawn before the next leg; weather per entry (12 options, chosen by hand) plays as rain, drizzle, storm, snow, wind, fog, cloud, heat, cold and haze over the map, and shows on cards. v2.2 · 13 Oct 2026 · v2.2: People. Add the people in his life (name, relationship, photo) in Settings or the new People tab; tap their faces on a trip to say who came along; the People tab shows everyone across all trips; trips, the timeline, the trip story, the year story and the family link show the faces. v2.1 · 13 Oct 2026 · v2.1: a trip starts from home (or an optional 'Started from' place) and can close the loop: 'Back home after this' on the last entry asks how you reached home, when and how far; the ride, the map route, the trip sheet and every km total include the way back. v2.0 · 13 Oct 2026 · v2.0: his profile photo (Settings); 'Play this trip' and the year story move him along a dotted route from home through each place, sitting in the actual vehicle (car, train, plane, bus, boat, two-wheeler, pram for on foot) with his face in the window; the open trip's route is drawn dotted on the main map. v1.9 · 13 Oct 2026 · v1.9: 'The story should linger here' checkbox removed (it did nothing in the story); the highlight column is no longer written. v1.8 · 13 Oct 2026 · v1.8: date pickers no longer block or move dates (no min/max, no auto-clamping); a new entry fills only Arrived (= the day the previous entry ended), Left stays empty; all date rules run at Save; an entry outside its trip offers 'Extend the trip and save'. v1.7 · 13 Oct 2026 · v1.7: trip cover photo (in the trip form) + entry cover (an entry's own photo wins wherever that entry is shown; falls back to the trip cover, then the place's first letter); 'Make cover' on entry thumbnails; one pin per place shows the latest visit's cover; deleting an entry deletes its photos. v1.6 · 13 Oct 2026 · v1.6: a new entry starts on the day the previous entry ended; one info line under the dates shows the previous entry's place and dates, with a tap to start from it. v1.5 · 13 Oct 2026 · v1.5: Reorder now saves (v1.4 changed the order in memory before comparing, so nothing was written) and re-reads to confirm; dates are validated as you pick them: To/Left can't be before From/Arrived, and an entry's dates must sit inside its trip's From–To; trip dates no longer change on their own. v1.4 · 13 Oct 2026 · v1.4: entries always in date order (same-day entries in your chosen order) in the trip, the editor and the story; Reorder mode in the trip sheet; trip dates follow its entries; 'Left' before 'Arrived' is refused; km recalculated after a reorder unless you typed it. v1.3 · 12 Oct 2026 · v1.3: places the geocoder does not know (villages like Vallichunai) can be added by hand: pick the nearest town, tap the map, done. v1.2 · 12 Oct 2026 · v1.2: 'What he ate' on every entry; 'Another first' and purpose 'Other' open a text box for your own words. v1.1 · 12 Oct 2026 · v1.1: retry the first load up to 3 times (Supabase can reject a token for ~1 s after sign-in with 'JWT issued at future'); clearer error text. v1.0 · 10 Oct 2026 · Claude for Sudharsan R
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
    if (visits.some(v => v.stop.stayed_overnight && v.stop.stay_kind !== 'journey')) { const b = document.createElement('span'); b.className = 'stay-badge'; b.textContent = '🛏'; b.title = 'Stayed the night here'; el.appendChild(b); }
    { const acts = [...new Set(visits.flatMap(v => actKeep(v.stop.activities)))]; if (acts.length) { const b = document.createElement('span'); b.className = 'act-badge'; b.innerHTML = actIco(acts[0]) + (acts.length > 1 ? `<i>+${acts.length - 1}</i>` : ''); b.title = acts.map(actLabel).join(', '); el.appendChild(b); } }
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
      <dl>${s.stayed_overnight ? `<dt>Night</dt><dd>${stayLine(s)}</dd>` : (s.stayed_at ? `<dt>Stayed</dt><dd>${esc(s.stayed_at)}</dd>` : '')}${(s.weather || []).length ? `<dt>Weather</dt><dd>${weatherLine(s.weather)}</dd>` : ''}${actKeep(s.activities).length ? `<dt>Activities</dt><dd class="act-dd">${actLine(s.activities)}</dd>` : ''}${s.what_we_did ? `<dt>We did</dt><dd>${esc(s.what_we_did)}</dd>` : ''}${s.what_he_saw ? `<dt>He did</dt><dd>${esc(s.what_he_saw)}</dd>` : ''}${s.what_he_hated ? `<dt>He hated</dt><dd>${esc(s.what_he_hated)}</dd>` : ''}${s.what_he_ate ? `<dt>He ate</dt><dd>${esc(s.what_he_ate)}</dd>` : ''}</dl>
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
    html += `<div class="visit" data-trip="${t.id}">${cv ? `<img src="${mediaUrl(cv.storage_path)}" alt="">` : '<div class="ph"></div>'}<div><b>${esc(t.title)}</b><div class="muted small">${esc(places)}<br>${fmtDate(t.start_date)} · ${[...new Set(t.stops.map(s => MODE_WORDS[s.mode_to_here]))].join(', ')}</div>${(() => { const a = [...new Set(t.stops.flatMap(s => actKeep(s.activities)))]; return a.length ? `<div class="tl-acts">${a.slice(0, 8).map(v => actIco(v)).join('')}${a.length > 8 ? `<span class="muted small">+${a.length - 8}</span>` : ''}</div>` : ''; })()}${facesHtml(t.people || [])}</div><div class="age">${ageLabel(S.child.dob, t.start_date)}</div></div>`;
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
  stayKind = stop?.stay_kind || guessStayKind(stop?.stayed_at); pendingWeather = new Set(stop?.weather || []); renderWeatherChips(); loadActs(stop?.activities);
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
      const entry = { trip_id: trip.id, place_id: place.id, seq: ed.stop ? ed.stop.seq : (Math.max(0, ...trip.stops.map(s => s.seq || 0)) + 1), arrived_on: $('#e-arrived').value || null, left_on: $('#e-left').value || null, mode_to_here: $('#e-mode').value, km_from_prev: km, stayed_at: $('#e-stayed').value.trim() || null, stayed_overnight: $('#e-overnight').checked, stay_kind: $('#e-overnight').checked ? stayKind : null, weather: [...pendingWeather].filter(k => WX[k]), activities: readActs(), what_we_did: $('#e-did').value.trim() || null, what_he_saw: $('#e-saw').value.trim() || null, what_he_hated: $('#e-hated').value.trim() || null, what_he_ate: $('#e-ate').value.trim() || null, memory: $('#e-memory').value.trim() || null };
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
  const dur = Math.max(opts.minDur || 2200, Math.min(5200, 1800 + km * 3)); // an overnight journey rides a little slower so the night is seen
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
const STAYS = { home: ['🏠', 'Family home'], hotel: ['🏨', 'Hotel'], homestay: ['🏡', 'Homestay'], mutt: ['🛕', 'Mutt'], journey: ['🌙', 'Overnight journey'] };
const nightsOf = s => { if (!s.stayed_overnight) return 0; const a = s.arrived_on, l = s.left_on; if (!a || !l || l <= a) return 1; return Math.max(1, Math.round((new Date(l) - new Date(a)) / 86400000)); };
const stayLine = s => { if (!s.stayed_overnight) return ''; const st = STAYS[s.stay_kind] || STAYS.home; const n = nightsOf(s); if (s.stay_kind === 'journey') return `${st[0]} Overnight journey${s.mode_to_here ? ' ' + esc(MODE_WORDS[s.mode_to_here] || s.mode_to_here) : ''} · ${n} night${n === 1 ? '' : 's'}`; return `${st[0]} ${s.stayed_at ? esc(s.stayed_at) : st[1]} · ${n} night${n === 1 ? '' : 's'}`; };
const guessStayKind = txt => /\b(mutt|mutts|matha|math|mutham|ashram|madam|mattha)\b/i.test(txt || '') ? 'mutt' : /overnight|sleeper|on the (train|bus)|night (train|bus|journey)|in the (train|bus)/i.test(txt || '') ? 'journey' : /hotel|resort|inn|lodge|residency|suites?\b/i.test(txt || '') ? 'hotel' : /homestay|home stay|airbnb|cottage/i.test(txt || '') ? 'homestay' : 'home';
// The stay icon drawn like the vehicles: a house, a hotel, a homestay, each with one window that lights up at night.
const STAY_SVG = {
  home: '<path d="M8 30 L32 10 L56 30 L56 56 L8 56 Z" fill="#f2b544"/><path d="M4 32 L32 8 L60 32" stroke="#c4462f" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="26" y="40" width="12" height="16" rx="2" fill="#7a4a1c"/><rect class="win" x="14" y="34" width="9" height="9" rx="1.5"/><rect class="win" x="41" y="34" width="9" height="9" rx="1.5"/>',
  hotel: '<rect x="12" y="8" width="40" height="48" rx="3" fill="#d99a2b"/><rect x="8" y="52" width="48" height="4" fill="#7a4a1c"/><rect class="win" x="18" y="14" width="8" height="7"/><rect class="win" x="38" y="14" width="8" height="7"/><rect class="win" x="18" y="26" width="8" height="7"/><rect class="win" x="38" y="26" width="8" height="7"/><rect x="27" y="40" width="10" height="16" fill="#7a4a1c"/><rect x="20" y="2" width="24" height="7" rx="2" fill="#c4462f"/>',
  mutt: '<rect x="6" y="50" width="52" height="6" rx="1" fill="#b5651d"/><rect x="10" y="36" width="44" height="14" fill="#f3e2c0"/><path d="M14 36 L18 26 L46 26 L50 36 Z" fill="#e07b39"/><path d="M19 26 L23 17 L41 17 L45 26 Z" fill="#f2b544"/><path d="M24 17 L27 9 L37 9 L40 17 Z" fill="#e07b39"/><circle cx="32" cy="6" r="3" fill="#f2b544"/><path d="M28 50 L28 42 Q32 37 36 42 L36 50 Z" fill="#7a4a1c"/><rect class="win" x="15" y="40" width="7" height="7" rx="1.5"/><rect class="win" x="42" y="40" width="7" height="7" rx="1.5"/><path d="M4 50 L4 30 M60 50 L60 30" stroke="#c4462f" stroke-width="2"/><path d="M4 30 L12 33 L4 36 Z M60 30 L52 33 L60 36 Z" fill="#e07b39"/>',
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
  if (kind === 'journey') lbl.innerHTML = `${st[0]} Overnight journey${n > 1 ? ` × ${n}` : ''}`;
  const wait = ms => new Promise(r => setTimeout(r, reducedMotion() ? Math.min(ms, 400) : ms));
  return (async () => {
    P.classList.add('has-stay'); stayEl.classList.add('pop'); await wait(700); if (!isLive()) return false; // he goes inside: the vehicle fades, the house takes its place
    layer.classList.add('on'); P.classList.add('is-night'); S.weather && S.weather.setNight(true); await wait(1300); if (!isLive()) return false;
    lbl.classList.add('on'); await wait(2400); if (!isLive()) return false;
    lbl.classList.remove('on'); layer.classList.remove('on'); P.classList.remove('is-night'); layer.classList.add('dawn'); S.weather && S.weather.setNight(false); await wait(1300); layer.classList.remove('dawn');
    return isLive();
  })();
}
// Overnight journey: night falls during the ride (he sleeps on the train or bus), dawn when he arrives. No house.
function journeyNightOn(P, s) {
  const lbl = $('#player-night-label'), n = nightsOf(s);
  lbl.innerHTML = `🌙 Overnight journey${s.mode_to_here ? ' ' + esc(MODE_WORDS[s.mode_to_here] || '') : ''}${n > 1 ? ` · ${n} nights` : ''}`;
  $('#player-night').classList.add('on'); P.classList.add('is-night', 'journey-night'); S.weather && S.weather.setNight(true);
  setTimeout(() => { if (P.classList.contains('journey-night')) lbl.classList.add('on'); }, 900);
}
function journeyDawn(P) {
  const layer = $('#player-night'), lbl = $('#player-night-label');
  if (!P.classList.contains('journey-night')) return;
  lbl.classList.remove('on'); layer.classList.remove('on'); P.classList.remove('is-night', 'journey-night'); layer.classList.add('dawn'); S.weather && S.weather.setNight(false);
  setTimeout(() => layer.classList.remove('dawn'), 1300);
}
function resetNight(map) {
  const layer = $('#player-night'), stayEl = $('#player-stay'), lbl = $('#player-night-label');
  if (!layer) return; layer.classList.remove('on', 'dawn'); lbl.classList.remove('on'); $('#player').classList.remove('is-night', 'has-stay', 'journey-night');
  stayEl.hidden = true; stayEl.classList.remove('pop'); stayEl.innerHTML = '';
  if (map && map._bbStayMove) { map.off('move', map._bbStayMove); map._bbStayMove = null; }
}

// ---------- v2.5 activities ----------
// Chosen per entry from a multi-select dropdown (36 + your own words). Each activity has one drawing: a small tile in the
// dropdown, the card, the trip sheet, the pins and the timeline, and the same drawing animated as a short scene in the story.
// No faces anywhere: people are plain silhouettes. Own words are stored as 'custom:<text>' and use the star drawing.
const ACT_DRAW = (() => { // drawing helpers stay local
const INK = '#2f3b48';
const FIG = (x, y, s = 1, c = INK) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="-19" r="4.3" fill="${c}"/><path d="M0-14.5V-4M0-11.5l-5 5M0-11.5l5 5M0-4l-4 8M0-4l4 8" stroke="${c}" stroke-width="2.6" stroke-linecap="round" fill="none"/></g>`;
const SIT = (x, y, s = 1, c = INK) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="-15" r="4.3" fill="${c}"/><path d="M0-10.5V-2H7V5M0-8l5 4" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>`;
const TREE = (x, y, s = 1, cls = '') => `<g class="${cls}" style="transform-origin:${x}px ${y}px"><path d="M${x} ${y}V${y - 6 * s}" stroke="#7a4a1c" stroke-width="${2.4 * s}"/><path d="M${x} ${y - 26 * s}L${x - 9 * s} ${y - 12 * s}H${x - 4 * s}L${x - 11 * s} ${y - 4 * s}H${x + 11 * s}L${x + 4 * s} ${y - 12 * s}H${x + 9 * s}Z" fill="#3f7f4f"/></g>`;
const PALM = (x, y) => `<path d="M${x} ${y}Q${x + 3} ${y - 14} ${x + 1} ${y - 26}" stroke="#7a4a1c" stroke-width="2.4" fill="none"/><g class="a-sway" style="transform-origin:${x + 1}px ${y - 26}px"><path d="M${x + 1} ${y - 26}q-10-2-15 5M${x + 1} ${y - 26}q10-2 15 5M${x + 1} ${y - 26}q-6-8-14-7M${x + 1} ${y - 26}q6-8 14-7" stroke="#3f7f4f" stroke-width="3" fill="none" stroke-linecap="round"/></g>`;
const CLOUD = (x, y, s = 1, c = '#fff') => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="9" ry="4.5" fill="${c}"/><ellipse cx="-5" cy="-2" rx="5" ry="4" fill="${c}"/><ellipse cx="4" cy="-3.5" rx="6" ry="5" fill="${c}"/></g>`;
const BIRD = (x, y) => `<path d="M${x - 4} ${y}q2-3 4 0q2-3 4 0" stroke="${INK}" stroke-width="1.4" fill="none"/>`;
const T = (bg, body) => `<rect width="96" height="72" fill="${bg}"/>${body}`;
return {
  trek: T('#cfe6f5', `<path d="M2 72L40 14L78 72Z" fill="#6f9a5a"/><path d="M40 14L31 27L36 25L40 29L44 25L49 27Z" fill="#fff"/><path d="M58 72L78 38L96 66V72Z" fill="#88b06c"/><path d="M22 66L34 56L26 48L36 38L32 32L39 22" stroke="#f3e2c0" stroke-width="2" fill="none" stroke-linecap="round" stroke-dasharray="3 3"/><path d="M40 14V3" stroke="#7a4a1c" stroke-width="1.6"/><path class="a-flag" d="M40 3L50 6L40 9Z" fill="#e26d5a" style="transform-origin:40px 6px"/><g class="a-climb">${FIG(22, 66, .62)}</g>`),
  waterfall: T('#cfe6f5', `<path d="M0 10H35V72H0Z" fill="#8a6a4a"/><path d="M61 10H96V72H61Z" fill="#8a6a4a"/><path d="M0 12Q12 2 36 10M60 10Q80 2 96 12" stroke="#5f8f4e" stroke-width="6" fill="none"/><rect x="35" y="10" width="26" height="50" fill="#9fd3f0"/><g stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"><path class="a-flow" d="M39 10V58"/><path class="a-flow f2" d="M44 10V58"/><path class="a-flow" d="M49 10V58"/><path class="a-flow f2" d="M54 10V58"/><path class="a-flow" d="M58 10V58"/></g><ellipse cx="48" cy="63" rx="30" ry="7" fill="#7cc1e6"/><ellipse class="a-ripple" cx="48" cy="61" rx="11" ry="3" fill="none" stroke="#fff" stroke-width="1.4"/><g fill="#fff"><circle class="a-twinkle" cx="40" cy="57" r="2"/><circle class="a-twinkle d2" cx="56" cy="56" r="2.4"/><circle class="a-twinkle d3" cx="48" cy="54" r="1.6"/></g>${FIG(14, 70, .6)}`),
  beach: T('#cfe6f5', `<circle class="a-glow" cx="80" cy="14" r="7" fill="#f2b544"/><rect y="30" width="96" height="18" fill="#5fb0d8"/><path class="a-drift" d="M-20 36q5-3 10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0" stroke="#fff" stroke-width="1.6" fill="none"/><path d="M0 46Q30 40 96 46V72H0Z" fill="#f0d79a"/><path d="M24 70V38" stroke="#7a4a1c" stroke-width="1.6"/><path d="M8 40Q24 24 40 40Z" fill="#e26d5a"/><path d="M16 40Q24 26 32 40Z" fill="#fff"/><g class="a-bob">${FIG(62, 68, .62)}</g>`),
  viewpoint: T('#d8ecf7', `<g class="a-drift">${CLOUD(30, 14, .9)}${CLOUD(70, 10, .7)}</g><path d="M0 52Q20 30 44 48T96 40V72H0Z" fill="#9bb7a0"/><path d="M0 62Q24 48 50 60T96 56V72H0Z" fill="#6f9a5a"/><path d="M58 46H96V72H58Z" fill="#8a6a4a"/><path d="M60 46V38M72 46V38M84 46V38M60 39H96" stroke="#5a3d22" stroke-width="1.6"/>${FIG(78, 46, .55)}${BIRD(20, 22)}${BIRD(30, 18)}`),
  forest: T('#dbeed3', `<rect y="58" width="96" height="14" fill="#6f9a5a"/>${TREE(12, 60, 1.2, 'a-sway')}${TREE(34, 62, 1.5, 'a-sway d2')}${TREE(66, 61, 1.3, 'a-sway d3')}${TREE(86, 60, 1.1, 'a-sway')}<g class="a-walk">${FIG(48, 68, .55)}</g>`),
  lake: T('#cfe6f5', `<path d="M0 36Q18 18 36 34T70 28T96 34V44H0Z" fill="#88b06c"/><ellipse cx="48" cy="56" rx="50" ry="16" fill="#7cc1e6"/><ellipse class="a-ripple" cx="34" cy="56" rx="9" ry="2.5" fill="none" stroke="#fff" stroke-width="1.2"/><ellipse class="a-ripple d2" cx="62" cy="60" rx="9" ry="2.5" fill="none" stroke="#fff" stroke-width="1.2"/><g class="a-bob"><path d="M50 52h10q0 5-6 5h-4q-3 0-3-3z" fill="#fff"/><circle cx="59" cy="49" r="2.6" fill="#fff"/><path d="M61 49h3" stroke="#f2b544" stroke-width="1.4"/></g><g class="a-bob d2"><path d="M22 58h8q0 4-5 4h-3q-2 0-2-2z" fill="#fff"/><circle cx="29" cy="55.5" r="2.2" fill="#fff"/></g>`),
  sunrise: T('#f7d6a8', `<rect width="96" height="20" fill="#f2c08a"/><g class="a-sunup"><circle cx="48" cy="46" r="13" fill="#f29a3a"/><g stroke="#f2b544" stroke-width="2" stroke-linecap="round" class="a-twinkle"><path d="M48 26V20M30 34l-4-4M66 34l4-4M24 46h-6M72 46h6"/></g></g><rect y="46" width="96" height="26" fill="#5c7fa3"/><path d="M30 52h36M38 58h20M44 64h8" stroke="#f2b544" stroke-width="1.6" stroke-linecap="round"/>${SIT(18, 52, .55)}`),
  camping: T('#2c3a55', `<g fill="#fff"><circle class="a-twinkle" cx="12" cy="10" r="1.2"/><circle class="a-twinkle d2" cx="34" cy="6" r="1"/><circle class="a-twinkle d3" cx="60" cy="12" r="1.3"/><circle class="a-twinkle" cx="84" cy="8" r="1"/></g><circle cx="80" cy="20" r="5" fill="#f3ede2"/><rect y="56" width="96" height="16" fill="#3e5a3a"/><path d="M8 58L30 24L52 58Z" fill="#e07b39"/><path d="M30 24L24 58H36Z" fill="#a8521f"/><path d="M62 60l14-4M62 56l14 4" stroke="#7a4a1c" stroke-width="2.6" stroke-linecap="round"/><g class="a-flicker" style="transform-origin:69px 58px"><path d="M69 58c-7 0-6-8 0-16c6 8 7 16 0 16z" fill="#f2b544"/><path d="M69 58c-3 0-3-4 0-8c3 4 3 8 0 8z" fill="#e26d5a"/></g>${SIT(86, 62, .5, '#1b2433')}`),
  rappelling: T('#cfe6f5', `<path d="M0 0H38L44 20L36 40L42 72H0Z" fill="#8a6a4a"/><path d="M8 14l10 4M14 34l12-3M6 52l14 4" stroke="#6b5138" stroke-width="1.6"/><path d="M38 2H64" stroke="#6b5138" stroke-width="3"/><path d="M58 2V72" stroke="#e26d5a" stroke-width="1.6"/><g class="a-rappel">${FIG(56, 30, .6)}</g>${BIRD(80, 16)}`),
  skydiving: T('#cfe6f5', `<g class="a-cloudup">${CLOUD(18, 50, 1)}${CLOUD(78, 66, .8)}${CLOUD(70, 30, .6)}</g><rect y="66" width="96" height="6" fill="#88b06c"/><g class="a-sky"><path d="M30 22Q48 2 66 22Q60 18 54 22Q48 16 42 22Q36 18 30 22Z" fill="#e26d5a"/><path d="M42 22Q48 10 54 22Q48 16 42 22Z" fill="#f2b544"/><path d="M31 22L48 40M65 22L48 40M42 22L48 40M54 22L48 40" stroke="${INK}" stroke-width=".8"/>${FIG(48, 52, .55)}</g>`),
  paragliding: T('#cfe6f5', `<path d="M0 58Q24 40 48 56T96 50V72H0Z" fill="#88b06c"/><path d="M0 66Q30 56 60 66T96 64V72H0Z" fill="#6f9a5a"/><g class="a-glide"><path d="M26 14Q46 2 66 14Q46 8 26 14Z" fill="#3f7fbf"/><path d="M36 9.5Q46 5 56 9.5L56 11Q46 7 36 11Z" fill="#f2b544"/><path d="M27 14L46 32M65 14L46 32" stroke="${INK}" stroke-width=".8"/>${SIT(46, 40, .5)}</g>`),
  skiing: T('#d8ecf7', `<path d="M0 22L96 58V72H0Z" fill="#f4f8fc"/><path d="M0 22L96 58" stroke="#c8d8e6" stroke-width="1.4"/>${TREE(10, 64, .8)}${TREE(84, 70, .7)}${TREE(70, 66, .6)}<g class="a-ski"><g transform="translate(14 30) rotate(20) scale(.62)"><path d="M-8 6H10" stroke="#e26d5a" stroke-width="2" stroke-linecap="round"/><circle cx="0" cy="-15" r="4.3" fill="${INK}"/><path d="M0-10.5L2-2M0-8l7 3M0-8l-6 4M2-2l-4 8M2-2l5 7" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" fill="none"/></g><g fill="#fff" class="a-twinkle"><circle cx="2" cy="30" r="1.6"/><circle cx="6" cy="33" r="1.2"/></g></g>`),
  zipline: T('#cfe6f5', `<path d="M0 56Q30 46 60 58T96 54V72H0Z" fill="#88b06c"/>${TREE(30, 60, .9)}${TREE(52, 62, .8)}<path d="M8 72V6M88 72V40" stroke="#7a4a1c" stroke-width="3"/><path d="M8 8L88 42" stroke="${INK}" stroke-width="1.2"/><g class="a-zip"><circle cx="12" cy="10" r="2" fill="#e26d5a"/><path d="M12 10V18" stroke="${INK}" stroke-width="1"/>${FIG(12, 36, .55)}</g>`),
  rafting: T('#dbeed3', `<rect y="22" width="96" height="34" fill="#5fb0d8"/><g stroke="#fff" stroke-width="1.6" stroke-linecap="round"><path class="a-flowx" d="M0 28H96"/><path class="a-flowx f2" d="M0 50H96"/></g><g class="a-rock" style="transform-origin:48px 42px"><path d="M22 38H74Q74 48 64 48H32Q22 48 22 38Z" fill="#e07b39"/><circle cx="36" cy="31" r="3.6" fill="${INK}"/><circle cx="50" cy="31" r="3.6" fill="${INK}"/><circle cx="62" cy="31" r="3.6" fill="${INK}"/><path d="M30 36L22 52M56 36L48 52" stroke="#f2b544" stroke-width="2.2" stroke-linecap="round"/></g>`),
  scuba: T('#2f7fb0', `<g class="a-sway" style="transform-origin:12px 72px"><path d="M12 72q-6-10 0-20q6-10 0-20" stroke="#3f7f4f" stroke-width="3" fill="none"/></g><g class="a-sway d2" style="transform-origin:86px 72px"><path d="M86 72q6-10 0-18q-6-8 0-16" stroke="#3f7f4f" stroke-width="3" fill="none"/></g><rect y="66" width="96" height="6" fill="#e8c27a"/><g class="a-drift"><path d="M66 20q6-5 12 0q-6 5-12 0zM78 20l4-3v6z" fill="#f2b544"/></g><g fill="none" stroke="#cfeaff" stroke-width="1"><circle class="a-bubble" cx="58" cy="34" r="2"/><circle class="a-bubble d2" cx="62" cy="34" r="1.4"/><circle class="a-bubble d3" cx="56" cy="34" r="1.1"/></g><g class="a-bob"><rect x="30" y="36" width="12" height="5" rx="2.5" fill="#f2b544"/><path d="M26 42H50" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><circle cx="54" cy="40" r="4.3" fill="${INK}"/><rect x="54" y="37" width="4" height="4" rx="1" fill="#7cc1e6"/><path d="M26 42L16 38M26 42L16 46" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path class="a-kick" d="M16 38l-6-3v6zM16 46l-6-3v6z" fill="#e26d5a"/></g>`),
  climbing: T('#cfe6f5', `<path d="M30 72L36 0H96V72Z" fill="#a27a55"/><g fill="#e26d5a"><circle cx="50" cy="60" r="2"/><circle cx="62" cy="48" r="2"/></g><g fill="#f2b544"><circle cx="54" cy="36" r="2"/><circle cx="66" cy="24" r="2"/></g><g fill="#3f7fbf"><circle cx="58" cy="12" r="2"/><circle cx="72" cy="56" r="2"/></g><path d="M58 0V72" stroke="#fff" stroke-width=".8" stroke-dasharray="2 2"/><g class="a-climbup">${FIG(58, 66, .6)}</g>`),
  boating: T('#cfe6f5', `<path d="M0 40Q24 30 48 38T96 34V44H0Z" fill="#88b06c"/><rect y="42" width="96" height="30" fill="#5fb0d8"/><path class="a-drift" d="M-20 60q5-3 10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0" stroke="#fff" stroke-width="1.4" fill="none"/><g class="a-rock" style="transform-origin:48px 52px"><path d="M24 48H72L66 58H30Z" fill="#a8521f"/>${SIT(46, 50, .5)}<path class="a-row" d="M40 46L28 60" stroke="#7a4a1c" stroke-width="1.8" stroke-linecap="round" style="transform-origin:40px 46px"/></g>`),
  swimming: T('#6cc4e8', `<path d="M0 16H96M0 40H96" stroke="#fff" stroke-width="1.6" stroke-dasharray="4 3"/><path d="M0 64H96" stroke="#fff" stroke-width="1.6" stroke-dasharray="4 3"/><path class="a-drift" d="M-20 30q5-3 10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0" stroke="#d8f2ff" stroke-width="1.4" fill="none"/><g class="a-swim"><path d="M34 30H52" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><circle cx="56" cy="28" r="4.3" fill="${INK}"/><g class="a-stroke" style="transform-origin:50px 29px"><path d="M50 29Q54 18 62 24" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/></g><g fill="#fff"><circle class="a-twinkle" cx="30" cy="27" r="1.6"/><circle class="a-twinkle d2" cx="27" cy="31" r="1.2"/></g></g>`),
  houseboat: T('#cfe6f5', `<path d="M0 40H96V46H0Z" fill="#6f9a5a"/>${PALM(10, 42)}${PALM(84, 42)}<rect y="44" width="96" height="28" fill="#5f9f9a"/><path d="M10 58h14M60 64h20" stroke="#fff" stroke-width="1.2"/><g class="a-rock slow" style="transform-origin:48px 52px"><path d="M14 46Q48 62 82 46Q80 56 70 58H26Q16 56 14 46Z" fill="#5a3d22"/><path d="M24 50Q24 36 48 34Q72 36 72 50Z" fill="#c9a35a"/><path d="M30 50Q30 40 48 38Q66 40 66 50" stroke="#a8823a" stroke-width="1.2" fill="none"/><rect x="40" y="42" width="5" height="6" fill="#ffd66b"/><rect x="52" y="42" width="5" height="6" fill="#ffd66b"/></g>`),
  cablecar: T('#cfe6f5', `<path d="M0 72L28 26L56 72Z" fill="#6f9a5a"/><path d="M40 72L72 20L96 56V72Z" fill="#88b06c"/><path d="M72 20L66 30L70 29L74 32L78 28Z" fill="#fff"/><path d="M0 10L96 34" stroke="${INK}" stroke-width="1.2"/><g class="a-cable"><path d="M18 14V22" stroke="${INK}" stroke-width="1.2"/><rect x="10" y="22" width="16" height="13" rx="3" fill="#e26d5a"/><rect x="12.5" y="25" width="4.5" height="4.5" fill="#d8f2ff"/><rect x="19" y="25" width="4.5" height="4.5" fill="#d8f2ff"/></g>`),
  temple: T('#f7e3c3', `<rect y="62" width="96" height="10" fill="#c9955a"/><path d="M28 62L32 46H64L68 62Z" fill="#e07b39"/><path d="M33 46L37 34H59L63 46Z" fill="#f2b544"/><path d="M38 34L41 24H55L58 34Z" fill="#e07b39"/><path d="M42 24L44 16H52L54 24Z" fill="#f2b544"/><circle cx="48" cy="13" r="3" fill="#f2b544"/><path d="M42 62V54Q48 48 54 54V62Z" fill="#7a4a1c"/><path d="M78 62V30M72 30H84" stroke="#7a4a1c" stroke-width="2"/><g class="a-swing" style="transform-origin:78px 30px"><path d="M78 30V36" stroke="${INK}" stroke-width="1"/><path d="M74 44Q74 36 78 36Q82 36 82 44Z" fill="#d99a2b"/></g><g class="a-flicker" style="transform-origin:14px 58px"><path d="M14 58c-3 0-3-4 0-8c3 4 3 8 0 8z" fill="#f2b544"/></g><path d="M8 60h12l-2 3h-8z" fill="#a8521f"/>`),
  mutt: T('#f7e3c3', `<rect x="6" y="60" width="84" height="6" fill="#b5651d"/><rect x="14" y="42" width="68" height="18" fill="#f3e2c0"/><path d="M18 42L24 30H72L78 42Z" fill="#e07b39"/><path d="M26 30L32 20H64L70 30Z" fill="#f2b544"/><path d="M42 60V50Q48 44 54 50V60Z" fill="#7a4a1c"/><rect x="22" y="47" width="8" height="7" fill="#7a4a1c"/><rect x="66" y="47" width="8" height="7" fill="#7a4a1c"/><path d="M48 20V6" stroke="#7a4a1c" stroke-width="1.4"/><path class="a-flag" d="M48 6L58 9L48 12Z" fill="#e07b39" style="transform-origin:48px 9px"/><g stroke="#a7ada8" stroke-width="1.4" fill="none"><path class="a-smoke" d="M86 58q-3-5 0-10t0-10"/><path class="a-smoke d2" d="M86 58q3-5 0-10t0-10"/></g><path d="M86 58V62" stroke="#7a4a1c" stroke-width="2"/>`),
  festival: T('#2c3a55', `<path d="M0 8Q48 22 96 8" stroke="#f3ede2" stroke-width="1" fill="none"/><g class="a-sway" style="transform-origin:48px 14px"><path d="M10 10l4 9l4-8zM28 14l4 9l4-8zM46 16l4 9l4-8zM64 14l4 9l4-8zM82 10l4 9l4-8z" fill="#f2b544"/><path d="M19 12l4 9l4-8zM37 15l4 9l4-8zM55 15l4 9l4-8zM73 12l4 9l4-8z" fill="#e26d5a"/></g><g class="a-burst" style="transform-origin:28px 42px"><path d="M28 32V36M28 48V52M18 42H22M34 42H38M21 35l3 3M32 46l3 3M35 35l-3 3M24 46l-3 3" stroke="#f2b544" stroke-width="2" stroke-linecap="round"/></g><g class="a-burst d2" style="transform-origin:68px 38px"><path d="M68 28V32M68 44V48M58 38H62M74 38H78M61 31l3 3M72 42l3 3M75 31l-3 3M64 42l-3 3" stroke="#7bc8a4" stroke-width="2" stroke-linecap="round"/></g><g class="a-bob"><rect x="44" y="54" width="8" height="10" rx="3" fill="#e26d5a"/><path d="M48 50V54" stroke="#f3ede2"/></g>`),
  holydip: T('#f7d6a8', `<path d="M0 30H40V72H0Z" fill="#d9b88a"/><path d="M0 40H44M0 50H48M0 60H52" stroke="#b5935f" stroke-width="2"/><path d="M40 30H44V40H48V50H52V60H56V72H96V30Z" fill="#5c9fc4"/><g class="a-dip">${FIG(70, 52, .6)}</g><rect x="56" y="48" width="40" height="24" fill="#5c9fc4" opacity=".85"/><ellipse class="a-ripple" cx="70" cy="50" rx="10" ry="2.5" fill="none" stroke="#fff" stroke-width="1.2"/><g class="a-drift"><path d="M82 62h8l-2 3h-4z" fill="#a8521f"/><path d="M86 62c-2 0-2-3 0-6c2 3 2 6 0 6z" fill="#f2b544"/></g>`),
  fort: T('#cfe6f5', `<rect y="64" width="96" height="8" fill="#b5935f"/><path d="M8 64V34H16V30H22V34H30V30H36V34H44V30H52V34H60V30H66V34H74V30H80V34H88V64Z" fill="#c9955a"/><path d="M60 34V14H76V34Z" fill="#b07a42"/><path d="M60 14H62V10H65V14H68V10H71V14H74V10H76V14" fill="#b07a42"/><path d="M38 64V50Q44 42 50 50V64Z" fill="#5a3d22"/><path d="M68 10V2" stroke="#5a3d22" stroke-width="1.2"/><path class="a-flag" d="M68 2L76 4.5L68 7Z" fill="#e07b39" style="transform-origin:68px 4.5px"/><g class="a-drift">${BIRD(24, 16)}${BIRD(32, 12)}</g>`),
  museum: T('#f3ede2', `<path d="M10 28L48 8L86 28Z" fill="#d8c9a8"/><rect x="10" y="28" width="76" height="4" fill="#c8b68f"/><g fill="#e8dcc4"><rect x="16" y="32" width="7" height="28"/><rect x="31" y="32" width="7" height="28"/><rect x="58" y="32" width="7" height="28"/><rect x="73" y="32" width="7" height="28"/></g><rect x="40" y="36" width="16" height="12" fill="#7a4a1c"/><path d="M42 46L47 40L50 43L54 38V46Z" fill="#7bc8a4"/><rect x="6" y="60" width="84" height="5" fill="#c8b68f"/><rect y="65" width="96" height="7" fill="#b5935f"/><g fill="#f2b544"><path class="a-twinkle" d="M60 14l1.4 3 3 1.4-3 1.4-1.4 3-1.4-3-3-1.4 3-1.4z"/></g>${FIG(48, 62, .45)}`),
  zoo: T('#dbeed3', `<rect y="58" width="96" height="14" fill="#88b06c"/><path d="M0 50H96M0 56H96" stroke="#7a4a1c" stroke-width="1.4"/><path d="M6 46V60M24 46V60M42 46V60M60 46V60M78 46V60" stroke="#7a4a1c" stroke-width="1.6"/><g fill="#f2b544"><path d="M52 44H72V54H52Z"/><path d="M54 54V64M58 54V64M66 54V64M70 54V64" stroke="#d99a2b" stroke-width="2.6"/></g><g class="a-nod" style="transform-origin:56px 46px"><path d="M54 46L48 18" stroke="#f2b544" stroke-width="6" stroke-linecap="round"/><path d="M42 16Q46 10 52 16Q48 20 42 16Z" fill="#f2b544"/><path d="M47 13V9M50 13V9" stroke="#d99a2b" stroke-width="1.4"/><g fill="#a8521f"><circle cx="50" cy="28" r="1.4"/><circle cx="52" cy="37" r="1.4"/></g></g><g fill="#a8521f"><circle cx="58" cy="48" r="1.6"/><circle cx="66" cy="50" r="1.6"/></g>${TREE(86, 62, 1)}`),
  safari: T('#f7e3c3', `<rect y="54" width="96" height="18" fill="#d9b86a"/><path d="M76 56V36" stroke="#7a4a1c" stroke-width="2.4"/><path d="M60 34Q76 22 92 34Q76 30 60 34Z" fill="#6f9a5a"/><g class="a-jeep"><g class="a-bump"><path d="M8 50V40H20L24 34H36V40H42V50Z" fill="#3f7f4f"/><rect x="25" y="35.5" width="8" height="4" fill="#d8f2ff"/><circle cx="16" cy="51" r="4" fill="${INK}"/><circle cx="35" cy="51" r="4" fill="${INK}"/><circle cx="30" cy="30" r="3" fill="${INK}"/></g><g fill="#c9a35a"><circle class="a-smoke" cx="4" cy="50" r="2"/><circle class="a-smoke d2" cx="2" cy="47" r="1.5"/></g></g>`),
  ride: T('#f7e3c3', `<rect y="62" width="96" height="10" fill="#d9b86a"/><g class="a-plod"><path d="M24 40Q24 28 44 28Q64 28 64 42V48H24Z" fill="#8f99a3"/><path d="M28 48V62M36 48V62M52 48V62M60 48V62" stroke="#8f99a3" stroke-width="6"/><path d="M62 34Q72 32 72 42" stroke="#8f99a3" stroke-width="9" fill="none" stroke-linecap="round"/><g class="a-trunk" style="transform-origin:72px 42px"><path d="M72 42Q74 54 68 58" stroke="#8f99a3" stroke-width="4" fill="none" stroke-linecap="round"/></g><circle cx="66" cy="36" r="1.4" fill="${INK}"/><path d="M60 32Q58 40 64 42" fill="#7d8790"/><path d="M32 28H54L52 20H34Z" fill="#e26d5a"/><path d="M32 28H54" stroke="#f2b544" stroke-width="2"/>${SIT(43, 20, .45)}</g>`),
  feeding: T('#e8eef2', `<rect y="56" width="96" height="16" fill="#c8c0b0"/><g fill="#b5935f"><circle cx="40" cy="62" r="1"/><circle cx="46" cy="64" r="1"/><circle cx="52" cy="61" r="1"/><circle cx="58" cy="65" r="1"/><circle cx="34" cy="65" r="1"/></g>${FIG(14, 66, .65)}<path d="M18 52L24 50" stroke="${INK}" stroke-width="1.8"/><g class="a-peck" style="transform-origin:44px 60px"><ellipse cx="44" cy="58" rx="6" ry="4" fill="#8f99a3"/><circle cx="49" cy="55" r="2.6" fill="#8f99a3"/><path d="M51 55l3 1" stroke="#f2b544" stroke-width="1.4"/></g><g class="a-peck d2" style="transform-origin:62px 60px"><ellipse cx="62" cy="58" rx="6" ry="4" fill="#a7ada8"/><circle cx="67" cy="55" r="2.6" fill="#a7ada8"/><path d="M69 55l3 1" stroke="#f2b544" stroke-width="1.4"/></g><g class="a-drift"><path d="M70 20q4-6 8 0q4-6 8 0" stroke="#8f99a3" stroke-width="2.2" fill="none"/></g>`),
  park: T('#dbeed3', `<rect y="60" width="96" height="12" fill="#88b06c"/><path d="M10 62L18 14H54L62 62" stroke="#c4462f" stroke-width="3" fill="none"/><g class="a-swing big" style="transform-origin:36px 14px"><path d="M30 14V46M42 14V46" stroke="${INK}" stroke-width="1"/><rect x="28" y="46" width="16" height="3" fill="#7a4a1c"/>${SIT(36, 46, .5)}</g><path d="M70 62V36H76L92 62" stroke="#3f7fbf" stroke-width="3" fill="none"/><path d="M70 36V30" stroke="#3f7fbf" stroke-width="3"/>`),
  themepark: T('#cfe6f5', `<rect y="64" width="96" height="8" fill="#88b06c"/><path d="M36 64L48 36L60 64" stroke="#5a3d22" stroke-width="2.4" fill="none"/><g class="a-spin" style="transform-origin:48px 36px"><circle cx="48" cy="36" r="24" fill="none" stroke="#c4462f" stroke-width="2"/><path d="M48 12V60M24 36H72M31 19L65 53M65 19L31 53" stroke="#c4462f" stroke-width="1"/><g fill="#f2b544"><circle cx="48" cy="12" r="3.4"/><circle cx="48" cy="60" r="3.4"/><circle cx="24" cy="36" r="3.4"/><circle cx="72" cy="36" r="3.4"/></g><g fill="#3f7fbf"><circle cx="31" cy="19" r="3.4"/><circle cx="65" cy="53" r="3.4"/><circle cx="65" cy="19" r="3.4"/><circle cx="31" cy="53" r="3.4"/></g></g><circle cx="48" cy="36" r="3" fill="#5a3d22"/>`),
  market: T('#f7e3c3', `<rect y="62" width="96" height="10" fill="#c9955a"/><path d="M6 6Q48 14 90 6" stroke="${INK}" stroke-width=".8" fill="none"/><g><circle class="a-twinkle" cx="18" cy="9" r="2" fill="#f2b544"/><circle class="a-twinkle d2" cx="34" cy="11" r="2" fill="#e26d5a"/><circle class="a-twinkle d3" cx="50" cy="11" r="2" fill="#7bc8a4"/><circle class="a-twinkle" cx="66" cy="10" r="2" fill="#f2b544"/><circle class="a-twinkle d2" cx="80" cy="8" r="2" fill="#e26d5a"/></g><path d="M12 22H84L80 32H16Z" fill="#c4462f"/><path d="M24 22L22 32M36 22L35 32M48 22V32M60 22L61 32M72 22L74 32" stroke="#fff" stroke-width="4"/><path d="M16 32V62M80 32V62" stroke="#7a4a1c" stroke-width="2.4"/><rect x="16" y="48" width="64" height="14" fill="#a8521f"/><g><circle cx="26" cy="46" r="4" fill="#f29a3a"/><circle cx="34" cy="46" r="4" fill="#e26d5a"/><circle cx="44" cy="46" r="4" fill="#7bc8a4"/><circle cx="54" cy="46" r="4" fill="#f2b544"/><circle cx="64" cy="46" r="4" fill="#e26d5a"/><circle cx="72" cy="46" r="4" fill="#f29a3a"/></g>`),
  food: T('#f3ede2', `<ellipse cx="44" cy="52" rx="40" ry="14" fill="#5f9f4e"/><path d="M8 52H80" stroke="#4a7f3c" stroke-width="1"/><ellipse cx="42" cy="50" rx="11" ry="6" fill="#fff"/><circle cx="22" cy="52" r="5" fill="#f29a3a"/><circle cx="62" cy="50" r="5" fill="#e26d5a"/><circle cx="66" cy="58" r="3.6" fill="#f2b544"/><circle cx="28" cy="58" r="3" fill="#a8521f"/><g stroke="#a7ada8" stroke-width="1.6" fill="none" stroke-linecap="round"><path class="a-smoke" d="M38 40q-3-5 0-10t0-10"/><path class="a-smoke d2" d="M46 40q3-5 0-10t0-10"/></g><path d="M82 30H92L90 50H84Z" fill="#c8ccd0"/>`),
  family: T('#dbeed3', `<rect y="62" width="96" height="10" fill="#88b06c"/><path d="M58 34L74 20L90 34V62H58Z" fill="#f2b544"/><path d="M54 36L74 18L94 36" stroke="#c4462f" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="70" y="48" width="8" height="14" fill="#7a4a1c"/>${FIG(14, 66, .7)}${FIG(28, 66, .62, '#5a6a7a')}${FIG(40, 66, .42, '#4a5a6a')}${FIG(50, 66, .5, '#3f4f5f')}<g fill="#e26d5a"><path class="a-heart" d="M28 30c-3-4-8 0-4 4l4 4l4-4c4-4-1-8-4-4z"/><path class="a-heart d2" d="M42 36c-2-3-6 0-3 3l3 3l3-3c3-3-1-6-3-3z"/></g>`),
  photoshoot: T('#e8eef2', `<rect x="56" y="14" width="34" height="26" fill="#fff" stroke="#c8b68f" stroke-width="2"/><path d="M58 38L68 26L74 32L80 24L88 38Z" fill="#88b06c"/><circle cx="64" cy="20" r="3" fill="#f2b544"/><rect x="10" y="30" width="38" height="26" rx="4" fill="${INK}"/><rect x="16" y="26" width="10" height="5" rx="1" fill="${INK}"/><circle cx="29" cy="43" r="9" fill="#5a6a7a"/><circle cx="29" cy="43" r="5" fill="#7cc1e6"/><rect x="40" y="33" width="5" height="3" fill="#f2b544"/><g class="a-flash" style="transform-origin:42px 30px"><path d="M42 18V12M42 30H36M50 22l4-4M34 22l-4-4M50 30h6" stroke="#f2b544" stroke-width="2.4" stroke-linecap="round"/></g>`),
  custom: T('#f3ede2', `<g class="a-spin slow" style="transform-origin:48px 36px"><path d="M48 14l6 14 15 1-11 10 4 15-14-8-14 8 4-15-11-10 15-1z" fill="#f2b544"/></g><g fill="#e26d5a"><path class="a-twinkle" d="M18 16l1.4 3 3 1.4-3 1.4-1.4 3-1.4-3-3-1.4 3-1.4z"/><path class="a-twinkle d2" d="M80 52l1.4 3 3 1.4-3 1.4-1.4 3-1.4-3-3-1.4 3-1.4z"/></g>`)
};
})();

const ACT_GROUPS = [
  ['Nature and outdoors', [['trek', 'Trek / hike'], ['waterfall', 'Waterfall'], ['beach', 'Beach'], ['viewpoint', 'Hill station / viewpoint'], ['forest', 'Forest walk'], ['lake', 'Lake / river visit'], ['sunrise', 'Sunrise / sunset watching'], ['camping', 'Camping']]],
  ['Adventure', [['rappelling', 'Rappelling'], ['skydiving', 'Skydiving'], ['paragliding', 'Paragliding'], ['skiing', 'Skiing'], ['zipline', 'Zip line'], ['rafting', 'River rafting'], ['scuba', 'Scuba / snorkelling'], ['climbing', 'Rock climbing']]],
  ['Water and rides', [['boating', 'Boating / ferry'], ['swimming', 'Swimming'], ['houseboat', 'Houseboat'], ['cablecar', 'Toy train / cable car']]],
  ['Culture and faith', [['temple', 'Temple visit'], ['mutt', 'Mutt / ashram visit'], ['festival', 'Festival / mela'], ['holydip', 'Holy dip'], ['fort', 'Fort / palace / heritage site'], ['museum', 'Museum']]],
  ['Animals', [['zoo', 'Zoo'], ['safari', 'Safari / wildlife park'], ['ride', 'Elephant / camel ride'], ['feeding', 'Feeding animals / birds']]],
  ['Fun and family', [['park', 'Park / playground'], ['themepark', 'Amusement / theme park'], ['market', 'Shopping / local market'], ['food', 'Food street / trying local food'], ['family', 'Family gathering / relatives visit'], ['photoshoot', 'Photoshoot']]]
];
const ACT = Object.fromEntries(ACT_GROUPS.flatMap(([, list]) => list.map(([k, l]) => [k, l])));
const isCustomAct = v => typeof v === 'string' && v.startsWith('custom:') && v.length > 7;
const actKeep = list => (list || []).filter(v => ACT[v] || isCustomAct(v));
const actLabel = v => isCustomAct(v) ? v.slice(7) : (ACT[v] || v);
const actDraw = v => ACT_DRAW[isCustomAct(v) ? 'custom' : v] || ACT_DRAW.custom;
const actIco = (v, cls = '') => `<span class="act-ico ${cls}" title="${esc(actLabel(v))}"><svg viewBox="0 0 96 72" aria-hidden="true">${actDraw(v)}</svg></span>`;
const actLine = list => actKeep(list).map(v => `<span class="act-item">${actIco(v)}${esc(actLabel(v))}</span>`).join(' ');

// Editor: a multi-select dropdown that opens in place (no popup to clip inside the sheet). 'Other' opens a text box.
let pendingActs = new Set();
function loadActs(list) {
  const keep = actKeep(list);
  pendingActs = new Set(keep.filter(v => ACT[v]));
  const own = keep.filter(isCustomAct).map(v => v.slice(7));
  if (own.length) pendingActs.add('other');
  $('#e-act-other').value = own.join(', ');
  $('#e-acts-q').value = ''; actsOpen(false); renderActs();
}
// Own words: split at commas, trimmed, max 60 characters each, case-insensitive duplicates dropped.
function ownWords() {
  if (!pendingActs.has('other')) return [];
  const seen = new Set(), out = [];
  $('#e-act-other').value.split(',').map(x => x.trim().replace(/\s+/g, ' ').slice(0, 60)).filter(Boolean).forEach(x => { const lk = x.toLowerCase(); if (!seen.has(lk)) { seen.add(lk); out.push(x); } });
  return out;
}
function readActs() { return [...[...pendingActs].filter(k => ACT[k]), ...ownWords().map(x => 'custom:' + x)]; }
function actsOpen(on) { $('#e-acts-panel').hidden = !on; $('#e-acts-btn').setAttribute('aria-expanded', String(on)); $('#e-acts').classList.toggle('open', on); if (on) { renderActs(); setTimeout(() => { try { $('#e-acts-q').focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 0); } }
function renderActs() {
  const q = $('#e-acts-q').value.trim().toLowerCase();
  const row = (k, l) => `<label class="ms-opt${pendingActs.has(k) ? ' on' : ''}"><input type="checkbox" data-act="${k}"${pendingActs.has(k) ? ' checked' : ''}>${actIco(k === 'other' ? 'custom:x' : k)}<span>${esc(l)}</span></label>`;
  const groups = [...ACT_GROUPS, ['Your own', [['other', 'Other (type your own)']]]];
  $('#e-acts-list').innerHTML = groups.map(([g, list]) => { const rows = list.filter(([, l]) => !q || l.toLowerCase().includes(q) || g.toLowerCase().includes(q)); return rows.length ? `<div class="ms-group">${esc(g)}</div>${rows.map(([k, l]) => row(k, l)).join('')}` : ''; }).join('') || '<p class="muted small ms-none">No activity by that name. Pick Other to type your own.</p>';
  $$('#e-acts-list [data-act]').forEach(cb => cb.onchange = () => { const k = cb.dataset.act; cb.checked ? pendingActs.add(k) : pendingActs.delete(k); cb.closest('.ms-opt').classList.toggle('on', cb.checked); renderActChips(); });
  renderActChips();
}
function renderActChips() {
  const keys = [...pendingActs].filter(k => ACT[k]);
  const own = ownWords();
  const n = keys.length + own.length;
  $('#e-acts-sum').textContent = n ? `${n} chosen` : 'Choose activities';
  $('#e-acts-chips').innerHTML = keys.map(k => `<button type="button" class="chip on act-chip" data-act-x="${k}" aria-label="Remove ${esc(ACT[k])}">${actIco(k)}${esc(ACT[k])} <b aria-hidden="true">×</b></button>`).join('') + own.map(x => `<span class="chip on act-chip">${actIco('custom:' + x)}${esc(x)}</span>`).join('');
  $$('#e-acts-chips [data-act-x]').forEach(b => b.onclick = () => { pendingActs.delete(b.dataset.actX); renderActs(); });
  $('#e-act-other-wrap').hidden = !pendingActs.has('other');
}
$('#e-acts-btn').onclick = () => actsOpen($('#e-acts-panel').hidden);
$('#e-acts-done').onclick = () => actsOpen(false);
$('#e-acts-clear').onclick = () => { pendingActs.clear(); $('#e-act-other').value = ''; renderActs(); };
$('#e-acts-q').addEventListener('input', renderActs);
$('#e-acts-q').addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); actsOpen(false); $('#e-acts-btn').focus(); } if (e.key === 'Enter') e.preventDefault(); });
$('#e-act-other').addEventListener('input', renderActChips);

// Story: after the entry card opens, each activity plays as a short animated postcard above the place (day time),
// one after another; the night (if any) follows. Resolves false if the scene changed.
function playActivities(P, map, s, list, isLive) {
  const box = $('#player-act'), acts = actKeep(list);
  const hold = reducedMotion() ? 700 : (acts.length > 5 ? 1700 : 2300);
  const place = () => {
    const pt = map.project([s.place.lng, s.place.lat]), w = box.offsetWidth || 168, h = box.offsetHeight || 150;
    const card = $('#player-overlay .scene'), ph = P.clientHeight || window.innerHeight;
    const maxBottom = card ? card.getBoundingClientRect().top - P.getBoundingClientRect().top - 10 : ph - 120;
    let top = pt.y - h - 34; top = Math.min(top, maxBottom - h); top = Math.max(top, 12);
    let left = Math.max(8, Math.min(pt.x - w / 2, (P.clientWidth || window.innerWidth) - w - 8));
    box.style.left = left + 'px'; box.style.top = top + 'px';
  };
  if (map._bbActMove) map.off('move', map._bbActMove); map.on('move', place); map._bbActMove = place;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  return (async () => {
    for (let k = 0; k < acts.length; k++) {
      if (!isLive()) return false;
      const v = acts[k];
      box.innerHTML = `<div class="act-scene"><svg viewBox="0 0 96 72" aria-hidden="true">${actDraw(v)}</svg></div><div class="act-cap">${esc(actLabel(v))}${acts.length > 1 ? `<span>${k + 1}/${acts.length}</span>` : ''}</div>`;
      box.dataset.act = isCustomAct(v) ? 'custom' : v; box.hidden = false; place();
      box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
      await wait(hold); if (!isLive()) return false;
      box.classList.remove('pop'); await wait(reducedMotion() ? 0 : 320);
    }
    resetActs(map);
    return isLive();
  })();
}
function resetActs(map) {
  const box = $('#player-act'); if (!box) return;
  box.hidden = true; box.classList.remove('pop'); box.innerHTML = ''; delete box.dataset.act;
  if (map && map._bbActMove) { map.off('move', map._bbActMove); map._bbActMove = null; }
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
  { const cc = map.getCanvasContainer(), nl = $('#player-night'); if (nl.parentNode !== cc) cc.insertBefore(nl, map.getCanvas().nextSibling); } // night under pins and the vehicle
  const clearMarkers = () => { cancelRide(); S.weather.stop(); resetNight(map); resetActs(map); markers.forEach(m => m.remove()); markers = []; if (map.getLayer('arc')) { map.removeLayer('arc'); map.removeSource('arc'); } clearRoute(map); };
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
      const card = () => `<div class="scene">${cv ? `<img class="cover" src="${mediaUrl(cv.storage_path)}" alt="">` : ''}<div class="eyebrow">${esc(s.trip.title)} · ${fmtDate(s.arrived_on || s.trip.start_date)}</div><h2>${esc(s.place?.name || '')}</h2><p><b>${esc(ageLabel(child.dob, s.arrived_on || s.trip.start_date))}</b> old · ${esc(MODE_WORDS[s.mode_to_here] || s.mode_to_here)}${s.km_from_prev ? `, about ${s.km_from_prev} km` : ''}${s.stayed_at ? ` · stayed at ${esc(s.stayed_at)}` : ''}</p>${(s.weather || []).length ? `<p class="wx-line">${weatherLine(s.weather)}</p>` : ''}${actKeep(s.activities).length ? `<p class="act-line">${actLine(s.activities)}</p>` : ''}${s.stayed_overnight ? `<p class="stay-line">${stayLine(s)}</p>` : ''}${s.what_we_did ? `<p>${esc(s.what_we_did)}</p>` : ''}${s.what_he_saw ? `<p>${esc(name)}: ${esc(s.what_he_saw)}</p>` : ''}${s.what_he_ate ? `<p>Ate: ${esc(s.what_he_ate)}</p>` : ''}${s.what_he_hated ? `<p class="muted">Hated: ${esc(s.what_he_hated)}</p>` : ''}${s.memory ? `<div class="line">“${esc(s.memory)}”</div>` : ''}</div>`;
      const arrive = () => {
        if (i_now() !== me) return;
        if (s.place) map.flyTo({ center: [s.place.lng, s.place.lat], zoom: Math.max(map.getZoom(), s.place.kind === 'city' ? 9 : 11), pitch: 40, duration: 1400, essential: true });
        ov.innerHTML = card();
        const next = ms => { if (auto && me < scenes.length - 1) autoT = setTimeout(() => { if (auto && i_now() === me) go(me + 1); }, ms); };
        const live = () => i_now() === me && !P.hidden;
        const night = s.stayed_overnight && s.place && !(s.stay_kind === 'journey' && leg);
        const afterActs = (played) => {
          if (night) setTimeout(() => { if (!live()) return; playNight(P, map, s, me, live).then(ok => { if (ok) next(1500); }); }, played ? 600 : 2200);
          else next(played ? 1800 : 5200);
        };
        if (actKeep(s.activities).length && s.place) setTimeout(() => { if (!live()) return; playActivities(P, map, s, s.activities, live).then(ok => { if (ok) afterActs(true); }); }, 1500); // v2.5: activities in daylight, then the night
        else afterActs(false);
      };
      if (leg) {
        ov.innerHTML = `<div class="scene slim"><div class="eyebrow">${esc(s.trip.title)}</div><p>${esc(name)} is on the way to <b>${esc(s.place.name)}</b>, ${esc(MODE_WORDS[leg.mode] || leg.mode || '')}${s.km_from_prev ? `, about ${s.km_from_prev} km` : ''}.</p></div>`;
        const rider = addRider(leg.mode);
        const journey = s.stayed_overnight && s.stay_kind === 'journey';
        const jt = journey ? setTimeout(() => { if (i_now() === me && !P.hidden) journeyNightOn(P, s); }, 700) : 0; // night falls while the camera settles
        rideLeg(map, leg, rider, journey ? { minDur: 4200 } : {}).then(ok => { clearTimeout(jt); if (!ok) return; if (journey) { journeyDawn(P); setTimeout(arrive, reducedMotion() ? 0 : 900); } else arrive(); });
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
