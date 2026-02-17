import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { escapeHtml } from '../utils';
import type { DecodedFile } from '../types';

interface PdfTextItem {
  str?: string;
}

export async function decodePdfFile(file: File, extension: string): Promise<DecodedFile> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });

  const doc = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const tokens = textContent.items as PdfTextItem[];
    const pageText = tokens.map((item) => item.str ?? '').join(' ').trim();
    if (pageText) {
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
    unsupportedReason: 'PDF text extraction is available, but preserve-format sanitization is not enabled yet.'
  };
}
