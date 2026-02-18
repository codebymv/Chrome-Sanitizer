import {
  defaultHistoryStats,
  defaultSessionStats,
  type DetectionSummary,
  type HistoryStats,
  type SessionStats
} from './types';

export function applyDetectionsToSession(
  current: SessionStats | undefined,
  detections: DetectionSummary[]
): SessionStats {
  const next: SessionStats = {
    totalDetections: current?.totalDetections ?? defaultSessionStats.totalDetections,
    byType: { ...(current?.byType ?? defaultSessionStats.byType) },
    filesScanned: current?.filesScanned ?? defaultSessionStats.filesScanned
  };

  for (const detection of detections) {
    next.totalDetections += detection.count;
    next.byType[detection.type] = (next.byType[detection.type] ?? 0) + detection.count;
  }

  return next;
}

export function applyDetectionsToHistory(
  current: HistoryStats | undefined,
  detections: DetectionSummary[]
): HistoryStats {
  const next: HistoryStats = {
    totalDetections: current?.totalDetections ?? defaultHistoryStats.totalDetections,
    byType: { ...(current?.byType ?? defaultHistoryStats.byType) }
  };

  for (const detection of detections) {
    next.totalDetections += detection.count;
    next.byType[detection.type] = (next.byType[detection.type] ?? 0) + detection.count;
  }

  return next;
}
