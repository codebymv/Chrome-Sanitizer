import type { PdfRedactionPlan, PdfRedactionResult, PdfRedactionSupport } from './types';

export type PdfRedactionWorkerRequest =
	| { id: string; type: 'support' }
	| { id: string; type: 'plan'; extractedText: string }
	| { id: string; type: 'apply'; file: File; plan: PdfRedactionPlan };

export type PdfRedactionWorkerResponse =
	| { id: string; type: 'support'; support: PdfRedactionSupport }
	| { id: string; type: 'plan'; plan: PdfRedactionPlan }
	| { id: string; type: 'apply'; result: PdfRedactionResult }
	| { id: string; type: 'error'; error: string };