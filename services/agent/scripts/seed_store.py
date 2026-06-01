from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from langgraph_sdk import get_sync_client

NAMESPACE = ("axa_prevention", "documents")
CORPUS_PATH = Path(__file__).resolve().parents[1] / "corpus" / "axa_prevention.jsonl"


def main() -> None:
    deployment_url = os.environ.get("LANGGRAPH_API_URL") or os.environ.get("LANGGRAPH_DEPLOYMENT_URL")
    api_key = os.environ.get("LANGSMITH_API_KEY") or os.environ.get("LANGCHAIN_API_KEY")
    if not deployment_url:
        raise SystemExit("LANGGRAPH_API_URL or LANGGRAPH_DEPLOYMENT_URL is required.")
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
    count = 0
    for line in CORPUS_PATH.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        document = json.loads(line)
        key = str(document["id"])
        client.store.put_item(
            NAMESPACE,
            key,
            document,
            index=["title", "content", "tags", "sourceUrl"],
        )
        count += 1

    print(f"Seeded {count} AXA Prevention documents into namespace {NAMESPACE}.")


if __name__ == "__main__":
    main()
