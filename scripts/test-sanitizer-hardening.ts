import assert from 'node:assert/strict';
import {
  buildManualOverrideWarning,
  detectUnsafeDocxEntryPaths,
  filterHighRiskResidual,
  neutralizeCsvFormulaInjection,
  validateUploadPreflight
} from '../src/sanitizer/hardening';
import { DECODE_TIMEOUT_MS, DOCX_SANITIZE_TIMEOUT_MS, MAX_PDF_EXTRACTED_CHARS, MAX_PDF_PAGES, withTimeout } from '../src/shared/file/security';

function runPreflightTests(): void {
  const validTxt = { name: 'notes.txt', size: 1024, type: 'text/plain' } as File;
  assert.equal(validateUploadPreflight(validTxt), null);

  const invalidType = { name: 'archive.exe', size: 1024, type: 'application/octet-stream' } as File;
  assert.match(validateUploadPreflight(invalidType) ?? '', /Unsupported file type/);

  const mismatchedPdf = { name: 'doc.pdf', size: 1024, type: 'text/plain' } as File;
  assert.match(validateUploadPreflight(mismatchedPdf) ?? '', /File type mismatch/);
}

function runResidualTests(): void {
  const filtered = filterHighRiskResidual([
    {
      key: 'zipCode',
      type: 'ZIP Code',
      severity: 'medium',
      value: '90210',
      index: 0,
      length: 5
    },
    {
      key: 'apiKey',
      type: 'API Key',
      severity: 'critical',
      value: 'api_key: test_fake_key_0123456789abcdef',
      index: 10,
      length: 41
    }
  ]);

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.key, 'apiKey');
}

function runCsvHardeningTests(): void {
  const source = 'name,formula\nAlice,=SUM(1,2)\nBob,@cmd';
  const hardened = neutralizeCsvFormulaInjection(source);

  assert.equal(hardened.updatedCells, 2);
  assert.match(hardened.text, /'=SUM\(1,2\)/);
  assert.match(hardened.text, /'@cmd/);

  const clean = neutralizeCsvFormulaInjection('name,value\nAlice,hello');
  assert.equal(clean.updatedCells, 0);
}

function runDocxUnsafeEntryTests(): void {
  const unsafe = detectUnsafeDocxEntryPaths([
    'word/document.xml',
    'word/vbaProject.bin',
    'word/embeddings/oleObject1.bin',
    'docProps/core.xml'
  ]);

  assert.equal(unsafe.length, 2);
  assert(unsafe.includes('word/vbaProject.bin'));
  assert(unsafe.includes('word/embeddings/oleObject1.bin'));

  const safe = detectUnsafeDocxEntryPaths(['word/document.xml', 'docProps/core.xml']);
  assert.equal(safe.length, 0);
}

async function runTimeoutTests(): Promise<void> {
  const quickResult = await withTimeout(Promise.resolve('ok'), 50, 'quick');
  assert.equal(quickResult, 'ok');

  await assert.rejects(
    () => withTimeout(new Promise<void>((resolve) => {
      setTimeout(resolve, 40);
    }), 10, 'slow-op'),
    /slow-op timed out/
  );

  assert(DECODE_TIMEOUT_MS > 0);
  assert(DOCX_SANITIZE_TIMEOUT_MS >= DECODE_TIMEOUT_MS);
  assert(MAX_PDF_PAGES >= 10);
  assert(MAX_PDF_EXTRACTED_CHARS >= 100_000);
}

function runManualOverrideWarningTests(): void {
  assert.equal(buildManualOverrideWarning(0), '');
  assert.match(buildManualOverrideWarning(1), /1 item/);
  assert.match(buildManualOverrideWarning(3), /3 items/);
}

async function main(): Promise<void> {
  runPreflightTests();
  runResidualTests();
  runCsvHardeningTests();
  runDocxUnsafeEntryTests();
  runManualOverrideWarningTests();
  await runTimeoutTests();
  console.log('✅ Sanitizer hardening tests passed (19 checks).');
}

void main();
