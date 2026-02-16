import type { DetectionPattern } from '../types';

export const PII_PATTERNS: DetectionPattern[] = [
  {
    key: 'financial',
    label: 'Financial',
    severity: 'critical',
    regex: /\b(?:(?:\d{3}-\d{2}-\d{4})|(?:\d{9})|(?:\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}))\b/g
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
    regex: /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g
  },
  {
    key: 'streetAddress',
    label: 'Street Address',
    severity: 'high',
    regex: /\b\d+\s+[A-Za-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir|Way|Place|Pl)\b/gi
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
    regex: /\b[A-Z]{1,2}\d{6,9}\b/g
  },
  {
    key: 'driversLicense',
    label: "Driver's License",
    severity: 'high',
    regex: /\b[A-Z]{1,2}\d{5,8}\b/g
  },
  {
    key: 'dob',
    label: 'Date of Birth',
    severity: 'high',
    regex: /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12][0-9]|3[01])[\/\-](19|20)\d{2}\b/g
  },
  {
    key: 'ipAddress',
    label: 'IP Address',
    severity: 'medium',
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
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
