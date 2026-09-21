export interface ContrastResult {
  ratio: number;
  passesAa: boolean;
  label: string;
}

const HEX_COLOR = /^#?([0-9A-F]{6})$/i;

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number | null {
  const match = HEX_COLOR.exec(hex);
  if (!match?.[1]) return null;
  const value = match[1];
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return 0.2126 * channelToLinear(red) + 0.7152 * channelToLinear(green) + 0.0722 * channelToLinear(blue);
}

export function getContrastResult(foreground: string, background: string): ContrastResult {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) {
    return { ratio: 0, passesAa: false, label: "INVALID COLOR" };
  }

  const ratio = (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
  const roundedRatio = Math.round(ratio * 100) / 100;
  const passesAa = ratio >= 4.5;
  return {
    ratio: roundedRatio,
    passesAa,
    label: `${passesAa ? "AA PASS" : "AA WARN"} // ${roundedRatio.toFixed(2)}:1`,
  };
}
