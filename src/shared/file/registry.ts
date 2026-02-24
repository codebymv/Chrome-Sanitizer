import type { DecodedFile } from './types';
import { getExtension } from './utils';

const textExtensions = new Set(['.txt', '.md', '.json', '.xml', '.log', '.html', '.htm']);
const csvExtensions = new Set(['.csv', '.tsv']);
const docxExtensions = new Set(['.docx']);
const pdfExtensions = new Set(['.pdf']);
const knownBinaryExtensions = new Set([
  '.docx', '.pdf', '.zip', '.rar', '.7z', '.exe', '.dll', '.bin', '.pptx', '.xlsx'
]);

export async function decodeUploadedFile(file: File): Promise<DecodedFile> {
  const extension = getExtension(file.name);

  if (docxExtensions.has(extension)) {
    const { decodeDocxFile } = await import('./decoders/docx');
    return decodeDocxFile(file, extension);
  }

  if (file.type === 'application/pdf' || pdfExtensions.has(extension)) {
    const { decodePdfFile } = await import('./decoders/pdf');
    return decodePdfFile(file, extension);
  }

  if (file.type === 'text/csv' || csvExtensions.has(extension)) {
    const { decodeCsvFile } = await import('./decoders/csv');
    return decodeCsvFile(file, extension);
  }

  if (!knownBinaryExtensions.has(extension) && (file.type.startsWith('text/') || textExtensions.has(extension))) {
    const { decodeTextFile } = await import('./decoders/text');
    return decodeTextFile(file, extension);
  }

  return {
    kind: 'unsupported',
    fileName: file.name,
    mimeType: file.type,
    extension,
    extractedText: '',
    previewHtml: '<pre>Unsupported format. Please upload TXT, CSV/TSV, DOCX, or PDF.</pre>',
    canSanitizePreservingFormat: false,
    sanitizationCapability: 'unsupported',
    unsupportedReason: 'Unsupported file format for decoding.'
  };
}
