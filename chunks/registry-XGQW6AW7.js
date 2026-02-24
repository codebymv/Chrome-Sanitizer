import {
  getExtension
} from "./chunk-5JENT2UN.js";
import "./chunk-KH45J4DC.js";

// src/shared/file/registry.ts
var textExtensions = /* @__PURE__ */ new Set([".txt", ".md", ".json", ".xml", ".log", ".html", ".htm"]);
var csvExtensions = /* @__PURE__ */ new Set([".csv", ".tsv"]);
var docxExtensions = /* @__PURE__ */ new Set([".docx"]);
var pdfExtensions = /* @__PURE__ */ new Set([".pdf"]);
var knownBinaryExtensions = /* @__PURE__ */ new Set([
  ".docx",
  ".pdf",
  ".zip",
  ".rar",
  ".7z",
  ".exe",
  ".dll",
  ".bin",
  ".pptx",
  ".xlsx"
]);
async function decodeUploadedFile(file) {
  const extension = getExtension(file.name);
  if (docxExtensions.has(extension)) {
    const { decodeDocxFile } = await import("./docx-2US35TEA.js");
    return decodeDocxFile(file, extension);
  }
  if (file.type === "application/pdf" || pdfExtensions.has(extension)) {
    const { decodePdfFile } = await import("./pdf-HVTFX74G.js");
    return decodePdfFile(file, extension);
  }
  if (file.type === "text/csv" || csvExtensions.has(extension)) {
    const { decodeCsvFile } = await import("./csv-ENGYXHJJ.js");
    return decodeCsvFile(file, extension);
  }
  if (!knownBinaryExtensions.has(extension) && (file.type.startsWith("text/") || textExtensions.has(extension))) {
    const { decodeTextFile } = await import("./text-EXA2AH65.js");
    return decodeTextFile(file, extension);
  }
  return {
    kind: "unsupported",
    fileName: file.name,
    mimeType: file.type,
    extension,
    extractedText: "",
    previewHtml: "<pre>Unsupported format. Please upload TXT, CSV/TSV, DOCX, or PDF.</pre>",
    canSanitizePreservingFormat: false,
    sanitizationCapability: "unsupported",
    unsupportedReason: "Unsupported file format for decoding."
  };
}
export {
  decodeUploadedFile
};
