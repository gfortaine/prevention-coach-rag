from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Protocol, TypedDict, cast

try:  # mistralai 2.4.x docs still expose this path; keep a fallback for SDK drift.
    from mistralai.client import Mistral
except ImportError:  # pragma: no cover - exercised only on newer SDK layouts.
    from mistralai import Mistral  # type: ignore[no-redef]

from .constants import GUIDE_DOMAINS


class MistralDocumentLibraryError(RuntimeError):
    pass


class MistralDocumentLibraryResult(TypedDict):
    answer: str
    sources: list[dict[str, Any]]
    citations: list[dict[str, Any]]
    usage: dict[str, Any]


class _ConversationStarter(Protocol):
    def start(self, **kwargs: Any) -> Any: ...


def is_mistral_document_library_configured() -> bool:
    return bool(os.environ.get("MISTRAL_API_KEY") and os.environ.get("MISTRAL_AGENT_ID"))


def query_mistral_document_library(message: str, chat_history: Any = None) -> MistralDocumentLibraryResult:
    api_key = os.environ.get("MISTRAL_API_KEY")
    agent_id = os.environ.get("MISTRAL_AGENT_ID")
    if not api_key or not agent_id:
        raise MistralDocumentLibraryError(
            "MISTRAL_API_KEY and MISTRAL_AGENT_ID are required for Mistral Document Library RAG."
        )

    try:
        client = Mistral(api_key=api_key)
        conversations = cast(_ConversationStarter, client.beta.conversations)
        response = conversations.start(
            agent_id=agent_id,
            inputs=_build_inputs(message, chat_history),
            store=False,
        )
        return parse_mistral_document_response(response, _load_document_metadata())
    except Exception as exc:
        raise MistralDocumentLibraryError(f"Mistral Document Library request failed ({type(exc).__name__}).") from exc


def parse_mistral_document_response(
    response: Any, document_metadata: dict[str, dict[str, Any]] | None = None
) -> MistralDocumentLibraryResult:
    metadata = document_metadata or {}
    answer_parts: list[str] = []
    references: list[dict[str, Any]] = []

    for output in _iterable(_value(response, "outputs", [])):
        if _value(output, "type") != "message.output":
            continue
        content = _value(output, "content", "")
        if isinstance(content, str):
            answer_parts.append(content)
            continue
        for chunk in _iterable(content):
            chunk_type = _value(chunk, "type")
            text = _value(chunk, "text")
            if chunk_type in {"tool_reference", "reference"}:
                reference = _reference_from_chunk(chunk)
                references.append(reference)
                answer_parts.append(f"[{len(references)}]")
            elif isinstance(text, str):
                answer_parts.append(text)

    answer = _normalize_answer("".join(answer_parts).strip(), len(references))
    sources = [_source_from_reference(reference, metadata, index) for index, reference in enumerate(references)]
    citations = [_citation_from_source(source, index) for index, source in enumerate(sources)]
    return {
        "answer": answer,
        "sources": sources,
        "citations": citations,
        "usage": _usage_dict(_value(response, "usage", {})),
    }


def _build_inputs(message: str, chat_history: Any) -> str:
    history = _history_context(chat_history)
    if not history:
        return message
    return "\n\n".join(
        [
            "Historique recent (contexte conversationnel, pas une source documentaire):",
            history,
            f"Question utilisateur: {message}",
        ]
    )


def _history_context(chat_history: Any) -> str:
    if not isinstance(chat_history, list):
        return ""
    lines = []
    for item in chat_history[-6:]:
        if not isinstance(item, dict):
            continue
        role = "Assistant" if item.get("role") == "assistant" else "Utilisateur"
        content = str(item.get("content") or "").strip()
        if content:
            lines.append(f"{role}: {content[:800]}")
    return "\n".join(lines)


def _load_document_metadata() -> dict[str, dict[str, Any]]:
    path = os.environ.get("MISTRAL_DOCUMENT_METADATA_PATH")
    if not path:
        default_path = Path(__file__).resolve().parents[1] / "corpus" / "mistral_documents.json"
        path = str(default_path)
    metadata_path = Path(path)
    if not metadata_path.exists():
        return {}
    with metadata_path.open(encoding="utf-8") as stream:
        payload = json.load(stream)
    documents = payload.get("documents", payload) if isinstance(payload, dict) else payload
    if not isinstance(documents, list):
        return {}
    metadata: dict[str, dict[str, Any]] = {}
    for document in documents:
        if not isinstance(document, dict):
            continue
        for key in _metadata_keys(document):
            metadata[key] = document
    return metadata


def _metadata_keys(document: dict[str, Any]) -> list[str]:
    keys = []
    for field in ("document_id", "id", "mistralDocumentId", "file_name", "sourceUrl", "citationUrl", "title"):
        value = document.get(field)
        if isinstance(value, str) and value.strip():
            keys.extend([value.strip(), _normalized_key(value)])
    return list(dict.fromkeys(keys))


def _source_from_reference(
    reference: dict[str, Any], document_metadata: dict[str, dict[str, Any]], index: int
) -> dict[str, Any]:
    document_id = str(reference.get("document_id") or f"mistral-document-{index + 1}")
    metadata = _metadata_for_reference(reference, document_metadata)
    inferred = _infer_document_metadata(reference, metadata)
    page = _integer(reference.get("page")) or _integer(metadata.get("sourcePage"))
    source_url = str(metadata.get("sourceUrl") or inferred.get("sourceUrl") or "#")
    citation_url = _internal_guide_url(str(inferred.get("guideDomain") or ""), page) or str(
        metadata.get("citationUrl") or source_url
    )

    return {
        "id": document_id,
        "title": str(metadata.get("title") or inferred.get("title") or "Document Mistral"),
        "content": str(reference.get("snippet") or ""),
        "excerpt": str(reference.get("snippet") or ""),
        "score": 1.0,
        "sourceUrl": source_url,
        "citationUrl": citation_url,
        "sourcePage": page,
        "guideDomain": inferred.get("guideDomain"),
        "sourceType": "public",
        "audience": str(metadata.get("audience") or "mixte"),
        "tags": metadata.get("tags") if isinstance(metadata.get("tags"), list) else ["mistral-document-library"],
        "mistralDocumentId": document_id,
    }


def _citation_from_source(source: dict[str, Any], index: int) -> dict[str, Any]:
    page = source.get("sourcePage")
    page_suffix = f", page {page}" if page else ""
    return {
        "id": f"{source['id']}-{index + 1}",
        "label": f"[{index + 1}]",
        "title": f"{source.get('title', 'Document Mistral')}{page_suffix}",
        "sourceUrl": source.get("citationUrl") or source.get("sourceUrl") or "#",
        "page": page,
        "guideDomain": source.get("guideDomain"),
        "sourceId": source["id"],
    }


def _reference_from_chunk(chunk: Any) -> dict[str, Any]:
    url = _value(chunk, "url") or _value(chunk, "source_url") or _value(chunk, "sourceUrl")
    title = _value(chunk, "title") or _value(chunk, "document_name") or _value(chunk, "documentName")
    description = _value(chunk, "description") or _value(chunk, "snippet") or _value(chunk, "text") or ""
    page = _integer(_value(chunk, "page")) or _page_from_text(str(url or "")) or _page_from_text(str(description or ""))
    return {
        "document_id": _value(chunk, "document_id") or _value(chunk, "documentId") or url or title,
        "page": page,
        "snippet": description,
        "title": title,
        "sourceUrl": url,
        "reference_ids": _value(chunk, "reference_ids") or _value(chunk, "referenceIds"),
    }


def _metadata_for_reference(reference: dict[str, Any], document_metadata: dict[str, dict[str, Any]]) -> dict[str, Any]:
    for value in (
        reference.get("document_id"),
        reference.get("sourceUrl"),
        reference.get("title"),
    ):
        if not isinstance(value, str) or not value.strip():
            continue
        metadata = document_metadata.get(value.strip()) or document_metadata.get(_normalized_key(value))
        if metadata:
            return metadata
    return {}


def _infer_document_metadata(reference: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
    raw = " ".join(
        str(value)
        for value in [
            reference.get("title"),
            reference.get("snippet"),
            metadata.get("title"),
            metadata.get("file_name"),
            metadata.get("sourceUrl"),
            reference.get("sourceUrl"),
        ]
        if value
    ).lower()
    if metadata.get("guideDomain") in GUIDE_DOMAINS:
        guide_domain = str(metadata["guideDomain"])
    elif "climat" in raw or "environnement" in raw or "carbone" in raw:
        guide_domain = "climat"
    elif "mini" in raw or "naturel" in raw or "tempete" in raw or "inondation" in raw:
        guide_domain = "miniguide"
    elif "route" in raw or "routiere" in raw or "vitesse" in raw or "livret" in raw:
        guide_domain = "securite_routiere"
    else:
        guide_domain = ""

    titles = {
        "securite_routiere": "Guide De La Prevention Routiere",
        "climat": "Guide Climat et Environnement",
        "miniguide": "Bien se proteger face aux evenements naturels",
    }
    return {
        "guideDomain": guide_domain or None,
        "title": titles.get(guide_domain),
        "sourceUrl": metadata.get("sourceUrl"),
    }


def _internal_guide_url(guide_domain: str, page: int | None) -> str:
    if guide_domain not in GUIDE_DOMAINS:
        return ""
    return f"/guide/{guide_domain}?page={page}" if page else f"/guide/{guide_domain}"


def _normalize_answer(answer: str, reference_count: int) -> str:
    return re.sub(
        r"\n+(?:#{1,6}\s*)?(?:sources(?:\s+principales)?|references|références)\s*:?\s*[\s\S]*$",
        "",
        answer,
        flags=re.IGNORECASE,
    ).strip()


def _usage_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return {key: item for key, item in value.items() if _is_jsonish(item)}
    usage: dict[str, Any] = {}
    mappings = {
        "total_tokens": "total_tokens",
        "input_tokens": "prompt_tokens",
        "output_tokens": "completion_tokens",
        "connector_tokens": "connector_tokens",
    }
    for target, source in mappings.items():
        item = getattr(value, source, None)
        if item is not None and _is_jsonish(item):
            usage[target] = item
    return usage


def _value(value: Any, key: str, default: Any = None) -> Any:
    if isinstance(value, dict):
        return value.get(key, default)
    return getattr(value, key, default)


def _iterable(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _integer(value: Any) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def _page_from_text(value: str) -> int | None:
    match = re.search(r"(?:[#?&]page=|page[\s:=_-]+)(\d{1,4})", value, flags=re.IGNORECASE)
    return int(match.group(1)) if match else None


def _normalized_key(value: str) -> str:
    return value.strip().lower()


def _is_jsonish(value: Any) -> bool:
    return isinstance(value, str | int | float | bool | list | dict) or value is None
