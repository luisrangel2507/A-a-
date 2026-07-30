// Checks the colour pairs the app actually renders against WCAG AA.
//
// The register is read at arm's length, in a shop, by someone who is also talking to
// a customer. Contrast here is legibility under real conditions, not a badge — so
// this runs on the tokens themselves and fails loudly rather than being eyeballed.
//
//   node scripts/check-contrast.mjs

import { COLOR } from "../src/theme.js";

const srgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
};

const luminance = (hex) => {
  const [r, g, b] = srgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

// AA: 4.5 for body text, 3.0 for large text (18.66px bold / 24px) and for the
// boundary of a control you have to be able to find.
const CHECKS = [
  ["header wordmark on header", "#FFFFFF", COLOR.forest, 4.5],
  ["Continue label on Continue", "#FFFFFF", COLOR.forest, 4.5],
  ["Charge label on Charge", "#FFFFFF", COLOR.coral, 4.5],
  ["free chip label on chip", "#FFFFFF", COLOR.good, 4.5],
  ["Void it label on alert", "#FFFFFF", COLOR.alert, 4.5],
  ["body text on page", COLOR.ink, COLOR.bg, 4.5],
  ["body text on card", COLOR.ink, COLOR.card, 4.5],
  ["secondary text on card", COLOR.inkSoft, COLOR.card, 4.5],
  ["secondary text on page", COLOR.inkSoft, COLOR.bg, 4.5],
  ["price in forest on card", COLOR.forest, COLOR.card, 4.5],
  ["money in coral on card", COLOR.coral, COLOR.card, 4.5],
  ["free text on its pale panel", COLOR.good, COLOR.forestPale, 4.5],
  ["chosen-so-far chip text", COLOR.forest, COLOR.forestPale, 4.5],
  ["alert text on its pale panel", COLOR.alert, COLOR.alertPale, 4.5],
  ["queued-sales banner text", COLOR.alert, COLOR.alertPale, 4.5],
  ["free box text on pale green", COLOR.good, COLOR.goodPale, 4.5],
  ["selected size border", COLOR.coral, COLOR.coralPale, 3.0],
  ["out-of-stock / disabled text", COLOR.inkSoft, COLOR.card, 4.5],
  ["card edge against page", COLOR.line, COLOR.bg, 1.2],
];

let failed = 0;
for (const [what, fg, bg, min] of CHECKS) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${r.toFixed(2).padStart(5)}:1  (min ${min})  ${what}`);
}

console.log(failed === 0 ? "\nAll pairs pass." : `\n${failed} pair(s) below the bar.`);
process.exit(failed === 0 ? 0 : 1);
