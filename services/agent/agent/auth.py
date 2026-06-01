from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Any

from langgraph_sdk import Auth

auth = Auth()


def _header_value(headers: Mapping[Any, Any], name: str) -> str | None:
    wanted = name.lower()
    for raw_key, raw_value in headers.items():
        key = raw_key.decode() if isinstance(raw_key, bytes) else str(raw_key)
        if key.lower() != wanted:
            continue
        value = raw_value.decode() if isinstance(raw_value, bytes) else str(raw_value)
        return value.strip()
    return None


def _extract_token(headers: Mapping[Any, Any]) -> str | None:
    authorization = _header_value(headers, "authorization")
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return _header_value(headers, "x-api-key")


def _configured_tokens() -> set[str]:
    return {
        token.strip()
        for token in (
            os.environ.get("LANGGRAPH_AUTH_TOKEN"),
            os.environ.get("LANGGRAPH_API_KEY"),
            os.environ.get("LANGSMITH_API_KEY"),
        )
        if token and token.strip()
    }


@auth.authenticate
async def authenticate(headers: dict[Any, Any]) -> Auth.types.MinimalUserDict:
    expected_tokens = _configured_tokens()
    if not expected_tokens:
        raise Auth.exceptions.HTTPException(status_code=503, detail="LangGraph authentication is not configured.")

    token = _extract_token(headers)
    if token not in expected_tokens:
        raise Auth.exceptions.HTTPException(status_code=401, detail="Invalid LangGraph authentication token.")

    return {"identity": "vercel-bff"}
