export type UploadScanMode = 'text' | 'docx-pdf' | 'binary';

const TEXT_EXTENSIONS = ['.txt', '.csv', '.tsv', '.md', '.json', '.xml', '.log', '.html', '.htm'];
const SUPPORTED_TEXT_MIME_PREFIXES = ['text/', 'application/json', 'application/xml'];

export function getUploadScanMode(fileName: string, mimeType: string): UploadScanMode {
	const normalizedName = fileName.toLowerCase();

	if (normalizedName.endsWith('.docx') || normalizedName.endsWith('.pdf')) {
		return 'docx-pdf';
	}

	const isTextByMime = SUPPORTED_TEXT_MIME_PREFIXES.some((prefix) => mimeType.includes(prefix));
	const isTextByExtension = TEXT_EXTENSIONS.some((extension) => normalizedName.endsWith(extension));

	if (isTextByMime || isTextByExtension) {
		return 'text';
	}

	return 'binary';
}

export function formatDetectionAge(timestamp: number, now: number = Date.now()): string {
	const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));

	if (elapsedSeconds < 60) {
		return 'just now';
	}

	if (elapsedSeconds < 3600) {
		return `${Math.floor(elapsedSeconds / 60)}m ago`;
	}

	return `${Math.floor(elapsedSeconds / 3600)}h ago`;
}