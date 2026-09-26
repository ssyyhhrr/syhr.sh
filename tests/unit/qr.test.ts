/**
 * Protects the conversion from a QR module grid to an SVG path. A wrong rectangle makes the
 * code unscannable, and the end-to-end test that decodes the rendered QR would only say "it
 * doesn't scan"; these pin down exactly which modules are drawn.
 */
import { encode } from "uqr";
import { describe, expect, it } from "vitest";
import { qrModulesToPath } from "../../src/core/qr.ts";

describe("qrModulesToPath", () => {
  it("draws each run of dark modules as one rectangle", () => {
    const grid = [
      [true, true, false, true],
      [false, false, false, false],
      [false, true, true, true],
    ];
    expect(qrModulesToPath(grid)).toBe("M0 0h2v1h-2zM3 0h1v1h-1zM1 2h3v1h-3z");
  });

  it("shifts everything by the quiet-zone offset", () => {
    expect(qrModulesToPath([[true]], 4)).toBe("M4 4h1v1h-1z");
  });

  it("covers exactly the dark modules of a real code", () => {
    const { data } = encode("https://syhr.sh/Ab3dE9");
    const path = qrModulesToPath(data);
    const drawn = [...path.matchAll(/M(\d+) (\d+)h(\d+)/g)].reduce(
      (sum, [, , , width]) => sum + Number(width),
      0,
    );
    expect(drawn).toBe(data.flat().filter(Boolean).length);
  });
});
