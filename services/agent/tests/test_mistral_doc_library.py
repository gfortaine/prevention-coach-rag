from __future__ import annotations

from types import SimpleNamespace
from typing import cast

import pytest

from agent import mistral_doc_library
from agent.mistral_doc_library import (
    MistralDocumentLibraryError,
    parse_mistral_document_response,
    query_mistral_document_library,
)


def test_parse_mistral_tool_reference_as_inline_citation() -> None:
    response = SimpleNamespace(
        outputs=[
            SimpleNamespace(
                type="message.output",
                content=[
                    SimpleNamespace(type="text", text="Limiter la vitesse reduit le risque "),
                    SimpleNamespace(
                        type="tool_reference",
                        document_id="doc-road",
                        page=20,
                        title="Livret prevention routiere",
                        snippet="La vitesse aggrave les distances de freinage.",
                    ),
                    SimpleNamespace(type="text", text="."),
                ],
            )
        ],
        usage=SimpleNamespace(total_tokens=42),
    )

    result = parse_mistral_document_response(
        response,
        {
            "doc-road": {
                "document_id": "doc-road",
                "title": "Guide De La Prevention Routiere",
                "guideDomain": "securite_routiere",
                "sourceUrl": "https://example.test/livret.pdf",
            }
        },
    )

    assert result["answer"] == "Limiter la vitesse reduit le risque [1]."
    assert result["sources"][0]["citationUrl"] == "/guide/securite_routiere?page=20"
    assert result["citations"][0]["sourceUrl"] == "/guide/securite_routiere?page=20"
    assert result["citations"][0]["guideDomain"] == "securite_routiere"
    assert result["usage"]["total_tokens"] == 42


def test_parse_mistral_response_strips_trailing_sources_block() -> None:
    response = {
        "outputs": [
            {
                "type": "message.output",
                "content": "Reponse fondee sur le guide [1].\n\nSources principales:\n[1] PDF",
            }
        ]
    }

    result = parse_mistral_document_response(response)

    assert result["answer"] == "Reponse fondee sur le guide [1]."


def test_parse_mistral_tool_reference_with_url_metadata() -> None:
    response = SimpleNamespace(
        outputs=[
            SimpleNamespace(
                type="message.output",
                content=[
                    SimpleNamespace(type="text", text="La vitesse allonge les distances d'arret "),
                    SimpleNamespace(
                        type="tool_reference",
                        title="Livret prevention routiere",
                        url="https://example.test/livret.pdf#page=20",
                        description="Distance d'arret et vitesse.",
                    ),
                    SimpleNamespace(type="text", text="."),
                ],
            )
        ],
        usage=SimpleNamespace(total_tokens=10, prompt_tokens=4, completion_tokens=6),
    )

    result = parse_mistral_document_response(
        response,
        {
            "https://example.test/livret.pdf#page=20": {
                "document_id": "doc-road",
                "title": "Guide De La Prevention Routiere",
                "guideDomain": "securite_routiere",
                "sourceUrl": "https://example.test/livret.pdf",
            }
        },
    )

    assert result["answer"] == "La vitesse allonge les distances d'arret [1]."
    assert result["sources"][0]["id"] == "https://example.test/livret.pdf#page=20"
    assert result["sources"][0]["excerpt"] == "Distance d'arret et vitesse."
    assert result["citations"][0]["sourceUrl"] == "/guide/securite_routiere?page=20"
    assert result["usage"] == {"total_tokens": 10, "input_tokens": 4, "output_tokens": 6}


def test_parse_does_not_fabricate_inline_citation_when_reference_is_not_inline() -> None:
    response = {
        "outputs": [
            {
                "type": "message.output",
                "content": "Reponse sans marqueur numerique.",
            }
        ]
    }

    result = parse_mistral_document_response(response)

    assert result["answer"] == "Reponse sans marqueur numerique."


def test_query_mistral_document_library_wraps_sdk_errors(monkeypatch) -> None:
    class FailingConversations:
        def start(self, **_: object) -> None:
            raise RuntimeError("boom")

    class FailingClient:
        def __init__(self, **_: object) -> None:
            self.beta = SimpleNamespace(conversations=FailingConversations())

    monkeypatch.setenv("MISTRAL_API_KEY", "test")
    monkeypatch.setenv("MISTRAL_AGENT_ID", "agent-test")
    monkeypatch.setattr(cast(object, mistral_doc_library), "Mistral", FailingClient)

    with pytest.raises(MistralDocumentLibraryError, match="Mistral Document Library request failed"):
        query_mistral_document_library("Question")
