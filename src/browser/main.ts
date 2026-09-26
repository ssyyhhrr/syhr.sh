/**
 * The page's only script: marks the page as scripted (which reveals Copy, Share and the QR
 * code; see `.no-js` in styles.css), starts the wave background and upgrades the form.
 */
import { enhanceForm } from "./form.ts";
import { startWaves } from "./waves.ts";

document.documentElement.classList.replace("no-js", "js");

const canvas = document.querySelector("canvas.waves");
if (canvas instanceof HTMLCanvasElement) startWaves(canvas);

enhanceForm();
