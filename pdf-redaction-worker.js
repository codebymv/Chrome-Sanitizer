import {
  createPdfRedactionEngine
} from "./chunks/chunk-GD7YHZ7W.js";
import "./chunks/chunk-KH45J4DC.js";

// src/shared/file/redaction/pdf/worker.ts
var engine = createPdfRedactionEngine();
self.onmessage = async (event) => {
  const request = event.data;
  const post = (response) => {
    self.postMessage(response);
  };
  try {
    switch (request.type) {
      case "support":
        post({ id: request.id, type: "support", support: engine.getSupport() });
        return;
      case "plan":
        post({ id: request.id, type: "plan", plan: engine.buildPlan(request.extractedText, request.extraction) });
        return;
      case "apply": {
        const result = await engine.applyPlan(request.file, request.plan);
        post({ id: request.id, type: "apply", result });
        return;
      }
    }
  } catch (error) {
    post({
      id: request.id,
      type: "error",
      error: error instanceof Error ? error.message : "Unknown PDF redaction worker error."
    });
  }
};
