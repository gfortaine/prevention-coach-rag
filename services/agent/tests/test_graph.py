from __future__ import annotations

from agent.graph import (
    _build_citations,
    _infer_audience,
    _infer_query_topic,
    _is_general_conversation,
    _normalize_message,
    _select_relevant_sources,
    _tokenize,
)


def test_tokenize_normalizes_french_accents() -> None:
    assert _tokenize("Gaz à effet de serre, sécurité routière!") == [
        "gaz",
        "effet",
        "serre",
        "securite",
        "routiere",
    ]


def test_normalize_message_accepts_langserve_input() -> None:
    assert _normalize_message({"input": {"input": " Bonjour "}}) == "Bonjour"


def test_infer_audience_honors_valid_request() -> None:
    assert _infer_audience("question", "flotte") == "flotte"


def test_general_conversation_is_not_source_forced() -> None:
    assert _is_general_conversation("bonjour")


def test_topic_routing_distinguishes_greenhouse_and_road() -> None:
    assert _infer_query_topic("Quel est le probleme avec les gaz a effet de serre ?") == "climat_ges"
    assert _infer_query_topic("Pourquoi limiter la vitesse sur la route ?") == "securite_routiere"


def test_source_selection_excludes_unrelated_road_source_for_greenhouse_question() -> None:
    sources = [
        {
            "id": "road",
            "title": "Guide De La Prevention Routiere",
            "guideDomain": "securite_routiere",
            "tags": ["vitesse"],
            "content": "La vitesse augmente la distance d'arret.",
            "sourceType": "public",
            "score": 0.9,
        },
        {
            "id": "climate",
            "title": "Guide Climat et Environnement",
            "guideDomain": "climat",
            "tags": ["gaz", "serre", "carbone"],
            "content": "Les gaz a effet de serre contribuent au rechauffement climatique.",
            "sourceType": "public",
            "score": 0.7,
        },
    ]

    selected = _select_relevant_sources("Quel est le probleme avec les gaz a effet de serre ?", "mixte", sources)

    assert [source["id"] for source in selected] == ["climate"]


def test_citations_are_limited_and_ordered() -> None:
    citations = _build_citations(
        [
            {"id": "a", "title": "A", "sourceUrl": "https://example.com/a"},
            {"id": "b", "title": "B", "sourceUrl": "https://example.com/b"},
            {"id": "c", "title": "C", "sourceUrl": "https://example.com/c"},
        ]
    )

    assert [citation["label"] for citation in citations] == ["[1]", "[2]"]
