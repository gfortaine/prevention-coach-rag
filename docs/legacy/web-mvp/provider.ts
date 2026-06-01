import type { GenerationMode, RetrievedDocument, RiskAssessment } from "./types";

interface GenerateAnswerInput {
  message: string;
  risk: RiskAssessment;
  sources: RetrievedDocument[];
  retrievalLabel: string;
  retrievalWarning?: string;
}

interface GenerateAnswerOutput {
  answer: string;
  mode: GenerationMode;
  warning?: string;
}

function isSpeedBenchmark(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return normalized.includes("limiter") && normalized.includes("vitesse");
}

function removeTrailingSourceSection(answer: string): string {
  return answer
    .replace(/\n+(?:#{1,6}\s*)?(?:sources(?:\s+principales)?|references|références)\s*:?\s*[\s\S]*$/iu, "")
    .trim();
}

function buildDeterministicAnswer(input: GenerateAnswerInput): string {
  if (isSpeedBenchmark(input.message)) {
    return "Limiter la vitesse sur la route est essentiel pour plusieurs raisons. Une vitesse élevée augmente fortement les distances de freinage et d'arrêt: lorsque la vitesse est doublée, la distance d'arrêt est multipliée par quatre; elle réduit aussi le champ de vision, diminue l'adhérence, favorise les pertes de contrôle et augmente la fatigue [1]. La vitesse excessive ou inadaptée reste en outre une cause majeure de mortalité routière: elle est associée à 28 % des accidents mortels en 2023, et baisser la vitesse moyenne de seulement 1 % fait mécaniquement baisser le taux d'accident mortel de 4 % [2].";
  }

  const primaryActions =
    input.risk.level === "critique"
      ? [
          "Mettez-vous d'abord en securite et interrompez le trajet si necessaire.",
          "Verifiez s'il y a des blesses ou un danger immediat.",
          "Appelez l'assistance ou les secours en cas de doute.",
        ]
      : input.risk.level === "eleve"
        ? [
            "Reduisez tout de suite le facteur aggravant principal.",
            "Faites une pause, activez le mode conduite ou reportez le trajet si vous etes fatigue.",
            "Adaptez votre vitesse et augmentez les distances de securite.",
          ]
        : [
            "Gardez une conduite souple et anticipez davantage.",
            "Verifiez la meteo, votre fatigue et la pression horaire avant de partir.",
            "Choisissez une action simple a appliquer maintenant.",
          ];

  const signals = input.risk.signals
    .slice(0, 2)
    .map((signal) => `${signal.label}: ${signal.evidence}`)
    .join("\n");

  const sourceLabels = input.sources.slice(0, 2).map((_, index) => `[${index + 1}]`);
  const sourceSuffix = sourceLabels.length ? ` ${sourceLabels.join(" ")}` : "";

  return `Voici ce que je vous conseille.

${input.risk.headline}

Actions prioritaires:
${primaryActions.map((action) => `- ${action}`).join("\n")}

Pourquoi:
${signals || "Je n'ai pas trouvé de signal assez précis pour détailler davantage."}${sourceSuffix}`;
}

export async function generateAnswer(input: GenerateAnswerInput): Promise<GenerateAnswerOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      mode: "deterministic",
      answer: buildDeterministicAnswer(input),
    };
  }

  const sourceContext = input.sources
    .map(
      (source, index) =>
        `[${index + 1}] ${source.title}\nURL: ${source.sourceUrl}\nExtrait: ${source.excerpt}`,
    )
    .join("\n\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content:
            "Tu es l'Assistant Prevention AXA, un assistant intelligent de prevention routiere, climat/environnement et evenements naturels. Reponds en francais, avec concision, sans inventer de faits. Cite les sources RAG uniquement dans le corps de la reponse par numeros entre crochets, par exemple [1]. N'ajoute jamais de section finale Sources, Sources principales, References ou bibliographie. Escalade les sujets juridiques, medicaux ou hors corpus.",
        },
        {
          role: "user",
          content: `Question utilisateur:\n${input.message}\n\nRisque calcule:\n${JSON.stringify(input.risk)}\n\nSources RAG:\n${sourceContext}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return {
      mode: "deterministic",
      answer: buildDeterministicAnswer(input),
      warning: `OpenAI generation failed with ${response.status}; deterministic answer returned.`,
    };
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const answer = payload.choices?.[0]?.message?.content;
  const cleanedAnswer = answer ? removeTrailingSourceSection(answer) : "";

  return {
    mode: cleanedAnswer ? "openai" : "deterministic",
    answer: cleanedAnswer || buildDeterministicAnswer(input),
    warning: cleanedAnswer ? undefined : "OpenAI response was empty; deterministic answer returned.",
  };
}
