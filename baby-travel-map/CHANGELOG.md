# Changelog

## v1.7 · 13 Oct 2026
Covers. The trip form has a "Trip cover photo" field (also under Edit trip); it shows on the timeline, as a banner at the top of the trip sheet, and first among that trip's photos in the story's photo wall. Each entry's own photo wins wherever that entry is shown: its map pin, its story scene, its visit row and its card in the trip sheet. With no photo of its own an entry uses the trip cover, then the place's first letter. An entry's first photo is its cover; every other thumbnail has "Make cover" (in the trip sheet and the entry editor). A place visited on several trips keeps one pin, showing the latest visit's cover. Replacing a trip cover keeps the old photo as a trip photo. Deleting an entry now deletes its photos too (before, they stayed in storage with no entry and would have looked like trip covers). No database change.

## v1.6 · 13 Oct 2026
A new entry's Arrived and Left are filled with the day the previous entry ended (kept inside the trip). Under the dates, one line shows the previous entry in date order: "Previous: Kovalam Lighthouse · 31 Jul 2026 · Start on 31 Jul 2026"; tapping the link sets Arrived to that day. When editing an existing entry it shows the entry before it; for the first entry it shows the trip's From–To.

## v1.5 · 13 Oct 2026
Fix: Reorder → Save order wrote nothing in v1.4 (the new order was applied to the in-memory entries before being compared with the saved order, so every entry looked unchanged; the server log shows only the trip update at 18:13 on 12 Oct). It now compares against the saved order, writes the changed entries, re-reads, and says if the server order differs. Date rules: the date pickers grey out impossible days; To cannot be before From; Left cannot be before Arrived; an entry's Arrived/Left must sit inside its trip's From–To; changing a trip's dates is refused if it would leave entries outside, naming them. Trip dates no longer change on their own (v1.4 auto-fit removed; the trip range is now the rule entries must follow).

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
