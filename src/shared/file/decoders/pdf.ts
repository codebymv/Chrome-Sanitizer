import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { MAX_PDF_EXTRACTED_CHARS, MAX_PDF_PAGES } from '../security';
import { getPdfRedactionSupportMessage } from '../redaction/pdf/engine';
import { escapeHtml } from '../utils';
import type { DecodedFile } from '../types';

interface PdfTextItem {
  str?: string;
}

let workerBootstrapPromise: Promise<void> | null = null;

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

export async function decodePdfFile(file: File, extension: string): Promise<DecodedFile> {
  await ensurePdfWorkerConfigured();
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });

  try {
    const doc = await loadingTask.promise;
    if (doc.numPages > MAX_PDF_PAGES) {
      throw new Error(`PDF has ${doc.numPages} pages. Maximum supported is ${MAX_PDF_PAGES}.`);
    }

    const pageTexts: string[] = [];
    let extractedChars = 0;

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const tokens = textContent.items as PdfTextItem[];
      const pageText = tokens.map((item) => item.str ?? '').join(' ').trim();
      if (pageText) {
        extractedChars += pageText.length;
        if (extractedChars > MAX_PDF_EXTRACTED_CHARS) {
          throw new Error(`PDF text exceeds maximum supported extraction size (${MAX_PDF_EXTRACTED_CHARS} chars).`);
        }
        pageTexts.push(pageText);
      }
    }

    const extractedText = pageTexts.join('\n\n');

    return {
      kind: 'pdf',
      fileName: file.name,
      mimeType: file.type,
      extension,
      extractedText,
      previewHtml: `<pre>${escapeHtml(extractedText || 'No readable text found in PDF.')}</pre>`,
      canSanitizePreservingFormat: false,
      sanitizationCapability: 'detect-only',
      unsupportedReason: getPdfRedactionSupportMessage()
    };
  } finally {
    try {
      await loadingTask.destroy();
    } catch {
      // Ignore teardown errors from PDF.js tasks.
    }
  }
}
