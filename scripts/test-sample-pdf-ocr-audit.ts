/**
 * OCR audit test for sample.pdf (scanned / image-only PDF).
 *
 * This script:
 *  1. Extracts text from sample.pdf using system tools (pdftoppm → tesseract).
 *  2. Runs the PII detector on the extracted text.
 *  3. Reports every match (type, value, position) so we can audit coverage.
 *  4. Asserts a minimum set of expected PII categories.
 *
 * Run:  npm run test:sample-pdf-ocr
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectMatches, summarizeMatches } from '../src/shared/pii/detector';
import { PII_PATTERNS } from '../src/shared/pii/patterns';

const SAMPLE_PDF = path.resolve(import.meta.dirname ?? __dirname, '..', 'sample.pdf');

function extractTextWithSystemOcr(pdfPath: string): string {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`sample.pdf not found at ${pdfPath}`);
  }

  // Verify system tools are available
  try {
    execSync('which pdftoppm', { stdio: 'pipe' });
    execSync('which tesseract', { stdio: 'pipe' });
  } catch {
    throw new Error(
      'System OCR tools not available. Install with: sudo apt-get install poppler-utils tesseract-ocr'
    );
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sani-ocr-audit-'));

  try {
    // Render PDF pages to PNG at 300 DPI
    execSync(`pdftoppm -png -r 300 "${pdfPath}" "${tmpDir}/page"`, { stdio: 'pipe' });

    const pageImages = fs.readdirSync(tmpDir)
      .filter((f) => f.endsWith('.png'))
      .sort();

    if (pageImages.length === 0) {
      throw new Error('pdftoppm produced no page images');
    }

    // Run tesseract on each page image
    const pageTexts: string[] = [];
    for (const img of pageImages) {
      const imgPath = path.join(tmpDir, img);
      const text = execSync(`tesseract "${imgPath}" stdout`, { encoding: 'utf-8' });
      pageTexts.push(text.trim());
    }

    return pageTexts.join('\n\n');
  } finally {
    // Cleanup temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

function main(): void {
  console.log('=== Sample PDF OCR Audit ===\n');

  // Step 1: Extract text
  console.log('Step 1: Extracting text from sample.pdf via system OCR…');
  const extractedText = extractTextWithSystemOcr(SAMPLE_PDF);
  console.log(`  Extracted ${extractedText.length} chars across text.\n`);
  console.log('--- Extracted Text ---');
  console.log(extractedText);
  console.log('--- End Extracted Text ---\n');

  // Step 2: Run PII detection
  console.log('Step 2: Running PII detector…');
  const matches = detectMatches(extractedText, PII_PATTERNS);
  console.log(`  Found ${matches.length} PII match(es).\n`);

  // Step 3: Audit every match
  if (matches.length > 0) {
    console.log('--- Detected PII Matches ---');
    for (const match of matches) {
      const ctxStart = Math.max(0, match.index - 20);
      const ctxEnd = Math.min(extractedText.length, match.index + match.length + 20);
      const context = extractedText.substring(ctxStart, ctxEnd);
      console.log(`  [${match.key}] "${match.value}" (pos ${match.index}–${match.index + match.length})`);
      console.log(`    context: "…${context}…"`);
    }
    console.log('--- End Matches ---\n');
  }

  // Step 4: Summarize
  const summary = summarizeMatches(matches);
  console.log('Summary:');
  for (const item of summary) {
    console.log(`  ${item.type}: ${item.count} detection(s)`);
  }
  console.log('');

  // Step 5: Assertions — at minimum we expect a name and ZIP from this document
  const matchedKeys = new Set(matches.map((m) => m.key));

  // Audit: print which known-PII categories were found vs missed
  const expectedCategories: Array<{ key: string; label: string; required: boolean }> = [
    { key: 'fullNameContextual', label: 'Full Name (contextual)', required: true },
    { key: 'streetAddressLoose', label: 'Street Address', required: true },
    { key: 'zipCode', label: 'ZIP Code', required: true },
    { key: 'driversLicense', label: "Driver's License", required: true },
    { key: 'dob', label: 'Date of Birth', required: false },
    { key: 'dobContextual', label: 'Date of Birth (text format)', required: false },
    { key: 'phone', label: 'Phone Number', required: false },
  ];

  console.log('Category coverage:');
  const missing: string[] = [];
  for (const cat of expectedCategories) {
    const found = matchedKeys.has(cat.key);
    const marker = found ? '✅' : cat.required ? '❌ MISSING' : '⚠️  not matched';
    console.log(`  ${marker} ${cat.label} (${cat.key})`);
    if (cat.required && !found) {
      missing.push(cat.key);
    }
  }
  console.log('');

  // Step 6: Hard assertions on required categories
  assert(
    matches.length > 0,
    'Expected at least one PII match from sample.pdf OCR text'
  );

  for (const key of missing) {
    console.error(`FAIL: Required PII category "${key}" was not detected.`);
  }

  assert.equal(
    missing.length,
    0,
    `Missing required PII categories: ${missing.join(', ')}`
  );

  console.log('✅ Sample PDF OCR audit passed — all required PII categories detected.');
}

main();
