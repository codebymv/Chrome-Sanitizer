export const DECODE_TIMEOUT_MS = 15_000;
export const PDF_DECODE_TIMEOUT_MS = 45_000;
export const DOCX_SANITIZE_TIMEOUT_MS = 20_000;
export const MAX_PDF_PAGES = 75;
export const MAX_PDF_EXTRACTED_CHARS = 750_000;
export const MAX_PDF_OCR_PAGES = 20;
export const MIN_PDF_OCR_WORD_CONFIDENCE = 50;
export const MIN_PDF_OCR_AVERAGE_CONFIDENCE_WARNING = 65;
export const OCR_INIT_TIMEOUT_MS = 15_000;
export const OCR_RECOGNIZE_TIMEOUT_MS = 30_000;

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | null = null;

	const timeoutPromise = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
		}, timeoutMs);
	});

	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		if (timer) {
			clearTimeout(timer);
		}
	}
}