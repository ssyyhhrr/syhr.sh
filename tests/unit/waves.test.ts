/**
 * Protects the background animation's motion. The waves were kept on condition they look
 * the same and stop burning battery, so the speed must not depend on frame rate, the bands must
 * keep cycling forever, and the outline must always cover the screen at any sway angle.
 */
import { describe, expect, it } from "vitest";
import {
  advanceWaves,
  DEFAULT_WAVE_SETTINGS,
  initialWaveState,
  layerOutline,
  seededRandom,
  type WaveState,
} from "../../src/core/waves.ts";

const flatNoise = () => 0;

function run(state: WaveState, totalMs: number, stepMs: number): WaveState {
  let current = state;
  const steps = Math.round(totalMs / stepMs);
  for (let i = 0; i < steps; i++) current = advanceWaves(current, stepMs);
  return current;
}

describe("initialWaveState", () => {
  it("spreads bands + 1 layers evenly, cycling the palette", () => {
    const { layers, sway } = initialWaveState();
    expect(layers).toHaveLength(DEFAULT_WAVE_SETTINGS.bands + 1);
    expect(layers.map((l) => l.progress)).toEqual(
      layers.map((_, i) => 1 - i / DEFAULT_WAVE_SETTINGS.bands),
    );
    expect(layers[5]?.color).toBe(DEFAULT_WAVE_SETTINGS.colors[0]);
    expect(sway).toBeCloseTo(Math.PI / 4);
  });
});

describe("advanceWaves", () => {
  it("moves at the old 60 fps speed, whatever the frame rate", () => {
    const at60 = run(initialWaveState(), 1000, 1000 / 60);
    const at30 = run(initialWaveState(), 1000, 1000 / 30);
    // The old code added 0.001 per frame: 0.06 a second at 60 fps.
    expect(at60.sway - Math.PI / 4).toBeCloseTo(0.06, 6);
    expect(at30.sway).toBeCloseTo(at60.sway, 9);
    expect(at30.layers.map((l) => l.progress)).toEqual(
      at60.layers.map((l) => expect.closeTo(l.progress, 9) as unknown),
    );
  });

  it("restarts a layer that passes the top at the bottom, drawn last", () => {
    const start = initialWaveState();
    const top = start.layers[0];
    // The top layer starts at 1 and restarts once past 1 + 1/9: just under 2 seconds. It keeps
    // the sliver it overshot by, so the bands stay evenly spaced.
    const next = advanceWaves(start, 2000);
    const restartAbove = 1 + 1 / DEFAULT_WAVE_SETTINGS.bands;
    expect(next.layers.at(-1)).toEqual({
      ...top,
      progress: expect.closeTo(1.12 - restartAbove, 9) as unknown,
    });
    expect(next.layers).toHaveLength(start.layers.length);
  });

  it("keeps the bands evenly spaced however uneven the frames are", () => {
    // Steps of 7-100 ms, like a real page with dropped frames, for an hour.
    let state = initialWaveState();
    const random = seededRandom(7);
    for (let t = 0; t < 60 * 60_000;) {
      const step = 7 + random() * 93;
      state = advanceWaves(state, step);
      t += step;
    }
    const spacing = 1 + 1 / DEFAULT_WAVE_SETTINGS.bands;
    const cycle = spacing / state.layers.length;
    const phases = state.layers.map((l) => l.progress).sort((a, b) => a - b);
    for (let i = 1; i < phases.length; i++) {
      expect((phases[i] ?? 0) - (phases[i - 1] ?? 0)).toBeCloseTo(cycle, 6);
    }
  });

  it("keeps cycling indefinitely with every layer in range", () => {
    const later = run(initialWaveState(), 10 * 60_000, 33);
    const ids = later.layers.map((l) => l.id).sort((a, b) => a - b);
    expect(ids).toEqual(initialWaveState().layers.map((l) => l.id));
    for (const layer of later.layers) {
      expect(layer.progress).toBeGreaterThanOrEqual(0);
      expect(layer.progress).toBeLessThanOrEqual(1 + 1 / DEFAULT_WAVE_SETTINGS.bands);
    }
  });
});

describe("layerOutline", () => {
  it("is a closed band spanning the whole diagonal, crest at its progress", () => {
    const state = initialWaveState();
    const layer = { id: 0, progress: 0.25, color: "#000" };
    const points = layerOutline(layer, state, 1000, flatNoise);
    const xs = points.map((p) => p.x);
    expect(Math.min(...xs)).toBe(-500);
    expect(Math.max(...xs)).toBe(500);
    // Bottom edge sits at the square's bottom; with flat noise the crest is a straight line.
    expect(points.slice(1, 3).every((p) => p.y === 500)).toBe(true);
    const crest = 500 - 1000 * 0.25;
    expect(points.slice(4).every((p) => p.y === crest)).toBe(true);
    expect(points).toHaveLength(4 + 1000 / DEFAULT_WAVE_SETTINGS.segmentSize);
  });

  it("offsets the crest by the noise, scaled to the amplitude", () => {
    const state = initialWaveState();
    const layer = { id: 3, progress: 0.5, color: "#000" };
    const up = layerOutline(layer, state, 200, () => 1);
    const amplitude = DEFAULT_WAVE_SETTINGS.segmentSize * DEFAULT_WAVE_SETTINGS.amplitudeInSegments;
    expect(up[4]?.y).toBeCloseTo(0 + amplitude);
  });
});

describe("seededRandom", () => {
  it("repeats for the same seed and stays in [0, 1)", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const values = Array.from({ length: 1000 }, () => a());
    expect(values).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});
