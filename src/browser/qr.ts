/**
 * Draws a QR code for a short link as an SVG, dark modules on a white tile with the standard
 * four-module quiet zone, which scanners need to find the code.
 */
import { encode } from "uqr";
import { qrModulesToPath } from "../core/qr.ts";

const SVG = "http://www.w3.org/2000/svg";
const QUIET_ZONE = 4;

/** Replaces the contents of `container` with a QR code of `text`. */
export function renderQr(container: Element, text: string): void {
  // Medium error correction: survives a smudged screen, and keeps short links at version 2.
  const { data, size } = encode(text, { ecc: "M", border: 0 });
  const extent = size + QUIET_ZONE * 2;
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${extent} ${extent}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("aria-hidden", "true");
  const tile = document.createElementNS(SVG, "rect");
  tile.setAttribute("width", String(extent));
  tile.setAttribute("height", String(extent));
  tile.setAttribute("fill", "#fff");
  const modules = document.createElementNS(SVG, "path");
  modules.setAttribute("d", qrModulesToPath(data, QUIET_ZONE));
  modules.setAttribute("fill", "#171717");
  svg.append(tile, modules);
  container.replaceChildren(svg);
}
