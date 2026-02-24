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

// src/shared/file/security.ts
var DECODE_TIMEOUT_MS = 15e3;
var DOCX_SANITIZE_TIMEOUT_MS = 2e4;
var MAX_PDF_PAGES = 75;
var MAX_PDF_EXTRACTED_CHARS = 75e4;
async function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

// src/shared/file/redaction/pdf/engine.ts
var PDF_REDACTION_SCAFFOLD_MESSAGE = "PDF redaction pipeline is scaffolded, but downloadable redacted PDFs stay disabled until object-level content removal is implemented.";
function buildTargets(planMatches, extraction) {
  if (!extraction || extraction.spans.length === 0) {
    return planMatches.map((match) => ({
      match,
      spanIndices: [],
      pageNumbers: [],
      unresolved: true
    }));
  }
  return planMatches.map((match) => {
    const matchStart = match.index;
    const matchEnd = match.index + match.length;
    const spanIndices = [];
    const pageNumbers = /* @__PURE__ */ new Set();
    extraction.spans.forEach((span, index) => {
      if (span.end <= matchStart || span.start >= matchEnd) {
        return;
      }
      spanIndices.push(index);
      pageNumbers.add(span.pageNumber);
    });
    return {
      match,
      spanIndices,
      pageNumbers: Array.from(pageNumbers).sort((left, right) => left - right),
      unresolved: spanIndices.length === 0
    };
  });
}
var ScaffoldPdfRedactionEngine = class {
  getSupport() {
    return {
      status: "scaffold",
      objectLevelRemoval: false,
      message: PDF_REDACTION_SCAFFOLD_MESSAGE
    };
  }
  buildPlan(extractedText, extraction) {
    const matches = detectMatches(extractedText, PII_PATTERNS);
    const targets = buildTargets(matches, extraction);
    const unresolvedTargetCount = targets.reduce((count, target) => count + (target.unresolved ? 1 : 0), 0);
    return {
      matches,
      targets,
      unresolvedTargetCount,
      matchCount: matches.length,
      generatedAt: Date.now()
    };
  }
  async applyPlan(_file, plan) {
    return {
      status: "unsupported",
      message: PDF_REDACTION_SCAFFOLD_MESSAGE,
      matchCount: plan.matchCount
    };
  }
};
function createPdfRedactionEngine() {
  return new ScaffoldPdfRedactionEngine();
}
function getPdfRedactionSupportMessage() {
  return PDF_REDACTION_SCAFFOLD_MESSAGE;
}

export {
  detectMatches,
  PII_PATTERNS,
  DECODE_TIMEOUT_MS,
  DOCX_SANITIZE_TIMEOUT_MS,
  MAX_PDF_PAGES,
  MAX_PDF_EXTRACTED_CHARS,
  withTimeout,
  createPdfRedactionEngine,
  getPdfRedactionSupportMessage
};
