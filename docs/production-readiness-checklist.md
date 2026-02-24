# Production Readiness Checklist

## 1) Policy and Manifest
- [ ] Verify `manifest.json` permissions are strictly necessary and documented.
- [ ] Verify `host_permissions` and content script scope match product intent.
- [ ] Verify `web_accessible_resources` only includes assets needed by page context.
- [ ] Verify Chrome Web Store listing copy matches actual runtime behavior.

## 2) Privacy and Security
- [ ] Confirm no content leaves device (no external API calls carrying user text/files).
- [ ] Confirm extension UI pages do not rely on third-party network assets.
- [ ] Confirm OCR worker/core/language assets are bundled locally and loaded via extension-local URLs only (no CDN fallbacks).
- [ ] Confirm storage keys and retention behavior are documented (`sessionStats`, `historyStats`, `latestDetection`).
- [ ] Confirm warning-only behavior is explicit (no silent submission blocking).
- [ ] Confirm upload preflight blocks unsupported MIME/extension combinations and oversize files.
- [ ] Confirm CSV output neutralizes spreadsheet formula injection vectors (`=`, `+`, `-`, `@`).
- [ ] Confirm PDF redaction output is clearly labeled as overlay redaction until object-level removal implementation is verified.

## 3) Build and Artifacts
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build` and confirm generated artifacts are current.
- [ ] Verify extension loads unpacked without console/runtime errors.
- [ ] Verify version consistency across release metadata.

## 4) Automated Tests
- [ ] Run `npm run test:detector`.
- [ ] Run `npm run test:ocr-offline`.
- [ ] Run `npm run test:docx -- <path-to-docx> --mode=hide` on sample docs.
- [ ] Run `npm run test:docx -- <path-to-docx> --mode=replace` on sample docs.

## 5) Manual QA
- [ ] Verify paste/input/submit alerts on representative AI pages.
- [ ] Verify file upload alerts for text files and unsupported-binary messaging.
- [ ] Verify popup toggle, session stats, history stats, and latest detection rendering.
- [ ] Verify File Sanitizer flows for TXT/CSV/DOCX and expected PDF/image limitations.
- [ ] Verify sanitizer blocks download when high-risk residual PII remains after cleaning.
- [ ] Verify DOCX sanitization scrubs document metadata fields (core/app/custom + comment author attributes).
- [ ] Verify DOCX with macros/embeddings/ActiveX/customXml is blocked with explicit unsafe-content messaging.

## 6) Performance
- [ ] Verify no noticeable typing lag on large prompts.
- [ ] Verify no excessive notification spam for repetitive edits.
- [ ] Verify observer/listener behavior remains stable on dynamic pages.
- [ ] Verify decode/sanitize timeout guards produce deterministic fail-fast UX on malformed/slow files.
- [ ] Verify PDF page and extracted-text limits block oversized parsing workloads safely.

## 7) Release Gate
- [ ] Re-run all checks on release candidate build.
- [ ] Capture known limitations in release notes.
- [ ] Tag release only after checklist completion.
