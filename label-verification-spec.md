# AI-Powered Alcohol Label Verification App — Build Spec (v1)

## Purpose

Prototype web app that verifies alcohol beverage label artwork against TTB application
data, automating the manual "does the label match the form" check currently done by
compliance agents. This is a standalone proof-of-concept — no integration with the real
COLA system, no persistent storage, no auth.

Full background: see `README.md` (stakeholder interview notes) in this repo. This spec
translates those interviews into concrete build requirements. Where this spec gives a
specific rule, follow it exactly — these were deliberately decided, not arbitrary defaults.

---

## Tech Stack (fixed — do not substitute)

- **Framework**: Next.js, App Router, TypeScript
- **Styling**: Tailwind CSS
- **AI**: Anthropic Claude API (multimodal — image input)
- **Deployment target**: Vercel
- **No database.** Stateless, per-request processing only.

---

## Architecture

Two-stage pipeline per verification request — do not combine into a single AI call:

**Stage 1 — Extraction (AI).** Claude receives the label image and returns ONLY what it
observes on the label, as structured JSON. No comparison, no judgment, no matching logic
in this step.

**Stage 2 — Matching (deterministic code, not AI).** Plain TypeScript compares the
extracted label data against the user-submitted application data, field by field, per the
rules below. This is auditable, fast, and testable — it must not call the LLM.

Rationale: keeps the AI call simple (faster, more reliable under the latency budget) and
keeps all matching decisions deterministic and explainable, since this tool's output may
inform compliance decisions.

### Suggested file structure

```
/app
  page.tsx                  - upload form (label image + application fields)
  /api/verify/route.ts      - POST endpoint: orchestrates extraction + matching
  /components
    UploadForm.tsx
    ResultsCard.tsx
/lib
  claude.ts                 - Stage 1: extraction call + prompt
  matching.ts                - Stage 2: all field comparison logic
  normalize.ts               - shared normalization helpers (case/whitespace/punctuation/units)
  types.ts                   - shared types (ExtractedLabel, ApplicationData, FieldResult)
```

---

## Fields in Scope

1. Brand Name
2. Class/Type Designation
3. Alcohol Content (ABV / Proof)
4. Net Contents
5. Government Warning Statement

---

## Stage 1: Extraction — Output Contract

Claude's extraction call must return strictly structured JSON, one entry per field above,
with the raw text/value as observed on the label image. Do not ask Claude to judge
correctness, match, or compare anything at this stage — extraction only. If a field is not
visible or not legible on the label, return it as null/empty with a `legible: false` flag
rather than guessing.

---

## Stage 2: Matching Logic — Per Field Rules

### Result states (apply to every field)
Each field resolves to exactly one of: **PASS / REVIEW / FAIL**, each with a short
human-readable reason string (this is required — no bare boolean/status-only results).
The reason string is what a compliance agent will read to understand the verdict, so it
must explain *why*, not just restate the field name.

### Brand Name — two-step process, in order

**Step 1: Normalization (deterministic, not fuzzy).** Before any comparison, normalize
both the label value and application value: lowercase, strip/standardize punctuation
(apostrophes, periods, commas), collapse whitespace. If normalized strings are identical →
**PASS**, reason: "Matches after normalizing case/punctuation." Stop here — do not run
similarity scoring on values that already matched after normalization.

**Step 2: Similarity scoring (only if Step 1 did not produce a match).** Run a string
similarity comparison (e.g. Levenshtein-based ratio) on the normalized strings:
- **100% after normalization** → already handled in Step 1, PASS
- **85%–99% similarity** → **REVIEW**, reason should state the specific character-level
  difference (e.g. "Label reads 'Old Tim Distillery', application reads 'Old Tom
  Distillery' — possible typo or distinct product, needs human review.")
- **Below 85% similarity** → **FAIL**, reason: "Brand name does not match application."

Document the 85% threshold in the README as a starting heuristic to be tuned against a
real label corpus, not a precisely calibrated figure.

### Class/Type Designation
Same two-step process as Brand Name (normalization first, then similarity banding).

### Alcohol Content (ABV / Proof)
**Deterministic, not fuzzy** — this is a fixed mathematical relationship, not a judgment
call. Normalize both values to a common unit (ABV %) before comparing:
- If one value is expressed in Proof, convert: `ABV% = Proof / 2`
- After unit conversion, compare numerically (allow a small tolerance, e.g. ±0.1%, for
  rounding) → **PASS** or **FAIL** only. No REVIEW state for this field — a unit
  conversion is either correct or it isn't.
- If either value is missing/illegible → **REVIEW**, reason: "Could not verify — value not
  legible on label."

### Net Contents
Same approach as ABV: normalize units (e.g. mL vs L: `750 mL` = `0.75 L`), compare
numerically with small rounding tolerance, PASS/FAIL only (REVIEW only if illegible).

### Government Warning Statement — exact match required
This field has the strictest rule of all, per stakeholder requirement (Jenny's interview):
- The phrase "GOVERNMENT WARNING:" must appear in **all caps**.
- The full statement text must match the standard required wording **exactly**
  (word-for-word) — no paraphrasing, no partial credit.
- Any deviation (wrong case, reworded text, missing portions) → **FAIL**, with the reason
  string stating specifically what's wrong (e.g. "'Government Warning' found in title case,
  must be all caps.")
- Do NOT attempt visual bold-detection from the image — this is a known limitation, not a
  bug. Document it explicitly as out of scope in the README (see Known Limitations below).
- No REVIEW state for this field by design — TTB has zero tolerance for warning statement
  deviations, so ambiguity should resolve to FAIL, not a soft pass-pending-review.

---

## UI Requirements

Target user: **extremely low technical comfort, on the low end.** Stakeholder benchmark
given was a 73-year-old user who only recently learned video calling. Design accordingly:

- Single-page flow: upload image → fill in 5 application fields → one obvious submit
  button → results.
- Results displayed clearly per field: PASS (green) / REVIEW (yellow) / FAIL (red), with
  the reason text visible, not hidden behind a click/hover.
- No multi-step wizards, no nested menus, no settings to configure.
- Clear error states for bad uploads (wrong file type, no image selected, etc.) — plain
  language, not technical error messages.

---

## Performance Requirement

End-to-end response time (image upload → results displayed) should target **under 5
seconds**. This is a hard stakeholder requirement based on a prior failed pilot where 30–40
second processing times caused total user abandonment. If the Claude API call risks
exceeding this under realistic conditions, document the measured latency in the README
rather than silently missing the target.

---

## Explicitly Out of Scope for v1 (document in README as future work)

- **Batch upload** (multiple label applications at once) — requested by stakeholders for
  peak-season volume, deferred to a future version. Note this explicitly so it isn't read
  as an oversight.
- **Structured data input (CSV/JSON)** for application fields — not specified by
  stakeholders; only manual form entry is in scope for v1.
- **Poor-quality image handling** (angled photos, glare, bad lighting) — flagged by a
  stakeholder as a stretch goal, not a core requirement. If the extraction step returns low
  legibility, surface that to the user rather than attempting correction.
- **COLA system integration** — explicitly out of scope per IT stakeholder; this is a
  standalone prototype only.
- **PII / document retention / federal compliance hardening** — not required for this
  prototype per IT stakeholder; note as a production consideration in the README, not a
  build requirement.

---

## Deliverables

1. Full source in this repo, deployed to Vercel with a working public URL.
2. README.md (project's own, not this spec) covering: setup/run instructions, summary of
   approach, libraries used, the 85% similarity threshold as a documented assumption, and
   the "Out of Scope" list above stated explicitly as known limitations rather than left
   implicit.

---

## Notes for implementer

- Keep `matching.ts` fully unit-testable independent of the Claude API — it should accept
  two plain JS objects (extracted vs application data) and return field-level results.
  Write a handful of unit tests covering the brand-name REVIEW band and the proof/ABV
  conversion, since those are the two rules with the most room for off-by-one logic errors.
- Favor a small, well-documented set of dependencies over a heavy framework footprint —
  this is a scoped prototype, not a production system.
