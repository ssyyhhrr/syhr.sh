/**
 * The animated wave background, as pure maths: how the layers move over time and the outline
 * of each one. The browser (src/browser/waves.ts) only draws what this returns.
 *
 * The motion is the old site's, kept deliberately: bands of simplex-noise waves, each
 * a little further along, drifting across the screen while the whole scene slowly sways. The
 * old code advanced a fixed step per animation frame, so it ran twice as fast on a 120 Hz
 * screen as on a 60 Hz one. Here every rate is per second, set to what the old code did at
 * 60 fps, and the browser can draw at a lower frame rate without changing the speed.
 */

/** Samples 3D simplex noise; returns a value in [-1, 1]. */
export type Noise3D = (x: number, y: number, z: number) => number;

/** Tunable look and speed of the waves. */
export interface WaveSettings {
  /** Fill colours, cycled through the layers. */
  colors: readonly string[];
  /** Number of bands; there is one more layer than this, as in the old code. */
  bands: number;
  /** How far each layer advances per second (progress runs 0 to about 1). */
  progressPerSecond: number;
  /** How fast the sway angle grows, in radians per second. */
  swayPerSecond: number;
  /** Noise time per millisecond: how quickly the wave shapes morph. */
  morphPerMs: number;
  /** Target horizontal distance between outline points, in CSS pixels. */
  segmentSize: number;
  /** Wave height, as a multiple of the segment size. */
  amplitudeInSegments: number;
  /** Noise sampling scale along the wave. */
  noiseZoom: number;
}

/**
 * The old site's values (per-frame steps of 0.001 at 60 fps). The palette is darker than the
 * old #666–#222 greys so white text and the gold accent stay readable on top.
 */
export const DEFAULT_WAVE_SETTINGS: WaveSettings = {
  colors: ["#383838", "#2f2f2f", "#272727", "#202020", "#1a1a1a"],
  bands: 9,
  progressPerSecond: 0.06,
  swayPerSecond: 0.06,
  morphPerMs: 1 / 5000,
  segmentSize: 10,
  amplitudeInSegments: 4,
  noiseZoom: 0.03,
};

/** One band of the waves. */
export interface WaveLayer {
  /** Stable identity; also offsets this layer's noise so layers don't move in lockstep. */
  id: number;
  /** How far the band has risen, 0 (bottom) to a little over 1 (past the top). */
  progress: number;
  color: string;
}

/** The whole animation at one moment. Layers are in drawing order, bottom first. */
export interface WaveState {
  layers: WaveLayer[];
  /** Sway angle; the scene is rotated by sin(sway). */
  sway: number;
  /** Milliseconds of animation so far, which drives the noise. */
  elapsedMs: number;
}

/** The starting state: layers evenly spread, as the old code set them up. */
export function initialWaveState(settings: WaveSettings = DEFAULT_WAVE_SETTINGS): WaveState {
  const layers: WaveLayer[] = [];
  for (let id = 0; id <= settings.bands; id++) {
    layers.push({
      id,
      progress: 1 - id / settings.bands,
      color: settings.colors[id % settings.colors.length] ?? "#000",
    });
  }
  return { layers, sway: Math.PI * 0.25, elapsedMs: 0 };
}

/**
 * Moves the animation on by `deltaMs`. A layer that has risen past the top restarts at the
 * bottom and moves to the end of the drawing order (on top), which is what makes the bands
 * appear to flow endlessly.
 */
export function advanceWaves(
  state: WaveState,
  deltaMs: number,
  settings: WaveSettings = DEFAULT_WAVE_SETTINGS,
): WaveState {
  const seconds = deltaMs / 1000;
  const restartAbove = 1 + 1 / (state.layers.length - 1);
  const moved = state.layers.map((layer) => ({
    ...layer,
    progress: layer.progress + settings.progressPerSecond * seconds,
  }));
  const staying = moved.filter((layer) => layer.progress <= restartAbove);
  // Keep the overshoot rather than resetting to exactly 0: frame steps vary, and discarding a
  // different sliver each time would slowly bunch the bands together over hours.
  const restarting = moved
    .filter((layer) => layer.progress > restartAbove)
    .map((layer) => ({ ...layer, progress: layer.progress - restartAbove }));
  return {
    layers: [...staying, ...restarting],
    sway: state.sway + settings.swayPerSecond * seconds,
    elapsedMs: state.elapsedMs + deltaMs,
  };
}

/** A point in the rotated drawing space, centred on the middle of the screen. */
export interface Point {
  x: number;
  y: number;
}

/**
 * The outline of one layer as a closed polygon, in a square of side `diagonal` centred on the
 * origin. The caller rotates the canvas by `sin(state.sway)` first. The square is as wide as
 * the screen's diagonal so no corner shows at any angle.
 */
export function layerOutline(
  layer: WaveLayer,
  state: WaveState,
  diagonal: number,
  noise: Noise3D,
  settings: WaveSettings = DEFAULT_WAVE_SETTINGS,
): Point[] {
  const half = diagonal / 2;
  const segments = Math.max(1, Math.round(diagonal / settings.segmentSize));
  const segment = diagonal / segments;
  const amplitude = segment * settings.amplitudeInSegments;
  const crest = half - diagonal * layer.progress;
  const time = layer.id + state.elapsedMs * settings.morphPerMs;
  const points: Point[] = [
    { x: -half, y: crest },
    { x: -half, y: half },
    { x: half, y: half },
    { x: half, y: crest },
  ];
  for (let i = 1; i <= segments; i++) {
    const n = noise(i * settings.noiseZoom, i * settings.noiseZoom, time);
    points.push({ x: half - i * segment, y: crest + n * amplitude });
  }
  return points;
}

/**
 * A small seeded random generator (mulberry32), so the noise field, and so the picture, is the
 * same on every visit and in every screenshot.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
