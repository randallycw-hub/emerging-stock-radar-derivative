CREATE TABLE ipo_event_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  data_date TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  source_manifest_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE ipo_event_snapshot_pointer (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  snapshot_id TEXT NOT NULL,
  published_at TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES ipo_event_snapshots(snapshot_id)
);

CREATE INDEX idx_ipo_event_snapshots_data_date
  ON ipo_event_snapshots(data_date, generated_at);
