// src/shared/file/security.ts
var DECODE_TIMEOUT_MS = 15e3;
var PDF_DECODE_TIMEOUT_MS = 45e3;
var DOCX_SANITIZE_TIMEOUT_MS = 2e4;
var MAX_PDF_PAGES = 75;
var MAX_PDF_EXTRACTED_CHARS = 75e4;
var MAX_PDF_OCR_PAGES = 20;
var MIN_PDF_OCR_WORD_CONFIDENCE = 50;
var MIN_PDF_OCR_AVERAGE_CONFIDENCE_WARNING = 65;
var OCR_INIT_TIMEOUT_MS = 15e3;
var OCR_RECOGNIZE_TIMEOUT_MS = 3e4;
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

export {
  DECODE_TIMEOUT_MS,
  PDF_DECODE_TIMEOUT_MS,
  DOCX_SANITIZE_TIMEOUT_MS,
  MAX_PDF_PAGES,
  MAX_PDF_EXTRACTED_CHARS,
  MAX_PDF_OCR_PAGES,
  MIN_PDF_OCR_WORD_CONFIDENCE,
  MIN_PDF_OCR_AVERAGE_CONFIDENCE_WARNING,
  OCR_INIT_TIMEOUT_MS,
  OCR_RECOGNIZE_TIMEOUT_MS,
  withTimeout
};
