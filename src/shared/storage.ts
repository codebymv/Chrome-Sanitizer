import {
  defaultHistoryStats,
  defaultSessionStats,
  type HistoryStats,
  type LatestDetection,
  type SessionStats
} from './types';

function asSessionStats(value: unknown): SessionStats {
  if (!value || typeof value !== 'object') {
    return defaultSessionStats;
  }

  const parsed = value as Partial<SessionStats>;
  return {
    totalDetections: typeof parsed.totalDetections === 'number' ? parsed.totalDetections : 0,
    byType: parsed.byType && typeof parsed.byType === 'object' ? parsed.byType : {},
    filesScanned: typeof parsed.filesScanned === 'number' ? parsed.filesScanned : 0
  };
}

function asHistoryStats(value: unknown): HistoryStats {
  if (!value || typeof value !== 'object') {
    return defaultHistoryStats;
  }

  const parsed = value as Partial<HistoryStats>;
  return {
    totalDetections: typeof parsed.totalDetections === 'number' ? parsed.totalDetections : 0,
    byType: parsed.byType && typeof parsed.byType === 'object' ? parsed.byType : {}
  };
}

function asLatestDetection(value: unknown): LatestDetection | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const parsed = value as Partial<LatestDetection>;
  if (!Array.isArray(parsed.detected) || typeof parsed.timestamp !== 'number') {
    return null;
  }

  return {
    detected: parsed.detected,
    timestamp: parsed.timestamp
  };
}

export async function getShieldEnabled(): Promise<boolean> {
  const result = await chrome.storage.sync.get(['shieldEnabled']);
  return result.shieldEnabled !== false;
}

export async function setShieldEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.sync.set({ shieldEnabled: enabled });
}

export async function getSessionStats(): Promise<SessionStats> {
  const result = await chrome.storage.local.get(['sessionStats']);
  return asSessionStats(result.sessionStats);
}

export async function getHistoryStats(): Promise<HistoryStats> {
  const result = await chrome.storage.local.get(['historyStats']);
  return asHistoryStats(result.historyStats);
}

export async function setSessionStats(stats: SessionStats): Promise<void> {
  await chrome.storage.local.set({ sessionStats: stats });
}

export async function setHistoryStats(stats: HistoryStats): Promise<void> {
  await chrome.storage.local.set({ historyStats: stats });
}

export async function getLatestDetection(): Promise<LatestDetection | null> {
  const result = await chrome.storage.local.get(['latestDetection']);
  return asLatestDetection(result.latestDetection);
}
