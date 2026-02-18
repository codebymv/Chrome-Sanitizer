import mammoth from 'mammoth';
import { escapeHtml } from '../utils';
import type { DecodedFile } from '../types';

export async function decodeDocxFile(file: File, extension: string): Promise<DecodedFile> {
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const extractedText = result.value.trim();

  const warningText = result.messages.length > 0
    ? `\n\n---\nSome document structures could not be parsed perfectly.`
    : '';

  return {
    kind: 'docx',
    fileName: file.name,
    mimeType: file.type,
    extension,
    extractedText,
    previewHtml: `<pre>${escapeHtml(extractedText || 'No readable text found.')}${escapeHtml(warningText)}</pre>`,
    canSanitizePreservingFormat: true
  };
}
