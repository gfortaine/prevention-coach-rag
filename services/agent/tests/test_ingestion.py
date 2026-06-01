from __future__ import annotations

from agent.ingestion import SourceMetadata, pages_from_liteparse, records_from_pages


def test_pages_from_liteparse_preserves_page_text() -> None:
    payload = {
        "pages": [
            {"page": 1, "blocks": [{"text": "Distance d'arrêt et vitesse."}]},
            {"page": 2, "text": "Gaz a effet de serre."},
        ]
    }

    pages = pages_from_liteparse(payload)

    assert [(page.page, page.text) for page in pages] == [
        (1, "Distance d'arrêt et vitesse."),
        (2, "Gaz a effet de serre."),
    ]


def test_records_from_pages_builds_stable_citation_metadata() -> None:
    pages = pages_from_liteparse({"pages": [{"page": 20, "text": "Limiter la vitesse reduit les risques."}]})
    metadata = SourceMetadata(
        id="guide-route",
        title="Guide De La Prevention Routiere",
        source_url="https://example.test/guide.pdf",
        tags=("vitesse", "securite routiere"),
        guide_domain="securite_routiere",
    )

    records = records_from_pages(
        pages,
        metadata,
        source_file="corpus/raw/guide.pdf",
        source_file_hash="abc123",
    )

    assert len(records) == 1
    assert records[0]["id"].startswith("guide-route:p20:c1:")
    assert records[0]["sourcePage"] == 20
    assert records[0]["citationUrl"] == "https://example.test/guide.pdf#page=20"
    assert records[0]["tags"] == ["vitesse", "securite routiere"]
