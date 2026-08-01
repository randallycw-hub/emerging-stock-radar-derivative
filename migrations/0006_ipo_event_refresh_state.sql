CREATE TABLE ipo_event_refresh_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  lease_owner TEXT,
  lease_expires_at TEXT,
  last_attempt_at TEXT NOT NULL,
  last_success_at TEXT,
  CHECK (
    (lease_owner IS NULL AND lease_expires_at IS NULL)
    OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);

CREATE INDEX idx_ipo_event_refresh_last_attempt
  ON ipo_event_refresh_state(last_attempt_at);
