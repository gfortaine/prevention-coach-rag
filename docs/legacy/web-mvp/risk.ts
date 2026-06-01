import type { Audience, RiskAssessment, RiskSignal } from "./types";

const RISK_RULES: Array<{
  label: string;
  keywords: string[];
  impact: number;
  evidence: string;
}> = [
  {
    label: "Fatigue / somnolence",
    keywords: ["fatigue", "fatiguee", "fatigue", "sommeil", "somnolence", "nuit"],
    impact: 24,
    evidence: "La baisse d'attention reduit fortement la capacite d'anticipation.",
  },
  {
    label: "Pluie / adherence degradee",
    keywords: ["pluie", "orage", "mouille", "meteo", "aquaplaning"],
    impact: 18,
    evidence: "L'adherence et la visibilite diminuent; les distances doivent augmenter.",
  },
  {
    label: "Telephone / distraction",
    keywords: ["telephone", "smartphone", "appel", "message", "sms", "notification"],
    impact: 26,
    evidence: "La distraction detourne simultanement regard, main et cognition.",
  },
  {
    label: "Jeune conducteur",
    keywords: ["jeune", "permis", "novice", "apprenti"],
    impact: 12,
    evidence: "Le manque d'experience augmente le besoin de consignes simples et preventives.",
  },
  {
    label: "Accident / zone non securisee",
    keywords: ["accident", "choc", "rond-point", "constat", "panne", "blesse"],
    impact: 22,
    evidence: "La premiere priorite est d'eviter un sur-accident et de qualifier l'urgence.",
  },
  {
    label: "Pression operationnelle flotte",
    keywords: ["flotte", "commerciaux", "livraison", "mission", "manager", "entreprise"],
    impact: 14,
    evidence: "Les objectifs horaires et habitudes d'equipe peuvent renforcer les comportements a risque.",
  },
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function levelFromScore(score: number): RiskAssessment["level"] {
  if (score >= 76) return "critique";
  if (score >= 52) return "eleve";
  if (score >= 28) return "modere";
  return "faible";
}

export function assessRisk(message: string, audience: Audience = "mixte"): RiskAssessment {
  const normalized = normalize(message);
  const signals: RiskSignal[] = RISK_RULES.flatMap((rule) => {
    const matched = rule.keywords.some((keyword) => normalized.includes(normalize(keyword)));
    return matched
      ? [
          {
            label: rule.label,
            impact: rule.impact,
            evidence: rule.evidence,
          },
        ]
      : [];
  });

  const audienceImpact = audience === "flotte" ? 8 : audience === "particulier" ? 4 : 6;
  const rawScore = signals.reduce((sum, signal) => sum + signal.impact, 12 + audienceImpact);
  const score = Math.min(96, Math.max(8, rawScore));
  const level = levelFromScore(score);

  const headline =
    level === "critique"
      ? "Risque critique: conseiller l'arret, la mise en securite ou l'escalade immediate."
      : level === "eleve"
        ? "Risque eleve: recommander une action preventive immediate et mesurable."
        : level === "modere"
          ? "Risque modere: proposer des nudges cibles et reduire les facteurs aggravants."
          : "Risque faible: maintenir les bonnes pratiques et surveiller le contexte.";

  return {
    score,
    level,
    headline,
    signals:
      signals.length > 0
        ? signals
        : [
            {
              label: "Contexte incomplet",
              impact: audienceImpact,
              evidence:
                "Le niveau reste prudent tant que le trajet, l'etat du conducteur et l'environnement ne sont pas qualifies.",
            },
          ],
  };
}
