export type DecodedFileKind = 'text' | 'csv' | 'docx' | 'pdf' | 'unsupported';

export interface DecodedFile {
  kind: DecodedFileKind;
  fileName: string;
  mimeType: string;
  extension: string;
  extractedText: string;
  previewHtml: string;
  canSanitizePreservingFormat: boolean;
  unsupportedReason?: string;
}

export interface Decoder {
  canHandle: (file: File, extension: string) => boolean;
  decode: (file: File, extension: string) => Promise<DecodedFile>;
}
