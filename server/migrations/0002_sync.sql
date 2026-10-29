-- Синхронизация между устройствами. space = SHA-256 от ключа синхронизации (сам ключ не хранится).
-- seq растёт при каждой записи, по нему устройства забирают только новое.
CREATE TABLE IF NOT EXISTS sync_records (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  space TEXT NOT NULL,
  tbl TEXT NOT NULL,
  rid TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS sync_records_key ON sync_records (space, tbl, rid);
CREATE INDEX IF NOT EXISTS sync_records_pull ON sync_records (space, seq);
