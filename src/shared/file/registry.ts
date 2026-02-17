import { decodeCsvFile } from './decoders/csv';
import { decodeDocxFile } from './decoders/docx';
import { decodePdfFile } from './decoders/pdf';
import { decodeTextFile } from './decoders/text';
import type { DecodedFile, Decoder } from './types';
import { getExtension } from './utils';

const textExtensions = new Set(['.txt', '.md', '.json', '.xml', '.log', '.html', '.htm']);
const csvExtensions = new Set(['.csv', '.tsv']);
const docxExtensions = new Set(['.docx']);
const pdfExtensions = new Set(['.pdf']);
const knownBinaryExtensions = new Set([
  '.docx', '.pdf', '.zip', '.rar', '.7z', '.exe', '.dll', '.bin', '.pptx', '.xlsx'
]);

const decoders: Decoder[] = [
  {
    canHandle: (_file, extension) => docxExtensions.has(extension),
    decode: (file, extension) => decodeDocxFile(file, extension)
  },
  {
    canHandle: (file, extension) => file.type === 'application/pdf' || pdfExtensions.has(extension),
    decode: (file, extension) => decodePdfFile(file, extension)
  },
  {
    canHandle: (file, extension) => file.type === 'text/csv' || csvExtensions.has(extension),
    decode: (file, extension) => decodeCsvFile(file, extension)
  },
  {
    canHandle: (file, extension) => {
      if (knownBinaryExtensions.has(extension)) {
        return false;
      }
      return file.type.startsWith('text/') || textExtensions.has(extension);
    },
    decode: (file, extension) => decodeTextFile(file, extension)
  }
];

export async function decodeUploadedFile(file: File): Promise<DecodedFile> {
  const extension = getExtension(file.name);

  for (const decoder of decoders) {
    if (decoder.canHandle(file, extension)) {
      return decoder.decode(file, extension);
    }
  }

  return {
    kind: 'unsupported',
    fileName: file.name,
    mimeType: file.type,
    extension,
    extractedText: '',
    previewHtml: '<pre>Unsupported format. Please upload TXT, CSV/TSV, DOCX, or PDF.</pre>',
    canSanitizePreservingFormat: false,
    unsupportedReason: 'Unsupported file format for decoding.'
  };
}
