import type { DatabaseSync } from "node:sqlite";

function hasColumn(db: DatabaseSync, table: string, column: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((row) => row.name === column);
}

function addColumn(db: DatabaseSync, table: string, columnSql: string, columnName: string) {
  if (!hasColumn(db, table, columnName)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`);
}

export function ensureDocumentWorkflowFoundation(db: DatabaseSync) {
  addColumn(db, "documents", "workflow_status TEXT NOT NULL DEFAULT 'received'", "workflow_status");
  addColumn(db, "documents", "workflow_updated_at TEXT", "workflow_updated_at");
  addColumn(db, "documents", "reviewed_by TEXT", "reviewed_by");
  addColumn(db, "documents", "reviewed_at TEXT", "reviewed_at");
  addColumn(db, "documents", "filed_by TEXT", "filed_by");
  addColumn(db, "documents", "filed_at TEXT", "filed_at");
  addColumn(db, "documents", "superseded_by_document_id TEXT", "superseded_by_document_id");

  db.exec(`
    UPDATE documents
    SET workflow_status = 'received', workflow_updated_at = COALESCE(workflow_updated_at, updated_at)
    WHERE workflow_status IS NULL OR workflow_status = '';

    CREATE TABLE IF NOT EXISTS document_workflow_events (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      from_status TEXT NOT NULL,
      to_status TEXT NOT NULL,
      note TEXT,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE RESTRICT,
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_document_workflow_status
      ON documents(workflow_status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_document_workflow_events
      ON document_workflow_events(document_id, created_at DESC);

    CREATE TRIGGER IF NOT EXISTS trg_document_workflow_events_no_update
      BEFORE UPDATE ON document_workflow_events
      BEGIN
        SELECT RAISE(ABORT, 'Document workflow events are immutable');
      END;

    CREATE TRIGGER IF NOT EXISTS trg_document_workflow_events_no_delete
      BEFORE DELETE ON document_workflow_events
      BEGIN
        SELECT RAISE(ABORT, 'Document workflow events are immutable');
      END;
  `);

  seedInitialDocuments(db);
}

function sha256(content: string) {
  const { createHash } = require("node:crypto");
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function seedInitialDocuments(db: DatabaseSync) {
  try {
    const docCheck = db.prepare("SELECT COUNT(*) as count FROM documents").get() as { count: number } | undefined;
    if (docCheck && docCheck.count > 0) return;

    const initialDocs = [
      {
        id: "doc-mc-1",
        patientId: "maya-chen",
        type: "eval_report",
        title: "Neuropsychological Evaluation Report",
        workflowStatus: "reviewed",
        createdAt: "2026-04-12T14:30:00.000Z",
        reviewedBy: "Dr. Logan Carton, MD",
        reviewedAt: "2026-04-12T15:00:00.000Z",
        content: `NEUROPSYCHOLOGICAL CONSULTATION REPORT\nPatient: Maya Chen (DOB: 04/18/1992)\nReferring Provider: Dr. Logan Carton, MD\nEvaluation Date: April 10, 2026\n\nCLINICAL SUMMARY:\nMaya Chen underwent comprehensive neuropsychological assessment focusing on adult attention regulation, executive processing speed, and affective modulation.\n\nTEST BATTERY ADMINISTERED:\n- WAIS-IV (Working Memory Index: 98, Processing Speed Index: 92)\n- Conners' Adult ADHD Rating Scales (CAARS) - Inattention/Memory subscale T-score: 72 (Clinically Significant)\n- Continuous Performance Test (CPT-3): Marked variability in reaction time, high omission errors during low-stimulus blocks.\n\nDIAGNOSTIC IMPRESSION:\nResults support DSM-5 criteria for Attention-Deficit/Hyperactivity Disorder, Combined Presentation (F90.2) with secondary Generalized Anxiety features.\n\nRECOMMENDATIONS:\n1. Pharmacotherapy optimization (combination alpha-2 agonist or stimulant alongside SSRI).\n2. Executive functioning habit coaching and timer-assisted task chunking.`,
      },
      {
        id: "doc-mc-2",
        patientId: "maya-chen",
        type: "prior_auth",
        title: "Prior Authorization Approval - Guanfacine ER",
        workflowStatus: "filed",
        createdAt: "2026-07-20T09:15:00.000Z",
        filedBy: "Dr. Logan Carton, MD",
        filedAt: "2026-07-20T10:00:00.000Z",
        content: `AETNA BEHAVIORAL HEALTHCARE - PRIOR AUTHORIZATION APPROVAL\nMember: Maya Chen (ID: W819204812)\nPrescriber: Dr. Logan Carton, MD (NPI: 1948201948)\nMedication: Guanfacine ER 2 mg oral tablet (Intuniv)\nQuantity: 30 tablets per 30 days\nApproval Period: 07/20/2026 through 07/19/2027\n\nClinical Criteria Met: Documented intolerance/contraindication to standard stimulant mono-therapy and clinical indication for emotional dysregulation in adult ADHD.`,
      },
      {
        id: "doc-mc-3",
        patientId: "maya-chen",
        type: "lab_requisition",
        title: "Quest Diagnostics Requisition - BMP & Thyroid Panel",
        workflowStatus: "needs_review",
        createdAt: "2026-08-28T16:00:00.000Z",
        content: `QUEST DIAGNOSTICS ELECTRONIC REQUISITION\nOrder: #89124012\nPatient: Maya Chen (MRN: P-10482)\nOrdering Physician: Dr. Logan Carton, MD\nRequested Tests:\n- Basic Metabolic Panel (LOINC 24320-4)\n- TSH 3rd Generation (LOINC 3016-3)\nStatus: Specimen Received at Regional Reference Lab. Results pending final release.`,
      },
      {
        id: "doc-jr-1",
        patientId: "jordan-reed",
        type: "discharge_summary",
        title: "Discharge Summary - Valley Health Behavioral Care",
        workflowStatus: "reviewed",
        createdAt: "2025-11-18T11:00:00.000Z",
        reviewedBy: "Dr. Logan Carton, MD",
        reviewedAt: "2025-11-20T09:30:00.000Z",
        content: `VALLEY HEALTH ADULT INPATIENT PSYCHIATRY\nDISCHARGE SUMMARY\nPatient: Jordan Reed (MRN: P-10917)\nAdmit Date: 11/10/2025 | Discharge Date: 11/18/2025\nAttending: Dr. Sarah Lin, MD\n\nDischarge Diagnoses: Unspecified Mood Disorder; Sleep Maintenance Insomnia.\nCondition at Discharge: Stable, euthymic, baseline sleep restored on Lamotrigine 100mg and Quetiapine 100mg bedtime.\nDischarge Instructions: Outpatient follow-up with Dr. Logan Carton within 14 days.`,
      },
      {
        id: "doc-jr-2",
        patientId: "jordan-reed",
        type: "lab_requisition",
        title: "Metabolic Surveillance Lab Requisition - Fasting Lipids & HbA1c",
        workflowStatus: "received",
        createdAt: "2026-09-02T10:30:00.000Z",
        content: `LABCORP OUTPATIENT REQUISITION\nPatient: Jordan Reed (MRN: P-10917)\nProtocol: Annual Atypical Antipsychotic Metabolic Surveillance\nRequired Tests: Fasting Lipid Panel (Triglycerides, HDL, LDL, Total Cholesterol) & HbA1c.\nPatient instructions: 10-12 hour overnight water-only fast required prior to venipuncture.`,
      },
      {
        id: "doc-er-1",
        patientId: "elena-rostova",
        type: "outside_records",
        title: "Outside Records - Integrative Psychotherapy Summary",
        workflowStatus: "needs_review",
        createdAt: "2026-08-15T15:20:00.000Z",
        content: `MIDTOWN PSYCHOLOGICAL ASSOCIATES\nTherapist: Dr. Rachel Vance, PsyD, LCSW\nTreatment: Cognitive Behavioral Therapy for Persistent Depressive Disorder.\nSession Count: 14 sessions completed.\nSummary: Patient showing steady gains in behavioral activation and self-compassion. Bupropion addition provided significant relief from chronic lethargy.`,
      },
      {
        id: "doc-dk-1",
        patientId: "david-kim",
        type: "specialist_note",
        title: "Outside Records - Nephrology Clearance for Lithium Maintenance",
        workflowStatus: "reviewed",
        createdAt: "2026-03-04T13:45:00.000Z",
        reviewedBy: "Dr. Logan Carton, MD",
        reviewedAt: "2026-03-05T11:15:00.000Z",
        content: `PACIFIC RENAL & NEPHROLOGY SPECIALISTS\nPatient: David Kim (46y, MRN: P-10889)\nReason for Consult: Renal safety clearance for continued Lithium Carbonate therapy.\nFindings: Baseline creatinine 1.0 mg/dL, estimated GFR 88 mL/min/1.73m2. No proteinuria or urinary concentrating defect. Clear to continue Lithium with bi-annual eGFR and serum level monitoring.`,
      },
      {
        id: "doc-sm-1",
        patientId: "sofia-martinez",
        type: "education_plan",
        title: "School Accommodations 504 Plan - Lincoln High School",
        workflowStatus: "filed",
        createdAt: "2026-08-01T14:00:00.000Z",
        filedBy: "Dr. Logan Carton, MD",
        filedAt: "2026-08-01T14:30:00.000Z",
        content: `SECTION 504 ACCOMMODATION PLAN\nStudent: Sofia Martinez (18y, MRN: P-11104)\nSchool: Lincoln High School / Transition Counseling\nAccommodations Approved:\n- Extended time (1.5x) for testing in low-distraction setting.\n- Pass to visit school counselor/nurse during acute panic symptoms.\n- Flexible assignment submission during severe depressive symptom exacerbation.`,
      },
    ];

    const insertDoc = db.prepare(`
      INSERT OR IGNORE INTO documents (
        id, patient_id, document_type, title, status, current_version,
        mime_type, content_sha256, source_system, created_by,
        created_at, updated_at, workflow_status, workflow_updated_at,
        reviewed_by, reviewed_at, filed_by, filed_at
      ) VALUES (?, ?, ?, ?, 'active', 1, 'text/plain', ?, 'outside-records', 'Dr. Logan Carton, MD', ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertVer = db.prepare(`
      INSERT OR IGNORE INTO document_versions (
        id, document_id, version_number, content_text, mime_type,
        content_sha256, created_by, created_at
      ) VALUES (?, ?, 1, ?, 'text/plain', ?, 'Dr. Logan Carton, MD', ?)
    `);

    const insertEvent = db.prepare(`
      INSERT OR IGNORE INTO document_workflow_events (
        id, document_id, patient_id, from_status, to_status, note, actor_id, actor_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'system', 'Dr. Logan Carton, MD', ?)
    `);

    for (const doc of initialDocs) {
      const hash = sha256(doc.content);
      insertDoc.run(
        doc.id,
        doc.patientId,
        doc.type,
        doc.title,
        hash,
        doc.createdAt,
        doc.createdAt,
        doc.workflowStatus,
        doc.createdAt,
        doc.reviewedBy || null,
        doc.reviewedAt || null,
        doc.filedBy || null,
        doc.filedAt || null
      );

      insertVer.run(
        `ver-${doc.id}-1`,
        doc.id,
        doc.content,
        hash,
        doc.createdAt
      );

      insertEvent.run(
        `evt-${doc.id}-initial`,
        doc.id,
        doc.patientId,
        "received",
        doc.workflowStatus,
        `Document received into chart with initial status ${doc.workflowStatus}`,
        doc.createdAt
      );
    }
  } catch (err) {
    console.error("Error seeding initial clinical documents:", err);
  }
}
