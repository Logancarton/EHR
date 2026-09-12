# Whole-EHR audit harness

Eight independent specialist audits, followed by one synthesis. Run this from **Codex Desktop's PowerShell terminal** for this project, or a normal Windows PowerShell terminal. The launcher uses the locally installed **Codex CLI**; it does not create nine sidebar tasks or require pasting prompts into chats.

Based on the full **Codex Versus ChatGPT Assessment** conversation (2026-09-12). The specialist missions, workflow traces and deliverables are retained; Agents 7–9 are reformatted from the full conversation. The shared runtime contract deliberately tightens the original design: no automatic fetch, no application writes, no database access, and no write-producing validation during an agent run.

## Quick start

Open PowerShell:

~~~powershell
Set-Location 'C:\Users\Logan\Desktop\EHR'

# Check the installed launcher prerequisites/options. No model call.
powershell -NoProfile -ExecutionPolicy Bypass -File .\audit\Start-EhrAudit.ps1 -Mode Doctor

# Preview all eight specialist launches. Exports a batch; makes no model calls.
powershell -NoProfile -ExecutionPolicy Bypass -File .\audit\Start-EhrAudit.ps1 -Mode Run -DryRun

# Run all eight specialists, then Agent 9 automatically, two specialists at a time.
powershell -NoProfile -ExecutionPolicy Bypass -File .\audit\Start-EhrAudit.ps1 -Mode Run -Jobs 2
~~~

Each command without a RunDir creates a new timestamped batch. The console prints its full path. To use the batch created by the preview, pass that printed path as -RunDir to the real run instead of creating another.

- Default output root: **%LOCALAPPDATA%\ClinicalBond\audits**
- A run without -Jobs is sequential. -Jobs accepts 1–8.
- Each specialist has a separate Codex invocation and does not receive other specialist reports.
- Agent 9 starts only after all eight validated reports exist for the same batch, source commit and frozen prompts.
- Real runs use your authenticated Codex account and its usage limits. No new API service or framework is introduced.
- User Codex config is ignored for safety. An unspecified model uses the CLI default, which may differ from your Desktop model. Pass -Model with an exact model ID available to your account if desired.

## Independent agents and resume

Initialize once and keep the printed batch path:

~~~powershell
Set-Location 'C:\Users\Logan\Desktop\EHR'
powershell -NoProfile -ExecutionPolicy Bypass -File .\audit\Start-EhrAudit.ps1 -Mode Init
$run = 'C:\Users\Logan\AppData\Local\ClinicalBond\audits\<printed-batch-name>'

# Run any specialist independently. Separate terminals can share the same batch.
powershell -NoProfile -ExecutionPolicy Bypass -File .\audit\Start-EhrAudit.ps1 -Mode Run -RunDir $run -Agent 1
powershell -NoProfile -ExecutionPolicy Bypass -File .\audit\Start-EhrAudit.ps1 -Mode Run -RunDir $run -Agent 4

# Run/resume all specialists; do not start synthesis yet.
powershell -NoProfile -ExecutionPolicy Bypass -File .\audit\Start-EhrAudit.ps1 -Mode Run -RunDir $run -Agent specialists -Jobs 2

# Inspect progress (no model call).
powershell -NoProfile -ExecutionPolicy Bypass -File .\audit\Start-EhrAudit.ps1 -Mode Status -RunDir $run

# Run synthesis only, once all eight reports are ready.
powershell -NoProfile -ExecutionPolicy Bypass -File .\audit\Start-EhrAudit.ps1 -Mode Run -RunDir $run -Agent 9

# Resume the entire pipeline; validated successful agents are skipped.
powershell -NoProfile -ExecutionPolicy Bypass -File .\audit\Start-EhrAudit.ps1 -Mode Run -RunDir $run -Jobs 2
~~~

Replace the placeholder with the actual batch path; it is not a literal directory name. To redo a successful agent or change prompts, initialize a new batch. Do not edit a completed report in place and then synthesize it.

| Agent | Prompt | Scope |
|---|---|---|
| 1 | agents/01-frontend-workspace.md | Clinician workspace, state ownership, patient isolation |
| 2 | agents/02-backend-domain.md | Domain ownership, lifecycles, transactions, mutation boundaries |
| 3 | agents/03-database-persistence.md | Clinical truth, schema, history, constraints, recovery |
| 4 | agents/04-medication-erx.md | Medication authority, Rx lineage, DrFirst/EPCS boundaries |
| 5 | agents/05-security-audit.md | Identity, authorization, tenancy, audit and PHI blockers |
| 6 | agents/06-tests-reliability.md | Meaningful invariants, CI, browser tests and failure coverage |
| 7 | agents/07-documentation-drift.md | Documentation versus implementation evidence |
| 8 | agents/08-product-completeness.md | End-to-end outpatient psychiatric practice workflows |
| 9 | agents/09-synthesis.md | Deduplicated risks, disagreements, readiness and build sequence |

## Prerequisites

- Windows PowerShell 5.1 or newer, Node.js 22 (already used by the EHR), Git and Windows tar.exe.
- A native codex.exe with working authentication and Windows read-only sandbox support. Tested launcher compatibility: **codex-cli 0.153.4**.
- Doctor checks the actual available flags and feature controls and fails if required controls are absent. It does not start a model or prove account/sandbox connectivity.
- The wrapper finds Node on PATH or under Program Files\nodejs. Codex is found on PATH or in the Desktop installation under %LOCALAPPDATA%\OpenAI\Codex\bin.
- If detection fails, use -CodexPath 'C:\full\path\codex.exe'. Only native executables are supported on Windows; .cmd/.ps1 shims are intentionally rejected to avoid shell quoting ambiguities.
- If authentication is missing, use the installed Codex CLI's login flow separately. The launcher never reads, prints or copies credentials.
- No npm install is needed for the harness. It uses Node built-ins and native Windows tools.
- The EHR needs a local branch, HEAD and cached origin/main. A detached checkout is rejected.
- GitHub access is needed to verify current main when initializing. Existing batches are pinned and can resume without another GitHub check.

PowerShell's per-process -ExecutionPolicy Bypass above only permits executing this reviewed local script. It does not change system policy or weaken the Codex sandbox.

## Baseline and outputs

Initialization reads status, branch, HEAD, origin/main and recent history. A read-only git ls-remote checks that cached origin/main equals current remote main. If they differ, it stops. Update the cached reference separately using your normal development workflow; the harness never fetches or updates refs.

If you intentionally need to audit cached origin/main without GitHub verification:

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\audit\Start-EhrAudit.ps1 -Mode Init -Offline
~~~

Offline is explicit and recorded as **not remotely verified**. Working changes and a local HEAD ahead of main are recorded but never become the audit source. Every agent uses the same exported commit even if main advances later. Start a new batch to audit newer main.

~~~text
%LOCALAPPDATA%\ClinicalBond\audits\<timestamp-random>\
  manifest.json                   Immutable batch identity, commit and hashes
  context.json                    Original Git state, remote check and history
  source.tar                      Original Git archive; never executed
  source\                         Exported pinned source used by agents
  prompts\01-...md through 09-...md Frozen shared contract + specialist prompts
  agents\
    01-frontend-workspace\
      active.lock                 Present only while this agent runs
      success.json                Validated successful attempt and report hash
      <attempt-timestamp-random>\
        invocation.json           Exact executable, arguments and requested model
        prompt.md                 Actual full input (includes reports for Agent 9)
        events.jsonl              Codex progress, completion and usage events
        stderr.log                Codex diagnostics
        report.md                 Agent's complete final Markdown report
        failure.json              Present if this attempt failed
    ...same structure through 09-synthesis...
~~~

Every successful launch prints the report's full path. To find/open the final synthesis:

~~~powershell
$agentFolder = Join-Path $run 'agents\09-synthesis'
$success = Get-Content -LiteralPath (Join-Path $agentFolder 'success.json') -Raw | ConvertFrom-Json
$report = Join-Path (Join-Path $agentFolder $success.attempt) 'report.md'
Get-Content -LiteralPath $report
# Or open the printed report path in Codex Desktop's file viewer.
~~~

-OutputRoot can select another folder **outside the EHR**, for example:

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\audit\Start-EhrAudit.ps1 -Mode Init -OutputRoot 'C:\Users\Logan\Documents\EHR Audits'
~~~

Paths with spaces are supported. Existing ancestor paths are resolved to reject junctions that redirect output into the EHR. Outputs are never silently overwritten or automatically deleted.

## Safety model

1. The EHR is only read by fixed Git inspection/archive commands and file hashing. No application source or Git config is written by the launcher. It never commits, pushes, resets, stashes, cleans, fetches, creates worktrees or changes branches.
2. Audits run in a separate source export, without .git, ignored/untracked files, dependencies, live databases or active .codex/.agents configuration. The archive retains committed content for provenance; active .codex/.agents configuration is excluded from extraction. Clinical paths named audit remain included.
3. Codex receives explicit read-only sandbox permissions and approval policy never. User config and execpolicy rules are ignored; apps, plugins, hooks, browsers, computer use, nested agents and related discovery features are disabled. Web search is disabled. There is no unsafe fallback.
4. The Codex host writes the final report and logs outside the repository. The model does not need write permission for reporting. Normal Codex authentication/runtime files may still be maintained by Codex outside the EHR.
5. The launcher compares HEAD, branch, refs, status and hashes of tracked/non-ignored untracked files before/after each agent. It also checks snapshot/prompt/context hashes. Changes invalidate the attempt; it never rolls back changes. These checks detect drift; the sandbox is the write-prevention boundary. Ignored live data is not included in the drift hash.
6. Agent 9 receives all eight complete reports through stdin, after success-state, batch, commit, prompt and content-hash checks. Partial files, failures and modified reports are refused. Each agent has an exclusive lock; separate specialists can run concurrently.
7. Existing write-producing checks are intentionally unavailable inside audit agents: builds generate .next and may update Next agent files, typecheck may write incremental state, and integration/browser tests may create databases or caches. Agents inspect those tests and report execution as NOT RUN. To obtain fresh execution evidence, run checks separately in an isolated disposable validation copy with synthetic configuration, then review that evidence as a separate activity. Do not run the clinical app or tests against live installation data.
8. Do not use this as HIPAA certification or proof of production clinical safety. Findings must distinguish direct evidence, suspected risks, missing features and external requirements that still need verification.

Read-only OS sandbox support is required for real runs. Doctor/dry-run validate launch construction, not OS enforcement. If Codex cannot initialize its sandbox, fix the installation separately; do not add bypass flags.

Avoid concurrent EHR development while an individual agent is running: legitimate changes will invalidate its report. Across separate invocations, the frozen main snapshot remains the baseline even if your working checkout changes.

## Failures and recovery

- Nonzero Codex exit, timeout, failed/error event, absent final report or implausibly short report produces failure.json and a nonzero launcher exit. Output is retained for diagnosis.
- Defaults: 60 minutes per agent. Override with -TimeoutMinutes 120, for example.
- Failed attempts can be retried using the same command and RunDir. Successful reports are preserved and skipped. The launcher waits for active specialists, then refuses synthesis if any failed.
- An interrupted parent process may leave active.lock. Confirm its Codex process has stopped before manually removing **only that lock in the external batch directory**, or start a new batch. Do not remove a lock for a running agent.
- A changed report/source/prompt/context should trigger a new batch. Do not try to repair hashes or success markers by hand.
- Full event logs can include source excerpts and findings. Keep reports local unless intentionally sharing them.
- A success marker establishes process completion and file integrity; a human still needs to assess report quality.

## Validation

~~~powershell
Set-Location 'C:\Users\Logan\Desktop\EHR'
powershell -NoProfile -ExecutionPolicy Bypass -File .\audit\Start-EhrAudit.ps1 -Mode Test
~~~

Tests use a newly created synthetic Git repository under the Windows temporary directory and a fake Codex executor. They cover pinned export, ignored configuration, paths with spaces, junction rejection, remote failure, synthesis gates, dry runs, failure/retry, lock contention, report tampering, snapshot drift and original-repository drift. Test-only Git initialization/commits affect that fixture only. Fixtures are retained for inspection; the tests do not clean your EHR or consume model usage.

Implementation ownership:
- Start-EhrAudit.ps1 owns Windows parameter forwarding and Node discovery.
- run-audit.mjs owns baseline capture, snapshot export, safety flags, scheduling, report integrity and synthesis gating.
- common.md owns the shared assessment contract; agents/*.md owns each specialist mission.
- run-audit.test.mjs verifies the harness without invoking models or modifying clinical code.

Codex invocation options were checked against local help and [official non-interactive-mode documentation](https://learn.chatgpt.com/docs/non-interactive-mode).


