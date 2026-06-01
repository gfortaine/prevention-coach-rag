from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from langgraph_sdk import get_sync_client

from agent.ingestion import (
    SourceMetadata,
    pages_from_liteparse,
    records_from_curated_document,
    records_from_pages,
    source_hash,
)

NAMESPACE = ("axa_prevention", "documents")
AGENT_ROOT = Path(__file__).resolve().parents[1]
CORPUS_DIR = AGENT_ROOT / "corpus"
CURATED_CORPUS_PATH = CORPUS_DIR / "axa_prevention.jsonl"
RAW_CORPUS_DIR = CORPUS_DIR / "raw"
SOURCE_MANIFEST_PATH = CORPUS_DIR / "sources.json"
INDEX_FIELDS = ["title", "content", "tags", "sourceUrl", "documentFamily", "guideDomain"]


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed AXA Prevention documents into the LangGraph semantic store.")
    parser.add_argument(
        "--jsonl", type=Path, default=CURATED_CORPUS_PATH, help="Curated JSONL corpus used as seed input."
    )
    parser.add_argument(
        "--raw-dir", type=Path, default=RAW_CORPUS_DIR, help="Directory containing raw files to parse with LiteParse."
    )
    parser.add_argument(
        "--manifest", type=Path, default=SOURCE_MANIFEST_PATH, help="Optional source metadata manifest."
    )
    parser.add_argument("--skip-jsonl", action="store_true", help="Do not seed curated JSONL records.")
    parser.add_argument("--skip-raw", action="store_true", help="Do not parse raw files with LiteParse.")
    parser.add_argument("--chunk-size", type=int, default=1200, help="Maximum characters per indexed chunk.")
    return parser.parse_args()


def _load_manifest(path: Path) -> dict[str, SourceMetadata]:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError(f"{path} must contain a JSON array of source metadata records.")
    manifest: dict[str, SourceMetadata] = {}
    for item in payload:
        if not isinstance(item, dict):
            continue
        filename = str(item.get("fileName") or item.get("filename") or item.get("id") or "")
        if not filename:
            continue
        metadata = SourceMetadata(
            id=str(item.get("id") or Path(filename).stem),
            title=str(item.get("title") or Path(filename).stem.replace("-", " ").replace("_", " ").title()),
            source_url=str(item.get("sourceUrl") or item.get("source_url") or ""),
            tags=tuple(str(tag) for tag in item.get("tags", [])),
            audience=str(item.get("audience") or "mixte"),
            category=str(item.get("category") or "prevention"),
            document_family=str(item.get("documentFamily") or item.get("document_family") or "guide"),
            guide_domain=str(item.get("guideDomain") or item.get("guide_domain") or "securite_routiere"),
            source_type=str(item.get("sourceType") or item.get("source_type") or "public"),
        )
        manifest[filename] = metadata
        manifest[Path(filename).name] = metadata
        manifest[Path(filename).stem] = metadata
    return manifest


def _metadata_for_file(path: Path, manifest: dict[str, SourceMetadata]) -> SourceMetadata:
    metadata = manifest.get(path.name) or manifest.get(path.stem)
    if metadata:
        return metadata
    return SourceMetadata(id=path.stem, title=path.stem.replace("-", " ").replace("_", " ").title(), source_url="")


def _run_liteparse(path: Path) -> Any:
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as output:
        output_path = Path(output.name)
    try:
        subprocess.run(
            ["lit", "parse", str(path), "--format", "json", "--output", str(output_path), "--quiet"],
            check=True,
            text=True,
            capture_output=True,
        )
        return json.loads(output_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError(
            "LiteParse CLI `lit` was not found. Install dependencies with `uv sync` and run via `uv run python scripts/seed_store.py`."
        ) from exc
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() or exc.stdout.strip() or f"exit code {exc.returncode}"
        raise RuntimeError(f"LiteParse failed for {path}: {detail}") from exc
    finally:
        output_path.unlink(missing_ok=True)


def _iter_raw_documents(raw_dir: Path, manifest: dict[str, SourceMetadata], chunk_size: int) -> list[dict[str, Any]]:
    if not raw_dir.exists():
        return []
    records: list[dict[str, Any]] = []
    allowed_suffixes = {".pdf", ".docx", ".xlsx", ".pptx", ".png", ".jpg", ".jpeg"}
    for path in sorted(
        item for item in raw_dir.rglob("*") if item.is_file() and item.suffix.lower() in allowed_suffixes
    ):
        metadata = _metadata_for_file(path, manifest)
        payload = _run_liteparse(path)
        pages = pages_from_liteparse(payload)
        records.extend(
            records_from_pages(
                pages,
                metadata,
                source_file=str(path.relative_to(AGENT_ROOT)),
                source_file_hash=source_hash(path),
                max_chars=chunk_size,
            )
        )
    return records


def _iter_curated_documents(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        records.append(records_from_curated_document(json.loads(line)))
    return records


def main() -> None:
    args = _parse_args()
    deployment_url = os.environ.get("LANGGRAPH_API_URL") or os.environ.get("LANGGRAPH_DEPLOYMENT_URL")
    if not deployment_url:
        deployment_url = "http://127.0.0.1:2024"
    api_key = os.environ.get("LANGSMITH_API_KEY") or os.environ.get("LANGCHAIN_API_KEY")
    is_local = deployment_url.startswith("http://127.0.0.1") or deployment_url.startswith("http://localhost")
    if not api_key and not is_local:
        raise SystemExit("LANGSMITH_API_KEY or LANGCHAIN_API_KEY is required.")

    headers: dict[str, str] = {}
    tenant_id = os.environ.get("LANGSMITH_TENANT_ID")
    if tenant_id:
        headers["X-Tenant-Id"] = tenant_id

    client_kwargs: dict[str, Any] = {"url": deployment_url}
    if api_key:
        client_kwargs["api_key"] = api_key
    if headers:
        client_kwargs["headers"] = headers
    client = get_sync_client(**client_kwargs)
    manifest = _load_manifest(args.manifest)
    records: list[dict[str, Any]] = []
    if not args.skip_jsonl:
        records.extend(_iter_curated_documents(args.jsonl))
    if not args.skip_raw:
        records.extend(_iter_raw_documents(args.raw_dir, manifest, args.chunk_size))
    if not records:
        raise SystemExit("No documents found to seed. Provide JSONL records or raw files in corpus/raw.")

    for document in records:
        key = str(document["id"])
        client.store.put_item(
            NAMESPACE,
            key,
            document,
            index=INDEX_FIELDS,
        )

    print(f"Seeded {len(records)} AXA Prevention chunks into namespace {NAMESPACE} at {deployment_url}.")


if __name__ == "__main__":
    main()
