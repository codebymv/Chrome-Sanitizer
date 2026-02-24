import Papa from 'papaparse';
import { getExtension } from '../shared/file/utils';
import type { DetectedMatch } from '../shared/types';

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

const DOCX_UNSAFE_ENTRY_PATTERNS = [
	/^word\/vbaProject\.bin$/i,
	/^word\/vbaData\.xml$/i,
	/^word\/embeddings\//i,
	/^word\/activeX\//i,
	/^word\/oleObject\d+\.bin$/i,
	/^customXml\//i
];

export const FILE_INPUT_ACCEPT = [
	'.txt',
	'.md',
	'.json',
	'.xml',
	'.log',
	'.html',
	'.htm',
	'.csv',
	'.tsv',
	'.docx',
	'.pdf',
	'.jpg',
	'.jpeg',
	'.png',
	'.gif',
	'.bmp',
	'.webp',
	'.svg'
].join(',');

const ALLOWED_EXTENSIONS = new Set([
	'.txt',
	'.md',
	'.json',
	'.xml',
	'.log',
	'.html',
	'.htm',
	'.csv',
	'.tsv',
	'.docx',
	'.pdf',
	'.jpg',
	'.jpeg',
	'.png',
	'.gif',
	'.bmp',
	'.webp',
	'.svg'
]);

const ALLOWED_MIME_PREFIXES = ['text/', 'image/', 'application/json', 'application/xml'];

const EXTENSION_MIME_HINTS: Record<string, string[]> = {
	'.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
	'.pdf': ['application/pdf'],
	'.csv': ['text/csv', 'application/csv', 'application/vnd.ms-excel'],
	'.tsv': ['text/tab-separated-values', 'text/tsv'],
	'.json': ['application/json', 'text/json'],
	'.xml': ['application/xml', 'text/xml'],
	'.svg': ['image/svg+xml', 'text/xml']
};

const HIGH_RISK_PII_KEYS = new Set([
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
	'passport',
	'apiKey',
	'authToken'
]);

export function validateUploadPreflight(file: Pick<File, 'name' | 'size' | 'type'>): string | null {
	if (file.size > MAX_UPLOAD_SIZE_BYTES) {
		return 'File too large. Maximum size is 10 MB.';
	}

	const extension = getExtension(file.name);
	const mime = file.type.toLowerCase();
	const extensionAllowed = extension ? ALLOWED_EXTENSIONS.has(extension) : false;
	const mimeAllowed = ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));

	if (!extensionAllowed && !mimeAllowed) {
		return 'Unsupported file type. Allowed: TXT, CSV/TSV, DOCX, PDF, and common image formats.';
	}

	if (!extension || !mime) {
		return null;
	}

	const expectedMimes = EXTENSION_MIME_HINTS[extension];
	if (!expectedMimes) {
		return null;
	}

	const mimeLooksValid = expectedMimes.some((expected) => mime === expected || mime.startsWith(expected));
	if (!mimeLooksValid) {
		return `File type mismatch detected for ${extension}. Please upload a valid file.`;
	}

	return null;
}

export function filterHighRiskResidual(matches: DetectedMatch[]): DetectedMatch[] {
	return matches.filter((match) => HIGH_RISK_PII_KEYS.has(match.key));
}

export function neutralizeCsvFormulaInjection(csvText: string): { text: string; updatedCells: number } {
	const parsed = Papa.parse<string[]>(csvText, {
		skipEmptyLines: false
	});

	if (parsed.errors.length > 0) {
		return { text: csvText, updatedCells: 0 };
	}

	let updatedCells = 0;
	const hardenedRows = parsed.data.map((row) => row.map((cell) => {
		const value = String(cell ?? '');
		if (!/^[=+\-@]/.test(value)) {
			return value;
		}
		updatedCells += 1;
		return `'${value}`;
	}));

	if (updatedCells === 0) {
		return { text: csvText, updatedCells: 0 };
	}

	return {
		text: Papa.unparse(hardenedRows),
		updatedCells
	};
}

export function detectUnsafeDocxEntryPaths(paths: string[]): string[] {
	return paths.filter((path) => DOCX_UNSAFE_ENTRY_PATTERNS.some((pattern) => pattern.test(path)));
}

export function buildManualOverrideWarning(highRiskResidualCount: number): string {
	if (highRiskResidualCount <= 0) {
		return '';
	}

	return `High-risk data remains (${highRiskResidualCount} item${highRiskResidualCount === 1 ? '' : 's'}). Download requires explicit override confirmation.`;
}