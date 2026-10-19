from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from drive.mock import LocalMockProvider  # noqa: E402
from lc import uploads  # noqa: E402
from lc.config import Config  # noqa: E402
from lc.core import ROLE_ADMIN, ROLE_SUPER_ADMIN, ROLE_USER, Caller, Deps  # noqa: E402

from .fakes import FakeAuth, FakeClock, FakeFirestore  # noqa: E402

SUPER = Caller("super1", ROLE_SUPER_ADMIN, "guru@example.com", "Guru Ji")
ADMIN = Caller("admin2", ROLE_ADMIN, "teacher@example.com", "Teacher Two")
LEARNER = Caller("learner1", ROLE_USER, "learner@example.com", "Asha")
LEARNER2 = Caller("learner2", ROLE_USER, "ravi@example.com", "Ravi")


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def deps(tmp_path: Path, clock: FakeClock) -> Deps:
    db = FakeFirestore(clock)
    auth = FakeAuth()
    auth.add(SUPER.uid, SUPER.email, SUPER.name, ROLE_SUPER_ADMIN)
    auth.add(ADMIN.uid, ADMIN.email, ADMIN.name, ROLE_ADMIN)
    auth.add(LEARNER.uid, LEARNER.email, LEARNER.name)
    auth.add(LEARNER2.uid, LEARNER2.email, LEARNER2.name)
    config = Config(
        app_url="https://learnchants.web.app",
        mock_drive=True,
        mock_drive_root=tmp_path / "drive",
        token_encryption_key="test-encryption-key",
        media_token_secret="test-media-secret",
        google_client_id="cid",
        google_client_secret="csecret",
    )
    provider = LocalMockProvider(config.mock_drive_root)
    d = Deps(db=db, auth=auth, config=config, storage_factory=lambda _d, _uid: provider, clock=clock)
    for c in (SUPER, ADMIN):
        db.collection("adminUsers").document(c.uid).set(
            {"email": c.email, "displayName": c.name, "role": c.role, "status": "active"}
        )
    for c in (LEARNER, LEARNER2):
        db.collection("users").document(c.uid).set({"displayName": c.name, "email": c.email})
    return d


def seed_playlist(deps: Deps, pid: str = "rudram", *, access: str = "free", published: bool = True, owner: str = SUPER.uid, price: int | None = None) -> dict:
    """Sri Rudram > Namakam > Anuvakam 1..11 with two verses in Anuvakam 1."""
    db = deps.db
    p = db.collection("playlists").document(pid)
    p.set({"title": "Sri Rudram", "description": "Hymn to Rudra", "access": access, "published": published, "order": 1, "verseCount": 0, "price": price})
    db.collection("adminPlaylists").document(pid).set({"ownerUid": owner, "createdBy": owner})
    p.collection("nodes").document("namakam").set({"parentId": None, "name": "Namakam", "order": 1})
    p.collection("nodes").document("chamakam").set({"parentId": None, "name": "Chamakam", "order": 2})
    for i in range(1, 12):
        p.collection("nodes").document(f"anu{i}").set({"parentId": "namakam", "name": f"Anuvakam {i}", "order": i})
    p.collection("verses").document("v1").set({"nodeId": "anu1", "name": "Verse 1", "details": "Namaste Rudra", "order": 1})
    p.collection("verses").document("v2").set({"nodeId": "anu1", "name": "Verse 2", "details": "...", "order": 2})
    p.collection("verses").document("v3").set({"nodeId": "anu2", "name": "Verse 1", "details": "...", "order": 1})
    from lc.triggers import recount

    recount(deps, pid)
    return {"pid": pid}


def upload(deps: Deps, caller: Caller, payload: dict, content: bytes = b"x" * 1000, chunk: int | None = None, duration: float | None = 3.0) -> dict:
    """Run create_upload_session -> mock PUT(s) -> finalize_upload."""
    res = uploads.create_upload_session(deps, caller, {"size": len(content), **payload})
    assert res["uploadUrl"].startswith("/mock-upload/")
    sid = res["uploadUrl"].rsplit("/", 1)[-1]
    step = chunk or len(content)
    for start in range(0, len(content), step):
        part = content[start : start + step]
        end = start + len(part) - 1
        status, headers, _ = uploads.mock_upload(deps, sid, f"bytes {start}-{end}/{len(content)}", part)
        assert status == (200 if end == len(content) - 1 else 308), (status, headers)
    return {**res, **uploads.finalize_upload(deps, caller, {"mediaId": res["mediaId"], "durationSec": duration})}
