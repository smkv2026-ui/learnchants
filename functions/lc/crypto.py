"""Small crypto helpers: AES-256-GCM for refresh tokens, HMAC-signed tokens."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64d(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _aes_key(secret: str) -> bytes:
    """Accept a base64 32-byte key, or derive one from an arbitrary secret."""
    try:
        raw = base64.b64decode(secret, validate=True)
        if len(raw) == 32:
            return raw
    except Exception:  # noqa: BLE001 - fall through to derivation
        pass
    if not secret:
        raise ValueError("TOKEN_ENCRYPTION_KEY is not configured")
    return hashlib.sha256(secret.encode("utf-8")).digest()


def encrypt(plaintext: str, secret: str) -> str:
    nonce = os.urandom(12)
    ct = AESGCM(_aes_key(secret)).encrypt(nonce, plaintext.encode("utf-8"), b"learnchants")
    return "v1." + _b64e(nonce + ct)


def decrypt(token: str, secret: str) -> str:
    if not token.startswith("v1."):
        raise ValueError("unknown ciphertext version")
    blob = _b64d(token[3:])
    return AESGCM(_aes_key(secret)).decrypt(blob[:12], blob[12:], b"learnchants").decode("utf-8")


class InvalidToken(Exception):
    pass


def sign(payload: dict[str, Any], secret: str) -> str:
    if not secret:
        raise ValueError("signing secret is not configured")
    body = _b64e(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    sig = _b64e(hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify(token: str, secret: str, now: float | None = None) -> dict[str, Any]:
    try:
        body, sig = token.split(".", 1)
    except ValueError as exc:
        raise InvalidToken("malformed") from exc
    expected = _b64e(hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(expected, sig):
        raise InvalidToken("bad signature")
    try:
        payload = json.loads(_b64d(body))
    except Exception as exc:  # noqa: BLE001
        raise InvalidToken("bad payload") from exc
    if float(payload.get("exp", 0)) < (now if now is not None else time.time()):
        raise InvalidToken("expired")
    return payload


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
