# Sani 🧼

Sani is a Chrome extension for detecting sensitive data before it leaves your browser. It watches AI chat inputs and file uploads, alerts you when PII is found, and includes a dedicated File Sanitizer for creating cleaned copies of supported files.

## What’s Included

- **In-page PII detection** for typed, pasted, and uploaded content
- **Severity-based alerts** (critical/high/medium/low)
- **Session + history stats** in the popup
- **Draggable on-page shield + quick-open sanitizer button**
- **File Sanitizer** with side-by-side preview and auto/manual cleaning modes
- **Hardening controls** (upload preflight checks, CSV formula neutralization, timeout guards, DOCX unsafe-content checks)

## Current Detection Coverage

Sani currently detects patterns including:

- Full names (contextual)
- SSNs
- Credit cards
- Bank account + routing numbers
- CVV + card expiry
- Email addresses
- Phone numbers
- Street addresses + ZIP codes
- Passport + driver’s license
- Date of birth
- IP addresses
- API keys + auth tokens

Detection rules live in `src/shared/pii/patterns.ts` and can be customized.

## How It Works

### 1) Browser-page protection (warning-only)

The content script monitors chat UIs and uploads, scans with local regex/validator logic, and shows warnings without silently changing your text.

### 2) File Sanitizer (optional)

The sanitizer supports TXT/CSV/TSV/JSON/XML/LOG/HTML/MD/DOCX/PDF and common image uploads for detection workflows.

- **Auto Clean**
	- `Hide`: masks detected values with block characters
	- `Replace`: swaps values with safe synthetic replacements
- **Manual Clean**
	- Review individual hits
	- Select exactly what to sanitize
	- Re-run and export

### 3) Format-aware behavior

- **DOCX**: supports metadata/content sanitization with additional safety checks
- **CSV/TSV**: neutralizes potential spreadsheet formula injection output
- **PDF**: supports downloadable overlay redaction in `Hide` mode (object-level content removal is still in progress)
- **Scanned PDFs**: uses OCR fallback with local bundled assets (no CDN dependency)

## Privacy Model

- No external API calls for user content
- No server-side processing
- Local browser-side detection/sanitization only
- OCR runtime assets (worker/core/language data) are bundled in the extension package and loaded via extension-local URLs only
- Storage is limited to extension settings/stats (`shieldEnabled`, `overlayEnabled`, session/history/latest detection)

## Install (Unpacked)

1. Clone/download this repo.
2. (Optional) Build bundles:
	 - `npm install`
	 - `npm run build`
3. Open Chrome → `chrome://extensions/`
4. Enable **Developer mode**
5. Click **Load unpacked** and select this repo folder.

## Development

- `npm run build` — one-time build
- `npm run watch` — watch and rebuild
- `npm run typecheck` — TypeScript checks

### Test Scripts

- `npm run test:detector`
- `npm run test:content-utils`
- `npm run test:sanitizer-hardening`
- `npm run test:pdf-redaction-scaffold`
- `npm run test:ocr-offline`
- `npm run test:docx -- <path-to-docx> --mode=hide|replace`

## Supported Sites (for chat monitoring)

- claude.ai
- chat.openai.com
- gemini.google.com
- copilot.microsoft.com

## Project Structure

- `src/content` — on-page monitoring + alerts
- `src/popup` — popup UI and stats
- `src/sanitizer` — sanitizer app logic + hardening
- `src/shared` — detection, storage, file decoders, shared types
- `scripts` — test and verification scripts
- `docs` — release and readiness checklists

## Notes

- Detection is heuristic and may produce false positives/negatives.
- PDF redaction currently uses visual overlay in output documents; object-level PDF content deletion is a planned enhancement.
- Always review sensitive content manually before sharing.
