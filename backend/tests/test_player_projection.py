"""Tests for the player projection's display_name handling.

display_name is optional: a set value is stored, and an empty/whitespace value
is normalized to NULL (meaning "show first + last instead"). Uses a temp SQLite
file and applies events through projections.apply_event, so it needs no
fastapi/HTTP layer and runs in base python like the other suites.

Run (from the backend/ dir): python -m unittest tests.test_player_projection
"""

import os
import tempfile
import unittest

import db  # noqa: E402
from projections import apply_event  # noqa: E402


class PlayerDisplayNameTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self._tmp.close()
        db.DB_PATH = self._tmp.name
        db._conn = None
        db.get_connection().executescript(db.SCHEMA)

    def tearDown(self):
        db._conn = None
        os.unlink(self._tmp.name)

    def _create(self, player_id, **payload):
        data = {"first_name": "Robert", "last_name": "Smith", "default_pool": "A"}
        data.update(payload)
        with db.transaction() as conn:
            apply_event(conn, "PlayerCreated", player_id, data, "2026-07-16T00:00:00Z")

    def _edit(self, player_id, **payload):
        data = {"first_name": "Robert", "last_name": "Smith", "default_pool": "A"}
        data.update(payload)
        with db.transaction() as conn:
            apply_event(conn, "PlayerEdited", player_id, data, "2026-07-17T00:00:00Z")

    def _display_name(self, player_id):
        with db.read() as conn:
            row = conn.execute(
                "SELECT display_name FROM players WHERE player_id = ?", (player_id,)
            ).fetchone()
        return row["display_name"]

    def test_created_with_display_name(self):
        self._create("p1", display_name="Bob")
        self.assertEqual(self._display_name("p1"), "Bob")

    def test_created_without_display_name_is_null(self):
        self._create("p1")
        self.assertIsNone(self._display_name("p1"))

    def test_blank_display_name_normalized_to_null(self):
        self._create("p1", display_name="   ")
        self.assertIsNone(self._display_name("p1"))

    def test_edit_sets_display_name(self):
        self._create("p1")
        self._edit("p1", display_name="Bobby")
        self.assertEqual(self._display_name("p1"), "Bobby")

    def test_edit_clears_display_name(self):
        self._create("p1", display_name="Bob")
        self._edit("p1", display_name="")
        self.assertIsNone(self._display_name("p1"))


if __name__ == "__main__":
    unittest.main()
