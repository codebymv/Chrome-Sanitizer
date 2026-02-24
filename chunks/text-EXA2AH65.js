import {
  escapeHtml,
  readTextWithEncodingFallback
} from "./chunk-5JENT2UN.js";
import "./chunk-KH45J4DC.js";

// src/shared/file/decoders/text.ts
async function decodeTextFile(file, extension) {
  const text = await readTextWithEncodingFallback(file);
  return {
    kind: "text",
    fileName: file.name,
    mimeType: file.type,
    extension,
    extractedText: text,
    previewHtml: `<pre>${escapeHtml(text)}</pre>`,
    canSanitizePreservingFormat: true,
    sanitizationCapability: "preserve-format"
  };
}
export {
  decodeTextFile
};
