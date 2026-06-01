from __future__ import annotations

import hashlib
import re
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class SourceMetadata:
    id: str
    title: str
    source_url: str
    tags: tuple[str, ...] = ()
    audience: str = "mixte"
    category: str = "prevention"
    document_family: str = "guide"
    guide_domain: str = "securite_routiere"
    source_type: str = "public"


@dataclass(frozen=True)
class ParsedPage:
    page: int
    text: str
    layout: dict[str, Any]


def stable_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def source_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()[:16]


def slugify(value: str) -> str:
    normalized = value.lower()
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized)
    return normalized.strip("-") or "document"


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def chunk_text(text: str, *, max_chars: int = 1200, overlap: int = 160) -> list[str]:
    normalized = normalize_text(text)
    if not normalized:
        return []
    if len(normalized) <= max_chars:
        return [normalized]

    chunks: list[str] = []
    start = 0
    while start < len(normalized):
        end = min(start + max_chars, len(normalized))
        split_at = max(normalized.rfind(". ", start, end), normalized.rfind("; ", start, end))
        if split_at > start + max_chars // 2:
            end = split_at + 1
        chunks.append(normalized[start:end].strip())
        if end >= len(normalized):
            break
        start = max(end - overlap, 0)
    return [chunk for chunk in chunks if chunk]


def pages_from_liteparse(payload: Any) -> list[ParsedPage]:
    pages_payload = _find_pages(payload)
    if pages_payload:
        pages: list[ParsedPage] = []
        for index, page_payload in enumerate(pages_payload, start=1):
            text = normalize_text(_extract_text(page_payload))
            if not text:
                continue
            page_number = _extract_page_number(page_payload, index)
            layout = page_payload if isinstance(page_payload, dict) else {"value": page_payload}
            pages.append(ParsedPage(page=page_number, text=text, layout=layout))
        return pages

    text = normalize_text(_extract_text(payload))
    return [ParsedPage(page=1, text=text, layout={})] if text else []


def records_from_pages(
    pages: Iterable[ParsedPage],
    metadata: SourceMetadata,
    *,
    source_file: str,
    source_file_hash: str,
    max_chars: int = 1200,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    base_id = slugify(metadata.id or metadata.title)
    for page in pages:
        for chunk_index, chunk in enumerate(chunk_text(page.text, max_chars=max_chars), start=1):
            chunk_hash = stable_hash(f"{source_file_hash}:{page.page}:{chunk_index}:{chunk}")
            record_id = f"{base_id}:p{page.page}:c{chunk_index}:{chunk_hash}"
            citation_url = f"{metadata.source_url}#page={page.page}" if metadata.source_url else ""
            records.append(
                {
                    "id": record_id,
                    "title": metadata.title,
                    "content": chunk,
                    "sourceUrl": metadata.source_url,
                    "citationUrl": citation_url or metadata.source_url,
                    "sourcePage": page.page,
                    "page": page.page,
                    "tags": list(metadata.tags),
                    "audience": metadata.audience,
                    "category": metadata.category,
                    "documentFamily": metadata.document_family,
                    "guideDomain": metadata.guide_domain,
                    "sourceType": metadata.source_type,
                    "chunkIndex": chunk_index,
                    "sourceFile": source_file,
                    "sourceHash": source_file_hash,
                    "layout": _compact_layout(page.layout),
                }
            )
    return records


def records_from_curated_document(document: dict[str, Any]) -> dict[str, Any]:
    content = str(document.get("content", ""))
    page = document.get("sourcePage") or document.get("page")
    source_url = str(document.get("sourceUrl", ""))
    record_id = str(document.get("id") or stable_hash(f"{document.get('title', '')}:{page}:{content}"))
    return {
        **document,
        "id": record_id,
        "page": page,
        "sourcePage": page,
        "citationUrl": document.get("citationUrl")
        or (f"{source_url}#page={page}" if source_url and page else source_url),
        "chunkIndex": int(document.get("chunkIndex") or 1),
        "sourceFile": document.get("sourceFile") or "corpus/axa_prevention.jsonl",
        "sourceHash": document.get("sourceHash") or stable_hash(content),
    }


def _find_pages(payload: Any) -> list[Any]:
    if isinstance(payload, list):
        if payload and all(_looks_like_page(item) for item in payload):
            return payload
        return []
    if not isinstance(payload, dict):
        return []
    for key in ("pages", "pageResults", "page_results", "documents"):
        value = payload.get(key)
        if isinstance(value, list):
            return value
    return []


def _looks_like_page(value: Any) -> bool:
    return isinstance(value, dict) and any(
        key in value for key in ("page", "pageNumber", "page_number", "text", "content")
    )


def _extract_page_number(value: Any, default: int) -> int:
    if not isinstance(value, dict):
        return default
    for key in ("page", "pageNumber", "page_number", "pageIndex", "page_index"):
        page = value.get(key)
        if isinstance(page, int):
            return page + 1 if key in {"pageIndex", "page_index"} else page
        if isinstance(page, str) and page.isdigit():
            number = int(page)
            return number + 1 if key in {"pageIndex", "page_index"} else number
    return default


def _extract_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(_extract_text(item) for item in value)
    if not isinstance(value, dict):
        return ""

    direct_text = []
    for key in ("markdown", "text", "content", "plainText", "plain_text"):
        item = value.get(key)
        if isinstance(item, str):
            direct_text.append(item)
    if direct_text:
        return "\n".join(direct_text)

    nested_text = []
    for key in ("blocks", "items", "spans", "lines", "children"):
        item = value.get(key)
        if isinstance(item, list):
            nested_text.append(_extract_text(item))
    return "\n".join(nested_text)


def _compact_layout(layout: dict[str, Any]) -> dict[str, Any]:
    compact: dict[str, Any] = {}
    for key in ("bbox", "boundingBox", "width", "height", "rotation"):
        if key in layout:
            compact[key] = layout[key]
    return compact
