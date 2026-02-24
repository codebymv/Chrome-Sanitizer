import type { DetectedMatch, DetectionPattern, DetectionSummary } from '../types';

const HEADER_LABELS = new Set([
  'full name',
  'date of birth',
  'ssn',
  'phone',
  'email',
  'name',
  'street address',
  'city',
  'state',
  'zip',
  'zip code',
  'credit card number',
  'expiry',
  'cvv',
  'bank account',
  'medical record',
  'medical record (sample)'
]);

function isHeaderLikeMatch(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return HEADER_LABELS.has(normalized);
}

export function detectMatches(text: string, patterns: DetectionPattern[]): DetectedMatch[] {
  const matches: DetectedMatch[] = [];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const value = match[0];
      if (isHeaderLikeMatch(value)) {
        continue;
      }

      if (pattern.validate && !pattern.validate(value)) {
        continue;
      }

      matches.push({
        key: pattern.key,
        type: pattern.label,
        severity: pattern.severity,
        value,
        index: match.index,
        length: value.length
      });
    }
  }

  const sorted = [...matches].sort((left, right) => {
    if (right.length !== left.length) {
      return right.length - left.length;
    }
    return left.index - right.index;
  });

  const accepted: DetectedMatch[] = [];
  const occupied = new Set<number>();
  const dedupe = new Set<string>();

  for (const item of sorted) {
    const dedupeKey = `${item.key}|${item.index}|${item.value}`;
    if (dedupe.has(dedupeKey)) {
      continue;
    }

    let overlaps = false;
    for (let position = item.index; position < item.index + item.length; position += 1) {
      if (occupied.has(position)) {
        overlaps = true;
        break;
      }
    }

    if (overlaps) {
      continue;
    }

    for (let position = item.index; position < item.index + item.length; position += 1) {
      occupied.add(position);
    }
    dedupe.add(dedupeKey);
    accepted.push(item);
  }

  return accepted.sort((left, right) => left.index - right.index);
}

export function summarizeMatches(matches: DetectedMatch[]): DetectionSummary[] {
  const byType = new Map<string, DetectionSummary>();

  for (const match of matches) {
    const existing = byType.get(match.type);
    if (!existing) {
      byType.set(match.type, {
        type: match.type,
        severity: match.severity,
        count: 1,
        samples: [match.value]
      });
      continue;
    }

    existing.count += 1;
    if (existing.samples.length < 3 && !existing.samples.includes(match.value)) {
      existing.samples.push(match.value);
    }
  }

  return Array.from(byType.values());
}
