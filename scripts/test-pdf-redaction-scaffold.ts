import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { createPdfRedactionEngine, getPdfRedactionSupportMessage } from '../src/shared/file/redaction/pdf/engine';

async function main(): Promise<void> {
  const engine = createPdfRedactionEngine();
  const support = engine.getSupport();

  assert.equal(support.status, 'ready');
  assert.equal(support.objectLevelRemoval, false);
  assert.equal(support.message, getPdfRedactionSupportMessage());

  const extracted = 'Email: jane@example.com';
  const matchValue = 'jane@example.com';
  const start = extracted.indexOf(matchValue);
  const end = start + matchValue.length;

  const plan = engine.buildPlan(extracted, {
    pageCount: 1,
    usedOcr: false,
    spans: [
      {
        pageNumber: 1,
        start,
        end,
        text: matchValue,
        bbox: {
          x: 72,
          y: 600,
          width: 120,
          height: 12,
          pageHeight: 792
        }
      }
    ]
  });

  assert(plan.matchCount > 0);
  assert.equal(plan.matches.length, plan.matchCount);
  assert.equal(plan.targets.length, plan.matchCount);
  assert.equal(plan.unresolvedTargetCount, 0);

  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  const pdfBytes = await pdf.save();
  const input = new File([pdfBytes], 'sample.pdf', { type: 'application/pdf' });

  const result = await engine.applyPlan(input, plan);
  assert.equal(result.status, 'redacted');
  assert(result.redactedBlob, 'Expected redactedBlob in redacted result');
  assert.equal(result.matchCount, plan.matchCount);
  assert.match(result.message, /Applied/);

  console.log('✅ PDF redaction engine tests passed (9 checks).');
}

void main();
