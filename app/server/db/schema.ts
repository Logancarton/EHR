export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dob TEXT NOT NULL,
  age INTEGER NOT NULL,
  mrn TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  pronouns TEXT NOT NULL,
  initials TEXT NOT NULL,
  alert TEXT,
  allergies_json TEXT NOT NULL DEFAULT '[]',
  diagnoses_json TEXT NOT NULL DEFAULT '[]',
  meds_json TEXT NOT NULL DEFAULT '[]',
  vitals_json TEXT NOT NULL DEFAULT '{}',
  last_visit TEXT NOT NULL,
  next_visit TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS encounters (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  chief_complaint TEXT NOT NULL DEFAULT '',
  hpi TEXT NOT NULL DEFAULT '',
  interval_history TEXT NOT NULL DEFAULT '',
  treatment_response TEXT NOT NULL DEFAULT '',
  side_effects TEXT NOT NULL DEFAULT '',
  mse_json TEXT NOT NULL DEFAULT '{}',
  assessment TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT '',
  cpt_code TEXT NOT NULL DEFAULT '99214',
  em_level TEXT NOT NULL DEFAULT 'Moderate Complexity (99214)',
  signed_by TEXT,
  signed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'medication' | 'lab'
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'staged', -- 'staged' | 'authorized' | 'transmitted'
  details_json TEXT NOT NULL,
  ordered_by TEXT NOT NULL,
  authorized_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  urgency TEXT NOT NULL,
  channel TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  ai_triage_summary TEXT,
  clinical_intent TEXT,
  suggested_actions_json TEXT NOT NULL DEFAULT '[]',
  smart_replies_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'delivered',
  timestamp TEXT NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  patient_id TEXT,
  text TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  type TEXT NOT NULL DEFAULT 'task', -- 'task' | 'scratchpad'
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_preferences (
  provider_id TEXT PRIMARY KEY,
  active_preset_id TEXT NOT NULL,
  density TEXT NOT NULL,
  header_density TEXT NOT NULL,
  show_companion_rail INTEGER NOT NULL DEFAULT 1,
  show_sidebar INTEGER NOT NULL DEFAULT 1,
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  event_type TEXT NOT NULL,
  patient_id TEXT,
  description TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

-- Indexes for high-velocity lookups
CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters (patient_id);
CREATE INDEX IF NOT EXISTS idx_orders_patient ON orders (patient_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_messages_patient ON messages (patient_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages (thread_id);
CREATE INDEX IF NOT EXISTS idx_audit_patient ON audit_logs (patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs (timestamp);
`;
