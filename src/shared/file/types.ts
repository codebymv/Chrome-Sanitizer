export type DecodedFileKind = 'text' | 'csv' | 'docx' | 'pdf' | 'unsupported';
export type SanitizationCapability = 'preserve-format' | 'detect-only' | 'unsupported';

import type { PdfExtractionContext } from './redaction/pdf/types';

export interface DecodedFile {
  kind: DecodedFileKind;
  fileName: string;
  mimeType: string;
  extension: string;
  extractedText: string;
  previewHtml: string;
  canSanitizePreservingFormat: boolean;
  sanitizationCapability: SanitizationCapability;
  unsupportedReason?: string;
  pdfExtraction?: PdfExtractionContext;
}

export interface Decoder {
  canHandle: (file: File, extension: string) => boolean;
  decode: (file: File, extension: string) => Promise<DecodedFile>;
}
