import time

import pytest

from drive.backoff import with_backoff
from drive.base import DriveQuotaError, safe_name
from drive.mock import LocalMockProvider
from lc import crypto


def test_encrypt_roundtrip_and_tamper():
    ct = crypto.encrypt("refresh-token-123", "k")
    assert "refresh-token-123" not in ct
    assert crypto.decrypt(ct, "k") == "refresh-token-123"
    with pytest.raises(Exception):
        crypto.decrypt(ct, "other-key")


def test_sign_verify_expiry_and_tamper():
    tok = crypto.sign({"m": "abc", "exp": time.time() + 60}, "s")
    assert crypto.verify(tok, "s")["m"] == "abc"
    with pytest.raises(crypto.InvalidToken):
        crypto.verify(tok, "wrong")
    body, sig = tok.split(".")
    with pytest.raises(crypto.InvalidToken):
        crypto.verify(body + "x." + sig, "s")
    old = crypto.sign({"m": "abc", "exp": time.time() - 1}, "s")
    with pytest.raises(crypto.InvalidToken):
        crypto.verify(old, "s")


def test_safe_name():
    assert safe_name("Anuvakam 1/2: ok?") == "Anuvakam 1 2 ok"
    assert safe_name("   ") == "Untitled"
    assert safe_name("श्री रुद्रम्") == "श्री रुद्रम्"


def test_backoff_retries_then_succeeds():
    calls, sleeps = [], []

    def fn():
        calls.append(1)
        if len(calls) < 3:
            raise DriveQuotaError("slow down")
        return "ok"

    assert with_backoff(fn, sleep=sleeps.append) == "ok"
    assert len(sleeps) == 2 and sleeps[1] >= sleeps[0] * 1.0


def test_backoff_gives_up():
    def fn():
        raise DriveQuotaError("nope")

    with pytest.raises(DriveQuotaError):
        with_backoff(fn, retries=2, sleep=lambda _s: None)


def test_mock_provider_folders_are_idempotent_and_stable(tmp_path):
    p = LocalMockProvider(tmp_path)
    root = p.create_folder("LearnChants", None)
    a = p.ensure_folder(root.id, "Sri Rudram")
    b = p.ensure_folder(root.id, "Sri Rudram")
    assert a.id == b.id
    child = p.ensure_folder(a.id, "Namakam")
    p.rename(a.id, "Rudram")
    assert (tmp_path / "LearnChants" / "Rudram" / "Namakam").is_dir()
    assert p.get_folder(child.id).name == "Namakam"
    # cached id gets renamed when the logical name changed
    p.ensure_folder(a.id, "Namakam Part", cached_id=child.id)
    assert (tmp_path / "LearnChants" / "Rudram" / "Namakam Part").is_dir()
    other = p.create_folder("Other", None)
    p.move(a.id, other.id)
    assert (tmp_path / "Other" / "Rudram" / "Namakam Part").is_dir()
    assert p.find_child_folder(None, "Other").id == other.id


def test_mock_provider_resumable_upload_and_range(tmp_path):
    p = LocalMockProvider(tmp_path)
    root = p.create_folder("R", None)
    s = p.create_upload_session(parent_id=root.id, name="audio.webm", mime_type="audio/webm", size=10, app_properties={"mediaId": "m1"}, origin="x")
    assert p.write_chunk(s.session, 0, b"01234", 10) is None
    with pytest.raises(Exception):
        p.write_chunk(s.session, 2, b"zz", 10)  # wrong offset
    info = p.write_chunk(s.session, 5, b"56789", 10)
    assert info and info.size == 10
    found = p.find_by_app_property(root.id, "mediaId", "m1")
    assert found and found.id == info.id
    assert b"".join(p.open_range(info.id, 2, 5)) == b"2345"
    assert b"".join(p.open_range(info.id, 8, None)) == b"89"
    p.delete(info.id)
    assert p.find_by_app_property(root.id, "mediaId", "m1") is None
