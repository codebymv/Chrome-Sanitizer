"use strict";
(() => {
  // src/shared/pii/detector.ts
  function detectMatches(text, patterns) {
    const matches = [];
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;
      while ((match = regex.exec(text)) !== null) {
        const value = match[0];
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
    const accepted = [];
    const occupied = /* @__PURE__ */ new Set();
    const dedupe = /* @__PURE__ */ new Set();
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
  function summarizeMatches(matches) {
    const byType = /* @__PURE__ */ new Map();
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

  // src/shared/pii/validators.ts
  function digitsOnly(value) {
    return value.replace(/\D/g, "");
  }
  function isLikelyCreditCard(value) {
    const digits = digitsOnly(value);
    if (digits.length < 13 || digits.length > 19) {
      return false;
    }
    let sum = 0;
    let shouldDouble = false;
    for (let index = digits.length - 1; index >= 0; index -= 1) {
      let digit = Number(digits[index]);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }
  function isLikelyIpv4(value) {
    const parts = value.split(".");
    if (parts.length !== 4) {
      return false;
    }
    return parts.every((part) => {
      const parsed = Number(part);
      return Number.isInteger(parsed) && parsed >= 0 && parsed <= 255;
    });
  }
  function isLikelyExpiry(value) {
    const cleaned = value.replace(/\s/g, "");
    const matched = cleaned.match(/(0[1-9]|1[0-2])[\/-](\d{2}|\d{4})/);
    if (!matched) {
      return false;
    }
    const month = Number(matched[1]);
    return month >= 1 && month <= 12;
  }

  // src/shared/pii/patterns.ts
  var PII_PATTERNS = [
    {
      key: "fullNameContextual",
      label: "Full Name",
      severity: "high",
      regex: /(?<=\b(?:full\s*name|name)\s*:\s*)[A-Z][a-z]+(?:\s+[A-Z]\.)?(?:\s+[A-Z][a-z]+){1,3}\b/gi
    },
    {
      key: "ssn",
      label: "Financial",
      severity: "critical",
      regex: /\b\d{3}-\d{2}-\d{4}\b|(?<=\b(?:social\s*security(?:\s*number)?|ssn)\s*:\s*)\d{9}\b/gi
    },
    {
      key: "creditCard",
      label: "Financial",
      severity: "critical",
      regex: /(?<=\bcredit\s*card\s*:\s*)(?:\d[\s-]?){13,19}\d\b|\b(?:\d[\s-]?){13,19}\d\b/g,
      validate: (match) => isLikelyCreditCard(match)
    },
    {
      key: "bankAccount",
      label: "Bank Account Number",
      severity: "critical",
      regex: /(?<=\bbank\s*account(?:\s*number)?\s*:\s*)\d{8,17}\b/gi
    },
    {
      key: "routingNumber",
      label: "Routing Number",
      severity: "critical",
      regex: /(?<=\brouting\s*number\s*:\s*)\d{9}\b/gi
    },
    {
      key: "cvv",
      label: "CVV",
      severity: "critical",
      regex: /(?<=\b(?:cvv|cvc|security\s*code)\s*:\s*)\d{3,4}\b/gi
    },
    {
      key: "cardExpiry",
      label: "Card Expiry",
      severity: "high",
      regex: /(?<=\b(?:exp|expiry|expiration)\s*:\s*)(?:0[1-9]|1[0-2])[\/-](?:\d{2}|\d{4})\b/gi,
      validate: (match) => isLikelyExpiry(match)
    },
    {
      key: "email",
      label: "Email Address",
      severity: "high",
      regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
    },
    {
      key: "phone",
      label: "Phone Number",
      severity: "high",
      regex: /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g
    },
    {
      key: "streetAddress",
      label: "Street Address",
      severity: "high",
      regex: /(?<=\baddress\s*:\s*)\d+\s+[A-Za-z0-9.'#\-\s]+,\s*(?:[A-Za-z0-9.'#\-\s]+,\s*)?[A-Za-z.\-\s]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/gi
    },
    {
      key: "zipCode",
      label: "ZIP Code",
      severity: "medium",
      regex: /\b\d{5}(-\d{4})?\b/g
    },
    {
      key: "passport",
      label: "Passport Number",
      severity: "critical",
      regex: /(?<=\bpassport(?:\s*number)?\s*:\s*)[A-Z0-9]{6,9}\b/gi
    },
    {
      key: "driversLicense",
      label: "Driver's License",
      severity: "high",
      regex: /(?<=\b(?:driver'?s?\s*license|dl)\s*:\s*)[A-Z]{1,2}\d{5,8}\b/gi
    },
    {
      key: "dob",
      label: "Date of Birth",
      severity: "high",
      regex: /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12][0-9]|3[01])[\/\-](19|20)\d{2}\b/g
    },
    {
      key: "ipAddress",
      label: "IP Address",
      severity: "medium",
      regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      validate: (match) => isLikelyIpv4(match)
    },
    {
      key: "apiKey",
      label: "API Key",
      severity: "critical",
      regex: /\b(api[_-]?key|apikey|api[_-]?secret)[:\s]+[A-Za-z0-9_\-]{20,}\b/gi
    },
    {
      key: "authToken",
      label: "Auth Token",
      severity: "critical",
      regex: /\b(bearer|token|auth)[:\s]+[A-Za-z0-9_\-\.]{20,}\b/gi
    }
  ];

  // src/content/runtime-utils.ts
  var TEXT_EXTENSIONS = [".txt", ".csv", ".tsv", ".md", ".json", ".xml", ".log", ".html", ".htm"];
  var SUPPORTED_TEXT_MIME_PREFIXES = ["text/", "application/json", "application/xml"];
  function getUploadScanMode(fileName, mimeType) {
    const normalizedName = fileName.toLowerCase();
    if (normalizedName.endsWith(".docx") || normalizedName.endsWith(".pdf")) {
      return "docx-pdf";
    }
    const isTextByMime = SUPPORTED_TEXT_MIME_PREFIXES.some((prefix) => mimeType.includes(prefix));
    const isTextByExtension = TEXT_EXTENSIONS.some((extension) => normalizedName.endsWith(extension));
    if (isTextByMime || isTextByExtension) {
      return "text";
    }
    return "binary";
  }
  function formatDetectionAge(timestamp, now = Date.now()) {
    const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1e3));
    if (elapsedSeconds < 60) {
      return "just now";
    }
    if (elapsedSeconds < 3600) {
      return `${Math.floor(elapsedSeconds / 60)}m ago`;
    }
    return `${Math.floor(elapsedSeconds / 3600)}h ago`;
  }

  // src/content/index.ts
  var PrivacyShield = class {
    constructor() {
      this.enabled = true;
      this.sessionStats = {
        totalDetections: 0,
        byType: {},
        filesScanned: 0
      };
      this.shieldElement = null;
      this.wrenchElement = null;
      this.shieldState = "blue";
      this.detectionHistory = [];
      this.isDragging = false;
      this.init();
    }
    init() {
      this.createPersistentShield();
      chrome.storage.sync.get(["shieldEnabled", "overlayEnabled"], (result) => {
        this.enabled = result.shieldEnabled !== false;
        this.applyOverlayVisibility(result.overlayEnabled !== false);
      });
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.shieldEnabled) {
          this.enabled = changes.shieldEnabled.newValue !== false;
        }
        if (changes.overlayEnabled) {
          this.applyOverlayVisibility(changes.overlayEnabled.newValue !== false);
        }
      });
      this.attachListeners();
    }
    applyOverlayVisibility(visible) {
      const display = visible ? "" : "none";
      if (this.shieldElement) this.shieldElement.style.display = display;
      if (this.wrenchElement) this.wrenchElement.style.display = display;
    }
    createPersistentShield() {
      const createShield = () => {
        if (document.getElementById("privacy-shield-persistent")) {
          return;
        }
        const shield = document.createElement("div");
        shield.id = "privacy-shield-persistent";
        shield.className = "privacy-shield-persistent blue";
        const shieldIconUrl = chrome.runtime.getURL("icon_shield_white.png");
        shield.innerHTML = `
				<div class="shield-icon">
					<img src="${shieldIconUrl}" alt="Shield" width="18" height="18" style="object-fit:contain; display:block;">
				</div>
			`;
        const wrench = document.createElement("div");
        wrench.id = "shield-wrench-btn";
        wrench.className = "shield-wrench";
        wrench.title = "Open Sani File Sanitizer";
        const soapIconUrl = chrome.runtime.getURL("icon_soap_white.png");
        wrench.innerHTML = `<img src="${soapIconUrl}" alt="Sani" width="16" height="16" style="object-fit:contain; display:block;">`;
        document.body.appendChild(shield);
        document.body.appendChild(wrench);
        chrome.storage.local.get(["shieldPosition"], (result) => {
          const position = typeof result.shieldPosition === "number" ? result.shieldPosition : 50;
          this.setShieldPosition(position);
        });
        this.makeDraggable(shield, wrench);
        wrench.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.openSanitizerTool();
        });
        wrench.addEventListener("mousedown", (event) => {
          event.stopPropagation();
        });
        const shieldIcon = shield.querySelector(".shield-icon");
        if (shieldIcon instanceof HTMLElement) {
          shieldIcon.addEventListener("click", (event) => {
            event.stopPropagation();
            if (!this.isDragging) {
              this.toggleShieldPanel();
            }
          });
        }
        this.shieldElement = shield;
        this.wrenchElement = wrench;
        this.shieldState = "blue";
        this.detectionHistory = [];
        this.isDragging = false;
      };
      if (document.body) {
        createShield();
        return;
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", createShield);
        return;
      }
      setTimeout(createShield, 100);
    }
    openSanitizerTool() {
      const sanitizerUrl = chrome.runtime.getURL("sanitizer.html");
      window.open(sanitizerUrl, "_blank");
    }
    makeDraggable(element, wrenchElement) {
      let startY = 0;
      let startTop = 0;
      let dragging = false;
      const onMouseDown = (event) => {
        dragging = true;
        this.isDragging = false;
        startY = event.clientY;
        startTop = element.style.top ? parseFloat(element.style.top) : 50;
        element.style.cursor = "grabbing";
        element.style.transition = "none";
        wrenchElement.style.transition = "none";
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        event.preventDefault();
      };
      const onMouseMove = (event) => {
        if (!dragging) {
          return;
        }
        this.isDragging = true;
        const deltaY = event.clientY - startY;
        const viewportHeight = window.innerHeight;
        const deltaPercent = deltaY / viewportHeight * 100;
        const nextTop = Math.max(5, Math.min(95, startTop + deltaPercent));
        this.setShieldPosition(nextTop);
      };
      const onMouseUp = () => {
        if (dragging) {
          const finalPosition = element.style.top ? parseFloat(element.style.top) : 50;
          chrome.storage.local.set({ shieldPosition: finalPosition });
          element.style.cursor = "grab";
          element.style.transition = "all 0.3s ease";
          wrenchElement.style.transition = "all 0.2s ease";
          setTimeout(() => {
            this.isDragging = false;
          }, 100);
        }
        dragging = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      element.addEventListener("mousedown", onMouseDown);
      element.style.cursor = "grab";
    }
    setShieldPosition(topPercent) {
      if (this.shieldElement) {
        this.shieldElement.style.top = `${topPercent}%`;
        this.shieldElement.style.transform = "translateY(-50%)";
      }
      if (this.wrenchElement) {
        this.wrenchElement.style.top = `${topPercent}%`;
        this.wrenchElement.style.transform = "translate(-50%, -50%)";
      }
    }
    updateShieldState(hasInput, hasPII) {
      if (!this.shieldElement) {
        return;
      }
      this.shieldElement.classList.remove("blue", "green", "red");
      if (hasPII) {
        this.shieldElement.classList.add("red");
        this.shieldState = "red";
        return;
      }
      if (hasInput) {
        this.shieldElement.classList.add("green");
        this.shieldState = "green";
        return;
      }
      this.shieldElement.classList.add("blue");
      this.shieldState = "blue";
    }
    toggleShieldPanel() {
      let panel = document.getElementById("privacy-shield-panel");
      if (panel) {
        panel.remove();
        return;
      }
      panel = document.createElement("div");
      panel.id = "privacy-shield-panel";
      panel.className = "privacy-shield-panel";
      panel.innerHTML = this.detectionHistory.length > 0 ? this.buildDetectionPanel() : this.buildNoDetectionPanel();
      document.body.appendChild(panel);
      setTimeout(() => {
        const closeOnClickOutside = (event) => {
          const target = event.target;
          if (!(target instanceof Node)) {
            return;
          }
          if (!panel?.contains(target) && !this.shieldElement?.contains(target)) {
            panel?.remove();
            document.removeEventListener("click", closeOnClickOutside, true);
          }
        };
        document.addEventListener("click", closeOnClickOutside, true);
      }, 10);
      const clearAllBtn = panel.querySelector(".clear-all");
      if (clearAllBtn instanceof HTMLButtonElement) {
        clearAllBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          this.clearAllDetections();
          panel?.remove();
        });
      }
      const clearBtns = panel.querySelectorAll(".clear-single");
      clearBtns.forEach((btn, index) => {
        if (!(btn instanceof HTMLButtonElement)) {
          return;
        }
        btn.addEventListener("click", (event) => {
          event.stopPropagation();
          this.clearDetection(index);
          panel?.remove();
          this.toggleShieldPanel();
        });
      });
    }
    clearAllDetections() {
      this.detectionHistory = [];
      this.updateShieldState(true, false);
      this.updateStats([]);
    }
    clearDetection(index) {
      const actualIndex = this.detectionHistory.length - 1 - index;
      this.detectionHistory.splice(actualIndex, 1);
      if (this.detectionHistory.length === 0) {
        this.updateShieldState(true, false);
      }
    }
    buildDetectionPanel() {
      const detectionList = this.detectionHistory.map((detection, index) => {
        const items = detection.detected.map((entry) => {
          const badge = `<span class="severity-badge severity-${entry.severity}">${entry.severity.toUpperCase()}</span>`;
          const sampleValue = entry.samples[0];
          const sample = sampleValue ? `<code>${sampleValue}</code>` : "";
          return `<li>${badge} <strong>${entry.type}</strong>: ${entry.count} ${sample}</li>`;
        }).join("");
        const timeText = formatDetectionAge(detection.timestamp);
        return `
				<div class="detection-entry">
					<div class="detection-header">
						<div class="detection-time">${timeText}</div>
						<button class="clear-single" data-index="${index}">Clear</button>
					</div>
					<ul class="detection-items">${items}</ul>
				</div>
			`;
      }).reverse().join("");
      return `
			<div class="panel-header has-detections">
				<h3>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
						<path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" fill="white" stroke="white" stroke-width="2"/>
					</svg>
					Sani \u2014 PII Detections
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
						<path d="M9 12l2 2 4-4" stroke="#059669" stroke-width="2" stroke-linecap="round"/>
					</svg>
					Sani
				</h3>
			</div>
			<div class="panel-content no-detections">
				<svg width="44" height="44" viewBox="0 0 24 24" fill="none">
					<path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" fill="#059669" stroke="#059669" stroke-width="2"/>
					<path d="M9 12l2 2 4-4" stroke="white" stroke-width="2" stroke-linecap="round"/>
				</svg>
				<p>No Sensitive Information Detected</p>
				<small>Shield is active and monitoring</small>
			</div>
		`;
    }
    attachListeners() {
      const observeDOM = () => {
        const textAreas = document.querySelectorAll('textarea, [contenteditable="true"]');
        const fileInputs = document.querySelectorAll('input[type="file"]');
        textAreas.forEach((element) => {
          if (element.dataset.privacyShieldAttached) {
            return;
          }
          element.dataset.privacyShieldAttached = "true";
          element.addEventListener("paste", (event) => this.handlePaste(event));
          element.addEventListener("input", (event) => this.handleInput(event));
          element.addEventListener("keydown", (event) => {
            const keyEvent = event;
            if (keyEvent.key === "Enter" && !keyEvent.shiftKey || keyEvent.key === "Enter" && keyEvent.ctrlKey) {
              this.handlePreSubmit(element);
            }
          });
        });
        fileInputs.forEach((input) => {
          if (input.dataset.privacyShieldAttached) {
            return;
          }
          input.dataset.privacyShieldAttached = "true";
          input.addEventListener("change", (event) => this.handleFileUpload(event));
        });
        const dropZones = document.querySelectorAll('[data-testid*="file"], [class*="drop"], [class*="upload"]');
        dropZones.forEach((zone) => {
          if (zone.dataset.privacyShieldDropAttached) {
            return;
          }
          zone.dataset.privacyShieldDropAttached = "true";
          zone.addEventListener("drop", (event) => this.handleFileDrop(event));
        });
      };
      observeDOM();
      const observer = new MutationObserver(observeDOM);
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      this.monitorSubmitButtons();
    }
    monitorSubmitButtons() {
      document.addEventListener(
        "click",
        (event) => {
          const target = event.target;
          if (!(target instanceof Element)) {
            return;
          }
          const selector = 'button[type="submit"], button[aria-label*="Send"], button[data-testid*="send"]';
          if (!target.matches(selector) && !target.closest(selector)) {
            return;
          }
          const form = target.closest("form") ?? document;
          const input = form.querySelector('textarea, [contenteditable="true"]');
          if (input) {
            this.handlePreSubmit(input);
          }
        },
        true
      );
    }
    handlePaste(event) {
      if (!this.enabled) {
        return;
      }
      const clipboardEvent = event;
      const pastedText = clipboardEvent.clipboardData?.getData("text") ?? "";
      const detected = this.detectPII(pastedText);
      if (detected.length > 0) {
        this.showPIIAlert(detected, "paste");
        this.updateStats(detected);
      }
    }
    handleInput(event) {
      if (!this.enabled) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const text = this.getElementText(target);
      const hasInput = text.trim().length > 0;
      const detected = this.detectPII(text);
      const hasPII = detected.length > 0;
      this.updateShieldState(hasInput, hasPII);
      if (hasPII) {
        this.addToHistory(detected);
      }
    }
    handlePreSubmit(element) {
      if (!this.enabled) {
        return;
      }
      const text = this.getElementText(element);
      const detected = this.detectPII(text);
      if (detected.length > 0) {
        this.showPIIAlert(detected, "submit");
        this.updateStats(detected);
      }
    }
    async handleFileUpload(event) {
      if (!this.enabled) {
        return;
      }
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      const files = input.files;
      if (!files || files.length === 0) {
        return;
      }
      for (let index = 0; index < files.length; index += 1) {
        const file = files.item(index);
        if (!file) {
          continue;
        }
        await this.scanFile(file);
      }
    }
    async handleFileDrop(event) {
      if (!this.enabled) {
        return;
      }
      const dragEvent = event;
      const files = dragEvent.dataTransfer?.files;
      if (!files || files.length === 0) {
        return;
      }
      for (let index = 0; index < files.length; index += 1) {
        const file = files.item(index);
        if (!file) {
          continue;
        }
        await this.scanFile(file);
      }
    }
    async scanFile(file) {
      this.sessionStats.filesScanned += 1;
      const scanMode = getUploadScanMode(file.name, file.type);
      if (scanMode === "docx-pdf") {
        this.showNotification(
          `File uploaded: ${file.name}. Deep decoding for DOCX/PDF is available in the File Sanitizer tool.`,
          "info"
        );
        return;
      }
      if (scanMode === "binary") {
        this.showNotification(`File uploaded: ${file.name} (binary file - not scanned)`, "info");
        return;
      }
      try {
        const text = await this.readFileAsText(file);
        const detected = this.detectPII(text);
        if (detected.length > 0) {
          this.showPIIAlert(detected, "file", file.name);
          this.updateStats(detected);
          return;
        }
        this.showNotification(`File scanned: ${file.name} - No PII detected \u2713`, "success");
      } catch (error) {
        console.error("Error scanning file:", error);
        this.showNotification(`Could not scan file: ${file.name}`, "error");
      }
    }
    readFileAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(String(event.target?.result ?? ""));
        reader.onerror = (event) => reject(event);
        reader.readAsText(file);
      });
    }
    detectPII(text) {
      return summarizeMatches(detectMatches(text, PII_PATTERNS));
    }
    addToHistory(detected) {
      const newDetection = {
        detected,
        timestamp: Date.now()
      };
      const lastDetection = this.detectionHistory[this.detectionHistory.length - 1];
      if (!lastDetection || JSON.stringify(lastDetection.detected) !== JSON.stringify(detected)) {
        this.detectionHistory.push(newDetection);
        if (this.detectionHistory.length > 10) {
          this.detectionHistory.shift();
        }
        this.updateStats(detected);
      }
    }
    showPIIAlert(detected, context, fileName = null) {
      const alert = document.createElement("div");
      alert.className = "privacy-shield-alert";
      const hasCritical = detected.some((detection) => detection.severity === "critical");
      const hasHigh = detected.some((detection) => detection.severity === "high");
      const severity = hasCritical ? "critical" : hasHigh ? "high" : "medium";
      const contextText = context === "file" ? `in file: <strong>${fileName}</strong>` : context === "paste" ? "in pasted content" : "in your message";
      const detectedList = detected.map((item) => {
        const badge = `<span class="severity-badge severity-${item.severity}">${item.severity.toUpperCase()}</span>`;
        const sampleValue = item.samples[0];
        const sample = sampleValue ? `<br><code>${sampleValue}</code>` : "";
        return `<li>${badge} <strong>${item.type}</strong>: ${item.count} instance(s)${sample}</li>`;
      }).join("");
      alert.innerHTML = `
			<div class="privacy-shield-alert-content" data-severity="${severity}">
				<div class="privacy-shield-alert-header">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
						<path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" fill="${severity === "critical" ? "#DC2626" : "#D97706"}" stroke="${severity === "critical" ? "#DC2626" : "#D97706"}" stroke-width="2"/>
						<text x="12" y="16" text-anchor="middle" fill="white" font-size="14" font-weight="bold">!</text>
					</svg>
					<h3>Personally Identifiable Information Detected</h3>
				</div>
				<p>PII found ${contextText}:</p>
				<ul class="pii-list">${detectedList}</ul>
				<div class="alert-actions">
					<p class="warning-text">\u26A0\uFE0F <strong>Warning:</strong> Sharing this information may compromise your privacy or security.</p>
					<button class="privacy-shield-close">I Understand</button>
				</div>
			</div>
		`;
      document.body.appendChild(alert);
      const closeBtn = alert.querySelector(".privacy-shield-close");
      if (closeBtn instanceof HTMLButtonElement) {
        closeBtn.addEventListener("click", () => {
          alert.remove();
        });
      }
      if (severity !== "critical") {
        setTimeout(() => {
          if (alert.parentElement) {
            alert.remove();
          }
        }, 12e3);
      }
    }
    showNotification(message, tone) {
      const alert = document.createElement("div");
      alert.className = "privacy-shield-alert";
      const severity = tone === "error" ? "critical" : "medium";
      const heading = tone === "error" ? "Scan Error" : tone === "success" ? "Scan Complete" : "Scan Notice";
      alert.innerHTML = `
			<div class="privacy-shield-alert-content" data-severity="${severity}">
				<div class="privacy-shield-alert-header">
					<h3>${heading}</h3>
				</div>
				<p>${message}</p>
			</div>
		`;
      document.body.appendChild(alert);
      setTimeout(() => {
        if (alert.parentElement) {
          alert.remove();
        }
      }, 6e3);
    }
    updateStats(detected) {
      if (!this.sessionStats) {
        this.sessionStats = { totalDetections: 0, byType: {}, filesScanned: 0 };
      }
      this.sessionStats.totalDetections += detected.reduce((sum, detection) => sum + detection.count, 0);
      detected.forEach((detection) => {
        this.sessionStats.byType[detection.type] = (this.sessionStats.byType[detection.type] ?? 0) + detection.count;
      });
      chrome.storage.local.set({ sessionStats: this.sessionStats });
      chrome.storage.local.set({
        latestDetection: {
          detected,
          timestamp: Date.now()
        }
      });
      chrome.storage.local.get(["historyStats"], (result) => {
        const history = result.historyStats ?? {};
        const nextTotal = (history.totalDetections ?? 0) + detected.reduce((sum, detection) => sum + detection.count, 0);
        const nextByType = { ...history.byType ?? {} };
        detected.forEach((detection) => {
          nextByType[detection.type] = (nextByType[detection.type] ?? 0) + detection.count;
        });
        chrome.storage.local.set({
          historyStats: {
            totalDetections: nextTotal,
            byType: nextByType
          }
        });
      });
    }
    getElementText(element) {
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        return element.value ?? "";
      }
      return element.textContent ?? "";
    }
  };
  chrome.storage.local.set({
    sessionStats: {
      totalDetections: 0,
      byType: {},
      filesScanned: 0
    }
  });
  void new PrivacyShield();
})();
