#!/usr/bin/env python3
"""Seed demo content: Sri Rudram > Namakam / Chamakam (11 anuvakams each) with
sample verses, a paid demo playlist, and a demo learner.

Usage (emulators running, Super Admin bootstrapped):
  python scripts/seed_demo.py --emulators
Options:
  --owner-email  admin who owns the demo playlists (default: first Super Admin)
  --no-media     skip generating sample audio
"""

from __future__ import annotations

import io
import math
import struct
import sys
import wave

from _common import get_or_create_user, init, now, parse_args

LEARNER_EMAIL = "learner@demo.test"
LEARNER_PASSWORD = "learner123"

NAMAKAM_A1 = [
    ("Verse 1 · Dhyānam", "ॐ नमो भगवते रुद्राय ॥",
     "<p lang=\"sa\">ॐ नमो भगवते रुद्राय ॥</p><p>Om, salutations to the Lord Rudra.</p>"),
    ("Verse 2", "नमस्ते रुद्र मन्यव उतो त इषवे नमः ।",
     "<p lang=\"sa\">नमस्ते रुद्र मन्यव उतो त इषवे नमः । नमस्ते अस्तु धन्वने बाहुभ्यामुत ते नमः ॥</p>"
     "<p>Salutations to your anger, O Rudra, and to your arrow. Salutations to your bow and to your two arms.</p>"),
    ("Verse 3", "या त इषुः शिवतमा",
     "<p lang=\"sa\">या त इषुः शिवतमा शिवं बभूव ते धनुः । शिवा शरव्या या तव तया नो रुद्र मृडय ॥</p>"
     "<p>Your arrow, your bow and your quiver have become most auspicious; with them, O Rudra, make us happy.</p>"),
    ("Verse 4", "या ते रुद्र शिवा तनूः",
     "<p lang=\"sa\">या ते रुद्र शिवा तनूरघोराऽपापकाशिनी । तया नस्तनुवा शन्तमया गिरिशन्ताभि चाकशीहि ॥</p>"
     "<p>O Rudra, with your auspicious, non-terrifying form that reveals no evil, look upon us with your most blissful form.</p>"),
]


def tone_wav(seconds: float = 4.0, base: float = 136.1, rate: int = 22050) -> bytes:
    """A gentle 'Om'-like drone (136.1 Hz + harmonics) with fade in/out."""
    frames = int(seconds * rate)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        out = bytearray()
        for i in range(frames):
            t = i / rate
            env = min(1.0, t / 0.4, (seconds - t) / 0.6)
            s = (
                0.55 * math.sin(2 * math.pi * base * t)
                + 0.25 * math.sin(2 * math.pi * base * 2 * t)
                + 0.12 * math.sin(2 * math.pi * base * 3 * t) * (0.6 + 0.4 * math.sin(2 * math.pi * 0.5 * t))
            )
            out += struct.pack("<h", int(max(-1, min(1, s * env * 0.6)) * 32767))
        w.writeframes(bytes(out))
    return buf.getvalue()


CHUNK = 700_000


def store_audio(db, owner_uid: str, pid: str, vid: str, seconds: float) -> None:
    """Write a WAV into media/{id}/chunks (the app's built-in Firestore storage)."""
    data = tone_wav(seconds)
    ref = db.collection("media").document()
    chunks = [data[i : i + CHUNK] for i in range(0, len(data), CHUNK)]
    ref.set(
        {
            "purpose": "verse_audio", "pid": pid, "vid": vid, "kind": "audio", "mimeType": "audio/wav",
            "uploaderUid": owner_uid, "learnerUid": None, "fileName": None, "store": "firestore",
            "size": len(data), "chunkCount": len(chunks), "status": "ready", "durationSec": seconds, "createdAt": now(),
        }
    )
    for n, part in enumerate(chunks):
        ref.collection("chunks").document(str(n)).set({"data": part})
    db.collection("playlists").document(pid).collection("verses").document(vid).update(
        {"audioMediaId": ref.id, "hasAudio": True, "audioMime": "audio/wav"}
    )


def recount(db, pid: str) -> None:
    p = db.collection("playlists").document(pid)
    nodes = {s.id: s.to_dict() for s in p.collection("nodes").stream()}
    counts = {nid: 0 for nid in nodes}
    verses = list(p.collection("verses").stream())
    for v in verses:
        nid, seen = v.to_dict().get("nodeId"), set()
        while nid and nid in nodes and nid not in seen:
            seen.add(nid)
            counts[nid] += 1
            nid = nodes[nid].get("parentId")
    for nid, c in counts.items():
        p.collection("nodes").document(nid).update({"verseCount": c})
    p.update({"verseCount": len(verses)})


def main() -> None:
    args = parse_args(
        "Seed demo data",
        lambda p: (p.add_argument("--owner-email"), p.add_argument("--no-media", action="store_true")),
    )
    db, auth = init()
    from google.cloud.firestore_v1.base_query import FieldFilter

    if args.owner_email:
        owner_user = auth.get_user_by_email(args.owner_email)
    else:
        supers = list(db.collection("adminUsers").where(filter=FieldFilter("role", "==", "SUPER_ADMIN")).limit(1).stream())
        if not supers:
            sys.exit("No Super Admin found. Run scripts/bootstrap_super_admin.py first.")
        owner_user = auth.get_user(supers[0].id)
    owner_uid = owner_user.uid
    ts = now()

    # --- Sri Rudram -----------------------------------------------------------
    pid = "sri-rudram"
    p = db.collection("playlists").document(pid)
    p.set(
        {
            "title": "Sri Rudram",
            "titleNative": "श्री रुद्रम्",
            "description": "The Śrī Rudram (Rudra Praśnam) from the Kṛṣṇa Yajurveda Taittirīya Saṃhitā: "
            "Namakam salutes Rudra in his many forms; Chamakam asks for every blessing, ending in peace.",
            "coverUrl": None,
            "access": "free",
            "price": None,
            "published": True,
            "sequentialUnlock": False,
            "order": 1,
            "verseCount": 0,
            "createdAt": ts,
            "updatedAt": ts,
        }
    )
    db.collection("adminPlaylists").document(pid).set({"ownerUid": owner_uid, "createdBy": owner_uid, "createdAt": ts})
    nodes = p.collection("nodes")
    nodes.document("namakam").set({"parentId": None, "name": "Namakam", "description": "नमकम् · Salutations", "order": 1})
    nodes.document("chamakam").set({"parentId": None, "name": "Chamakam", "description": "चमकम् · Prayers for blessings", "order": 2})
    for i in range(1, 12):
        nodes.document(f"namakam-a{i}").set({"parentId": "namakam", "name": f"Anuvakam {i}", "description": "", "order": i})
        nodes.document(f"chamakam-a{i}").set({"parentId": "chamakam", "name": f"Anuvakam {i}", "description": "", "order": i})
    verses = p.collection("verses")
    for n, (name, first_line, details) in enumerate(NAMAKAM_A1, start=1):
        verses.document(f"na1-v{n}").set(
            {"nodeId": "namakam-a1", "name": name, "firstLine": first_line, "details": details, "order": n, "hasAudio": False, "hasVideo": False, "createdAt": ts}
        )
    verses.document("na2-v1").set(
        {"nodeId": "namakam-a2", "name": "Verse 1", "firstLine": "नमो हिरण्यबाहवे सेनान्ये", "details": "<p lang=\"sa\">नमो हिरण्यबाहवे सेनान्ये दिशां च पतये नमः ।</p><p>Salutations to the golden-armed leader of armies, lord of the quarters.</p>", "order": 1, "hasAudio": False, "hasVideo": False, "createdAt": ts}
    )
    p.collection("materials").document("about").set(
        {"title": "About Sri Rudram", "type": "text", "nodeId": None, "status": "ready", "order": 1,
         "text": "Chant slowly with attention to svaras (udātta, anudātta, svarita). Listen three times, then chant three times.", "createdAt": ts}
    )
    recount(db, pid)

    # --- a paid demo playlist ------------------------------------------------------
    pid2 = "purusha-suktam"
    p2 = db.collection("playlists").document(pid2)
    p2.set(
        {"title": "Purusha Suktam", "titleNative": "पुरुष सूक्तम्", "description": "The hymn of the cosmic being from the Rig Veda (10.90).",
         "coverUrl": None, "access": "paid", "price": 199, "published": True, "sequentialUnlock": True, "order": 2, "verseCount": 0, "createdAt": ts, "updatedAt": ts}
    )
    p2.collection("payment").document("info").set({"upiId": "learnchants.trust@upi", "payeeName": "Learn Chants Trust"})
    db.collection("adminPlaylists").document(pid2).set({"ownerUid": owner_uid, "createdBy": owner_uid, "createdAt": ts})
    p2.collection("nodes").document("main").set({"parentId": None, "name": "Mantras", "description": "", "order": 1})
    p2.collection("verses").document("ps-v1").set(
        {"nodeId": "main", "name": "Mantra 1", "firstLine": "सहस्रशीर्षा पुरुषः", "details": "<p lang=\"sa\">सहस्रशीर्षा पुरुषः सहस्राक्षः सहस्रपात् ।</p><p>The Purusha has a thousand heads, a thousand eyes, a thousand feet.</p>", "order": 1, "hasAudio": False, "hasVideo": False, "createdAt": ts}
    )
    recount(db, pid2)

    if not args.no_media:
        for n in range(1, len(NAMAKAM_A1) + 1):
            store_audio(db, owner_uid, pid, f"na1-v{n}", 3.0 + n * 0.5)
        store_audio(db, owner_uid, pid2, "ps-v1", 4.0)
        print("✔ sample audio stored in Firestore media chunks")

    learner = get_or_create_user(auth, LEARNER_EMAIL, LEARNER_PASSWORD, "Demo Learner")
    db.collection("users").document(learner.uid).set({"displayName": "Demo Learner", "email": LEARNER_EMAIL, "createdAt": ts}, merge=True)

    print("✔ Seeded Sri Rudram (Namakam 11 + Chamakam 11 anuvakams) and Purusha Suktam (paid ₹199)")
    print(f"✔ Demo learner: {LEARNER_EMAIL} / {LEARNER_PASSWORD}")


if __name__ == "__main__":
    main()
