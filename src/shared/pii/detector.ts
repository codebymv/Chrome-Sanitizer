import type { DetectedMatch, DetectionPattern, DetectionSummary } from '../types';

export function detectMatches(text: string, patterns: DetectionPattern[]): DetectedMatch[] {
  const matches: DetectedMatch[] = [];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      matches.push({
        key: pattern.key,
        type: pattern.label,
        severity: pattern.severity,
        value: match[0],
        index: match.index,
        length: match[0].length
      });
    }
  }

  return matches;
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
