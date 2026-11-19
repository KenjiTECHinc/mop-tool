CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  tier TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  totp_secret TEXT,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  last_seen_at TEXT,
  previous_seen_at TEXT,
  preferred_language TEXT NOT NULL,
  ai_calls_day TEXT,
  ai_calls_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  session_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL,
  is_sandbox INTEGER NOT NULL,
  next_number INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS members_by_user ON project_members (user_id);

CREATE TABLE IF NOT EXISTS tickets (
  ticket_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  assignee_id TEXT,
  reporter_id TEXT NOT NULL,
  labels TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_via TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tickets_by_project ON tickets (project_id);
CREATE INDEX IF NOT EXISTS tickets_by_assignee ON tickets (assignee_id);
CREATE INDEX IF NOT EXISTS tickets_by_status ON tickets (status);

CREATE TABLE IF NOT EXISTS comments (
  comment_id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_via TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_by_ticket ON comments (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  event_id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_tier TEXT NOT NULL,
  channel TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  latency_ms INTEGER,
  prompt_chars INTEGER,
  prompt_hash TEXT
);
CREATE INDEX IF NOT EXISTS audit_by_time ON audit_log (timestamp);

CREATE TRIGGER IF NOT EXISTS audit_no_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_append_only');
END;

CREATE TRIGGER IF NOT EXISTS audit_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_append_only');
END;

CREATE TABLE IF NOT EXISTS pending_actions (
  action_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  project_id TEXT NOT NULL,
  resource_id TEXT NOT NULL
);
