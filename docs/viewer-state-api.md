# `ViewerState` — per-user, per-card storage API

Contributor reference for storing user choices (overlay visibility,
playback speed, etc.) that should survive reloads, follow the user
across browsers, and not be shared with other users on the same
browser. Lives in [`src/viewer-state.ts`](../src/viewer-state.ts).

The full design rationale (identity scheme, collision detection,
sparse storage, debounced writes) is in
[`docs/layer-control-design.md`](layer-control-design.md). This page
is the consumer API surface and migration recipes.

## When to use it

- **Yes:** persistent user choice that should follow the user
  across devices (overlay on/off, preferred playback speed, panel
  open state). Default behaviour is the YAML config; the user opts
  in to a runtime override and that override sticks.
- **No:** transient session state (current scrub position, last
  click coordinate) — just use a class property.
- **No:** dashboard-author intent (what overlays exist, what
  colours to use). That stays in YAML / the editor.

## Why not `localStorage`

- Shared across all users on the same browser. A guest viewing a
  shared family dashboard would see whatever the owner last set.
- Doesn't sync across devices.
- Persists indefinitely with no admin control.
- Cross-origin in HA's `<iframe>` and webview contexts.

HA's frontend storage WS API solves all four (server-side,
per-user, syncs everywhere, admin-controllable).

## API at a glance

```ts
import { ViewerState } from './viewer-state';

const state = new ViewerState({
  hass: this._hass,                     // for callWS
  getConfig: () => this._config,        // resolved at call time
  onIdentityMinted: (id) => {
    // Dispatch config-changed so Lovelace persists the id to YAML.
    // The next setConfig() will carry the new id and the state
    // becomes active.
    fireEvent(this, 'config-changed', { config: { ...this._config, _layer_state_id: id } });
  },
});

// In setConfig — idempotent, call on every config update
state.ensureIdentity();

// In connectedCallback (after first ensureIdentity activates the state)
await state.hydrate();

// In disconnectedCallback
state.dispose();

// Consumer surface:
state.isActive;                          // boolean — true when storage is live
state.get<number>('playback_speed');     // sync, returns undefined when inactive or absent
state.set('playback_speed', 2);          // optimistic, debounced WS write
state.delete('playback_speed');          // remove (sparse-storage pattern)
await state.reset();                      // clear all entries for this card
state.subscribe(event => { ... });        // change notifications; returns unsubscribe fn
```

## Activation gating

Consumers must respect the admin opt-in. The `viewer_layer_control`
YAML field (boolean, defaults false) gates the entire framework:

- **Off:** `isActive === false`. `get` returns `undefined`. `set` / `delete` are no-ops. No WS calls. No identity minted.
- **On:** card auto-mints `_layer_state_id` on the next `setConfig`. After the round-trip (Lovelace writes the id back, `setConfig` fires again), `isActive` flips to `true` and the storage is live.

Users don't see or touch `_layer_state_id` — it's stamped onto the
YAML by the card on demand. They only see (and toggle) `viewer_layer_control`
in the editor.

A consumer adding the first runtime feature is responsible for:
1. Wiring `viewer_layer_control` into the editor UI (a toggle in
   the appropriate section).
2. Calling `state.ensureIdentity()` from `setConfig`.
3. Gating its own UI on `state.isActive` so the feature doesn't
   appear with broken persistence when the toggle is off.

Subsequent consumers can rely on the gating already being in place.

## Sparse storage convention

The framework stores **explicit overrides only**. Consumers manage
their own defaults and call `delete` when a value returns to default:

```ts
function onPlaybackSpeedChange(value: number): void {
  if (value === DEFAULT_PLAYBACK_SPEED) {
    state.delete('playback_speed');
  } else {
    state.set('playback_speed', value);
  }
}

function effectivePlaybackSpeed(): number {
  return state.get<number>('playback_speed') ?? DEFAULT_PLAYBACK_SPEED;
}
```

This keeps stored records small AND lets YAML default changes
propagate to users who haven't taken explicit control. The
alternative — always storing — would freeze each user at whatever
value they first observed.

## Migration recipe — `localStorage` → `ViewerState`

For [PR #157](https://github.com/jpettitt/weather-radar-card/pull/157),
the current shape is:

```ts
// localStorage-based — current PR #157
const STORAGE_KEY = 'weather-radar-card-playback-speed';

function loadPlaybackSpeed(): number | undefined {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && SPEED_STEPS.includes(n) ? n : undefined;
}

function savePlaybackSpeed(value: number): void {
  localStorage.setItem(STORAGE_KEY, String(value));
}

function clearPlaybackSpeed(): void {
  localStorage.removeItem(STORAGE_KEY);
}
```

Migrated to ViewerState:

```ts
// ViewerState-based — proposed for the rebased PR
const KEY = 'playback_speed';

function loadPlaybackSpeed(state: ViewerState): number | undefined {
  const v = state.get<number>(KEY);
  return typeof v === 'number' && SPEED_STEPS.includes(v) ? v : undefined;
}

function savePlaybackSpeed(state: ViewerState, value: number): void {
  if (value === DEFAULT_PLAYBACK_SPEED) {
    state.delete(KEY);
  } else {
    state.set(KEY, value);
  }
}
```

Plus the wiring in `weather-radar-card.ts`:

- Add the `ViewerState` field to the card class
- Create the instance in `setConfig` (only first time)
- Call `state.ensureIdentity()` at the end of `setConfig`
- Call `await state.hydrate()` in `connectedCallback` after activation
- Call `state.dispose()` in `disconnectedCallback`
- Gate the toolbar speed button on `state.isActive` (or fall back to in-memory if `!isActive`)

The editor needs one new control:

```ts
// In the Animation or Advanced section
<label>
  <ha-switch
    .checked=${config.viewer_layer_control === true}
    .configValue=${'viewer_layer_control'}
    @change=${this._valueChangedSwitch}
  ></ha-switch>
  <span>${localize('editor.viewer_layer_control')}</span>
</label>
```

Resolution order changes from:

> localStorage > editor / YAML > 1×

to:

> ViewerState (if active) > YAML > 1×

That's a meaningful improvement: when a dashboard owner changes the
YAML default, every user immediately picks up the change unless
they've explicitly overridden via the toolbar — exactly the
behaviour the original PR description was reaching for.

## Identity lifecycle (when does the storage key change?)

| Event | Identity | Storage impact |
|---|---|---|
| Card mounted, `viewer_layer_control` off | none | none |
| Card mounted, `viewer_layer_control` on, no `_layer_state_id` | mint on first setConfig | new storage key — empty cache |
| Card mounted, id matches current dashboard URL | use existing nonce | cache hydrates from existing record |
| Card moved to a different dashboard URL | re-mint | new storage key — empty cache (previous record orphaned) |
| Card copy-pasted within the same dashboard | second card re-mints | second card gets new storage key; first card keeps original |
| Card dragged within the same dashboard section | unchanged | unchanged |
| Any YAML field edited (other than `_layer_state_id` itself) | unchanged | unchanged |
| Dashboard URL renamed | all cards re-mint | all stored state effectively reset |

The dashboard-rename case is the main "lost-state" failure mode —
rare in practice, and recoverable by toggling the admin switch off
+ on (which clears the orphaned identity and lets the user choose
afresh). Worth knowing about.

## Failure modes

- **WS unavailable** (old HA, weird auth state, network drop): hydrate fails silently with a single `console.warn`, in-memory cache stays empty. `get` returns `undefined`. `set` / `delete` mutate cache and try to write each time, also failing silently. The session works without persistence.
- **WS write race** (two cards on the same dashboard, both writing): each card has its own storage key (different nonces), so no race. Two consumers within the same card calling `set` on different keys — both end up in the same debounced write payload, last call wins for each key.
- **Stale subscriber**: `dispose()` clears all subscribers. Callers should also call the returned unsubscribe function from `subscribe()` when they tear down before the card does.

## Test patterns

The [test suite](../tests/viewer-state.test.ts) covers identity
minting, dashboard-path re-mint, copy-paste collision detection,
hydration round-trip with mocked `hass.callWS`, debounced write
coalescing, sparse storage via `delete`, subscribe / unsubscribe,
and graceful degradation on WS failure.

For consumer tests:

```ts
import { ViewerState, _resetLiveCardsForTests } from '../src/viewer-state';

beforeEach(() => {
  _resetLiveCardsForTests();
});

const callWS = vi.fn(async () => ({}));
const hass = { callWS } as unknown as HomeAssistant;

let config: WeatherRadarCardConfig = {
  type: 'custom:weather-radar-card',
  viewer_layer_control: true,
  _layer_state_id: { dash: '/lovelace/0', nonce: 'mytest1' },
};

const state = new ViewerState({
  hass,
  getConfig: () => config,
  onIdentityMinted: (id) => { config = { ...config, _layer_state_id: id }; },
});
state.ensureIdentity();
// Now exercise your consumer against `state`.
```

Use `vi.useFakeTimers()` + `vi.advanceTimersByTime(500)` +
`await vi.runAllTimersAsync()` to flush debounced writes
deterministically.
