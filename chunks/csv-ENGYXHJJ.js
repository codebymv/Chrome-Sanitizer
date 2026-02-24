import {
  require_papaparse_min
} from "./chunk-BRPFH2NL.js";
import {
  escapeHtml,
  readTextWithEncodingFallback
} from "./chunk-5JENT2UN.js";
import {
  __toESM
} from "./chunk-KH45J4DC.js";

// src/shared/file/decoders/csv.ts
var import_papaparse = __toESM(require_papaparse_min(), 1);
function csvRowsToTable(rows) {
  if (rows.length === 0) {
    return "<pre>Empty file</pre>";
  }
  let html = "<table>";
  html += "<thead><tr>";
  for (const cell of rows[0] ?? []) {
    html += `<th>${escapeHtml(cell)}</th>`;
  }
  html += "</tr></thead>";
  if (rows.length > 1) {
    html += "<tbody>";
    for (const row of rows.slice(1)) {
      html += "<tr>";
      for (const cell of row) {
        html += `<td>${escapeHtml(cell)}</td>`;
      }
      html += "</tr>";
    }
    html += "</tbody>";
  }
  html += "</table>";
  return html;
}
async function decodeCsvFile(file, extension) {
  const rawText = await readTextWithEncodingFallback(file);
  const parsed = import_papaparse.default.parse(rawText, {
    skipEmptyLines: true
  });
  const rows = parsed.data.map((row) => row.map((cell) => String(cell ?? "")));
  return {
    kind: "csv",
    fileName: file.name,
    mimeType: file.type,
    extension,
    extractedText: rawText,
    previewHtml: csvRowsToTable(rows),
    canSanitizePreservingFormat: true,
    sanitizationCapability: "preserve-format"
  };
}
export {
  decodeCsvFile
};
