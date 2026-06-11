// Regression coverage for the one-canvas-renderer-per-map rule.
//
// Live-debugged: NWS alert polygons stopped being clickable the moment
// the wildfire layer lazily created its OWN canvas renderer (first fire
// crossing the icon→polygon zoom threshold) — the second canvas stacked
// over the first and swallowed its clicks, and stayed dead after
// zooming back out. The fix is a single shared renderer per map; these
// tests pin the sharing contract.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('leaflet', () => {
  const canvas = vi.fn((opts?: unknown) => ({ kind: 'canvas-renderer', opts }));
  return { canvas, default: { canvas } };
});

import * as L from 'leaflet';
import { sharedCanvasRenderer } from '../src/shared-canvas-renderer';

beforeEach(() => {
  (L.canvas as unknown as ReturnType<typeof vi.fn>).mockClear();
});

describe('sharedCanvasRenderer', () => {
  it('returns the same renderer instance for the same map', () => {
    const map = {} as L.Map;
    const a = sharedCanvasRenderer(map);
    const b = sharedCanvasRenderer(map);
    expect(a).toBe(b);
    expect(L.canvas).toHaveBeenCalledTimes(1);
  });

  it('returns distinct renderers for distinct maps (card rebuild gets a fresh one)', () => {
    const mapA = {} as L.Map;
    const mapB = {} as L.Map;
    expect(sharedCanvasRenderer(mapA)).not.toBe(sharedCanvasRenderer(mapB));
  });

  it('creates the renderer with pan padding', () => {
    sharedCanvasRenderer({} as L.Map);
    expect(L.canvas).toHaveBeenCalledWith({ padding: 0.5 });
  });
});
