import { preventionCorpus } from "./corpus";
import type { Audience, RetrievedDocument, RetrievalResult } from "./types";

const STOP_WORDS = new Set([
  "avec",
  "dans",
  "des",
  "une",
  "pour",
  "que",
  "qui",
  "sur",
  "les",
  "aux",
  "est",
  "mon",
  "mes",
  "notre",
  "vous",
  "nous",
  "comment",
]);

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function excerpt(content: string, queryTokens: string[]): string {
  const sentences = content.split(/(?<=[.!?])\s+/);
  const best = sentences
    .map((sentence) => ({
      sentence,
      score: tokenize(sentence).filter((token) => queryTokens.includes(token)).length,
    }))
    .sort((left, right) => right.score - left.score)[0];

  return (best?.sentence || content).slice(0, 260);
}

export function retrieveLocalDocuments(
  query: string,
  audience: Audience = "mixte",
  topK = 5,
): RetrievedDocument[] {
  const queryTokens = tokenize(query);

  return preventionCorpus
    .map((document) => {
      const haystack = tokenize(`${document.title} ${document.tags.join(" ")} ${document.content}`);
      const overlap = queryTokens.filter((token) => haystack.includes(token)).length;
      const tagBoost = document.tags.filter((tag) => queryTokens.includes(tokenize(tag)[0] || "")).length;
      const audienceBoost =
        document.audience === audience || document.audience === "mixte" || audience === "mixte" ? 1.4 : 0.4;
      const publicBoost = document.sourceType === "public" ? 1.2 : 0;

      return {
        ...document,
        score: Number((overlap * audienceBoost + tagBoost * 1.8 + publicBoost).toFixed(2)),
        excerpt: excerpt(document.content, queryTokens),
      };
    })
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

async function createOpenAIEmbedding(query: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for cloud vector retrieval.");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      input: query,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI embeddings failed with ${response.status}.`);
  }

  const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
  const embedding = payload.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error("OpenAI embeddings response did not contain an embedding.");
  }

  return embedding;
}

function metadataToDocument(id: string, score: number, metadata: Record<string, unknown>): RetrievedDocument {
  const title = String(metadata.title || "Document RAG");
  const content = String(metadata.content || metadata.text || "");
  const sourceUrl = String(metadata.sourceUrl || metadata.source_url || "cloud://rag");
  const sourceType = metadata.sourceType === "public" ? "public" : "demo";
  const audience =
    metadata.audience === "flotte" || metadata.audience === "particulier" ? metadata.audience : "mixte";
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.map((tag) => String(tag))
    : String(metadata.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

  return {
    id,
    title,
    content,
    sourceUrl,
    sourceType,
    audience,
    tags,
    score,
    excerpt: content.slice(0, 260),
  };
}

async function retrieveFromVertexSearch(query: string, topK: number): Promise<RetrievalResult | undefined> {
  const endpoint = process.env.VERTEX_AI_SEARCH_ENDPOINT;
  const token = process.env.VERTEX_AI_SEARCH_ACCESS_TOKEN;
  if (!endpoint || !token) {
    return undefined;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      pageSize: topK,
      contentSearchSpec: {
        extractiveContentSpec: { maxExtractiveAnswerCount: 3 },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Vertex AI Search retrieval failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    results?: Array<{
      id?: string;
      document?: {
        id?: string;
        structData?: Record<string, unknown>;
        derivedStructData?: Record<string, unknown>;
      };
    }>;
  };

  const documents =
    payload.results?.map((result, index) => {
      const metadata = {
        ...(result.document?.structData || {}),
        ...(result.document?.derivedStructData || {}),
      };
      return metadataToDocument(result.id || result.document?.id || `vertex-${index}`, 1 - index * 0.08, metadata);
    }) || [];

  return {
    kind: "vertex-ai-search",
    label: "Cloud RAG: Vertex AI Search",
    isCloud: true,
    documents,
  };
}

async function retrieveFromPinecone(query: string, topK: number): Promise<RetrievalResult | undefined> {
  const apiKey = process.env.PINECONE_API_KEY;
  const host = process.env.PINECONE_HOST;
  if (!apiKey || !host) {
    return undefined;
  }

  const embedding = await createOpenAIEmbedding(query);
  const response = await fetch(`https://${host}/query`, {
    method: "POST",
    headers: {
      "Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      vector: embedding,
      topK,
      includeMetadata: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Pinecone retrieval failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    matches?: Array<{ id: string; score?: number; metadata?: Record<string, unknown> }>;
  };

  return {
    kind: "pinecone-serverless",
    label: "Cloud RAG: Pinecone Serverless",
    isCloud: true,
    documents: payload.matches?.map((match) => metadataToDocument(match.id, Number(match.score || 0), match.metadata || {})) || [],
  };
}

async function retrieveFromElastic(query: string, topK: number): Promise<RetrievalResult | undefined> {
  const url = process.env.ELASTICSEARCH_URL;
  const apiKey = process.env.ELASTICSEARCH_API_KEY;
  const index = process.env.ELASTICSEARCH_INDEX || "axa-prevention";
  if (!url || !apiKey) {
    return undefined;
  }

  const response = await fetch(`${url.replace(/\/$/, "")}/${index}/_search`, {
    method: "POST",
    headers: {
      Authorization: `ApiKey ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      size: topK,
      query: {
        multi_match: {
          query,
          fields: ["title^3", "content", "tags^2"],
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Elastic retrieval failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    hits?: { hits?: Array<{ _id: string; _score?: number; _source?: Record<string, unknown> }> };
  };

  return {
    kind: "elastic-cloud",
    label: "Cloud RAG: Elastic Serverless",
    isCloud: true,
    documents:
      payload.hits?.hits?.map((hit) => metadataToDocument(hit._id, Number(hit._score || 0), hit._source || {})) || [],
  };
}

export async function retrieveDocuments(
  query: string,
  audience: Audience,
  topK = 5,
): Promise<RetrievalResult> {
  const cloudRetrievers = [
    () => retrieveFromVertexSearch(query, topK),
    () => retrieveFromPinecone(query, topK),
    () => retrieveFromElastic(query, topK),
  ];

  for (const retrieve of cloudRetrievers) {
    const result = await retrieve();
    if (result?.documents.length) {
      return result;
    }
  }

  return {
    kind: "local-fallback",
    label: "Demo RAG local",
    isCloud: false,
    documents: retrieveLocalDocuments(query, audience, topK),
    warning:
      "Fallback local actif. Configurer Vertex AI Search, Pinecone ou Elastic pour activer un RAG cloud equivalent Azure AI Search.",
  };
}
