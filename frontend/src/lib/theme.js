// Colours shared by the map and the page.
// Map paint can't read CSS variables, so the map colours live here in JavaScript.
// Keep INK and PAPER in sync with --ink and --paper in index.css.

export const INK = '#26303b' // text, borders
export const PAPER = '#f6f5f1' // page background

// One soft colour per "colour group" (the data script makes sure neighbouring
// wards never share a group). Earthy, muted tones that sit well together, so
// the map feels friendly without looking like a loud rainbow.
export const WARD_COLORS = [
  '#4f7cac', // lake blue
  '#d0805a', // terracotta
  '#7f9f6a', // sage
  '#b8607a', // rose
  '#c99a2e', // ochre
  '#3f8f8b', // teal
]
