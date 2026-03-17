#!/usr/bin/env node
/**
 * generate-icons.mjs
 *
 * Generates all PWA icon PNGs required by manifest.ts from app/icon.svg.
 * Run once locally (or as a prebuild step) to populate public/:
 *
 *   node scripts/generate-icons.mjs
 *
 * Output files:
 *   public/icon-192.png            — standard 192×192
 *   public/icon-512.png            — standard 512×512
 *   public/icon-maskable-192.png   — maskable 192×192 (20% safe-zone padding)
 *   public/icon-maskable-512.png   — maskable 512×512 (20% safe-zone padding)
 */

import sharp from "sharp";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const svgPath = resolve(root, "app", "icon.svg");
const publicDir = resolve(root, "public");

if (!existsSync(svgPath)) {
  console.error(`❌  SVG source not found: ${svgPath}`);
  process.exit(1);
}

if (!existsSync(publicDir)) {
  mkdirSync(publicDir, { recursive: true });
}

const svgBuffer = readFileSync(svgPath);

/**
 * Wraps the source SVG inside a larger canvas with padding so that the icon
 * fits entirely within the maskable "safe zone" (centre 80% of the canvas).
 * The outer 10% on each side becomes a solid background bleed.
 *
 * @param {Buffer} svg        Original SVG buffer
 * @param {number} outputSize Final pixel size of the output PNG
 * @returns {Buffer}          New SVG buffer with padding applied
 */
function makeMaskableSvg(svg, outputSize) {
  // Safe zone = 80 % of canvas → 10 % padding on each side
  const padding = Math.round(outputSize * 0.1);
  const innerSize = outputSize - padding * 2;

  const original = svg.toString("utf8");

  // We embed the original SVG as a nested <svg> inside a padded wrapper.
  // The wrapper has the same background colour as the icon so the bleed area
  // matches rather than being transparent.
  const wrapped = `<svg xmlns="http://www.w3.org/2000/svg"
    width="${outputSize}" height="${outputSize}"
    viewBox="0 0 ${outputSize} ${outputSize}">
  <!-- background bleed so the safe-zone padding isn't transparent -->
  <defs>
    <linearGradient id="bgBleed" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a4a8e"/>
      <stop offset="100%" style="stop-color:#2563eb"/>
    </linearGradient>
  </defs>
  <rect width="${outputSize}" height="${outputSize}" fill="url(#bgBleed)"/>
  <!-- inner icon, scaled to safe zone -->
  <svg x="${padding}" y="${padding}"
       width="${innerSize}" height="${innerSize}"
       viewBox="0 0 512 512">
    ${
      // Strip the outer <svg …> wrapper and inject just the inner elements
      original
        .replace(/<\?xml[^>]*\?>/gi, "")
        .replace(/<svg[^>]*>/i, "")
        .replace(/<\/svg>\s*$/i, "")
    }
  </svg>
</svg>`;

  return Buffer.from(wrapped, "utf8");
}

const icons = [
  { filename: "icon-192.png", size: 192, maskable: false },
  { filename: "icon-512.png", size: 512, maskable: false },
  { filename: "icon-maskable-192.png", size: 192, maskable: true },
  { filename: "icon-maskable-512.png", size: 512, maskable: true },
];

for (const { filename, size, maskable } of icons) {
  const outPath = resolve(publicDir, filename);
  const inputSvg = maskable ? makeMaskableSvg(svgBuffer, 512) : svgBuffer;

  await sharp(inputSvg)
    .resize(size, size, { fit: "contain", background: { r: 26, g: 74, b: 142, alpha: 1 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outPath);

  console.log(`✅  ${filename}  (${size}×${size}${maskable ? ", maskable" : ""})`);
}

console.log("\n🎉  All PWA icons generated in public/");
