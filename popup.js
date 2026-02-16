"use strict";
(() => {
  // src/shared/types.ts
  var defaultSessionStats = {
    totalDetections: 0,
    byType: {},
    filesScanned: 0
  };
  var defaultHistoryStats = {
    totalDetections: 0,
    byType: {}
  };

  // src/shared/storage.ts
  function asSessionStats(value) {
    if (!value || typeof value !== "object") {
      return defaultSessionStats;
    }
    const parsed = value;
    return {
      totalDetections: typeof parsed.totalDetections === "number" ? parsed.totalDetections : 0,
      byType: parsed.byType && typeof parsed.byType === "object" ? parsed.byType : {},
      filesScanned: typeof parsed.filesScanned === "number" ? parsed.filesScanned : 0
    };
  }
  function asHistoryStats(value) {
    if (!value || typeof value !== "object") {
      return defaultHistoryStats;
    }
    const parsed = value;
    return {
      totalDetections: typeof parsed.totalDetections === "number" ? parsed.totalDetections : 0,
      byType: parsed.byType && typeof parsed.byType === "object" ? parsed.byType : {}
    };
  }
  function asLatestDetection(value) {
    if (!value || typeof value !== "object") {
      return null;
    }
    const parsed = value;
    if (!Array.isArray(parsed.detected) || typeof parsed.timestamp !== "number") {
      return null;
    }
    return {
      detected: parsed.detected,
      timestamp: parsed.timestamp
    };
  }
  async function getShieldEnabled() {
    const result = await chrome.storage.sync.get(["shieldEnabled"]);
    return result.shieldEnabled !== false;
  }
  async function setShieldEnabled(enabled) {
    await chrome.storage.sync.set({ shieldEnabled: enabled });
  }
  async function getSessionStats() {
    const result = await chrome.storage.local.get(["sessionStats"]);
    return asSessionStats(result.sessionStats);
  }
  async function getHistoryStats() {
    const result = await chrome.storage.local.get(["historyStats"]);
    return asHistoryStats(result.historyStats);
  }
  async function getLatestDetection() {
    const result = await chrome.storage.local.get(["latestDetection"]);
    return asLatestDetection(result.latestDetection);
  }

  // src/popup/index.ts
  function mustGet(id) {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error(`Missing element: ${id}`);
    }
    return el;
  }
  function updateStatus(statusEl, enabled) {
    if (enabled) {
      statusEl.textContent = "\u{1F6E1}\uFE0F Protection Active";
      statusEl.className = "status active";
      return;
    }
    statusEl.textContent = "\u26A0\uFE0F Protection Disabled";
    statusEl.className = "status inactive";
  }
  function showStatsBreakdown(statsContainer, byType) {
    if (statsContainer.querySelector(".stats-breakdown")) {
      return;
    }
    const breakdownDiv = document.createElement("div");
    breakdownDiv.className = "stats-breakdown";
    breakdownDiv.innerHTML = "<h4>Detection Breakdown:</h4>";
    const list = document.createElement("ul");
    for (const [type, count] of Object.entries(byType)) {
      const li = document.createElement("li");
      li.textContent = `${type}: ${count}`;
      list.appendChild(li);
    }
    breakdownDiv.appendChild(list);
    statsContainer.appendChild(breakdownDiv);
  }
  function renderLatestDetection(target, detected, timestamp) {
    if (detected.length === 0) {
      return;
    }
    const timeSince = Math.floor((Date.now() - timestamp) / 1e3);
    const timeText = timeSince < 60 ? "just now" : timeSince < 3600 ? `${Math.floor(timeSince / 60)}m ago` : `${Math.floor(timeSince / 3600)}h ago`;
    const detectedList = detected.map((d) => `<li><span class="severity-badge severity-${d.severity}">${d.severity}</span> ${d.type}: ${d.count}</li>`).join("");
    target.innerHTML = `
      <h4>Latest Detection (${timeText}):</h4>
      <ul class="detection-list">${detectedList}</ul>
    `;
    target.style.display = "block";
  }
  function showMonitoredInfo() {
    document.body.innerHTML = `
      <div class="container monitored-page">
        <div class="header">
          <button class="back-button" id="backButton">\u2190 Back</button>
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
    const backButton = mustGet("backButton");
    backButton.addEventListener("click", () => {
      location.reload();
    });
  }
  document.addEventListener("DOMContentLoaded", async () => {
    const enableToggle = mustGet("enableToggle");
    const status = mustGet("status");
    const redactedCount = mustGet("redactedCount");
    const protectedTypes = mustGet("protectedTypes");
    const monitoredLink = mustGet("monitoredLink");
    const latestDetectionDiv = mustGet("latestDetection");
    const historyCount = mustGet("historyCount");
    const historyTypes = mustGet("historyTypes");
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
    protectedTypes.textContent = `${typeCount} type${typeCount !== 1 ? "s" : ""}`;
    historyCount.textContent = String(historyStats.totalDetections || 0);
    const historyTypeCount = Object.keys(historyStats.byType || {}).length;
    historyTypes.textContent = `${historyTypeCount} type${historyTypeCount !== 1 ? "s" : ""}`;
    const statsSection = document.querySelector(".stats");
    if (sessionStats.totalDetections > 0 && statsSection) {
      showStatsBreakdown(statsSection, sessionStats.byType || {});
    }
    if (latestDetection) {
      renderLatestDetection(latestDetectionDiv, latestDetection.detected, latestDetection.timestamp);
    }
    enableToggle.addEventListener("change", async () => {
      const nextEnabled = enableToggle.checked;
      await setShieldEnabled(nextEnabled);
      updateStatus(status, nextEnabled);
    });
    monitoredLink.addEventListener("click", (event) => {
      event.preventDefault();
      showMonitoredInfo();
    });
  });
})();
