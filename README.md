# TTB Label Verification — AI-Powered Prototype

A web prototype that automates the manual "does the label match the application" check
performed by TTB compliance agents. Upload a label image, enter the five application data
fields, and the tool returns a per-field PASS / REVIEW / FAIL verdict with a plain-language
reason for each.

**Live app:** https://treasury-take-home-virid.vercel.app

---

## Setup & Run (Local)

**Prerequisites:** Node.js 18+, an Anthropic API key.

```bash
git clone https://github.com/teel27/TreasuryTakeHome.git
cd TreasuryTakeHome
npm install
cp .env.local.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000.

**Run tests:**
```bash
npm test
```
33/33 unit tests pass. Tests cover `matching.ts` independently of the Claude API —
no API key required to run the test suite.

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js (App Router, TypeScript) | Single language end-to-end, API routes + frontend in one repo, Vercel-native |
| Styling | Tailwind CSS | Fastest path to a clean, accessible UI without hand-rolling CSS |
| AI | Anthropic Claude API (`claude-sonnet-4-6`, multimodal) | Strong structured JSON extraction from label images, reliable under the 5-second latency budget |
| Deployment | Vercel | Zero-config deploy from GitHub push |
| Database | None | Stateless per-request processing — no persistence required for a prototype |

---

## Architecture

Two-stage pipeline per verification request. These stages are deliberately kept separate.

```
Browser
  │  POST multipart/form-data (label image + 5 application fields)
  ▼
/api/verify/route.ts
  ├─► lib/claude.ts       Stage 1: image → structured JSON (extraction only)
  └─► lib/matching.ts     Stage 2: deterministic field-by-field comparison
  ▼
Browser renders ResultsCard (PASS/REVIEW/FAIL per field, reason always visible)
```

**Stage 1 — Extraction (AI):** Claude receives the label image and returns only what it
observes — brand name, class/type, ABV, net contents, and government warning text — as
structured JSON. No comparison, no judgment at this stage.

**Stage 2 — Matching (deterministic TypeScript):** Plain TypeScript compares extracted
label values against user-submitted application values, field by field, per fixed rules.
This stage never calls the API. It is fully unit-testable in isolation.

**Why separate stages?** Keeping AI judgment out of the matching step makes every verdict
auditable and explainable. A compliance agent reviewing a FAIL can trace exactly which rule
triggered it — not just "the AI said so." This is intentional for a compliance use case.

---

## Matching Logic

### Brand Name & Class/Type — two-step

1. **Normalize first (deterministic):** Lowercase, strip/standardize punctuation
   (apostrophes, periods, commas), collapse whitespace. If normalized strings match →
   **PASS**. This handles Dave's "STONE'S THROW" vs "Stone's Throw" case with certainty,
   no fuzzy scoring needed.

2. **Similarity scoring (only if normalization doesn't match):** Levenshtein-based ratio
   on normalized strings:
   - 85–99% → **REVIEW** with the specific character difference stated in the reason
   - Below 85% → **FAIL**

> **Note on the 85% threshold:** This is a starting heuristic, not a precisely calibrated
> figure. It should be tuned against a real corpus of TTB label applications before
> production use. It is documented here rather than buried in code so it doesn't get
> treated as a settled number.

### Alcohol Content (ABV / Proof) — deterministic

- Normalize to ABV%: `Proof ÷ 2 = ABV%`
- Compare numerically with ±0.1% tolerance (absorbs floating-point rounding from the
  conversion formula)
- **PASS** or **FAIL** only — no REVIEW state. A unit conversion is correct or it isn't.

### Net Contents — deterministic

- Normalize units before comparing (e.g. `12 FL. OZ → 354.882 mL`)
- **Same-unit comparison** (mL vs mL): exact match required, ±0.05 mL tolerance for
  floating-point safety only
- **Cross-unit comparison** (fl oz ↔ mL): ±0.5 mL tolerance to absorb conversion
  rounding — 12 fl oz = 354.882 mL mathematically, but 355 mL is the industry-standard
  printed value; a flat ±0.05 mL tolerance produces false FAILs on legitimate labels
- **PASS** or **FAIL** only

### Government Warning Statement — exact match

Hard-coded canonical text (source: ttb.gov):
```
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink
alcoholic beverages during pregnancy because of the risk of birth defects.
(2) Consumption of alcoholic beverages impairs your ability to drive a car or
operate machinery, and may cause health problems.
```

Rules:
- `"GOVERNMENT WARNING:"` prefix must appear in all-caps — checked against extracted text
- Body text matched case-insensitively (labels commonly print the full statement in all
  caps; only the prefix has a strict case requirement per TTB)
- Any wording deviation → **FAIL** with specific reason
- On match → **PASS** with a permanent disclosure note (see Known Limitations: bold-type)
- No REVIEW state — TTB has zero tolerance for warning statement deviations

---

## Performance

Target: under 5 seconds end-to-end (hard stakeholder requirement — a prior vendor pilot
failed entirely due to 30–40 second processing times causing full user abandonment).

Measured latency on deployed Vercel app: 5.1–5.8 seconds (average ~5.5s) — marginally 
above the 5-second stakeholder threshold. Acceptable for a prototype but should be a 
primary optimization target before production consideration.

If the Claude API call risks exceeding this under realistic conditions, latency is
documented here rather than silently missed.

---

## Known Limitations

These are documented explicitly — not oversights, but deliberate scoping decisions for v1.

**Bold-type detection**
TTB requires `"GOVERNMENT WARNING:"` to appear in bold type. This cannot be verified from
image text extraction — Claude extracts text content, not font weight. No vision model
reliably detects bold vs. normal weight from a rasterized label image (stroke-width
differences are confounded by font choice, image compression, and lighting). The tool
verifies text content and capitalization; bold formatting must be confirmed visually by
the agent. A permanent disclosure note is shown on every Government Warning PASS for this
reason.

**"Separate and apart" layout requirement**
TTB requires the warning statement to appear separate and apart from all other label
information. Spatial layout cannot be assessed from extracted text. Agents must verify
placement visually.

**Compound / dual-unit net contents declarations**
Labels that express net contents in two units simultaneously (e.g. "1 PINT, 0.9 FL. OZ.")
cannot be parsed by the current normalization logic. The tool correctly surfaces these as
REVIEW rather than guessing. This format is valid on TTB labels and would require
additional parsing logic to handle in a future version.

**Poor-quality images**
Angled photos, glare, bad lighting, and low resolution reduce Claude's extraction
reliability. If a field cannot be read, the tool returns it as not legible and surfaces
a REVIEW rather than attempting to guess. Agents should resubmit a cleaner image.

**Batch upload**
Requested by stakeholders for peak-season volume (200–300 applications at once). Deferred
to v2. Single label per request only in v1.

**Structured data input (CSV/JSON)**
Not in scope for v1 — manual form entry only. Would be designed in conjunction with batch
upload in a future version, based on what format importers already use.

**COLA system integration**
Explicitly out of scope — standalone prototype only, per IT stakeholder direction.

**PII / federal compliance hardening**
Not required for this prototype. No data is persisted — all processing is stateless and
per-request. FedRAMP, document retention policies, and PII handling would be design
requirements for any production deployment inside TTB infrastructure.

**Network dependency**
The deployed prototype calls the Anthropic Claude API over the public internet. In a
production deployment inside a restricted federal network (where outbound traffic may be
firewalled), this would require either a network exception or substitution with a
self-hosted vision model. The two-stage architecture is designed to make this substitution
straightforward — only `lib/claude.ts` would need to change; all matching logic is
independent of the AI provider.

---

## Approach Summary

The core design decision was separating AI extraction from deterministic matching rather
than asking the model to do both in a single call. This keeps the AI doing what it's good
at (reading label images and returning structured data) while keeping compliance decisions
in auditable, testable TypeScript that a reviewer can read and verify independently. For a
tool whose output informs regulatory decisions, "the AI said FAIL" is not a sufficient
explanation — "the brand name similarity score was 72%, below the 85% REVIEW threshold"
is.

The Government Warning field deliberately has no REVIEW state. TTB has zero tolerance for
warning statement deviations, so any ambiguity resolves to FAIL rather than a soft
pass-pending-review that might get rubber-stamped through under workload pressure.

The 5-second latency requirement shaped the architecture more than any feature request —
it's what drove the single-call extraction approach over more elaborate multi-step
reasoning, and what rules out certain local model options for a Vercel deployment.
