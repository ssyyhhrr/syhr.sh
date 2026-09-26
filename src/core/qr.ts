/**
 * Turns a QR code's module grid into one SVG path, so the browser can draw a crisp, scalable
 * code with a single element. The QR encoding itself comes from the `uqr` library.
 */

/**
 * An SVG path covering every dark module. Each row's runs of dark modules become one
 * rectangle, which keeps the path short (a module-per-rectangle path is several times longer).
 * Coordinates are in modules; `offset` shifts everything to leave a quiet zone.
 */
export function qrModulesToPath(modules: readonly (readonly boolean[])[], offset = 0): string {
  const parts: string[] = [];
  modules.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x++;
      parts.push(`M${start + offset} ${y + offset}h${x - start}v1h-${x - start}z`);
    }
  });
  return parts.join("");
}
