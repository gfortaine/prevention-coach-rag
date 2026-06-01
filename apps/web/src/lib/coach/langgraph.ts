import type {
  AgentTraceStep,
  ArchitectureLayer,
  ChatRequest,
  ChatResponse,
  GenerationMode,
  ResponseTelemetry,
  RetrievedDocument,
  RetrieverKind,
  RiskAssessment,
  SourceCitation,
} from "./types";

type RemoteGraphResult = Partial<ChatResponse> & {
  bff?: unknown;
  __error__?: unknown;
};

export class LangGraphUnavailableError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = "LangGraphUnavailableError";
    this.statusCode = statusCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, defaultValue: string) {
  return typeof value === "string" && value.trim() ? value : defaultValue;
}

function numberValue(value: unknown, defaultValue: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

function normalizeTelemetry(value: unknown): ResponseTelemetry {
  const record = isRecord(value) ? value : {};
  return {
    total_tokens: numberValue(record.total_tokens, 0),
    input_tokens: numberValue(record.input_tokens, 0),
    output_tokens: numberValue(record.output_tokens, 0),
    embedding_tokens: numberValue(record.embedding_tokens, 0),
    co2_emissions: numberValue(record.co2_emissions, 0),
    cost: numberValue(record.cost, 0),
    response_time: numberValue(record.response_time, 0),
  };
}

function normalizeRisk(value: unknown): RiskAssessment {
  const record = isRecord(value) ? value : {};
  const level = ["faible", "modere", "eleve", "critique"].includes(String(record.level))
    ? (record.level as RiskAssessment["level"])
    : "modere";
  const signals = Array.isArray(record.signals)
    ? record.signals.filter(isRecord).map((signal) => ({
        label: stringValue(signal.label, "Signal prevention"),
        impact: numberValue(signal.impact, 0),
        evidence: stringValue(signal.evidence, "Signal issu du graphe LangGraph distant."),
      }))
    : [];

  return {
    score: numberValue(record.score, 34),
    level,
    headline: stringValue(record.headline, "Evaluation du risque par le graphe LangGraph distant."),
    signals,
  };
}

function normalizeRetrieval(value: unknown): ChatResponse["retrieval"] {
  const record = isRecord(value) ? value : {};
  const kind = [
    "langsmith-agent-store",
    "langgraph-agent-server",
    "vertex-ai-search",
    "pinecone-serverless",
    "elastic-cloud",
  ].includes(String(record.kind))
    ? (record.kind as RetrieverKind)
    : "langgraph-agent-server";

  return {
    kind,
    label: stringValue(record.label, "LangSmith Agent Server"),
    isCloud: Boolean(record.isCloud),
    warning: typeof record.warning === "string" ? record.warning : undefined,
  };
}

function normalizeDocuments(value: unknown): RetrievedDocument[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((document, index) => ({
    id: stringValue(document.id, `remote-source-${index + 1}`),
    title: stringValue(document.title, "Source distante"),
    content: stringValue(document.content, ""),
    excerpt: stringValue(document.excerpt, stringValue(document.content, "").slice(0, 220)),
    score: numberValue(document.score, 0),
    sourceUrl: stringValue(document.sourceUrl, "#"),
    citationUrl: typeof document.citationUrl === "string" ? document.citationUrl : undefined,
    sourcePage: typeof document.sourcePage === "number" ? document.sourcePage : undefined,
    guideDomain:
      document.guideDomain === "securite_routiere" || document.guideDomain === "climat" || document.guideDomain === "miniguide"
        ? document.guideDomain
        : undefined,
    sourceType: document.sourceType === "demo" || document.sourceType === "architecture" ? document.sourceType : "public",
    audience: document.audience === "particulier" || document.audience === "flotte" || document.audience === "mixte" ? document.audience : "mixte",
    tags: Array.isArray(document.tags) ? document.tags.filter((tag): tag is string => typeof tag === "string") : [],
  }));
}

function normalizeCitations(value: unknown): SourceCitation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((citation, index) => ({
    id: stringValue(citation.id, `remote-citation-${index + 1}`),
    label: stringValue(citation.label, `[${index + 1}]`),
    title: stringValue(citation.title, "Source"),
    sourceUrl: stringValue(citation.sourceUrl, "#"),
    page: typeof citation.page === "number" ? citation.page : undefined,
  }));
}

function normalizeTrace(value: unknown): AgentTraceStep[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((step) => ({
    agent: stringValue(step.agent, "Agent LangGraph"),
    status: step.status === "warning" ? "warning" : "done",
    summary: stringValue(step.summary, "Etape executee"),
    detail: stringValue(step.detail, "Trace LangGraph distante."),
  }));
}

function normalizeArchitecture(value: unknown): ArchitectureLayer[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((layer) => ({
    name: stringValue(layer.name, "LangGraph"),
    status: layer.status === "active" ? "active" : "ready",
    detail: stringValue(layer.detail, "Couche architecture distante."),
  }));
}

function normalizeRemoteResponse(result: RemoteGraphResult): ChatResponse {
  if (result.__error__) {
    throw new Error("LangGraph Agent Server returned an error state.");
  }

  const retrieval = normalizeRetrieval(result.retrieval);
  return {
    id: stringValue(result.id, crypto.randomUUID()),
    answer: stringValue(result.answer, ""),
    generationMode:
      result.generationMode === "langgraph-cloud" ||
      result.generationMode === "openai" ||
      result.generationMode === "retrieval-unavailable"
        ? (result.generationMode as GenerationMode)
        : "langgraph-cloud",
    retrieval,
    risk: normalizeRisk(result.risk),
    sources: normalizeDocuments(result.sources),
    citations: normalizeCitations(result.citations),
    telemetry: normalizeTelemetry(result.telemetry),
    trace: normalizeTrace(result.trace),
    architecture: normalizeArchitecture(result.architecture),
    suggestedQuestions: Array.isArray(result.suggestedQuestions)
      ? result.suggestedQuestions.filter((question): question is string => typeof question === "string")
      : [],
  };
}

export async function runRemotePreventionGraph(request: ChatRequest): Promise<ChatResponse> {
  const baseUrl = process.env.LANGGRAPH_API_URL?.replace(/\/$/, "");
  const assistantId = process.env.LANGGRAPH_ASSISTANT_ID || "axa_prevention_coach";
  if (!baseUrl) {
    throw new LangGraphUnavailableError("LANGGRAPH_API_URL is required to call LangGraph Cloud.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const authToken = process.env.LANGGRAPH_AUTH_TOKEN;
  const apiKey = process.env.LANGGRAPH_API_KEY || process.env.LANGSMITH_API_KEY;
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  } else if (apiKey) {
    headers["X-Api-Key"] = apiKey;
  } else {
    throw new LangGraphUnavailableError("LANGGRAPH_AUTH_TOKEN, LANGGRAPH_API_KEY or LANGSMITH_API_KEY is required to call LangGraph Cloud.");
  }
  const tenantId = process.env.LANGSMITH_TENANT_ID;
  if (tenantId) {
    headers["X-Tenant-Id"] = tenantId;
  }

  const graphInput = {
    ...request,
    chat_history: request.chatHistory,
  };

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/runs/wait`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        assistant_id: assistantId,
        input: graphInput,
        metadata: {
          app: "axa-prevention-coach",
          channel: "vercel-bff",
        },
      }),
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error.";
    throw new LangGraphUnavailableError(`LangGraph Cloud request failed: ${message}`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new LangGraphUnavailableError(`LangGraph Cloud returned ${response.status}: ${body.slice(0, 180)}`, response.status);
  }

  const payload = (await response.json()) as RemoteGraphResult;
  return normalizeRemoteResponse(payload);
}
