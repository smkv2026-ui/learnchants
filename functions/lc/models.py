"""Pydantic request models for callable functions."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

_ID = r"^[A-Za-z0-9_-]{1,128}$"


class _Req(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


class InitProfileReq(_Req):
    displayName: str | None = Field(default=None, max_length=80)


class CreateInviteReq(_Req):
    email: str | None = Field(default=None, max_length=254)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str | None) -> str | None:
        if v in (None, ""):
            return None
        if "@" not in v or v.startswith("@") or v.endswith("@"):
            raise ValueError("invalid email")
        return v.lower()


class AcceptInviteReq(_Req):
    token: str = Field(min_length=20, max_length=200)


class DeactivateAdminReq(_Req):
    uid: str = Field(pattern=_ID)
    active: bool = False


class RemoveAdminReq(_Req):
    uid: str = Field(pattern=_ID)


class StorageLocationReq(_Req):
    scope: Literal["default", "playlist"] = "default"
    playlistId: str | None = Field(default=None, pattern=_ID)
    folderId: str | None = Field(default=None, max_length=200)
    folderName: str | None = Field(default=None, max_length=120)
    moveExisting: bool = False


class MoveStorageReq(_Req):
    playlistId: str = Field(pattern=_ID)


Purpose = Literal["verse_audio", "verse_video", "material", "submission", "reply", "payment_screenshot"]


class UploadSessionReq(_Req):
    purpose: Purpose
    playlistId: str = Field(pattern=_ID)
    verseId: str | None = Field(default=None, pattern=_ID)
    nodeId: str | None = Field(default=None, pattern=_ID)
    materialId: str | None = Field(default=None, pattern=_ID)
    submissionId: str | None = Field(default=None, pattern=_ID)
    mimeType: str = Field(min_length=3, max_length=100)
    size: int = Field(gt=0)
    fileName: str | None = Field(default=None, max_length=200)
    kind: Literal["audio", "video"] | None = None


class FinalizeUploadReq(_Req):
    mediaId: str = Field(pattern=_ID)
    durationSec: float | None = Field(default=None, ge=0, le=6 * 3600)


class MediaUrlReq(_Req):
    mediaId: str = Field(pattern=_ID)


class PaymentReq(_Req):
    playlistId: str = Field(pattern=_ID)
    reference: str = Field(min_length=6, max_length=40)
    screenshotMediaId: str | None = Field(default=None, pattern=_ID)


class ReviewPaymentReq(_Req):
    requestId: str = Field(pattern=_ID)
    decision: Literal["APPROVED", "REJECTED"]
    reason: str | None = Field(default=None, max_length=500)


class RevokeAccessReq(_Req):
    uid: str = Field(pattern=_ID)
    playlistId: str = Field(pattern=_ID)
    reason: str | None = Field(default=None, max_length=500)


class ReviewSubmissionReq(_Req):
    submissionId: str = Field(pattern=_ID)
    status: Literal["APPROVED", "NEEDS_WORK"]
    text: str | None = Field(default=None, max_length=5000)
    replyMediaId: str | None = Field(default=None, pattern=_ID)
