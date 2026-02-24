import assert from 'node:assert/strict';
import { detectMatches, summarizeMatches } from '../src/shared/pii/detector';
import { PII_PATTERNS } from '../src/shared/pii/patterns';

interface Case {
  name: string;
  text: string;
  expectedKeys: string[];
  blockedKeys?: string[];
}

const cases: Case[] = [
  {
    name: 'detects contextual SSN, email, and phone',
    text: 'SSN: 123-45-6789 Email: jane.doe@example.com Call me at (555) 123-4567.',
    expectedKeys: ['ssn', 'email', 'phone']
  },
  {
    name: 'detects card metadata with validation',
    text: 'Credit Card: 4111-1111-1111-1111 CVV: 123 Exp: 02/29',
    expectedKeys: ['creditCard', 'cvv', 'cardExpiry']
  },
  {
    name: 'detects API key and auth token',
    text: 'api_key: rk_test_1234567890abcdef1234 bearer: abcdefghijklmnopqrstuvwxyz123456',
    expectedKeys: ['apiKey', 'authToken']
  },
  {
    name: 'detects table-style addresses, masked accounts, and medical ids',
    text: 'Name Jane A. Doe 742 Evergreen Terrace Springfield IL 62704 Expiry 08/27 CVV 123 Bank Account ****4321 MRN: 00123456 NPI: 1234567890 Insurance ID: BCBS-987654321 Group: 45678',
    expectedKeys: ['fullNameContextual', 'streetAddressLoose', 'zipCode', 'cardExpiry', 'cvv', 'bankAccountMasked', 'mrn', 'npi', 'insuranceId']
  },
  {
    name: 'does not treat column headers as full names',
    text: 'Name Street Address City State ZIP',
    expectedKeys: [],
    blockedKeys: ['fullNameContextual', 'streetAddressLoose']
  },
  {
    name: 'does not match invalid ipv4 values',
    text: 'invalid ip 999.999.999.999 should not match',
    expectedKeys: [],
    blockedKeys: ['ipAddress']
  },
  {
    name: 'detects driver license with hash and number variants',
    text: "Driver License#: D08194663 and DL Number: AB1234567",
    expectedKeys: ['driversLicense']
  },
  {
    name: 'detects contextual date of birth in text format',
    text: 'Date of Birth: Jul 27 1996',
    expectedKeys: ['dobContextual']
  },
  {
    name: 'does not match short random digits as credit card',
    text: 'random numbers 123456789012 and 1234567890 should not be credit cards',
    expectedKeys: [],
    blockedKeys: ['creditCard']
  }
];

function assertContainsKeys(actualKeys: string[], expectedKeys: string[], caseName: string): void {
  for (const expected of expectedKeys) {
    assert(
      actualKeys.includes(expected),
      `[${caseName}] missing expected key "${expected}"; got [${actualKeys.join(', ')}]`
    );
  }
}

function assertOmitsKeys(actualKeys: string[], blockedKeys: string[], caseName: string): void {
  for (const blocked of blockedKeys) {
    assert(
      !actualKeys.includes(blocked),
      `[${caseName}] found blocked key "${blocked}"; got [${actualKeys.join(', ')}]`
    );
  }
}

function runCase(testCase: Case): void {
  const matches = detectMatches(testCase.text, PII_PATTERNS);
  const keys = matches.map((match) => match.key);

  assertContainsKeys(keys, testCase.expectedKeys, testCase.name);

  if (testCase.blockedKeys && testCase.blockedKeys.length > 0) {
    assertOmitsKeys(keys, testCase.blockedKeys, testCase.name);
  }
}

function runOverlapRegression(): void {
  const text = 'Contact john.smith@example.com right now.';
  const matches = detectMatches(text, PII_PATTERNS);
  const emailMatchCount = matches.filter((match) => match.key === 'email').length;
  assert.equal(emailMatchCount, 1, `Expected one email match, received ${emailMatchCount}`);

  const overlappingZipMatches = matches.filter((match) => match.key === 'zipCode').length;
  assert.equal(overlappingZipMatches, 0, 'Expected no overlapping ZIP code inside email token');
}

function runSummaryRegression(): void {
  const text = 'Email: a@example.com Email: b@example.com Phone: 555-123-4567';
  const summary = summarizeMatches(detectMatches(text, PII_PATTERNS));

  const byType = new Map(summary.map((item) => [item.type, item]));
  const email = byType.get('Email Address');
  assert(email, 'Expected Email Address summary entry');
  assert.equal(email.count, 2, `Expected 2 email detections, got ${email.count}`);

  const phone = byType.get('Phone Number');
  assert(phone, 'Expected Phone Number summary entry');
  assert.equal(phone.count, 1, `Expected 1 phone detection, got ${phone.count}`);
}

function main(): void {
  for (const testCase of cases) {
    runCase(testCase);
  }

  runOverlapRegression();
  runSummaryRegression();

  console.log(`✅ Detector tests passed (${cases.length + 2} checks).`);
}

main();
