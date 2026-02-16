import { detectMatches } from '../shared/pii/detector';
import { PII_PATTERNS } from '../shared/pii/patterns';
import type { DetectedMatch } from '../shared/types';

type FileKind = 'text' | 'csv' | 'image' | '';
type AutoMode = 'hide' | 'replace';

const uploadZone = mustGet<HTMLElement>('uploadZone');
const fileInput = mustGet<HTMLInputElement>('fileInput');
const mainContainer = mustGet<HTMLElement>('mainContainer');
const originalPreview = mustGet<HTMLElement>('originalPreview');
const sanitizedPreview = mustGet<HTMLElement>('sanitizedPreview');
const downloadBtn = mustGet<HTMLButtonElement>('downloadBtn');
const resetSelectionsBtn = mustGet<HTMLButtonElement>('resetSelectionsBtn');
const clearFileBtn = mustGet<HTMLButtonElement>('clearFileBtn');
const autoCleanBtn = mustGet<HTMLButtonElement>('autoCleanBtn');
const manualCleanBtn = mustGet<HTMLButtonElement>('manualCleanBtn');

const autoModeRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="autoMode"]'));
const manualModeRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="manualMode"]'));

let currentFile: File | null = null;
let currentFileContent: string | null = null;
let currentFileName = '';
let sanitizedContent: string | null = null;
let detectedPII: DetectedMatch[] = [];
let fileType: FileKind = '';
let lastAutoSelected: HTMLInputElement | null = null;

uploadZone.addEventListener('click', () => {
  fileInput.click();
});

uploadZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (event) => {
  event.preventDefault();
  uploadZone.classList.remove('dragover');
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    void processFile(file);
  }
});

fileInput.addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    void processFile(file);
  }
});

resetSelectionsBtn.addEventListener('click', () => {
  autoModeRadios.forEach((radio) => {
    radio.checked = false;
  });
  autoCleanBtn.disabled = true;
  lastAutoSelected = null;
});

clearFileBtn.addEventListener('click', () => {
  if (confirm('⚠️ Clear the current file and start over?')) {
    clearEverything();
  }
});

autoModeRadios.forEach((radio) => {
  radio.addEventListener('click', (event) => {
    const target = event.target as HTMLInputElement;

    if (lastAutoSelected === target && target.checked) {
      target.checked = false;
      lastAutoSelected = null;
      autoCleanBtn.disabled = true;
      return;
    }

    lastAutoSelected = target;
    autoCleanBtn.disabled = false;
  });
});

manualModeRadios.forEach((radio) => {
  radio.addEventListener('click', (event) => {
    const target = event.target as HTMLInputElement;
    alert('Manual mode coming soon! Please use Auto mode for now.');
    target.checked = false;
  });
});

autoCleanBtn.addEventListener('click', () => {
  const selectedMode = document.querySelector<HTMLInputElement>('input[name="autoMode"]:checked')?.value;

  if (!selectedMode || !currentFileContent) {
    alert('Please select Hide or Replace mode first.');
    return;
  }

  performAutoClean(selectedMode as AutoMode);
});

manualCleanBtn.addEventListener('click', () => {
  alert('Manual mode coming soon!');
});

downloadBtn.addEventListener('click', () => {
  downloadSanitizedFile();
});

function mustGet<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element as T;
}

function clearEverything(): void {
  currentFile = null;
  currentFileContent = null;
  currentFileName = '';
  sanitizedContent = null;
  detectedPII = [];
  fileType = '';

  autoModeRadios.forEach((radio) => {
    radio.checked = false;
    radio.disabled = false;
  });
  manualModeRadios.forEach((radio) => {
    radio.checked = false;
    radio.disabled = false;
  });

  autoCleanBtn.disabled = true;
  manualCleanBtn.disabled = true;
  downloadBtn.disabled = true;
  lastAutoSelected = null;

  originalPreview.innerHTML = '';
  sanitizedPreview.innerHTML = '';

  mainContainer.classList.remove('active');
  uploadZone.classList.remove('hidden');
  fileInput.value = '';
}

function resetControlStateForNewFile(): void {
  autoModeRadios.forEach((radio) => {
    radio.checked = false;
    radio.disabled = false;
  });
  manualModeRadios.forEach((radio) => {
    radio.checked = false;
    radio.disabled = false;
  });

  autoCleanBtn.disabled = true;
  manualCleanBtn.disabled = true;
  downloadBtn.disabled = true;
  lastAutoSelected = null;
  sanitizedContent = null;
}

async function processFile(file: File): Promise<void> {
  if (file.size > 10 * 1024 * 1024) {
    alert('File too large. Maximum size is 10MB.');
    return;
  }

  currentFile = file;
  currentFileName = file.name;
  resetControlStateForNewFile();

  const fileName = file.name.toLowerCase();
  const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(fileName);

  if (isImage) {
    fileType = 'image';
    await displayImage(file);
    return;
  }

  if (fileName.endsWith('.csv')) {
    fileType = 'csv';
    await displayTextOrCsv(file, 'csv');
    return;
  }

  fileType = 'text';
  await displayTextOrCsv(file, 'text');
}

async function displayTextOrCsv(file: File, kind: 'text' | 'csv'): Promise<void> {
  try {
    const text = await file.text();
    currentFileContent = text;
    detectedPII = detectMatches(text, PII_PATTERNS);

    originalPreview.innerHTML = kind === 'csv' ? csvToTable(text) : `<pre>${escapeHtml(text)}</pre>`;
    sanitizedPreview.innerHTML = '<pre style="color: #6366f1; text-align: center; padding: 40px;">⚡ CLICK CLEAN TO SANITIZE ⚡</pre>';

    showPreview();
  } catch (error) {
    console.error('Error reading file:', error);
    alert('Error reading file. Please try again.');
  }
}

async function displayImage(file: File): Promise<void> {
  const dataUrl = await readFileAsDataUrl(file);
  currentFileContent = dataUrl;

  originalPreview.innerHTML = `<img src="${dataUrl}" alt="Original">`;
  sanitizedPreview.innerHTML = '<pre style="color: #f59e0b; text-align: center; padding: 40px;">Image sanitization is not supported yet.\nUpload text or CSV for cleaning.</pre>';

  autoModeRadios.forEach((radio) => {
    radio.disabled = true;
    radio.checked = false;
  });
  manualModeRadios.forEach((radio) => {
    radio.disabled = true;
    radio.checked = false;
  });

  autoCleanBtn.disabled = true;
  manualCleanBtn.disabled = true;
  downloadBtn.disabled = true;

  showPreview();
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Invalid image data'));}
    };
    reader.onerror = () => reject(new Error('Error reading image'));
    reader.readAsDataURL(file);
  });
}

function performAutoClean(mode: AutoMode): void {
  if (!currentFileContent) {
    alert('No file content available.');
    return;
  }

  if (fileType === 'image') {
    alert('Image sanitization is not supported yet. Please upload text or CSV.');
    return;
  }

  const inputText = currentFileContent;
  const matches = detectMatches(inputText, PII_PATTERNS).sort((a, b) => b.index - a.index);

  if (matches.length === 0) {
    sanitizedContent = inputText;
    sanitizedPreview.innerHTML = fileType === 'csv' ? csvToTable(inputText) : `<pre>${escapeHtml(inputText)}</pre>`;
    downloadBtn.disabled = false;
    alert('ℹ️ No PII detected. File appears clean!');
    return;
  }

  let cleanedContent = inputText;
  for (const pii of matches) {
    const before = cleanedContent.substring(0, pii.index);
    const after = cleanedContent.substring(pii.index + pii.length);

    cleanedContent = before + (mode === 'hide' ? '█'.repeat(pii.length) : generateFakeData(pii.value, pii.type)) + after;
  }

  sanitizedContent = cleanedContent;
  sanitizedPreview.innerHTML = fileType === 'csv' ? csvToTable(cleanedContent) : `<pre>${escapeHtml(cleanedContent)}</pre>`;
  downloadBtn.disabled = false;

  alert(`✓ Successfully cleaned ${matches.length} PII instance(s)!`);
}

function generateFakeData(original: string, type: string): string {
  switch (type) {
    case 'Financial':
      if (/^\d{3}-\d{2}-\d{4}$/.test(original)) {
        return `${randomDigits(3)}-${randomDigits(2)}-${randomDigits(4)}`;
      }
      if (/^\d{9}$/.test(original)) {
        return randomDigits(9);
      }
      return `${randomDigits(4)}-${randomDigits(4)}-${randomDigits(4)}-${randomDigits(4)}`;
    case 'Phone Number':
      return `(${randomDigits(3)}) ${randomDigits(3)}-${randomDigits(4)}`;
    case 'Email Address': {
      const domain = original.includes('@') ? original.split('@')[1] : 'example.com';
      return `user${randomDigits(4)}@${domain}`;
    }
    case 'ZIP Code':
      return original.length > 5 ? `${randomDigits(5)}-${randomDigits(4)}` : randomDigits(5);
    case 'IP Address':
      return `${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
    case 'Date of Birth':
      return `${randomDigits(2)}/${randomDigits(2)}/${randomDigits(4)}`;
    case 'Street Address':
      return `${randomInt(100, 9999)} ${randomLetters(2)} St`;
    default:
      return original
        .split('')
        .map((char) => {
          if (/\d/.test(char)) {
            return String(Math.floor(Math.random() * 10));
          }
          if (/[a-z]/.test(char)) {
            return String.fromCharCode(97 + Math.floor(Math.random() * 26));
          }
          if (/[A-Z]/.test(char)) {
            return String.fromCharCode(65 + Math.floor(Math.random() * 26));
          }
          return char;
        })
        .join('');
  }
}

function randomDigits(count: number): string {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 10)).join('');
}

function randomLetters(count: number): string {
  return Array.from({ length: count }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function downloadSanitizedFile(): void {
  if (!sanitizedContent) {
    alert('No sanitized content to download.');
    return;
  }

  const blob = new Blob([sanitizedContent], { type: fileType === 'csv' ? 'text/csv' : 'text/plain' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `sanitized_${currentFileName}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function csvToTable(csvText: string): string {
  const lines = csvText.split('\n').filter((line) => line.trim());
  if (lines.length === 0) {
    return '<pre>Empty file</pre>';
  }

  const rows = lines.map(parseCsvLine);

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

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(currentCell.trim());
      currentCell = '';
      continue;
    }
    currentCell += char;
  }

  cells.push(currentCell.trim());
  return cells;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showPreview(): void {
  uploadZone.classList.add('hidden');
  mainContainer.classList.add('active');
}
