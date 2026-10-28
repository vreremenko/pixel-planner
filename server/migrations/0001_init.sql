-- Подписки устройств на Web Push
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Расписание напоминаний (только ключ, момент и текст — не вся база)
CREATE TABLE IF NOT EXISTS reminders (
  device_id TEXT NOT NULL,
  key TEXT NOT NULL,
  fire_at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, key)
);
CREATE INDEX IF NOT EXISTS reminders_due ON reminders (sent, fire_at);
