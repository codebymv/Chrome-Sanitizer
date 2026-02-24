import {
  require_papaparse_min
} from "./chunks/chunk-BRPFH2NL.js";
import {
  DECODE_TIMEOUT_MS,
  DOCX_SANITIZE_TIMEOUT_MS,
  MIN_PDF_OCR_AVERAGE_CONFIDENCE_WARNING,
  PDF_DECODE_TIMEOUT_MS,
  withTimeout
} from "./chunks/chunk-FZOTJZBO.js";
import {
  PII_PATTERNS,
  createPdfRedactionEngine,
  detectMatches
} from "./chunks/chunk-H64NMFT6.js";
import {
  escapeHtml,
  getExtension,
  isImageFile
} from "./chunks/chunk-5JENT2UN.js";
import {
  __toESM
} from "./chunks/chunk-KH45J4DC.js";

// src/shared/pii/replacement.ts
function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function createRandom(seed) {
  let state = hashString(seed) || 1;
  return () => {
    state |= 0;
    state = state + 1831565813 | 0;
    let mixed = Math.imul(state ^ state >>> 15, 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, 61 | mixed);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}
function randomInt(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}
function randomDigit(random) {
  return String(randomInt(random, 0, 9));
}
function randomLetter(random, uppercase) {
  const base = uppercase ? 65 : 97;
  return String.fromCharCode(base + randomInt(random, 0, 25));
}
function pickFrom(random, values) {
  if (values.length === 0) {
    throw new Error("pickFrom requires a non-empty values array");
  }
  const index = randomInt(random, 0, values.length - 1);
  const picked = values[index];
  if (picked === void 0) {
    return values[0];
  }
  return picked;
}
function replaceByCharacterClass(template, random) {
  let result = "";
  for (const char of template) {
    if (/\d/.test(char)) {
      result += randomDigit(random);
      continue;
    }
    if (/[a-z]/.test(char)) {
      result += randomLetter(random, false);
      continue;
    }
    if (/[A-Z]/.test(char)) {
      result += randomLetter(random, true);
      continue;
    }
    result += char;
  }
  return result;
}
function buildPronounceableWord(length, random, uppercaseFirst) {
  const vowels = ["a", "e", "i", "o", "u"];
  const consonants = ["b", "c", "d", "f", "g", "h", "j", "k", "l", "m", "n", "p", "r", "s", "t", "v", "w", "y", "z"];
  if (length <= 0) {
    return "";
  }
  let output = "";
  for (let index = 0; index < length; index += 1) {
    const source = index % 2 === 0 ? consonants : vowels;
    const letter = pickFrom(random, source);
    output += letter;
  }
  if (uppercaseFirst) {
    return `${output[0]?.toUpperCase() ?? "X"}${output.slice(1)}`;
  }
  return output;
}
function enforceLength(value, source, random) {
  if (value.length === source.length) {
    return value;
  }
  if (value.length > source.length) {
    return value.slice(0, source.length);
  }
  let output = value;
  for (let index = value.length; index < source.length; index += 1) {
    const sourceChar = source[index] ?? "x";
    if (/\d/.test(sourceChar)) {
      output += randomDigit(random);
      continue;
    }
    if (/[a-z]/.test(sourceChar)) {
      output += randomLetter(random, false);
      continue;
    }
    if (/[A-Z]/.test(sourceChar)) {
      output += randomLetter(random, true);
      continue;
    }
    output += sourceChar === " " ? " " : "x";
  }
  return output;
}
function isLuhnValid(digits) {
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = Number(digits[index]);
    if (doubleDigit) {
      value *= 2;
      if (value > 9) {
        value -= 9;
      }
    }
    sum += value;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}
function makeLuhnInvalid(digits) {
  if (!isLuhnValid(digits)) {
    return digits;
  }
  const last = Number(digits[digits.length - 1] ?? "0");
  const replacement = (last + 1) % 10;
  return `${digits.slice(0, -1)}${replacement}`;
}
function fillDigitsTemplate(template, digits) {
  let output = "";
  let pointer = 0;
  for (const char of template) {
    if (/\d/.test(char)) {
      output += digits[pointer] ?? "0";
      pointer += 1;
      continue;
    }
    output += char;
  }
  return output;
}
function replaceDateOfBirth(value, random) {
  const separator = value.includes("-") ? "-" : "/";
  const parts = value.split(/[\/-]/);
  if (parts.length !== 3) {
    return replaceByCharacterClass(value, random);
  }
  const month = String(randomInt(random, 1, 12)).padStart(parts[0]?.length ?? 2, "0");
  const day = String(randomInt(random, 1, 28)).padStart(parts[1]?.length ?? 2, "0");
  const yearLength = parts[2]?.length ?? 4;
  const yearBase = yearLength === 2 ? randomInt(random, 10, 89) : randomInt(random, 1970, 2004);
  const year = String(yearBase).padStart(yearLength, "0").slice(-yearLength);
  return `${month}${separator}${day}${separator}${year}`;
}
function replaceExpiry(value) {
  const separator = value.includes("-") ? "-" : "/";
  const yearPart = value.split(/[\/-]/)[1] ?? "00";
  return `00${separator}${"0".repeat(Math.max(2, yearPart.length)).slice(0, yearPart.length)}`;
}
function replacePhone(value, random) {
  const digitsCount = value.replace(/\D/g, "").length;
  const digits = [];
  for (let index = 0; index < digitsCount; index += 1) {
    digits.push(randomDigit(random));
  }
  if (digits.length >= 10) {
    digits[0] = "5";
    digits[1] = "5";
    digits[2] = "5";
    digits[3] = "0";
    digits[4] = "1";
  }
  return fillDigitsTemplate(value, digits.join(""));
}
function replaceEmail(value, random) {
  const atIndex = value.indexOf("@");
  const dotIndex = value.lastIndexOf(".");
  if (atIndex < 1 || dotIndex <= atIndex + 1) {
    return replaceByCharacterClass(value, random);
  }
  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1, dotIndex);
  const tld = value.slice(dotIndex + 1);
  const transformSegment = (segment) => {
    const tokens = segment.match(/[A-Za-z]+|\d+|[^A-Za-z\d]+/g) ?? [segment];
    return tokens.map((token) => {
      if (/^[A-Za-z]+$/.test(token)) {
        return buildPronounceableWord(token.length, random, false);
      }
      if (/^\d+$/.test(token)) {
        return token.split("").map(() => randomDigit(random)).join("");
      }
      return token;
    }).join("");
  };
  return `${transformSegment(local)}@${transformSegment(domain)}.${transformSegment(tld)}`;
}
function replaceFinancialLike(value, random) {
  const digitsCount = value.replace(/\D/g, "").length;
  let digits = "";
  for (let index = 0; index < digitsCount; index += 1) {
    digits += randomDigit(random);
  }
  if (digits.length > 0) {
    digits = `9${digits.slice(1)}`;
  }
  digits = makeLuhnInvalid(digits);
  return fillDigitsTemplate(value, digits);
}
function replaceRouting(value, random) {
  const digitsCount = value.replace(/\D/g, "").length;
  let digits = "";
  for (let index = 0; index < digitsCount; index += 1) {
    digits += randomDigit(random);
  }
  if (digitsCount === 9) {
    const sum = 3 * Number(digits[0] ?? "0") + 7 * Number(digits[1] ?? "0") + 1 * Number(digits[2] ?? "0") + 3 * Number(digits[3] ?? "0") + 7 * Number(digits[4] ?? "0") + 1 * Number(digits[5] ?? "0") + 3 * Number(digits[6] ?? "0") + 7 * Number(digits[7] ?? "0") + 1 * Number(digits[8] ?? "0");
    if (sum % 10 === 0) {
      const last = Number(digits[8] ?? "0");
      digits = `${digits.slice(0, 8)}${(last + 1) % 10}`;
    }
  }
  return fillDigitsTemplate(value, digits);
}
function replaceSsn(value, random) {
  if (value.includes("-")) {
    return `000-00-${String(randomInt(random, 1e3, 9999))}`;
  }
  return `00000${String(randomInt(random, 1e3, 9999))}`;
}
function replaceName(value, random) {
  return value.split(/(\s+)/).map((part) => {
    if (!part.trim()) {
      return part;
    }
    if (part.length === 2 && part.endsWith(".")) {
      return "X.";
    }
    const uppercaseFirst = /[A-Z]/.test(part[0] ?? "");
    return buildPronounceableWord(part.length, random, uppercaseFirst);
  }).join("");
}
function replaceStreetAddress(value, random) {
  const tokens = value.match(/[A-Za-z]+|\d+|[^A-Za-z\d]+/g) ?? [value];
  let alphaWordIndex = 0;
  return tokens.map((token) => {
    if (/^\d+$/.test(token)) {
      if (token.length >= 5) {
        const generated = `9${String(randomInt(random, 0, 10 ** Math.max(1, token.length - 1) - 1)).padStart(Math.max(1, token.length - 1), "0")}`;
        return generated.slice(0, token.length);
      }
      return token.split("").map(() => randomDigit(random)).join("");
    }
    if (/^[A-Za-z]+$/.test(token)) {
      const lower = token.toLowerCase();
      if (token.length === 2 && token.toUpperCase() === token) {
        return "ZZ";
      }
      if (lower === "apt") {
        return "Apt";
      }
      if (lower === "suite" || lower === "ste") {
        return "Suite".slice(0, token.length);
      }
      const uppercaseFirst = /[A-Z]/.test(token[0] ?? "");
      const replacement = buildPronounceableWord(token.length, random, uppercaseFirst);
      alphaWordIndex += 1;
      if (alphaWordIndex === 2 && token.length >= 3) {
        const suffixes = ["St", "Rd", "Ave", "Ln", "Dr", "Ct", "Blvd"];
        const suffix = pickFrom(random, suffixes);
        return replacement.length <= suffix.length ? replacement : `${replacement.slice(0, replacement.length - suffix.length)}${suffix}`;
      }
      return replacement;
    }
    return token;
  }).join("");
}
function replaceDriversLicense(value) {
  let output = "";
  for (const char of value) {
    if (/\d/.test(char)) {
      output += "0";
      continue;
    }
    if (/[A-Za-z]/.test(char)) {
      output += "X";
      continue;
    }
    output += char;
  }
  return output;
}
function generateSafeReplacement(match) {
  const random = createRandom(`${match.key}|${match.value}|${match.index}`);
  let candidate;
  switch (match.key) {
    case "fullNameContextual":
      candidate = replaceName(match.value, random);
      break;
    case "dob":
      candidate = replaceDateOfBirth(match.value, random);
      break;
    case "email":
      candidate = replaceEmail(match.value, random);
      break;
    case "phone":
      candidate = replacePhone(match.value, random);
      break;
    case "creditCard":
      candidate = replaceFinancialLike(match.value, random);
      break;
    case "cardExpiry":
      candidate = replaceExpiry(match.value);
      break;
    case "cvv":
      candidate = "0".repeat(match.value.length);
      break;
    case "routingNumber":
      candidate = replaceRouting(match.value, random);
      break;
    case "ssn":
      candidate = replaceSsn(match.value, random);
      break;
    case "bankAccount":
      candidate = fillDigitsTemplate(match.value, `0000${"0".repeat(Math.max(0, match.value.replace(/\D/g, "").length - 4))}`);
      break;
    case "streetAddress":
      candidate = replaceStreetAddress(match.value, random);
      break;
    case "driversLicense":
    case "passport":
      candidate = replaceDriversLicense(match.value);
      break;
    default:
      candidate = replaceByCharacterClass(match.value, random);
      break;
  }
  return enforceLength(candidate, match.value, random);
}

// src/sanitizer/hardening.ts
var import_papaparse = __toESM(require_papaparse_min(), 1);
var MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
var DOCX_UNSAFE_ENTRY_PATTERNS = [
  /^word\/vbaProject\.bin$/i,
  /^word\/vbaData\.xml$/i,
  /^word\/embeddings\//i,
  /^word\/activeX\//i,
  /^word\/oleObject\d+\.bin$/i
];
var FILE_INPUT_ACCEPT = [
  ".txt",
  ".md",
  ".json",
  ".xml",
  ".log",
  ".html",
  ".htm",
  ".csv",
  ".tsv",
  ".docx",
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
  ".svg"
].join(",");
var ALLOWED_EXTENSIONS = /* @__PURE__ */ new Set([
  ".txt",
  ".md",
  ".json",
  ".xml",
  ".log",
  ".html",
  ".htm",
  ".csv",
  ".tsv",
  ".docx",
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
  ".svg"
]);
var ALLOWED_MIME_PREFIXES = ["text/", "image/", "application/json", "application/xml"];
var EXTENSION_MIME_HINTS = {
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".pdf": ["application/pdf"],
  ".csv": ["text/csv", "application/csv", "application/vnd.ms-excel"],
  ".tsv": ["text/tab-separated-values", "text/tsv"],
  ".json": ["application/json", "text/json"],
  ".xml": ["application/xml", "text/xml"],
  ".svg": ["image/svg+xml", "text/xml"]
};
var HIGH_RISK_PII_KEYS = /* @__PURE__ */ new Set([
  "ssn",
  "creditCard",
  "bankAccount",
  "routingNumber",
  "cvv",
  "cardExpiry",
  "fullNameContextual",
  "email",
  "phone",
  "driversLicense",
  "dob",
  "passport",
  "apiKey",
  "authToken"
]);
function validateUploadPreflight(file) {
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return "File too large. Maximum size is 10 MB.";
  }
  const extension = getExtension(file.name);
  const mime = file.type.toLowerCase();
  const extensionAllowed = extension ? ALLOWED_EXTENSIONS.has(extension) : false;
  const mimeAllowed = ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
  if (!extensionAllowed && !mimeAllowed) {
    return "Unsupported file type. Allowed: TXT, CSV/TSV, DOCX, PDF, and common image formats.";
  }
  if (!extension || !mime) {
    return null;
  }
  const expectedMimes = EXTENSION_MIME_HINTS[extension];
  if (!expectedMimes) {
    return null;
  }
  const mimeLooksValid = expectedMimes.some((expected) => mime === expected || mime.startsWith(expected));
  if (!mimeLooksValid) {
    return `File type mismatch detected for ${extension}. Please upload a valid file.`;
  }
  return null;
}
function filterHighRiskResidual(matches) {
  return matches.filter((match) => HIGH_RISK_PII_KEYS.has(match.key));
}
function neutralizeCsvFormulaInjection(csvText) {
  const parsed = import_papaparse.default.parse(csvText, {
    skipEmptyLines: false
  });
  if (parsed.errors.length > 0) {
    return { text: csvText, updatedCells: 0 };
  }
  let updatedCells = 0;
  const hardenedRows = parsed.data.map((row) => row.map((cell) => {
    const value = String(cell ?? "");
    if (!/^[=+\-@]/.test(value)) {
      return value;
    }
    updatedCells += 1;
    return `'${value}`;
  }));
  if (updatedCells === 0) {
    return { text: csvText, updatedCells: 0 };
  }
  return {
    text: import_papaparse.default.unparse(hardenedRows),
    updatedCells
  };
}
function detectUnsafeDocxEntryPaths(paths) {
  return paths.filter((path) => DOCX_UNSAFE_ENTRY_PATTERNS.some((pattern) => pattern.test(path)));
}
function buildManualOverrideWarning(highRiskResidualCount) {
  if (highRiskResidualCount <= 0) {
    return "";
  }
  return `High-risk data remains (${highRiskResidualCount} item${highRiskResidualCount === 1 ? "" : "s"}). Download requires explicit override confirmation.`;
}

// src/sanitizer/index.ts
var import_papaparse2 = __toESM(require_papaparse_min(), 1);
var MODE_STORAGE_KEY = "preferredAutoMode";
var AUTO_RUN_STORAGE_KEY = "autoRunOnUpload";
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
var statusBanner = mustGet("statusBanner");
var preModeHide = mustGet("preModeHide");
var preModeReplace = mustGet("preModeReplace");
var preAutoRunRow = mustGet("preAutoRunRow");
var preAutoRunToggle = mustGet("preAutoRunToggle");
var preModeHelp = mustGet("preModeHelp");
var controlsToggleBtn = mustGet("controlsToggleBtn");
var controlsToggleMeta = mustGet("controlsToggleMeta");
var controlsPanel = mustGet("controlsPanel");
var manualSummary = mustGet("manualSummary");
var manualList = mustGet("manualList");
var manualSelectionPopup = mustGet("manualSelectionPopup");
var manualPopupHideBtn = mustGet("manualPopupHideBtn");
var manualPopupReplaceBtn = mustGet("manualPopupReplaceBtn");
var selectAllBtn = mustGet("selectAllBtn");
var deselectAllBtn = mustGet("deselectAllBtn");
var autoModeRadios = Array.from(document.querySelectorAll('input[name="autoMode"]'));
var currentFile = null;
var currentFileContent = null;
var currentFileName = "";
var sanitizedContent = null;
var detectedPII = [];
var fileType = "";
var currentDecodedFile = null;
var sanitizedBlob = null;
var selectedAutoMode = "hide";
var autoRunOnUpload = true;
var syncingScroll = false;
var controlsPanelExpanded = true;
var manualSelection = /* @__PURE__ */ new Map();
var manualCandidates = [];
var pendingPopupCandidateIds = [];
var requiresManualExportOverride = false;
var pendingManualOverrideHighRiskCount = 0;
var pdfRedactionEngine = createPdfRedactionEngine();
var decodeUploadedFilePromise = null;
var jsZipPromise = null;
var docxPreviewPromise = null;
var pdfJsPromise = null;
var pdfPreviewWorkerBootstrapPromise = null;
var MAX_PDF_PREVIEW_PAGES = 20;
var PDF_PREVIEW_SCALE = 1.15;
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
  applySelectedMode(selectedAutoMode, true);
  manualSelection = new Map(manualCandidates.map((candidate) => [candidate.id, candidate]));
  updateManualReviewUi();
  renderManualPreview();
  clearStatus();
});
clearFileBtn.addEventListener("click", () => {
  if (confirm("\u26A0\uFE0F Clear the current file and start over?")) {
    clearEverything();
  }
});
autoModeRadios.forEach((radio) => {
  radio.addEventListener("change", (event) => {
    const target = event.target;
    if (!target.checked) {
      return;
    }
    applySelectedMode(target.value, true);
    if (autoRunOnUpload && currentFileContent && currentDecodedFile?.canSanitizePreservingFormat) {
      void performAutoClean(selectedAutoMode, false);
      return;
    }
    if (currentFileContent && currentDecodedFile?.canSanitizePreservingFormat) {
      setStatus("Mode updated. Click Clean to sanitize this file.", "warning");
    }
  });
});
preModeHide.addEventListener("click", (event) => {
  event.stopPropagation();
  applySelectedMode("hide", true);
});
preModeReplace.addEventListener("click", (event) => {
  event.stopPropagation();
  applySelectedMode("replace", true);
});
preAutoRunRow.addEventListener("click", (event) => {
  event.stopPropagation();
});
preAutoRunToggle.addEventListener("change", (event) => {
  event.stopPropagation();
  setAutoRunPreference(preAutoRunToggle.checked, true);
});
manualList.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
    return;
  }
  const id = target.dataset.manualId;
  if (!id) {
    return;
  }
  toggleManualSelection(id, target.checked);
});
originalPreview.addEventListener("click", (event) => {
  const target = event.target;
  const hit = target.closest(".manual-hit");
  const id = hit?.dataset.manualId;
  if (!id) {
    return;
  }
  const isChecked = !manualSelection.has(id);
  toggleManualSelection(id, isChecked);
});
originalPreview.addEventListener("mouseup", () => {
  if (fileType === "csv") {
    hideManualSelectionPopup();
    return;
  }
  maybeOpenManualSelectionPopup();
});
document.addEventListener("scroll", () => {
  hideManualSelectionPopup();
}, true);
document.addEventListener("mousedown", (event) => {
  const target = event.target;
  if (manualSelectionPopup.contains(target)) {
    return;
  }
  hideManualSelectionPopup();
});
manualPopupHideBtn.addEventListener("click", () => {
  applyPopupSelection("hide");
});
manualPopupReplaceBtn.addEventListener("click", () => {
  applyPopupSelection("replace");
});
selectAllBtn.addEventListener("click", () => {
  manualSelection = new Map(manualCandidates.map((c) => [c.id, c]));
  updateManualReviewUi();
  renderManualPreview();
});
deselectAllBtn.addEventListener("click", () => {
  manualSelection = /* @__PURE__ */ new Map();
  updateManualReviewUi();
  renderManualPreview();
});
controlsToggleBtn.addEventListener("click", () => {
  setControlsPanelExpanded(!controlsPanelExpanded);
});
manualList.addEventListener("click", (event) => {
  const target = event.target;
  const groupHeader = target.closest(".pii-group-header");
  if (!groupHeader) {
    return;
  }
  if (target.classList.contains("pii-group-checkbox")) {
    return;
  }
  const group = groupHeader.closest(".pii-group");
  if (group) {
    group.classList.toggle("collapsed");
  }
});
manualList.addEventListener("change", (event) => {
  const target = event.target;
  if (target.classList.contains("pii-group-checkbox")) {
    const groupType = target.dataset.groupType ?? "";
    const groupCandidates = manualCandidates.filter((c) => c.match.type === groupType);
    if (target.checked) {
      for (const c of groupCandidates) {
        manualSelection.set(c.id, c);
      }
    } else {
      for (const c of groupCandidates) {
        manualSelection.delete(c.id);
      }
    }
    updateManualReviewUi();
    renderManualPreview();
    return;
  }
});
autoCleanBtn.addEventListener("click", () => {
  if (!currentFileContent) {
    setStatus("Upload a supported file to sanitize first.", "warning");
    return;
  }
  void performAutoClean(selectedAutoMode, false);
});
manualCleanBtn.addEventListener("click", () => {
  void performManualClean();
});
downloadBtn.addEventListener("click", () => {
  downloadSanitizedFile();
});
wirePreviewScrollSync();
fileInput.accept = FILE_INPUT_ACCEPT;
void initializeUiPreferences();
function mustGet(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element;
}
async function initializeUiPreferences() {
  try {
    const result = await chrome.storage.local.get([MODE_STORAGE_KEY, AUTO_RUN_STORAGE_KEY]);
    const stored = result[MODE_STORAGE_KEY];
    if (stored === "hide" || stored === "replace") {
      selectedAutoMode = stored;
    }
    if (typeof result[AUTO_RUN_STORAGE_KEY] === "boolean") {
      autoRunOnUpload = result[AUTO_RUN_STORAGE_KEY];
    }
  } catch (error) {
    console.warn("Could not load preferred mode from storage:", error);
  }
  setAutoRunPreference(autoRunOnUpload, false);
  applySelectedMode(selectedAutoMode, false);
}
function updatePreModeUi(mode) {
  preModeHide.classList.toggle("active", mode === "hide");
  preModeReplace.classList.toggle("active", mode === "replace");
  if (autoRunOnUpload) {
    preModeHelp.textContent = mode === "hide" ? "Hide masks sensitive values with blocks. Applied automatically after upload." : "Replace swaps sensitive values with realistic placeholders. Applied automatically after upload.";
    return;
  }
  preModeHelp.textContent = mode === "hide" ? "Hide masks sensitive values with blocks. Choose mode now, then click Clean after upload." : "Replace swaps sensitive values with realistic placeholders. Choose mode now, then click Clean after upload.";
}
function setAutoRunPreference(enabled, persist) {
  autoRunOnUpload = enabled;
  preAutoRunToggle.checked = enabled;
  autoCleanBtn.textContent = enabled ? "Re-run" : "Clean";
  updatePreModeUi(selectedAutoMode);
  setControlsPanelExpanded(!enabled);
  if (persist) {
    void chrome.storage.local.set({ [AUTO_RUN_STORAGE_KEY]: enabled });
  }
}
function setControlsPanelExpanded(expanded) {
  controlsPanelExpanded = expanded;
  controlsPanel.classList.toggle("collapsed", !expanded);
  controlsToggleBtn.setAttribute("aria-expanded", String(expanded));
}
function updateControlsToggleMeta() {
  if (manualCandidates.length === 0) {
    controlsToggleMeta.textContent = "No detected PII";
    return;
  }
  controlsToggleMeta.textContent = `${manualSelection.size}/${manualCandidates.length} selected`;
}
function applySelectedMode(mode, persist) {
  selectedAutoMode = mode;
  autoModeRadios.forEach((radio) => {
    radio.checked = radio.value === mode;
  });
  updatePreModeUi(mode);
  autoCleanBtn.disabled = !currentFileContent;
  if (persist) {
    void chrome.storage.local.set({ [MODE_STORAGE_KEY]: mode });
  }
}
function setStatus(message, tone) {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner visible ${tone}`;
  if (tone === "warning" || tone === "error") {
    setControlsPanelExpanded(true);
  }
}
function clearStatus() {
  statusBanner.textContent = "";
  statusBanner.className = "status-banner";
}
function getPdfOcrStatusSuffix(decoded) {
  const extraction = decoded?.pdfExtraction;
  if (!extraction?.usedOcr) {
    return "";
  }
  const scannedPart = extraction.ocrPagesScanned ? ` OCR scanned ${extraction.ocrPagesScanned} page(s).` : " OCR fallback was used.";
  const confidencePart = typeof extraction.ocrAverageConfidence === "number" && extraction.ocrAverageConfidence > 0 ? ` Avg OCR confidence ${Math.round(extraction.ocrAverageConfidence)}%.` : "";
  const discardedPart = (extraction.ocrDiscardedWords ?? 0) > 0 ? ` Ignored ${extraction.ocrDiscardedWords} low-confidence OCR token(s).` : "";
  const warningPart = typeof extraction.ocrAverageConfidence === "number" && extraction.ocrAverageConfidence > 0 && extraction.ocrAverageConfidence < MIN_PDF_OCR_AVERAGE_CONFIDENCE_WARNING ? " OCR confidence is low; review output carefully." : "";
  return `${scannedPart}${confidencePart}${discardedPart}${warningPart}`;
}
function isPdfOcrLowConfidence(decoded) {
  const average = decoded?.pdfExtraction?.ocrAverageConfidence;
  return typeof average === "number" && average > 0 && average < MIN_PDF_OCR_AVERAGE_CONFIDENCE_WARNING;
}
function wirePreviewScrollSync() {
  const sync = (source, target) => {
    if (syncingScroll) {
      return;
    }
    if (source.classList.contains("docx-layout") || target.classList.contains("docx-layout")) {
      return;
    }
    syncingScroll = true;
    target.scrollTop = source.scrollTop;
    setTimeout(() => {
      syncingScroll = false;
    }, 0);
  };
  originalPreview.addEventListener("scroll", () => sync(originalPreview, sanitizedPreview));
  sanitizedPreview.addEventListener("scroll", () => sync(sanitizedPreview, originalPreview));
}
function resetPreviewLayoutClass(container) {
  container.classList.remove("docx-layout", "pdf-layout");
}
function clearEverything() {
  currentFile = null;
  currentFileContent = null;
  currentFileName = "";
  sanitizedContent = null;
  detectedPII = [];
  fileType = "";
  currentDecodedFile = null;
  sanitizedBlob = null;
  manualSelection = /* @__PURE__ */ new Map();
  manualCandidates = [];
  pendingPopupCandidateIds = [];
  requiresManualExportOverride = false;
  pendingManualOverrideHighRiskCount = 0;
  setControlsPanelExpanded(!autoRunOnUpload);
  hideManualSelectionPopup();
  autoModeRadios.forEach((radio) => {
    radio.disabled = false;
  });
  autoCleanBtn.disabled = true;
  manualCleanBtn.disabled = true;
  downloadBtn.disabled = true;
  applySelectedMode(selectedAutoMode, false);
  updateManualReviewUi();
  originalPreview.innerHTML = "";
  sanitizedPreview.innerHTML = "";
  resetPreviewLayoutClass(originalPreview);
  resetPreviewLayoutClass(sanitizedPreview);
  mainContainer.classList.remove("active");
  uploadZone.classList.remove("hidden");
  fileInput.value = "";
  clearStatus();
}
function resetControlStateForNewFile() {
  autoModeRadios.forEach((radio) => {
    radio.disabled = false;
  });
  manualSelection = /* @__PURE__ */ new Map();
  manualCandidates = [];
  pendingPopupCandidateIds = [];
  requiresManualExportOverride = false;
  pendingManualOverrideHighRiskCount = 0;
  hideManualSelectionPopup();
  autoCleanBtn.disabled = true;
  manualCleanBtn.disabled = true;
  downloadBtn.disabled = true;
  applySelectedMode(selectedAutoMode, false);
  updateManualReviewUi();
  sanitizedContent = null;
  sanitizedBlob = null;
}
async function processFile(file) {
  clearStatus();
  const preflightError = validateUploadPreflight(file);
  if (preflightError) {
    setStatus(preflightError, "error");
    return;
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    setStatus("File too large. Maximum size is 10 MB.", "error");
    return;
  }
  currentFile = file;
  currentFileName = file.name;
  resetControlStateForNewFile();
  currentDecodedFile = null;
  const extension = getExtension(file.name);
  const isImage = isImageFile(file, extension);
  setStatus(`Loaded ${file.name}. Preparing preview...`, "success");
  if (isImage) {
    fileType = "image";
    await displayImage(file);
    return;
  }
  await displayDecodedFile(file);
}
async function displayDecodedFile(file) {
  try {
    const decodeTimeoutMs = fileType === "pdf" || file.name.toLowerCase().endsWith(".pdf") ? PDF_DECODE_TIMEOUT_MS : DECODE_TIMEOUT_MS;
    const decoded = await withTimeout(decodeUploadedFileLazy(file), decodeTimeoutMs, "File decode");
    currentDecodedFile = decoded;
    if (decoded.kind === "unsupported") {
      currentFileContent = null;
      detectedPII = [];
      fileType = "";
      resetPreviewLayoutClass(originalPreview);
      resetPreviewLayoutClass(sanitizedPreview);
      originalPreview.innerHTML = decoded.previewHtml;
      sanitizedPreview.innerHTML = `<pre>Cannot process this file type.
${decoded.unsupportedReason ?? "Unsupported file format."}</pre>`;
      autoModeRadios.forEach((radio) => {
        radio.checked = false;
        radio.disabled = true;
      });
      autoCleanBtn.disabled = true;
      manualCleanBtn.disabled = true;
      downloadBtn.disabled = true;
      manualSelection = /* @__PURE__ */ new Map();
      manualCandidates = [];
      updateManualReviewUi();
      setStatus(decoded.unsupportedReason ?? "Unsupported file format.", "warning");
      showPreview();
      return;
    }
    currentFileContent = decoded.extractedText;
    detectedPII = detectMatches(decoded.extractedText, PII_PATTERNS);
    manualCandidates = buildManualCandidates(detectedPII);
    manualSelection = new Map(manualCandidates.map((candidate) => [candidate.id, candidate]));
    fileType = decoded.kind;
    if (decoded.kind === "docx") {
      await renderDocxPreview(originalPreview, file);
      updateManualReviewUi();
      applyDocxHighlights();
    } else if (decoded.kind === "pdf") {
      await renderPdfPreview(originalPreview, file);
      updateManualReviewUi();
    } else {
      resetPreviewLayoutClass(originalPreview);
      originalPreview.innerHTML = decoded.previewHtml;
      updateManualReviewUi();
      renderManualPreview();
    }
    if (decoded.sanitizationCapability !== "preserve-format") {
      let detectOnlyMessage = decoded.kind === "pdf" ? pdfRedactionEngine.getSupport().message : decoded.unsupportedReason ?? "Preserve-format sanitization is unavailable for this file type.";
      if (decoded.kind === "pdf") {
        const plan = pdfRedactionEngine.buildPlan(decoded.extractedText, decoded.pdfExtraction);
        const unresolvedSuffix = plan.unresolvedTargetCount > 0 ? ` ${plan.unresolvedTargetCount} match target(s) could not be mapped to extraction spans yet.` : "";
        const ocrSuffix = decoded.pdfExtraction?.usedOcr ? " OCR fallback was used while extracting text." : "";
        detectOnlyMessage = `${detectOnlyMessage} Detected ${plan.matchCount} candidate item(s).${unresolvedSuffix}${ocrSuffix}`.trim();
      }
      resetPreviewLayoutClass(sanitizedPreview);
      sanitizedPreview.innerHTML = `<pre>${detectOnlyMessage}</pre>`;
      autoModeRadios.forEach((radio) => {
        radio.checked = false;
        radio.disabled = true;
      });
      autoCleanBtn.disabled = true;
      manualCleanBtn.disabled = true;
      downloadBtn.disabled = true;
      manualSelection = /* @__PURE__ */ new Map();
      manualCandidates = [];
      updateManualReviewUi();
      setStatus(detectOnlyMessage, "warning");
      showPreview();
      return;
    }
    if (decoded.kind === "pdf") {
      if (selectedAutoMode === "replace") {
        applySelectedMode("hide", true);
      }
      autoModeRadios.forEach((radio) => {
        if (radio.value === "replace") {
          radio.checked = false;
          radio.disabled = true;
          return;
        }
        radio.disabled = false;
        radio.checked = selectedAutoMode === "hide";
      });
      updatePreModeUi("hide");
    }
    resetPreviewLayoutClass(sanitizedPreview);
    sanitizedPreview.innerHTML = "<pre>Sanitizing automatically\u2026</pre>";
    autoCleanBtn.disabled = false;
    showPreview();
    if (autoRunOnUpload) {
      await performAutoClean(selectedAutoMode, true);
      return;
    }
    sanitizedPreview.innerHTML = "<pre>Ready to sanitize. Click Clean when you are ready.</pre>";
    setStatus("Preview ready. Select mode if needed, then click Clean.", "warning");
  } catch (error) {
    console.error("Error reading file:", error);
    const reason = error instanceof Error ? error.message : "Please try again.";
    setStatus(`Error reading file. ${reason}`, "error");
  }
}
async function displayImage(file) {
  const dataUrl = await readFileAsDataUrl(file);
  currentFileContent = dataUrl;
  resetPreviewLayoutClass(originalPreview);
  resetPreviewLayoutClass(sanitizedPreview);
  originalPreview.innerHTML = `<img src="${dataUrl}" alt="Original">`;
  sanitizedPreview.innerHTML = '<pre style="color: #f59e0b; text-align: center; padding: 40px;">Image sanitization is not supported yet.\nUpload text or CSV for cleaning.</pre>';
  autoModeRadios.forEach((radio) => {
    radio.disabled = true;
    radio.checked = false;
  });
  autoCleanBtn.disabled = true;
  manualCleanBtn.disabled = true;
  downloadBtn.disabled = true;
  setStatus("Image preview loaded. Image sanitization is not available yet.", "warning");
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
function fitReplacementLength(replacement, sourceValue) {
  const targetLength = sourceValue.length;
  if (replacement.length === targetLength) {
    return replacement;
  }
  if (replacement.length > targetLength) {
    return replacement.slice(0, targetLength);
  }
  let padded = replacement;
  for (let index = replacement.length; index < targetLength; index += 1) {
    const sourceChar = sourceValue[index] ?? "x";
    if (/\d/.test(sourceChar)) {
      padded += "0";
      continue;
    }
    if (/[a-z]/.test(sourceChar)) {
      padded += "x";
      continue;
    }
    if (/[A-Z]/.test(sourceChar)) {
      padded += "X";
      continue;
    }
    padded += sourceChar === " " ? " " : "x";
  }
  return padded;
}
function formatLeakDetails(matches) {
  if (matches.length === 0) {
    return "";
  }
  const first = matches[0];
  if (!first) {
    return "";
  }
  const sample = first.value.length > 48 ? `${first.value.slice(0, 48)}\u2026` : first.value;
  return ` First unresolved field: ${first.type} (${sample}).`;
}
function applyCsvOutputHardening(text) {
  if (fileType !== "csv") {
    return { text, updatedCells: 0 };
  }
  return neutralizeCsvFormulaInjection(text);
}
function sanitizePlainText(inputText, mode) {
  const matches = detectMatches(inputText, PII_PATTERNS).sort((a, b) => b.index - a.index);
  if (matches.length === 0) {
    return {
      cleanedText: inputText,
      replacements: 0,
      unchangedMatches: []
    };
  }
  let cleanedText = inputText;
  const unchangedMatches = [];
  for (const pii of matches) {
    const before = cleanedText.substring(0, pii.index);
    const after = cleanedText.substring(pii.index + pii.length);
    const generated = mode === "hide" ? "\u2588".repeat(pii.length) : generateSafeReplacement(pii);
    const replacement = fitReplacementLength(generated, pii.value);
    if (mode === "replace" && replacement === pii.value) {
      unchangedMatches.push(pii);
    }
    cleanedText = before + replacement + after;
  }
  return {
    cleanedText,
    replacements: matches.length,
    unchangedMatches
  };
}
function sanitizeBySelectedMatches(inputText, mode, matches) {
  const orderedMatches = [...matches].sort((a, b) => b.index - a.index);
  if (orderedMatches.length === 0) {
    return {
      cleanedText: inputText,
      replacements: 0,
      unchangedMatches: []
    };
  }
  let cleanedText = inputText;
  const unchangedMatches = [];
  for (const pii of orderedMatches) {
    const before = cleanedText.substring(0, pii.index);
    const after = cleanedText.substring(pii.index + pii.length);
    const generated = mode === "hide" ? "\u2588".repeat(pii.length) : generateSafeReplacement(pii);
    const replacement = fitReplacementLength(generated, pii.value);
    if (mode === "replace" && replacement === pii.value) {
      unchangedMatches.push(pii);
    }
    cleanedText = before + replacement + after;
  }
  return {
    cleanedText,
    replacements: orderedMatches.length,
    unchangedMatches
  };
}
function maybeOpenManualSelectionPopup() {
  if (manualCandidates.length === 0) {
    hideManualSelectionPopup();
    return;
  }
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    hideManualSelectionPopup();
    return;
  }
  const range = selection.getRangeAt(0);
  if (!originalPreview.contains(range.commonAncestorContainer)) {
    hideManualSelectionPopup();
    return;
  }
  const previewRoot = originalPreview.querySelector("pre") ?? originalPreview;
  const prefixRange = document.createRange();
  prefixRange.selectNodeContents(previewRoot);
  prefixRange.setEnd(range.startContainer, range.startOffset);
  const selectedText = selection.toString();
  const start = prefixRange.toString().length;
  const end = start + selectedText.length;
  const overlapping = manualCandidates.filter((candidate) => candidate.match.index < end && candidate.match.index + candidate.match.length > start).map((candidate) => candidate.id);
  if (overlapping.length === 0) {
    hideManualSelectionPopup();
    return;
  }
  pendingPopupCandidateIds = overlapping;
  const rect = range.getBoundingClientRect();
  const popupWidth = 152;
  const left = Math.max(8, Math.min(window.innerWidth - popupWidth - 8, rect.left + rect.width / 2 - popupWidth / 2));
  const top = Math.max(8, rect.top - 42);
  manualSelectionPopup.style.left = `${left}px`;
  manualSelectionPopup.style.top = `${top}px`;
  manualSelectionPopup.classList.add("visible");
}
function hideManualSelectionPopup() {
  manualSelectionPopup.classList.remove("visible");
  pendingPopupCandidateIds = [];
}
function applyPopupSelection(mode) {
  if (pendingPopupCandidateIds.length === 0) {
    hideManualSelectionPopup();
    return;
  }
  applySelectedMode(mode, true);
  pendingPopupCandidateIds.forEach((id) => toggleManualSelection(id, true));
  hideManualSelectionPopup();
  window.getSelection()?.removeAllRanges();
  setStatus(`Selected instance(s) queued for manual ${mode}. Click Apply Selection to sanitize.`, "success");
}
async function sanitizeDocxPreservingFormat(file, mode, selectedOccurrences) {
  const buffer = await file.arrayBuffer();
  const JSZipModule = await loadJsZip();
  const zip = await JSZipModule.default.loadAsync(buffer);
  const unsafeEntries = detectUnsafeDocxEntryPaths(Object.keys(zip.files));
  if (unsafeEntries.length > 0) {
    throw new Error(`Unsafe DOCX content detected (${unsafeEntries.slice(0, 3).join(", ")}).`);
  }
  const strippedMetadataFields = await scrubDocxMetadata(zip);
  const xmlTargets = Object.keys(zip.files).filter(
    (path) => /^word\/(document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/i.test(path)
  );
  let totalReplacements = 0;
  const unchangedMatches = [];
  const cleanedTextParts = [];
  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const seenOccurrences = /* @__PURE__ */ new Map();
  for (const target of xmlTargets) {
    const entry = zip.file(target);
    if (!entry) {
      continue;
    }
    const xml = await entry.async("string");
    const doc = parser.parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length > 0) {
      throw new Error(`Could not parse DOCX XML part: ${target}`);
    }
    const elements = Array.from(doc.getElementsByTagName("*"));
    const paragraphs = elements.filter((element) => element.localName === "p");
    for (const paragraph of paragraphs) {
      const paragraphElements = Array.from(paragraph.getElementsByTagName("*"));
      const textNodes = paragraphElements.filter((element) => element.localName === "t");
      if (textNodes.length === 0) {
        continue;
      }
      const originalSegments = textNodes.map((node) => node.textContent ?? "");
      const paragraphText = originalSegments.join("");
      if (!paragraphText.trim()) {
        continue;
      }
      const paragraphMatches = detectMatches(paragraphText, PII_PATTERNS).sort((a, b) => a.index - b.index);
      const selectedMatches = selectedOccurrences ? paragraphMatches.filter((match) => {
        const signature = matchSignature(match);
        const nextOccurrence = (seenOccurrences.get(signature) ?? 0) + 1;
        seenOccurrences.set(signature, nextOccurrence);
        return selectedOccurrences.get(signature)?.has(nextOccurrence) ?? false;
      }) : paragraphMatches;
      const { cleanedText, replacements, unchangedMatches: unchangedInParagraph } = sanitizeBySelectedMatches(paragraphText, mode, selectedMatches);
      cleanedTextParts.push(cleanedText);
      unchangedMatches.push(...unchangedInParagraph);
      if (replacements === 0) {
        continue;
      }
      totalReplacements += replacements;
      let offset = 0;
      for (let index = 0; index < textNodes.length; index += 1) {
        const node = textNodes[index];
        if (!node) {
          continue;
        }
        const segmentLength = originalSegments[index]?.length ?? 0;
        const nextOffset = offset + segmentLength;
        node.textContent = cleanedText.slice(offset, nextOffset);
        offset = nextOffset;
      }
    }
    const updatedXml = serializer.serializeToString(doc);
    zip.file(target, updatedXml);
  }
  const resultBlob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
  return {
    blob: resultBlob,
    previewText: cleanedTextParts.join("\n"),
    replacements: totalReplacements,
    unchangedMatches,
    strippedMetadataFields
  };
}
async function scrubDocxMetadata(zip) {
  const metadataPaths = ["docProps/core.xml", "docProps/app.xml", "docProps/custom.xml"];
  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  let strippedFields = 0;
  for (const metadataPath of metadataPaths) {
    const entry = zip.file(metadataPath);
    if (!entry) {
      continue;
    }
    const xml = await entry.async("string");
    const doc = parser.parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length > 0) {
      continue;
    }
    const nodes = Array.from(doc.getElementsByTagName("*"));
    for (const node of nodes) {
      const hasElementChildren = Array.from(node.childNodes).some((child) => child.nodeType === Node.ELEMENT_NODE);
      if (hasElementChildren) {
        continue;
      }
      const existingText = node.textContent ?? "";
      if (existingText.trim().length > 0) {
        node.textContent = "";
        strippedFields += 1;
      }
    }
    zip.file(metadataPath, serializer.serializeToString(doc));
  }
  const commentsEntry = zip.file("word/comments.xml");
  if (commentsEntry) {
    const commentsXml = await commentsEntry.async("string");
    const commentsDoc = parser.parseFromString(commentsXml, "application/xml");
    if (commentsDoc.getElementsByTagName("parsererror").length === 0) {
      const comments = Array.from(commentsDoc.getElementsByTagName("*")).filter((element) => element.localName === "comment");
      for (const comment of comments) {
        ["w:author", "w:initials", "w:date"].forEach((attributeName) => {
          if (comment.hasAttribute(attributeName)) {
            comment.setAttribute(attributeName, "");
            strippedFields += 1;
          }
        });
      }
      zip.file("word/comments.xml", serializer.serializeToString(commentsDoc));
    }
  }
  return strippedFields;
}
async function renderDocxPreview(container, source) {
  container.innerHTML = "";
  container.classList.remove("pdf-layout");
  container.classList.add("docx-layout");
  const host = document.createElement("div");
  host.className = "docx-preview-host";
  container.appendChild(host);
  const data = await source.arrayBuffer();
  const { renderAsync } = await loadDocxPreview();
  await renderAsync(data, host, void 0, {
    inWrapper: true,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    useBase64URL: true
  });
}
async function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import("./chunks/pdf-6HZVGYLV.js");
  }
  return pdfJsPromise;
}
async function ensurePdfPreviewWorkerConfigured(pdfjs) {
  if (pdfPreviewWorkerBootstrapPromise) {
    return pdfPreviewWorkerBootstrapPromise;
  }
  pdfPreviewWorkerBootstrapPromise = (async () => {
    try {
      const workerModule = await import("./chunks/pdf.worker-5DTW4FBD.js");
      const scope = globalThis;
      if (!scope.pdfjsWorker) {
        scope.pdfjsWorker = workerModule;
      }
      if (pdfjs.GlobalWorkerOptions.workerPort) {
        pdfjs.GlobalWorkerOptions.workerPort = null;
      }
    } catch (error) {
      console.warn("PDF preview worker bootstrap failed. Falling back to default worker resolution.", error);
    }
  })();
  return pdfPreviewWorkerBootstrapPromise;
}
async function renderPdfPreview(container, source) {
  container.innerHTML = "";
  container.classList.remove("docx-layout");
  container.classList.add("pdf-layout");
  const host = document.createElement("div");
  host.className = "pdf-preview-host";
  container.appendChild(host);
  const data = await source.arrayBuffer();
  const pdfjs = await loadPdfJs();
  await ensurePdfPreviewWorkerConfigured(pdfjs);
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
  try {
    const doc = await loadingTask.promise;
    const pageLimit = Math.min(doc.numPages, MAX_PDF_PREVIEW_PAGES);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: PDF_PREVIEW_SCALE });
      const pageWrap = document.createElement("div");
      pageWrap.className = "pdf-preview-page-wrap";
      const pageLabel = document.createElement("div");
      pageLabel.className = "pdf-preview-page-label";
      pageLabel.textContent = `Page ${pageNumber}`;
      const canvas = document.createElement("canvas");
      canvas.className = "pdf-preview-page";
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) {
        continue;
      }
      await page.render({ canvasContext: context, viewport }).promise;
      pageWrap.appendChild(pageLabel);
      pageWrap.appendChild(canvas);
      host.appendChild(pageWrap);
    }
    if (doc.numPages > pageLimit) {
      const overflowNote = document.createElement("div");
      overflowNote.className = "pdf-preview-overflow";
      overflowNote.textContent = `Showing first ${pageLimit} of ${doc.numPages} pages in preview.`;
      host.appendChild(overflowNote);
    }
  } finally {
    try {
      await loadingTask.destroy();
    } catch {
    }
  }
}
async function performAutoClean(mode, autoTriggered) {
  if (!currentFileContent) {
    setStatus("No file content available to sanitize.", "warning");
    return;
  }
  if (fileType === "image") {
    setStatus("Image sanitization is not supported yet. Please upload text, CSV, or DOCX.", "warning");
    return;
  }
  if (currentDecodedFile && currentDecodedFile.sanitizationCapability !== "preserve-format") {
    setStatus(currentDecodedFile.unsupportedReason ?? "Preserve-format sanitization is not available for this file type yet.", "warning");
    return;
  }
  if (fileType === "pdf") {
    if (!currentFile || !currentDecodedFile) {
      setStatus("No PDF file selected.", "warning");
      return;
    }
    const effectiveMode = mode === "replace" ? "hide" : mode;
    if (mode === "replace") {
      applySelectedMode("hide", true);
      setStatus("PDF currently supports Hide mode only. Running hide redaction instead.", "warning");
    }
    try {
      const plan = pdfRedactionEngine.buildPlan(currentFileContent, currentDecodedFile.pdfExtraction);
      const result = await pdfRedactionEngine.applyPlan(currentFile, plan);
      if (result.status !== "redacted" || !result.redactedBlob) {
        downloadBtn.disabled = true;
        sanitizedBlob = null;
        sanitizedContent = currentFileContent;
        setStatus(result.message, "error");
        resetPreviewLayoutClass(sanitizedPreview);
        sanitizedPreview.innerHTML = `<pre>${result.message}</pre>`;
        return;
      }
      sanitizedBlob = result.redactedBlob;
      sanitizedContent = currentFileContent;
      requiresManualExportOverride = plan.unresolvedTargetCount > 0;
      pendingManualOverrideHighRiskCount = plan.unresolvedTargetCount;
      downloadBtn.disabled = false;
      const unresolvedNote = plan.unresolvedTargetCount > 0 ? ` ${plan.unresolvedTargetCount} target(s) could not be resolved to extraction spans.` : "";
      const ocrNote = getPdfOcrStatusSuffix(currentDecodedFile);
      const tone = plan.unresolvedTargetCount > 0 || isPdfOcrLowConfidence(currentDecodedFile) ? "warning" : "success";
      const actionLabel = autoTriggered ? "Auto-sanitized PDF" : "Sanitized PDF";
      setStatus(`${actionLabel} in ${effectiveMode} mode. Updated ${plan.matchCount} detected item(s).${unresolvedNote}${ocrNote}`.trim(), tone);
      await renderPdfPreview(sanitizedPreview, result.redactedBlob);
      return;
    } catch (error) {
      console.error("PDF sanitization failed:", error);
      const reason = error instanceof Error ? error.message : "Unknown PDF processing error.";
      setStatus(`Could not sanitize PDF. ${reason}`, "error");
      downloadBtn.disabled = true;
      sanitizedBlob = null;
      return;
    }
  }
  if (fileType === "docx") {
    if (!currentFile) {
      setStatus("No file selected.", "warning");
      return;
    }
    try {
      const { blob, previewText, replacements: replacements2, unchangedMatches: unchangedMatches2, strippedMetadataFields } = await withTimeout(
        sanitizeDocxPreservingFormat(currentFile, mode),
        DOCX_SANITIZE_TIMEOUT_MS,
        "DOCX sanitization"
      );
      const residualMatches2 = detectMatches(previewText, PII_PATTERNS);
      const highRiskResidual2 = filterHighRiskResidual(residualMatches2);
      const highRiskUnchanged2 = filterHighRiskResidual(unchangedMatches2);
      const shouldBlock2 = mode === "hide" ? highRiskResidual2.length > 0 : highRiskUnchanged2.length > 0;
      if (shouldBlock2) {
        requiresManualExportOverride = false;
        pendingManualOverrideHighRiskCount = 0;
        sanitizedBlob = null;
        sanitizedContent = previewText;
        downloadBtn.disabled = true;
        await renderDocxPreview(sanitizedPreview, blob);
        const issueCount = mode === "hide" ? highRiskResidual2.length : highRiskUnchanged2.length;
        const leakDetails = mode === "replace" ? formatLeakDetails(highRiskUnchanged2) : "";
        setStatus(`Sanitization blocked: ${issueCount} original sensitive value(s) still present after cleaning.${leakDetails}`, "error");
        return;
      }
      sanitizedBlob = blob;
      sanitizedContent = previewText;
      requiresManualExportOverride = false;
      pendingManualOverrideHighRiskCount = 0;
      await renderDocxPreview(sanitizedPreview, blob);
      downloadBtn.disabled = false;
      if (replacements2 === 0) {
        const metadataNote = strippedMetadataFields > 0 ? ` Metadata scrubbed (${strippedMetadataFields} fields).` : "";
        setStatus(`No sensitive data detected. Document appears clean.${metadataNote}`.trim(), "success");
      } else {
        const metadataNote = strippedMetadataFields > 0 ? ` Metadata scrubbed (${strippedMetadataFields} fields).` : "";
        setStatus(autoTriggered ? `Auto-sanitized DOCX in ${mode} mode. Updated ${replacements2} sensitive instance(s).${metadataNote}` : `Sanitized DOCX in ${mode} mode. Updated ${replacements2} sensitive instance(s).${metadataNote}`, "success");
      }
      return;
    } catch (error) {
      console.error("DOCX sanitization failed:", error);
      const reason = error instanceof Error ? error.message : "The file may be encrypted or malformed.";
      setStatus(`Could not sanitize DOCX while preserving format. ${reason}`, "error");
      return;
    }
  }
  resetPreviewLayoutClass(sanitizedPreview);
  const inputText = currentFileContent;
  const { cleanedText, replacements, unchangedMatches } = sanitizePlainText(inputText, mode);
  const residualMatches = detectMatches(cleanedText, PII_PATTERNS);
  const highRiskResidual = filterHighRiskResidual(residualMatches);
  const highRiskUnchanged = filterHighRiskResidual(unchangedMatches);
  sanitizedBlob = null;
  const shouldBlock = mode === "hide" ? highRiskResidual.length > 0 : highRiskUnchanged.length > 0;
  const hardenedBlockedOutput = applyCsvOutputHardening(cleanedText);
  if (shouldBlock) {
    requiresManualExportOverride = false;
    pendingManualOverrideHighRiskCount = 0;
    sanitizedContent = hardenedBlockedOutput.text;
    sanitizedPreview.innerHTML = fileType === "csv" ? csvToTable(hardenedBlockedOutput.text) : `<pre>${escapeHtml(hardenedBlockedOutput.text)}</pre>`;
    downloadBtn.disabled = true;
    const issueCount = mode === "hide" ? highRiskResidual.length : highRiskUnchanged.length;
    const leakDetails = mode === "replace" ? formatLeakDetails(highRiskUnchanged) : "";
    setStatus(`Sanitization blocked: ${issueCount} original sensitive value(s) still present after cleaning.${leakDetails}`, "error");
    return;
  }
  const autoOutput = replacements === 0 ? inputText : cleanedText;
  const hardenedOutput = applyCsvOutputHardening(autoOutput);
  const csvSafetyNote = hardenedOutput.updatedCells > 0 ? ` CSV safety hardened ${hardenedOutput.updatedCells} formula-like cell(s).` : "";
  if (replacements === 0) {
    sanitizedContent = hardenedOutput.text;
    requiresManualExportOverride = false;
    pendingManualOverrideHighRiskCount = 0;
    sanitizedPreview.innerHTML = fileType === "csv" ? csvToTable(hardenedOutput.text) : `<pre>${escapeHtml(hardenedOutput.text)}</pre>`;
    downloadBtn.disabled = false;
    setStatus(`No sensitive data detected. File appears clean.${csvSafetyNote}`.trim(), "success");
    return;
  }
  sanitizedContent = hardenedOutput.text;
  requiresManualExportOverride = false;
  pendingManualOverrideHighRiskCount = 0;
  sanitizedPreview.innerHTML = fileType === "csv" ? csvToTable(hardenedOutput.text) : `<pre>${escapeHtml(hardenedOutput.text)}</pre>`;
  downloadBtn.disabled = false;
  setStatus(autoTriggered ? `Auto-sanitized file in ${mode} mode. Updated ${replacements} sensitive instance(s).${csvSafetyNote}` : `Sanitized file in ${mode} mode. Updated ${replacements} sensitive instance(s).${csvSafetyNote}`, "success");
}
async function performManualClean() {
  if (!currentFileContent) {
    setStatus("Upload a supported file to sanitize first.", "warning");
    return;
  }
  if (fileType === "image") {
    setStatus("Manual selection is not supported for images.", "warning");
    return;
  }
  const selectedCandidates = Array.from(manualSelection.values());
  if (selectedCandidates.length === 0) {
    setStatus("Select at least one detected value to apply manual sanitization.", "warning");
    return;
  }
  if (fileType === "docx") {
    if (!currentFile) {
      setStatus("No file selected.", "warning");
      return;
    }
    try {
      const selectionTarget = buildSelectedOccurrences(selectedCandidates);
      const { blob, previewText, replacements: replacements2, unchangedMatches: unchangedMatches2, strippedMetadataFields } = await withTimeout(
        sanitizeDocxPreservingFormat(currentFile, selectedAutoMode, selectionTarget),
        DOCX_SANITIZE_TIMEOUT_MS,
        "DOCX manual sanitization"
      );
      const highRiskUnchanged2 = filterHighRiskResidual(unchangedMatches2);
      if (selectedAutoMode === "replace" && highRiskUnchanged2.length > 0) {
        requiresManualExportOverride = false;
        pendingManualOverrideHighRiskCount = 0;
        sanitizedBlob = null;
        sanitizedContent = previewText;
        downloadBtn.disabled = true;
        await renderDocxPreview(sanitizedPreview, blob);
        const leakDetails = formatLeakDetails(highRiskUnchanged2);
        setStatus(`Manual sanitization blocked: ${highRiskUnchanged2.length} selected value(s) were not replaced.${leakDetails}`, "error");
        return;
      }
      sanitizedBlob = blob;
      sanitizedContent = previewText;
      const residualHighRisk2 = filterHighRiskResidual(detectMatches(previewText, PII_PATTERNS));
      requiresManualExportOverride = residualHighRisk2.length > 0;
      pendingManualOverrideHighRiskCount = residualHighRisk2.length;
      await renderDocxPreview(sanitizedPreview, blob);
      downloadBtn.disabled = false;
      const untouchedCount2 = Math.max(detectedPII.length - replacements2, 0);
      const metadataNote = strippedMetadataFields > 0 ? ` Metadata scrubbed (${strippedMetadataFields} fields).` : "";
      const overrideWarning2 = buildManualOverrideWarning(residualHighRisk2.length);
      const tone2 = residualHighRisk2.length > 0 ? "warning" : "success";
      setStatus(`Applied manual ${selectedAutoMode} to ${replacements2} selection(s). ${untouchedCount2} detected value(s) were left unchanged by choice.${metadataNote} ${overrideWarning2}`.trim(), tone2);
      return;
    } catch (error) {
      console.error("Manual DOCX sanitization failed:", error);
      const reason = error instanceof Error ? error.message : "Unknown DOCX processing error.";
      setStatus(`Could not apply manual sanitization to DOCX while preserving format. ${reason}`, "error");
      return;
    }
  }
  if (fileType === "pdf") {
    if (!currentFile || !currentDecodedFile) {
      setStatus("No PDF file selected.", "warning");
      return;
    }
    if (selectedAutoMode === "replace") {
      applySelectedMode("hide", true);
      setStatus("PDF currently supports Hide mode only. Switched to Hide for manual apply.", "warning");
    }
    try {
      const fullPlan = pdfRedactionEngine.buildPlan(currentFileContent, currentDecodedFile.pdfExtraction);
      const selectedPlan = filterPdfPlanBySelection(fullPlan, selectedCandidates);
      if (selectedPlan.matchCount === 0) {
        setStatus("No selected PDF matches could be mapped for redaction.", "warning");
        return;
      }
      const result = await pdfRedactionEngine.applyPlan(currentFile, selectedPlan);
      if (result.status !== "redacted" || !result.redactedBlob) {
        downloadBtn.disabled = true;
        sanitizedBlob = null;
        sanitizedContent = currentFileContent;
        setStatus(result.message, "error");
        resetPreviewLayoutClass(sanitizedPreview);
        sanitizedPreview.innerHTML = `<pre>${result.message}</pre>`;
        return;
      }
      sanitizedBlob = result.redactedBlob;
      sanitizedContent = currentFileContent;
      requiresManualExportOverride = selectedPlan.unresolvedTargetCount > 0;
      pendingManualOverrideHighRiskCount = selectedPlan.unresolvedTargetCount;
      await renderPdfPreview(sanitizedPreview, result.redactedBlob);
      downloadBtn.disabled = false;
      const untouchedCount2 = Math.max(detectedPII.length - selectedPlan.matchCount, 0);
      const unresolvedNote = selectedPlan.unresolvedTargetCount > 0 ? ` ${selectedPlan.unresolvedTargetCount} selected target(s) could not be resolved to extraction spans.` : "";
      const ocrNote = getPdfOcrStatusSuffix(currentDecodedFile);
      const tone2 = selectedPlan.unresolvedTargetCount > 0 || isPdfOcrLowConfidence(currentDecodedFile) ? "warning" : "success";
      setStatus(`Applied manual hide to ${selectedPlan.matchCount} selection(s). ${untouchedCount2} detected value(s) were left unchanged by choice.${unresolvedNote}${ocrNote}`.trim(), tone2);
      return;
    } catch (error) {
      console.error("Manual PDF sanitization failed:", error);
      const reason = error instanceof Error ? error.message : "Unknown PDF processing error.";
      setStatus(`Could not apply manual sanitization to PDF. ${reason}`, "error");
      return;
    }
  }
  const selectedMatches = selectedCandidates.map((candidate) => candidate.match);
  const { cleanedText, replacements, unchangedMatches } = sanitizeBySelectedMatches(currentFileContent, selectedAutoMode, selectedMatches);
  const highRiskUnchanged = filterHighRiskResidual(unchangedMatches);
  if (selectedAutoMode === "replace" && highRiskUnchanged.length > 0) {
    requiresManualExportOverride = false;
    pendingManualOverrideHighRiskCount = 0;
    const leakDetails = formatLeakDetails(highRiskUnchanged);
    setStatus(`Manual sanitization blocked: ${highRiskUnchanged.length} selected value(s) were not replaced.${leakDetails}`, "error");
    return;
  }
  const hardenedOutput = applyCsvOutputHardening(cleanedText);
  const csvSafetyNote = hardenedOutput.updatedCells > 0 ? ` CSV safety hardened ${hardenedOutput.updatedCells} formula-like cell(s).` : "";
  sanitizedBlob = null;
  sanitizedContent = hardenedOutput.text;
  const residualHighRisk = filterHighRiskResidual(detectMatches(hardenedOutput.text, PII_PATTERNS));
  requiresManualExportOverride = residualHighRisk.length > 0;
  pendingManualOverrideHighRiskCount = residualHighRisk.length;
  resetPreviewLayoutClass(sanitizedPreview);
  sanitizedPreview.innerHTML = fileType === "csv" ? csvToTable(hardenedOutput.text) : `<pre>${escapeHtml(hardenedOutput.text)}</pre>`;
  downloadBtn.disabled = false;
  const untouchedCount = Math.max(detectedPII.length - replacements, 0);
  const overrideWarning = buildManualOverrideWarning(residualHighRisk.length);
  const tone = residualHighRisk.length > 0 ? "warning" : "success";
  setStatus(`Applied manual ${selectedAutoMode} to ${replacements} selection(s). ${untouchedCount} detected value(s) were left unchanged by choice.${csvSafetyNote} ${overrideWarning}`.trim(), tone);
}
function matchSignature(match) {
  return `${match.key}::${match.value}`;
}
function buildManualCandidates(matches) {
  const bySignature = /* @__PURE__ */ new Map();
  const ordered = [...matches].sort((a, b) => a.index - b.index);
  return ordered.map((match) => {
    const signature = matchSignature(match);
    const occurrence = (bySignature.get(signature) ?? 0) + 1;
    bySignature.set(signature, occurrence);
    const id = `${signature}::${occurrence}`;
    return {
      id,
      match,
      signature,
      occurrence
    };
  });
}
function buildSelectedOccurrences(selectedCandidates) {
  const selected = /* @__PURE__ */ new Map();
  for (const candidate of selectedCandidates) {
    const existing = selected.get(candidate.signature) ?? /* @__PURE__ */ new Set();
    existing.add(candidate.occurrence);
    selected.set(candidate.signature, existing);
  }
  return selected;
}
function filterPdfPlanBySelection(plan, selectedCandidates) {
  const selectedOccurrences = buildSelectedOccurrences(selectedCandidates);
  const seenOccurrences = /* @__PURE__ */ new Map();
  const targets = [];
  const matches = [];
  for (const target of plan.targets) {
    const signature = matchSignature(target.match);
    const occurrence = (seenOccurrences.get(signature) ?? 0) + 1;
    seenOccurrences.set(signature, occurrence);
    const selectedForSignature = selectedOccurrences.get(signature);
    if (!selectedForSignature?.has(occurrence)) {
      continue;
    }
    targets.push(target);
    matches.push(target.match);
  }
  const unresolvedTargetCount = targets.reduce((count, target) => count + (target.unresolved ? 1 : 0), 0);
  return {
    ...plan,
    matches,
    targets,
    unresolvedTargetCount,
    matchCount: targets.length
  };
}
function shortValue(value) {
  if (value.length <= 38) {
    return value;
  }
  return `${value.slice(0, 35)}\u2026`;
}
function escapeForRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function applyDocxHighlights() {
  const host = originalPreview.querySelector(".docx-preview-host");
  if (!host || manualCandidates.length === 0) {
    return;
  }
  const valueQueue = /* @__PURE__ */ new Map();
  for (const c of [...manualCandidates].sort((a, b) => a.match.index - b.match.index)) {
    const q = valueQueue.get(c.match.value) ?? [];
    q.push(c.id);
    valueQueue.set(c.match.value, q);
  }
  const idToType = new Map(manualCandidates.map((c) => [c.id, c.match.type]));
  const escapedValues = [...valueQueue.keys()].sort((a, b) => b.length - a.length).map(escapeForRegex);
  const pattern = new RegExp(`(${escapedValues.join("|")})`, "g");
  const occurrenceCursor = /* @__PURE__ */ new Map();
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let n;
  while (n = walker.nextNode()) {
    textNodes.push(n);
  }
  for (const textNode of textNodes) {
    const text = textNode.textContent ?? "";
    if (!text) {
      continue;
    }
    pattern.lastIndex = 0;
    if (!pattern.test(text)) {
      continue;
    }
    pattern.lastIndex = 0;
    const parent = textNode.parentNode;
    if (!parent) {
      continue;
    }
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let m;
    while ((m = pattern.exec(text)) !== null) {
      const value = m[1];
      const start = m.index;
      const end = start + value.length;
      if (start > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
      }
      const ids = valueQueue.get(value);
      const cursor = occurrenceCursor.get(value) ?? 0;
      const id = ids?.[cursor];
      if (id) {
        occurrenceCursor.set(value, cursor + 1);
        const mark = document.createElement("mark");
        mark.dataset.manualId = id;
        mark.title = idToType.get(id) ?? "";
        mark.className = manualSelection.has(id) ? "manual-hit manual-selected" : "manual-hit";
        mark.textContent = value;
        fragment.appendChild(mark);
      } else {
        fragment.appendChild(document.createTextNode(value));
      }
      lastIndex = end;
    }
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    parent.replaceChild(fragment, textNode);
  }
}
function updateDocxHighlights() {
  const host = originalPreview.querySelector(".docx-preview-host");
  if (!host) {
    return;
  }
  host.querySelectorAll("mark[data-manual-id]").forEach((mark) => {
    const id = mark.dataset.manualId ?? "";
    mark.className = manualSelection.has(id) ? "manual-hit manual-selected" : "manual-hit";
  });
}
function renderManualPreview() {
  if (!currentFileContent || manualCandidates.length === 0) {
    return;
  }
  if (fileType === "docx") {
    updateDocxHighlights();
    return;
  }
  if (fileType === "pdf") {
    return;
  }
  const ordered = [...manualCandidates].sort((a, b) => a.match.index - b.match.index);
  let cursor = 0;
  let html = "";
  for (const candidate of ordered) {
    const match = candidate.match;
    if (match.index < cursor) {
      continue;
    }
    const id = candidate.id;
    html += escapeHtml(currentFileContent.slice(cursor, match.index));
    const classes = manualSelection.has(id) ? "manual-hit manual-selected" : "manual-hit";
    html += `<mark class="${classes}" data-manual-id="${id}" title="${escapeHtml(match.type)}">${escapeHtml(match.value)}</mark>`;
    cursor = match.index + match.length;
  }
  html += escapeHtml(currentFileContent.slice(cursor));
  resetPreviewLayoutClass(originalPreview);
  originalPreview.innerHTML = `<pre>${html}</pre>`;
}
function toggleManualSelection(id, selected) {
  const candidate = manualCandidates.find((item) => item.id === id);
  if (!candidate) {
    return;
  }
  if (selected) {
    manualSelection.set(id, candidate);
  } else {
    manualSelection.delete(id);
  }
  updateManualReviewUi();
  renderManualPreview();
}
function updateManualReviewUi() {
  if (detectedPII.length === 0) {
    manualSummary.textContent = "No detected values found in this file.";
    manualList.innerHTML = "";
    manualCleanBtn.disabled = true;
    updateControlsToggleMeta();
    return;
  }
  const selectedCount = manualSelection.size;
  manualSummary.textContent = `${selectedCount} selected of ${manualCandidates.length} detected.`;
  const groups = /* @__PURE__ */ new Map();
  for (const candidate of manualCandidates) {
    const type = candidate.match.type;
    const list = groups.get(type) ?? [];
    list.push(candidate);
    groups.set(type, list);
  }
  const collapsedGroups = /* @__PURE__ */ new Set();
  manualList.querySelectorAll(".pii-group.collapsed").forEach((el) => {
    const type = el.dataset.groupType;
    if (type) {
      collapsedGroups.add(type);
    }
  });
  let html = "";
  for (const [type, candidates] of groups) {
    const groupSelectedCount = candidates.filter((c) => manualSelection.has(c.id)).length;
    const allSelected = groupSelectedCount === candidates.length;
    const someSelected = groupSelectedCount > 0 && !allSelected;
    const collapsed = collapsedGroups.has(type) ? " collapsed" : "";
    const checkedAttr = allSelected ? " checked" : "";
    html += `<div class="pii-group${collapsed}" data-group-type="${escapeHtml(type)}">`;
    html += `<div class="pii-group-header">`;
    html += `<svg class="pii-group-chevron" width="12" height="12" viewBox="0 0 12 12"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    html += `<input type="checkbox" class="pii-group-checkbox" data-group-type="${escapeHtml(type)}"${checkedAttr}${someSelected ? ' data-indeterminate="true"' : ""}>`;
    html += `<span class="pii-group-label">${escapeHtml(type)}</span>`;
    html += `<span class="pii-group-count">${groupSelectedCount}/${candidates.length}</span>`;
    html += `</div>`;
    html += `<div class="pii-group-items">`;
    for (const candidate of candidates) {
      const checked = manualSelection.has(candidate.id) ? "checked" : "";
      html += `<label class="manual-item"><input type="checkbox" data-manual-id="${candidate.id}" ${checked}><span class="manual-item-text">${escapeHtml(shortValue(candidate.match.value))}</span></label>`;
    }
    html += `</div></div>`;
  }
  manualList.innerHTML = html;
  manualList.querySelectorAll('.pii-group-checkbox[data-indeterminate="true"]').forEach((cb) => {
    cb.indeterminate = true;
  });
  manualCleanBtn.disabled = selectedCount === 0;
  updateControlsToggleMeta();
}
function downloadSanitizedFile() {
  if (!sanitizedContent && !sanitizedBlob) {
    setStatus("No sanitized output is available to download yet.", "warning");
    return;
  }
  if (requiresManualExportOverride && pendingManualOverrideHighRiskCount > 0) {
    const proceed = confirm(
      `High-risk data is still present (${pendingManualOverrideHighRiskCount} item${pendingManualOverrideHighRiskCount === 1 ? "" : "s"}). Download only if you intentionally accept this risk.`
    );
    if (!proceed) {
      setStatus("Download canceled. Manual override confirmation required when high-risk data remains.", "warning");
      return;
    }
    requiresManualExportOverride = false;
  }
  if (sanitizedBlob) {
    const url2 = URL.createObjectURL(sanitizedBlob);
    const link2 = document.createElement("a");
    link2.href = url2;
    link2.download = `sanitized_${currentFileName}`;
    document.body.appendChild(link2);
    link2.click();
    document.body.removeChild(link2);
    URL.revokeObjectURL(url2);
    return;
  }
  const blobType = fileType === "csv" ? "text/csv" : "text/plain";
  const blob = new Blob([sanitizedContent ?? ""], { type: blobType });
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
  const parsed = import_papaparse2.default.parse(csvText, {
    skipEmptyLines: true
  });
  const rows = parsed.data.map((row) => row.map((cell) => String(cell ?? "")));
  if (rows.length === 0) {
    return "<pre>Empty file</pre>";
  }
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
async function decodeUploadedFileLazy(file) {
  if (!decodeUploadedFilePromise) {
    decodeUploadedFilePromise = import("./chunks/registry-BRRHIGEC.js");
  }
  const module = await decodeUploadedFilePromise;
  return module.decodeUploadedFile(file);
}
async function loadJsZip() {
  if (!jsZipPromise) {
    jsZipPromise = import("./chunks/jszip.min-P7KPSLGK.js");
  }
  return jsZipPromise;
}
async function loadDocxPreview() {
  if (!docxPreviewPromise) {
    docxPreviewPromise = import("./chunks/docx-preview-JGFSSVEN.js");
  }
  return docxPreviewPromise;
}
function showPreview() {
  uploadZone.classList.add("hidden");
  mainContainer.classList.add("active");
}
