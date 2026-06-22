export function normalizeText(s: string): string {
  // Remove straight apostrophes ('), grave/backtick (`), and curly apostrophes (U+2018, U+2019)
  return s
    .toLowerCase()
    .replace(/['‘’`]/g, '')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseABV(value: string): number | null {
  const proofMatch = value.match(/(\d+(?:\.\d+)?)\s*-?\s*proof/i);
  if (proofMatch) return parseFloat(proofMatch[1]) / 2;
  const abvMatch = value.match(/(\d+(?:\.\d+)?)\s*%/);
  if (abvMatch) return parseFloat(abvMatch[1]);
  return null;
}

export interface ParsedVolume {
  valueMl: number;
  originalUnit: 'ml' | 'l' | 'fl_oz';
}

export function parseNetContents(value: string): ParsedVolume | null {
  const mlMatch = value.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  if (mlMatch) return { valueMl: parseFloat(mlMatch[1]), originalUnit: 'ml' };
  const lMatch = value.match(/(\d+(?:\.\d+)?)\s*l(?:iter)?s?\b/i);
  if (lMatch) return { valueMl: parseFloat(lMatch[1]) * 1000, originalUnit: 'l' };
  const flOzMatch = value.match(/(\d+(?:\.\d+)?)\s*fl\.?\s*oz/i);
  if (flOzMatch) return { valueMl: parseFloat(flOzMatch[1]) * 29.5735296, originalUnit: 'fl_oz' };
  return null;
}
