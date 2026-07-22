"""Tests for the command-batch conflict check (db.stale_write_conflict).

This is the optimistic-concurrency gate behind POST /commands. It must accept a
client resending its own events after a lost ack (flaky course connection) while
still rejecting a genuinely stale write (a second device advanced the log). Uses
a temp SQLite file and seeds the event log directly, so it needs no fastapi/HTTP
layer and runs in base python like test_s3_sync.

Run (from the backend/ dir): python -m unittest tests.test_commands
"""

import json
import os
import tempfile
import unittest

import db  # noqa: E402


class StaleWriteConflictTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self._tmp.close()
        db.DB_PATH = self._tmp.name
        db._conn = None
        db.get_connection().executescript(db.SCHEMA)

    def tearDown(self):
        db._conn = None
        os.unlink(self._tmp.name)

    def _append(self, *event_ids):
        """Append events with the given ids to the log (seq assigned by SQLite)."""
        with db.transaction() as conn:
            for event_id in event_ids:
                conn.execute(
                    "INSERT INTO events (event_id, event_type, aggregate_id, payload, created_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (event_id, "PlayerCreated", "agg", json.dumps({}), "2026-07-16T00:00:00Z"),
                )

    def _conflict(self, expected_version, batch_ids):
        with db.read() as conn:
            return db.stale_write_conflict(conn, expected_version, set(batch_ids))

    # -- in sync: the normal path --------------------------------------------
    def test_no_conflict_when_in_sync(self):
        self._append("e1", "e2", "e3")  # seq 1..3
        # Client is caught up (expected == current) and submits fresh events.
        self.assertFalse(self._conflict(3, ["new-a", "new-b"]))

    def test_no_conflict_on_empty_log(self):
        # First-ever write: nothing synced yet, nothing on the server.
        self.assertFalse(self._conflict(0, ["new-a"]))

    # -- lost-ack retry: the bug this fix targets ----------------------------
    def test_no_conflict_on_pure_resend(self):
        # Prior batch committed (seq 1..3) but the ack was lost, so the client
        # still thinks it synced 0 and resends those exact events.
        self._append("e1", "e2", "e3")
        self.assertFalse(self._conflict(0, ["e1", "e2", "e3"]))

    def test_no_conflict_on_resend_plus_new(self):
        # Same lost ack, but the admin kept working: the resend carries the three
        # committed events plus a genuinely new one. The gap is fully explained by
        # the client's own events, so it's safe — the new one gets applied.
        self._append("e1", "e2", "e3")
        self.assertFalse(self._conflict(0, ["e1", "e2", "e3", "e4-new"]))

    # -- genuinely stale writes: must still be rejected ----------------------
    def test_conflict_when_another_device_wrote(self):
        # This client's e1,e2 committed (seq 1,2), ack lost. Meanwhile a second
        # device wrote "other" (seq 3). The resend doesn't include "other", so the
        # client is missing state and must re-sync.
        self._append("e1", "e2", "other")
        self.assertTrue(self._conflict(0, ["e1", "e2"]))

    def test_conflict_when_behind_by_unknown_event(self):
        # Client synced through seq 2 but the server has an unseen seq 3.
        self._append("e1", "e2", "e3")
        self.assertTrue(self._conflict(2, ["new-a"]))

    def test_conflict_when_expected_ahead_of_log(self):
        # Client claims to be ahead of the log (e.g. server lost/rolled back data):
        # anomalous, force a re-sync to server truth.
        self._append("e1", "e2", "e3")
        self.assertTrue(self._conflict(5, ["new-a"]))


if __name__ == "__main__":
    unittest.main()
