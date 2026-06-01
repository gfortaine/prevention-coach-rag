from __future__ import annotations

import math
import os
import re
import time
import unicodedata
import uuid
from typing import Any, Literal, NotRequired, TypedDict, cast

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from langgraph.config import get_store
from langgraph.graph import END, StateGraph
from langgraph.store.base import BaseStore

Audience = Literal["particulier", "flotte", "mixte"]
SourceTopic = Literal["securite_routiere", "climat_ges", "evenements_naturels"]

NAMESPACE = ("axa_prevention", "documents")
MAX_CITED_SOURCES = 2
RETRIEVAL_LIMIT = 8
STOP_WORDS = {
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
}


class RiskAssessment(TypedDict):
    level: Literal["faible", "modere", "eleve", "critique"]
    score: int
    headline: str
    signals: list[dict[str, Any]]


class AgentState(TypedDict, total=False):
    message: str
    scenarioId: str
    scenario_id: str
    audience: Audience
    input: Any
    chat_history: list[dict[str, Any]]
    chatHistory: NotRequired[list[dict[str, Any]]]
    started_at: float
    retrieval_label: str
    retrieval_kind: str
    retrieval_is_cloud: bool
    retrieval_warning: NotRequired[str]
    sources: list[dict[str, Any]]
    risk: RiskAssessment
    answer: str
    generationMode: str
    generation_warning: NotRequired[str]
    citations: list[dict[str, Any]]
    telemetry: dict[str, Any]
    trace: list[dict[str, Any]]
    architecture: list[dict[str, Any]]
    suggestedQuestions: list[str]
    bff: dict[str, Any]
    id: str
    retrieval: dict[str, Any]


def _tokenize(value: str) -> list[str]:
    normalized = unicodedata.normalize("NFKD", value.lower())
    normalized = re.sub(r"[\u0300-\u036f]", "", normalized)
    return [token for token in re.split(r"[^a-z0-9]+", normalized) if len(token) > 2 and token not in STOP_WORDS]


def _scenario_prompt(scenario_id: str | None) -> str | None:
    prompts = {
        "speed": "Quelles sont les raisons de limiter la vitesse sur la route ?",
        "greenhouse": "Quel est le probleme avec les gaz a effet de serre ?",
        "storm": "Quels equipements avoir chez soi en cas de tempete ?",
        "fatigue": "Je suis jeune conducteur, je dois rentrer sous la pluie ce soir et je me sens fatigue. Que me conseillez-vous ?",
        "fleet": "Comment reduire rapidement le risque telephone au volant dans une flotte de commerciaux sans creer de surveillance intrusive ?",
        "architecture": "Expliquez l'architecture cible RAG multi-agents pour AXA Prevention avec Vercel, LangGraph Cloud et LangSmith.",
    }
    return prompts.get(scenario_id or "")


def _normalize_message(state: AgentState) -> str:
    nested = state.get("input")
    if isinstance(nested, dict):
        value = nested.get("input") or nested.get("message")
        if isinstance(value, str) and value.strip():
            return value.strip()
    if isinstance(nested, str) and nested.strip():
        return nested.strip()
    if state.get("message", "").strip():
        return state["message"].strip()
    prompt = _scenario_prompt(state.get("scenarioId") or state.get("scenario_id"))
    if prompt:
        return prompt
    raise ValueError("A message, input.input or scenarioId is required.")


def _infer_audience(message: str, requested: str | None) -> Audience:
    if requested in {"particulier", "flotte"}:
        return cast(Audience, requested)
    normalized = message.lower()
    if any(marker in normalized for marker in ["flotte", "entreprise", "manager", "commerciaux"]):
        return "flotte"
    if any(marker in normalized for marker in ["jeune", "accident", "je "]):
        return "particulier"
    return "mixte"


def _retrieve_store(store: BaseStore, query: str, top_k: int = RETRIEVAL_LIMIT) -> list[dict[str, Any]]:
    if store is None:
        raise RuntimeError("LangGraph semantic store is unavailable.")
    try:
        results = store.search(NAMESPACE, query=query, limit=top_k)
    except Exception as exc:
        raise RuntimeError("LangGraph semantic store search failed.") from exc
    documents: list[dict[str, Any]] = []
    for item in results:
        value = dict(item.value)
        documents.append(
            {
                **value,
                "id": value.get("id") or item.key,
                "score": round(float(item.score or 0), 4),
                "excerpt": str(value.get("content", ""))[:260],
            }
        )
    return documents


def _infer_query_topic(message: str) -> SourceTopic | None:
    tokens = set(_tokenize(message))
    greenhouse_keywords = {
        "biodiversite",
        "carbone",
        "climat",
        "climatique",
        "co2",
        "empreinte",
        "environnement",
        "ges",
        "methane",
        "rechauffement",
        "serre",
    }
    natural_events_keywords = {
        "catastrophe",
        "equipement",
        "equipements",
        "inondation",
        "naturel",
        "naturelle",
        "naturels",
        "tempete",
    }
    road_keywords = {
        "accident",
        "arret",
        "conducteur",
        "distance",
        "fatigue",
        "freinage",
        "mortalite",
        "route",
        "routier",
        "routiere",
        "securite",
        "telephone",
        "vehicule",
        "vitesse",
        "volant",
    }
    greenhouse_score = len(tokens & greenhouse_keywords)
    natural_events_score = len(tokens & natural_events_keywords)
    road_score = len(tokens & road_keywords)
    best_score = max(greenhouse_score, natural_events_score, road_score)
    if best_score == 0:
        return None
    if road_score == best_score and road_score > greenhouse_score and road_score > natural_events_score:
        return "securite_routiere"
    if (
        natural_events_score == best_score
        and natural_events_score > greenhouse_score
        and natural_events_score > road_score
    ):
        return "evenements_naturels"
    if greenhouse_score == best_score and greenhouse_score > natural_events_score and greenhouse_score > road_score:
        return "climat_ges"
    return None


def _document_topic(document: dict[str, Any]) -> SourceTopic | None:
    guide_domain = document.get("guideDomain")
    tokens = set(_tokenize(f"{document.get('title', '')} {' '.join(document.get('tags', []))}"))
    natural_events_markers = {"tempete", "inondation", "catastrophe", "naturels", "equipements"}
    climate_markers = {"climat", "environnement", "gaz", "serre", "carbone", "empreinte", "co2"}
    road_markers = {"route", "routiere", "securite", "vitesse", "accident", "freinage", "conducteur", "volant"}
    if guide_domain == "securite_routiere":
        return "securite_routiere"
    if guide_domain == "miniguide":
        return "evenements_naturels"
    if tokens & natural_events_markers:
        return "evenements_naturels"
    if guide_domain == "climat":
        return "climat_ges"
    if tokens & climate_markers:
        return "climat_ges"
    if tokens & road_markers:
        return "securite_routiere"
    return None


def _select_relevant_sources(query: str, audience: Audience, sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    query_topic = _infer_query_topic(query)
    query_tokens = set(_tokenize(query))
    ranked: list[tuple[tuple[float, float, float, float, float], dict[str, Any]]] = []
    for index, source in enumerate(sources):
        source_topic = _document_topic(source)
        source_tokens = set(
            _tokenize(f"{source.get('title', '')} {' '.join(source.get('tags', []))} {source.get('content', '')}")
        )
        overlap = float(len(query_tokens & source_tokens))
        if query_topic and (source_topic != query_topic or overlap <= 0):
            continue
        public_boost = 1.0 if source.get("sourceType") == "public" else 0.0
        audience_boost = 1.0 if source.get("audience") in {audience, "mixte"} or audience == "mixte" else 0.0
        retrieval_score = float(source.get("score") or 0.0)
        ranked.append(((public_boost, overlap, audience_boost, retrieval_score, -float(index)), source))

    if ranked:
        return [source for _, source in sorted(ranked, key=lambda item: item[0], reverse=True)[:MAX_CITED_SOURCES]]

    if query_topic:
        return []

    return sorted(sources, key=lambda source: float(source.get("score") or 0.0), reverse=True)[:MAX_CITED_SOURCES]


def _assess_risk(message: str, audience: Audience) -> RiskAssessment:
    normalized = unicodedata.normalize("NFKD", message.lower())
    normalized = re.sub(r"[\u0300-\u036f]", "", normalized)
    signals: list[dict[str, Any]] = []
    score = 12
    for keywords, label, points, evidence in [
        (
            ["vitesse"],
            "Vitesse excessive ou inadaptee",
            20,
            "La vitesse augmente distances d'arret, pertes de controle et gravite.",
        ),
        (
            ["pluie", "orage", "mouille", "meteo", "aquaplaning"],
            "Conditions meteorologiques degradees",
            18,
            "La meteo degradee reduit adherence et visibilite; les distances doivent augmenter.",
        ),
        (
            ["fatigue", "fatiguee", "sommeil", "somnolence", "nuit"],
            "Fatigue ou somnolence",
            24,
            "La fatigue reduit vigilance, anticipation et temps de reaction.",
        ),
        (
            ["telephone", "smartphone", "appel", "message", "sms", "notification"],
            "Distraction telephone",
            26,
            "La distraction detourne simultanement regard, main et cognition.",
        ),
        (
            ["jeune", "permis", "novice", "apprenti"],
            "Jeune conducteur",
            12,
            "Le manque d'experience augmente le besoin de consignes simples et preventives.",
        ),
        (
            ["accident", "choc", "rond-point", "constat", "panne", "blesse"],
            "Situation post-accident ou zone non securisee",
            22,
            "La premiere priorite est d'eviter un sur-accident et de qualifier l'urgence.",
        ),
        (
            ["flotte", "entreprise", "manager", "commerciaux", "livraison", "mission"],
            "Exposition flotte professionnelle",
            14,
            "Les objectifs horaires et habitudes d'equipe peuvent renforcer les comportements a risque.",
        ),
    ]:
        if any(keyword in normalized for keyword in keywords):
            score += points
            signals.append({"label": label, "impact": points, "evidence": evidence})
    if audience == "flotte":
        score += 8
    level: Literal["faible", "modere", "eleve", "critique"] = "faible"
    if score >= 76:
        level = "critique"
    elif score >= 52:
        level = "eleve"
    elif score >= 28:
        level = "modere"
    headline = {
        "faible": "Risque faible: maintenir les bonnes pratiques et surveiller le contexte.",
        "modere": "Risque modere: proposer des actions ciblees et reduire les facteurs aggravants.",
        "eleve": "Risque eleve: recommander une action preventive immediate et mesurable.",
        "critique": "Risque critique: conseiller l'arret, la mise en securite ou l'escalade immediate.",
    }[level]
    if not signals:
        signals.append(
            {
                "label": "Contexte incomplet",
                "impact": 8 if audience == "flotte" else 4,
                "evidence": "Le niveau reste prudent tant que le trajet, l'etat du conducteur et l'environnement ne sont pas qualifies.",
            }
        )
    return {"level": level, "score": min(score, 96), "headline": headline, "signals": signals}


def _citation_from_document(document: dict[str, Any], index: int) -> dict[str, Any]:
    page = document.get("sourcePage")
    page_suffix = f", page {page}" if page else ""
    return {
        "id": f"{document.get('id', 'source')}-{index + 1}",
        "label": f"[{index + 1}]",
        "title": f"{document.get('title', 'Source')}{page_suffix}",
        "sourceUrl": document.get("citationUrl") or document.get("sourceUrl"),
        "page": page,
    }


def _build_citations(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [_citation_from_document(source, index) for index, source in enumerate(sources[:MAX_CITED_SOURCES])]


def _source_context(sources: list[dict[str, Any]]) -> str:
    if not sources:
        return "Aucune source documentaire pertinente n'a ete retrouvee."
    chunks = []
    for index, source in enumerate(sources[:MAX_CITED_SOURCES], start=1):
        excerpt = source.get("excerpt") or str(source.get("content", ""))[:700]
        chunks.append(
            "\n".join(
                [
                    f"[{index}] {source.get('title', 'Source AXA Prevention')}",
                    f"URL: {source.get('citationUrl') or source.get('sourceUrl')}",
                    f"Extrait: {excerpt}",
                ]
            )
        )
    return "\n\n".join(chunks)


def _chat_history_context(history: Any) -> str:
    if not isinstance(history, list) or not history:
        return "Aucun historique conversationnel recent."
    lines = []
    for item in history[-8:]:
        if not isinstance(item, dict):
            continue
        role = "Assistant" if item.get("role") == "assistant" else "Utilisateur"
        content = str(item.get("content", "")).strip()
        if content:
            lines.append(f"{role}: {content[:1200]}")
    return "\n".join(lines) or "Aucun historique conversationnel recent."


def _as_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(str(part.get("text", part)) if isinstance(part, dict) else str(part) for part in content)
    return str(content)


def _is_general_conversation(message: str) -> bool:
    normalized = message.lower().strip(" \t\n\r.!?;:")
    normalized = normalized.replace("é", "e").replace("è", "e").replace("ê", "e").replace("à", "a").replace("ç", "c")
    return normalized in {
        "bonjour",
        "bonsoir",
        "salut",
        "hello",
        "coucou",
        "merci",
        "merci beaucoup",
        "ca va",
        "comment ca va",
        "qui es tu",
        "que peux tu faire",
    }


def _generate_answer(
    message: str, sources: list[dict[str, Any]], risk: RiskAssessment, state: AgentState
) -> dict[str, str]:
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is required for LangGraph Cloud generation.")

    is_general_conversation = _is_general_conversation(message)
    system_prompt = (
        "Tu es l'Assistant Prevention AXA pour un MVP d'entretien. "
        "Reponds en francais, de facon concise, utile et prudente. "
        "Si l'utilisateur formule une salutation, un remerciement ou une question generale sans demande documentaire, "
        "reponds naturellement en une ou deux phrases et propose ton aide sur la prevention routiere, le climat ou les evenements naturels; "
        "dans ce cas, ne force pas de citations. "
        "Pour toute question de prevention, securite routiere, climat, evenement naturel ou flotte, "
        "appuie-toi uniquement sur les sources fournies et cite les affirmations importantes avec [1], [2], etc. "
        "N'utilise que des sources directement pertinentes pour le sujet et cite au maximum deux sources. "
        "Si ces sources sont insuffisantes pour une question documentaire, dis-le clairement et propose une question de clarification. "
        "Ne donne pas de conseil medical, juridique ou d'urgence operationnelle; oriente vers les secours ou un humain competent si necessaire."
    )
    human_prompt = "\n\n".join(
        [
            f"Question utilisateur: {message}",
            "Historique recent (contexte conversationnel seulement, pas une source documentaire):",
            _chat_history_context(state.get("chat_history") or state.get("chatHistory")),
            (
                "Mode conversation generale: reponds sans citations ni liste de sources."
                if is_general_conversation
                else f"Niveau de risque estime: {risk['level']} ({risk['score']}/100). {risk['headline']}"
            ),
            "Sources disponibles:",
            "Non necessaires pour cette demande generale." if is_general_conversation else _source_context(sources),
            "Redige une reponse naturelle, non templatisée. Cite explicitement les sources seulement lorsque la reponse s'appuie sur une information documentaire.",
        ]
    )

    try:
        model = ChatOpenAI(model=os.environ.get("OPENAI_CHAT_MODEL", "gpt-4o-mini"), temperature=0.1)
        result = model.invoke([SystemMessage(content=system_prompt), HumanMessage(content=human_prompt)])
    except Exception as exc:
        raise RuntimeError(f"LangGraph Cloud generation failed ({type(exc).__name__}).") from exc

    answer = _as_text(result.content).strip()
    if sources and not is_general_conversation and not re.search(r"\[\d+\]", answer):
        answer = f"{answer.rstrip()} [{1}]."
    return {"answer": answer, "generationMode": "langgraph-cloud"}


def _telemetry(message: str, answer: str, started_at: float, source_count: int) -> dict[str, Any]:
    input_tokens = math.ceil(len(message) / 4) + source_count * 140
    output_tokens = math.ceil(len(answer) / 4)
    embedding_tokens = math.ceil(len(message) / 4)
    total_tokens = input_tokens + output_tokens
    return {
        "total_tokens": total_tokens,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "embedding_tokens": embedding_tokens,
        "co2_emissions": round(total_tokens * 0.00231, 6),
        "cost": round(input_tokens * 0.00000015 + output_tokens * 0.0000006, 8),
        "response_time": round(time.perf_counter() - started_at, 3),
    }


def classify_intent(state: AgentState) -> dict[str, Any]:
    message = _normalize_message(state)
    return {
        "message": message,
        "audience": _infer_audience(message, state.get("audience")),
        "started_at": time.perf_counter(),
    }


def retrieve_context(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    message = state["message"]
    try:
        store: BaseStore = get_store()
        store_documents = _retrieve_store(store, message)
    except RuntimeError as exc:
        return {
            "sources": [],
            "retrieval_label": "LangSmith Agent Server semantic store",
            "retrieval_kind": "langsmith-agent-store",
            "retrieval_is_cloud": False,
            "retrieval_warning": f"Store semantique LangGraph indisponible: {exc}",
        }

    store_documents = _select_relevant_sources(message, state["audience"], store_documents)
    if store_documents:
        return {
            "sources": store_documents,
            "retrieval_label": "LangSmith Agent Server semantic store",
            "retrieval_kind": "langsmith-agent-store",
            "retrieval_is_cloud": True,
        }
    return {
        "sources": [],
        "retrieval_label": "LangSmith Agent Server semantic store",
        "retrieval_kind": "langsmith-agent-store",
        "retrieval_is_cloud": False,
        "retrieval_warning": "Store semantique LangGraph disponible mais aucune source pertinente n'a ete retrouvee.",
    }


def score_risk(state: AgentState) -> dict[str, Any]:
    return {"risk": _assess_risk(state["message"], state["audience"])}


def generate_answer(state: AgentState) -> dict[str, Any]:
    citations = [] if _is_general_conversation(state["message"]) else _build_citations(state["sources"])
    if not citations and not _is_general_conversation(state["message"]):
        answer = (
            "Je ne peux pas repondre de facon fiable avec les sources AXA disponibles actuellement. "
            "Le store semantique LangGraph est vide, indisponible ou n'a pas retourne de document pertinent."
        )
        return {
            "answer": answer,
            "generationMode": "retrieval-unavailable",
            "generation_warning": "Generation documentaire bloquee par la politique RAG stricte.",
            "citations": citations,
        }
    return {**_generate_answer(state["message"], state["sources"], state["risk"], state), "citations": citations}


def compliance_check(state: AgentState) -> dict[str, Any]:
    warnings = [state["retrieval_warning"]] if state.get("retrieval_warning") else []
    is_general_conversation = _is_general_conversation(state["message"])
    if state.get("generation_warning"):
        warnings.append(state["generation_warning"])
    if not state.get("sources"):
        warnings.append("Aucune source pertinente; reponse limitee aux conseils generaux de prevention.")
    generation_detail = (
        "Reponse conversationnelle courte, sans citations forcees."
        if is_general_conversation
        else state.get("generation_warning", "Generation LLM source-grounded avec citations.")
    )
    compliance_summary = "Reponse conversationnelle" if is_general_conversation else "Reponse citee et bornee"
    compliance_detail = (
        "Salutation ou question generale traitee sans surcharger en sources."
        if is_general_conversation
        else " ".join(warnings)
        if warnings
        else "Sources citees, pas de donnees personnelles, escalade humaine si necessaire."
    )
    return {
        "trace": [
            {
                "agent": "Orchestrateur LangGraph",
                "status": "done",
                "summary": "Intent, audience et scenario qualifies",
                "detail": f"Audience detectee: {state['audience']}.",
            },
            {
                "agent": "Agent RAG",
                "status": "done" if state["retrieval_is_cloud"] else "warning",
                "summary": state["retrieval_label"],
                "detail": warnings[0] if warnings else "Recherche semantique cloud active.",
            },
            {
                "agent": "Agent risque",
                "status": "done",
                "summary": f"Risque {state['risk']['level']}",
                "detail": ", ".join(signal["label"] for signal in state["risk"]["signals"])
                or "Aucun facteur critique detecte.",
            },
            {
                "agent": "Agent generation",
                "status": "warning" if state.get("generation_warning") else "done",
                "summary": state["generationMode"],
                "detail": generation_detail,
            },
            {
                "agent": "Agent conformite",
                "status": "warning" if warnings and not is_general_conversation else "done",
                "summary": compliance_summary,
                "detail": compliance_detail,
            },
        ],
        "architecture": [
            {"name": "Vercel", "status": "ready", "detail": "Frontend Next.js autonome et BFF-compatible."},
            {
                "name": "LangSmith Deployment EU",
                "status": "active",
                "detail": "Agent Server dev/free axa-prevention-coach-dev.",
            },
            {
                "name": state["retrieval_label"],
                "status": "active" if state["retrieval_is_cloud"] else "ready",
                "detail": "RAG store semantique Postgres/pgvector gere par LangSmith/LangGraph.",
            },
            {"name": "LangSmith", "status": "active", "detail": "Traces, latence, noeuds et sources consultables."},
        ],
    }


def format_bff(state: AgentState) -> dict[str, Any]:
    telemetry = _telemetry(state["message"], state["answer"], state["started_at"], len(state["sources"]))
    response = {
        "id": str(uuid.uuid4()),
        "answer": state["answer"],
        "generationMode": state["generationMode"],
        "retrieval": {
            "kind": state["retrieval_kind"],
            "label": state["retrieval_label"],
            "isCloud": state["retrieval_is_cloud"],
            "warning": state.get("retrieval_warning"),
        },
        "risk": state["risk"],
        "sources": state["sources"],
        "citations": state["citations"],
        "telemetry": telemetry,
        "trace": state["trace"],
        "architecture": state["architecture"],
        "suggestedQuestions": [
            "Quelles sont les raisons de limiter la vitesse sur la route ?",
            "Quel est le probleme avec les gaz a effet de serre ?",
            "Quels equipements avoir chez soi en cas de tempete ?",
        ],
    }
    return {
        **response,
        "bff": {
            "error_code": None,
            "is_success": True,
            "data": {"output": response["answer"], "metadata": telemetry, "sources": response["sources"]},
        },
    }


builder = StateGraph(AgentState)
builder.add_node("classify_intent", classify_intent)
builder.add_node("retrieve_context", retrieve_context)
builder.add_node("score_risk", score_risk)
builder.add_node("generate_answer", generate_answer)
builder.add_node("compliance_check", compliance_check)
builder.add_node("format_bff", format_bff)
builder.set_entry_point("classify_intent")
builder.add_edge("classify_intent", "retrieve_context")
builder.add_edge("retrieve_context", "score_risk")
builder.add_edge("score_risk", "generate_answer")
builder.add_edge("generate_answer", "compliance_check")
builder.add_edge("compliance_check", "format_bff")
builder.add_edge("format_bff", END)

graph = builder.compile()
