<!-- README · v2.3 · 13 Oct 2026 · app v2.3; points to the Baby Travel product master v1.1. Previous: v2.2 (13 Oct), v1.0 (10 Oct). -->
# Baby Travel product (baby-travel-map) · app v2.3

A private map of everywhere our son has been: where, when, how old he was, how we got there, what he saw, and the photos. Pick a year and it plays as a story.

- Live: https://sudharsan454.github.io/baby-travel-map/
- **Product master (read this first):** `PMOS/BabyMap/baby-travel-product-master-v1.1.md` (features, tech stack, ER map, security, deploy, version story). Release log: `CHANGELOG.md`.
- Backend: Supabase Project Zero, schema `memories` (RLS on every table), bucket `memories-media` (public read, owner-only write, paths are random uuids).
- Sign-in: Supabase magic link to the owner's Gmail. Family gets a read-only link (`?s=<token>`) served by one database function.
- Map: MapLibre GL JS 5 on OpenFreeMap tiles. Geocoding at entry time: Photon, Nominatim fallback.
- Photos: covers only, resized in the browser to 1600 px before upload. Originals stay in Google Photos; each trip links its album.
- Keep-alive: `.github/workflows/keepalive-v1.0.yml` pings both Supabase projects every 2 days.

Versioning: every file carries a version in its name and a comment at the top. `index.html` is the Pages entry point; `baby-travel-map-v2.3.html` is the same file kept by version.
