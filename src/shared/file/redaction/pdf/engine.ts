import { detectMatches } from '../../../pii/detector';
import { PII_PATTERNS } from '../../../pii/patterns';
import type { PdfRedactionEngine, PdfRedactionPlan, PdfRedactionResult, PdfRedactionSupport } from './types';

const PDF_REDACTION_SCAFFOLD_MESSAGE =
	'PDF redaction pipeline is scaffolded, but downloadable redacted PDFs stay disabled until object-level content removal is implemented.';

class ScaffoldPdfRedactionEngine implements PdfRedactionEngine {
	getSupport(): PdfRedactionSupport {
		return {
			status: 'scaffold',
			objectLevelRemoval: false,
			message: PDF_REDACTION_SCAFFOLD_MESSAGE
		};
	}

	buildPlan(extractedText: string): PdfRedactionPlan {
		const matches = detectMatches(extractedText, PII_PATTERNS);
		return {
			matches,
			matchCount: matches.length,
			generatedAt: Date.now()
		};
	}

	async applyPlan(_file: File, plan: PdfRedactionPlan): Promise<PdfRedactionResult> {
		return {
			status: 'unsupported',
			message: PDF_REDACTION_SCAFFOLD_MESSAGE,
			matchCount: plan.matchCount
		};
	}
}

export function createPdfRedactionEngine(): PdfRedactionEngine {
	return new ScaffoldPdfRedactionEngine();
}

export function getPdfRedactionSupportMessage(): string {
	return PDF_REDACTION_SCAFFOLD_MESSAGE;
}