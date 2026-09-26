/**
 * Draws the wave background on a full-screen canvas. The motion itself is pure maths in
 * src/core/waves.ts; this file is only about drawing it cheaply:
 *
 * - at most 30 frames a second (the waves move slowly; 60 fps only doubled the work);
 * - at no more than 1.5 device pixels per CSS pixel, and a capped total, so a 4K or 3x phone
 *   screen isn't asked to fill tens of millions of pixels every frame;
 * - straight onto the canvas (the old code drew to a second canvas and copied it across);
 * - paused while the tab is hidden, and a single still frame under prefers-reduced-motion.
 */
import { createNoise3D } from "simplex-noise";
import {
  advanceWaves,
  initialWaveState,
  layerOutline,
  seededRandom,
  type WaveState,
} from "../core/waves.ts";

const FRAME_INTERVAL_MS = 1000 / 30;
const MAX_PIXEL_RATIO = 1.5;
const MAX_CANVAS_PIXELS = 2_500_000;
/** After a long pause (a hidden tab, a slow frame), don't jump the animation ahead. */
const MAX_STEP_MS = 100;
const BACKGROUND = "#171717";

/** Starts the waves on `canvas`. Returns a function that stops them. */
export function startWaves(canvas: HTMLCanvasElement, win: Window = window): () => void {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return () => undefined;
  // A fixed seed, so the picture is the same on every visit.
  const noise = createNoise3D(seededRandom(0x5eed));
  const reducedMotion = win.matchMedia("(prefers-reduced-motion: reduce)");
  let state: WaveState = initialWaveState();
  let scale = 1;
  let frame = 0;
  let lastTime: number | null = null;

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    scale = Math.min(win.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    scale = Math.min(scale, Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, width * height)));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
  };

  const draw = () => {
    const width = canvas.width / scale;
    const height = canvas.height / scale;
    const diagonal = Math.hypot(width, height);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.fillStyle = BACKGROUND;
    context.fillRect(0, 0, width, height);
    context.translate(width / 2, height / 2);
    context.rotate(Math.sin(state.sway));
    for (const layer of state.layers) {
      const [first, ...rest] = layerOutline(layer, state, diagonal, noise);
      if (!first) continue;
      context.beginPath();
      context.moveTo(first.x, first.y);
      for (const point of rest) context.lineTo(point.x, point.y);
      context.closePath();
      context.fillStyle = layer.color;
      context.fill();
    }
  };

  const tick = (time: number) => {
    frame = 0;
    if (lastTime !== null && time - lastTime < FRAME_INTERVAL_MS - 1) {
      frame = win.requestAnimationFrame(tick);
      return;
    }
    const step = lastTime === null ? 0 : Math.min(time - lastTime, MAX_STEP_MS);
    lastTime = time;
    state = advanceWaves(state, step);
    draw();
    frame = win.requestAnimationFrame(tick);
  };

  const shouldAnimate = () => !reducedMotion.matches && !win.document.hidden;

  const play = () => {
    if (frame !== 0 || !shouldAnimate()) return;
    lastTime = null;
    frame = win.requestAnimationFrame(tick);
  };

  const pause = () => {
    if (frame !== 0) win.cancelAnimationFrame(frame);
    frame = 0;
  };

  const update = () => {
    if (shouldAnimate()) play();
    else pause();
  };

  let resizeTimer = 0;
  const onResize = () => {
    win.clearTimeout(resizeTimer);
    resizeTimer = win.setTimeout(() => {
      resize();
      draw();
    }, 150);
  };

  resize();
  draw();
  update();
  win.document.addEventListener("visibilitychange", update);
  reducedMotion.addEventListener("change", update);
  win.addEventListener("resize", onResize);

  return () => {
    pause();
    win.document.removeEventListener("visibilitychange", update);
    reducedMotion.removeEventListener("change", update);
    win.removeEventListener("resize", onResize);
  };
}
