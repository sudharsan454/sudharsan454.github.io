# Changelog

## v1.4 · 13 Oct 2026
Entries always run in date order (by Arrived), and same-day entries in the order you set. Applied in the trip sheet, entry numbering, the year story and the family link. New Reorder button in the trip sheet: up/down arrows within a day; moving to another day is done by changing the date. After any save, reorder or delete: entries renumbered, km recalculated where it was the automatic straight-line figure (typed km kept), trip From/To set to the span of its entries. "Left" before "Arrived" is refused. A new entry defaults to the day the last one ended.

## v1.3 · 12 Oct 2026
Places the geocoder has never heard of (Vallichunai near Nagercoil was the first) can be added by hand: the place search always ends with "Add … by hand"; pick the nearest known town, tap the map where the place is (drag the pin to adjust), city/district/state fill from the town. Saved as kind "custom" and reused like any other place.

## v1.2 · 12 Oct 2026
Every entry has "What he ate". Picking "Another first" opens a box for what the first was (saved as the milestone note; the story reads it as "First: …"). Picking purpose "Other" opens a box for the kind of trip (saved as the purpose). Migration `baby_travel_map_memories_v1_1_food`.

## v1.1 · 12 Oct 2026
First load retries up to 3 times: right after a magic-link sign-in Supabase can reject the brand-new token for about a second ("JWT issued at future"); one retry clears it. Error text now distinguishes that case from the unexposed-schema case and offers Try again.

## v1.0 · 10 Oct 2026
First build. Magic-link sign-in restricted to the owner's email; first-run child setup (name, date of birth, home); capture: trip + entries (place search, dates, mode, km auto from the previous place, stayed at, what we did, what he did, what he hated, the one memory, firsts, up to 3 compressed covers per entry); map with cover pins and per-place visit sheet; trip sheet with edit/delete; timeline by year; year story in six scenes (globe opening, year on the map with arcs from home, entry by entry flythrough, firsts, distance arcs, photo wall); family share links (create, copy, revoke); settings with storage meter. Supabase migration `baby_travel_map_memories_v1_0`.
