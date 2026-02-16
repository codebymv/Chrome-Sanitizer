"use strict";
(() => {
  // src/shared/pii/detector.ts
  function detectMatches(text, patterns) {
    const matches = [];
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;
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

  // src/shared/pii/patterns.ts
  var PII_PATTERNS = [
    {
      key: "financial",
      label: "Financial",
      severity: "critical",
      regex: /\b(?:(?:\d{3}-\d{2}-\d{4})|(?:\d{9})|(?:\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}))\b/g
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
      regex: /\b\d+\s+[A-Za-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir|Way|Place|Pl)\b/gi
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
      regex: /\b[A-Z]{1,2}\d{6,9}\b/g
    },
    {
      key: "driversLicense",
      label: "Driver's License",
      severity: "high",
      regex: /\b[A-Z]{1,2}\d{5,8}\b/g
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
      regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
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

  // src/sanitizer/index.ts
  var uploadZone = mustGet("uploadZone");
  var fileInput = mustGet("fileInput");
  var mainContainer = mustGet("mainContainer");
  var originalPreview = mustGet("originalPreview");
  var sanitizedPreview = mustGet("sanitizedPreview");
  var downloadBtn = mustGet("downloadBtn");
  var resetSelectionsBtn = mustGet("resetSelectionsBtn");
  var clearFileBtn = mustGet("clearFileBtn");
  var autoCleanBtn = mustGet("autoCleanBtn");
  var manualCleanBtn = mustGet("manualCleanBtn");
  var autoModeRadios = Array.from(document.querySelectorAll('input[name="autoMode"]'));
  var manualModeRadios = Array.from(document.querySelectorAll('input[name="manualMode"]'));
  var currentFile = null;
  var currentFileContent = null;
  var currentFileName = "";
  var sanitizedContent = null;
  var detectedPII = [];
  var fileType = "";
  var lastAutoSelected = null;
  uploadZone.addEventListener("click", () => {
    fileInput.click();
  });
  uploadZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    uploadZone.classList.add("dragover");
  });
  uploadZone.addEventListener("dragleave", () => {
    uploadZone.classList.remove("dragover");
  });
  uploadZone.addEventListener("drop", (event) => {
    event.preventDefault();
    uploadZone.classList.remove("dragover");
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void processFile(file);
    }
  });
  fileInput.addEventListener("change", (event) => {
    const input = event.target;
    const file = input.files?.[0];
    if (file) {
      void processFile(file);
    }
  });
  resetSelectionsBtn.addEventListener("click", () => {
    autoModeRadios.forEach((radio) => {
      radio.checked = false;
    });
    autoCleanBtn.disabled = true;
    lastAutoSelected = null;
  });
  clearFileBtn.addEventListener("click", () => {
    if (confirm("\u26A0\uFE0F Clear the current file and start over?")) {
      clearEverything();
    }
  });
  autoModeRadios.forEach((radio) => {
    radio.addEventListener("click", (event) => {
      const target = event.target;
      if (lastAutoSelected === target && target.checked) {
        target.checked = false;
        lastAutoSelected = null;
        autoCleanBtn.disabled = true;
        return;
      }
      lastAutoSelected = target;
      autoCleanBtn.disabled = false;
    });
  });
  manualModeRadios.forEach((radio) => {
    radio.addEventListener("click", (event) => {
      const target = event.target;
      alert("Manual mode coming soon! Please use Auto mode for now.");
      target.checked = false;
    });
  });
  autoCleanBtn.addEventListener("click", () => {
    const selectedMode = document.querySelector('input[name="autoMode"]:checked')?.value;
    if (!selectedMode || !currentFileContent) {
      alert("Please select Hide or Replace mode first.");
      return;
    }
    performAutoClean(selectedMode);
  });
  manualCleanBtn.addEventListener("click", () => {
    alert("Manual mode coming soon!");
  });
  downloadBtn.addEventListener("click", () => {
    downloadSanitizedFile();
  });
  function mustGet(id) {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing element: ${id}`);
    }
    return element;
  }
  function clearEverything() {
    currentFile = null;
    currentFileContent = null;
    currentFileName = "";
    sanitizedContent = null;
    detectedPII = [];
    fileType = "";
    autoModeRadios.forEach((radio) => {
      radio.checked = false;
      radio.disabled = false;
    });
    manualModeRadios.forEach((radio) => {
      radio.checked = false;
      radio.disabled = false;
    });
    autoCleanBtn.disabled = true;
    manualCleanBtn.disabled = true;
    downloadBtn.disabled = true;
    lastAutoSelected = null;
    originalPreview.innerHTML = "";
    sanitizedPreview.innerHTML = "";
    mainContainer.classList.remove("active");
    uploadZone.classList.remove("hidden");
    fileInput.value = "";
  }
  function resetControlStateForNewFile() {
    autoModeRadios.forEach((radio) => {
      radio.checked = false;
      radio.disabled = false;
    });
    manualModeRadios.forEach((radio) => {
      radio.checked = false;
      radio.disabled = false;
    });
    autoCleanBtn.disabled = true;
    manualCleanBtn.disabled = true;
    downloadBtn.disabled = true;
    lastAutoSelected = null;
    sanitizedContent = null;
  }
  async function processFile(file) {
    if (file.size > 10 * 1024 * 1024) {
      alert("File too large. Maximum size is 10MB.");
      return;
    }
    currentFile = file;
    currentFileName = file.name;
    resetControlStateForNewFile();
    const fileName = file.name.toLowerCase();
    const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(fileName);
    if (isImage) {
      fileType = "image";
      await displayImage(file);
      return;
    }
    if (fileName.endsWith(".csv")) {
      fileType = "csv";
      await displayTextOrCsv(file, "csv");
      return;
    }
    fileType = "text";
    await displayTextOrCsv(file, "text");
  }
  async function displayTextOrCsv(file, kind) {
    try {
      const text = await file.text();
      currentFileContent = text;
      detectedPII = detectMatches(text, PII_PATTERNS);
      originalPreview.innerHTML = kind === "csv" ? csvToTable(text) : `<pre>${escapeHtml(text)}</pre>`;
      sanitizedPreview.innerHTML = '<pre style="color: #6366f1; text-align: center; padding: 40px;">\u26A1 CLICK CLEAN TO SANITIZE \u26A1</pre>';
      showPreview();
    } catch (error) {
      console.error("Error reading file:", error);
      alert("Error reading file. Please try again.");
    }
  }
  async function displayImage(file) {
    const dataUrl = await readFileAsDataUrl(file);
    currentFileContent = dataUrl;
    originalPreview.innerHTML = `<img src="${dataUrl}" alt="Original">`;
    sanitizedPreview.innerHTML = '<pre style="color: #f59e0b; text-align: center; padding: 40px;">Image sanitization is not supported yet.\nUpload text or CSV for cleaning.</pre>';
    autoModeRadios.forEach((radio) => {
      radio.disabled = true;
      radio.checked = false;
    });
    manualModeRadios.forEach((radio) => {
      radio.disabled = true;
      radio.checked = false;
    });
    autoCleanBtn.disabled = true;
    manualCleanBtn.disabled = true;
    downloadBtn.disabled = true;
    showPreview();
  }
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === "string") {
          resolve(result);
        } else {
          reject(new Error("Invalid image data"));
        }
      };
      reader.onerror = () => reject(new Error("Error reading image"));
      reader.readAsDataURL(file);
    });
  }
  function performAutoClean(mode) {
    if (!currentFileContent) {
      alert("No file content available.");
      return;
    }
    if (fileType === "image") {
      alert("Image sanitization is not supported yet. Please upload text or CSV.");
      return;
    }
    const inputText = currentFileContent;
    const matches = detectMatches(inputText, PII_PATTERNS).sort((a, b) => b.index - a.index);
    if (matches.length === 0) {
      sanitizedContent = inputText;
      sanitizedPreview.innerHTML = fileType === "csv" ? csvToTable(inputText) : `<pre>${escapeHtml(inputText)}</pre>`;
      downloadBtn.disabled = false;
      alert("\u2139\uFE0F No PII detected. File appears clean!");
      return;
    }
    let cleanedContent = inputText;
    for (const pii of matches) {
      const before = cleanedContent.substring(0, pii.index);
      const after = cleanedContent.substring(pii.index + pii.length);
      cleanedContent = before + (mode === "hide" ? "\u2588".repeat(pii.length) : generateFakeData(pii.value, pii.type)) + after;
    }
    sanitizedContent = cleanedContent;
    sanitizedPreview.innerHTML = fileType === "csv" ? csvToTable(cleanedContent) : `<pre>${escapeHtml(cleanedContent)}</pre>`;
    downloadBtn.disabled = false;
    alert(`\u2713 Successfully cleaned ${matches.length} PII instance(s)!`);
  }
  function generateFakeData(original, type) {
    switch (type) {
      case "Financial":
        if (/^\d{3}-\d{2}-\d{4}$/.test(original)) {
          return `${randomDigits(3)}-${randomDigits(2)}-${randomDigits(4)}`;
        }
        if (/^\d{9}$/.test(original)) {
          return randomDigits(9);
        }
        return `${randomDigits(4)}-${randomDigits(4)}-${randomDigits(4)}-${randomDigits(4)}`;
      case "Phone Number":
        return `(${randomDigits(3)}) ${randomDigits(3)}-${randomDigits(4)}`;
      case "Email Address": {
        const domain = original.includes("@") ? original.split("@")[1] : "example.com";
        return `user${randomDigits(4)}@${domain}`;
      }
      case "ZIP Code":
        return original.length > 5 ? `${randomDigits(5)}-${randomDigits(4)}` : randomDigits(5);
      case "IP Address":
        return `${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
      case "Date of Birth":
        return `${randomDigits(2)}/${randomDigits(2)}/${randomDigits(4)}`;
      case "Street Address":
        return `${randomInt(100, 9999)} ${randomLetters(2)} St`;
      default:
        return original.split("").map((char) => {
          if (/\d/.test(char)) {
            return String(Math.floor(Math.random() * 10));
          }
          if (/[a-z]/.test(char)) {
            return String.fromCharCode(97 + Math.floor(Math.random() * 26));
          }
          if (/[A-Z]/.test(char)) {
            return String.fromCharCode(65 + Math.floor(Math.random() * 26));
          }
          return char;
        }).join("");
    }
  }
  function randomDigits(count) {
    return Array.from({ length: count }, () => Math.floor(Math.random() * 10)).join("");
  }
  function randomLetters(count) {
    return Array.from({ length: count }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
  }
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function downloadSanitizedFile() {
    if (!sanitizedContent) {
      alert("No sanitized content to download.");
      return;
    }
    const blob = new Blob([sanitizedContent], { type: fileType === "csv" ? "text/csv" : "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sanitized_${currentFileName}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  function csvToTable(csvText) {
    const lines = csvText.split("\n").filter((line) => line.trim());
    if (lines.length === 0) {
      return "<pre>Empty file</pre>";
    }
    const rows = lines.map(parseCsvLine);
    let html = "<table>";
    html += "<thead><tr>";
    for (const cell of rows[0] ?? []) {
      html += `<th>${escapeHtml(cell)}</th>`;
    }
    html += "</tr></thead>";
    if (rows.length > 1) {
      html += "<tbody>";
      for (const row of rows.slice(1)) {
        html += "<tr>";
        for (const cell of row) {
          html += `<td>${escapeHtml(cell)}</td>`;
        }
        html += "</tr>";
      }
      html += "</tbody>";
    }
    html += "</table>";
    return html;
  }
  function parseCsvLine(line) {
    const cells = [];
    let currentCell = "";
    let inQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (char === "," && !inQuotes) {
        cells.push(currentCell.trim());
        currentCell = "";
        continue;
      }
      currentCell += char;
    }
    cells.push(currentCell.trim());
    return cells;
  }
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  function showPreview() {
    uploadZone.classList.add("hidden");
    mainContainer.classList.add("active");
  }
})();
