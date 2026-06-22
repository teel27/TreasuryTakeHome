# AI-Powered Alcohol Label Verification App — Design Spec

**Date:** 2026-06-21  
**Status:** Approved  

---

## Purpose

Prototype web app that verifies alcohol beverage label artwork against TTB application data, automating the manual "does the label match the form" check currently done by compliance agents. Standalone proof-of-concept — no COLA integration, no persistent storage, no auth.

---

## Tech Stack (fixed)

- **Framework:** Next.js, App Router, TypeScript
- **Styling:** Tailwind CSS
- **AI:** Anthropic Claude API (`claude-sonnet-4-6`, multimodal image input)
- **Deployment:** Vercel
- **No database** — stateless, per-request processing only

---

## Architecture

Two-stage pipeline per verification request. Do not combine into a single AI call.

### Data Flow

```
Browser
  │
  │  POST multipart/form-data
  │  (image file + 5 application fields)
  ▼
/api/verify/route.ts
  │
  ├─► lib/claude.ts          Stage 1: send image to Claude API
  │     └─ returns ExtractedLabel (structured JSON, one field per label element)
  │
  └─► lib/matching.ts        Stage 2: deterministic field-by-field comparison
        └─ returns FieldResult[] (PASS/REVIEW/FAIL + reason per field)
  │
  ▼
Browser renders ResultsCard
  (color-coded per field, reason text always visible)
```

### Image Upload

**Option A — Direct multipart/form-data to Next.js API route.**  
Image posted as `multipart/form-data` directly to `/api/verify`. Route reads the binary via `request.formData()`, base64-encodes it, and passes it to Claude. No external storage, no third-party services. Fits the stateless prototype requirement.

### Module Boundaries

| Module | Responsibility | Dependencies |
|---|---|---|
| `lib/claude.ts` | Stage 1 extraction — image → structured JSON. No comparison logic. | Anthropic SDK |
| `lib/matching.ts` | Stage 2 matching — two plain JS objects in, `FieldResult[]` out. Never calls API. | `lib/normalize.ts`, `lib/types.ts` |
| `lib/normalize.ts` | Shared helpers: lowercase, strip punctuation, collapse whitespace, unit conversion | None |
| `lib/types.ts` | Shared types: `ExtractedLabel`, `ApplicationData`, `FieldResult` | None |

### File Structure

```
/app
  page.tsx                      — upload form (label image + application fields)
  /api/verify/route.ts          — POST endpoint: orchestrates extraction + matching
  /components
    UploadForm.tsx
    ResultsCard.tsx
/lib
  claude.ts
  matching.ts
  normalize.ts
  types.ts
```

---

## Fields in Scope

1. Brand Name
2. Class/Type Designation
3. Alcohol Content (ABV / Proof)
4. Net Contents
5. Government Warning Statement

---

## Stage 1: Extraction

Claude receives the label image and returns structured JSON with exactly what is observed on the label — no comparison, no judgment. If a field is not visible or legible, return it as `null` with `legible: false`.

```typescript
interface ExtractedLabel {
  brandName:          { value: string | null; legible: boolean };
  classType:          { value: string | null; legible: boolean };
  alcoholContent:     { value: string | null; legible: boolean };
  netContents:        { value: string | null; legible: boolean };
  governmentWarning:  { value: string | null; legible: boolean };
}
```

---

## Stage 2: Matching Logic

Every field resolves to exactly one of **PASS / REVIEW / FAIL**, plus a required human-readable `reason` string explaining *why*.

### Brand Name & Class/Type Designation — two-step

1. **Normalize:** lowercase, strip/standardize punctuation (apostrophes, periods, commas), collapse whitespace. If normalized strings are identical → **PASS**, reason: `"Matches after normalizing case/punctuation."`
2. **Similarity (only if Step 1 fails):** Levenshtein-based ratio on normalized strings:
   - 85–99% → **REVIEW**, reason states the specific character-level difference (e.g. `"Label reads 'Old Tim Distillery', application reads 'Old Tom Distillery' — possible typo or distinct product, needs human review."`)
   - Below 85% → **FAIL**, reason: `"Brand name does not match application."`

> The 85% threshold is a starting heuristic to be tuned against a real label corpus — document this in the README.

### Alcohol Content (ABV / Proof) — deterministic

- Normalize to ABV%: if value is in Proof, convert `ABV% = Proof / 2`
- Compare numerically with ±0.1% tolerance
- **PASS** or **FAIL** only — no REVIEW state (a unit conversion is correct or it isn't)
- If either value is missing/illegible → **REVIEW**, reason: `"Could not verify — value not legible on label."`

### Net Contents — deterministic

- Normalize units to a common base (e.g. mL): `750 mL = 750 mL`, `0.75 L = 750 mL`, `25.4 fl oz ≈ 751.3 mL`
- Tolerance rules:
  - **Same unit on both sides:** exact match required, zero tolerance — there is no legitimate reason for two printed values in the same unit to differ
  - **Cross-unit conversion involved (e.g. fl oz ↔ mL):** apply ±0.05 mL tolerance only to absorb floating-point conversion rounding, not as a general "acceptable variance" buffer
- **PASS** or **FAIL** only
- If either value is missing/illegible → **REVIEW**, reason: `"Could not verify — value not legible on label."`

### Government Warning Statement — exact match

Hard-coded canonical text:

```
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.
```

Rules:
- `"GOVERNMENT WARNING:"` must appear in all-caps — checked against extracted text
- Full statement must match the canonical text **exactly** (word-for-word, no paraphrasing)
- Any deviation → **FAIL** with specific reason (e.g. `"'Government Warning' found in title case — must be all caps."`)
- No REVIEW state — TTB has zero tolerance for warning statement deviations; ambiguity resolves to FAIL
- On exact match → **PASS** with note: `"Warning text and capitalization verified exactly. Bold formatting cannot be assessed from image analysis — confirm visually."`

**Known limitation:** Bold-type detection is not possible from image text extraction. This is a documented limitation, not a bug.

---

## UI Design

Single-page flow. Target user: extremely low technical comfort.

```
┌─────────────────────────────────────────────┐
│  TTB Label Verification                      │
│  ─────────────────────────────────────────  │
│  [  Drop label image here / click to upload ]│
│     (preview thumbnail shown after select)   │
│                                              │
│  Brand Name          [___________________]  │
│  Class / Type        [___________________]  │
│  Alcohol Content     [___________________]  │
│  Net Contents        [___________________]  │
│  Government Warning  [___________________]  │
│                                              │
│         [ Verify Label ]                    │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ ✓ Brand Name       PASS             │   │
│  │   Matches after normalizing case...  │   │
│  │                                      │   │
│  │ ! Class/Type       REVIEW           │   │
│  │   Label reads "Bourbon Whisky"...    │   │
│  │                                      │   │
│  │ ✗ Gov. Warning     FAIL             │   │
│  │   "Government Warning" in title case │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

- Image drop zone with click-to-upload fallback; thumbnail shown on select
- 5 plain-language text inputs (no jargon)
- Single large "Verify Label" button, disabled while processing
- Results displayed in place — no page reload
- **PASS** = green, **REVIEW** = yellow, **FAIL** = red
- Reason text always visible — never hidden behind hover/click
- Error states (no image, wrong file type, API failure, illegible label) shown as plain-language inline messages

---

## Performance

End-to-end target: **under 5 seconds** (hard stakeholder requirement). If Claude API latency risks exceeding this under realistic conditions, document measured latency in the README rather than silently missing the target.

---

## Testing

Unit tests for `matching.ts` (independent of Claude API):
- Brand name REVIEW band: 85–99% similarity cases
- Brand name FAIL band: below 85% similarity
- Proof → ABV% conversion (e.g. 90 Proof → 45%)
- Government warning: exact match PASS, title-case FAIL, rewording FAIL
- Net Contents same-unit: `750 mL` vs `750 mL` → PASS; `750 mL` vs `751 mL` → FAIL (zero tolerance)
- Net Contents cross-unit: `25.36 fl oz` → `750.0 mL` vs `750 mL` → PASS (within ±0.05 mL rounding); `25.36 fl oz` vs `760 mL` → FAIL

---

## Known Limitations (document in README)

- **Bold-type detection:** TTB requires `"GOVERNMENT WARNING:"` in bold. This cannot be verified from image text extraction. Agents must confirm bold formatting visually.
- **Separate and apart:** TTB requires the warning to appear separate from other information. Layout/spacing cannot be assessed from extracted text.
- **Poor-quality images:** Angled photos, glare, bad lighting. If extraction returns `legible: false`, the tool surfaces this to the user rather than attempting correction.
- **Batch upload:** Deferred to v2. Single label per request only.
- **Structured data input (CSV/JSON):** Not in scope for v1 — manual form entry only.
- **COLA integration:** Explicitly out of scope — standalone prototype only.
- **PII / federal compliance hardening:** Not required for prototype; noted as a production consideration.

---

## Out of Scope for v1

See Known Limitations above. All items are documented explicitly so they are not read as oversights.
