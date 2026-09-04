function parseColor(value: string): [number, number, number] | undefined {
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];

  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (!hex) return undefined;
  return [
    Number.parseInt(hex[1].slice(0, 2), 16),
    Number.parseInt(hex[1].slice(2, 4), 16),
    Number.parseInt(hex[1].slice(4, 6), 16),
  ];
}

export function isDarkColor(value: string): boolean {
  const color = parseColor(value);
  if (!color) return true;
  const [red, green, blue] = color.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue < 0.5;
}
