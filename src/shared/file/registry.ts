import { decodeCsvFile } from './decoders/csv';
import { decodeDocxFile } from './decoders/docx';
import { decodePdfFile } from './decoders/pdf';
import { decodeTextFile } from './decoders/text';
import type { DecodedFile, Decoder } from './types';
import { getExtension } from './utils';

const textExtensions = new Set(['.txt', '.md', '.json', '.xml', '.log', '.html', '.htm']);
const csvExtensions = new Set(['.csv', '.tsv']);

const decoders: Decoder[] = [
  {
    canHandle: (file, extension) => file.type.startsWith('text/') || textExtensions.has(extension),
    decode: (file, extension) => decodeTextFile(file, extension)
  },
  {
    canHandle: (file, extension) => file.type === 'text/csv' || csvExtensions.has(extension),
    decode: (file, extension) => decodeCsvFile(file, extension)
  },
  {
    canHandle: (file, extension) => extension === '.docx',
    decode: (file, extension) => decodeDocxFile(file, extension)
  },
  {
    canHandle: (file, extension) => file.type === 'application/pdf' || extension === '.pdf',
    decode: (file, extension) => decodePdfFile(file, extension)
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
