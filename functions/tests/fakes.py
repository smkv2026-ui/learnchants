"""In-memory fakes for Firestore, Firebase Auth and the clock.

Implements only the subset of the google-cloud-firestore API used by ``lc``.
"""

from __future__ import annotations

import copy
import itertools
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from google.api_core.exceptions import Conflict, NotFound
from google.cloud import firestore
from google.cloud.firestore_v1.transforms import ArrayRemove, ArrayUnion, Increment, Sentinel

_counter = itertools.count()


class FakeClock:
    def __init__(self, start: datetime | None = None):
        self.t = start or datetime(2026, 10, 19, 6, 0, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.t

    def advance(self, **kw: Any) -> None:
        self.t += timedelta(**kw)


def _apply(existing: dict, updates: dict, clock_now: datetime) -> dict:
    out = copy.deepcopy(existing)
    for key, value in updates.items():
        parts = key.split(".")
        target = out
        for p in parts[:-1]:
            target = target.setdefault(p, {})
        leaf = parts[-1]
        if isinstance(value, Sentinel):
            if value is firestore.DELETE_FIELD:
                target.pop(leaf, None)
            else:  # SERVER_TIMESTAMP
                target[leaf] = clock_now
        elif isinstance(value, Increment):
            target[leaf] = (target.get(leaf) or 0) + value.value
        elif isinstance(value, ArrayUnion):
            arr = list(target.get(leaf) or [])
            arr += [v for v in value.values if v not in arr]
            target[leaf] = arr
        elif isinstance(value, ArrayRemove):
            target[leaf] = [v for v in (target.get(leaf) or []) if v not in value.values]
        elif isinstance(value, dict) and not key.count("."):
            target[leaf] = _apply({}, value, clock_now)
        else:
            target[leaf] = copy.deepcopy(value)
    return out


def _get_field(data: dict, path: str) -> Any:
    cur: Any = data
    for p in path.split("."):
        if not isinstance(cur, dict) or p not in cur:
            return None
        cur = cur[p]
    return cur


class FakeSnapshot:
    def __init__(self, ref: "FakeDocRef", data: dict | None):
        self.reference = ref
        self.id = ref.id
        self._data = data
        self.exists = data is not None

    def to_dict(self) -> dict | None:
        return copy.deepcopy(self._data) if self._data is not None else None

    def get(self, field_path: str) -> Any:
        # Mirror google-cloud-firestore: missing fields raise KeyError.
        cur: Any = self._data or {}
        for p in field_path.split("."):
            if not isinstance(cur, dict) or p not in cur:
                raise KeyError(field_path)
            cur = cur[p]
        return copy.deepcopy(cur)


class FakeDocRef:
    def __init__(self, db: "FakeFirestore", path: str):
        self._db = db
        self.path = path
        self.id = path.rsplit("/", 1)[-1]

    @property
    def parent(self) -> "FakeCollection":
        return FakeCollection(self._db, self.path.rsplit("/", 1)[0])

    def collection(self, name: str) -> "FakeCollection":
        return FakeCollection(self._db, f"{self.path}/{name}")

    def get(self, *_, **__) -> FakeSnapshot:
        return FakeSnapshot(self, self._db.docs.get(self.path))

    def set(self, data: dict, merge: bool = False) -> None:
        base = self._db.docs.get(self.path, {}) if merge else {}
        self._db.docs[self.path] = _apply(base, data, self._db.clock())
        self._db.writes.append(("set", self.path))

    def create(self, data: dict) -> None:
        if self.path in self._db.docs:
            raise Conflict("exists")
        self.set(data)

    def update(self, data: dict) -> None:
        if self.path not in self._db.docs:
            raise NotFound(self.path)
        self._db.docs[self.path] = _apply(self._db.docs[self.path], data, self._db.clock())
        self._db.writes.append(("update", self.path))

    def delete(self) -> None:
        self._db.docs.pop(self.path, None)
        self._db.writes.append(("delete", self.path))


class FakeQuery:
    def __init__(self, db: "FakeFirestore", matcher, filters=None, orders=None, limit_n=None):
        self._db = db
        self._matcher = matcher  # fn(path) -> bool selecting candidate docs
        self._filters = filters or []
        self._orders = orders or []
        self._limit = limit_n

    def _clone(self, **kw: Any) -> "FakeQuery":
        return FakeQuery(
            self._db,
            self._matcher,
            kw.get("filters", list(self._filters)),
            kw.get("orders", list(self._orders)),
            kw.get("limit_n", self._limit),
        )

    def where(self, field_path=None, op_string=None, value=None, *, filter=None):  # noqa: A002
        if filter is not None:
            field_path, op_string, value = filter.field_path, filter.op_string, filter.value
        return self._clone(filters=self._filters + [(field_path, op_string, value)])

    def order_by(self, field_path: str, direction: str = "ASCENDING"):
        return self._clone(orders=self._orders + [(field_path, direction)])

    def limit(self, n: int):
        return self._clone(limit_n=n)

    def select(self, _fields):
        return self

    @staticmethod
    def _match(data: dict, f: tuple) -> bool:
        path, op, value = f
        v = _get_field(data, path)
        if op == "==":
            return v == value
        if op == "!=":
            return v is not None and v != value
        if op == "in":
            return v in value
        if op == "not-in":
            return v is not None and v not in value
        if op == "array_contains":
            return isinstance(v, list) and value in v
        if v is None:
            return False
        return {"<": v < value, "<=": v <= value, ">": v > value, ">=": v >= value}[op]

    def stream(self, *_, **__):
        rows = [
            (p, d)
            for p, d in sorted(self._db.docs.items())
            if self._matcher(p) and all(self._match(d, f) for f in self._filters)
        ]
        for path, direction in reversed(self._orders):
            rows.sort(
                key=lambda r: (_get_field(r[1], path) is None, _get_field(r[1], path)),
                reverse=direction == "DESCENDING",
            )
        if self._limit is not None:
            rows = rows[: self._limit]
        return iter([FakeSnapshot(FakeDocRef(self._db, p), d) for p, d in rows])

    def get(self, *_, **__):
        return list(self.stream())


class FakeCollection(FakeQuery):
    def __init__(self, db: "FakeFirestore", path: str):
        depth = path.count("/") + 1
        super().__init__(
            db, lambda p: p.startswith(path + "/") and p.count("/") == depth
        )
        self.path = path
        self.id = path.rsplit("/", 1)[-1]

    def document(self, doc_id: str | None = None) -> FakeDocRef:
        return FakeDocRef(self._db, f"{self.path}/{doc_id or secrets.token_hex(10)}")

    def add(self, data: dict):
        ref = self.document(f"auto{next(_counter):06d}{secrets.token_hex(4)}")
        ref.set(data)
        return (self._db.clock(), ref)

    def list_documents(self):
        return [FakeDocRef(self._db, p) for p, _ in self.stream_paths()]

    def stream_paths(self):
        return [(p, d) for p, d in sorted(self._db.docs.items()) if self._matcher(p)]


class FakeBatch:
    def __init__(self, db: "FakeFirestore"):
        self._ops: list = []

    def set(self, ref, data, merge=False):
        self._ops.append(lambda: ref.set(data, merge=merge))

    def update(self, ref, data):
        self._ops.append(lambda: ref.update(data))

    def delete(self, ref):
        self._ops.append(ref.delete)

    def commit(self):
        for op in self._ops:
            op()
        self._ops = []


class FakeFirestore:
    def __init__(self, clock: FakeClock | None = None):
        self.docs: dict[str, dict] = {}
        self.writes: list = []
        self.clock = clock or FakeClock()

    def collection(self, path: str) -> FakeCollection:
        return FakeCollection(self, path)

    def document(self, path: str) -> FakeDocRef:
        return FakeDocRef(self, path)

    def collection_group(self, name: str) -> FakeQuery:
        def matcher(p: str) -> bool:
            parts = p.split("/")
            return len(parts) >= 2 and parts[-2] == name

        return FakeQuery(self, matcher)

    def batch(self) -> FakeBatch:
        return FakeBatch(self)

    # convenience for tests
    def data(self, path: str) -> dict | None:
        return copy.deepcopy(self.docs.get(path))


@dataclass
class FakeUser:
    uid: str
    email: str | None = None
    display_name: str | None = None
    custom_claims: dict | None = None
    disabled: bool = False


class UserNotFound(Exception):
    pass


@dataclass
class FakeAuth:
    users: dict[str, FakeUser] = field(default_factory=dict)
    revoked: list[str] = field(default_factory=list)

    def add(self, uid: str, email: str | None = None, name: str | None = None, role: str | None = None) -> FakeUser:
        u = FakeUser(uid, email, name, {"role": role} if role else None)
        self.users[uid] = u
        return u

    def get_user(self, uid: str) -> FakeUser:
        if uid not in self.users:
            raise UserNotFound(uid)
        return self.users[uid]

    def get_user_by_email(self, email: str) -> FakeUser:
        for u in self.users.values():
            if (u.email or "").lower() == email.lower():
                return u
        raise UserNotFound(email)

    def set_custom_user_claims(self, uid: str, claims: dict | None) -> None:
        self.get_user(uid).custom_claims = claims

    def revoke_refresh_tokens(self, uid: str) -> None:
        self.revoked.append(uid)
