const fallbackColors = ['#22d3ee', '#a78bfa', '#f472b6'] as const;

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());

  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1]!, 16);

  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')}`;
}

function rgbToHsl(red: number, green: number, blue: number): [number, number, number] {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;
  const max = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const min = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;

  if (delta !== 0) {
    if (max === normalizedRed) {
      hue = ((normalizedGreen - normalizedBlue) / delta) % 6;
    } else if (max === normalizedGreen) {
      hue = (normalizedBlue - normalizedRed) / delta + 2;
    } else {
      hue = (normalizedRed - normalizedGreen) / delta + 4;
    }

    hue *= 60;
  }

  return [(hue + 360) % 360, saturation, lightness];
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lightness - chroma / 2;
  const normalizedHue = ((hue % 360) + 360) % 360;
  let channels: [number, number, number];

  if (normalizedHue < 60) {
    channels = [chroma, secondary, 0];
  } else if (normalizedHue < 120) {
    channels = [secondary, chroma, 0];
  } else if (normalizedHue < 180) {
    channels = [0, chroma, secondary];
  } else if (normalizedHue < 240) {
    channels = [0, secondary, chroma];
  } else if (normalizedHue < 300) {
    channels = [secondary, 0, chroma];
  } else {
    channels = [chroma, 0, secondary];
  }

  return [
    (channels[0] + match) * 255,
    (channels[1] + match) * 255,
    (channels[2] + match) * 255,
  ];
}

function shift(base: string, hueOffset: number, saturationScale: number, lightnessTarget: number): string {
  const rgb = hexToRgb(base);

  if (!rgb) {
    return fallbackColors[1];
  }

  const [hue, saturation] = rgbToHsl(...rgb);
  const shifted = hslToRgb(
    hue + hueOffset,
    Math.max(0.42, Math.min(0.95, saturation * saturationScale)),
    lightnessTarget,
  );

  return rgbToHex(...shifted);
}

export function getPulseColors(baseColor: string): [string, string, string] {
  const rgb = hexToRgb(baseColor);

  if (!rgb) {
    return [...fallbackColors];
  }

  return [
    rgbToHex(...rgb),
    shift(baseColor, 42, 1.05, 0.58),
    shift(baseColor, -42, 0.92, 0.48),
  ];
}
