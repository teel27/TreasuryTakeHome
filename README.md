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
   npm test        # unit tests (33 tests)
   npm run lint    # ESLint
   npm run build   # production build check
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
