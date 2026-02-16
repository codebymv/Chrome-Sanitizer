// Popup JavaScript for AI Privacy Shield

document.addEventListener('DOMContentLoaded', function() {
  const enableToggle = document.getElementById('enableToggle');
  const status = document.getElementById('status');
  const redactedCount = document.getElementById('redactedCount');
  const protectedTypes = document.getElementById('protectedTypes');
  const monitoredLink = document.getElementById('monitoredLink');
  const latestDetectionDiv = document.getElementById('latestDetection');

  // Load current state
  chrome.storage.sync.get(['shieldEnabled'], function(result) {
    const enabled = result.shieldEnabled !== false;
    enableToggle.checked = enabled;
    updateStatus(enabled);
  });

  // Load session stats (page-specific)
  chrome.storage.local.get(['sessionStats', 'historyStats'], function(result) {
    const stats = result.sessionStats || { totalDetections: 0, byType: {}, filesScanned: 0 };
    redactedCount.textContent = stats.totalDetections || 0;
    
    const typeCount = Object.keys(stats.byType || {}).length;
    protectedTypes.textContent = `${typeCount} type${typeCount !== 1 ? 's' : ''}`;
    
    // Load all-time history stats
    const history = result.historyStats || { totalDetections: 0, byType: {} };
    document.getElementById('historyCount').textContent = history.totalDetections || 0;
    
    const historyTypeCount = Object.keys(history.byType || {}).length;
    document.getElementById('historyTypes').textContent = `${historyTypeCount} type${historyTypeCount !== 1 ? 's' : ''}`;
    
    // Show breakdown if there are detections
    if (stats.totalDetections > 0) {
      showStatsBreakdown(stats);
    }
  });

  // Load and display latest detection
  chrome.storage.local.get(['latestDetection'], function(result) {
    if (result.latestDetection) {
      showLatestDetection(result.latestDetection);
    }
  });

  // Handle toggle change
  enableToggle.addEventListener('change', function() {
    const enabled = this.checked;
    chrome.storage.sync.set({ shieldEnabled: enabled });
    updateStatus(enabled);
  });

  // Handle monitored info link click
  monitoredLink.addEventListener('click', function(e) {
    e.preventDefault();
    showMonitoredInfo();
  });

  function updateStatus(enabled) {
    if (enabled) {
      status.textContent = '🛡️ Protection Active';
      status.className = 'status active';
    } else {
      status.textContent = '⚠️ Protection Disabled';
      status.className = 'status inactive';
    }
  }

  function showStatsBreakdown(stats) {
    const breakdownDiv = document.createElement('div');
    breakdownDiv.className = 'stats-breakdown';
    breakdownDiv.innerHTML = '<h4>Detection Breakdown:</h4>';
    
    const list = document.createElement('ul');
    for (const [type, count] of Object.entries(stats.byType || {})) {
      const li = document.createElement('li');
      li.textContent = `${type}: ${count}`;
      list.appendChild(li);
    }
    
    breakdownDiv.appendChild(list);
    
    const statsSection = document.querySelector('.stats');
    if (statsSection && !statsSection.querySelector('.stats-breakdown')) {
      statsSection.appendChild(breakdownDiv);
    }
  }

  function showLatestDetection(detectionData) {
    if (!detectionData.detected || detectionData.detected.length === 0) return;

    const timeSince = Math.floor((Date.now() - detectionData.timestamp) / 1000);
    const timeText = timeSince < 60 ? 'just now' : 
                     timeSince < 3600 ? `${Math.floor(timeSince / 60)}m ago` :
                     `${Math.floor(timeSince / 3600)}h ago`;

    const detectedList = detectionData.detected.map(d => {
      const badge = `<span class="severity-badge severity-${d.severity}">${d.severity}</span>`;
      return `<li>${badge} ${d.type}: ${d.count}</li>`;
    }).join('');

    latestDetectionDiv.innerHTML = `
      <h4>Latest Detection (${timeText}):</h4>
      <ul class="detection-list">${detectedList}</ul>
    `;
    latestDetectionDiv.style.display = 'block';
  }

  function showMonitoredInfo() {
    // Replace current content with monitored info page
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

    // Add back button handler
    document.getElementById('backButton').addEventListener('click', function() {
      location.reload();
    });
  }
});
