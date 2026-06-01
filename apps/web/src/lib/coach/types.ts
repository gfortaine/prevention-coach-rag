export type Audience = "particulier" | "flotte" | "mixte";

export type RetrieverKind =
  | "mistral-document-library"
  | "langsmith-agent-store"
  | "langgraph-agent-server"
  | "vertex-ai-search"
  | "pinecone-serverless"
  | "elastic-cloud";

export type GenerationMode = "mistral-document-library" | "langgraph-cloud" | "retrieval-unavailable";

export interface PreventionDocument {
  id: string;
  title: string;
  content: string;
  sourceUrl: string;
  citationUrl?: string;
  sourcePage?: number;
  guideDomain?: "securite_routiere" | "climat" | "miniguide";
  sourceType: "public" | "demo" | "architecture";
  audience: Audience;
  tags: string[];
}

export interface RetrievedDocument extends PreventionDocument {
  score: number;
  excerpt: string;
}

export interface RetrievalResult {
  kind: RetrieverKind;
  label: string;
  isCloud: boolean;
  documents: RetrievedDocument[];
  warning?: string;
}

export interface ChatRequest {
  message: string;
  scenarioId?: string;
  audience?: Audience;
  chatHistory?: ChatHistoryMessage[];
}

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RiskSignal {
  label: string;
  impact: number;
  evidence: string;
}

export interface RiskAssessment {
  score: number;
  level: "faible" | "modere" | "eleve" | "critique";
  headline: string;
  signals: RiskSignal[];
}

export interface AgentTraceStep {
  agent: string;
  status: "done" | "warning";
  summary: string;
  detail: string;
}

export interface ArchitectureLayer {
  name: string;
  status: "active" | "ready";
  detail: string;
}

export interface SourceCitation {
  id: string;
  label: string;
  title: string;
  sourceUrl: string;
  page?: number;
  guideDomain?: PreventionDocument["guideDomain"];
  sourceId?: string;
}

export interface ResponseTelemetry {
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  embedding_tokens: number;
  co2_emissions: number;
  cost: number;
  response_time: number;
}

export interface ChatResponse {
  id: string;
  answer: string;
  generationMode: GenerationMode;
  retrieval: {
    kind: RetrieverKind;
    label: string;
    isCloud: boolean;
    warning?: string;
  };
  risk: RiskAssessment;
  sources: RetrievedDocument[];
  citations: SourceCitation[];
  telemetry: ResponseTelemetry;
  trace: AgentTraceStep[];
  architecture: ArchitectureLayer[];
  suggestedQuestions: string[];
}
