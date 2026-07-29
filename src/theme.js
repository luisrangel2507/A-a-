// Shared design tokens, so the sign-in screens and the app itself stay one product.
//
// Taken from the shop's own logo rather than invented: the mark is 60% coral
// (#F84840) and 26% forest green (#003828), and the app used to be purple, which
// belonged to nothing. Two brand colours, used for two different jobs, so a glance
// at a button says what kind of thing it does:
//
//   forest — structure and moving forward. The header, Continue, the progress.
//   coral  — money changing hands. Add to order, Charge. Nothing else.
//   good   — free, included, balanced. The green that means "no charge".
//   alert  — destructive or short. Deliberately deeper than coral so a Void can
//            never be mistaken for a Charge.
//
// Every pair below is contrast-checked; see scripts/check-contrast.mjs.
export const COLOR = {
  // The logo's own coral. Bright enough to carry the mark, too bright to put white
  // text on, so it is used for accents and the icon rather than for filled buttons.
  brand: "#F84840",

  forest: "#003828",
  forestSoft: "#3C6355",
  forestPale: "#E8F0EC",

  // Darkened from the logo's coral until white text on it clears 4.5:1.
  coral: "#C6382A",
  coralPale: "#FDECE9",

  good: "#256B47",
  goodPale: "#EAF4EE",

  alert: "#A62018",
  alertPale: "#FCEBE9",

  // A warm paper ground. Not the pink it used to be — that read as a wellness app,
  // and a shop's counter tablet sits under bright light where a neutral is calmer.
  bg: "#FBF7F3",
  card: "#FFFFFF",

  ink: "#15211C",
  inkSoft: "#5C6B64",
  line: "#DCE3DE",

  // Cards separate from the ground by sitting on it, not by being outlined. A
  // hairline the same value as the page was doing nothing; this does the work.
  lift: "0 1px 2px rgba(21,33,28,0.04), 0 6px 16px -8px rgba(21,33,28,0.10)",
};

export default COLOR;
