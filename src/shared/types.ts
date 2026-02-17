export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface DetectionPattern {
  key: string;
  label: string;
  severity: Severity;
  regex: RegExp;
  validate?: (match: string) => boolean;
}

export interface DetectedMatch {
  key: string;
  type: string;
  severity: Severity;
  value: string;
  index: number;
  length: number;
}

export interface DetectionSummary {
  type: string;
  severity: Severity;
  count: number;
  samples: string[];
}

export interface SessionStats {
  totalDetections: number;
  byType: Record<string, number>;
  filesScanned: number;
}

export interface HistoryStats {
  totalDetections: number;
  byType: Record<string, number>;
}

export interface LatestDetection {
  detected: DetectionSummary[];
  timestamp: number;
}

export interface ShieldStorage {
  shieldEnabled?: boolean;
  sessionStats?: SessionStats;
  historyStats?: HistoryStats;
  latestDetection?: LatestDetection;
}

export const defaultSessionStats: SessionStats = {
  totalDetections: 0,
  byType: {},
  filesScanned: 0
};

export const defaultHistoryStats: HistoryStats = {
  totalDetections: 0,
  byType: {}
};
