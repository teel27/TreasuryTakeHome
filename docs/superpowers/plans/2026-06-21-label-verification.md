# TTB Label Verification App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stateless Next.js web app that verifies alcohol beverage label artwork against TTB application data using a two-stage AI extraction + deterministic matching pipeline, deployed to Vercel.

**Architecture:** A `multipart/form-data` POST to `/api/verify` sends the label image to Claude (`claude-sonnet-4-6`) for structured JSON extraction (Stage 1), then passes the extracted fields to pure TypeScript matching logic for field-by-field comparison (Stage 2). The two stages are strictly separated — Stage 2 never calls the API and is fully unit-testable with plain JS objects.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, `@anthropic-ai/sdk`, `fastest-levenshtein`, Jest

## Global Constraints

- Next.js App Router only — no Pages Router patterns
- Model must be `claude-sonnet-4-6` — do not change
- No database, no auth, no persistent storage — stateless per-request only
- `lib/matching.ts` must never import from `@anthropic-ai/sdk` or call any external API
- Government Warning canonical text is hard-coded in `lib/matching.ts` — never accept user input for it
- Government Warning PASS reason must read exactly: `"Warning text and capitalization verified exactly. Bold formatting cannot be assessed from image analysis — confirm visually."`
- 85% Levenshtein similarity threshold is a documented heuristic — note in README as tunable
- Net Contents: same-unit = zero tolerance; cross-unit conversion = ±0.05 mL only

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/types.ts` | Create | Shared types: `ExtractedLabel`, `ApplicationData`, `FieldResult` |
| `lib/normalize.ts` | Create | Pure helpers: text normalization, ABV parsing, volume parsing |
| `lib/matching.ts` | Create | Stage 2: field-by-field comparison — never calls API |
| `lib/claude.ts` | Create | Stage 1: image → `ExtractedLabel` via Claude API |
| `app/api/verify/route.ts` | Create | POST handler: orchestrates Stage 1 → Stage 2 |
| `app/components/ResultsCard.tsx` | Create | Renders PASS/REVIEW/FAIL results, reason always visible |
| `app/components/UploadForm.tsx` | Create | Image drop zone + 4 application fields + submit |
| `app/page.tsx` | Replace | Client component wiring form, results, loading, error state |
| `app/layout.tsx` | Replace | Minimal layout with metadata |
| `__tests__/normalize.test.ts` | Create | Unit tests for all normalize helpers |
| `__tests__/matching.test.ts` | Create | Unit tests for all matching rules |
| `README.md` | Replace | Setup instructions, approach, libraries, known limitations |
| `.env.local.example` | Create | Documents required env var |
| `jest.config.ts` | Create | Jest config using Next.js transformer |

---

### Task 1: Scaffold Next.js Project + Configure Testing

**Files:**
- Scaffold: all Next.js boilerplate files
- Create: `jest.config.ts`
- Modify: `package.json` (add test script)

**Interfaces:**
- Produces: working `npm run dev`, `npm run build`, `npm test` commands

- [ ] **Step 1: Initialize Next.js project**

Run (answer `y` if prompted about non-empty directory):
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
```

When prompted interactively, use these answers:
- Would you like to use Turbopack? → **No**

- [ ] **Step 2: Install additional dependencies**

```bash
npm install @anthropic-ai/sdk fastest-levenshtein
npm install --save-dev jest @types/jest
```

- [ ] **Step 3: Create `jest.config.ts`**

```typescript
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
}

export default createJestConfig(config)
```

- [ ] **Step 4: Add test script to `package.json`**

In the `"scripts"` section, add:
```json
"test": "jest"
```

- [ ] **Step 5: Verify the scaffold works**

```bash
npm run build
```
Expected: successful build with no errors.

```bash
npm test -- --passWithNoTests
```
Expected: `Test Suites: 0 skipped` or similar — no failures.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with Tailwind and Jest"
```

---

### Task 2: Define Shared Types

**Files:**
- Create: `lib/types.ts`

**Interfaces:**
- Produces: `ExtractedLabel`, `ApplicationData`, `FieldStatus`, `FieldResult` — imported by all other lib files and components

- [ ] **Step 1: Create `lib/types.ts`**

```typescript
export interface LabelField {
  value: string | null;
  legible: boolean;
}

export interface ExtractedLabel {
  brandName: LabelField;
  classType: LabelField;
  alcoholContent: LabelField;
  netContents: LabelField;
  governmentWarning: LabelField;
}

export interface ApplicationData {
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
}

export type FieldStatus = 'PASS' | 'REVIEW' | 'FAIL';

export interface FieldResult {
  field: string;
  status: FieldStatus;
  reason: string;
  labelValue: string | null;
  applicationValue: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add shared types for extraction and matching pipeline"
```

---

### Task 3: Normalization Utilities (TDD)

**Files:**
- Create: `lib/normalize.ts`
- Create: `__tests__/normalize.test.ts`

**Interfaces:**
- Produces:
  - `normalizeText(s: string): string`
  - `parseABV(value: string): number | null`
  - `ParsedVolume { valueMl: number; originalUnit: 'ml' | 'l' | 'fl_oz' }`
  - `parseNetContents(value: string): ParsedVolume | null`
- Consumed by: `lib/matching.ts`

- [ ] **Step 1: Write failing tests in `__tests__/normalize.test.ts`**

```typescript
import { normalizeText, parseABV, parseNetContents } from '../lib/normalize';

describe('normalizeText', () => {
  it('lowercases input', () => {
    expect(normalizeText('OLD TOM DISTILLERY')).toBe('old tom distillery');
  });
  it('removes regular apostrophes', () => {
    expect(normalizeText("STONE'S THROW")).toBe('stones throw');
  });
  it('removes curly apostrophes', () => {
    expect(normalizeText('Stone’s Throw')).toBe('stones throw');
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=normalize
```
Expected: FAIL — `Cannot find module '../lib/normalize'`

- [ ] **Step 3: Implement `lib/normalize.ts`**

```typescript
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`’]/g, '')
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern=normalize
```
Expected: all 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/normalize.ts __tests__/normalize.test.ts
git commit -m "feat: add normalization utilities with unit tests"
```

---

### Task 4: Matching Logic (TDD)

**Files:**
- Create: `lib/matching.ts`
- Create: `__tests__/matching.test.ts`

**Interfaces:**
- Consumes: `normalizeText`, `parseABV`, `parseNetContents` from `lib/normalize.ts`; types from `lib/types.ts`
- Produces: `verifyLabel(extracted: ExtractedLabel, application: ApplicationData): FieldResult[]`
- Consumed by: `app/api/verify/route.ts`

- [ ] **Step 1: Write failing tests in `__tests__/matching.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=matching
```
Expected: FAIL — `Cannot find module '../lib/matching'`

- [ ] **Step 3: Implement `lib/matching.ts`**

```typescript
import { distance } from 'fastest-levenshtein';
import { normalizeText, parseABV, parseNetContents } from './normalize';
import type { ExtractedLabel, ApplicationData, FieldResult } from './types';

const GOVERNMENT_WARNING =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.';

function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return (maxLen - distance(a, b)) / maxLen;
}

function matchTextWithSimilarity(
  labelValue: string | null,
  appValue: string,
  fieldName: string,
): FieldResult {
  if (!labelValue) {
    return {
      field: fieldName,
      status: 'REVIEW',
      reason: 'Could not verify — value not legible on label.',
      labelValue,
      applicationValue: appValue,
    };
  }

  const normLabel = normalizeText(labelValue);
  const normApp = normalizeText(appValue);

  if (normLabel === normApp) {
    return {
      field: fieldName,
      status: 'PASS',
      reason: 'Matches after normalizing case/punctuation.',
      labelValue,
      applicationValue: appValue,
    };
  }

  const ratio = similarityRatio(normLabel, normApp);

  if (ratio >= 0.85) {
    return {
      field: fieldName,
      status: 'REVIEW',
      reason: `Label reads "${labelValue}", application reads "${appValue}" — possible typo or distinct product, needs human review.`,
      labelValue,
      applicationValue: appValue,
    };
  }

  return {
    field: fieldName,
    status: 'FAIL',
    reason: `${fieldName} does not match application.`,
    labelValue,
    applicationValue: appValue,
  };
}

function matchAlcoholContent(labelValue: string | null, appValue: string): FieldResult {
  if (!labelValue) {
    return {
      field: 'Alcohol Content',
      status: 'REVIEW',
      reason: 'Could not verify — value not legible on label.',
      labelValue,
      applicationValue: appValue,
    };
  }

  const labelABV = parseABV(labelValue);
  const appABV = parseABV(appValue);

  if (labelABV === null || appABV === null) {
    return {
      field: 'Alcohol Content',
      status: 'REVIEW',
      reason: 'Could not parse alcohol content value for comparison.',
      labelValue,
      applicationValue: appValue,
    };
  }

  if (Math.abs(labelABV - appABV) <= 0.1) {
    return {
      field: 'Alcohol Content',
      status: 'PASS',
      reason: `Both values confirm ${labelABV.toFixed(1)}% ABV.`,
      labelValue,
      applicationValue: appValue,
    };
  }

  return {
    field: 'Alcohol Content',
    status: 'FAIL',
    reason: `Label shows ${labelABV.toFixed(1)}% ABV, application shows ${appABV.toFixed(1)}% ABV.`,
    labelValue,
    applicationValue: appValue,
  };
}

function matchNetContents(labelValue: string | null, appValue: string): FieldResult {
  if (!labelValue) {
    return {
      field: 'Net Contents',
      status: 'REVIEW',
      reason: 'Could not verify — value not legible on label.',
      labelValue,
      applicationValue: appValue,
    };
  }

  const labelParsed = parseNetContents(labelValue);
  const appParsed = parseNetContents(appValue);

  if (!labelParsed || !appParsed) {
    return {
      field: 'Net Contents',
      status: 'REVIEW',
      reason: 'Could not parse net contents value for comparison.',
      labelValue,
      applicationValue: appValue,
    };
  }

  const isSameUnit = labelParsed.originalUnit === appParsed.originalUnit;
  const tolerance = isSameUnit ? 0 : 0.05;

  if (Math.abs(labelParsed.valueMl - appParsed.valueMl) <= tolerance) {
    return {
      field: 'Net Contents',
      status: 'PASS',
      reason: `Both values confirm ${Math.round(labelParsed.valueMl)} mL.`,
      labelValue,
      applicationValue: appValue,
    };
  }

  return {
    field: 'Net Contents',
    status: 'FAIL',
    reason: `Label shows ${labelParsed.valueMl.toFixed(1)} mL, application shows ${appParsed.valueMl.toFixed(1)} mL.`,
    labelValue,
    applicationValue: appValue,
  };
}

function matchGovernmentWarning(labelValue: string | null): FieldResult {
  if (!labelValue) {
    return {
      field: 'Government Warning',
      status: 'FAIL',
      reason: 'Government Warning Statement not found on label.',
      labelValue,
      applicationValue: GOVERNMENT_WARNING,
    };
  }

  if (!labelValue.includes('GOVERNMENT WARNING:')) {
    const titleCaseFound = labelValue.match(/government warning/i);
    const reason = titleCaseFound
      ? `"${titleCaseFound[0]}" found — must appear as "GOVERNMENT WARNING:" in all caps.`
      : 'Government Warning Statement not found or incorrectly formatted on label.';
    return {
      field: 'Government Warning',
      status: 'FAIL',
      reason,
      labelValue,
      applicationValue: GOVERNMENT_WARNING,
    };
  }

  const normalizedLabel = labelValue.replace(/\s+/g, ' ').trim();
  const normalizedCanonical = GOVERNMENT_WARNING.replace(/\s+/g, ' ').trim();

  if (normalizedLabel !== normalizedCanonical) {
    return {
      field: 'Government Warning',
      status: 'FAIL',
      reason: 'Government Warning Statement text does not match the required wording exactly.',
      labelValue,
      applicationValue: GOVERNMENT_WARNING,
    };
  }

  return {
    field: 'Government Warning',
    status: 'PASS',
    reason:
      'Warning text and capitalization verified exactly. Bold formatting cannot be assessed from image analysis — confirm visually.',
    labelValue,
    applicationValue: GOVERNMENT_WARNING,
  };
}

export function verifyLabel(extracted: ExtractedLabel, application: ApplicationData): FieldResult[] {
  return [
    matchTextWithSimilarity(
      extracted.brandName.legible ? extracted.brandName.value : null,
      application.brandName,
      'Brand Name',
    ),
    matchTextWithSimilarity(
      extracted.classType.legible ? extracted.classType.value : null,
      application.classType,
      'Class/Type',
    ),
    matchAlcoholContent(
      extracted.alcoholContent.legible ? extracted.alcoholContent.value : null,
      application.alcoholContent,
    ),
    matchNetContents(
      extracted.netContents.legible ? extracted.netContents.value : null,
      application.netContents,
    ),
    matchGovernmentWarning(
      extracted.governmentWarning.legible ? extracted.governmentWarning.value : null,
    ),
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern=matching
```
Expected: all 16 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```
Expected: all tests PASS (normalize + matching).

- [ ] **Step 6: Commit**

```bash
git add lib/matching.ts __tests__/matching.test.ts
git commit -m "feat: add matching logic with unit tests (TDD)"
```

---

### Task 5: Claude Extraction Client

**Files:**
- Create: `lib/claude.ts`

**Interfaces:**
- Consumes: `ExtractedLabel` from `lib/types.ts`
- Produces: `extractLabel(imageBase64: string, mediaType: SupportedMediaType): Promise<ExtractedLabel>`
- Consumed by: `app/api/verify/route.ts`

- [ ] **Step 1: Create `lib/claude.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedLabel } from './types';

type SupportedMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const client = new Anthropic();

const EXTRACTION_PROMPT = `Extract the following fields from this alcohol beverage label image. Return ONLY a valid JSON object — no markdown, no explanation.

For each field, return the exact text as it appears on the label (preserving capitalization and punctuation). Set "legible" to false and "value" to null if the field is not visible or cannot be read clearly.

{
  "brandName": { "value": "<exact text or null>", "legible": <true|false> },
  "classType": { "value": "<exact text or null>", "legible": <true|false> },
  "alcoholContent": { "value": "<exact text or null>", "legible": <true|false> },
  "netContents": { "value": "<exact text or null>", "legible": <true|false> },
  "governmentWarning": { "value": "<exact text or null>", "legible": <true|false> }
}

Do not judge, compare, or assess correctness. Extract only what you observe.`;

export async function extractLabel(
  imageBase64: string,
  mediaType: SupportedMediaType,
): Promise<ExtractedLabel> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          { type: 'text', text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude did not return valid JSON');
  return JSON.parse(jsonMatch[0]) as ExtractedLabel;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/claude.ts
git commit -m "feat: add Claude extraction client (Stage 1)"
```

---

### Task 6: API Route

**Files:**
- Create: `app/api/verify/route.ts`

**Interfaces:**
- Consumes: `extractLabel` from `lib/claude.ts`; `verifyLabel` from `lib/matching.ts`; `ApplicationData` from `lib/types.ts`
- Produces: `POST /api/verify` → `{ results: FieldResult[] }` or `{ error: string }`

- [ ] **Step 1: Create `app/api/verify/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { extractLabel } from '@/lib/claude';
import { verifyLabel } from '@/lib/matching';
import type { ApplicationData } from '@/lib/types';

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type SupportedMediaType = (typeof SUPPORTED_TYPES)[number];

function isSupportedType(type: string): type is SupportedMediaType {
  return (SUPPORTED_TYPES as readonly string[]).includes(type);
}

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Could not read the uploaded form.' }, { status: 400 });
  }

  const image = formData.get('image');
  if (!image || !(image instanceof File)) {
    return NextResponse.json(
      { error: 'Please select a label image before verifying.' },
      { status: 400 },
    );
  }

  if (!isSupportedType(image.type)) {
    return NextResponse.json(
      { error: 'Unsupported image type. Please upload a JPEG, PNG, GIF, or WebP image.' },
      { status: 400 },
    );
  }

  const application: ApplicationData = {
    brandName: (formData.get('brandName') as string) ?? '',
    classType: (formData.get('classType') as string) ?? '',
    alcoholContent: (formData.get('alcoholContent') as string) ?? '',
    netContents: (formData.get('netContents') as string) ?? '',
  };

  const buffer = Buffer.from(await image.arrayBuffer());
  const imageBase64 = buffer.toString('base64');

  let extracted;
  try {
    extracted = await extractLabel(imageBase64, image.type as SupportedMediaType);
  } catch (err) {
    console.error('Claude extraction error:', err);
    return NextResponse.json(
      { error: 'Label analysis failed. Please try again.' },
      { status: 500 },
    );
  }

  const results = verifyLabel(extracted, application);
  return NextResponse.json({ results });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/verify/route.ts
git commit -m "feat: add POST /api/verify route orchestrating extraction and matching"
```

---

### Task 7: ResultsCard Component

**Files:**
- Create: `app/components/ResultsCard.tsx`

**Interfaces:**
- Consumes: `FieldResult[]` from `lib/types.ts`
- Produces: `<ResultsCard results={FieldResult[]} />` — renders color-coded per-field results

- [ ] **Step 1: Create `app/components/ResultsCard.tsx`**

```tsx
import type { FieldResult } from '@/lib/types';

const statusConfig = {
  PASS: {
    icon: '✓',
    label: 'PASS',
    wrapperClass: 'bg-green-50 border-green-200',
    iconClass: 'text-green-600',
    labelClass: 'text-green-700',
  },
  REVIEW: {
    icon: '!',
    label: 'REVIEW',
    wrapperClass: 'bg-yellow-50 border-yellow-200',
    iconClass: 'text-yellow-600',
    labelClass: 'text-yellow-700',
  },
  FAIL: {
    icon: '✗',
    label: 'FAIL',
    wrapperClass: 'bg-red-50 border-red-200',
    iconClass: 'text-red-600',
    labelClass: 'text-red-700',
  },
} as const;

export default function ResultsCard({ results }: { results: FieldResult[] }) {
  return (
    <div className="mt-6 space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">Verification Results</h2>
      {results.map((result) => {
        const cfg = statusConfig[result.status];
        return (
          <div key={result.field} className={`rounded-lg border p-4 ${cfg.wrapperClass}`}>
            <div className="flex items-center gap-3">
              <span className={`text-xl font-bold w-6 text-center ${cfg.iconClass}`}>
                {cfg.icon}
              </span>
              <span className="font-medium text-gray-900 flex-1">{result.field}</span>
              <span className={`text-sm font-semibold ${cfg.labelClass}`}>{cfg.label}</span>
            </div>
            <p className="mt-1 ml-9 text-sm text-gray-700">{result.reason}</p>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/ResultsCard.tsx
git commit -m "feat: add ResultsCard component with PASS/REVIEW/FAIL color coding"
```

---

### Task 8: UploadForm Component

**Files:**
- Create: `app/components/UploadForm.tsx`

**Interfaces:**
- Consumes: `FieldResult` from `lib/types.ts`
- Produces:
  ```typescript
  <UploadForm
    onResults={(results: FieldResult[]) => void}
    isLoading: boolean
    setIsLoading: (v: boolean) => void
    setError: (v: string | null) => void
  />
  ```
  Submits `multipart/form-data` to `POST /api/verify` with fields: `image`, `brandName`, `classType`, `alcoholContent`, `netContents`

- [ ] **Step 1: Create `app/components/UploadForm.tsx`**

```tsx
'use client';

import { useState, useRef, useCallback } from 'react';
import type { FieldResult } from '@/lib/types';

interface Props {
  onResults: (results: FieldResult[]) => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}

const APPLICATION_FIELDS = [
  { name: 'brandName', label: 'Brand Name' },
  { name: 'classType', label: 'Class / Type' },
  { name: 'alcoholContent', label: 'Alcohol Content' },
  { name: 'netContents', label: 'Net Contents' },
] as const;

export default function UploadForm({ onResults, isLoading, setIsLoading, setError }: Props) {
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        setError('Please upload an image file (JPEG, PNG, GIF, or WebP).');
        return;
      }
      setImage(file);
      setPreview(URL.createObjectURL(file));
      setError(null);
    },
    [setError],
  );

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!image) {
      setError('Please select a label image before verifying.');
      return;
    }

    const form = e.currentTarget;
    const formData = new FormData();
    formData.append('image', image);
    for (const { name } of APPLICATION_FIELDS) {
      formData.append(name, (form.elements.namedItem(name) as HTMLInputElement).value);
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/verify', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
      } else {
        onResults(data.results);
      }
    } catch {
      setError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Image upload drop zone */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Label Image</label>
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          {preview ? (
            <img src={preview} alt="Label preview" className="max-h-48 mx-auto rounded" />
          ) : (
            <p className="text-gray-500 text-sm">
              Drop your label image here, or click to choose a file
            </p>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>

      {/* Application data fields */}
      {APPLICATION_FIELDS.map(({ name, label }) => (
        <div key={name}>
          <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
          <input
            id={name}
            name={name}
            type="text"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={`Enter ${label.toLowerCase()} from application`}
          />
        </div>
      ))}

      {/* Government Warning — informational, always auto-verified */}
      <div className="rounded-md bg-gray-50 border border-gray-200 p-3">
        <p className="text-sm font-medium text-gray-700">Government Warning</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Auto-verified against the TTB-required standard text.
        </p>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-md bg-blue-600 px-4 py-3 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? 'Verifying label…' : 'Verify Label'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/UploadForm.tsx
git commit -m "feat: add UploadForm with drag-and-drop image upload and application fields"
```

---

### Task 9: Page Assembly

**Files:**
- Replace: `app/page.tsx`
- Replace: `app/layout.tsx`

**Interfaces:**
- Consumes: `UploadForm`, `ResultsCard`, `FieldResult` from `lib/types.ts`
- Produces: working single-page app at `/`

- [ ] **Step 1: Replace `app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TTB Label Verification',
  description: 'Verify alcohol beverage label artwork against TTB application data',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Replace `app/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import UploadForm from './components/UploadForm';
import ResultsCard from './components/ResultsCard';
import type { FieldResult } from '@/lib/types';

export default function Home() {
  const [results, setResults] = useState<FieldResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="min-h-screen py-10">
      <div className="mx-auto max-w-xl px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">TTB Label Verification</h1>
        <p className="text-sm text-gray-500 mb-8">
          Upload a label image and enter the application data to check that they match.
        </p>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <UploadForm
            onResults={(r) => {
              setResults(r);
              setError(null);
            }}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            setError={setError}
          />

          {error && (
            <div className="mt-4 rounded-md bg-red-50 border border-red-200 p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {results && <ResultsCard results={results} />}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create `.env.local` with your Anthropic API key**

```bash
echo "ANTHROPIC_API_KEY=your_key_here" > .env.local
```
Replace `your_key_here` with your actual key from console.anthropic.com.

- [ ] **Step 4: Run the dev server and verify the UI**

```bash
npm run dev
```
Open `http://localhost:3000`. Verify:
- Image drop zone renders and accepts files (thumbnail shows on select)
- 4 input fields render with correct labels
- Government Warning section renders as informational block
- "Verify Label" button is visible and large
- Submitting with an image and filled fields calls the API and shows results
- PASS = green card, REVIEW = yellow, FAIL = red, reason text visible on each

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/layout.tsx
git commit -m "feat: assemble single-page UI with form, results, and error states"
```

---

### Task 10: README and Environment Setup

**Files:**
- Replace: `README.md`
- Create: `.env.local.example`

- [ ] **Step 1: Create `.env.local.example`**

```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

- [ ] **Step 2: Replace `README.md`**

```markdown
# TTB Label Verification

AI-powered prototype that verifies alcohol beverage label artwork against TTB application data. Upload a label image and enter the application fields — the app checks whether they match.

## Setup

1. **Clone and install**
   ```bash
   git clone <repo-url>
   cd TreasuryTakeHome
   npm install
   ```

2. **Set your Anthropic API key**
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local and add your key from console.anthropic.com
   ```

3. **Run locally**
   ```bash
   npm run dev
   # Open http://localhost:3000
   ```

4. **Run tests**
   ```bash
   npm test
   ```

## Approach

The app uses a two-stage pipeline per verification request:

**Stage 1 — Extraction (AI):** The label image is sent to Claude (`claude-sonnet-4-6`) with a structured extraction prompt. Claude returns a JSON object with the raw text observed on the label for each field — no comparison, no judgment, extraction only.

**Stage 2 — Matching (deterministic code):** Plain TypeScript compares the extracted label data against the user-submitted application data, field by field. This stage never calls the AI API. It is auditable, testable, and fast.

Separating the stages keeps the AI call simple (faster, more reliable under the 5-second latency target) and keeps all matching decisions deterministic and explainable, since this tool's output may inform compliance decisions.

## Libraries

| Library | Purpose |
|---|---|
| `@anthropic-ai/sdk` | Claude API client for Stage 1 image extraction |
| `fastest-levenshtein` | Levenshtein edit distance for brand name / class-type similarity scoring |
| `next` | App Router framework, API routes, TypeScript, Tailwind |

## Matching Rules

- **Brand Name / Class Type:** Normalize (lowercase, strip punctuation, collapse whitespace), then compare. If identical after normalization → PASS. Otherwise, compute Levenshtein similarity ratio: 85–99% → REVIEW, below 85% → FAIL. The 85% threshold is a starting heuristic for this prototype — it should be calibrated against a real label corpus before production use.
- **Alcohol Content:** Parse both values to ABV% (converting Proof via `ABV = Proof / 2`), compare numerically within ±0.1% tolerance.
- **Net Contents:** Normalize to mL, compare numerically. Same-unit comparisons require exact match (zero tolerance — two printed values in the same unit have no legitimate reason to differ). Cross-unit conversions (e.g. fl oz → mL) allow ±0.05 mL to absorb floating-point rounding only.
- **Government Warning:** Exact text match against the TTB-mandated canonical wording. "GOVERNMENT WARNING:" must appear in all caps. Any deviation → FAIL.

## Known Limitations

- **Bold-type detection:** TTB requires "GOVERNMENT WARNING:" in bold type. Bold formatting cannot be detected from image text extraction. Agents must confirm bold visually.
- **"Separate and apart" layout:** TTB requires the warning to appear separate from other information. Layout cannot be assessed from extracted text.
- **Batch upload:** Not supported in v1 — one label per request. Noted as a priority for v2 (large importers submit 200–300 applications at once during peak season).
- **Poor-quality images:** Angled photos, glare, bad lighting. If Claude cannot read a field, it returns `legible: false` and the field result is REVIEW. The app surfaces this to the user rather than attempting correction.
- **Structured data input (CSV/JSON):** Not in scope for v1 — manual form entry only.
- **COLA system integration:** Explicitly out of scope — standalone prototype only.
- **PII / federal compliance hardening:** Not required for this prototype; would be required before any production deployment.

## Deployment

Deployed to Vercel. Add `ANTHROPIC_API_KEY` as an environment variable in your Vercel project settings.

Live URL: _[add after deployment]_
```

- [ ] **Step 3: Run full test suite one more time**

```bash
npm test
```
Expected: all tests PASS.

- [ ] **Step 4: Run a production build**

```bash
npm run build
```
Expected: successful build with no errors or type errors.

- [ ] **Step 5: Commit**

```bash
git add README.md .env.local.example
git commit -m "docs: add README with setup, approach, libraries, and known limitations"
```

- [ ] **Step 6: Deploy to Vercel**

```bash
npx vercel --prod
```
Or push to GitHub and connect the repo in the Vercel dashboard. Add `ANTHROPIC_API_KEY` under Project Settings → Environment Variables.

Update the "Live URL" placeholder in `README.md` with the deployed URL, then commit:
```bash
git add README.md
git commit -m "docs: add deployed Vercel URL to README"
git push
```
