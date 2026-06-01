import { getScenarioPrompt } from "./corpus";
import { runRemotePreventionGraph } from "./langgraph";
import type { ChatRequest, ChatResponse } from "./types";

export async function runPreventionGraph(request: ChatRequest): Promise<ChatResponse> {
  const scenarioPrompt = getScenarioPrompt(request.scenarioId);
  const message = (request.message || scenarioPrompt || "").trim();
  if (!message) {
    throw new Error("A message or scenarioId is required.");
  }

  return runRemotePreventionGraph({ ...request, message });
}
