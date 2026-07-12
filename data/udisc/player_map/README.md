# Player match review — edit these, then tell me you're done.

Each row maps a scraped UDisc name to an EXISTING app player (`match_name`),
or `"NEW"` to create a fresh player record.

- EXACT.json           : exact name matches — auto, review only if you doubt one.
- CONFIRM_first_name.json : matched on first name only — confirm or fix match_name.
- CONFIRM_fuzzy.json   : near-spelling matches — confirm or fix match_name.
- RESOLVE_ambiguous.json : multiple candidates — set match_name to one of `candidates` or "NEW".
- NEW.json             : no match found — will be created fresh (edit to a real name to merge instead).

`COLLISION` marks rows where two scraped players point at the same app player — fix at least one.
New players default to: last name "(UDisc)", pool B, not-woman.