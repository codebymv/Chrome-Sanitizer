import Papa from 'papaparse';
import { readTextWithEncodingFallback, escapeHtml } from '../utils';
import type { DecodedFile } from '../types';

function csvRowsToTable(rows: string[][]): string {
  if (rows.length === 0) {
    return '<pre>Empty file</pre>';
  }

  let html = '<table>';
  html += '<thead><tr>';
  for (const cell of rows[0] ?? []) {
    html += `<th>${escapeHtml(cell)}</th>`;
  }
  html += '</tr></thead>';

  if (rows.length > 1) {
    html += '<tbody>';
    for (const row of rows.slice(1)) {
      html += '<tr>';
      for (const cell of row) {
        html += `<td>${escapeHtml(cell)}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody>';
  }

  html += '</table>';
  return html;
}

export async function decodeCsvFile(file: File, extension: string): Promise<DecodedFile> {
  const rawText = await readTextWithEncodingFallback(file);
  const parsed = Papa.parse<string[]>(rawText, {
    skipEmptyLines: true
  });

  const rows = parsed.data.map((row) => row.map((cell) => String(cell ?? '')));

  return {
    kind: 'csv',
    fileName: file.name,
    mimeType: file.type,
    extension,
    extractedText: rawText,
    previewHtml: csvRowsToTable(rows),
    canSanitizePreservingFormat: true
  };
}
