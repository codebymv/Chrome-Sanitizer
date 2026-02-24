import type { DetectedMatch } from '../../../types';

export type PdfRedactionSupportStatus = 'scaffold' | 'ready';

export interface PdfRedactionSupport {
	status: PdfRedactionSupportStatus;
	objectLevelRemoval: boolean;
	message: string;
}

export interface PdfRedactionPlan {
	matches: DetectedMatch[];
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
	buildPlan(extractedText: string): PdfRedactionPlan;
	applyPlan(file: File, plan: PdfRedactionPlan): Promise<PdfRedactionResult>;
}