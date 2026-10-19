import inspect


def test_main_exports_every_function():
    import main

    exported = {n for n, f in inspect.getmembers(main, inspect.isfunction) if hasattr(f, "__firebase_endpoint__")}
    assert exported == {
        "init_profile", "create_admin_invite", "accept_admin_invite", "deactivate_admin", "remove_admin",
        "drive_auth_url", "drive_oauth_callback", "drive_status", "drive_disconnect", "set_storage_location",
        "move_storage", "create_upload_session", "finalize_upload", "get_media_url", "stream_media",
        "mock_upload", "submit_payment_request", "review_payment", "revoke_access", "review_submission",
        "on_verse_written", "on_node_written", "on_playlist_written",
    }
