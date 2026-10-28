/**
 * Returns a copy of a prism-react-renderer theme in which every token colour
 * has at least `minRatio` WCAG contrast against the theme background
 * (default 4.5:1, AA for normal text). Colours that fall short are darkened
 * on light backgrounds and lightened on dark ones, keeping their hue.
 *
 * Lighthouse flagged the stock `github` theme: its teal (#36acaa) is 2.6:1.
 */

function parse(color) {
  if (typeof color !== "string") return null;
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, "$&$&") : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const rgb = color.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (rgb) return rgb.slice(1, 4).map(Number);
  const hsl = color.match(
    /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i,
  );
  if (!hsl) return null;
  const [h, s, l] = [Number(hsl[1]) / 360, hsl[2] / 100, hsl[3] / 100];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [h + 1 / 3, h, h - 1 / 3].map((t) => Math.round(channel(t) * 255));
}

function luminance([r, g, b]) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function toHex(rgb) {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/** Move `color` toward black (or white) until it reaches `minRatio`. */
function fix(color, background, minRatio) {
  const fg = parse(color);
  if (!fg || contrast(fg, background) >= minRatio) return color;
  const target = luminance(background) > 0.5 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0.05; t <= 1; t += 0.05) {
    const mixed = fg.map((v, i) => v + (target[i] - v) * t);
    if (contrast(mixed, background) >= minRatio) return toHex(mixed);
  }
  return toHex(target);
}

function accessiblePrismTheme(theme, minRatio = 4.5) {
  const background = parse(theme.plain.backgroundColor) || [255, 255, 255];
  const fixStyle = (style) =>
    style.color
      ? { ...style, color: fix(style.color, background, minRatio) }
      : style;
  return {
    ...theme,
    plain: fixStyle(theme.plain),
    styles: theme.styles.map((s) => ({ ...s, style: fixStyle(s.style) })),
  };
}

module.exports = { accessiblePrismTheme, contrast, parse };
