import { readTextWithEncodingFallback, escapeHtml } from '../utils';
import type { DecodedFile } from '../types';

export async function decodeTextFile(file: File, extension: string): Promise<DecodedFile> {
  const text = await readTextWithEncodingFallback(file);
  return {
    kind: 'text',
    fileName: file.name,
    mimeType: file.type,
    extension,
    extractedText: text,
    previewHtml: `<pre>${escapeHtml(text)}</pre>`,
    canSanitizePreservingFormat: true
  };
}
