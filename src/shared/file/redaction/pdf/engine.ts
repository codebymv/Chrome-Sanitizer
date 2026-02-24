import { detectMatches } from '../../../pii/detector';
import { PII_PATTERNS } from '../../../pii/patterns';
import { PDFDocument, rgb } from 'pdf-lib';
import type {
	PdfExtractionContext,
	PdfRedactionEngine,
	PdfRedactionPlan,
	PdfRedactionResult,
	PdfRedactionSupport,
	PdfTextSpan,
	PdfRedactionTarget
} from './types';

const PDF_REDACTION_MESSAGE =
	'PDF redaction is enabled in overlay mode. Object-level content removal is still in progress.';

function buildTargets(planMatches: PdfRedactionPlan['matches'], extraction?: PdfExtractionContext): PdfRedactionTarget[] {
	if (!extraction || extraction.spans.length === 0) {
		return planMatches.map((match) => ({
			match,
			spanIndices: [],
			pageNumbers: [],
			unresolved: true
		}));
	}

	return planMatches.map((match) => {
		const matchStart = match.index;
		const matchEnd = match.index + match.length;
		const spanIndices: number[] = [];
		const pageNumbers = new Set<number>();

		extraction.spans.forEach((span, index) => {
			if (span.end <= matchStart || span.start >= matchEnd) {
				return;
			}

			spanIndices.push(index);
			pageNumbers.add(span.pageNumber);
		});

		return {
			match,
			spanIndices,
			pageNumbers: Array.from(pageNumbers).sort((left, right) => left - right),
			unresolved: spanIndices.length === 0
		};
	});
}

class ScaffoldPdfRedactionEngine implements PdfRedactionEngine {
	getSupport(): PdfRedactionSupport {
		return {
			status: 'ready',
			objectLevelRemoval: false,
			message: PDF_REDACTION_MESSAGE
		};
	}

	buildPlan(extractedText: string, extraction?: PdfExtractionContext): PdfRedactionPlan {
		const matches = detectMatches(extractedText, PII_PATTERNS);
		const targets = buildTargets(matches, extraction);
		const unresolvedTargetCount = targets.reduce((count, target) => count + (target.unresolved ? 1 : 0), 0);

		return {
			matches,
			spans: extraction?.spans ?? [],
			targets,
			unresolvedTargetCount,
			matchCount: matches.length,
			generatedAt: Date.now()
		};
	}

	async applyPlan(file: File, plan: PdfRedactionPlan): Promise<PdfRedactionResult> {
		if (plan.matchCount === 0) {
			return {
				status: 'redacted',
				redactedBlob: file,
				message: 'No matches found. Original PDF kept unchanged.',
				matchCount: 0
			};
		}

		const spans = plan.spans;
		if (spans.length === 0) {
			return {
				status: 'unsupported',
				message: 'PDF redaction failed: no extraction spans available for redaction mapping.',
				matchCount: plan.matchCount
			};
		}

		const sourceBytes = await file.arrayBuffer();
		const document = await PDFDocument.load(sourceBytes);
		const pages = document.getPages();
		let boxCount = 0;

		for (const target of plan.targets) {
			for (const spanIndex of target.spanIndices) {
				const span = spans[spanIndex];
				if (!span) {
					continue;
				}
				const drawn = drawSpanRedaction(pages, span);
				if (drawn) {
					boxCount += 1;
				}
			}
		}

		if (boxCount === 0) {
			return {
				status: 'unsupported',
				message: 'PDF redaction could not place redaction boxes for detected matches.',
				matchCount: plan.matchCount
			};
		}

		const redactedBytes = await document.save();
		return {
			status: 'redacted',
			redactedBlob: new Blob([redactedBytes], { type: 'application/pdf' }),
			message: `Applied ${boxCount} redaction box(es) in overlay mode.`,
			matchCount: plan.matchCount
		};
	}
}

function drawSpanRedaction(pages: ReturnType<PDFDocument['getPages']>, span: PdfTextSpan): boolean {
	const page = pages[span.pageNumber - 1];
	if (!page || !span.bbox) {
		return false;
	}

	const x = Math.max(0, span.bbox.x - 1);
	const width = Math.max(4, span.bbox.width + 2);
	const height = Math.max(8, span.bbox.height * 1.2);
	const y = Math.max(0, span.bbox.y - (height * 0.2));

	page.drawRectangle({
		x,
		y,
		width,
		height,
		color: rgb(0, 0, 0),
		borderWidth: 0
	});

	return true;
}

export function createPdfRedactionEngine(): PdfRedactionEngine {
	return new ScaffoldPdfRedactionEngine();
}

export function getPdfRedactionSupportMessage(): string {
	return PDF_REDACTION_MESSAGE;
}