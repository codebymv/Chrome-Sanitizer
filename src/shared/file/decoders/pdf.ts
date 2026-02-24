import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  MAX_PDF_EXTRACTED_CHARS,
  MAX_PDF_OCR_PAGES,
  MAX_PDF_PAGES,
  MIN_PDF_OCR_WORD_CONFIDENCE
} from '../security';
import { createPdfRedactionEngine, getPdfRedactionSupportMessage } from '../redaction/pdf/engine';
import { escapeHtml } from '../utils';
import type { DecodedFile } from '../types';
import type { PdfTextSpan } from '../redaction/pdf/types';

interface PdfTextItem {
  str?: string;
  width?: number;
  height?: number;
  transform?: number[];
}

interface OcrWord {
  text?: string;
  confidence?: number;
  bbox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

interface OcrRecognizeResult {
  data?: {
    words?: OcrWord[];
  };
}

interface OcrRuntime {
  recognize: (image: string, language: string) => Promise<OcrRecognizeResult>;
  dispose: () => Promise<void>;
}

interface TesseractCreateWorkerOptions {
  workerPath?: string;
  corePath?: string;
  langPath?: string;
  workerBlobURL?: boolean;
  gzip?: boolean;
  logger?: (message: unknown) => void;
}

interface TesseractWorkerInstance {
  recognize: (image: string) => Promise<OcrRecognizeResult>;
  terminate?: () => Promise<void>;
}

let workerBootstrapPromise: Promise<void> | null = null;
let tesseractPromise: Promise<typeof import('tesseract.js')> | null = null;

async function ensurePdfWorkerConfigured(): Promise<void> {
  if (workerBootstrapPromise) {
    return workerBootstrapPromise;
  }

  workerBootstrapPromise = (async () => {
    try {
      const workerModule = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
      const scope = globalThis as typeof globalThis & { pdfjsWorker?: unknown };

      if (!scope.pdfjsWorker) {
        scope.pdfjsWorker = workerModule;
      }

      if (pdfjs.GlobalWorkerOptions.workerPort) {
        pdfjs.GlobalWorkerOptions.workerPort = null;
      }
    } catch (error) {
      console.warn('PDF.js worker bootstrap failed. Falling back to default worker resolution.', error);
    }
  })();

  return workerBootstrapPromise;
}

async function loadTesseract(): Promise<typeof import('tesseract.js')> {
  if (!tesseractPromise) {
    tesseractPromise = import('tesseract.js');
  }
  return tesseractPromise;
}

async function createOcrRuntime(): Promise<OcrRuntime> {
  const module = await loadTesseract();
  const runtime = module as unknown as {
    createWorker?: (
      language?: string,
      oem?: number,
      options?: TesseractCreateWorkerOptions,
      config?: Record<string, string>
    ) => Promise<TesseractWorkerInstance>;
    default?: {
      createWorker?: (
        language?: string,
        oem?: number,
        options?: TesseractCreateWorkerOptions,
        config?: Record<string, string>
      ) => Promise<TesseractWorkerInstance>;
    };
  };

  const createWorker = runtime.createWorker ?? runtime.default?.createWorker;
  if (typeof createWorker !== 'function') {
    throw new Error('OCR runtime is unavailable: tesseract createWorker not found.');
  }

  const ocrAssetRoot = getLocalOcrAssetRoot();
  const workerPath = localOcrAssetUrl('worker.min.js');
  const corePath = localOcrAssetUrl('tesseract-core-lstm.wasm.js');
  const worker = await createWorker(
    'eng',
    1,
    {
      workerPath,
      corePath,
      langPath: ocrAssetRoot,
      workerBlobURL: false,
      gzip: true,
      logger: () => {}
    },
    {}
  );

  if (typeof worker.recognize !== 'function') {
    throw new Error('OCR worker initialization failed: recognize method unavailable.');
  }

  return {
    recognize: async (image) => worker.recognize(image),
    dispose: async () => {
      if (typeof worker.terminate === 'function') {
        await worker.terminate();
      }
    }
  };
}

function getLocalOcrAssetRoot(): string {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) {
    throw new Error('OCR requires extension runtime URLs and cannot run in this context.');
  }

  const root = chrome.runtime.getURL('assets/ocr');
  assertLocalExtensionUrl(root);
  return root.replace(/\/$/, '');
}

function localOcrAssetUrl(fileName: string): string {
  const url = `${getLocalOcrAssetRoot()}/${fileName}`;
  assertLocalExtensionUrl(url);
  return url;
}

function assertLocalExtensionUrl(url: string): void {
  const isLocalExtensionUrl =
    url.startsWith('chrome-extension://')
    || url.startsWith('moz-extension://')
    || url.startsWith('safari-web-extension://');

  if (!isLocalExtensionUrl) {
    throw new Error(`OCR local-only policy violation: expected extension-local URL, received ${url}`);
  }
}

function normalizeTokenText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function pushSpan(
  spans: PdfTextSpan[],
  pageNumber: number,
  tokenText: string,
  cursor: number,
  bbox?: PdfTextSpan['bbox']
): number {
  const start = cursor;
  const end = start + tokenText.length;
  spans.push({
    pageNumber,
    start,
    end,
    text: tokenText,
    bbox
  });
  return end;
}

async function extractNativeText(doc: pdfjs.PDFDocumentProxy): Promise<{ pageTexts: string[]; spans: PdfTextSpan[]; extractedChars: number; }> {
  const pageTexts: string[] = [];
  const spans: PdfTextSpan[] = [];
  let extractedChars = 0;
  let cursor = 0;

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const tokens = textContent.items as PdfTextItem[];
    const pageTokens: string[] = [];

    if (pageTexts.length > 0) {
      cursor += 2;
    }

    for (const token of tokens) {
      const tokenText = normalizeTokenText(token.str ?? '');
      if (!tokenText) {
        continue;
      }

      if (pageTokens.length > 0) {
        cursor += 1;
      }

      const transform = token.transform ?? [];
      const x = Number(transform[4] ?? 0);
      const y = Number(transform[5] ?? 0);
      const width = Math.max(Number(token.width ?? 0), 1);
      const heightGuess = Number(token.height ?? Math.abs(transform[3] ?? 0));
      const height = Math.max(heightGuess, 8);

      cursor = pushSpan(spans, pageNumber, tokenText, cursor, {
        x,
        y,
        width,
        height,
        pageHeight: viewport.height
      });

      pageTokens.push(tokenText);
    }

    const pageText = pageTokens.join(' ');
    if (!pageText) {
      continue;
    }

    extractedChars += pageText.length;
    if (extractedChars > MAX_PDF_EXTRACTED_CHARS) {
      throw new Error(`PDF text exceeds maximum supported extraction size (${MAX_PDF_EXTRACTED_CHARS} chars).`);
    }

    pageTexts.push(pageText);
  }

  return { pageTexts, spans, extractedChars };
}

async function extractWithOcr(doc: pdfjs.PDFDocumentProxy): Promise<{ pageTexts: string[]; spans: PdfTextSpan[]; extractedChars: number; pagesScanned: number; averageConfidence: number; discardedWords: number; }> {
  if (typeof document === 'undefined') {
    return { pageTexts: [], spans: [], extractedChars: 0, pagesScanned: 0, averageConfidence: 0, discardedWords: 0 };
  }

  const pageTexts: string[] = [];
  const spans: PdfTextSpan[] = [];
  let extractedChars = 0;
  let cursor = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;
  let discardedWords = 0;
  const pageCount = Math.min(doc.numPages, MAX_PDF_OCR_PAGES);
  const OCR_SCALE = 1.8;
  const ocr = await createOcrRuntime();

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: OCR_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      const context = canvas.getContext('2d');
      if (!context) {
        continue;
      }

      await page.render({ canvasContext: context, viewport }).promise;
      const image = canvas.toDataURL('image/png');
      const result = await ocr.recognize(image, 'eng');
      const words = result.data?.words ?? [];
      const pageTokens: string[] = [];

      if (pageTexts.length > 0) {
        cursor += 2;
      }

      for (const word of words) {
        const tokenText = normalizeTokenText(word.text ?? '');
        if (!tokenText) {
          continue;
        }

        const confidence = Number(word.confidence ?? 0);
        const hasConfidence = Number.isFinite(confidence) && confidence > 0;
        if (hasConfidence) {
          confidenceSum += confidence;
          confidenceCount += 1;
        }

        if (hasConfidence && confidence < MIN_PDF_OCR_WORD_CONFIDENCE) {
          discardedWords += 1;
          continue;
        }

        if (pageTokens.length > 0) {
          cursor += 1;
        }

        const bbox = word.bbox;
        const x0 = Number(bbox?.x0 ?? 0);
        const y0 = Number(bbox?.y0 ?? 0);
        const x1 = Number(bbox?.x1 ?? x0 + 1);
        const y1 = Number(bbox?.y1 ?? y0 + 8);
        const width = Math.max(x1 - x0, 1);
        const height = Math.max(y1 - y0, 8);

        cursor = pushSpan(spans, pageNumber, tokenText, cursor, {
          x: x0 / OCR_SCALE,
          y: (viewport.height - y1) / OCR_SCALE,
          width: width / OCR_SCALE,
          height: height / OCR_SCALE,
          pageHeight: viewport.height / OCR_SCALE
        });

        pageTokens.push(tokenText);
      }

      const pageText = pageTokens.join(' ');
      if (!pageText) {
        continue;
      }

      extractedChars += pageText.length;
      if (extractedChars > MAX_PDF_EXTRACTED_CHARS) {
        throw new Error(`PDF OCR text exceeds maximum supported extraction size (${MAX_PDF_EXTRACTED_CHARS} chars).`);
      }

      pageTexts.push(pageText);
    }
  } finally {
    await ocr.dispose();
  }

  return {
    pageTexts,
    spans,
    extractedChars,
    pagesScanned: pageCount,
    averageConfidence: confidenceCount > 0 ? confidenceSum / confidenceCount : 0,
    discardedWords
  };
}

export async function decodePdfFile(file: File, extension: string): Promise<DecodedFile> {
  await ensurePdfWorkerConfigured();
  const support = createPdfRedactionEngine().getSupport();
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });

  try {
    const doc = await loadingTask.promise;
    if (doc.numPages > MAX_PDF_PAGES) {
      throw new Error(`PDF has ${doc.numPages} pages. Maximum supported is ${MAX_PDF_PAGES}.`);
    }

    const native = await extractNativeText(doc);
    let pageTexts = native.pageTexts;
    let spans = native.spans;
    let usedOcr = false;
    let ocrPagesScanned: number | undefined;
    let ocrAverageConfidence: number | undefined;
    let ocrDiscardedWords: number | undefined;

    let ocrError: string | undefined;

    if (pageTexts.length === 0) {
      try {
        const ocr = await extractWithOcr(doc);
        pageTexts = ocr.pageTexts;
        spans = ocr.spans;
        usedOcr = ocr.pageTexts.length > 0;
        ocrPagesScanned = ocr.pagesScanned;
        ocrAverageConfidence = ocr.averageConfidence;
        ocrDiscardedWords = ocr.discardedWords;

        if (!usedOcr && doc.numPages > MAX_PDF_OCR_PAGES) {
          ocrError = `OCR fallback scanned ${MAX_PDF_OCR_PAGES} of ${doc.numPages} pages but found no text.`;
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error('PDF OCR fallback failed:', reason);
        ocrError = `OCR failed: ${reason}`;
      }
    }

    const extractedText = pageTexts.join('\n\n');
    const previewSuffix = usedOcr
      ? '\n\n(OCR fallback was used for this PDF.)'
      : ocrError
        ? `\n\n(${ocrError})`
        : '';

    const emptyTextMessage = ocrError
      ? `No readable text found in PDF. ${ocrError}`
      : 'No readable text found in PDF.';

    return {
      kind: 'pdf',
      fileName: file.name,
      mimeType: file.type,
      extension,
      extractedText,
      previewHtml: `<pre>${escapeHtml((extractedText || emptyTextMessage) + previewSuffix)}</pre>`,
      canSanitizePreservingFormat: support.status === 'ready',
      sanitizationCapability: support.status === 'ready' ? 'preserve-format' : 'detect-only',
      unsupportedReason: support.status === 'ready' ? undefined : getPdfRedactionSupportMessage(),
      pdfExtraction: {
        pageCount: doc.numPages,
        usedOcr,
        spans,
        ocrPagesScanned,
        ocrAverageConfidence,
        ocrDiscardedWords
      }
    };
  } finally {
    try {
      await loadingTask.destroy();
    } catch {
      // Ignore teardown errors from PDF.js tasks.
    }
  }
}
