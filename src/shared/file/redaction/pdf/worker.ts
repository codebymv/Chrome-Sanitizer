import { createPdfRedactionEngine } from './engine';
import type { PdfRedactionWorkerRequest, PdfRedactionWorkerResponse } from './worker-contract';

const engine = createPdfRedactionEngine();

self.onmessage = async (event: MessageEvent<PdfRedactionWorkerRequest>) => {
	const request = event.data;

	const post = (response: PdfRedactionWorkerResponse): void => {
		self.postMessage(response);
	};

	try {
		switch (request.type) {
			case 'support':
				post({ id: request.id, type: 'support', support: engine.getSupport() });
				return;
			case 'plan':
				post({ id: request.id, type: 'plan', plan: engine.buildPlan(request.extractedText) });
				return;
			case 'apply': {
				const result = await engine.applyPlan(request.file, request.plan);
				post({ id: request.id, type: 'apply', result });
				return;
			}
		}
	} catch (error) {
		post({
			id: request.id,
			type: 'error',
			error: error instanceof Error ? error.message : 'Unknown PDF redaction worker error.'
		});
	}
};