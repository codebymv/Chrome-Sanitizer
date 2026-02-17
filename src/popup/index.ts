import {
  getHistoryStats,
  getLatestDetection,
  getSessionStats,
  getShieldEnabled,
  setSessionStats,
  setShieldEnabled
} from '../shared/storage';
import { defaultSessionStats } from '../shared/types';
import type { DetectionSummary } from '../shared/types';

function mustGet<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing element: ${id}`);
  }
  return el as T;
}

function updateStatus(statusEl: HTMLElement, enabled: boolean): void {
  if (enabled) {
    statusEl.innerHTML = '<span class="status-dot" aria-hidden="true"></span><span>Protection Active</span>';
    statusEl.className = 'status active';
    return;
  }

  statusEl.innerHTML = '<span class="status-dot" aria-hidden="true"></span><span>Protection Disabled</span>';
  statusEl.className = 'status inactive';
}

function showStatsBreakdown(statsContainer: Element, byType: Record<string, number>): void {
  if (statsContainer.querySelector('.stats-breakdown')) {
    return;
  }

  const breakdownDiv = document.createElement('div');
  breakdownDiv.className = 'stats-breakdown';
  breakdownDiv.innerHTML = '<h4>Detection Breakdown:</h4>';

  const list = document.createElement('ul');
  for (const [type, count] of Object.entries(byType)) {
    const li = document.createElement('li');
    li.textContent = `${type}: ${count}`;
    list.appendChild(li);
  }

  breakdownDiv.appendChild(list);
  statsContainer.appendChild(breakdownDiv);
}

function renderLatestDetection(target: HTMLElement, detected: DetectionSummary[], timestamp: number): void {
  if (detected.length === 0) {
    return;
  }

  const timeSince = Math.floor((Date.now() - timestamp) / 1000);
  const timeText = timeSince < 60
    ? 'just now'
    : timeSince < 3600
      ? `${Math.floor(timeSince / 60)}m ago`
      : `${Math.floor(timeSince / 3600)}h ago`;

  const detectedList = detected
    .map((d) => `<li><span class="severity-badge severity-${d.severity}">${d.severity}</span> ${d.type}: ${d.count}</li>`)
    .join('');

  target.innerHTML = `
      <h4>Latest Detection (${timeText}):</h4>
      <ul class="detection-list">${detectedList}</ul>
    `;
  target.style.display = 'block';
}

function showMonitoredInfo(): void {
  document.body.innerHTML = `
      <div class="container monitored-page">
        <div class="header">
          <button class="back-button" id="backButton">← Back</button>
          <h1>Monitored Information</h1>
          <div class="subtitle">Comprehensive PII detection</div>
        </div>

        <div class="monitored-grid">
          <div class="monitored-item-single">
            <div class="monitored-header-single">
              <h3>Types of PII Detected</h3>
            </div>
            <ul class="pii-list">
              <li><strong>Financial Information</strong> (SSNs, Credit Cards, Bank Accounts)</li>
              <li><strong>Full Names</strong></li>
              <li><strong>Email Addresses</strong></li>
              <li><strong>Phone Numbers</strong></li>
              <li><strong>Street Addresses</strong></li>
              <li><strong>ZIP Codes</strong></li>
              <li><strong>Dates of Birth</strong></li>
              <li><strong>Passport Numbers</strong></li>
              <li><strong>Driver's Licenses</strong></li>
              <li><strong>Medical Record Numbers</strong></li>
              <li><strong>Usernames</strong></li>
              <li><strong>Passwords</strong></li>
              <li><strong>API Keys & Auth Tokens</strong></li>
              <li><strong>IP Addresses</strong></li>
              <li><strong>MAC Addresses</strong></li>
              <li><strong>Device Identifiers</strong></li>
              <li><strong>GPS Coordinates</strong></li>
            </ul>
          </div>
        </div>
        
        <div class="info-note">
          <strong>Note:</strong> The extension monitors for patterns of sensitive information including behavioral data, biometric information, health diagnoses, treatment records, employment details, and court records.
        </div>
      </div>
    `;

  const backButton = mustGet<HTMLButtonElement>('backButton');
  backButton.addEventListener('click', () => {
    location.reload();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const enableToggle = mustGet<HTMLInputElement>('enableToggle');
  const status = mustGet<HTMLElement>('status');
  const redactedCount = mustGet<HTMLElement>('redactedCount');
  const protectedTypes = mustGet<HTMLElement>('protectedTypes');
  const monitoredLink = mustGet<HTMLAnchorElement>('monitoredLink');
  const latestDetectionDiv = mustGet<HTMLElement>('latestDetection');
  const historyCount = mustGet<HTMLElement>('historyCount');
  const historyTypes = mustGet<HTMLElement>('historyTypes');

  const enabled = await getShieldEnabled();
  enableToggle.checked = enabled;
  updateStatus(status, enabled);

  const [sessionStats, historyStats, latestDetection] = await Promise.all([
    getSessionStats(),
    getHistoryStats(),
    getLatestDetection()
  ]);

  redactedCount.textContent = String(sessionStats.totalDetections || 0);
  const typeCount = Object.keys(sessionStats.byType || {}).length;
  protectedTypes.textContent = `${typeCount} type${typeCount !== 1 ? 's' : ''}`;

  historyCount.textContent = String(historyStats.totalDetections || 0);
  const historyTypeCount = Object.keys(historyStats.byType || {}).length;
  historyTypes.textContent = `${historyTypeCount} type${historyTypeCount !== 1 ? 's' : ''}`;

  const statsSection = document.querySelector('.stats');
  if (sessionStats.totalDetections > 0 && statsSection) {
    showStatsBreakdown(statsSection, sessionStats.byType || {});
  }

  if (latestDetection) {
    renderLatestDetection(latestDetectionDiv, latestDetection.detected, latestDetection.timestamp);
  }

  const openSanitizerBtn = mustGet<HTMLButtonElement>('openSanitizerBtn');
  const clearSessionBtn = mustGet<HTMLButtonElement>('clearSessionBtn');

  enableToggle.addEventListener('change', async () => {
    const nextEnabled = enableToggle.checked;
    await setShieldEnabled(nextEnabled);
    updateStatus(status, nextEnabled);
  });

  openSanitizerBtn.addEventListener('click', () => {
    const sanitizerUrl = chrome.runtime.getURL('sanitizer.html');
    void chrome.tabs.create({ url: sanitizerUrl });
  });

  clearSessionBtn.addEventListener('click', async () => {
    await setSessionStats(defaultSessionStats);
    redactedCount.textContent = '0';
    protectedTypes.textContent = '0 types';
    latestDetectionDiv.style.display = 'none';
    latestDetectionDiv.innerHTML = '';

    const breakdown = document.querySelector('.stats-breakdown');
    if (breakdown) {
      breakdown.remove();
    }
  });

  monitoredLink.addEventListener('click', (event) => {
    event.preventDefault();
    showMonitoredInfo();
  });
});
