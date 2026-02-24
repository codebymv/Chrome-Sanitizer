import assert from 'node:assert/strict';
import { createPdfRedactionEngine, getPdfRedactionSupportMessage } from '../src/shared/file/redaction/pdf/engine';

async function main(): Promise<void> {
  const engine = createPdfRedactionEngine();
  const support = engine.getSupport();

  assert.equal(support.status, 'scaffold');
  assert.equal(support.objectLevelRemoval, false);
  assert.match(support.message, /scaffolded/i);

  const plan = engine.buildPlan('Email: jane@example.com SSN: 123-45-6789');
  assert(plan.matchCount > 0);
  assert.equal(plan.matches.length, plan.matchCount);

  const result = await engine.applyPlan(new File(['sample'], 'sample.pdf', { type: 'application/pdf' }), plan);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.matchCount, plan.matchCount);
  assert.equal(result.message, getPdfRedactionSupportMessage());

  console.log('✅ PDF redaction scaffold tests passed (8 checks).');
}

void main();
