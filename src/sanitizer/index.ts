import { detectMatches } from '../shared/pii/detector';
import { PII_PATTERNS } from '../shared/pii/patterns';
import type { DetectedMatch } from '../shared/types';
import { generateSafeReplacement } from '../shared/pii/replacement';
import { DECODE_TIMEOUT_MS, DOCX_SANITIZE_TIMEOUT_MS, withTimeout } from '../shared/file/security';
import { createPdfRedactionEngine } from '../shared/file/redaction/pdf/engine';
import type { DecodedFile } from '../shared/file/types';
import { getExtension, isImageFile, escapeHtml } from '../shared/file/utils';
import {
  buildManualOverrideWarning,
  detectUnsafeDocxEntryPaths,
  FILE_INPUT_ACCEPT,
  filterHighRiskResidual,
  MAX_UPLOAD_SIZE_BYTES,
  neutralizeCsvFormulaInjection,
  validateUploadPreflight
} from './hardening';
import Papa from 'papaparse';
import type JSZip from 'jszip';

type FileKind = 'text' | 'csv' | 'docx' | 'pdf' | 'image' | '';
type AutoMode = 'hide' | 'replace';
type StatusTone = 'success' | 'warning' | 'error';

interface ManualCandidate {
  id: string;
  match: DetectedMatch;
  signature: string;
  occurrence: number;
}

const MODE_STORAGE_KEY = 'preferredAutoMode';
const AUTO_RUN_STORAGE_KEY = 'autoRunOnUpload';

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
const preAutoRunRow = mustGet<HTMLElement>('preAutoRunRow');
const preAutoRunToggle = mustGet<HTMLInputElement>('preAutoRunToggle');
const preModeHelp = mustGet<HTMLElement>('preModeHelp');
const controlsToggleBtn = mustGet<HTMLButtonElement>('controlsToggleBtn');
const controlsToggleMeta = mustGet<HTMLElement>('controlsToggleMeta');
const controlsPanel = mustGet<HTMLElement>('controlsPanel');
const manualSummary = mustGet<HTMLElement>('manualSummary');
const manualList = mustGet<HTMLElement>('manualList');
const manualSelectionPopup = mustGet<HTMLElement>('manualSelectionPopup');
const manualPopupHideBtn = mustGet<HTMLButtonElement>('manualPopupHideBtn');
const manualPopupReplaceBtn = mustGet<HTMLButtonElement>('manualPopupReplaceBtn');
const selectAllBtn = mustGet<HTMLButtonElement>('selectAllBtn');
const deselectAllBtn = mustGet<HTMLButtonElement>('deselectAllBtn');

const autoModeRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="autoMode"]'));

let currentFile: File | null = null;
let currentFileContent: string | null = null;
let currentFileName = '';
let sanitizedContent: string | null = null;
let detectedPII: DetectedMatch[] = [];
let fileType: FileKind = '';
let currentDecodedFile: DecodedFile | null = null;
let sanitizedBlob: Blob | null = null;
let selectedAutoMode: AutoMode = 'hide';
let autoRunOnUpload = true;
let syncingScroll = false;
let controlsPanelExpanded = true;
let manualSelection = new Map<string, ManualCandidate>();
let manualCandidates: ManualCandidate[] = [];
let pendingPopupCandidateIds: string[] = [];
let requiresManualExportOverride = false;
let pendingManualOverrideHighRiskCount = 0;
const pdfRedactionEngine = createPdfRedactionEngine();
let decodeUploadedFilePromise: Promise<typeof import('../shared/file/registry')> | null = null;
let jsZipPromise: Promise<typeof import('jszip')> | null = null;
let docxPreviewPromise: Promise<typeof import('docx-preview')> | null = null;

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
  manualSelection = new Map(manualCandidates.map((candidate) => [candidate.id, candidate]));
  updateManualReviewUi();
  renderManualPreview();
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

    if (autoRunOnUpload && currentFileContent && currentDecodedFile?.canSanitizePreservingFormat) {
      void performAutoClean(selectedAutoMode, false);
      return;
    }

    if (currentFileContent && currentDecodedFile?.canSanitizePreservingFormat) {
      setStatus('Mode updated. Click Clean to sanitize this file.', 'warning');
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

preAutoRunRow.addEventListener('click', (event) => {
  event.stopPropagation();
});

preAutoRunToggle.addEventListener('change', (event) => {
  event.stopPropagation();
  setAutoRunPreference(preAutoRunToggle.checked, true);
});

manualList.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement;
  if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
    return;
  }

  const id = target.dataset.manualId;
  if (!id) {
    return;
  }

  toggleManualSelection(id, target.checked);
});

originalPreview.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const hit = target.closest<HTMLElement>('.manual-hit');
  const id = hit?.dataset.manualId;
  if (!id) {
    return;
  }

  const isChecked = !manualSelection.has(id);
  toggleManualSelection(id, isChecked);
});

originalPreview.addEventListener('mouseup', () => {
  if (fileType === 'csv') {
    hideManualSelectionPopup();
    return;
  }

  maybeOpenManualSelectionPopup();
});

document.addEventListener('scroll', () => {
  hideManualSelectionPopup();
}, true);

document.addEventListener('mousedown', (event) => {
  const target = event.target as HTMLElement;
  if (manualSelectionPopup.contains(target)) {
    return;
  }
  hideManualSelectionPopup();
});

manualPopupHideBtn.addEventListener('click', () => {
  applyPopupSelection('hide');
});

manualPopupReplaceBtn.addEventListener('click', () => {
  applyPopupSelection('replace');
});

selectAllBtn.addEventListener('click', () => {
  manualSelection = new Map(manualCandidates.map((c) => [c.id, c]));
  updateManualReviewUi();
  renderManualPreview();
});

deselectAllBtn.addEventListener('click', () => {
  manualSelection = new Map<string, ManualCandidate>();
  updateManualReviewUi();
  renderManualPreview();
});

controlsToggleBtn.addEventListener('click', () => {
  setControlsPanelExpanded(!controlsPanelExpanded);
});

manualList.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const groupHeader = target.closest<HTMLElement>('.pii-group-header');
  if (!groupHeader) {
    return;
  }

  // If the click was on the checkbox itself, handle group toggle instead of collapse
  if (target.classList.contains('pii-group-checkbox')) {
    return;
  }

  const group = groupHeader.closest<HTMLElement>('.pii-group');
  if (group) {
    group.classList.toggle('collapsed');
  }
});

manualList.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement;
  if (target.classList.contains('pii-group-checkbox')) {
    const groupType = target.dataset.groupType ?? '';
    const groupCandidates = manualCandidates.filter((c) => c.match.type === groupType);
    if (target.checked) {
      for (const c of groupCandidates) {
        manualSelection.set(c.id, c);
      }
    } else {
      for (const c of groupCandidates) {
        manualSelection.delete(c.id);
      }
    }
    updateManualReviewUi();
    renderManualPreview();
    return;
  }
});

autoCleanBtn.addEventListener('click', () => {
  if (!currentFileContent) {
    setStatus('Upload a supported file to sanitize first.', 'warning');
    return;
  }

  void performAutoClean(selectedAutoMode, false);
});

manualCleanBtn.addEventListener('click', () => {
  void performManualClean();
});

downloadBtn.addEventListener('click', () => {
  downloadSanitizedFile();
});

wirePreviewScrollSync();
fileInput.accept = FILE_INPUT_ACCEPT;
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
    const result = await chrome.storage.local.get([MODE_STORAGE_KEY, AUTO_RUN_STORAGE_KEY]);
    const stored = result[MODE_STORAGE_KEY];
    if (stored === 'hide' || stored === 'replace') {
      selectedAutoMode = stored;
    }

    if (typeof result[AUTO_RUN_STORAGE_KEY] === 'boolean') {
      autoRunOnUpload = result[AUTO_RUN_STORAGE_KEY] as boolean;
    }
  } catch (error) {
    console.warn('Could not load preferred mode from storage:', error);
  }

  setAutoRunPreference(autoRunOnUpload, false);
  applySelectedMode(selectedAutoMode, false);
}

function updatePreModeUi(mode: AutoMode): void {
  preModeHide.classList.toggle('active', mode === 'hide');
  preModeReplace.classList.toggle('active', mode === 'replace');
  if (autoRunOnUpload) {
    preModeHelp.textContent = mode === 'hide'
      ? 'Hide masks sensitive values with blocks. Applied automatically after upload.'
      : 'Replace swaps sensitive values with realistic placeholders. Applied automatically after upload.';
    return;
  }

  preModeHelp.textContent = mode === 'hide'
    ? 'Hide masks sensitive values with blocks. Choose mode now, then click Clean after upload.'
    : 'Replace swaps sensitive values with realistic placeholders. Choose mode now, then click Clean after upload.';
}

function setAutoRunPreference(enabled: boolean, persist: boolean): void {
  autoRunOnUpload = enabled;
  preAutoRunToggle.checked = enabled;
  autoCleanBtn.textContent = enabled ? 'Re-run' : 'Clean';
  updatePreModeUi(selectedAutoMode);
  setControlsPanelExpanded(!enabled);

  if (persist) {
    void chrome.storage.local.set({ [AUTO_RUN_STORAGE_KEY]: enabled });
  }
}

function setControlsPanelExpanded(expanded: boolean): void {
  controlsPanelExpanded = expanded;
  controlsPanel.classList.toggle('collapsed', !expanded);
  controlsToggleBtn.setAttribute('aria-expanded', String(expanded));
}

function updateControlsToggleMeta(): void {
  if (manualCandidates.length === 0) {
    controlsToggleMeta.textContent = 'No detected PII';
    return;
  }

  controlsToggleMeta.textContent = `${manualSelection.size}/${manualCandidates.length} selected`;
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
  if (tone === 'warning' || tone === 'error') {
    setControlsPanelExpanded(true);
  }
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
  manualSelection = new Map<string, ManualCandidate>();
  manualCandidates = [];
  pendingPopupCandidateIds = [];
  requiresManualExportOverride = false;
  pendingManualOverrideHighRiskCount = 0;
  setControlsPanelExpanded(!autoRunOnUpload);
  hideManualSelectionPopup();

  autoModeRadios.forEach((radio) => {
    radio.disabled = false;
  });

  autoCleanBtn.disabled = true;
  manualCleanBtn.disabled = true;
  downloadBtn.disabled = true;
  applySelectedMode(selectedAutoMode, false);
  updateManualReviewUi();

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

  manualSelection = new Map<string, ManualCandidate>();
  manualCandidates = [];
  pendingPopupCandidateIds = [];
  requiresManualExportOverride = false;
  pendingManualOverrideHighRiskCount = 0;
  hideManualSelectionPopup();
  autoCleanBtn.disabled = true;
  manualCleanBtn.disabled = true;
  downloadBtn.disabled = true;
  applySelectedMode(selectedAutoMode, false);
  updateManualReviewUi();
  sanitizedContent = null;
  sanitizedBlob = null;
}

async function processFile(file: File): Promise<void> {
  clearStatus();

  const preflightError = validateUploadPreflight(file);
  if (preflightError) {
    setStatus(preflightError, 'error');
    return;
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
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
    const decoded = await withTimeout(decodeUploadedFileLazy(file), DECODE_TIMEOUT_MS, 'File decode');
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
      autoCleanBtn.disabled = true;
      manualCleanBtn.disabled = true;
      downloadBtn.disabled = true;
      manualSelection = new Map<string, ManualCandidate>();
      manualCandidates = [];
      updateManualReviewUi();
      setStatus(decoded.unsupportedReason ?? 'Unsupported file format.', 'warning');
      showPreview();
      return;
    }

    currentFileContent = decoded.extractedText;
    detectedPII = detectMatches(decoded.extractedText, PII_PATTERNS);
    manualCandidates = buildManualCandidates(detectedPII);
    manualSelection = new Map(manualCandidates.map((candidate) => [candidate.id, candidate]));
    fileType = decoded.kind;

    if (decoded.kind === 'docx') {
      await renderDocxPreview(originalPreview, file);
      updateManualReviewUi();
    } else {
      originalPreview.classList.remove('docx-layout');
      originalPreview.innerHTML = decoded.previewHtml;
      updateManualReviewUi();
      renderManualPreview();
    }

    if (decoded.sanitizationCapability !== 'preserve-format') {
      const detectOnlyMessage = decoded.kind === 'pdf'
        ? pdfRedactionEngine.getSupport().message
        : (decoded.unsupportedReason ?? 'Preserve-format sanitization is unavailable for this file type.');
      sanitizedPreview.classList.remove('docx-layout');
      sanitizedPreview.innerHTML = `<pre>${detectOnlyMessage}</pre>`;
      autoModeRadios.forEach((radio) => {
        radio.checked = false;
        radio.disabled = true;
      });
      autoCleanBtn.disabled = true;
      manualCleanBtn.disabled = true;
      downloadBtn.disabled = true;
      manualSelection = new Map<string, ManualCandidate>();
      manualCandidates = [];
      updateManualReviewUi();
      setStatus(detectOnlyMessage, 'warning');
      showPreview();
      return;
    }

    sanitizedPreview.classList.remove('docx-layout');
    sanitizedPreview.innerHTML = '<pre>Sanitizing automatically…</pre>';
    autoCleanBtn.disabled = false;

    showPreview();
    if (autoRunOnUpload) {
      await performAutoClean(selectedAutoMode, true);
      return;
    }

    sanitizedPreview.innerHTML = '<pre>Ready to sanitize. Click Clean when you are ready.</pre>';
    setStatus('Preview ready. Select mode if needed, then click Clean.', 'warning');
  } catch (error) {
    console.error('Error reading file:', error);
    const reason = error instanceof Error ? error.message : 'Please try again.';
    setStatus(`Error reading file. ${reason}`, 'error');
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

function fitReplacementLength(replacement: string, sourceValue: string): string {
  const targetLength = sourceValue.length;
  if (replacement.length === targetLength) {
    return replacement;
  }
  if (replacement.length > targetLength) {
    return replacement.slice(0, targetLength);
  }

  let padded = replacement;
  for (let index = replacement.length; index < targetLength; index += 1) {
    const sourceChar = sourceValue[index] ?? 'x';
    if (/\d/.test(sourceChar)) {
      padded += '0';
      continue;
    }
    if (/[a-z]/.test(sourceChar)) {
      padded += 'x';
      continue;
    }
    if (/[A-Z]/.test(sourceChar)) {
      padded += 'X';
      continue;
    }
    padded += sourceChar === ' ' ? ' ' : 'x';
  }
  return padded;
}

function formatLeakDetails(matches: DetectedMatch[]): string {
  if (matches.length === 0) {
    return '';
  }

  const first = matches[0];
  if (!first) {
    return '';
  }
  const sample = first.value.length > 48 ? `${first.value.slice(0, 48)}…` : first.value;
  return ` First unresolved field: ${first.type} (${sample}).`;
}

function applyCsvOutputHardening(text: string): { text: string; updatedCells: number } {
  if (fileType !== 'csv') {
    return { text, updatedCells: 0 };
  }

  return neutralizeCsvFormulaInjection(text);
}

function sanitizePlainText(inputText: string, mode: AutoMode): {
  cleanedText: string;
  replacements: number;
  unchangedMatches: DetectedMatch[];
} {
  const matches = detectMatches(inputText, PII_PATTERNS).sort((a, b) => b.index - a.index);

  if (matches.length === 0) {
    return {
      cleanedText: inputText,
      replacements: 0,
      unchangedMatches: []
    };
  }

  let cleanedText = inputText;
  const unchangedMatches: DetectedMatch[] = [];
  for (const pii of matches) {
    const before = cleanedText.substring(0, pii.index);
    const after = cleanedText.substring(pii.index + pii.length);
    const generated = mode === 'hide' ? '█'.repeat(pii.length) : generateSafeReplacement(pii);
    const replacement = fitReplacementLength(generated, pii.value);
    if (mode === 'replace' && replacement === pii.value) {
      unchangedMatches.push(pii);
    }
    cleanedText = before + replacement + after;
  }

  return {
    cleanedText,
    replacements: matches.length,
    unchangedMatches
  };
}

function sanitizeBySelectedMatches(inputText: string, mode: AutoMode, matches: DetectedMatch[]): {
  cleanedText: string;
  replacements: number;
  unchangedMatches: DetectedMatch[];
} {
  const orderedMatches = [...matches].sort((a, b) => b.index - a.index);

  if (orderedMatches.length === 0) {
    return {
      cleanedText: inputText,
      replacements: 0,
      unchangedMatches: []
    };
  }

  let cleanedText = inputText;
  const unchangedMatches: DetectedMatch[] = [];
  for (const pii of orderedMatches) {
    const before = cleanedText.substring(0, pii.index);
    const after = cleanedText.substring(pii.index + pii.length);
    const generated = mode === 'hide' ? '█'.repeat(pii.length) : generateSafeReplacement(pii);
    const replacement = fitReplacementLength(generated, pii.value);
    if (mode === 'replace' && replacement === pii.value) {
      unchangedMatches.push(pii);
    }
    cleanedText = before + replacement + after;
  }

  return {
    cleanedText,
    replacements: orderedMatches.length,
    unchangedMatches
  };
}

function maybeOpenManualSelectionPopup(): void {
  if (manualCandidates.length === 0) {
    hideManualSelectionPopup();
    return;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    hideManualSelectionPopup();
    return;
  }

  const range = selection.getRangeAt(0);
  if (!originalPreview.contains(range.commonAncestorContainer)) {
    hideManualSelectionPopup();
    return;
  }

  const previewRoot = originalPreview.querySelector('pre') ?? originalPreview;
  const prefixRange = document.createRange();
  prefixRange.selectNodeContents(previewRoot);
  prefixRange.setEnd(range.startContainer, range.startOffset);

  const selectedText = selection.toString();
  const start = prefixRange.toString().length;
  const end = start + selectedText.length;

  const overlapping = manualCandidates
    .filter((candidate) => candidate.match.index < end && (candidate.match.index + candidate.match.length) > start)
    .map((candidate) => candidate.id);

  if (overlapping.length === 0) {
    hideManualSelectionPopup();
    return;
  }

  pendingPopupCandidateIds = overlapping;
  const rect = range.getBoundingClientRect();
  const popupWidth = 152;
  const left = Math.max(8, Math.min(window.innerWidth - popupWidth - 8, rect.left + (rect.width / 2) - (popupWidth / 2)));
  const top = Math.max(8, rect.top - 42);

  manualSelectionPopup.style.left = `${left}px`;
  manualSelectionPopup.style.top = `${top}px`;
  manualSelectionPopup.classList.add('visible');
}

function hideManualSelectionPopup(): void {
  manualSelectionPopup.classList.remove('visible');
  pendingPopupCandidateIds = [];
}

function applyPopupSelection(mode: AutoMode): void {
  if (pendingPopupCandidateIds.length === 0) {
    hideManualSelectionPopup();
    return;
  }

  applySelectedMode(mode, true);
  pendingPopupCandidateIds.forEach((id) => toggleManualSelection(id, true));
  hideManualSelectionPopup();
  window.getSelection()?.removeAllRanges();
  setStatus(`Selected instance(s) queued for manual ${mode}. Click Apply Selection to sanitize.`, 'success');
}

async function sanitizeDocxPreservingFormat(file: File, mode: AutoMode, selectedOccurrences?: Map<string, Set<number>>): Promise<{
  blob: Blob;
  previewText: string;
  replacements: number;
  unchangedMatches: DetectedMatch[];
  strippedMetadataFields: number;
}> {
  const buffer = await file.arrayBuffer();
  const JSZipModule = await loadJsZip();
  const zip = await JSZipModule.default.loadAsync(buffer);
  const unsafeEntries = detectUnsafeDocxEntryPaths(Object.keys(zip.files));
  if (unsafeEntries.length > 0) {
    throw new Error(`Unsafe DOCX content detected (${unsafeEntries.slice(0, 3).join(', ')}).`);
  }

  const strippedMetadataFields = await scrubDocxMetadata(zip);
  const xmlTargets = Object.keys(zip.files).filter((path) =>
    /^word\/(document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/i.test(path)
  );

  let totalReplacements = 0;
  const unchangedMatches: DetectedMatch[] = [];
  const cleanedTextParts: string[] = [];
  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const seenOccurrences = new Map<string, number>();

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

      const paragraphMatches = detectMatches(paragraphText, PII_PATTERNS).sort((a, b) => a.index - b.index);
      const selectedMatches = selectedOccurrences
        ? paragraphMatches.filter((match) => {
            const signature = matchSignature(match);
            const nextOccurrence = (seenOccurrences.get(signature) ?? 0) + 1;
            seenOccurrences.set(signature, nextOccurrence);
            return selectedOccurrences.get(signature)?.has(nextOccurrence) ?? false;
          })
        : paragraphMatches;

      const { cleanedText, replacements, unchangedMatches: unchangedInParagraph } = sanitizeBySelectedMatches(paragraphText, mode, selectedMatches);
      cleanedTextParts.push(cleanedText);
      unchangedMatches.push(...unchangedInParagraph);

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
    replacements: totalReplacements,
    unchangedMatches,
    strippedMetadataFields
  };
}

async function scrubDocxMetadata(zip: JSZip): Promise<number> {
  const metadataPaths = ['docProps/core.xml', 'docProps/app.xml', 'docProps/custom.xml'];
  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  let strippedFields = 0;

  for (const metadataPath of metadataPaths) {
    const entry = zip.file(metadataPath);
    if (!entry) {
      continue;
    }

    const xml = await entry.async('string');
    const doc = parser.parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
      continue;
    }

    const nodes = Array.from(doc.getElementsByTagName('*'));
    for (const node of nodes) {
      const hasElementChildren = Array.from(node.childNodes).some((child) => child.nodeType === Node.ELEMENT_NODE);
      if (hasElementChildren) {
        continue;
      }

      const existingText = node.textContent ?? '';
      if (existingText.trim().length > 0) {
        node.textContent = '';
        strippedFields += 1;
      }
    }

    zip.file(metadataPath, serializer.serializeToString(doc));
  }

  const commentsEntry = zip.file('word/comments.xml');
  if (commentsEntry) {
    const commentsXml = await commentsEntry.async('string');
    const commentsDoc = parser.parseFromString(commentsXml, 'application/xml');
    if (commentsDoc.getElementsByTagName('parsererror').length === 0) {
      const comments = Array.from(commentsDoc.getElementsByTagName('*')).filter((element) => element.localName === 'comment');
      for (const comment of comments) {
        ['w:author', 'w:initials', 'w:date'].forEach((attributeName) => {
          if (comment.hasAttribute(attributeName)) {
            comment.setAttribute(attributeName, '');
            strippedFields += 1;
          }
        });
      }
      zip.file('word/comments.xml', serializer.serializeToString(commentsDoc));
    }
  }

  return strippedFields;
}

async function renderDocxPreview(container: HTMLElement, source: Blob): Promise<void> {
  container.innerHTML = '';
  container.classList.add('docx-layout');

  const host = document.createElement('div');
  host.className = 'docx-preview-host';
  container.appendChild(host);

  const data = await source.arrayBuffer();
  const { renderAsync } = await loadDocxPreview();
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

  if (currentDecodedFile && currentDecodedFile.sanitizationCapability !== 'preserve-format') {
    setStatus(currentDecodedFile.unsupportedReason ?? 'Preserve-format sanitization is not available for this file type yet.', 'warning');
    return;
  }

  if (fileType === 'docx') {
    if (!currentFile) {
      setStatus('No file selected.', 'warning');
      return;
    }

    try {
      const { blob, previewText, replacements, unchangedMatches, strippedMetadataFields } = await withTimeout(
        sanitizeDocxPreservingFormat(currentFile, mode),
        DOCX_SANITIZE_TIMEOUT_MS,
        'DOCX sanitization'
      );
      const residualMatches = detectMatches(previewText, PII_PATTERNS);
      const highRiskResidual = filterHighRiskResidual(residualMatches);
      const highRiskUnchanged = filterHighRiskResidual(unchangedMatches);
      const shouldBlock = mode === 'hide'
        ? highRiskResidual.length > 0
        : highRiskUnchanged.length > 0;

      if (shouldBlock) {
        requiresManualExportOverride = false;
        pendingManualOverrideHighRiskCount = 0;
        sanitizedBlob = null;
        sanitizedContent = previewText;
        downloadBtn.disabled = true;
        await renderDocxPreview(sanitizedPreview, blob);
        const issueCount = mode === 'hide' ? highRiskResidual.length : highRiskUnchanged.length;
        const leakDetails = mode === 'replace' ? formatLeakDetails(highRiskUnchanged) : '';
        setStatus(`Sanitization blocked: ${issueCount} original sensitive value(s) still present after cleaning.${leakDetails}`, 'error');
        return;
      }

      sanitizedBlob = blob;
      sanitizedContent = previewText;
      requiresManualExportOverride = false;
      pendingManualOverrideHighRiskCount = 0;
      await renderDocxPreview(sanitizedPreview, blob);
      downloadBtn.disabled = false;

      if (replacements === 0) {
        const metadataNote = strippedMetadataFields > 0 ? ` Metadata scrubbed (${strippedMetadataFields} fields).` : '';
        setStatus(`No sensitive data detected. Document appears clean.${metadataNote}`.trim(), 'success');
      } else {
        const metadataNote = strippedMetadataFields > 0 ? ` Metadata scrubbed (${strippedMetadataFields} fields).` : '';
        setStatus(autoTriggered
          ? `Auto-sanitized DOCX in ${mode} mode. Updated ${replacements} sensitive instance(s).${metadataNote}`
          : `Sanitized DOCX in ${mode} mode. Updated ${replacements} sensitive instance(s).${metadataNote}`, 'success');
      }
      return;
    } catch (error) {
      console.error('DOCX sanitization failed:', error);
      const reason = error instanceof Error ? error.message : 'The file may be encrypted or malformed.';
      setStatus(`Could not sanitize DOCX while preserving format. ${reason}`, 'error');
      return;
    }
  }

  sanitizedPreview.classList.remove('docx-layout');

  const inputText = currentFileContent;
  const { cleanedText, replacements, unchangedMatches } = sanitizePlainText(inputText, mode);
  const residualMatches = detectMatches(cleanedText, PII_PATTERNS);
  const highRiskResidual = filterHighRiskResidual(residualMatches);
  const highRiskUnchanged = filterHighRiskResidual(unchangedMatches);
  sanitizedBlob = null;

  const shouldBlock = mode === 'hide'
    ? highRiskResidual.length > 0
    : highRiskUnchanged.length > 0;

  const hardenedBlockedOutput = applyCsvOutputHardening(cleanedText);

  if (shouldBlock) {
    requiresManualExportOverride = false;
    pendingManualOverrideHighRiskCount = 0;
    sanitizedContent = hardenedBlockedOutput.text;
    sanitizedPreview.innerHTML = fileType === 'csv' ? csvToTable(hardenedBlockedOutput.text) : `<pre>${escapeHtml(hardenedBlockedOutput.text)}</pre>`;
    downloadBtn.disabled = true;
    const issueCount = mode === 'hide' ? highRiskResidual.length : highRiskUnchanged.length;
    const leakDetails = mode === 'replace' ? formatLeakDetails(highRiskUnchanged) : '';
    setStatus(`Sanitization blocked: ${issueCount} original sensitive value(s) still present after cleaning.${leakDetails}`, 'error');
    return;
  }

  const autoOutput = replacements === 0 ? inputText : cleanedText;
  const hardenedOutput = applyCsvOutputHardening(autoOutput);
  const csvSafetyNote = hardenedOutput.updatedCells > 0 ? ` CSV safety hardened ${hardenedOutput.updatedCells} formula-like cell(s).` : '';

  if (replacements === 0) {
    sanitizedContent = hardenedOutput.text;
    requiresManualExportOverride = false;
    pendingManualOverrideHighRiskCount = 0;
    sanitizedPreview.innerHTML = fileType === 'csv' ? csvToTable(hardenedOutput.text) : `<pre>${escapeHtml(hardenedOutput.text)}</pre>`;
    downloadBtn.disabled = false;
    setStatus(`No sensitive data detected. File appears clean.${csvSafetyNote}`.trim(), 'success');
    return;
  }

  sanitizedContent = hardenedOutput.text;
  requiresManualExportOverride = false;
  pendingManualOverrideHighRiskCount = 0;
  sanitizedPreview.innerHTML = fileType === 'csv' ? csvToTable(hardenedOutput.text) : `<pre>${escapeHtml(hardenedOutput.text)}</pre>`;
  downloadBtn.disabled = false;

  setStatus(autoTriggered
    ? `Auto-sanitized file in ${mode} mode. Updated ${replacements} sensitive instance(s).${csvSafetyNote}`
    : `Sanitized file in ${mode} mode. Updated ${replacements} sensitive instance(s).${csvSafetyNote}`, 'success');
}

async function performManualClean(): Promise<void> {
  if (!currentFileContent) {
    setStatus('Upload a supported file to sanitize first.', 'warning');
    return;
  }

  if (fileType === 'image') {
    setStatus('Manual selection is not supported for images.', 'warning');
    return;
  }

  const selectedCandidates = Array.from(manualSelection.values());
  if (selectedCandidates.length === 0) {
    setStatus('Select at least one detected value to apply manual sanitization.', 'warning');
    return;
  }

  if (fileType === 'docx') {
    if (!currentFile) {
      setStatus('No file selected.', 'warning');
      return;
    }

    try {
      const selectionTarget = buildSelectedOccurrences(selectedCandidates);
      const { blob, previewText, replacements, unchangedMatches, strippedMetadataFields } = await withTimeout(
        sanitizeDocxPreservingFormat(currentFile, selectedAutoMode, selectionTarget),
        DOCX_SANITIZE_TIMEOUT_MS,
        'DOCX manual sanitization'
      );
      const highRiskUnchanged = filterHighRiskResidual(unchangedMatches);

      if (selectedAutoMode === 'replace' && highRiskUnchanged.length > 0) {
        requiresManualExportOverride = false;
        pendingManualOverrideHighRiskCount = 0;
        sanitizedBlob = null;
        sanitizedContent = previewText;
        downloadBtn.disabled = true;
        await renderDocxPreview(sanitizedPreview, blob);
        const leakDetails = formatLeakDetails(highRiskUnchanged);
        setStatus(`Manual sanitization blocked: ${highRiskUnchanged.length} selected value(s) were not replaced.${leakDetails}`, 'error');
        return;
      }

      sanitizedBlob = blob;
      sanitizedContent = previewText;
      const residualHighRisk = filterHighRiskResidual(detectMatches(previewText, PII_PATTERNS));
      requiresManualExportOverride = residualHighRisk.length > 0;
      pendingManualOverrideHighRiskCount = residualHighRisk.length;
      await renderDocxPreview(sanitizedPreview, blob);
      downloadBtn.disabled = false;

      const untouchedCount = Math.max(detectedPII.length - replacements, 0);
      const metadataNote = strippedMetadataFields > 0 ? ` Metadata scrubbed (${strippedMetadataFields} fields).` : '';
      const overrideWarning = buildManualOverrideWarning(residualHighRisk.length);
      const tone: StatusTone = residualHighRisk.length > 0 ? 'warning' : 'success';
      setStatus(`Applied manual ${selectedAutoMode} to ${replacements} selection(s). ${untouchedCount} detected value(s) were left unchanged by choice.${metadataNote} ${overrideWarning}`.trim(), tone);
      return;
    } catch (error) {
      console.error('Manual DOCX sanitization failed:', error);
      const reason = error instanceof Error ? error.message : 'Unknown DOCX processing error.';
      setStatus(`Could not apply manual sanitization to DOCX while preserving format. ${reason}`, 'error');
      return;
    }
  }

  const selectedMatches = selectedCandidates.map((candidate) => candidate.match);

  const { cleanedText, replacements, unchangedMatches } = sanitizeBySelectedMatches(currentFileContent, selectedAutoMode, selectedMatches);
  const highRiskUnchanged = filterHighRiskResidual(unchangedMatches);

  if (selectedAutoMode === 'replace' && highRiskUnchanged.length > 0) {
    requiresManualExportOverride = false;
    pendingManualOverrideHighRiskCount = 0;
    const leakDetails = formatLeakDetails(highRiskUnchanged);
    setStatus(`Manual sanitization blocked: ${highRiskUnchanged.length} selected value(s) were not replaced.${leakDetails}`, 'error');
    return;
  }

  const hardenedOutput = applyCsvOutputHardening(cleanedText);
  const csvSafetyNote = hardenedOutput.updatedCells > 0 ? ` CSV safety hardened ${hardenedOutput.updatedCells} formula-like cell(s).` : '';

  sanitizedBlob = null;
  sanitizedContent = hardenedOutput.text;
  const residualHighRisk = filterHighRiskResidual(detectMatches(hardenedOutput.text, PII_PATTERNS));
  requiresManualExportOverride = residualHighRisk.length > 0;
  pendingManualOverrideHighRiskCount = residualHighRisk.length;
  sanitizedPreview.classList.remove('docx-layout');
  sanitizedPreview.innerHTML = fileType === 'csv' ? csvToTable(hardenedOutput.text) : `<pre>${escapeHtml(hardenedOutput.text)}</pre>`;
  downloadBtn.disabled = false;

  const untouchedCount = Math.max(detectedPII.length - replacements, 0);
  const overrideWarning = buildManualOverrideWarning(residualHighRisk.length);
  const tone: StatusTone = residualHighRisk.length > 0 ? 'warning' : 'success';
  setStatus(`Applied manual ${selectedAutoMode} to ${replacements} selection(s). ${untouchedCount} detected value(s) were left unchanged by choice.${csvSafetyNote} ${overrideWarning}`.trim(), tone);
}

function matchSignature(match: DetectedMatch): string {
  return `${match.key}::${match.value}`;
}

function buildManualCandidates(matches: DetectedMatch[]): ManualCandidate[] {
  const bySignature = new Map<string, number>();
  const ordered = [...matches].sort((a, b) => a.index - b.index);

  return ordered.map((match) => {
    const signature = matchSignature(match);
    const occurrence = (bySignature.get(signature) ?? 0) + 1;
    bySignature.set(signature, occurrence);
    const id = `${signature}::${occurrence}`;
    return {
      id,
      match,
      signature,
      occurrence
    };
  });
}

function buildSelectedOccurrences(selectedCandidates: ManualCandidate[]): Map<string, Set<number>> {
  const selected = new Map<string, Set<number>>();
  for (const candidate of selectedCandidates) {
    const existing = selected.get(candidate.signature) ?? new Set<number>();
    existing.add(candidate.occurrence);
    selected.set(candidate.signature, existing);
  }
  return selected;
}

function shortValue(value: string): string {
  if (value.length <= 38) {
    return value;
  }
  return `${value.slice(0, 35)}…`;
}

function renderManualPreview(): void {
  if (!currentFileContent || manualCandidates.length === 0) {
    return;
  }

  // DOCX files use the rich docx-preview render — never overwrite it with plain text.
  // The PII checklist panel and text-selection popup handle selection for DOCX.
  if (fileType === 'docx') {
    return;
  }

  const ordered = [...manualCandidates].sort((a, b) => a.match.index - b.match.index);
  let cursor = 0;
  let html = '';

  for (const candidate of ordered) {
    const match = candidate.match;
    if (match.index < cursor) {
      continue;
    }

    const id = candidate.id;
    html += escapeHtml(currentFileContent.slice(cursor, match.index));
    const classes = manualSelection.has(id) ? 'manual-hit manual-selected' : 'manual-hit';
    html += `<mark class="${classes}" data-manual-id="${id}" title="${escapeHtml(match.type)}">${escapeHtml(match.value)}</mark>`;
    cursor = match.index + match.length;
  }

  html += escapeHtml(currentFileContent.slice(cursor));
  originalPreview.classList.remove('docx-layout');
  originalPreview.innerHTML = `<pre>${html}</pre>`;
}

function toggleManualSelection(id: string, selected: boolean): void {
  const candidate = manualCandidates.find((item) => item.id === id);
  if (!candidate) {
    return;
  }

  if (selected) {
    manualSelection.set(id, candidate);
  } else {
    manualSelection.delete(id);
  }

  updateManualReviewUi();
  renderManualPreview();
}

function updateManualReviewUi(): void {
  if (detectedPII.length === 0) {
    manualSummary.textContent = 'No detected values found in this file.';
    manualList.innerHTML = '';
    manualCleanBtn.disabled = true;
    updateControlsToggleMeta();
    return;
  }

  const selectedCount = manualSelection.size;
  manualSummary.textContent = `${selectedCount} selected of ${manualCandidates.length} detected.`;

  // Group candidates by PII type
  const groups = new Map<string, ManualCandidate[]>();
  for (const candidate of manualCandidates) {
    const type = candidate.match.type;
    const list = groups.get(type) ?? [];
    list.push(candidate);
    groups.set(type, list);
  }

  // Preserve collapsed state
  const collapsedGroups = new Set<string>();
  manualList.querySelectorAll<HTMLElement>('.pii-group.collapsed').forEach((el) => {
    const type = el.dataset.groupType;
    if (type) {
      collapsedGroups.add(type);
    }
  });

  let html = '';
  for (const [type, candidates] of groups) {
    const groupSelectedCount = candidates.filter((c) => manualSelection.has(c.id)).length;
    const allSelected = groupSelectedCount === candidates.length;
    const someSelected = groupSelectedCount > 0 && !allSelected;
    const collapsed = collapsedGroups.has(type) ? ' collapsed' : '';
    const checkedAttr = allSelected ? ' checked' : '';

    html += `<div class="pii-group${collapsed}" data-group-type="${escapeHtml(type)}">`;
    html += `<div class="pii-group-header">`;
    html += `<svg class="pii-group-chevron" width="12" height="12" viewBox="0 0 12 12"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    html += `<input type="checkbox" class="pii-group-checkbox" data-group-type="${escapeHtml(type)}"${checkedAttr}${someSelected ? ' data-indeterminate="true"' : ''}>`;
    html += `<span class="pii-group-label">${escapeHtml(type)}</span>`;
    html += `<span class="pii-group-count">${groupSelectedCount}/${candidates.length}</span>`;
    html += `</div>`;
    html += `<div class="pii-group-items">`;
    for (const candidate of candidates) {
      const checked = manualSelection.has(candidate.id) ? 'checked' : '';
      html += `<label class="manual-item"><input type="checkbox" data-manual-id="${candidate.id}" ${checked}><span class="manual-item-text">${escapeHtml(shortValue(candidate.match.value))}</span></label>`;
    }
    html += `</div></div>`;
  }

  manualList.innerHTML = html;

  // Apply indeterminate state (can't set via HTML attribute)
  manualList.querySelectorAll<HTMLInputElement>('.pii-group-checkbox[data-indeterminate="true"]').forEach((cb) => {
    cb.indeterminate = true;
  });

  manualCleanBtn.disabled = selectedCount === 0;
  updateControlsToggleMeta();
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

  if (requiresManualExportOverride && pendingManualOverrideHighRiskCount > 0) {
    const proceed = confirm(
      `High-risk data is still present (${pendingManualOverrideHighRiskCount} item${pendingManualOverrideHighRiskCount === 1 ? '' : 's'}). `
      + 'Download only if you intentionally accept this risk.'
    );

    if (!proceed) {
      setStatus('Download canceled. Manual override confirmation required when high-risk data remains.', 'warning');
      return;
    }

    requiresManualExportOverride = false;
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

async function decodeUploadedFileLazy(file: File): Promise<DecodedFile> {
  if (!decodeUploadedFilePromise) {
    decodeUploadedFilePromise = import('../shared/file/registry');
  }

  const module = await decodeUploadedFilePromise;
  return module.decodeUploadedFile(file);
}

async function loadJsZip(): Promise<typeof import('jszip')> {
  if (!jsZipPromise) {
    jsZipPromise = import('jszip');
  }

  return jsZipPromise;
}

async function loadDocxPreview(): Promise<typeof import('docx-preview')> {
  if (!docxPreviewPromise) {
    docxPreviewPromise = import('docx-preview');
  }

  return docxPreviewPromise;
}

function showPreview(): void {
  uploadZone.classList.add('hidden');
  mainContainer.classList.add('active');
}
