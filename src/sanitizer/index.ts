import { detectMatches } from '../shared/pii/detector';
import { PII_PATTERNS } from '../shared/pii/patterns';
import type { DetectedMatch } from '../shared/types';
import { decodeUploadedFile } from '../shared/file/registry';
import type { DecodedFile } from '../shared/file/types';
import { getExtension, isImageFile, escapeHtml } from '../shared/file/utils';
import Papa from 'papaparse';
import JSZip from 'jszip';
import { renderAsync } from 'docx-preview';

type FileKind = 'text' | 'csv' | 'docx' | 'pdf' | 'image' | '';
type AutoMode = 'hide' | 'replace';
type StatusTone = 'success' | 'warning' | 'error';

const MODE_STORAGE_KEY = 'preferredAutoMode';

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
const statusBanner = mustGet<HTMLElement>('statusBanner');
const preModeHide = mustGet<HTMLButtonElement>('preModeHide');
const preModeReplace = mustGet<HTMLButtonElement>('preModeReplace');
const preModeHelp = mustGet<HTMLElement>('preModeHelp');

const autoModeRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="autoMode"]'));
const manualModeRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="manualMode"]'));

let currentFile: File | null = null;
let currentFileContent: string | null = null;
let currentFileName = '';
let sanitizedContent: string | null = null;
let detectedPII: DetectedMatch[] = [];
let fileType: FileKind = '';
let currentDecodedFile: DecodedFile | null = null;
let sanitizedBlob: Blob | null = null;
let selectedAutoMode: AutoMode = 'hide';
let syncingScroll = false;

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
  applySelectedMode(selectedAutoMode, true);
  clearStatus();
});

clearFileBtn.addEventListener('click', () => {
  if (confirm('⚠️ Clear the current file and start over?')) {
    clearEverything();
  }
});

autoModeRadios.forEach((radio) => {
  radio.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    if (!target.checked) {
      return;
    }

    applySelectedMode(target.value as AutoMode, true);

    if (currentFileContent && currentDecodedFile?.canSanitizePreservingFormat) {
      void performAutoClean(selectedAutoMode, false);
    }
  });
});

preModeHide.addEventListener('click', (event) => {
  event.stopPropagation();
  applySelectedMode('hide', true);
});

preModeReplace.addEventListener('click', (event) => {
  event.stopPropagation();
  applySelectedMode('replace', true);
});

manualModeRadios.forEach((radio) => {
  radio.addEventListener('click', (event) => {
    const target = event.target as HTMLInputElement;
    setStatus('Manual mode is coming soon. Auto mode remains active.', 'warning');
    target.checked = false;
  });
});

autoCleanBtn.addEventListener('click', () => {
  if (!currentFileContent) {
    setStatus('Upload a supported file to sanitize first.', 'warning');
    return;
  }

  void performAutoClean(selectedAutoMode, false);
});

manualCleanBtn.addEventListener('click', () => {
  setStatus('Manual mode is coming soon. Auto mode remains active.', 'warning');
});

downloadBtn.addEventListener('click', () => {
  downloadSanitizedFile();
});

wirePreviewScrollSync();
void initializeUiPreferences();

function mustGet<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element as T;
}

async function initializeUiPreferences(): Promise<void> {
  try {
    const result = await chrome.storage.local.get([MODE_STORAGE_KEY]);
    const stored = result[MODE_STORAGE_KEY];
    if (stored === 'hide' || stored === 'replace') {
      selectedAutoMode = stored;
    }
  } catch (error) {
    console.warn('Could not load preferred mode from storage:', error);
  }

  applySelectedMode(selectedAutoMode, false);
}

function updatePreModeUi(mode: AutoMode): void {
  preModeHide.classList.toggle('active', mode === 'hide');
  preModeReplace.classList.toggle('active', mode === 'replace');
  preModeHelp.textContent = mode === 'hide'
    ? 'Hide masks sensitive values with blocks. Applied automatically after upload.'
    : 'Replace swaps sensitive values with realistic placeholders. Applied automatically after upload.';
}

function applySelectedMode(mode: AutoMode, persist: boolean): void {
  selectedAutoMode = mode;
  autoModeRadios.forEach((radio) => {
    radio.checked = radio.value === mode;
  });
  updatePreModeUi(mode);
  autoCleanBtn.disabled = !currentFileContent;

  if (persist) {
    void chrome.storage.local.set({ [MODE_STORAGE_KEY]: mode });
  }
}

function setStatus(message: string, tone: StatusTone): void {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner visible ${tone}`;
}

function clearStatus(): void {
  statusBanner.textContent = '';
  statusBanner.className = 'status-banner';
}

function wirePreviewScrollSync(): void {
  const sync = (source: HTMLElement, target: HTMLElement) => {
    if (syncingScroll) {
      return;
    }

    if (source.classList.contains('docx-layout') || target.classList.contains('docx-layout')) {
      return;
    }

    syncingScroll = true;
    target.scrollTop = source.scrollTop;
    setTimeout(() => {
      syncingScroll = false;
    }, 0);
  };

  originalPreview.addEventListener('scroll', () => sync(originalPreview, sanitizedPreview));
  sanitizedPreview.addEventListener('scroll', () => sync(sanitizedPreview, originalPreview));
}

function clearEverything(): void {
  currentFile = null;
  currentFileContent = null;
  currentFileName = '';
  sanitizedContent = null;
  detectedPII = [];
  fileType = '';
  currentDecodedFile = null;
  sanitizedBlob = null;

  autoModeRadios.forEach((radio) => {
    radio.disabled = false;
  });
  manualModeRadios.forEach((radio) => {
    radio.checked = false;
    radio.disabled = false;
  });

  autoCleanBtn.disabled = true;
  manualCleanBtn.disabled = true;
  downloadBtn.disabled = true;
  applySelectedMode(selectedAutoMode, false);

  originalPreview.innerHTML = '';
  sanitizedPreview.innerHTML = '';
  originalPreview.classList.remove('docx-layout');
  sanitizedPreview.classList.remove('docx-layout');

  mainContainer.classList.remove('active');
  uploadZone.classList.remove('hidden');
  fileInput.value = '';
  clearStatus();
}

function resetControlStateForNewFile(): void {
  autoModeRadios.forEach((radio) => {
    radio.disabled = false;
  });
  manualModeRadios.forEach((radio) => {
    radio.checked = false;
    radio.disabled = false;
  });

  autoCleanBtn.disabled = true;
  manualCleanBtn.disabled = true;
  downloadBtn.disabled = true;
  applySelectedMode(selectedAutoMode, false);
  sanitizedContent = null;
  sanitizedBlob = null;
}

async function processFile(file: File): Promise<void> {
  clearStatus();

  if (file.size > 10 * 1024 * 1024) {
    setStatus('File too large. Maximum size is 10 MB.', 'error');
    return;
  }

  currentFile = file;
  currentFileName = file.name;
  resetControlStateForNewFile();
  currentDecodedFile = null;

  const extension = getExtension(file.name);
  const isImage = isImageFile(file, extension);

  setStatus(`Loaded ${file.name}. Preparing preview...`, 'success');

  if (isImage) {
    fileType = 'image';
    await displayImage(file);
    return;
  }

  await displayDecodedFile(file);
}

async function displayDecodedFile(file: File): Promise<void> {
  try {
    const decoded = await decodeUploadedFile(file);
    currentDecodedFile = decoded;

    if (decoded.kind === 'unsupported') {
      currentFileContent = null;
      detectedPII = [];
      fileType = '';
      originalPreview.classList.remove('docx-layout');
      sanitizedPreview.classList.remove('docx-layout');
      originalPreview.innerHTML = decoded.previewHtml;
      sanitizedPreview.innerHTML = `<pre>Cannot process this file type.\n${decoded.unsupportedReason ?? 'Unsupported file format.'}</pre>`;
      autoModeRadios.forEach((radio) => {
        radio.checked = false;
        radio.disabled = true;
      });
      manualModeRadios.forEach((radio) => {
        radio.checked = false;
        radio.disabled = true;
      });
      autoCleanBtn.disabled = true;
      manualCleanBtn.disabled = true;
      downloadBtn.disabled = true;
      setStatus(decoded.unsupportedReason ?? 'Unsupported file format.', 'warning');
      showPreview();
      return;
    }

    currentFileContent = decoded.extractedText;
    detectedPII = detectMatches(decoded.extractedText, PII_PATTERNS);
    fileType = decoded.kind;

    if (decoded.kind === 'docx') {
      await renderDocxPreview(originalPreview, file);
    } else {
      originalPreview.classList.remove('docx-layout');
      originalPreview.innerHTML = decoded.previewHtml;
    }

    if (!decoded.canSanitizePreservingFormat) {
      sanitizedPreview.classList.remove('docx-layout');
      sanitizedPreview.innerHTML = `<pre>${decoded.unsupportedReason ?? 'Preserve-format sanitization is not available for this file type yet.'}</pre>`;
      autoModeRadios.forEach((radio) => {
        radio.checked = false;
        radio.disabled = true;
      });
      manualModeRadios.forEach((radio) => {
        radio.checked = false;
        radio.disabled = true;
      });
      autoCleanBtn.disabled = true;
      manualCleanBtn.disabled = true;
      downloadBtn.disabled = true;
      setStatus(decoded.unsupportedReason ?? 'Preserve-format sanitization is unavailable for this file type.', 'warning');
      showPreview();
      return;
    }

    sanitizedPreview.classList.remove('docx-layout');
    sanitizedPreview.innerHTML = '<pre>Sanitizing automatically…</pre>';
    autoCleanBtn.disabled = false;

    showPreview();
    await performAutoClean(selectedAutoMode, true);
  } catch (error) {
    console.error('Error reading file:', error);
    setStatus('Error reading file. Please try again.', 'error');
  }
}

async function displayImage(file: File): Promise<void> {
  const dataUrl = await readFileAsDataUrl(file);
  currentFileContent = dataUrl;

  originalPreview.classList.remove('docx-layout');
  sanitizedPreview.classList.remove('docx-layout');

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

  setStatus('Image preview loaded. Image sanitization is not available yet.', 'warning');

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

function fitReplacementLength(replacement: string, targetLength: number): string {
  if (replacement.length === targetLength) {
    return replacement;
  }
  if (replacement.length > targetLength) {
    return replacement.slice(0, targetLength);
  }
  return replacement + '█'.repeat(targetLength - replacement.length);
}

function containsResidualRisk(matches: DetectedMatch[]): boolean {
  const blockedKeys = new Set([
    'ssn',
    'creditCard',
    'bankAccount',
    'routingNumber',
    'cvv',
    'cardExpiry',
    'fullNameContextual',
    'email',
    'phone',
    'driversLicense',
    'dob'
  ]);

  return matches.some((match) => blockedKeys.has(match.key));
}

function findUnchangedSensitiveValues(cleanedText: string, originalMatches: DetectedMatch[]): DetectedMatch[] {
  const blockedKeys = new Set([
    'ssn',
    'creditCard',
    'bankAccount',
    'routingNumber',
    'cvv',
    'cardExpiry',
    'fullNameContextual',
    'email',
    'phone',
    'driversLicense',
    'dob',
    'streetAddress'
  ]);

  const unique = new Map<string, DetectedMatch>();
  for (const match of originalMatches) {
    if (!blockedKeys.has(match.key)) {
      continue;
    }
    if (!match.value.trim()) {
      continue;
    }
    const dedupeKey = `${match.key}|${match.value}`;
    if (!unique.has(dedupeKey) && cleanedText.includes(match.value)) {
      unique.set(dedupeKey, match);
    }
  }

  return Array.from(unique.values());
}

function sanitizePlainText(inputText: string, mode: AutoMode): { cleanedText: string; replacements: number } {
  const matches = detectMatches(inputText, PII_PATTERNS).sort((a, b) => b.index - a.index);

  if (matches.length === 0) {
    return {
      cleanedText: inputText,
      replacements: 0
    };
  }

  let cleanedText = inputText;
  for (const pii of matches) {
    const before = cleanedText.substring(0, pii.index);
    const after = cleanedText.substring(pii.index + pii.length);
    const generated = mode === 'hide' ? '█'.repeat(pii.length) : generateFakeData(pii.value, pii.type);
    const replacement = fitReplacementLength(generated, pii.length);
    cleanedText = before + replacement + after;
  }

  return {
    cleanedText,
    replacements: matches.length
  };
}

async function sanitizeDocxPreservingFormat(file: File, mode: AutoMode): Promise<{
  blob: Blob;
  previewText: string;
  replacements: number;
}> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const xmlTargets = Object.keys(zip.files).filter((path) =>
    /^word\/(document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/i.test(path)
  );

  let totalReplacements = 0;
  const cleanedTextParts: string[] = [];
  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  for (const target of xmlTargets) {
    const entry = zip.file(target);
    if (!entry) {
      continue;
    }

    const xml = await entry.async('string');
    const doc = parser.parseFromString(xml, 'application/xml');

    if (doc.getElementsByTagName('parsererror').length > 0) {
      throw new Error(`Could not parse DOCX XML part: ${target}`);
    }

    const elements = Array.from(doc.getElementsByTagName('*'));
    const paragraphs = elements.filter((element) => element.localName === 'p');

    for (const paragraph of paragraphs) {
      const paragraphElements = Array.from(paragraph.getElementsByTagName('*'));
      const textNodes = paragraphElements.filter((element) => element.localName === 't');
      if (textNodes.length === 0) {
        continue;
      }

      const originalSegments = textNodes.map((node) => node.textContent ?? '');
      const paragraphText = originalSegments.join('');
      if (!paragraphText.trim()) {
        continue;
      }

      const { cleanedText, replacements } = sanitizePlainText(paragraphText, mode);
      cleanedTextParts.push(cleanedText);

      if (replacements === 0) {
        continue;
      }

      totalReplacements += replacements;

      let offset = 0;
      for (let index = 0; index < textNodes.length; index += 1) {
        const node = textNodes[index];
        if (!node) {
          continue;
        }
        const segmentLength = originalSegments[index]?.length ?? 0;
        const nextOffset = offset + segmentLength;
        node.textContent = cleanedText.slice(offset, nextOffset);
        offset = nextOffset;
      }
    }

    const updatedXml = serializer.serializeToString(doc);
    zip.file(target, updatedXml);
  }

  const resultBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  return {
    blob: resultBlob,
    previewText: cleanedTextParts.join('\n'),
    replacements: totalReplacements
  };
}

async function renderDocxPreview(container: HTMLElement, source: Blob): Promise<void> {
  container.innerHTML = '';
  container.classList.add('docx-layout');

  const host = document.createElement('div');
  host.className = 'docx-preview-host';
  container.appendChild(host);

  const data = await source.arrayBuffer();
  await renderAsync(data, host, undefined, {
    inWrapper: true,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    useBase64URL: true
  });
}

async function performAutoClean(mode: AutoMode, autoTriggered: boolean): Promise<void> {
  if (!currentFileContent) {
    setStatus('No file content available to sanitize.', 'warning');
    return;
  }

  if (fileType === 'image') {
    setStatus('Image sanitization is not supported yet. Please upload text, CSV, or DOCX.', 'warning');
    return;
  }

  if (currentDecodedFile && !currentDecodedFile.canSanitizePreservingFormat) {
    setStatus(currentDecodedFile.unsupportedReason ?? 'Preserve-format sanitization is not available for this file type yet.', 'warning');
    return;
  }

  if (fileType === 'docx') {
    if (!currentFile) {
      setStatus('No file selected.', 'warning');
      return;
    }

    try {
      const originalMatches = detectMatches(currentFileContent, PII_PATTERNS);
      const { blob, previewText, replacements } = await sanitizeDocxPreservingFormat(currentFile, mode);
      const residualMatches = detectMatches(previewText, PII_PATTERNS);
      const unchangedOriginalValues = findUnchangedSensitiveValues(previewText, originalMatches);
      const shouldBlock = mode === 'hide'
        ? containsResidualRisk(residualMatches)
        : unchangedOriginalValues.length > 0;

      if (shouldBlock) {
        sanitizedBlob = null;
        sanitizedContent = previewText;
        downloadBtn.disabled = true;
        sanitizedPreview.classList.remove('docx-layout');
        sanitizedPreview.innerHTML = `<pre>${escapeHtml(previewText)}</pre>`;
        const issueCount = mode === 'hide' ? residualMatches.length : unchangedOriginalValues.length;
        setStatus(`Sanitization blocked: ${issueCount} original sensitive value(s) still present after cleaning.`, 'error');
        return;
      }

      sanitizedBlob = blob;
      sanitizedContent = previewText;
      await renderDocxPreview(sanitizedPreview, blob);
      downloadBtn.disabled = false;

      if (replacements === 0) {
        setStatus(autoTriggered ? 'No sensitive data detected. Document appears clean.' : 'No sensitive data detected. Document appears clean.', 'success');
      } else {
        setStatus(autoTriggered
          ? `Auto-sanitized DOCX in ${mode} mode. Updated ${replacements} sensitive instance(s).`
          : `Sanitized DOCX in ${mode} mode. Updated ${replacements} sensitive instance(s).`, 'success');
      }
      return;
    } catch (error) {
      console.error('DOCX sanitization failed:', error);
      setStatus('Could not sanitize DOCX while preserving format. The file may be encrypted or malformed.', 'error');
      return;
    }
  }

  sanitizedPreview.classList.remove('docx-layout');

  const inputText = currentFileContent;
  const originalMatches = detectMatches(inputText, PII_PATTERNS);
  const { cleanedText, replacements } = sanitizePlainText(inputText, mode);
  const residualMatches = detectMatches(cleanedText, PII_PATTERNS);
  const unchangedOriginalValues = findUnchangedSensitiveValues(cleanedText, originalMatches);
  sanitizedBlob = null;

  const shouldBlock = mode === 'hide'
    ? containsResidualRisk(residualMatches)
    : unchangedOriginalValues.length > 0;

  if (shouldBlock) {
    sanitizedContent = cleanedText;
    sanitizedPreview.innerHTML = fileType === 'csv' ? csvToTable(cleanedText) : `<pre>${escapeHtml(cleanedText)}</pre>`;
    downloadBtn.disabled = true;
    const issueCount = mode === 'hide' ? residualMatches.length : unchangedOriginalValues.length;
    setStatus(`Sanitization blocked: ${issueCount} original sensitive value(s) still present after cleaning.`, 'error');
    return;
  }

  if (replacements === 0) {
    sanitizedContent = inputText;
    sanitizedPreview.innerHTML = fileType === 'csv' ? csvToTable(inputText) : `<pre>${escapeHtml(inputText)}</pre>`;
    downloadBtn.disabled = false;
    setStatus('No sensitive data detected. File appears clean.', 'success');
    return;
  }

  sanitizedContent = cleanedText;
  sanitizedPreview.innerHTML = fileType === 'csv' ? csvToTable(cleanedText) : `<pre>${escapeHtml(cleanedText)}</pre>`;
  downloadBtn.disabled = false;

  setStatus(autoTriggered
    ? `Auto-sanitized file in ${mode} mode. Updated ${replacements} sensitive instance(s).`
    : `Sanitized file in ${mode} mode. Updated ${replacements} sensitive instance(s).`, 'success');
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
  if (!sanitizedContent && !sanitizedBlob) {
    setStatus('No sanitized output is available to download yet.', 'warning');
    return;
  }

  if (sanitizedBlob) {
    const url = URL.createObjectURL(sanitizedBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sanitized_${currentFileName}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const blobType = fileType === 'csv' ? 'text/csv' : 'text/plain';
  const blob = new Blob([sanitizedContent ?? ''], { type: blobType });
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
  const parsed = Papa.parse<string[]>(csvText, {
    skipEmptyLines: true
  });

  const rows = parsed.data.map((row) => row.map((cell) => String(cell ?? '')));
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

function showPreview(): void {
  uploadZone.classList.add('hidden');
  mainContainer.classList.add('active');
}
