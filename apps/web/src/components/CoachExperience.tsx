"use client";

import { Fragment, FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button, Link as CanopeeLink, Tag } from "@axa-fr/canopee-react/prospect";
import Image from "next/image";
import {
  assistantPreventionUrl,
  axaSuggestedQuestions,
  climateGuideCdnUrl,
  naturalEventsGuideCdnUrl,
  originalCoachUrl,
  roadSafetyGuideCdnUrl,
} from "@/lib/coach/corpus";
import type { ChatHistoryMessage, ChatResponse } from "@/lib/coach/types";

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onspeechend: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechWindow extends Window {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
}

type ChatState =
  | { status: "idle"; data: ChatResponse }
  | { status: "loading"; data: ChatResponse }
  | { status: "error"; data: ChatResponse; message: string }
  | { status: "ready"; data: ChatResponse };

interface ConversationTurn {
  id: string;
  message: string;
  response: ChatResponse;
}

interface AudioPlaybackHandle {
  abortController: AbortController;
  audio?: HTMLAudioElement;
  sessionId: number;
  url?: string;
}

const scenarios = [
  {
    id: "speed",
    title: axaSuggestedQuestions[0],
  },
  {
    id: "greenhouse",
    title: axaSuggestedQuestions[1],
  },
  {
    id: "storm",
    title: axaSuggestedQuestions[2],
  },
] as const;

const initialResponse: ChatResponse = {
  id: "initial",
  answer: "",
  generationMode: "langgraph-cloud",
  retrieval: {
    kind: "langgraph-agent-server",
    label: "Pret",
    isCloud: true,
  },
  risk: {
    score: 18,
    level: "faible",
    headline: "En attente d'un contexte de conduite.",
    signals: [
      {
        label: "Prototype transparent",
        impact: 0,
        evidence: "Aucune donnee personnelle n'est requise pour tester le coach.",
      },
    ],
  },
  sources: [
    {
      id: "original-coach",
      title: "Coach AXA Prevention",
      content: "Lien public original du Coach AXA Prevention.",
      excerpt: "Lien public original du Coach AXA Prevention.",
      score: 1,
      sourceUrl: originalCoachUrl,
      sourceType: "public",
      audience: "particulier",
      tags: ["axa-prevention"],
    },
  ],
  citations: [],
  telemetry: {
    total_tokens: 0,
    input_tokens: 0,
    output_tokens: 0,
    embedding_tokens: 0,
    co2_emissions: 0,
    cost: 0,
    response_time: 0,
  },
  trace: [],
  architecture: [],
  suggestedQuestions: scenarios.map((scenario) => scenario.title),
};

const introText =
  "Bonjour ! Je suis l'Assistant Prévention, votre assistant intelligent. Je suis là pour répondre à toutes vos questions sur la prévention routière et sur les enjeux liés au changement climatique, à l'empreinte carbone ou aux moyens de se protéger face à une catastrophe naturelle. Pour cela, je m'appuie sur les guides Prévention Routière, Climat et Environnement et Bien se protéger face aux événements naturels afin de vous fournir des réponses précises et utiles grâce à l'intelligence artificielle. Vous pouvez échanger avec moi soit en utilisant la barre de texte, soit par la voix, qui est uniquement utilisée pour rendre la conversation plus simple et naturelle. Mes réponses peuvent parfois être incomplètes ou hors sujet, malgré toute l'attention portée à ma conception et mes sources documentaires. Nous vous invitons à être vigilant quant aux réponses apportées.";

function stripCitationMarkers(text: string) {
  return text.replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function supportsStreamingAudio() {
  return (
    typeof window !== "undefined" &&
    "MediaSource" in window &&
    typeof MediaSource.isTypeSupported === "function" &&
    MediaSource.isTypeSupported("audio/mpeg")
  );
}

function trimHistoryContent(text: string) {
  return stripCitationMarkers(text).slice(0, 1200);
}

function buildChatHistory(turns: ConversationTurn[]): ChatHistoryMessage[] {
  return turns.slice(-4).flatMap((turn) => [
    { role: "user", content: trimHistoryContent(turn.message) },
    { role: "assistant", content: trimHistoryContent(turn.response.answer) },
  ]);
}

function getSpeechRecognition() {
  if (typeof window === "undefined") {
    return null;
  }

  const speechWindow = window as SpeechWindow;
  const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

  return Recognition ? new Recognition() : null;
}

function StarIcon() {
  return (
    <svg aria-hidden="true" className="star-icon-suggestion" viewBox="0 0 24 24">
      <path d="M10.6 2.4 12 7.1l4.8 1.4-4.8 1.4-1.4 4.8-1.4-4.8-4.8-1.4 4.8-1.4 1.4-4.7Zm7.1 8.8.8 2.7 2.7.8-2.7.8-.8 2.7-.8-2.7-2.7-.8 2.7-.8.8-2.7Zm-12 3.8.6 2 2 .6-2 .6-.6 2-.6-2-2-.6 2-.6.6-2Z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg aria-hidden="true" className="mic-icon-original" width="14" height="20" viewBox="0 0 14 20" fill="none">
      <path
        d="M12.833 8.334V10A5.833 5.833 0 0 1 7 15.834m-5.833-7.5V10A5.833 5.833 0 0 0 7 15.834m0 0v2.5m-3.333 0h6.666M7 12.5A2.5 2.5 0 0 1 4.5 10V4.167a2.5 2.5 0 0 1 5 0V10A2.5 2.5 0 0 1 7 12.5"
        stroke="#1E1E1E"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M3.7 20.3 21 12 3.7 3.7 3 10.3l10 1.7-10 1.7.7 6.6Z" />
    </svg>
  );
}

function Loader() {
  return (
    <article className="bot-message">
      <div className="bot-message__meta">
        <StarIcon />
        <span>Assistant Prévention</span>
      </div>
      <div className="bot-bubble bot-loader" aria-label="Réponse en cours">
        <span />
        <span />
        <span />
      </div>
    </article>
  );
}

function AnswerText({ data }: { data: ChatResponse }) {
  const parts = data.answer.split(/(\[\d+\])/g);
  const citationsByLabel = new Map(data.citations.map((citation) => [citation.label, citation]));

  return (
    <p>
      {parts.map((part, index) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (!match) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }

        const citation = citationsByLabel.get(part);
        if (!citation) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }

        return (
          <a className="source-citation" href={citation.sourceUrl} key={`${part}-${index}`} target="_blank" rel="noreferrer">
            {part}
          </a>
        );
      })}
    </p>
  );
}

export function CoachExperience() {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [pendingMessage, setPendingMessage] = useState("");
  const [state, setState] = useState<ChatState>({ status: "idle", data: initialResponse });
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [speakingTarget, setSpeakingTarget] = useState<string | null>(null);
  const [suggestionsVisible, setSuggestionsVisible] = useState(true);
  const [hasStartedConversation, setHasStartedConversation] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const audioPlaybackRef = useRef<AudioPlaybackHandle | null>(null);
  const playbackSessionRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const conversationEndRef = useRef<HTMLDivElement | null>(null);

  const hasConversation = turns.length > 0 || Boolean(pendingMessage) || state.status !== "idle";

  useEffect(() => {
    if (!hasConversation) {
      return;
    }

    conversationEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [hasConversation, pendingMessage, state.status, turns.length]);

  async function submit(nextMessage = message, scenarioId?: string) {
    const cleanMessage = nextMessage.trim();
    if (!cleanMessage && !scenarioId) return;

    const latestData = turns[turns.length - 1]?.response ?? state.data;
    const chatHistory = buildChatHistory(turns);

    recognitionRef.current?.stop();
    setSuggestionsVisible(false);
    setHasStartedConversation(true);
    setPendingMessage(cleanMessage);
    setMessage("");
    setState({ status: "loading", data: latestData });

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: cleanMessage, scenarioId, chatHistory }),
    });

    const payload = (await response.json()) as ChatResponse | { error?: string };
    if (!response.ok || !("answer" in payload)) {
      setState({
        status: "error",
        data: latestData,
        message: "Le coach n'a pas pu traiter la demande. Réessayez avec un contexte plus court.",
      });
      return;
    }

    setTurns((current) => [...current, { id: payload.id, message: cleanMessage, response: payload }]);
    setPendingMessage("");
    setState({ status: "ready", data: payload });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    if (state.status === "loading" || !message.trim()) {
      return;
    }

    void submit();
  }

  function stopAudioPlayback() {
    playbackSessionRef.current += 1;

    const playback = audioPlaybackRef.current;
    if (!playback) {
      return;
    }

    playback.abortController.abort();
    playback.audio?.pause();
    if (playback.audio) {
      playback.audio.removeAttribute("src");
      playback.audio.load();
    }
    if (playback.url) {
      URL.revokeObjectURL(playback.url);
    }
    audioPlaybackRef.current = null;
  }

  function cleanupAudioPlayback(sessionId: number) {
    const playback = audioPlaybackRef.current;
    if (!playback || playback.sessionId !== sessionId) {
      return;
    }

    playback.audio?.pause();
    if (playback.audio) {
      playback.audio.removeAttribute("src");
      playback.audio.load();
    }
    if (playback.url) {
      URL.revokeObjectURL(playback.url);
    }
    audioPlaybackRef.current = null;
  }

  function ensureCurrentPlayback(sessionId: number, signal: AbortSignal) {
    if (signal.aborted || audioPlaybackRef.current?.sessionId !== sessionId) {
      throw new DOMException("Audio playback was cancelled.", "AbortError");
    }
  }

  function waitForMediaSourceOpen(mediaSource: MediaSource, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      if (mediaSource.readyState === "open") {
        resolve();
        return;
      }

      const cleanup = () => {
        mediaSource.removeEventListener("sourceopen", handleOpen);
        mediaSource.removeEventListener("sourceended", handleEnded);
        signal.removeEventListener("abort", handleAbort);
      };
      const handleOpen = () => {
        cleanup();
        resolve();
      };
      const handleEnded = () => {
        cleanup();
        reject(new Error("MediaSource closed before audio playback started."));
      };
      const handleAbort = () => {
        cleanup();
        reject(new DOMException("Audio playback was cancelled.", "AbortError"));
      };

      mediaSource.addEventListener("sourceopen", handleOpen, { once: true });
      mediaSource.addEventListener("sourceended", handleEnded, { once: true });
      signal.addEventListener("abort", handleAbort, { once: true });
    });
  }

  function appendSourceBuffer(sourceBuffer: SourceBuffer, bytes: Uint8Array, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        sourceBuffer.removeEventListener("updateend", handleUpdateEnd);
        sourceBuffer.removeEventListener("error", handleError);
        signal.removeEventListener("abort", handleAbort);
      };
      const handleUpdateEnd = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error("Audio stream append failed."));
      };
      const handleAbort = () => {
        cleanup();
        reject(new DOMException("Audio playback was cancelled.", "AbortError"));
      };

      sourceBuffer.addEventListener("updateend", handleUpdateEnd, { once: true });
      sourceBuffer.addEventListener("error", handleError, { once: true });
      signal.addEventListener("abort", handleAbort, { once: true });
      const audioBytes = new Uint8Array(bytes.byteLength);
      audioBytes.set(bytes);
      sourceBuffer.appendBuffer(audioBytes.buffer);
    });
  }

  function waitForAudioEnd(audio: HTMLAudioElement, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("error", handleError);
        signal.removeEventListener("abort", handleAbort);
      };
      const handleEnded = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error("Audio playback failed."));
      };
      const handleAbort = () => {
        cleanup();
        reject(new DOMException("Audio playback was cancelled.", "AbortError"));
      };

      audio.addEventListener("ended", handleEnded, { once: true });
      audio.addEventListener("error", handleError, { once: true });
      signal.addEventListener("abort", handleAbort, { once: true });
    });
  }

  async function playBufferedAudio(audioResponse: Response, sessionId: number, target: string, abortController: AbortController) {
    const audioUrl = URL.createObjectURL(await audioResponse.blob());
    ensureCurrentPlayback(sessionId, abortController.signal);

    const audio = new Audio(audioUrl);
    audioPlaybackRef.current = { abortController, audio, sessionId, url: audioUrl };
    setSpeakingTarget(target);
    setVoiceStatus("Lecture vocale en cours...");

    try {
      await audio.play();
      await waitForAudioEnd(audio, abortController.signal);
      cleanupAudioPlayback(sessionId);
      setSpeakingTarget(null);
      setVoiceStatus("");
    } catch (error) {
      cleanupAudioPlayback(sessionId);
      throw error;
    }
  }

  async function fetchTtsStream(text: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> {
    const formData = new FormData();
    formData.append("text", text);

    const audioResponse = await fetch("/api/tts/stream", {
      method: "POST",
      body: formData,
      signal,
    });
    if (!audioResponse.ok) {
      throw new Error("Cloud audio generation failed.");
    }
    if (!audioResponse.body) {
      throw new Error("Audio stream is empty.");
    }

    return audioResponse.body;
  }

  async function playStreamingAudio(text: string, sessionId: number, target: string, abortController: AbortController) {
    const mediaSource = new MediaSource();
    const audioUrl = URL.createObjectURL(mediaSource);
    const audio = new Audio(audioUrl);
    audioPlaybackRef.current = { abortController, audio, sessionId, url: audioUrl };

    try {
      setSpeakingTarget(target);
      setVoiceStatus("Lecture vocale en cours...");

      const playbackPromise = audio.play();
      playbackPromise.catch(() => undefined);
      const audioStreamPromise = fetchTtsStream(text, abortController.signal);

      await waitForMediaSourceOpen(mediaSource, abortController.signal);
      ensureCurrentPlayback(sessionId, abortController.signal);

      const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
      sourceBuffer.mode = "sequence";

      const audioStream = await audioStreamPromise;
      const reader = audioStream.getReader();
      let hasAudioBytes = false;

      while (true) {
        ensureCurrentPlayback(sessionId, abortController.signal);
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        if (!value?.byteLength) {
          continue;
        }

        hasAudioBytes = true;
        await appendSourceBuffer(sourceBuffer, value, abortController.signal);
      }

      if (!hasAudioBytes) {
        throw new Error("Audio stream did not return playable bytes.");
      }

      if (mediaSource.readyState === "open" && !sourceBuffer.updating) {
        mediaSource.endOfStream();
      }

      await playbackPromise;
      await waitForAudioEnd(audio, abortController.signal);
      cleanupAudioPlayback(sessionId);
      setSpeakingTarget(null);
      setVoiceStatus("");
    } catch (error) {
      cleanupAudioPlayback(sessionId);
      throw error;
    }
  }

  async function speakWithServerAudio(text: string, target: string) {
    const sessionId = playbackSessionRef.current + 1;
    playbackSessionRef.current = sessionId;
    const abortController = new AbortController();
    audioPlaybackRef.current = { abortController, sessionId };

    if (supportsStreamingAudio()) {
      await playStreamingAudio(text, sessionId, target, abortController);
      return;
    }

    const audioStream = await fetchTtsStream(text, abortController.signal);
    await playBufferedAudio(new Response(audioStream, { headers: { "Content-Type": "audio/mpeg" } }), sessionId, target, abortController);
  }

  async function toggleSpeech(text: string, target: string) {
    const speechText = stripCitationMarkers(text);
    if (!speechText) {
      return;
    }

    if (speakingTarget === target) {
      stopAudioPlayback();
      setSpeakingTarget(null);
      setVoiceStatus("");
      return;
    }

    stopAudioPlayback();
    setVoiceStatus("");

    try {
      await speakWithServerAudio(speechText, target);
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      setSpeakingTarget(null);
      setVoiceStatus("Lecture vocale Mistral indisponible sur cet environnement.");
    }
  }

  function toggleVoiceInput() {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = getSpeechRecognition();
    if (!recognition) {
      setVoiceStatus("La dictée vocale n'est pas disponible sur ce navigateur.");
      return;
    }

    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index])
        .flatMap((result) => Array.from({ length: result.length }, (_, index) => result[index].transcript.trim()))
        .filter(Boolean)
        .join(" ");
      setMessage(transcript.slice(0, 300));
      setVoiceStatus("");
    };
    recognition.onerror = () => {
      setIsListening(false);
      setVoiceStatus("Je n'ai pas pu capter la voix. Réessayez ou utilisez le clavier.");
    };
    recognition.onspeechend = () => recognition.stop();
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      textareaRef.current?.focus();
    };

    recognitionRef.current = recognition;
    setVoiceStatus("Écoute en cours...");
    setIsListening(true);

    try {
      recognition.start();
    } catch {
      setIsListening(false);
      setVoiceStatus("La dictée vocale est déjà active.");
    }
  }

  return (
    <div className="axa-shell">
      <header className="axa-brandbar">
        <a className="axa-brandbar__logo" href={assistantPreventionUrl} target="_blank" rel="noreferrer" aria-label="AXA Prévention">
          <Image src="/logo-axa-prevention.png" alt="AXA Prévention" width={210} height={46} priority />
        </a>
        <div className="axa-brandbar__identity">
          <Tag variant="info">Prototype entretien</Tag>
          <span>Assistant IA prévention routière</span>
        </div>
        <nav className="axa-brandbar__nav" aria-label="Liens de démonstration">
          <CanopeeLink href={assistantPreventionUrl} openInNewTab>
            Assistant original
          </CanopeeLink>
        </nav>
      </header>

      <main className="coach-root">
        <header className="coach-header">
          <h1 className="coach-header__title">Bienvenue sur l&apos;Assistant Prévention.</h1>
          <p className="coach-header__subtitle">Quelle est votre question&nbsp;?</p>
        </header>

        <section className="conversation" aria-label="Conversation avec l'assistant" aria-live="polite">
          <article className="bot-message">
            <div className="bot-message__meta">
              <StarIcon />
              <span>Assistant Prévention</span>
              <button
                className={`bot-speaker ${speakingTarget === "intro" ? "bot-speaker--active" : ""}`}
                onClick={() => void toggleSpeech(introText, "intro")}
                type="button"
                aria-label="speaker button"
                aria-pressed={speakingTarget === "intro"}
              >
                <SpeakerIcon />
              </button>
            </div>
            <div className="bot-bubble">
              <p>
                Bonjour&nbsp;! Je suis l&apos;<strong>Assistant Prévention</strong>, votre assistant intelligent. Je suis là pour
                répondre à toutes vos questions sur la prévention routière et sur les enjeux liés au changement
                climatique, à l&apos;empreinte carbone ou aux moyens de se protéger face à une catastrophe naturelle.
                Pour cela, je m&apos;appuie sur les guides{" "}
                <a href={roadSafetyGuideCdnUrl} target="_blank" rel="noreferrer">
                  Prévention Routière
                </a>
                ,{" "}
                <a href={climateGuideCdnUrl} target="_blank" rel="noreferrer">
                  Climat et Environnement
                </a>{" "}
                et{" "}
                <a href={naturalEventsGuideCdnUrl} target="_blank" rel="noreferrer">
                  Bien se protéger face aux événements naturels
                </a>{" "}
                afin de vous fournir des réponses précises et utiles grâce à l&apos;intelligence artificielle.
                <br />
                Vous pouvez échanger avec moi soit en utilisant la barre de texte, soit par la voix, qui est
                uniquement utilisée pour rendre la conversation plus simple et naturelle.
                <br />
                Mes réponses peuvent parfois être incomplètes ou hors sujet, malgré toute l&apos;attention portée à
                ma conception et mes sources documentaires. Nous vous invitons à être vigilant quant aux réponses
                apportées.
              </p>
            </div>
            {suggestionsVisible && !hasStartedConversation ? (
              <div className="bot-suggestions" aria-label="Questions suggérées">
                <p className="bot-suggestions__intro">Voici des exemples de questions que vous pouvez me poser&nbsp;:</p>
                <div className="bot-suggestions__grid">
                  {scenarios.map((scenario) => (
                    <button
                      className="bot-suggestion"
                      key={scenario.id}
                      onClick={() => void submit(scenario.title, scenario.id)}
                      type="button"
                    >
                      <StarIcon />
                      <span>{scenario.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </article>

          {turns.map((turn) => {
            const turnSpeakerTarget = `answer:${turn.id}`;

            return (
              <Fragment key={turn.id}>
                <article className="user-message">
                  <p>{turn.message}</p>
                </article>

                <article className="bot-message">
                  <div className="bot-message__meta">
                    <StarIcon />
                    <span>Assistant Prévention</span>
                    <button
                      className={`bot-speaker ${speakingTarget === turnSpeakerTarget ? "bot-speaker--active" : ""}`}
                      onClick={() => void toggleSpeech(turn.response.answer, turnSpeakerTarget)}
                      type="button"
                      aria-label="speaker button"
                      aria-pressed={speakingTarget === turnSpeakerTarget}
                    >
                      <SpeakerIcon />
                    </button>
                  </div>
                  <div className="bot-bubble">
                    <AnswerText data={turn.response} />
                  </div>
                </article>
              </Fragment>
            );
          })}

          {pendingMessage ? (
            <article className="user-message">
              <p>{pendingMessage}</p>
            </article>
          ) : null}

          {state.status === "loading" ? <Loader /> : null}
        </section>

        <footer className="chat-footer">
          <form onSubmit={handleSubmit} className="chat-input">
            <label className="sr-only" htmlFor="coach-question">
              Posez votre question ici
            </label>
            <textarea
              id="coach-question"
              ref={textareaRef}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Posez votre question ici"
              rows={1}
            />
            {isListening ? (
              <div className="chat-listening-bars" aria-hidden="true">
                {Array.from({ length: 18 }, (_, index) => (
                  <span key={index} style={{ animationDelay: `${index * 38}ms` }} />
                ))}
              </div>
            ) : null}
            <Button
              className={`chat-icon-button ${isListening ? "chat-icon-button--active" : ""} ${
                message.trim() ? "chat-icon-button--hidden" : ""
              }`}
              onClick={toggleVoiceInput}
              type="button"
              aria-label={isListening ? "Arrêter la dictée vocale" : "Démarrer la dictée vocale"}
              variant="ghost"
            >
              <MicIcon />
            </Button>
            <button
              className={`chat-icon-button send-when-text ${message.trim() ? "chat-icon-button--visible" : ""}`}
              disabled={state.status === "loading" || !message.trim()}
              type="submit"
              aria-label="Envoyer"
            >
              <SendIcon />
            </button>
          </form>
          {state.status === "error" ? <p className="form-error">{state.message}</p> : null}
          {voiceStatus ? <p className="voice-status">{voiceStatus}</p> : null}
          <p className="chat-privacy-disclaimer">
            Entrée envoie le message, Maj+Entrée ajoute une ligne. Nous vous invitons à ne pas partager
            d&apos;informations personnelles (prénom, état de santé, coordonnées de contact ou bancaires...)
          </p>
        </footer>
        <div ref={conversationEndRef} aria-hidden="true" />
      </main>
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path stroke="#000" strokeLinecap="round" strokeWidth="1.5" d="M20.803 8a40.5 40.5 0 0 1 0 8" />
      <path
        stroke="#000"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M13 12c0-1.884-.163-3.73-.475-5.525-.123-.704-.937-1.019-1.52-.605L8.52 7.632A2 2 0 0 1 7.363 8H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2.363a2 2 0 0 1 1.157.368l2.485 1.762c.583.414 1.397.1 1.52-.605A32 32 0 0 0 13 12Z"
      />
      <path stroke="#000" strokeLinecap="round" strokeWidth="1.5" d="M16.877 9a36.5 36.5 0 0 1 0 6" />
    </svg>
  );
}
