import type { PreventionDocument } from "./types";

export const originalCoachUrl = "https://www.axaprevention.fr/fr/Coach_Prevention";
export const originalArticleUrl =
  "https://www.lassuranceenmouvement.com/2024/11/18/axa-lance-un-coach-ia-dedie-a-la-prevention-routiere/";
export const assistantPreventionUrl = "https://axaprevention.fr/fr/assistantprevention";
export const bffRootUrl = "https://coach-prevention-bff.axa.fr";
export const roadSafetyGuidePdfUrl = `${bffRootUrl}/guides/securite_routiere/guide.pdf`;
export const roadSafetyGuideCdnUrl =
  "https://coreaxaprevention.cdn.axa-contento-118412.eu/coreaxaprevention/5186d075-ba22-4361-a267-28e1a9132f9b_livret_AXA_2024_PR_web.pdf";
export const climateGuideCdnUrl =
  "https://coreaxaprevention.cdn.axa-contento-118412.eu/coreaxaprevention/5a7d7a05-922d-4de8-a0f7-9348dffc5df4_guide-climat-environnement.pdf";
export const naturalEventsGuideCdnUrl =
  "https://coreaxaprevention.cdn.axa-contento-118412.eu/coreaxaprevention/43b57919-5028-42e1-9b90-2312304be754_2000567-12.24+MINI+GUIDE+2024.pdf";
export const roadLawPdfUrl = "https://www.legifrance.gouv.fr/download/file/pdf/LEGITEXT000006074228.pdf/LEGI";

export const axaSuggestedQuestions = [
  "Quelles sont les raisons de limiter la vitesse sur la route ?",
  "Quel est le problème avec les gaz à effet de serre ?",
  "Quels équipements avoir chez soi en cas de tempête ?",
] as const;

export const preventionCorpus: PreventionDocument[] = [
  {
    id: "axa-prevention-coach-public",
    title: "Coach AXA Prevention - service public",
    sourceUrl: originalCoachUrl,
    sourceType: "public",
    audience: "particulier",
    tags: ["axa-prevention", "coach", "prevention-routiere", "assistant"],
    content:
      "AXA Prevention presente un Coach Prevention dedie aux questions de prevention routiere. Cette reference publique sert de point d'ancrage produit pour le prototype.",
  },
  {
    id: "axa-prevention-coach-rag-article",
    title: "Article - Coach IA dedie a la prevention routiere",
    sourceUrl: originalArticleUrl,
    sourceType: "public",
    audience: "mixte",
    tags: ["rag", "barometre", "prevention-routiere", "illuin", "statistiques"],
    content:
      "L'article de L'Assurance en Mouvement decrit le Coach AXA Prevention comme un assistant conversationnel de prevention routiere base sur un systeme RAG, alimente par vingt ans de statistiques et recherches issues du barometre AXA Prevention, developpe avec Illuin Technology.",
  },
  {
    id: "guide-securite-routiere-vitesse-page-16",
    title: "Guide De La Prévention Routière.pdf - vitesse et mortalité",
    sourceUrl: roadSafetyGuideCdnUrl,
    citationUrl: "/guide/securite_routiere?page=16",
    sourcePage: 16,
    guideDomain: "securite_routiere",
    sourceType: "public",
    audience: "particulier",
    tags: ["securite-routiere", "vitesse", "mortalite", "barometre", "accident"],
    content:
      "La vitesse est la première cause de mortalité routière en France: la vitesse excessive ou inadaptée est associée à 28 % des accidents mortels en 2023. Elle est à la fois un facteur déclencheur d'accident et un facteur aggravant. Les études montrent que rouler moins vite diminue les risques d'accident: baisser sa vitesse moyenne de seulement 1 % fait mécaniquement baisser le taux d'accident mortel de 4 %.",
  },
  {
    id: "guide-securite-routiere-vitesse-page-20",
    title: "Guide De La Prévention Routière.pdf - cinq raisons de limiter la vitesse",
    sourceUrl: roadSafetyGuideCdnUrl,
    citationUrl: "/guide/securite_routiere?page=20",
    sourcePage: 20,
    guideDomain: "securite_routiere",
    sourceType: "public",
    audience: "particulier",
    tags: ["securite-routiere", "vitesse", "freinage", "distance-arret", "fatigue"],
    content:
      "Les 5 raisons scientifiques de limiter la vitesse: elle augmente considérablement les distances de freinage et d'arrêt du véhicule; quand la vitesse est doublée, la distance d'arrêt est multipliée par 4. Elle diminue la visibilité en réduisant le champ de vision du conducteur. Le véhicule adhère moins à la route. Elle est à l'origine de pertes de contrôle du véhicule. Elle augmente la fatigue du conducteur.",
  },
  {
    id: "guide-climat-environnement",
    title: "Guide Climat et Environnement",
    sourceUrl: climateGuideCdnUrl,
    citationUrl: "/guide/climat",
    guideDomain: "climat",
    sourceType: "public",
    audience: "mixte",
    tags: ["climat", "environnement", "gaz-effet-serre", "empreinte-carbone"],
    content:
      "Le guide Climat et Environnement AXA Prévention sert de source pour les questions sur le changement climatique, les gaz à effet de serre, l'empreinte carbone et les comportements de prévention liés à l'environnement.",
  },
  {
    id: "mini-guide-evenements-naturels",
    title: "Bien se protéger face aux événements naturels",
    sourceUrl: naturalEventsGuideCdnUrl,
    citationUrl: "/guide/miniguide",
    guideDomain: "miniguide",
    sourceType: "public",
    audience: "particulier",
    tags: ["tempete", "inondation", "catastrophe-naturelle", "equipements", "prevention"],
    content:
      "Le mini-guide AXA Prévention aide à se préparer face aux événements naturels: tempête, inondation, épisodes climatiques extrêmes, équipements utiles à domicile, anticipation et gestes de protection.",
  },
  {
    id: "code-route-legifrance",
    title: "Code de la route - Legifrance",
    sourceUrl: roadLawPdfUrl,
    guideDomain: "securite_routiere",
    sourceType: "public",
    audience: "mixte",
    tags: ["code-route", "legifrance", "reglementation", "securite-routiere"],
    content:
      "Le Code de la route publié sur Legifrance constitue la connaissance externe réglementaire observée dans le bundle de l'assistant AXA Prévention.",
  },
  {
    id: "axa-databricks-public-stack",
    title: "AXA France - Data Intelligence Platform",
    sourceUrl: "https://www.databricks.com/customers/axa-france",
    sourceType: "public",
    audience: "mixte",
    tags: ["axa", "databricks", "data", "lakehouse", "architecture"],
    content:
      "Databricks presente AXA France comme un acteur ayant unifie environ 200 TB de donnees depuis 54 sources sur sa Data Intelligence Platform. Cette reference soutient un discours lakehouse, gouvernance et analytics pour la prevention.",
  },
  {
    id: "axa-secure-gpt-microsoft",
    title: "AXA Secure GPT - Azure OpenAI securise",
    sourceUrl:
      "https://www.microsoft.com/en/customers/story/1760377839901581759-axa-gie-azure-insurance-en-france",
    sourceType: "public",
    audience: "mixte",
    tags: ["axa", "secure-gpt", "azure-openai", "security", "governance"],
    content:
      "Microsoft documente AXA Secure GPT comme une solution d'IA generative construite avec Azure OpenAI Service dans un environnement cloud securise avec authentification, audit trail, filtrage de contenu et protections anti-jailbreak.",
  },
  {
    id: "fatigue-night-rain",
    title: "Fatigue, pluie et conduite nocturne",
    sourceUrl: "demo://prevention/fatigue-pluie",
    sourceType: "demo",
    audience: "particulier",
    tags: ["fatigue", "pluie", "nuit", "somnolence", "jeune-conducteur"],
    content:
      "La fatigue multiplie les erreurs d'attention. Sous la pluie ou de nuit, la distance de freinage augmente et les signaux faibles sont plus difficiles a percevoir. Le coach recommande pause, report du trajet, vitesse reduite, distances allongees et itineraire moins complexe.",
  },
  {
    id: "phone-distraction-fleet",
    title: "Telephone au volant - flotte entreprise",
    sourceUrl: "demo://prevention/flotte-telephone",
    sourceType: "demo",
    audience: "flotte",
    tags: ["telephone", "distraction", "flotte", "politique", "formation"],
    content:
      "Pour une flotte, la reduction du telephone au volant combine regle claire, mode conduite obligatoire, messages differes, formation managers, indicateurs anonymises, rappels avant mission et suivi non punitif des situations a risque.",
  },
  {
    id: "minor-accident-guidance",
    title: "Accident materiel leger",
    sourceUrl: "demo://prevention/accident-leger",
    sourceType: "demo",
    audience: "particulier",
    tags: ["accident", "constat", "securite", "assurance"],
    content:
      "Apres un accident materiel leger, la priorite est la securite: se mettre a l'abri, signaler, verifier l'absence de blessure, documenter les faits, remplir un constat si possible et contacter assistance ou assureur. Le coach ne donne pas d'avis juridique definitif.",
  },
  {
    id: "fleet-risk-program",
    title: "Programme prevention flotte",
    sourceUrl: "demo://prevention/programme-flotte",
    sourceType: "demo",
    audience: "flotte",
    tags: ["flotte", "kpi", "telematique", "formation", "management"],
    content:
      "Un programme flotte efficace segmente les risques par metier, trajet, horaire et vehicule; suit des KPI agreges; combine coaching, formation courte, nudges et revues managers; et preserve la vie privee en evitant le monitoring individuel non justifie.",
  },
  {
    id: "rag-security-pattern",
    title: "Pattern RAG securise pour assureur",
    sourceUrl: "demo://architecture/rag-security",
    sourceType: "architecture",
    audience: "mixte",
    tags: ["rag", "security", "rgpd", "guardrails", "audit", "langgraph"],
    content:
      "Un RAG assureur doit separer instructions et documents, citer les sources, journaliser les traces, limiter les donnees personnelles, filtrer les injections de prompt, indiquer l'incertitude et escalader vers un humain lorsque la question sort du corpus ou touche au juridique ou medical.",
  },
];

export function getScenarioPrompt(scenarioId?: string): string | undefined {
  const prompts: Record<string, string> = {
    speed: axaSuggestedQuestions[0],
    greenhouse: axaSuggestedQuestions[1],
    storm: axaSuggestedQuestions[2],
    fatigue:
      "Je suis jeune conducteur, je dois rentrer sous la pluie ce soir et je me sens fatigue. Que me conseillez-vous ?",
    fleet:
      "Comment reduire rapidement le risque telephone au volant dans une flotte de commerciaux sans creer de surveillance intrusive ?",
    accident:
      "J'ai eu un accident materiel leger sur un rond-point. Personne ne semble blesse. Que dois-je faire dans les 10 prochaines minutes ?",
    architecture:
      "Expliquez l'architecture cible RAG multi-agents pour AXA Prevention avec Vercel, LangGraph Cloud et un equivalent Azure AI Search sans Azure.",
  };

  return scenarioId ? prompts[scenarioId] : undefined;
}
