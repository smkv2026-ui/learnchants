"""Learn Chants Cloud Functions business logic.

Modules here are framework-light: they take a ``Deps`` bundle (Firestore client,
auth adapter, storage provider factory, config, clock) so they can be unit
tested with in-memory fakes. ``main.py`` wires them to Firebase triggers.
"""
