import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import { detectMatches } from '../src/shared/pii/detector';
import { PII_PATTERNS } from '../src/shared/pii/patterns';
import type { DetectedMatch } from '../src/shared/types';

const blockedKeys = new Set([
  'ssn',
  'creditCard',
  'bankAccount',
  'routingNumber',
  'cvv',
  'cardExpiry',
  'fullNameContextual',
  'email',
  'phone',
  'driversLicense',
  'dob'
]);

function maskText(inputText: string): string {
  const matches = detectMatches(inputText, PII_PATTERNS).sort((left, right) => right.index - left.index);
  let cleaned = inputText;

  for (const match of matches) {
    const before = cleaned.slice(0, match.index);
    const after = cleaned.slice(match.index + match.length);
    cleaned = `${before}${'█'.repeat(match.length)}${after}`;
  }

  return cleaned;
}

function summarize(matches: DetectedMatch[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of matches) {
    counts[item.key] = (counts[item.key] ?? 0) + 1;
  }
  return counts;
}

function printSummary(title: string, matches: DetectedMatch[]): void {
  const summary = summarize(matches);
  const entries = Object.entries(summary).sort(([left], [right]) => left.localeCompare(right));

  console.log(`\n${title}`);
  if (entries.length === 0) {
    console.log('  (none)');
    return;
  }

  for (const [key, count] of entries) {
    console.log(`  - ${key}: ${count}`);
  }
}

async function main(): Promise<void> {
  const targetPath = process.argv[2];
  if (!targetPath) {
    console.error('Usage: npm run test:docx -- <path-to-docx>');
    process.exit(1);
  }

  const absolutePath = path.resolve(process.cwd(), targetPath);
  const outputPath = `${absolutePath}.sanitized-preview.txt`;

  const buffer = await readFile(absolutePath);
  const extracted = await mammoth.extractRawText({ buffer });
  const originalText = extracted.value;

  const beforeMatches = detectMatches(originalText, PII_PATTERNS);
  const sanitizedText = maskText(originalText);
  const afterMatches = detectMatches(sanitizedText, PII_PATTERNS);
  const residualCritical = afterMatches.filter((match) => blockedKeys.has(match.key));

  printSummary('Detected before sanitize', beforeMatches);
  printSummary('Detected after sanitize', afterMatches);

  await writeFile(outputPath, sanitizedText, 'utf8');
  console.log(`\nSanitized text preview written to: ${outputPath}`);

  if (residualCritical.length > 0) {
    console.error('\n❌ Residual critical PII still detected after sanitization:');
    for (const item of residualCritical.slice(0, 20)) {
      console.error(`  - [${item.key}] ${item.value}`);
    }
    process.exit(2);
  }

  console.log('\n✅ No residual critical PII detected.');
}

void main();
