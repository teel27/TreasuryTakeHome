# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TTB alcohol label verification prototype. Agents upload a label image + application data; the app verifies whether they match. Standalone proof-of-concept — no COLA integration, no auth, no persistent storage.

Full stakeholder context: `README.md`. Build spec: `label-verification-spec.md`. Approved design: `docs/superpowers/specs/2026-06-21-label-verification-design.md`.

## Tech Stack (fixed — do not substitute)

- **Next.js** App Router, TypeScript
- **Tailwind CSS**
- **Anthropic Claude API** — model `claude-sonnet-4-6`, multimodal image input
- **Vercel** deployment target
- No database

## Commands

```bash
npm run dev       # local dev server
npm run build     # production build
npm run lint      # ESLint
npm test          # Jest/Vitest unit tests
```

## Architecture

**Two-stage pipeline per request — do not collapse into one AI call:**

1. **Stage 1 — Extraction (`lib/claude.ts`):** Sends label image to Claude and returns `ExtractedLabel` JSON (raw observed values only — no comparison, no judgment).
2. **Stage 2 — Matching (`lib/matching.ts`):** Pure TypeScript comparison of `ExtractedLabel` vs `ApplicationData`. Never calls the API. Returns `FieldResult[]`.

Image upload: `multipart/form-data` POST to `/api/verify/route.ts`, which base64-encodes the image and orchestrates stages 1 → 2.

```
/app
  page.tsx                    — single-page form (image upload + 5 application fields)
  /api/verify/route.ts        — POST handler: extraction → matching
  /components
    UploadForm.tsx
    ResultsCard.tsx
/lib
  claude.ts                   — Stage 1 only
  matching.ts                 — Stage 2 only; unit-testable with plain JS objects
  normalize.ts                — shared helpers: case, punctuation, whitespace, unit conversion
  types.ts                    — ExtractedLabel, ApplicationData, FieldResult
```

## Matching Rules (non-obvious details)

**Brand Name & Class/Type:** Two-step — normalize first (lowercase, strip punctuation, collapse whitespace); if still no match, run Levenshtein similarity. 85–99% → REVIEW, <85% → FAIL. The 85% threshold is a documented heuristic, not a calibrated figure.

**Alcohol Content:** Convert Proof to ABV% (`ABV = Proof / 2`) before comparing. Numeric compare with ±0.1% tolerance. PASS/FAIL only (REVIEW only if illegible).

**Net Contents:** Normalize to common unit. Same-unit comparison requires **exact match** (zero tolerance — two printed values in the same unit should never differ). Cross-unit conversion (e.g. fl oz → mL) allows ±0.05 mL only to absorb floating-point rounding. PASS/FAIL only (REVIEW only if illegible).

**Government Warning:** Hard-coded canonical text:
```
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.
```
Exact match required. "GOVERNMENT WARNING:" must be all-caps. Any deviation → FAIL. On match → PASS with note that bold formatting cannot be assessed from image analysis (known limitation, not a bug — do not attempt bold detection).

## Unit Tests

`matching.ts` must be testable independent of the Claude API. Priority test cases:
- Brand name REVIEW band (85–99% similarity)
- Proof → ABV% conversion
- Government warning: exact match, title-case failure, rewording failure
- Net Contents same-unit exact match, cross-unit rounding within ±0.05 mL, cross-unit real mismatch

## Environment Variables

```
ANTHROPIC_API_KEY=
```

## Known Limitations (do not attempt to fix in v1)

- Bold-type detection on Government Warning — not possible from text extraction
- "Separate and apart" layout check for warning statement — not possible from text extraction
- Batch upload — deferred to v2
- Poor-quality image correction (glare, angle) — surface `legible: false` to user, do not attempt correction
