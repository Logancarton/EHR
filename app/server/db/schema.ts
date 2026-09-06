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

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL, -- YYYY-MM-DD
  patient_id TEXT NOT NULL,
  patient_name TEXT NOT NULL,
  dob TEXT NOT NULL,
  age INTEGER NOT NULL,
  mrn TEXT NOT NULL,
  time TEXT NOT NULL,
  duration TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'waiting' | 'in-visit' | 'completed' | 'no-show'
  chief_complaint TEXT NOT NULL,
  room TEXT,
  alert TEXT,
  insurance TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Internal team collaboration is intentionally separate from patient-facing messaging.
CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  credentials TEXT,
  role TEXT NOT NULL,
  initials TEXT NOT NULL,
  presence TEXT NOT NULL DEFAULT 'offline',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_member_patients (
  user_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'care-team',
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, patient_id),
  FOREIGN KEY (user_id) REFERENCES team_members (id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS team_threads (
  id TEXT PRIMARY KEY,
  member_a_id TEXT NOT NULL,
  member_b_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (member_a_id, member_b_id),
  FOREIGN KEY (member_a_id) REFERENCES team_members (id) ON DELETE CASCADE,
  FOREIGN KEY (member_b_id) REFERENCES team_members (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS team_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  patient_id TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT,
  FOREIGN KEY (thread_id) REFERENCES team_threads (id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES team_members (id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS team_task_agreements (
  id TEXT PRIMARY KEY,
  member_a_id TEXT NOT NULL,
  member_b_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'active' | 'revoked'
  requested_by TEXT NOT NULL,
  accepted_by TEXT,
  requested_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (member_a_id, member_b_id),
  FOREIGN KEY (member_a_id) REFERENCES team_members (id) ON DELETE CASCADE,
  FOREIGN KEY (member_b_id) REFERENCES team_members (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS team_task_assignments (
  id TEXT PRIMARY KEY,
  assigner_id TEXT NOT NULL,
  assignee_id TEXT NOT NULL,
  text TEXT NOT NULL,
  patient_id TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'done' | 'cancelled'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (assigner_id) REFERENCES team_members (id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_id) REFERENCES team_members (id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE SET NULL
);

-- Full text search virtual table for encounters
CREATE VIRTUAL TABLE IF NOT EXISTS encounters_fts USING fts5(
  encounter_id UNINDEXED,
  patient_id UNINDEXED,
  patient_name,
  date,
  chief_complaint,
  hpi,
  interval_history,
  treatment_response,
  assessment,
  plan
);

-- Indexes for high-velocity lookups
CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters (patient_id);
CREATE INDEX IF NOT EXISTS idx_orders_patient ON orders (patient_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_messages_patient ON messages (patient_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages (thread_id);
CREATE INDEX IF NOT EXISTS idx_audit_patient ON audit_logs (patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments (date);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments (patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments (status);
CREATE INDEX IF NOT EXISTS idx_team_member_patients_patient ON team_member_patients (patient_id);
CREATE INDEX IF NOT EXISTS idx_team_messages_thread ON team_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_team_messages_patient ON team_messages (patient_id);
CREATE INDEX IF NOT EXISTS idx_team_tasks_assignee ON team_task_assignments (assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_team_tasks_assigner ON team_task_assignments (assigner_id, status);
`;
