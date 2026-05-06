# Weather Radar Card — Backlog

Backlog of design notes for shipped and proposed work. Items marked ✅ are
released; remaining unchecked items are open ideas.

## Multi-marker Support ✅ — shipped in 3.1.0

Complete redesign of the marker system supporting multiple markers, entity-based
positions, and automatic map tracking. **Breaking change** — single-marker
config fields are deprecated and auto-migrated in memory on load.

### Track resolution rules

Each marker can carry a `track` option. On every `hass` update the card evaluates
which marker (if any) should be used to auto-centre the map, using this priority
order:

1. **`track: entity` on a `person.*` entity** whose `user_id` matches the current
   logged-in HA user → highest priority. "I am this person, follow me."
2. **`track: entity` on any other entity** (e.g. `device_tracker.*`) → second
   priority. The device is tracked for all viewers regardless of who is using it
   or logged in. Overridden only by a matching person in rule 1.
3. **`track: true`** → lowest always-on fallback. Any `track: entity` match from
   rules 1 or 2 overrides this.
4. Multiple markers at the **same priority level** → log a console warning and
   use the first one in the array.

### YAML format

```yaml
markers:
  - entity: person.john          # centres only when john is the logged-in user
    icon: entity_picture
    track: entity

  - entity: device_tracker.van   # always centres on the van for all viewers
    icon: mdi:car                #   overridden for john by the person rule above
    track: entity

  - entity: device_tracker.bike  # lowest-priority always-on fallback
    icon: mdi:bicycle
    track: true

  - latitude: -33.86             # static marker, no tracking
    longitude: 151.21
    icon: mdi:home
```

### Tasks

- [x] Marker config schema — `markers[]` array; `track: entity | true`;
  resolution priority described above
- [x] `Marker` interface (`latitude?`, `longitude?`, `entity?`, `icon?`,
  `icon_entity?`, `color?`, `track?`, `mobile_only?`); legacy fields kept on
  `WeatherRadarCardConfig` for migration only
- [x] Multi-marker rendering with live position updates on every hass change
- [x] Entity-based marker positions (`device_tracker.*`, `person.*`, `zone.*`,
  any entity with `latitude`/`longitude` attributes)
- [x] Track resolution with priority + tie-warning
- [x] Auto-migration in `setConfig()` — synthesises a `markers[]` from the old
  fields in memory; deprecation warning logged; same-string lat/lon entity pairs
  collapsed to a single `entity` field; `mobile_only: true` added to mobile
  variants
- [x] Default `zone.home` marker when `markers` is absent; `markers: []` opts out
- [x] Editor — list-based markers section; per-row entity / lat-lon / icon /
  track / colour / mobile-only controls; HA `ha-icon-picker` for icon
  autocomplete; auto-detect icon from selected entity
- [x] Marker clustering with spiderfy and home-cluster badge representation
- [x] README and CHANGELOG updates

---

## Scroll / Swipe Passthrough ✅ — shipped in 3.0.1

`disable_scroll` config option suppresses single-finger pan / mouse drag while
preserving pinch-to-zoom, so mobile users can scroll past the card.

### Tasks

- [x] `disable_scroll` config option (boolean, default `false`)
- [x] Disable Leaflet `dragging` on map init when option is on
- [x] Editor toggle in the Interaction section
- [x] README and CHANGELOG updates

---

## Other Backlog Items

### Open

- **Open-Meteo as an alternate wind source for global coverage** — target 3.7.
  The wind overlay landing in 3.6 (PR #133) is DWD-only — Germany +
  immediate neighbours via the ICON-D2 model. To extend the feature
  globally, add [Open-Meteo](https://open-meteo.com/) as a second
  source. They auto-pick the best regional model per location (DWD
  ICON in Europe, NOAA GFS for the Americas, JMA in Japan, ECMWF
  elsewhere), expose `wind_u_component_10m` / `wind_v_component_10m`
  in the same U/V form the existing layer expects, and crucially
  support **bulk lat/lon queries in a single HTTPS GET** — would
  collapse PR #133's 400-parallel-WMS-request burst per pan into 1
  batched JSON call.

  Implementation pattern: parallel `WIND_SOURCE_CAPS` table in a new
  `src/wind-source-caps.ts`, mirroring `src/source-caps.ts` for
  radar — each entry declaring native grid resolution, fetch
  strategy (`'wms-getfeatureinfo'` vs `'json-bulk'`), max points per
  request, and global / regional coverage. New `wind_source` config
  field with auto-pick default ("DWD if EU, Open-Meteo elsewhere"),
  matching the auto map-style behaviour we already do.

  Caveats: Open-Meteo is non-commercial use only (HACS distribution
  probably qualifies but verify current terms before shipping); free
  tier is 10k req/day per IP (with bulk batching, not even close to
  hitting it); resolution drops to ~28 km outside Europe vs DWD's
  native 2.2 km, but invisible at typical card zoom levels.

  Order: land #133 first (DWD-only baseline), then this PR adds the
  source abstraction without changing the EU experience.

- **Real-time per-user layer control** with persistent state — target 3.7.
  The card now ships radar + wildfires + NWS alerts + lightning + DWD
  coverage outline + three wind modes — too many for the editor to
  be the only enable/disable surface. Add an on-map control letting
  users toggle individual overlays in real time without re-opening
  the editor.

  **UX:** custom on-map button (`mdi:layers`) → expanding panel
  matching the existing toolbar idiom (zoom / recenter / playback).
  Considered Leaflet's built-in `L.control.layers` but it's dated
  and doesn't match HA's design language. The custom panel can also
  group toggles (Hazards / Wind / Coverage) and show live state
  ("Wildfires (3 visible)").

  **Composition semantics — approach B (subset):** dashboard YAML
  defines the *available* set of layers; user UI controls visibility
  within that set, can't enable layers the dashboard owner didn't
  authorise. Mirrors how HA's own per-user dashboard customisation
  works — owner curates, user tunes within frame.

  **Persistence:** HA's frontend storage API
  (`frontend/get_user_data` / `frontend/set_user_data` over
  WebSocket). Server-side, per-user, syncs across the user's
  browsers and devices. Same API HA's own frontend uses for sidebar
  state and view bookmarks.

  **Storage key = config-hash + dashboard path.** SHA-1 (or short
  hash) of the canonical card config (lat/lon/data_source/etc.) plus
  the dashboard URL path. Rationale: the same card config can appear
  on two dashboards (e.g. one user's main radar dashboard and a
  separate "weather wall") — the user's toggle choices belong to
  the dashboard they're looking at, not to the card-config in the
  abstract. Two dashboards × same config = two independent
  per-user states. Key shape: `wrc-overlays:{configHash}:{dashboardPath}`.

  **What gets stored:** which overlays the user has hidden (sparse —
  only overrides, not full state). Defaults are the dashboard YAML;
  storage layer just records "user explicitly turned X off" or "user
  explicitly turned Y back on after toggling it off then back".

  **Edge cases to think about during design:**
  - YAML config changes — does a meaningful change invalidate the
    user's overrides (they were tuning a different set), or do
    overrides survive across config edits?
  - Dashboard rename — URL path changes, user's state appears to
    reset. Acceptable (rare) or handle via stable dashboard ID?
  - Multi-card dashboards (same card type, different configs on the
    same dashboard) — config-hash differentiates them naturally.

### Investigated, won't pursue

- **Custom HACS icon** ([#126](https://github.com/Makin-Things/weather-radar-card/issues/126)).
  HACS doesn't render custom icons for Lovelace plugins — verified
  empirically by checking the HACS frontend tab: zero plugins in the
  default store carry one, and the
  [home-assistant/brands](https://github.com/home-assistant/brands) repo
  path that works for HACS *integrations* (`custom_integrations/<slug>/icon.png`)
  isn't wired up for the *plugins* category. Submitting to brands would
  be a no-op until / unless HACS adds the support upstream.
  Practical workaround that other authors use: prefix the card name in
  `customCards` with an emoji (e.g. `📡 Weather Radar Card`) — no
  external PR, guaranteed to render. We've held off on that to keep the
  card name canonical; revisit if the issue gets attention.

### Shipped

- Clickable / draggable timeline ✅
- AM / PM vs 24 h time display (browser locale) ✅
- Configurable double-tap action ✅
- Hide progress bar option ✅
- Hide / show colour bar option ✅
- Dynamic map style (Auto) ✅
- Marker clustering ✅
- Multi-marker support ✅
- DWD radar source ✅ — 3.4.0
- Crossfade alpha-dip fix + smooth_animation ✅ — 3.4.0
- `smooth_overlap` tunable crossfade overlap + editor mutual gating ✅ — 3.4.0-beta2 / 3.5.0
- Wildfire perimeter overlay (US-only) ✅ — 3.5.0
- NWS watches & warnings overlay (US-only) ✅ — 3.5.0
- Hazard Overlays editor subpage ✅ — 3.5.0
- Region-warning utility for non-US installs ✅ — 3.5.0
- Time-based playback range (`past_minutes` / `forecast_minutes` / `frame_stride_minutes`) replacing `frame_count` — source-agnostic via SOURCE_CAPS table; auto-migrates legacy configs ✅ — 3.5.0
- WYSIWYG map editing (back-prop pan/zoom into editor Lat/Long fields) ✅ — 3.5.0
- Build timestamp in console signon (cache-bust verification aid) ✅ — 3.5.0
- Loading spinner + `show_loading_spinner` config (contributed by @genericJE, [#124](https://github.com/Makin-Things/weather-radar-card/pull/124)) ✅ — 3.5.0
- Now marker on the progress bar (contributed by @genericJE, [#125](https://github.com/Makin-Things/weather-radar-card/pull/125)) ✅ — 3.5.0
- Dark / satellite map scale text-shadow fix (contributed by @genericJE, [#123](https://github.com/Makin-Things/weather-radar-card/pull/123)) ✅ — 3.5.0
- `npm run build` regenerates `.js.gz` so HA can't serve a stale gzipped bundle ✅ — 3.5.0
- DWD-outside-coverage region banner — visible UI cue replacing the developer-only `console.warn` from 3.4.0 ✅ — 3.5.0
- Markercluster `_bounds`-undefined race in the resize path (RAF defer + `try/catch`) ✅ — 3.5.0
- README split into a slim landing page + focused docs under `docs/` (Configuration, Data Sources, Hazard Overlays, Markers, Examples, Animation architecture) ✅ — 3.5.0
- `animation.md` rewritten to match the current two-slot + delayed-fade-out model ✅ — 3.5.0
- 11-language i18n parity sweep (100% key coverage, stale `frame_count` keys dropped) ✅ — 3.5.0
- Lightning overlay (Blitzortung integration) — bolt + pulse for first 30 s, then a Blitzortung-style coloured + sign on a two-pane outline-vs-fill split (so dense storm clusters read clean instead of black-blob). Card-side max-age cap (default 30 min, distinct from the integration's own setting). Editor toggle disabled with tooltip when integration not loaded. ✅ — 3.6.0
- Local Docker HA testbed (`npm run ha:up`) replacing the abandoned `.devcontainer/` ✅ — post-3.4.0
