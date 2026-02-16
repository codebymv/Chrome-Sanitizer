// AI Privacy Shield - Content Script
// Detects and notifies about PII in AI chat interfaces and file uploads

class PrivacyShield {
  constructor() {
    this.enabled = true;
    this.detectionPatterns = {
      // Names (2-4 words, 5-50 total chars)
      fullName: {
        regex: /\b[A-Z][a-z]+\s+(?:[A-Z][a-z]+\s+)?[A-Z][a-z]+\b/g,
        label: 'Full Name',
        severity: 'high',
        minLength: 5,
        maxLength: 50,
        validate: (match) => {
          const len = match.length;
          const parts = match.split(/\s+/);
          return len >= 5 && len <= 50 && parts.length >= 2 && parts[0] !== parts[1];
        }
      },
      // Contact Information
      email: {
        regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        label: 'Email Address',
        severity: 'high',
        minLength: 6,
        maxLength: 254,
        validate: (match) => {
          return match.length >= 6 && match.length <= 254;
        }
      },
      phone: {
        regex: /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
        label: 'Phone Number',
        severity: 'high',
        exactDigits: [10, 11], // Must be exactly 10 or 11 digits
        validate: (match) => {
          const digits = match.replace(/\D/g, '');
          return digits.length === 10 || digits.length === 11;
        }
      },
      // Address Components
      streetAddress: {
        regex: /\b\d+\s+[A-Za-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir|Way|Place|Pl)\b/gi,
        label: 'Street Address',
        severity: 'high',
        minLength: 8,
        maxLength: 100,
        validate: (match) => {
          return match.length >= 8 && match.length <= 100;
        }
      },
      zipCode: {
        regex: /\b\d{5}(-\d{4})?\b/g,
        label: 'ZIP Code',
        severity: 'medium',
        exactLength: [5, 10], // Exactly 5 or 10 chars (with dash)
        validate: (match) => {
          if (match.length !== 5 && match.length !== 10) return false;
          const zip = match.split('-')[0];
          const num = parseInt(zip);
          return num >= 501 && num <= 99950 && zip.length === 5;
        }
      },
      // Financial (consolidated) - SSN with/without dashes, Credit Cards
      financial: {
        regex: /\b(?:(?:\d{3}-\d{2}-\d{4})|(?:\d{9})|(?:\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}))\b/g,
        label: 'Financial',
        severity: 'critical',
        validate: (match) => {
          const digits = match.replace(/\D/g, '');
          const fullLen = match.length;
          
          // SSN: exactly 11 chars with dashes (###-##-####) OR exactly 9 digits
          if (fullLen === 11 && /^\d{3}-\d{2}-\d{4}$/.test(match) && digits.length === 9) {
            return true;
          }
          if (fullLen === 9 && /^\d{9}$/.test(match)) {
            return true;
          }
          
          // Credit card: 13-19 chars total, 13-16 digits
          if (digits.length >= 13 && digits.length <= 16 && fullLen >= 13 && fullLen <= 19) {
            return true;
          }
          
          return false;
        }
      },
      // Government IDs
      passport: {
        regex: /\b[A-Z]{1,2}\d{6,9}\b/g,
        label: 'Passport Number',
        severity: 'critical',
        minLength: 7,
        maxLength: 11,
        validate: (match) => {
          return match.length >= 7 && match.length <= 11;
        }
      },
      driversLicense: {
        regex: /\b[A-Z]{1,2}\d{5,8}\b/g,
        label: 'Driver\'s License',
        severity: 'high',
        minLength: 6,
        maxLength: 10,
        validate: (match) => {
          return match.length >= 6 && match.length <= 10;
        }
      },
      // Medical
      medicalRecordNumber: {
        regex: /\b(MRN|Medical Record|Patient ID)[:\s#]*[A-Z0-9]{6,12}\b/gi,
        label: 'Medical Record Number',
        severity: 'critical',
        minLength: 10,
        maxLength: 30
      },
      // Personal Details - Date formats: exactly 8-10 chars
      dob: {
        regex: /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12][0-9]|3[01])[\/\-](19|20)\d{2}\b/g,
        label: 'Date of Birth',
        severity: 'high',
        minLength: 8,
        maxLength: 10,
        validate: (match) => {
          return match.length >= 8 && match.length <= 10;
        }
      },
      // Credentials
      username: {
        regex: /\b(username|user|login)[:\s]+[a-z0-9_-]{3,20}\b/gi,
        label: 'Username',
        severity: 'high',
        minLength: 12,
        maxLength: 35
      },
      password: {
        regex: /\b(password|pwd|pass)[:\s]+\S{6,}\b/gi,
        label: 'Password',
        severity: 'critical',
        minLength: 15,
        maxLength: 100
      },
      apiKey: {
        regex: /\b(api[_-]?key|apikey|api[_-]?secret)[:\s]+[A-Za-z0-9_\-]{20,}\b/gi,
        label: 'API Key',
        severity: 'critical',
        minLength: 28,
        maxLength: 100
      },
      authToken: {
        regex: /\b(bearer|token|auth)[:\s]+[A-Za-z0-9_\-\.]{20,}\b/gi,
        label: 'Auth Token',
        severity: 'critical',
        minLength: 26,
        maxLength: 500
      },
      // Technical Identifiers
      ipAddress: {
        regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
        label: 'IP Address',
        severity: 'medium',
        minLength: 7,
        maxLength: 15,
        validate: (match) => {
          if (match.length < 7 || match.length > 15) return false;
          const parts = match.split('.');
          return parts.every(part => parseInt(part) <= 255);
        }
      },
      macAddress: {
        regex: /\b([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})\b/g,
        label: 'MAC Address',
        severity: 'high',
        exactLength: [17], // Exactly 17 chars (XX:XX:XX:XX:XX:XX)
        validate: (match) => {
          return match.length === 17;
        }
      },
      deviceId: {
        regex: /\b(IMEI|Device ID|UUID)[:\s]+[A-Z0-9\-]{8,}\b/gi,
        label: 'Device Identifier',
        severity: 'high',
        minLength: 14,
        maxLength: 50
      },
      // Geolocation
      coordinates: {
        regex: /\b[-+]?\d{1,2}\.\d+,\s*[-+]?\d{1,3}\.\d+\b/g,
        label: 'GPS Coordinates',
        severity: 'medium',
        minLength: 10,
        maxLength: 50
      }
    };
    
    this.sessionStats = {
      totalDetections: 0,
      byType: {},
      filesScanned: 0
    };
    
    this.init();
  }

  init() {
    // Create persistent shield badge FIRST (always visible on all pages)
    this.createPersistentShield();
    
    // Load settings
    chrome.storage.sync.get(['shieldEnabled'], (result) => {
      this.enabled = result.shieldEnabled !== false;
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.shieldEnabled) {
        this.enabled = changes.shieldEnabled.newValue;
      }
    });

    // Attach listeners to input fields and file uploads
    this.attachListeners();
  }

  createPersistentShield() {
    // Wait for body to be ready
    const createShield = () => {
      if (document.getElementById('privacy-shield-persistent')) {
        return; // Already created
      }
      
      const shield = document.createElement('div');
      shield.id = 'privacy-shield-persistent';
      shield.className = 'privacy-shield-persistent blue';
      shield.innerHTML = `
        <div class="shield-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" fill="currentColor" stroke="currentColor" stroke-width="2"/>
            <path class="shield-check" d="M9 12l2 2 4-4" stroke="white" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
      `;
      
      // Create wrench as separate element (not child of shield)
      const wrench = document.createElement('div');
      wrench.id = 'shield-wrench-btn';
      wrench.className = 'shield-wrench';
      wrench.title = 'Open File Sanitizer';
      wrench.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" fill="currentColor"/>
        </svg>
      `;
      
      document.body.appendChild(shield);
      document.body.appendChild(wrench);

      // Load saved position or use default (50%)
      chrome.storage.local.get(['shieldPosition'], (result) => {
        const position = result.shieldPosition || 50; // default to 50% (middle)
        this.setShieldPosition(position);
      });

      // Make shield draggable (vertical only)
      this.makeDraggable(shield, wrench);

      // Wrench click handler - open sanitizer tool (high priority)
      wrench.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openSanitizerTool();
      });
      
      wrench.addEventListener('mousedown', (e) => {
        e.stopPropagation(); // Prevent drag from starting on wrench
      });

      // Click handler to show alerts (shield body only)
      const shieldIcon = shield.querySelector('.shield-icon');
      shieldIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        // Don't open panel if we just finished dragging
        if (!this.isDragging) {
          this.toggleShieldPanel();
        }
      });

      this.shieldElement = shield;
      this.wrenchElement = wrench;
      this.shieldState = 'blue'; // blue, green, red
      this.detectionHistory = [];
      this.isDragging = false;
    };

    // Create immediately if body exists, otherwise wait
    if (document.body) {
      createShield();
    } else {
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createShield);
      } else {
        // DOM already loaded but body not ready yet
        setTimeout(createShield, 100);
      }
    }
  }

  openSanitizerTool() {
    // Open sanitizer.html in a new tab
    const sanitizerUrl = chrome.runtime.getURL('sanitizer.html');
    window.open(sanitizerUrl, '_blank');
  }

  makeDraggable(element, wrenchElement) {
    let startY = 0;
    let startTop = 0;
    let isDragging = false;

    const onMouseDown = (e) => {
      isDragging = true;
      this.isDragging = false; // Will be set to true if actually dragged
      startY = e.clientY;
      const currentTop = element.style.top ? parseFloat(element.style.top) : 50;
      startTop = currentTop;
      
      element.style.cursor = 'grabbing';
      element.style.transition = 'none';
      if (wrenchElement) {
        wrenchElement.style.transition = 'none';
      }
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      
      this.isDragging = true; // We're actually dragging
      
      const deltaY = e.clientY - startY;
      const viewportHeight = window.innerHeight;
      const deltaPercent = (deltaY / viewportHeight) * 100;
      
      let newTop = startTop + deltaPercent;
      
      // Constrain to viewport (5% from top/bottom)
      newTop = Math.max(5, Math.min(95, newTop));
      
      this.setShieldPosition(newTop);
    };

    const onMouseUp = () => {
      if (isDragging) {
        const finalPosition = parseFloat(element.style.top) || 50;
        
        // Save position to storage
        chrome.storage.local.set({ shieldPosition: finalPosition });
        
        element.style.cursor = 'grab';
        element.style.transition = 'all 0.3s ease';
        if (wrenchElement) {
          wrenchElement.style.transition = 'all 0.2s ease';
        }
        
        // Reset dragging flag after a brief delay to prevent click from firing
        setTimeout(() => {
          this.isDragging = false;
        }, 100);
      }
      
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    element.addEventListener('mousedown', onMouseDown);
    element.style.cursor = 'grab';
  }

  setShieldPosition(topPercent) {
    if (this.shieldElement) {
      this.shieldElement.style.top = `${topPercent}%`;
      this.shieldElement.style.transform = 'translateY(-50%)';
    }
    if (this.wrenchElement) {
      this.wrenchElement.style.top = `${topPercent}%`;
      this.wrenchElement.style.transform = 'translate(-50%, -50%)';
    }
  }

  updateShieldState(hasInput, hasPII) {
    if (!this.shieldElement) return;

    // Remove all state classes
    this.shieldElement.classList.remove('blue', 'green', 'red');

    if (hasPII) {
      this.shieldElement.classList.add('red');
      this.shieldState = 'red';
    } else if (hasInput) {
      this.shieldElement.classList.add('green');
      this.shieldState = 'green';
    } else {
      this.shieldElement.classList.add('blue');
      this.shieldState = 'blue';
    }
  }

  toggleShieldPanel() {
    let panel = document.getElementById('privacy-shield-panel');
    
    if (panel) {
      panel.remove();
      return;
    }

    panel = document.createElement('div');
    panel.id = 'privacy-shield-panel';
    panel.className = 'privacy-shield-panel';
    
    const content = this.detectionHistory.length > 0 
      ? this.buildDetectionPanel()
      : this.buildNoDetectionPanel();

    panel.innerHTML = content;
    document.body.appendChild(panel);

    // Click outside to close - immediate setup with capture
    setTimeout(() => {
      const closeOnClickOutside = (e) => {
        // Check if click is outside both panel and shield
        if (!panel.contains(e.target) && 
            !this.shieldElement.contains(e.target)) {
          panel.remove();
          document.removeEventListener('click', closeOnClickOutside, true);
        }
      };
      
      // Use capture phase to ensure we catch all clicks
      document.addEventListener('click', closeOnClickOutside, true);
    }, 10);

    // Clear all button handler
    const clearAllBtn = panel.querySelector('.clear-all');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearAllDetections();
        panel.remove();
      });
    }

    // Individual clear button handlers
    const clearBtns = panel.querySelectorAll('.clear-single');
    clearBtns.forEach((btn, index) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearDetection(index);
        // Rebuild panel
        panel.remove();
        this.toggleShieldPanel();
      });
    });
  }

  clearAllDetections() {
    this.detectionHistory = [];
    // Reset shield to green state (assume clean input)
    this.updateShieldState(true, false);
    this.updateStats([]);
  }

  clearDetection(index) {
    // Remove specific detection from history (reversed order)
    const actualIndex = this.detectionHistory.length - 1 - index;
    this.detectionHistory.splice(actualIndex, 1);
    
    // If no more detections, reset shield to green
    if (this.detectionHistory.length === 0) {
      this.updateShieldState(true, false);
    }
  }

  buildDetectionPanel() {
    const detectionList = this.detectionHistory.map((detection, index) => {
      const items = detection.detected.map(d => {
        const badge = `<span class="severity-badge severity-${d.severity}">${d.severity.toUpperCase()}</span>`;
        const sample = d.samples ? `<code>${d.samples[0]}</code>` : '';
        return `<li>${badge} <strong>${d.type}</strong>: ${d.count} ${sample}</li>`;
      }).join('');
      
      const timeSince = Math.floor((Date.now() - detection.timestamp) / 1000);
      const timeText = timeSince < 60 ? 'just now' : 
                       timeSince < 3600 ? `${Math.floor(timeSince / 60)}m ago` :
                       `${Math.floor(timeSince / 3600)}h ago`;

      return `
        <div class="detection-entry">
          <div class="detection-header">
            <div class="detection-time">${timeText}</div>
            <button class="clear-single" data-index="${index}">Clear</button>
          </div>
          <ul class="detection-items">${items}</ul>
        </div>
      `;
    }).reverse().join('');

    return `
      <div class="panel-header has-detections">
        <h3>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" fill="white" stroke="white" stroke-width="2"/>
          </svg>
          PII Detections
        </h3>
        <button class="clear-all">Clear All</button>
      </div>
      <div class="panel-content">
        ${detectionList}
      </div>
    `;
  }

  buildNoDetectionPanel() {
    return `
      <div class="panel-header">
        <h3>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" fill="white" stroke="white" stroke-width="2"/>
            <path d="M9 12l2 2 4-4" stroke="#10b981" stroke-width="2" stroke-linecap="round"/>
          </svg>
          AI Input Sanitization
        </h3>
      </div>
      <div class="panel-content no-detections">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" fill="#10b981" stroke="#10b981" stroke-width="2"/>
          <path d="M9 12l2 2 4-4" stroke="white" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <p>No Sensitive Information Detected</p>
        <small>Shield is active and monitoring</small>
      </div>
    `;
  }

  attachListeners() {
    // Find all text input areas and content editable elements
    const observeDOM = () => {
      const textAreas = document.querySelectorAll('textarea, [contenteditable="true"]');
      const fileInputs = document.querySelectorAll('input[type="file"]');
      
      textAreas.forEach(element => {
        if (!element.dataset.privacyShieldAttached) {
          element.dataset.privacyShieldAttached = 'true';
          
          // Add paste event listener
          element.addEventListener('paste', (e) => this.handlePaste(e));
          
          // Add input event listener for real-time detection
          element.addEventListener('input', (e) => this.handleInput(e));
          
          // Monitor before submission (send button clicks)
          element.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Enter' && e.ctrlKey)) {
              this.handlePreSubmit(element);
            }
          });
        }
      });

      // Monitor file uploads
      fileInputs.forEach(input => {
        if (!input.dataset.privacyShieldAttached) {
          input.dataset.privacyShieldAttached = 'true';
          input.addEventListener('change', (e) => this.handleFileUpload(e));
        }
      });

      // Also watch for drag-and-drop file uploads
      const dropZones = document.querySelectorAll('[data-testid*="file"], [class*="drop"], [class*="upload"]');
      dropZones.forEach(zone => {
        if (!zone.dataset.privacyShieldDropAttached) {
          zone.dataset.privacyShieldDropAttached = 'true';
          zone.addEventListener('drop', (e) => this.handleFileDrop(e));
        }
      });
    };

    // Initial observation
    observeDOM();

    // Watch for dynamically added elements
    const observer = new MutationObserver(observeDOM);
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Monitor submit buttons
    this.monitorSubmitButtons();
  }

  monitorSubmitButtons() {
    document.addEventListener('click', (e) => {
      const target = e.target;
      // Check if clicked element is likely a submit button
      if (target.matches('button[type="submit"], button[aria-label*="Send"], button[data-testid*="send"]') ||
          target.closest('button[type="submit"], button[aria-label*="Send"], button[data-testid*="send"]')) {
        
        // Find the nearest textarea or contenteditable
        const form = target.closest('form') || document;
        const input = form.querySelector('textarea, [contenteditable="true"]');
        
        if (input) {
          this.handlePreSubmit(input);
        }
      }
    }, true);
  }

  handlePaste(event) {
    if (!this.enabled) return;

    const pastedText = event.clipboardData.getData('text');
    const detected = this.detectPII(pastedText);

    if (detected.length > 0) {
      this.showPIIAlert(detected, 'paste');
      this.updateStats(detected);
    }
  }

  handleInput(event) {
    if (!this.enabled) return;

    const text = event.target.value || event.target.textContent;
    const hasInput = text && text.trim().length > 0;
    const detected = this.detectPII(text);
    const hasPII = detected.length > 0;

    // Update shield state
    this.updateShieldState(hasInput, hasPII);

    if (hasPII) {
      // Add to history
      this.addToHistory(detected);
    }
  }

  handlePreSubmit(element) {
    if (!this.enabled) return;

    const text = element.value || element.textContent;
    const detected = this.detectPII(text);

    if (detected.length > 0) {
      this.showPIIAlert(detected, 'submit');
      this.updateStats(detected);
    }
  }

  async handleFileUpload(event) {
    if (!this.enabled) return;

    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      await this.scanFile(file);
    }
  }

  async handleFileDrop(event) {
    if (!this.enabled) return;

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      await this.scanFile(file);
    }
  }

  async scanFile(file) {
    this.sessionStats.filesScanned++;

    // Only scan text-based files
    const textTypes = ['text/', 'application/json', 'application/xml', '.txt', '.csv', '.md', '.doc', '.docx'];
    const isTextFile = textTypes.some(type => 
      file.type.includes(type) || file.name.toLowerCase().endsWith(type.replace('application/', '.'))
    );

    if (!isTextFile) {
      // Show notification for non-text files
      this.showNotification(`File uploaded: ${file.name} (binary file - not scanned)`, 'info');
      return;
    }

    try {
      const text = await this.readFileAsText(file);
      const detected = this.detectPII(text);

      if (detected.length > 0) {
        this.showPIIAlert(detected, 'file', file.name);
        this.updateStats(detected);
      } else {
        this.showNotification(`File scanned: ${file.name} - No PII detected ✓`, 'success');
      }
    } catch (error) {
      console.error('Error scanning file:', error);
      this.showNotification(`Could not scan file: ${file.name}`, 'error');
    }
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  }

  detectPII(text) {
    const detected = [];
    const seenMatches = new Set();
    const matchedPositions = new Set(); // Track character positions already matched

    // First pass: detect all matches with their positions
    const allMatches = [];
    for (const [type, pattern] of Object.entries(this.detectionPatterns)) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;
      while ((match = regex.exec(text)) !== null) {
        allMatches.push({
          type: type,
          pattern: pattern,
          match: match[0],
          index: match.index,
          endIndex: match.index + match[0].length
        });
      }
    }

    // Sort by length (longest first) to prioritize longer matches
    allMatches.sort((a, b) => b.match.length - a.match.length);

    // Second pass: validate and filter matches
    for (const item of allMatches) {
      const { type, pattern, match, index, endIndex } = item;
      
      // Skip if this position is already covered by a longer match
      let isOverlapping = false;
      for (let i = index; i < endIndex; i++) {
        if (matchedPositions.has(i)) {
          isOverlapping = true;
          break;
        }
      }
      if (isOverlapping) continue;

      // Skip if already seen
      if (seenMatches.has(match)) continue;

      // Check if this match is part of a longer number/string
      const beforeChar = text[index - 1];
      const afterChar = text[endIndex];
      
      // If surrounded by digits or word chars, it's part of a longer string
      if ((beforeChar && /[\d\w]/.test(beforeChar)) || (afterChar && /[\d\w]/.test(afterChar))) {
        // Exception: allow word boundaries for patterns that explicitly need them
        if (pattern.regex.source.includes('\\b')) {
          // Word boundary patterns should still validate
        } else {
          continue;
        }
      }

      const len = match.length;
      
      // Check exact length requirements
      if (pattern.exactLength && !pattern.exactLength.includes(len)) {
        continue;
      }
      
      // Check min/max length requirements
      if (pattern.minLength && len < pattern.minLength) {
        continue;
      }
      if (pattern.maxLength && len > pattern.maxLength) {
        continue;
      }
      
      // Apply custom validation function if exists
      if (pattern.validate && !pattern.validate(match)) {
        continue;
      }

      // Mark these positions as matched
      for (let i = index; i < endIndex; i++) {
        matchedPositions.add(i);
      }

      seenMatches.add(match);
      
      // Add to detected for this pattern type
      let existingEntry = detected.find(d => d.type === pattern.label);
      if (!existingEntry) {
        existingEntry = {
          type: pattern.label,
          count: 0,
          severity: pattern.severity,
          samples: []
        };
        detected.push(existingEntry);
      }
      existingEntry.count++;
      if (existingEntry.samples.length < 3) {
        existingEntry.samples.push(match);
      }
    }

    return detected;
  }


  addToHistory(detected) {
    const newDetection = {
      detected: detected,
      timestamp: Date.now()
    };
    
    // Only add if it's different from the last detection
    const lastDetection = this.detectionHistory[this.detectionHistory.length - 1];
    if (!lastDetection || JSON.stringify(lastDetection.detected) !== JSON.stringify(detected)) {
      this.detectionHistory.push(newDetection);
      
      // Keep only last 10 detections
      if (this.detectionHistory.length > 10) {
        this.detectionHistory.shift();
      }
      
      // Update stats
      this.updateStats(detected);
    }
  }

  showPIIAlert(detected, context, fileName = null) {
    const alert = document.createElement('div');
    alert.className = 'privacy-shield-alert';
    
    // Determine severity
    const hasCritical = detected.some(d => d.severity === 'critical');
    const hasHigh = detected.some(d => d.severity === 'high');
    const severity = hasCritical ? 'critical' : hasHigh ? 'high' : 'medium';
    
    const contextText = context === 'file' 
      ? `in file: <strong>${fileName}</strong>` 
      : context === 'paste'
      ? 'in pasted content'
      : 'in your message';

    const detectedList = detected.map(d => {
      const severityBadge = `<span class="severity-badge severity-${d.severity}">${d.severity.toUpperCase()}</span>`;
      const sampleText = d.samples ? `<br><code>${d.samples[0]}</code>` : '';
      return `<li>${severityBadge} <strong>${d.type}</strong>: ${d.count} instance(s)${sampleText}</li>`;
    }).join('');

    alert.innerHTML = `
      <div class="privacy-shield-alert-content" data-severity="${severity}">
        <div class="privacy-shield-alert-header">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" fill="${severity === 'critical' ? '#ef4444' : '#f59e0b'}" stroke="${severity === 'critical' ? '#ef4444' : '#f59e0b'}" stroke-width="2"/>
            <text x="12" y="16" text-anchor="middle" fill="white" font-size="14" font-weight="bold">!</text>
          </svg>
          <h3>Personally Identifiable Information Detected</h3>
        </div>
        <p>PII found ${contextText}:</p>
        <ul class="pii-list">${detectedList}</ul>
        <div class="alert-actions">
          <p class="warning-text">⚠️ <strong>Warning:</strong> Sharing this information may compromise your privacy or security.</p>
          <button class="privacy-shield-close">I Understand</button>
        </div>
      </div>
    `;

    document.body.appendChild(alert);

    alert.querySelector('.privacy-shield-close').addEventListener('click', () => {
      alert.remove();
    });

    // Auto-dismiss after 12 seconds for non-critical alerts
    if (severity !== 'critical') {
      setTimeout(() => {
        if (alert.parentElement) {
          alert.remove();
        }
      }, 12000);
    }
  }

  updateStats(detected) {
    // Update session stats (page-specific, resets on navigation)
    if (!this.sessionStats) {
      this.sessionStats = { totalDetections: 0, byType: {}, filesScanned: 0 };
    }
    
    this.sessionStats.totalDetections += detected.reduce((sum, d) => sum + d.count, 0);
    
    detected.forEach(d => {
      if (!this.sessionStats.byType[d.type]) {
        this.sessionStats.byType[d.type] = 0;
      }
      this.sessionStats.byType[d.type] += d.count;
    });

    // Update session stats in storage
    chrome.storage.local.set({ sessionStats: this.sessionStats });
    
    // Update all-time history (persistent across sessions)
    chrome.storage.local.get(['historyStats'], (result) => {
      const history = result.historyStats || { totalDetections: 0, byType: {} };
      
      history.totalDetections += detected.reduce((sum, d) => sum + d.count, 0);
      
      detected.forEach(d => {
        if (!history.byType[d.type]) {
          history.byType[d.type] = 0;
        }
        history.byType[d.type] += d.count;
      });
      
      chrome.storage.local.set({ historyStats: history });
    });
  }

}

// Reset session stats on page load (page-specific)
chrome.storage.local.set({ 
  sessionStats: { 
    totalDetections: 0, 
    byType: {}, 
    filesScanned: 0 
  } 
});

// Initialize the Privacy Shield
const shield = new PrivacyShield();
