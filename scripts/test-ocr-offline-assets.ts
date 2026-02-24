import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OCR_ASSETS = [
  'assets/ocr/worker.min.js',
  'assets/ocr/tesseract-core-lstm.wasm.js',
  'assets/ocr/tesseract-core-lstm.wasm',
  'assets/ocr/eng.traineddata.gz'
];

const BLOCKED_REMOTE_PATTERNS = [
  'https://cdn.jsdelivr.net/',
  'https://tessdata.projectnaptha.com/'
];

async function assertOcrAssetsExist(): Promise<void> {
  for (const asset of OCR_ASSETS) {
    const fullPath = path.join(ROOT, asset);
    const info = await stat(fullPath);
    assert(info.isFile(), `Expected OCR asset file: ${asset}`);
    assert(info.size > 0, `OCR asset is empty: ${asset}`);
  }
}

async function assertNoBlockedRemoteStrings(): Promise<void> {
  const filesToScan = [
    path.join(ROOT, 'sanitizer.js'),
    path.join(ROOT, 'pdf-redaction-worker.js')
  ];

  for (const filePath of filesToScan) {
    const text = await readFile(filePath, 'utf8');
    for (const blocked of BLOCKED_REMOTE_PATTERNS) {
      assert(!text.includes(blocked), `Found blocked remote OCR URL "${blocked}" in ${path.relative(ROOT, filePath)}`);
    }
  }
}

async function listChunkFiles(): Promise<string[]> {
  const chunkRoot = path.join(ROOT, 'chunks');
  const entries = await readdir(chunkRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(chunkRoot, entry.name));
}

async function assertLocalOcrUrlsReferenced(): Promise<void> {
  const filesToScan = [
    path.join(ROOT, 'sanitizer.js'),
    ...(await listChunkFiles())
  ];

  let foundWorkerPath = false;
  let foundCorePath = false;
  let foundAssetRoot = false;

  for (const filePath of filesToScan) {
    const text = await readFile(filePath, 'utf8');
    if (text.includes('localOcrAssetUrl("worker.min.js")') || text.includes("localOcrAssetUrl('worker.min.js')")) {
      foundWorkerPath = true;
    }
    if (text.includes('localOcrAssetUrl("tesseract-core-lstm.wasm.js")') || text.includes("localOcrAssetUrl('tesseract-core-lstm.wasm.js')")) {
      foundCorePath = true;
    }
    if (text.includes('chrome.runtime.getURL("assets/ocr")') || text.includes("chrome.runtime.getURL('assets/ocr')")) {
      foundAssetRoot = true;
    }
  }

  assert(foundWorkerPath, 'Expected built output to reference local OCR worker asset path.');
  assert(foundCorePath, 'Expected built output to reference local OCR core asset path.');
  assert(foundAssetRoot, 'Expected built output to reference local OCR asset root.');
}

async function main(): Promise<void> {
  await assertOcrAssetsExist();
  await assertNoBlockedRemoteStrings();
  await assertLocalOcrUrlsReferenced();
  console.log('✅ OCR offline asset checks passed (local assets present, no blocked CDN strings).');
}

void main();
