import { describe, it, expect, vi } from 'vitest';

// Leaflet stub so radar-toolbar.ts can be imported without a DOM. We
// only touch the pure formatSpeed helper here; the L.Control class isn't
// instantiated.
vi.mock('leaflet', () => {
  class Control {}
  class Map {}
  const DomUtil = { create: vi.fn() };
  const DomEvent = { disableClickPropagation: vi.fn(), on: vi.fn(), preventDefault: vi.fn() };
  return {
    Control, Map, DomUtil, DomEvent,
    default: { Control, Map, DomUtil, DomEvent },
  };
});

import { formatSpeed, SPEED_STEPS } from '../src/radar-toolbar';

describe('formatSpeed', () => {
  it('renders ¼ and ½ using Unicode fractions so the toolbar button stays narrow', () => {
    expect(formatSpeed(0.25)).toBe('¼×');
    expect(formatSpeed(0.5)).toBe('½×');
  });

  it('renders integer speeds without a decimal point', () => {
    expect(formatSpeed(1)).toBe('1×');
    expect(formatSpeed(2)).toBe('2×');
    expect(formatSpeed(4)).toBe('4×');
  });

  it('falls back to two decimal places for non-canonical values', () => {
    // Out of preset, but should still print sensibly if someone calls
    // formatSpeed with a stored value that's drifted.
    expect(formatSpeed(0.75)).toBe('0.75×');
    expect(formatSpeed(1.5)).toBe('1.50×');
  });
});

describe('SPEED_STEPS', () => {
  it('is monotonically increasing and includes 1× as the canonical default', () => {
    for (let i = 1; i < SPEED_STEPS.length; i++) {
      expect(SPEED_STEPS[i]).toBeGreaterThan(SPEED_STEPS[i - 1]);
    }
    expect(SPEED_STEPS).toContain(1);
  });

  it('covers a useful range either side of 1× for slowing and speeding up', () => {
    expect(SPEED_STEPS[0]).toBeLessThan(1);  // at least one slow preset
    expect(SPEED_STEPS[SPEED_STEPS.length - 1]).toBeGreaterThan(1);  // at least one fast preset
  });
});
