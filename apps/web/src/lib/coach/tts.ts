const AXA_BFF_BASE_URL = "https://coach-prevention-bff.axa.fr";
const REQUEST_TIMEOUT_MS = 18_000;
const STREAM_REQUEST_TIMEOUT_MS = 60_000;
const MAX_TTS_TEXT_LENGTH = 6_000;
const DEFAULT_MISTRAL_TTS_CHUNK_MAX_CHARS = 1_800;
const DEFAULT_MISTRAL_TTS_BASE_URL = "https://api.mistral.ai/v1";
const DEFAULT_MISTRAL_TTS_MODEL = "voxtral-mini-tts-2603";
const DEFAULT_MISTRAL_TTS_VOICE_ID = "fr_marie_neutral";
const DEFAULT_MISTRAL_TTS_RESPONSE_FORMAT = "mp3";
export const MISTRAL_STREAM_CONTENT_TYPE = "audio/mpeg";
const AXA_BFF_HEADERS = {
  Accept: "application/json, text/event-stream, */*",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
  Origin: AXA_BFF_BASE_URL,
  Referer: `${AXA_BFF_BASE_URL}/`,
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "X-CSRF": "1",
} as const;

interface AxaGenerateAudioResponse {
  error_code: string | null;
  is_success: boolean;
  data?: {
    id?: unknown;
  };
}

export interface AudioPayload {
  bytes: ArrayBuffer;
  contentType: string;
}

export function normalizeTtsText(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("TTS text must be a string.");
  }

  const text = value.replace(/\s+/g, " ").trim();
  if (!text) {
    throw new Error("TTS text is required.");
  }

  if (text.length > MAX_TTS_TEXT_LENGTH) {
    throw new Error(`TTS text must be ${MAX_TTS_TEXT_LENGTH} characters or fewer.`);
  }

  return text;
}

function normalizeMistralSpeechText(text: string) {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/\s*[-•]\s+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeBase64AudioBytes(base64Audio: string) {
  const normalizedBase64 = base64Audio.includes(",") ? base64Audio.slice(base64Audio.indexOf(",") + 1) : base64Audio;
  return Uint8Array.from(Buffer.from(normalizedBase64, "base64"));
}

function bytesToArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);

  return copy.buffer;
}

function decodeBase64Audio(base64Audio: string) {
  return bytesToArrayBuffer(decodeBase64AudioBytes(base64Audio));
}

function extractJsonAudioData(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.audio_data === "string") return record.audio_data;
  if (typeof record.audioData === "string") return record.audioData;
  if (typeof record.data === "string") return record.data;

  const data = record.data;
  if (data && typeof data === "object") {
    const nestedAudioData = extractJsonAudioData(data);
    if (nestedAudioData) return nestedAudioData;
  }

  const audio = record.audio;
  if (audio && typeof audio === "object") {
    const audioRecord = audio as Record<string, unknown>;
    if (typeof audioRecord.data === "string") return audioRecord.data;
  }

  const output = record.output;
  if (output && typeof output === "object") {
    const outputAudio = (output as Record<string, unknown>).audio;
    if (outputAudio && typeof outputAudio === "object") {
      const outputAudioRecord = outputAudio as Record<string, unknown>;
      if (typeof outputAudioRecord.data === "string") return outputAudioRecord.data;
    }
  }

  return undefined;
}

function extractJsonAudioContentType(payload: unknown, fallbackContentType: string) {
  if (!payload || typeof payload !== "object") {
    return fallbackContentType;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.mimeType === "string") return record.mimeType;
  if (typeof record.mime_type === "string") return record.mime_type;

  return fallbackContentType;
}

export function assertMistralTtsConfigured() {
  if (!process.env.MISTRAL_API_KEY) {
    throw new Error("Mistral TTS provider is not configured.");
  }
}

export function getMistralTtsChunkMaxChars() {
  const configuredValue = process.env.MISTRAL_TTS_CHUNK_MAX_CHARS;
  if (!configuredValue) {
    return DEFAULT_MISTRAL_TTS_CHUNK_MAX_CHARS;
  }

  const parsedValue = Number.parseInt(configuredValue, 10);
  if (!Number.isInteger(parsedValue) || parsedValue < 300 || parsedValue > 4_000) {
    throw new Error("MISTRAL_TTS_CHUNK_MAX_CHARS must be an integer between 300 and 4000.");
  }

  return parsedValue;
}

function assertMistralChunkLength(text: string, maxChars = getMistralTtsChunkMaxChars()) {
  if (text.length > maxChars) {
    throw new Error(`Mistral TTS chunk must be ${maxChars} characters or fewer.`);
  }
}

export function splitTextIntoMistralChunks(text: string, maxChars = getMistralTtsChunkMaxChars()) {
  if (!Number.isInteger(maxChars) || maxChars < 1) {
    throw new Error("Mistral TTS chunk size must be a positive integer.");
  }

  const chunks: string[] = [];
  let remaining = normalizeMistralSpeechText(normalizeTtsText(text));

  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf(" ", maxChars);
    if (splitAt < Math.floor(maxChars * 0.5)) {
      splitAt = maxChars;
    }

    const chunk = remaining.slice(0, splitAt).trim();
    if (!chunk) {
      throw new Error("Unable to split Mistral TTS input into non-empty chunks.");
    }

    chunks.push(chunk);
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function mistralSpeechRequestBody(input: string, stream: boolean) {
  return {
    model: process.env.MISTRAL_TTS_MODEL || DEFAULT_MISTRAL_TTS_MODEL,
    input,
    response_format: process.env.MISTRAL_TTS_RESPONSE_FORMAT || DEFAULT_MISTRAL_TTS_RESPONSE_FORMAT,
    stream,
    voice_id: process.env.MISTRAL_TTS_VOICE_ID || DEFAULT_MISTRAL_TTS_VOICE_ID,
  };
}

function mistralSpeechUrl() {
  const baseUrl = process.env.MISTRAL_TTS_BASE_URL || DEFAULT_MISTRAL_TTS_BASE_URL;
  return `${baseUrl.replace(/\/$/, "")}/audio/speech`;
}

function mistralSpeechHeaders(apiKey: string, accept: string) {
  return {
    Accept: accept,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export async function generateAxaBffAudio(text: string) {
  const formData = new FormData();
  formData.append("text", normalizeTtsText(text));

  const response = await fetchWithTimeout(`${AXA_BFF_BASE_URL}/generate-audio`, {
    method: "POST",
    headers: AXA_BFF_HEADERS,
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`AXA BFF audio generation failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as AxaGenerateAudioResponse;
  const id = payload.data?.id;
  if (!payload.is_success || typeof id !== "string" || !id) {
    throw new Error("AXA BFF audio generation returned an invalid id.");
  }

  return id;
}

export async function waitForAxaBffAudio(id: string) {
  const response = await fetchWithTimeout(`${AXA_BFF_BASE_URL}/audio-status/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: AXA_BFF_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`AXA BFF audio status failed with HTTP ${response.status}.`);
  }

  const status = await response.text();
  if (!status.includes("ready")) {
    throw new Error("AXA BFF audio status did not become ready.");
  }
}

export async function fetchAxaBffAudio(id: string): Promise<AudioPayload> {
  const response = await fetchWithTimeout(`${AXA_BFF_BASE_URL}/get-audio/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: AXA_BFF_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`AXA BFF audio fetch failed with HTTP ${response.status}.`);
  }

  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") ?? "audio/wav",
  };
}

export async function synthesizeMistralAudio(text: string): Promise<AudioPayload> {
  assertMistralTtsConfigured();

  const normalizedText = normalizeMistralSpeechText(normalizeTtsText(text));
  assertMistralChunkLength(normalizedText);

  const apiKey = process.env.MISTRAL_API_KEY as string;
  const responseFormat = process.env.MISTRAL_TTS_RESPONSE_FORMAT || DEFAULT_MISTRAL_TTS_RESPONSE_FORMAT;
  const response = await fetchWithTimeout(mistralSpeechUrl(), {
    method: "POST",
    headers: mistralSpeechHeaders(apiKey, "audio/*, application/json"),
    body: JSON.stringify(mistralSpeechRequestBody(normalizedText, false)),
  });

  if (!response.ok) {
    const errorText = (await response.text()).slice(0, 500);
    throw new Error(`Mistral TTS provider failed with HTTP ${response.status}: ${errorText}`);
  }

  const contentType = response.headers.get("content-type") ?? `audio/${responseFormat}`;
  if (contentType.includes("application/json")) {
    const payload = await response.json();
    const audioData = extractJsonAudioData(payload);
    if (!audioData) {
      throw new Error("Mistral TTS provider returned JSON without audio data.");
    }

    return {
      bytes: decodeBase64Audio(audioData),
      contentType: extractJsonAudioContentType(payload, `audio/${responseFormat}`),
    };
  }

  return {
    bytes: await response.arrayBuffer(),
    contentType: contentType.includes("audio") ? contentType : `audio/${responseFormat}`,
  };
}

function parseSseAudioData(event: string) {
  const dataLines = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter(Boolean);

  for (const dataLine of dataLines) {
    if (dataLine === "[DONE]") {
      continue;
    }

    try {
      const payload = JSON.parse(dataLine) as unknown;
      const audioData = extractJsonAudioData(payload);
      if (audioData) {
        return audioData;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

async function* readMistralSpeechStream(response: Response) {
  if (!response.body) {
    throw new Error("Mistral TTS stream response did not include a body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let eventBoundary = buffer.indexOf("\n\n");
    while (eventBoundary !== -1) {
      const event = buffer.slice(0, eventBoundary);
      buffer = buffer.slice(eventBoundary + 2);

      const audioData = parseSseAudioData(event);
      if (audioData) {
        yield decodeBase64AudioBytes(audioData);
      }

      eventBoundary = buffer.indexOf("\n\n");
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const audioData = parseSseAudioData(buffer);
    if (audioData) {
      yield decodeBase64AudioBytes(audioData);
    }
  }
}

export async function* streamMistralAudioChunks(textOrChunks: string | string[], abortSignal?: AbortSignal) {
  assertMistralTtsConfigured();

  const chunks = Array.isArray(textOrChunks) ? textOrChunks : splitTextIntoMistralChunks(textOrChunks);
  const apiKey = process.env.MISTRAL_API_KEY as string;

  for (const chunk of chunks) {
    assertMistralChunkLength(chunk);
    const response = await fetchWithTimeout(
      mistralSpeechUrl(),
      {
        method: "POST",
        headers: mistralSpeechHeaders(apiKey, "text/event-stream, application/json"),
        body: JSON.stringify(mistralSpeechRequestBody(chunk, true)),
        signal: abortSignal,
      },
      STREAM_REQUEST_TIMEOUT_MS,
    );

    if (!response.ok) {
      const errorText = (await response.text()).slice(0, 500);
      throw new Error(`Mistral TTS stream failed with HTTP ${response.status}: ${errorText}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      yield* readMistralSpeechStream(response);
      continue;
    }

    if (contentType.includes("application/json")) {
      const payload = await response.json();
      const audioData = extractJsonAudioData(payload);
      if (!audioData) {
        throw new Error("Mistral TTS stream returned JSON without audio data.");
      }
      yield decodeBase64AudioBytes(audioData);
      continue;
    }

    yield new Uint8Array(await response.arrayBuffer());
  }
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortListener = () => controller.abort(init.signal?.reason);

  if (init.signal) {
    if (init.signal.aborted) {
      controller.abort(init.signal.reason);
    } else {
      init.signal.addEventListener("abort", abortListener, { once: true });
    }
  }

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortListener);
  }
}
