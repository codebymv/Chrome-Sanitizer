import { detectMatches, summarizeMatches } from '../shared/pii/detector';
import { PII_PATTERNS } from '../shared/pii/patterns';
import type { DetectionSummary, SessionStats, Severity } from '../shared/types';
import { formatDetectionAge, getUploadScanMode } from './runtime-utils';

type NotificationTone = 'info' | 'success' | 'error';

interface DetectionEntry {
	detected: DetectionSummary[];
	timestamp: number;
}

class PrivacyShield {
	private enabled = true;

	private sessionStats: SessionStats = {
		totalDetections: 0,
		byType: {},
		filesScanned: 0
	};

	private shieldElement: HTMLDivElement | null = null;

	private wrenchElement: HTMLDivElement | null = null;

	private shieldState: 'blue' | 'green' | 'red' = 'blue';

	private detectionHistory: DetectionEntry[] = [];

	private isDragging = false;

	constructor() {
		this.init();
	}

	private init(): void {
		this.createPersistentShield();

		chrome.storage.sync.get(['shieldEnabled', 'overlayEnabled'], (result) => {
			this.enabled = result.shieldEnabled !== false;
			this.applyOverlayVisibility(result.overlayEnabled !== false);
			this.applyEnabledVisual();
		});

		chrome.storage.onChanged.addListener((changes) => {
			if (changes.shieldEnabled) {
				this.enabled = changes.shieldEnabled.newValue !== false;
				this.applyEnabledVisual();
			}
			if (changes.overlayEnabled) {
				this.applyOverlayVisibility(changes.overlayEnabled.newValue !== false);
			}
		});

		this.attachListeners();
	}

	private applyEnabledVisual(): void {
		if (!this.shieldElement) return;
		if (!this.enabled) {
			this.shieldElement.classList.remove('blue', 'green', 'red');
			this.shieldElement.classList.add('red');
		} else {
			this.shieldElement.classList.remove('blue', 'green', 'red');
			this.shieldElement.classList.add(this.shieldState);
		}
	}

	private applyOverlayVisibility(visible: boolean): void {
		const display = visible ? '' : 'none';
		if (this.shieldElement) this.shieldElement.style.display = display;
		if (this.wrenchElement) this.wrenchElement.style.display = display;
	}

	private createPersistentShield(): void {
		const createShield = () => {
			if (document.getElementById('privacy-shield-persistent')) {
				return;
			}

			const shield = document.createElement('div');
			shield.id = 'privacy-shield-persistent';
			shield.className = 'privacy-shield-persistent blue';
			const shieldIconUrl = chrome.runtime.getURL('icon_shield_white.png');
			shield.innerHTML = `
				<div class="shield-icon">
					<img src="${shieldIconUrl}" alt="Shield" width="18" height="18" style="object-fit:contain; display:block;">
				</div>
			`;

			const wrench = document.createElement('div');
			wrench.id = 'shield-wrench-btn';
			wrench.className = 'shield-wrench';
			wrench.title = 'Open Sani File Sanitizer';
			const soapIconUrl = chrome.runtime.getURL('icon_soap_white.png');
			wrench.innerHTML = `<img src="${soapIconUrl}" alt="Sani" width="16" height="16" style="object-fit:contain; display:block;">`;

			document.body.appendChild(shield);
			document.body.appendChild(wrench);

			chrome.storage.local.get(['shieldPosition'], (result) => {
				const position = typeof result.shieldPosition === 'number' ? result.shieldPosition : 50;
				this.setShieldPosition(position);
			});

			this.makeDraggable(shield, wrench);

			wrench.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.openSanitizerTool();
			});

			wrench.addEventListener('mousedown', (event) => {
				event.stopPropagation();
			});

			const shieldIcon = shield.querySelector('.shield-icon');
			if (shieldIcon instanceof HTMLElement) {
				shieldIcon.addEventListener('click', (event) => {
					event.stopPropagation();
					if (!this.isDragging) {
						this.toggleShieldPanel();
					}
				});
			}

			this.shieldElement = shield;
			this.wrenchElement = wrench;
			this.shieldState = 'blue';
			this.detectionHistory = [];
			this.isDragging = false;
		};

		if (document.body) {
			createShield();
			return;
		}

		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', createShield);
			return;
		}

		setTimeout(createShield, 100);
	}

	private openSanitizerTool(): void {
		void chrome.runtime.sendMessage({ action: 'openSanitizer' });
	}

	private makeDraggable(element: HTMLDivElement, wrenchElement: HTMLDivElement): void {
		let startY = 0;
		let startTop = 0;
		let dragging = false;

		const onMouseDown = (event: MouseEvent) => {
			dragging = true;
			this.isDragging = false;
			startY = event.clientY;
			startTop = element.style.top ? parseFloat(element.style.top) : 50;

			element.style.cursor = 'grabbing';
			element.style.transition = 'none';
			wrenchElement.style.transition = 'none';

			document.addEventListener('mousemove', onMouseMove);
			document.addEventListener('mouseup', onMouseUp);

			event.preventDefault();
		};

		const onMouseMove = (event: MouseEvent) => {
			if (!dragging) {
				return;
			}

			this.isDragging = true;
			const deltaY = event.clientY - startY;
			const viewportHeight = window.innerHeight;
			const deltaPercent = (deltaY / viewportHeight) * 100;
			const nextTop = Math.max(5, Math.min(95, startTop + deltaPercent));

			this.setShieldPosition(nextTop);
		};

		const onMouseUp = () => {
			if (dragging) {
				const finalPosition = element.style.top ? parseFloat(element.style.top) : 50;
				chrome.storage.local.set({ shieldPosition: finalPosition });

				element.style.cursor = 'grab';
				element.style.transition = 'all 0.3s ease';
				wrenchElement.style.transition = 'all 0.2s ease';

				setTimeout(() => {
					this.isDragging = false;
				}, 100);
			}

			dragging = false;
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
		};

		element.addEventListener('mousedown', onMouseDown);
		element.style.cursor = 'grab';
	}

	private setShieldPosition(topPercent: number): void {
		if (this.shieldElement) {
			this.shieldElement.style.top = `${topPercent}%`;
			this.shieldElement.style.transform = 'translateY(-50%)';
		}

		if (this.wrenchElement) {
			this.wrenchElement.style.top = `${topPercent}%`;
			this.wrenchElement.style.transform = 'translate(-50%, -50%)';
		}
	}

	private updateShieldState(hasInput: boolean, hasPII: boolean): void {
		if (!this.shieldElement) {
			return;
		}

		this.shieldElement.classList.remove('blue', 'green', 'red');

		if (!this.enabled) {
			// Track the underlying state so it restores correctly on re-enable
			this.shieldState = hasPII ? 'red' : hasInput ? 'green' : 'blue';
			this.shieldElement.classList.add('red');
			return;
		}

		if (hasPII) {
			this.shieldElement.classList.add('red');
			this.shieldState = 'red';
			return;
		}

		if (hasInput) {
			this.shieldElement.classList.add('green');
			this.shieldState = 'green';
			return;
		}

		this.shieldElement.classList.add('blue');
		this.shieldState = 'blue';
	}

	private toggleShieldPanel(): void {
		let panel = document.getElementById('privacy-shield-panel');
		if (panel) {
			panel.remove();
			return;
		}

		panel = document.createElement('div');
		panel.id = 'privacy-shield-panel';
		panel.className = 'privacy-shield-panel';
		panel.innerHTML = this.detectionHistory.length > 0
			? this.buildDetectionPanel()
			: this.buildNoDetectionPanel();

		document.body.appendChild(panel);

		setTimeout(() => {
			const closeOnClickOutside = (event: MouseEvent) => {
				const target = event.target;
				if (!(target instanceof Node)) {
					return;
				}

				if (!panel?.contains(target) && !this.shieldElement?.contains(target)) {
					panel?.remove();
					document.removeEventListener('click', closeOnClickOutside, true);
				}
			};

			document.addEventListener('click', closeOnClickOutside, true);
		}, 10);

		const clearAllBtn = panel.querySelector('.clear-all');
		if (clearAllBtn instanceof HTMLButtonElement) {
			clearAllBtn.addEventListener('click', (event) => {
				event.stopPropagation();
				this.clearAllDetections();
				panel?.remove();
			});
		}

		const clearBtns = panel.querySelectorAll('.clear-single');
		clearBtns.forEach((btn, index) => {
			if (!(btn instanceof HTMLButtonElement)) {
				return;
			}

			btn.addEventListener('click', (event) => {
				event.stopPropagation();
				this.clearDetection(index);
				panel?.remove();
				this.toggleShieldPanel();
			});
		});
	}

	private clearAllDetections(): void {
		this.detectionHistory = [];
		this.updateShieldState(true, false);
		this.updateStats([]);
	}

	private clearDetection(index: number): void {
		const actualIndex = this.detectionHistory.length - 1 - index;
		this.detectionHistory.splice(actualIndex, 1);

		if (this.detectionHistory.length === 0) {
			this.updateShieldState(true, false);
		}
	}

	private buildDetectionPanel(): string {
		const detectionList = this.detectionHistory
			.map((detection, index) => {
				const items = detection.detected
					.map((entry) => {
						const badge = `<span class="severity-badge severity-${entry.severity}">${entry.severity.toUpperCase()}</span>`;
						const sampleValue = entry.samples[0];
						const sample = sampleValue ? `<code>${sampleValue}</code>` : '';
						return `<li>${badge} <strong>${entry.type}</strong>: ${entry.count} ${sample}</li>`;
					})
					.join('');

				const timeText = formatDetectionAge(detection.timestamp);

				return `
				<div class="detection-entry">
					<div class="detection-header">
						<div class="detection-time">${timeText}</div>
						<button class="clear-single" data-index="${index}">Clear</button>
					</div>
					<ul class="detection-items">${items}</ul>
				</div>
			`;
			})
			.reverse()
			.join('');

		return `
			<div class="panel-header has-detections">
				<h3>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
						<path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" fill="white" stroke="white" stroke-width="2"/>
					</svg>
					Sani — PII Detections
				</h3>
				<button class="clear-all">Clear All</button>
			</div>
			<div class="panel-content">
				${detectionList}
			</div>
		`;
	}

	private buildNoDetectionPanel(): string {
		return `
			<div class="panel-header">
				<h3>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
						<path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" fill="white" stroke="white" stroke-width="2"/>
						<path d="M9 12l2 2 4-4" stroke="#059669" stroke-width="2" stroke-linecap="round"/>
					</svg>
					Sani
				</h3>
			</div>
			<div class="panel-content no-detections">
				<svg width="44" height="44" viewBox="0 0 24 24" fill="none">
					<path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" fill="#059669" stroke="#059669" stroke-width="2"/>
					<path d="M9 12l2 2 4-4" stroke="white" stroke-width="2" stroke-linecap="round"/>
				</svg>
				<p>No Sensitive Information Detected</p>
				<small>Shield is active and monitoring</small>
			</div>
		`;
	}

	private attachListeners(): void {
		const observeDOM = () => {
			const textAreas = document.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"]');
			const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');

			textAreas.forEach((element) => {
				if (element.dataset.privacyShieldAttached) {
					return;
				}

				element.dataset.privacyShieldAttached = 'true';
				element.addEventListener('paste', (event) => this.handlePaste(event));
				element.addEventListener('input', (event) => this.handleInput(event));
				element.addEventListener('keydown', (event) => {
					const keyEvent = event as KeyboardEvent;
					if ((keyEvent.key === 'Enter' && !keyEvent.shiftKey) || (keyEvent.key === 'Enter' && keyEvent.ctrlKey)) {
						this.handlePreSubmit(element);
					}
				});
			});

			fileInputs.forEach((input) => {
				if (input.dataset.privacyShieldAttached) {
					return;
				}

				input.dataset.privacyShieldAttached = 'true';
				input.addEventListener('change', (event) => this.handleFileUpload(event));
			});

			const dropZones = document.querySelectorAll<HTMLElement>('[data-testid*="file"], [class*="drop"], [class*="upload"]');
			dropZones.forEach((zone) => {
				if (zone.dataset.privacyShieldDropAttached) {
					return;
				}

				zone.dataset.privacyShieldDropAttached = 'true';
				zone.addEventListener('drop', (event) => this.handleFileDrop(event));
			});
		};

		observeDOM();

		const observer = new MutationObserver(observeDOM);
		observer.observe(document.body, {
			childList: true,
			subtree: true
		});

		this.monitorSubmitButtons();
	}

	private monitorSubmitButtons(): void {
		document.addEventListener(
			'click',
			(event) => {
				const target = event.target;
				if (!(target instanceof Element)) {
					return;
				}

				const selector = 'button[type="submit"], button[aria-label*="Send"], button[data-testid*="send"]';
				if (!target.matches(selector) && !target.closest(selector)) {
					return;
				}

				const form = target.closest('form') ?? document;
				const input = form.querySelector<HTMLElement>('textarea, [contenteditable="true"]');
				if (input) {
					this.handlePreSubmit(input);
				}
			},
			true
		);
	}

	private handlePaste(event: Event): void {
		if (!this.enabled) {
			return;
		}

		const clipboardEvent = event as ClipboardEvent;
		const pastedText = clipboardEvent.clipboardData?.getData('text') ?? '';
		const detected = this.detectPII(pastedText);

		if (detected.length > 0) {
			this.showPIIAlert(detected, 'paste');
			this.updateStats(detected);
		}
	}

	private handleInput(event: Event): void {
		if (!this.enabled) {
			return;
		}

		const target = event.target;
		if (!(target instanceof HTMLElement)) {
			return;
		}

		const text = this.getElementText(target);
		const hasInput = text.trim().length > 0;
		const detected = this.detectPII(text);
		const hasPII = detected.length > 0;

		this.updateShieldState(hasInput, hasPII);

		if (hasPII) {
			this.addToHistory(detected);
		}
	}

	private handlePreSubmit(element: HTMLElement): void {
		if (!this.enabled) {
			return;
		}

		const text = this.getElementText(element);
		const detected = this.detectPII(text);

		if (detected.length > 0) {
			this.showPIIAlert(detected, 'submit');
			this.updateStats(detected);
		}
	}

	private async handleFileUpload(event: Event): Promise<void> {
		if (!this.enabled) {
			return;
		}

		const input = event.target;
		if (!(input instanceof HTMLInputElement)) {
			return;
		}

		const files = input.files;
		if (!files || files.length === 0) {
			return;
		}

		for (let index = 0; index < files.length; index += 1) {
			const file = files.item(index);
			if (!file) {
				continue;
			}
			await this.scanFile(file);
		}
	}

	private async handleFileDrop(event: Event): Promise<void> {
		if (!this.enabled) {
			return;
		}

		const dragEvent = event as DragEvent;
		const files = dragEvent.dataTransfer?.files;
		if (!files || files.length === 0) {
			return;
		}

		for (let index = 0; index < files.length; index += 1) {
			const file = files.item(index);
			if (!file) {
				continue;
			}
			await this.scanFile(file);
		}
	}

	private async scanFile(file: File): Promise<void> {
		this.sessionStats.filesScanned += 1;

		const scanMode = getUploadScanMode(file.name, file.type);

		if (scanMode === 'docx-pdf') {
			this.showNotification(
				`File uploaded: ${file.name}. Deep decoding for DOCX/PDF is available in the File Sanitizer tool.`,
				'info'
			);
			return;
		}

		if (scanMode === 'binary') {
			this.showNotification(`File uploaded: ${file.name} (binary file - not scanned)`, 'info');
			return;
		}

		try {
			const text = await this.readFileAsText(file);
			const detected = this.detectPII(text);

			if (detected.length > 0) {
				this.showPIIAlert(detected, 'file', file.name);
				this.updateStats(detected);
				return;
			}

			this.showNotification(`File scanned: ${file.name} - No PII detected ✓`, 'success');
		} catch (error) {
			console.error('Error scanning file:', error);
			this.showNotification(`Could not scan file: ${file.name}`, 'error');
		}
	}

	private readFileAsText(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (event) => resolve(String(event.target?.result ?? ''));
			reader.onerror = (event) => reject(event);
			reader.readAsText(file);
		});
	}

	private detectPII(text: string): DetectionSummary[] {
		return summarizeMatches(detectMatches(text, PII_PATTERNS));
	}

	private addToHistory(detected: DetectionSummary[]): void {
		const newDetection: DetectionEntry = {
			detected,
			timestamp: Date.now()
		};

		const lastDetection = this.detectionHistory[this.detectionHistory.length - 1];
		if (!lastDetection || JSON.stringify(lastDetection.detected) !== JSON.stringify(detected)) {
			this.detectionHistory.push(newDetection);
			if (this.detectionHistory.length > 10) {
				this.detectionHistory.shift();
			}
			this.updateStats(detected);
		}
	}

	private showPIIAlert(detected: DetectionSummary[], context: 'file' | 'paste' | 'submit', fileName: string | null = null): void {
		const alert = document.createElement('div');
		alert.className = 'privacy-shield-alert';

		const hasCritical = detected.some((detection) => detection.severity === 'critical');
		const hasHigh = detected.some((detection) => detection.severity === 'high');
		const severity: Severity = hasCritical ? 'critical' : hasHigh ? 'high' : 'medium';

		const contextText = context === 'file'
			? `in file: <strong>${fileName}</strong>`
			: context === 'paste'
				? 'in pasted content'
				: 'in your message';

		const detectedList = detected
			.map((item) => {
				const badge = `<span class="severity-badge severity-${item.severity}">${item.severity.toUpperCase()}</span>`;
				const sampleValue = item.samples[0];
				const sample = sampleValue ? `<br><code>${sampleValue}</code>` : '';
				return `<li>${badge} <strong>${item.type}</strong>: ${item.count} instance(s)${sample}</li>`;
			})
			.join('');

		alert.innerHTML = `
			<div class="privacy-shield-alert-content" data-severity="${severity}">
				<div class="privacy-shield-alert-header">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
						<path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" fill="${severity === 'critical' ? '#DC2626' : '#D97706'}" stroke="${severity === 'critical' ? '#DC2626' : '#D97706'}" stroke-width="2"/>
						<text x="12" y="16" text-anchor="middle" fill="white" font-size="14" font-weight="bold">!</text>
					</svg>
					<h3>Personally Identifiable Information Detected</h3>
				</div>
				<p>PII found ${contextText}:</p>
				<ul class="pii-list">${detectedList}</ul>
				<div class="alert-actions">
					<p class="warning-text">⚠️ <strong>Warning:</strong> Sharing this information may compromise your privacy or security.</p>
					<button class="privacy-shield-close">I Understand</button>
				</div>
			</div>
		`;

		document.body.appendChild(alert);

		const closeBtn = alert.querySelector('.privacy-shield-close');
		if (closeBtn instanceof HTMLButtonElement) {
			closeBtn.addEventListener('click', () => {
				alert.remove();
			});
		}

		if (severity !== 'critical') {
			setTimeout(() => {
				if (alert.parentElement) {
					alert.remove();
				}
			}, 12000);
		}
	}

	private showNotification(message: string, tone: NotificationTone): void {
		const alert = document.createElement('div');
		alert.className = 'privacy-shield-alert';

		const severity = tone === 'error' ? 'critical' : 'medium';
		const heading = tone === 'error'
			? 'Scan Error'
			: tone === 'success'
				? 'Scan Complete'
				: 'Scan Notice';

		alert.innerHTML = `
			<div class="privacy-shield-alert-content" data-severity="${severity}">
				<div class="privacy-shield-alert-header">
					<h3>${heading}</h3>
				</div>
				<p>${message}</p>
			</div>
		`;

		document.body.appendChild(alert);
		setTimeout(() => {
			if (alert.parentElement) {
				alert.remove();
			}
		}, 6000);
	}

	private updateStats(detected: DetectionSummary[]): void {
		if (!this.sessionStats) {
			this.sessionStats = { totalDetections: 0, byType: {}, filesScanned: 0 };
		}

		this.sessionStats.totalDetections += detected.reduce((sum, detection) => sum + detection.count, 0);
		detected.forEach((detection) => {
			this.sessionStats.byType[detection.type] = (this.sessionStats.byType[detection.type] ?? 0) + detection.count;
		});

		chrome.storage.local.set({ sessionStats: this.sessionStats });
		chrome.storage.local.set({
			latestDetection: {
				detected,
				timestamp: Date.now()
			}
		});

		chrome.storage.local.get(['historyStats'], (result) => {
			const history = (result.historyStats as { totalDetections?: number; byType?: Record<string, number> } | undefined) ?? {};
			const nextTotal = (history.totalDetections ?? 0) + detected.reduce((sum, detection) => sum + detection.count, 0);
			const nextByType: Record<string, number> = { ...(history.byType ?? {}) };

			detected.forEach((detection) => {
				nextByType[detection.type] = (nextByType[detection.type] ?? 0) + detection.count;
			});

			chrome.storage.local.set({
				historyStats: {
					totalDetections: nextTotal,
					byType: nextByType
				}
			});
		});
	}

	private getElementText(element: HTMLElement): string {
		if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
			return element.value ?? '';
		}

		return element.textContent ?? '';
	}
}

chrome.storage.local.set({
	sessionStats: {
		totalDetections: 0,
		byType: {},
		filesScanned: 0
	}
});

void new PrivacyShield();
