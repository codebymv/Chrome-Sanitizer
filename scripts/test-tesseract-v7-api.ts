/**
 * Tesseract.js v7 API integration test.
 *
 * Verifies that word-level data with bounding boxes is available through
 * the blocks → paragraphs → lines → words hierarchy when `output: { blocks: true }`
 * is passed. This is critical because our OCR pipeline depends on per-word
 * confidence scores and bboxes for span-based redaction.
 *
 * Requires system tools: pdftoppm (poppler-utils)
 * Run:  npm run test:tesseract-v7
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SAMPLE_PDF = path.resolve(import.meta.dirname ?? __dirname, '..', 'sample.pdf');

interface OcrWordBbox { x0: number; y0: number; x1: number; y1: number; }
interface OcrWord { text: string; confidence: number; bbox: OcrWordBbox; }
interface OcrLine { words: OcrWord[]; }
interface OcrParagraph { lines: OcrLine[]; }
interface OcrBlock { paragraphs: OcrParagraph[]; }
interface OcrData {
  text: string;
  confidence: number;
  blocks: OcrBlock[] | null;
}

function renderPage(pdfPath: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tess-v7-test-'));
  execSync(`pdftoppm -png -r 300 -f 1 -l 1 "${pdfPath}" "${tmpDir}/page"`, { stdio: 'pipe' });
  const images = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.png'));
  assert(images.length > 0, 'pdftoppm produced no images');
  return path.join(tmpDir, images[0]);
}

async function main(): Promise<void> {
  if (!fs.existsSync(SAMPLE_PDF)) {
    console.log('⚠️  sample.pdf not found — skipping Tesseract v7 API test.');
    return;
  }

  console.log('=== Tesseract.js v7 API Test ===\n');

  // 1. Import and verify exports
  const Tesseract = await import('tesseract.js');
  const createWorker = (Tesseract as unknown as { createWorker?: Function }).createWorker
    ?? (Tesseract as unknown as { default?: { createWorker?: Function } }).default?.createWorker;

  assert(typeof createWorker === 'function', 'createWorker must be a function');
  console.log('✓ createWorker is available');

  // 2. Create worker
  const worker = await (createWorker as Function)('eng', 1, { gzip: true });
  assert(typeof worker.recognize === 'function', 'worker.recognize must be a function');
  console.log('✓ Worker created');

  // 3. Render PDF page to image
  const imagePath = renderPage(SAMPLE_PDF);
  console.log(`✓ Rendered page to ${imagePath}`);

  // 4. Test: default output (no blocks) — should NOT have word-level data
  const defaultResult = await worker.recognize(imagePath);
  const defaultData = defaultResult.data as OcrData;
  assert(typeof defaultData.text === 'string', 'text must be a string');
  assert(defaultData.text.length > 0, 'text must not be empty');
  assert(
    defaultData.blocks === null || defaultData.blocks === undefined,
    'Default output should not include blocks (v7 lazy evaluation)'
  );
  console.log(`✓ Default output: text=${defaultData.text.length} chars, blocks=${defaultData.blocks}`);

  // 5. Test: explicit blocks output — MUST have word-level data
  const blocksResult = await worker.recognize(imagePath, {}, { text: true, blocks: true });
  const blocksData = blocksResult.data as OcrData;

  assert(typeof blocksData.text === 'string', 'text must be a string');
  assert(blocksData.text.length > 0, 'text must not be empty');
  assert(Array.isArray(blocksData.blocks), 'blocks must be an array when requested');
  assert(blocksData.blocks!.length > 0, 'blocks must not be empty');
  console.log(`✓ Blocks output: ${blocksData.blocks!.length} block(s)`);

  // 6. Extract words from hierarchy
  const allWords: OcrWord[] = [];
  for (const block of blocksData.blocks!) {
    assert(Array.isArray(block.paragraphs), 'block.paragraphs must be an array');
    for (const para of block.paragraphs) {
      assert(Array.isArray(para.lines), 'paragraph.lines must be an array');
      for (const line of para.lines) {
        assert(Array.isArray(line.words), 'line.words must be an array');
        for (const word of line.words) {
          allWords.push(word);
        }
      }
    }
  }

  assert(allWords.length > 0, 'Must extract at least one word from blocks');
  console.log(`✓ Extracted ${allWords.length} words from block hierarchy`);

  // 7. Verify word structure
  const sample = allWords[0];
  assert(typeof sample.text === 'string', 'word.text must be a string');
  assert(typeof sample.confidence === 'number', 'word.confidence must be a number');
  assert(typeof sample.bbox === 'object' && sample.bbox !== null, 'word.bbox must be an object');
  assert(typeof sample.bbox.x0 === 'number', 'bbox.x0 must be a number');
  assert(typeof sample.bbox.y0 === 'number', 'bbox.y0 must be a number');
  assert(typeof sample.bbox.x1 === 'number', 'bbox.x1 must be a number');
  assert(typeof sample.bbox.y1 === 'number', 'bbox.y1 must be a number');
  console.log(`✓ Word structure verified: text="${sample.text}", confidence=${sample.confidence}, bbox=${JSON.stringify(sample.bbox)}`);

  // 8. Confidence distribution
  const highConf = allWords.filter((w) => w.confidence >= 50);
  const lowConf = allWords.filter((w) => w.confidence < 50 && w.confidence >= 20);
  const veryLow = allWords.filter((w) => w.confidence < 20);
  console.log(`✓ Confidence: ${highConf.length} high (≥50), ${lowConf.length} medium (20-49), ${veryLow.length} low (<20)`);
  assert(highConf.length > 0, 'Must have at least some high-confidence words');

  // 9. Verify text contains expected content
  const fullText = blocksData.text.toLowerCase();
  assert(fullText.includes('matthew'), 'OCR text must contain "matthew"');
  assert(fullText.includes('valentine'), 'OCR text must contain "valentine"');
  assert(fullText.includes('tucson'), 'OCR text must contain "tucson"');
  console.log('✓ OCR text contains expected content (name, city)');

  // 10. Cleanup
  await worker.terminate();
  console.log('✓ Worker terminated\n');

  console.log(`✅ Tesseract.js v7 API test passed (10 checks).`);
}

void main();
