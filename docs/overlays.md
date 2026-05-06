# Hazard Overlays (US-only)

Two optional overlay layers for US users: active wildfire perimeters from NIFC and active NWS watches & warnings. Both are off by default, both pull from public US government feeds, and both carry strong life-safety disclaimers — they are **informational only** and not a substitute for official emergency channels.

For non-US instances, the card surfaces a banner reminding the user that the data is US-only when either overlay is enabled with `hass.config.country !== 'US'`.

## Wildfires

When `show_wildfires: true`, the card overlays active US wildfire perimeters from the National Interagency Fire Center's [WFIGS Current Interagency Fire Perimeters](https://data-nifc.opendata.arcgis.com/datasets/nifc::wfigs-current-interagency-fire-perimeters/about) feed.

Active fires draw red; fires reported as 100% contained draw grey. Small incidents render as a fire icon at the centroid; larger incidents render as a polygon outline with translucent fill. Click any fire to see its name, acreage, containment, and discovery date, with a link to NIFC's InciWeb for further information (gated against InciWeb's RSS index so we don't link to 404s).

The overlay refreshes every 5 minutes when fires are visible (matching NIFC's update cadence) and every 30 minutes when none are. Defaults filter out incidents under 10 acres; tune with `wildfire_min_acres` or `wildfire_radius_km`.

> [!WARNING]
> **Wildfire data is for informational purposes only.** This overlay shows fire perimeters from NIFC's WFIGS feed, which updates approximately every 5 minutes and may be **delayed, incomplete, or inaccurate**. Reported perimeters typically lag the actual fire front by hours, and not every active incident appears in the feed.
>
> **Do not rely on this overlay for evacuation, life-safety, or property-protection decisions.** Follow your local emergency management agency, official evacuation orders, and Wireless Emergency Alerts.
>
> NIFC provides this data without warranty of accuracy, completeness, or timeliness. The card developers make no warranty that this overlay accurately reflects current fire activity.

### Wildfire knobs

| Field                      | Default     | Description                                     |
|----------------------------|-------------|-------------------------------------------------|
| `show_wildfires`           | `false`     | Enable the overlay                              |
| `wildfire_min_acres`       | `10`        | Hide incidents smaller than this acreage        |
| `wildfire_radius_km`       | unset       | Only show fires within N km of the map center   |
| `wildfire_color`           | `'#ff3300'` | Active fire colour (stroke + icon)              |
| `wildfire_contained_color` | `'#888888'` | 100%-contained fire colour                      |
| `wildfire_fill_opacity`    | `0.2`       | Polygon fill opacity (`0` = perimeter only)     |
| `wildfire_refresh_minutes` | adaptive    | Override the adaptive 5/30-min refresh interval |

## NWS Watches & Warnings

When `show_alerts: true`, the card overlays active US National Weather Service watches and warnings from the public [NWS API](https://www.weather.gov/documentation/services-web-api).

Each alert is drawn as a translucent polygon coloured per [NWS's standard warning palette](https://www.weather.gov/help-map) — Tornado Warning red, Severe Thunderstorm Warning orange, Flash Flood Warning dark red, and so on. When alerts overlap, more severe ones render on top so their colour wins.

Click any alert to see its event type, headline, severity / certainty / urgency, effective and expiry times, affected areas, and a link out to weather.gov for the full alert text.

The overlay refreshes every 60 seconds when alerts are visible (alerts can have minute-scale lifespans, especially tornado warnings) and every 5 minutes when none are. Filter by category, by severity floor, or by distance from the map centre.

The default filter excludes the `marine` category (most users are inland; coastal users opt back in via `alerts_categories`). Other categories: `tornado`, `thunderstorm`, `flood`, `winter`, `tropical`, `fire_weather`, `heat`, `wind`, `other`.

> [!CAUTION]
> **NWS alert data is for informational purposes only.**
>
> This overlay polls the National Weather Service public API on a delay (60 seconds when alerts are visible, 5 minutes otherwise). Network latency, API outages, browser tab throttling, and rendering delays mean the alerts you see here may be **seconds to minutes behind reality**.
>
> **Do not rely on this overlay for life-safety decisions.** For tornado, flash flood, hurricane, and other immediate-threat warnings, use:
>
> - **Wireless Emergency Alerts (WEA)** on your mobile phone
> - **NOAA Weather Radio** with SAME alerting
> - **Your local emergency management agency**
> - **Official evacuation orders** from local authorities
>
> The National Weather Service provides alert data without warranty of accuracy, completeness, or timeliness. The card developers make no warranty that this overlay accurately reflects current NWS alerts.

Both polygon-bearing alerts (most warnings) and zone-based alerts (most advisories — Wind, Frost, Heat, etc.) render. Zone shapes are fetched on demand from `api.weather.gov/zones/...` and cached for 30 days in `localStorage` (versioned key prefix `wrc-zone-v1:`), so the same zone is never re-fetched.

### Alert knobs

| Field                    | Default             | Description                                                                                                                               |
|--------------------------|---------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| `show_alerts`            | `false`             | Enable the overlay                                                                                                                        |
| `alerts_categories`      | all except `marine` | Allowlist of category keys (`tornado`, `thunderstorm`, `flood`, `winter`, `tropical`, `fire_weather`, `heat`, `wind`, `marine`, `other`). |
| `alerts_types`           | unset               | Explicit event-string allowlist; overrides `alerts_categories` when set                                                                   |
| `alerts_min_severity`    | `'Minor'`           | One of `Extreme`, `Severe`, `Moderate`, `Minor`, `Unknown`. Hides alerts below the chosen severity floor.                                 |
| `alerts_radius_km`       | unset               | Only show alerts within N km of the map center                                                                                            |
| `alerts_fill_opacity`    | `0.25`              | Alert polygon fill opacity (`0` = outline only)                                                                                           |
| `alerts_refresh_seconds` | adaptive            | Override the adaptive 60s/300s refresh interval                                                                                           |

## Lightning (Blitzortung)

When `show_lightning: true` *and* the [Blitzortung integration](https://www.home-assistant.io/integrations/blitzortung/) is loaded in Home Assistant, the card overlays live lightning strikes from the integration's `geo_location.lightning_strike_*` entities. No external HTTP from the card — the integration handles all the data plumbing (WebSocket polling, distance filtering, age-capping); the card just renders.

Each strike appears as a brief flash with a lightning-bolt icon (the "happening now!" indicator), and after 30 s settles into a coloured **+** sign. The + sign's fill colour ages through Blitzortung's web-map gradient: white → yellow → orange → coral → red → dark red, mirroring the visual language users coming from [their map](https://map.blitzortung.org/) already know. Newer strikes always paint on top of older ones.

The toggle in the editor's Hazard Overlays subpage is greyed out when the Blitzortung integration isn't loaded, with a tooltip explaining that the integration must be installed first.

### Lightning knobs

| Field                       | Default | Description                                                                                                                                                                                                    |
|-----------------------------|---------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `show_lightning`            | `false` | Enable the overlay                                                                                                                                                                                             |
| `lightning_max_age_minutes` | `30`    | Hide strikes older than this many minutes. **Card-side cap only — does NOT change the Blitzortung integration's own max-age setting**, which the integration itself controls and may differ (default 120 min). |
| `lightning_pulse`           | `true`  | One-shot brightness flash on new-strike appearance. Honours `prefers-reduced-motion`.                                                                                                                          |
| `lightning_icon_size`       | `14`    | YAML-only. Pixel size for the + sign; the bolt renders at 1.3× this size.                                                                                                                                      |

> [!NOTE]
> The card's `lightning_max_age_minutes` is purely a display filter — it doesn't tell the Blitzortung integration to drop entities. The integration's own max-age setting (configured in HA → Integrations → Blitzortung) is the upper bound; the card's cap is whichever is smaller. Strikes you've hidden via the card cap are still in `hass.states` and visible in the integration's sidebar.

> [!WARNING]
> Blitzortung is a community-run, free, best-effort lightning detection network. Coverage and accuracy vary regionally. **Not for life-safety decisions** — use NOAA Weather Radio, official storm warnings, or your local emergency channels for those.
