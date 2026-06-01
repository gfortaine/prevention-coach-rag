from __future__ import annotations

import argparse
import json
import os
import shutil
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Protocol, cast

try:  # mistralai 2.4.x docs still expose this path; keep a fallback for SDK drift.
    from mistralai.client import Mistral
except ImportError:  # pragma: no cover - exercised only on newer SDK layouts.
    from mistralai import Mistral  # type: ignore[no-redef]

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CORPUS = ROOT / "corpus" / "axa_prevention.jsonl"
DEFAULT_MANIFEST = ROOT / "corpus" / "mistral_documents.json"
SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".txt", ".md"}
DEFAULT_UPLOAD_DELAY_S = 1.0
DEFAULT_UPLOAD_RETRIES = 5
DEFAULT_UPLOAD_BACKOFF_S = 2.0
DEFAULT_DOWNLOAD_TIMEOUT_S = 30.0
BACKOFF_CAP_S = 60.0


class LibraryManager(Protocol):
    def create(self, **kwargs: Any) -> Any: ...

    def get(self, **kwargs: Any) -> Any: ...

    def list(self, **kwargs: Any) -> Any: ...


class AgentManager(Protocol):
    def create(self, **kwargs: Any) -> Any: ...

    def get(self, **kwargs: Any) -> Any: ...

    def list(self, **kwargs: Any) -> Any: ...


class DocumentManager(Protocol):
    def upload(self, **kwargs: Any) -> Any: ...

    def status(self, **kwargs: Any) -> Any: ...

    def list(self, **kwargs: Any) -> Any: ...


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create and populate the Mistral Document Library used by the AXA agent."
    )
    parser.add_argument("--library-id", default=os.environ.get("MISTRAL_LIBRARY_ID"))
    parser.add_argument("--library-name", default=os.environ.get("MISTRAL_LIBRARY_NAME", "AXA Prevention Coach"))
    parser.add_argument("--agent-id", default=os.environ.get("MISTRAL_AGENT_ID"))
    parser.add_argument("--agent-name", default=os.environ.get("MISTRAL_AGENT_NAME", "AXA Prevention Coach RAG"))
    parser.add_argument("--agent-model", default=os.environ.get("MISTRAL_AGENT_MODEL", "mistral-large-latest"))
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--document", action="append", default=[], help="Local path or HTTPS URL to upload.")
    parser.add_argument("--upload-corpus-documents", action="store_true")
    parser.add_argument("--skip-agent", action="store_true")
    parser.add_argument("--poll", action="store_true", help="Poll document processing status after upload.")
    parser.add_argument(
        "--doctor", action="store_true", help="Check Mistral Library/Agent configuration without uploading."
    )
    parser.add_argument(
        "--upload-delay-s", type=float, default=_env_float("MISTRAL_UPLOAD_DELAY_S", DEFAULT_UPLOAD_DELAY_S)
    )
    parser.add_argument(
        "--upload-retries", type=int, default=_env_int("MISTRAL_UPLOAD_RETRIES", DEFAULT_UPLOAD_RETRIES)
    )
    parser.add_argument(
        "--upload-backoff-s",
        type=float,
        default=_env_float("MISTRAL_UPLOAD_BACKOFF_S", DEFAULT_UPLOAD_BACKOFF_S),
    )
    parser.add_argument(
        "--download-timeout-s",
        type=float,
        default=_env_float("MISTRAL_DOWNLOAD_TIMEOUT_S", DEFAULT_DOWNLOAD_TIMEOUT_S),
    )
    args = parser.parse_args()

    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        raise SystemExit("MISTRAL_API_KEY is required.")

    client = Mistral(api_key=api_key)
    if args.doctor:
        raise SystemExit(run_doctor(client, args.library_id, args.agent_id, args.manifest))

    library_id = resolve_library(client, args.library_id, args.library_name)
    records = corpus_records(args.corpus) if args.upload_corpus_documents else []
    records.extend(document_records(args.document))
    existing_documents = existing_documents_by_name(client, library_id)

    manifest_documents: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="axa-mistral-docs-") as temp_dir:
        for record in dedupe_records(records):
            local_path = materialize_document(record["sourceUrl"], Path(temp_dir))
            existing = existing_documents.get(local_path.name)
            if existing is not None:
                document_id = str(getattr(existing, "id", "") or getattr(existing, "document_id", ""))
                print(f"skip existing {local_path.name}")
            else:
                uploaded = upload_document_with_retry(
                    client,
                    library_id,
                    local_path,
                    max_retries=max(args.upload_retries, 0),
                    initial_backoff_s=max(args.upload_backoff_s, 0.0),
                )
                document_id = str(getattr(uploaded, "id", "") or getattr(uploaded, "document_id", ""))
                existing_documents[local_path.name] = uploaded
                print(f"uploaded {local_path.name}")
            if args.poll and document_id:
                wait_for_document(client, library_id, document_id)
            manifest_documents.append(
                {
                    "document_id": document_id,
                    "file_name": local_path.name,
                    "title": record.get("title"),
                    "sourceUrl": record.get("sourceUrl"),
                    "citationUrl": record.get("citationUrl"),
                    "guideDomain": record.get("guideDomain"),
                    "audience": record.get("audience"),
                    "tags": record.get("tags", []),
                }
            )
            if args.upload_delay_s > 0:
                time.sleep(args.upload_delay_s)

    agent_id = args.agent_id
    if not args.skip_agent:
        agent_id = agent_id or resolve_agent(client, args.agent_name, args.agent_model, library_id)

    write_manifest(args.manifest, library_id, agent_id, manifest_documents)
    print(f"MISTRAL_LIBRARY_ID={library_id}")
    if agent_id:
        print(f"MISTRAL_AGENT_ID={agent_id}")
    print(f"MISTRAL_DOCUMENT_METADATA_PATH={args.manifest}")


def resolve_library(client: Mistral, library_id: str | None, name: str) -> str:
    libraries = cast(LibraryManager, client.beta.libraries)
    if library_id:
        libraries.get(library_id=library_id)
        return library_id
    existing = find_by_name(libraries, name)
    if existing:
        return str(existing.id)
    library = libraries.create(name=name)
    return str(library.id)


def resolve_agent(client: Mistral, name: str, model: str, library_id: str) -> str:
    agents = cast(AgentManager, client.beta.agents)
    existing = find_by_name(agents, name)
    if existing:
        agent_id = str(existing.id)
        agents.get(agent_id=agent_id)
        return agent_id
    agent = agents.create(
        model=model,
        name=name,
        instructions=(
            "Tu es l'Assistant Prevention AXA. Reponds en francais, cite les passages documentaires pertinents, "
            "et reste strictement fonde sur la bibliotheque documentaire fournie."
        ),
        tools=[{"type": "document_library", "library_ids": [library_id]}],
    )
    return str(agent.id)


def existing_documents_by_name(client: Mistral, library_id: str) -> dict[str, Any]:
    documents = cast(DocumentManager, client.beta.libraries.documents)
    by_name: dict[str, Any] = {}
    page = 0
    while True:
        response = documents.list(library_id=library_id, page=page, page_size=100)
        data = getattr(response, "data", response if isinstance(response, list) else [])
        for document in data:
            name = getattr(document, "name", None) or getattr(document, "file_name", None)
            if isinstance(name, str):
                by_name[name] = document
        if not isinstance(data, list) or len(data) < 100:
            return by_name
        page += 1


def upload_document_with_retry(
    client: Mistral,
    library_id: str,
    path: Path,
    *,
    max_retries: int,
    initial_backoff_s: float,
) -> Any:
    attempt = 0
    while True:
        try:
            return upload_document(client, library_id, path)
        except Exception as exc:
            status = status_code(exc)
            if status != 429 or attempt >= max_retries:
                raise
            wait_s = retry_after(exc) or min(initial_backoff_s * (2**attempt), BACKOFF_CAP_S)
            print(f"rate-limited on {path.name}; retrying in {wait_s:.1f}s ({attempt + 1}/{max_retries})")
            time.sleep(wait_s)
            attempt += 1


def upload_document(client: Mistral, library_id: str, path: Path) -> Any:
    with path.open("rb") as stream:
        documents = cast(DocumentManager, client.beta.libraries.documents)
        return documents.upload(
            library_id=library_id,
            file={"file_name": path.name, "content": stream},
        )


def wait_for_document(client: Mistral, library_id: str, document_id: str) -> None:
    for _ in range(60):
        documents = cast(DocumentManager, client.beta.libraries.documents)
        status = documents.status(library_id=library_id, document_id=document_id)
        state = str(getattr(status, "processing_status", "") or getattr(status, "status", "")).lower()
        if state in {"completed", "success", "succeeded", "failed", "error"}:
            if state in {"failed", "error"}:
                raise RuntimeError(f"Mistral document processing failed for {document_id}: {status}")
            return
        time.sleep(5)
    raise TimeoutError(f"Mistral document processing did not complete for {document_id}.")


def corpus_records(path: Path) -> list[dict[str, Any]]:
    records = []
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            if not line.strip():
                continue
            payload = json.loads(line)
            source_url = str(payload.get("sourceUrl") or "")
            if source_url and Path(source_url.split("?", 1)[0]).suffix.lower() in SUPPORTED_EXTENSIONS:
                records.append(payload)
    return records


def document_records(documents: list[str]) -> list[dict[str, Any]]:
    return [{"sourceUrl": document, "title": Path(document).name, "tags": ["manual-upload"]} for document in documents]


def dedupe_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    unique = []
    for record in records:
        source_url = record.get("sourceUrl")
        if not source_url or source_url in seen:
            continue
        seen.add(source_url)
        unique.append(record)
    return unique


def materialize_document(source: str, temp_dir: Path) -> Path:
    if source.startswith("http://") or source.startswith("https://"):
        file_name = Path(source.split("?", 1)[0]).name or "document.pdf"
        target = temp_dir / file_name
        download(source, target, timeout_s=_env_float("MISTRAL_DOWNLOAD_TIMEOUT_S", DEFAULT_DOWNLOAD_TIMEOUT_S))
        return target
    path = Path(source).expanduser()
    if not path.is_absolute():
        path = (ROOT / path).resolve()
    if not path.exists():
        raise FileNotFoundError(path)
    return path


def download(source: str, target: Path, *, timeout_s: float) -> None:
    request = urllib.request.Request(source, headers={"User-Agent": "axa-prevention-coach-mistral-admin/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout_s) as response, target.open("wb") as stream:
            shutil.copyfileobj(response, stream)
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Unable to download {source}: {exc}") from exc


def write_manifest(path: Path, library_id: str, agent_id: str | None, documents: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    existing: list[dict[str, Any]] = []
    if path.exists():
        with path.open(encoding="utf-8") as stream:
            payload = json.load(stream)
        if isinstance(payload, dict) and isinstance(payload.get("documents"), list):
            existing = payload["documents"]
    merged = {document.get("document_id") or document.get("sourceUrl"): document for document in existing}
    for document in documents:
        merged[document.get("document_id") or document.get("sourceUrl")] = document
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    with temp_path.open("w", encoding="utf-8") as stream:
        json.dump(
            {"library_id": library_id, "agent_id": agent_id, "documents": list(merged.values())},
            stream,
            ensure_ascii=True,
            indent=2,
        )
        stream.write("\n")
    os.replace(temp_path, path)


def find_by_name(manager: Any, name: str) -> Any | None:
    page = 0
    while True:
        response = manager.list(page=page, page_size=100)
        data = getattr(response, "data", response if isinstance(response, list) else [])
        for item in data:
            if getattr(item, "name", None) == name:
                return item
        if not isinstance(data, list) or len(data) < 100:
            return None
        page += 1


def run_doctor(client: Mistral, library_id: str | None, agent_id: str | None, manifest: Path) -> int:
    errors = []
    print("Mistral doctor")
    print("MISTRAL_API_KEY: set")
    if library_id:
        try:
            cast(LibraryManager, client.beta.libraries).get(library_id=library_id)
            print(f"MISTRAL_LIBRARY_ID: ok ({library_id})")
        except Exception as exc:
            errors.append(f"MISTRAL_LIBRARY_ID unreachable: {type(exc).__name__}")
    else:
        errors.append("MISTRAL_LIBRARY_ID is missing")
    if agent_id:
        try:
            cast(AgentManager, client.beta.agents).get(agent_id=agent_id)
            print(f"MISTRAL_AGENT_ID: ok ({agent_id})")
        except Exception as exc:
            errors.append(f"MISTRAL_AGENT_ID unreachable: {type(exc).__name__}")
    else:
        errors.append("MISTRAL_AGENT_ID is missing")
    if manifest.exists():
        try:
            payload = json.loads(manifest.read_text(encoding="utf-8"))
            documents = payload.get("documents", []) if isinstance(payload, dict) else []
            print(f"Manifest: ok ({manifest}, {len(documents)} document(s))")
        except Exception as exc:
            errors.append(f"Manifest is invalid JSON: {type(exc).__name__}")
    else:
        errors.append(f"Manifest missing: {manifest}")
    for error in errors:
        print(f"ERROR: {error}")
    return 1 if errors else 0


def status_code(exc: Exception) -> int | None:
    raw = getattr(exc, "raw_response", None)
    status = getattr(raw, "status_code", None)
    return status if isinstance(status, int) else None


def retry_after(exc: Exception) -> float | None:
    raw = getattr(exc, "raw_response", None)
    headers = getattr(raw, "headers", None)
    if headers is None:
        return None
    value = headers.get("retry-after") or headers.get("Retry-After")
    if not value:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return value if value >= 0 else default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value >= 0 else default


if __name__ == "__main__":
    main()
