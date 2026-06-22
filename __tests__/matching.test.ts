import { verifyLabel } from '../lib/matching';
import type { ExtractedLabel, ApplicationData } from '../lib/types';

const CANONICAL_WARNING =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.';

const baseExtracted: ExtractedLabel = {
  brandName: { value: null, legible: false },
  classType: { value: null, legible: false },
  alcoholContent: { value: null, legible: false },
  netContents: { value: null, legible: false },
  governmentWarning: { value: null, legible: false },
};

const baseApp: ApplicationData = {
  brandName: '',
  classType: '',
  alcoholContent: '',
  netContents: '',
};

describe('Brand Name matching', () => {
  it('PASS: case-insensitive match after normalization', () => {
    const result = verifyLabel(
      { ...baseExtracted, brandName: { value: "STONE'S THROW", legible: true } },
      { ...baseApp, brandName: "Stone's Throw" },
    );
    expect(result.find((r) => r.field === 'Brand Name')!.status).toBe('PASS');
  });

  it('REVIEW: single-character typo (~94% Levenshtein similarity)', () => {
    // "old tim distillery" vs "old tom distillery": distance=1, maxLen=18, ratio=0.944
    const result = verifyLabel(
      { ...baseExtracted, brandName: { value: 'Old Tim Distillery', legible: true } },
      { ...baseApp, brandName: 'Old Tom Distillery' },
    );
    expect(result.find((r) => r.field === 'Brand Name')!.status).toBe('REVIEW');
  });

  it('REVIEW: reason string names both values', () => {
    const result = verifyLabel(
      { ...baseExtracted, brandName: { value: 'Old Tim Distillery', legible: true } },
      { ...baseApp, brandName: 'Old Tom Distillery' },
    );
    const field = result.find((r) => r.field === 'Brand Name')!;
    expect(field.reason).toContain('Old Tim Distillery');
    expect(field.reason).toContain('Old Tom Distillery');
  });

  it('FAIL: completely different names (< 85% similarity)', () => {
    const result = verifyLabel(
      { ...baseExtracted, brandName: { value: 'ABC Spirits', legible: true } },
      { ...baseApp, brandName: 'Blue Mountain Brewing Company International' },
    );
    expect(result.find((r) => r.field === 'Brand Name')!.status).toBe('FAIL');
  });

  it('REVIEW: illegible label value', () => {
    const result = verifyLabel(
      { ...baseExtracted, brandName: { value: null, legible: false } },
      { ...baseApp, brandName: 'Old Tom Distillery' },
    );
    expect(result.find((r) => r.field === 'Brand Name')!.status).toBe('REVIEW');
  });
});

describe('Alcohol Content matching', () => {
  it('PASS: 90 Proof label matches 45% ABV application', () => {
    const result = verifyLabel(
      { ...baseExtracted, alcoholContent: { value: '90 Proof', legible: true } },
      { ...baseApp, alcoholContent: '45% Alc./Vol.' },
    );
    expect(result.find((r) => r.field === 'Alcohol Content')!.status).toBe('PASS');
  });

  it('PASS: same ABV percentage', () => {
    const result = verifyLabel(
      { ...baseExtracted, alcoholContent: { value: '45% ABV', legible: true } },
      { ...baseApp, alcoholContent: '45%' },
    );
    expect(result.find((r) => r.field === 'Alcohol Content')!.status).toBe('PASS');
  });

  it('FAIL: mismatched ABV (40% vs 45%)', () => {
    const result = verifyLabel(
      { ...baseExtracted, alcoholContent: { value: '40% ABV', legible: true } },
      { ...baseApp, alcoholContent: '45% ABV' },
    );
    expect(result.find((r) => r.field === 'Alcohol Content')!.status).toBe('FAIL');
  });

  it('REVIEW: illegible label value', () => {
    const result = verifyLabel(
      { ...baseExtracted, alcoholContent: { value: null, legible: false } },
      { ...baseApp, alcoholContent: '45% ABV' },
    );
    expect(result.find((r) => r.field === 'Alcohol Content')!.status).toBe('REVIEW');
  });
});

describe('Net Contents matching', () => {
  it('PASS: same unit exact match (750 mL)', () => {
    const result = verifyLabel(
      { ...baseExtracted, netContents: { value: '750 mL', legible: true } },
      { ...baseApp, netContents: '750 mL' },
    );
    expect(result.find((r) => r.field === 'Net Contents')!.status).toBe('PASS');
  });

  it('FAIL: same unit 1 mL difference — zero tolerance', () => {
    const result = verifyLabel(
      { ...baseExtracted, netContents: { value: '751 mL', legible: true } },
      { ...baseApp, netContents: '750 mL' },
    );
    expect(result.find((r) => r.field === 'Net Contents')!.status).toBe('FAIL');
  });

  it('PASS: cross-unit conversion within 0.05 mL (0.75 L vs 750 mL)', () => {
    const result = verifyLabel(
      { ...baseExtracted, netContents: { value: '0.75 L', legible: true } },
      { ...baseApp, netContents: '750 mL' },
    );
    expect(result.find((r) => r.field === 'Net Contents')!.status).toBe('PASS');
  });

  it('FAIL: cross-unit real mismatch (0.76 L vs 750 mL = 10 mL difference)', () => {
    const result = verifyLabel(
      { ...baseExtracted, netContents: { value: '0.76 L', legible: true } },
      { ...baseApp, netContents: '750 mL' },
    );
    expect(result.find((r) => r.field === 'Net Contents')!.status).toBe('FAIL');
  });
});

describe('Government Warning matching', () => {
  it('PASS with bold note for exact canonical text', () => {
    const result = verifyLabel(
      { ...baseExtracted, governmentWarning: { value: CANONICAL_WARNING, legible: true } },
      baseApp,
    );
    const field = result.find((r) => r.field === 'Government Warning')!;
    expect(field.status).toBe('PASS');
    expect(field.reason).toContain('Bold formatting cannot be assessed from image analysis');
  });

  it('FAIL: title case "Government Warning:"', () => {
    const titleCase = CANONICAL_WARNING.replace('GOVERNMENT WARNING:', 'Government Warning:');
    const result = verifyLabel(
      { ...baseExtracted, governmentWarning: { value: titleCase, legible: true } },
      baseApp,
    );
    const field = result.find((r) => r.field === 'Government Warning')!;
    expect(field.status).toBe('FAIL');
    expect(field.reason).toContain('all caps');
  });

  it('FAIL: rewording of warning text', () => {
    const result = verifyLabel(
      {
        ...baseExtracted,
        governmentWarning: {
          value: 'GOVERNMENT WARNING: Drink responsibly. Do not drink and drive.',
          legible: true,
        },
      },
      baseApp,
    );
    expect(result.find((r) => r.field === 'Government Warning')!.status).toBe('FAIL');
  });

  it('FAIL: missing government warning', () => {
    const result = verifyLabel(
      { ...baseExtracted, governmentWarning: { value: null, legible: false } },
      baseApp,
    );
    expect(result.find((r) => r.field === 'Government Warning')!.status).toBe('FAIL');
  });
});
