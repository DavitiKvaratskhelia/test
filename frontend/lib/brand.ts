// Per-company brand colour -> the CSS variables the whole UI already uses (light + dark variants).
// Charts keep the separately validated chart colour; only brand accents follow the company.
type RGB = [number, number, number];
const toRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t)) as RGB;
const lum = ([r, g, b]: RGB) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const css = (c: RGB) => c.join(" ");
const BLACK: RGB = [0, 0, 0], WHITE: RGB = [255, 255, 255], DARK_SURFACE: RGB = [15, 23, 41];

export function brandCss(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return "";
  const c = toRgb(hex);
  const onBrand = (x: RGB) => (lum(x) > 0.55 ? "23 23 28" : "255 255 255");
  const dc = lum(c) < 0.3 ? mix(c, WHITE, 0.3) : c;   // a very dark brand colour is lifted so it stays visible on the dark theme
  return `:root{--brand:${css(c)};--brand-hover:${css(mix(c, BLACK, 0.18))};--brand-text:${css(mix(c, BLACK, 0.3))};--brand-light:${css(mix(c, WHITE, 0.9))};--on-brand:${onBrand(c)}}
.dark{--brand:${css(dc)};--brand-hover:${css(mix(dc, WHITE, 0.15))};--brand-text:${css(mix(dc, WHITE, 0.35))};--brand-light:${css(mix(dc, DARK_SURFACE, 0.82))};--on-brand:${onBrand(dc)}}`;
}

export function applyBrand(hex?: string | null) {
  if (typeof document === "undefined") return;
  let el = document.getElementById("tenant-brand");
  if (!el) { el = document.createElement("style"); el.id = "tenant-brand"; document.head.appendChild(el); }
  el.textContent = hex ? brandCss(hex) : "";
}
