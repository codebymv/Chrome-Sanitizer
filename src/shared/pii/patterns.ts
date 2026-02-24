import type { DetectionPattern } from '../types';
import { isLikelyCreditCard, isLikelyExpiry, isLikelyIpv4 } from './validators';

function isLikelyPersonalName(value: string): boolean {
  const tokens = value.trim().split(/\s+/).map((token) => token.replace(/[^A-Za-z]/g, '').toLowerCase()).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 4) {
    return false;
  }

  const stopwords = new Set([
    'name', 'full', 'street', 'address', 'city', 'state', 'zip', 'phone', 'email', 'ssn',
    'date', 'birth', 'credit', 'card', 'expiry', 'cvv', 'bank', 'account', 'financial',
    'information', 'records', 'medical', 'sample', 'provider', 'insurance', 'group'
  ]);

  return !tokens.some((token) => stopwords.has(token));
}

export const PII_PATTERNS: DetectionPattern[] = [
  {
    key: 'fullNameContextual',
    label: 'Full Name',
    severity: 'high',
    regex: /(?<=\b(?:full\s*name|name)\b(?:\s*:\s*|\s+))[A-Z][a-z]+(?:\s+[A-Z]\.)?(?:\s+[A-Z][a-z]+){1,3}\b/gi,
    validate: (match) => isLikelyPersonalName(match)
  },
  {
    key: 'ssn',
    label: 'Financial',
    severity: 'critical',
    regex: /\b\d{3}-\d{2}-\d{4}\b|(?<=\b(?:social\s*security(?:\s*number)?|ssn)\s*:\s*)\d{9}\b/gi
  },
  {
    key: 'creditCard',
    label: 'Financial',
    severity: 'critical',
    regex: /(?<=\bcredit\s*card\s*:\s*)(?:\d[\s-]?){13,19}\d\b|\b(?:\d[\s-]?){13,19}\d\b/g,
    validate: (match) => isLikelyCreditCard(match)
  },
  {
    key: 'bankAccount',
    label: 'Bank Account Number',
    severity: 'critical',
    regex: /(?<=\bbank\s*account(?:\s*number)?\b(?:\s*:\s*|\s+))\d{8,17}\b/gi
  },
  {
    key: 'bankAccountMasked',
    label: 'Bank Account Number',
    severity: 'high',
    regex: /(?<!\w)\*{2,}\d{3,6}\b/g
  },
  {
    key: 'routingNumber',
    label: 'Routing Number',
    severity: 'critical',
    regex: /(?<=\brouting\s*number\s*:\s*)\d{9}\b/gi
  },
  {
    key: 'cvv',
    label: 'CVV',
    severity: 'critical',
    regex: /(?<=\b(?:cvv|cvc|security\s*code)\b(?:\s*:\s*|\s+))\d{3,4}\b/gi
  },
  {
    key: 'cardExpiry',
    label: 'Card Expiry',
    severity: 'high',
    regex: /(?<=\b(?:exp|expiry|expiration)\b(?:\s*:\s*|\s+))(?:0[1-9]|1[0-2])[\/-](?:\d{2}|\d{4})\b/gi,
    validate: (match) => isLikelyExpiry(match)
  },
  {
    key: 'cardExpiryLoose',
    label: 'Card Expiry',
    severity: 'medium',
    regex: /\b(?:0[1-9]|1[0-2])[\/-]\d{2}\b/g,
    validate: (match) => isLikelyExpiry(match)
  },
  {
    key: 'email',
    label: 'Email Address',
    severity: 'high',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
  },
  {
    key: 'phone',
    label: 'Phone Number',
    severity: 'high',
    regex: /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g
  },
  {
    key: 'streetAddress',
    label: 'Street Address',
    severity: 'high',
    regex: /(?<=\baddress\s*:\s*)\d+\s+[A-Za-z0-9.'#\-\s]+,\s*(?:[A-Za-z0-9.'#\-\s]+,\s*)?[A-Za-z.\-\s]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/gi
  },
  {
    key: 'streetAddressLoose',
    label: 'Street Address',
    severity: 'medium',
    regex: /\b\d{1,6}[A-Za-z]?\s+[A-Za-z0-9.'#\-]+(?:\s+[A-Za-z0-9.'#\-]+){0,5}\s(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Terrace|Ter|Loop|Place|Pl|Parkway|Pkwy|Circle|Cir)\b(?:\s+(?:Apt|Apartment|Suite|Ste|Unit)\s*[A-Za-z0-9\-]+)?(?:\s+(?:N|S|E|W|NE|NW|SE|SW))?/gi
  },
  {
    key: 'zipCode',
    label: 'ZIP Code',
    severity: 'medium',
    regex: /\b\d{5}(-\d{4})?\b/g
  },
  {
    key: 'passport',
    label: 'Passport Number',
    severity: 'critical',
    regex: /(?<=\bpassport(?:\s*number)?\s*:\s*)[A-Z0-9]{6,9}\b/gi
  },
  {
    key: 'driversLicense',
    label: "Driver's License",
    severity: 'high',
    regex: /(?<=\b(?:driver'?s?\s*license|dl)\s*:\s*)[A-Z]{1,2}\d{5,8}\b/gi
  },
  {
    key: 'dob',
    label: 'Date of Birth',
    severity: 'high',
    regex: /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12][0-9]|3[01])[\/\-](19|20)\d{2}\b/g
  },
  {
    key: 'mrn',
    label: 'Medical Record Number',
    severity: 'high',
    regex: /(?<=\b(?:mrn|medical\s*record(?:\s*number)?)\b(?:\s*:\s*|\s+))[A-Z0-9\-]{6,20}\b/gi
  },
  {
    key: 'npi',
    label: 'Provider Identifier',
    severity: 'high',
    regex: /(?<=\bnpi\b(?:\s*:\s*|\s+))\d{10}\b/gi
  },
  {
    key: 'insuranceId',
    label: 'Insurance ID',
    severity: 'high',
    regex: /(?<=\b(?:insurance\s*id|member\s*id|policy\s*id)\b(?:\s*:\s*|\s+))[A-Z0-9\-]{6,20}\b/gi
  },
  {
    key: 'groupNumber',
    label: 'Insurance Group',
    severity: 'medium',
    regex: /(?<=\bgroup\b(?:\s*:\s*|\s+))[A-Z0-9\-]{3,12}\b/gi
  },
  {
    key: 'ipAddress',
    label: 'IP Address',
    severity: 'medium',
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    validate: (match) => isLikelyIpv4(match)
  },
  {
    key: 'apiKey',
    label: 'API Key',
    severity: 'critical',
    regex: /\b(api[_-]?key|apikey|api[_-]?secret)[:\s]+[A-Za-z0-9_\-]{20,}\b/gi
  },
  {
    key: 'authToken',
    label: 'Auth Token',
    severity: 'critical',
    regex: /\b(bearer|token|auth)[:\s]+[A-Za-z0-9_\-\.]{20,}\b/gi
  }
];
