import { normalizeText, parseABV, parseNetContents } from '../lib/normalize';

describe('normalizeText', () => {
  it('lowercases input', () => {
    expect(normalizeText('OLD TOM DISTILLERY')).toBe('old tom distillery');
  });
  it('removes regular apostrophes', () => {
    expect(normalizeText("STONE'S THROW")).toBe('stones throw');
  });
  it('removes curly apostrophes', () => {
    expect(normalizeText('Stone‘s Throw')).toBe('stones throw');
  });
  it('removes periods and commas', () => {
    expect(normalizeText('Old Tom, Inc.')).toBe('old tom inc');
  });
  it('collapses multiple spaces', () => {
    expect(normalizeText('Old  Tom   Distillery')).toBe('old tom distillery');
  });
  it('trims leading and trailing whitespace', () => {
    expect(normalizeText('  Old Tom  ')).toBe('old tom');
  });
});

describe('parseABV', () => {
  it('parses percentage', () => {
    expect(parseABV('45% Alc./Vol.')).toBeCloseTo(45);
  });
  it('parses decimal percentage', () => {
    expect(parseABV('40.5% ABV')).toBeCloseTo(40.5);
  });
  it('converts Proof to ABV', () => {
    expect(parseABV('90 Proof')).toBeCloseTo(45);
  });
  it('converts Proof with dash separator', () => {
    expect(parseABV('90-Proof')).toBeCloseTo(45);
  });
  it('returns null for unparseable value', () => {
    expect(parseABV('forty-five percent')).toBeNull();
  });
});

describe('parseNetContents', () => {
  it('parses mL', () => {
    expect(parseNetContents('750 mL')?.valueMl).toBe(750);
    expect(parseNetContents('750 mL')?.originalUnit).toBe('ml');
  });
  it('parses mL case-insensitive', () => {
    expect(parseNetContents('750ml')?.valueMl).toBe(750);
  });
  it('parses L to mL', () => {
    expect(parseNetContents('0.75 L')?.valueMl).toBe(750);
    expect(parseNetContents('0.75 L')?.originalUnit).toBe('l');
  });
  it('parses fl oz to mL', () => {
    expect(parseNetContents('25.36 fl oz')?.valueMl).toBeCloseTo(25.36 * 29.5735296, 2);
    expect(parseNetContents('25.36 fl oz')?.originalUnit).toBe('fl_oz');
  });
  it('returns null for unparseable value', () => {
    expect(parseNetContents('a whole lot')).toBeNull();
  });
});
