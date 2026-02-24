import type { DetectedMatch } from '../../../types';

export type PdfRedactionSupportStatus = 'scaffold' | 'ready';

export interface PdfRedactionSupport {
	status: PdfRedactionSupportStatus;
	objectLevelRemoval: boolean;
	message: string;
}

export interface PdfTextSpan {
	pageNumber: number;
	start: number;
	end: number;
	text: string;
	bbox?: {
		x: number;
		y: number;
		width: number;
		height: number;
		pageHeight: number;
	};
}

export interface PdfExtractionContext {
	pageCount: number;
	usedOcr: boolean;
	spans: PdfTextSpan[];
	ocrPagesScanned?: number;
	ocrAverageConfidence?: number;
	ocrDiscardedWords?: number;
}

export interface PdfRedactionTarget {
	match: DetectedMatch;
	spanIndices: number[];
	pageNumbers: number[];
	unresolved: boolean;
}

export interface PdfRedactionPlan {
	matches: DetectedMatch[];
	spans: PdfTextSpan[];
	targets: PdfRedactionTarget[];
	unresolvedTargetCount: number;
	matchCount: number;
	generatedAt: number;
}

export interface PdfRedactionResult {
	status: 'redacted' | 'unsupported';
	redactedBlob?: Blob;
	message: string;
	matchCount: number;
}

export interface PdfRedactionEngine {
	getSupport(): PdfRedactionSupport;
	buildPlan(extractedText: string, extraction?: PdfExtractionContext): PdfRedactionPlan;
	applyPlan(file: File, plan: PdfRedactionPlan): Promise<PdfRedactionResult>;
}