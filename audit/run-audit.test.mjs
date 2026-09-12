import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { AGENTS, initialize, runAgent, composePrompt, completedReport, repositoryState, codexArgs, physical, inside } from './run-audit.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ehr-audit-test-'));
const repo = path.join(root, 'fixture repo with spaces');
fs.mkdirSync(repo);
function git(...args) {
  const r = spawnSync('git', ['-c', 'safe.directory=' + repo.replaceAll('\\', '/'), '-C', repo, ...args],
    { encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
// Git mutations below apply ONLY to this new synthetic fixture, never the user's EHR.
git('init', '-b', 'main');
fs.writeFileSync(path.join(repo, 'app.txt'), 'Synthetic application fixture\n');
fs.mkdirSync(path.join(repo, '.codex'));
fs.writeFileSync(path.join(repo, '.codex', 'config.toml'), '# Must not activate in snapshot\n');
fs.mkdirSync(path.join(repo, 'app', 'api', 'audit'), { recursive: true });
fs.writeFileSync(path.join(repo, 'app', 'api', 'audit', 'route.ts'), 'export const auditRoute = true;');
git('add', '.');
git('-c', 'user.name=Audit Test', '-c', 'user.email=audit@example.invalid', 'commit', '-m', 'fixture');
git('update-ref', 'refs/remotes/origin/main', 'HEAD');
const initial = repositoryState(repo);
const runDir = initialize({ repo, outputRoot: path.join(root, 'outputs with spaces'), offline: true });
const manifest = () => JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8'));
const fake = async ({ args, prompt, dir }) => {
  assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
  assert.deepEqual(args.slice(0, 3), ['-a', 'never', 'exec']);
  assert.ok(args.includes('--ignore-user-config'));
  assert.ok(args.includes('--ignore-rules'));
  assert.ok(!args.includes('--add-dir'));
  const report = '# Synthetic report\n\n' + prompt.slice(0, 350) + '\nEvidence: app.txt:1\n';
  fs.writeFileSync(path.join(dir, 'report.md'), report);
  fs.writeFileSync(path.join(dir, 'events.jsonl'), '{"type":"turn.completed"}\n');
  return { code: 0, timeout: false };
};
test('exports pinned main, excludes active project config, records offline provenance', () => {
  assert.equal(manifest().sha, initial.originMain);
  assert.equal(manifest().remote.verified, false);
  assert.equal(fs.existsSync(path.join(runDir, 'source', '.codex')), false);
  assert.equal(fs.existsSync(path.join(runDir, 'source', '.git')), false);
  assert.equal(fs.existsSync(path.join(runDir, 'source', 'app', 'api', 'audit', 'route.ts')), true);
  assert.equal(fs.readFileSync(path.join(runDir, 'source', 'app.txt'), 'utf8').trim(), git('show', 'HEAD:app.txt'));
  assert.deepEqual(repositoryState(repo), initial);
});
test('output inside repo is rejected without writes', () => {
  assert.throws(() => initialize({ repo, outputRoot: path.join(repo, 'reports'), offline: true }), /outside/);
  assert.equal(fs.existsSync(path.join(repo, 'reports')), false);
});
test('output junction into repository cannot bypass protection', () => {
  const junction = path.join(root, 'redirect');
  fs.symlinkSync(repo, junction, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(inside(physical(path.join(junction, 'nested')), fs.realpathSync(repo)), true);
  assert.throws(() => initialize({ repo, outputRoot: path.join(junction, 'reports'), offline: true }), /outside/);
});
test('live remote verification fails closed when no remote is configured', () => {
  assert.throws(() => initialize({ repo, outputRoot: path.join(root, 'new') }), /failed/);
  assert.equal(fs.existsSync(path.join(root, 'new')), false);
});
test('synthesis rejects absent reports', () => {
  assert.throws(() => composePrompt(runDir, 9, manifest()), /requires all eight/);
});
test('dry run does not invoke executor or write report artifacts', async () => {
  await runAgent({ runDir, id: 1, exe: 'fake.exe', dryRun: true }, () => assert.fail('must not execute'));
  assert.equal(fs.readdirSync(path.join(runDir, 'agents')).length, 0);
});
test('failed process leaves evidence, releases lock and permits retry', async () => {
  await assert.rejects(runAgent({ runDir, id: 1, exe: 'fake.exe' }, async () => ({ code: 7 })), /exited 7/);
  const base = path.join(runDir, 'agents', AGENTS[0]);
  assert.equal(fs.existsSync(path.join(base, 'success.json')), false);
  assert.equal(fs.existsSync(path.join(base, 'active.lock')), false);
  assert.equal(fs.readdirSync(base).length, 1);
  await runAgent({ runDir, id: 1, exe: 'fake.exe' }, fake);
  assert.ok(completedReport(runDir, 1, manifest()).includes('Synthetic report'));
  assert.equal(fs.readdirSync(base).filter(n => fs.statSync(path.join(base, n)).isDirectory()).length, 2);
});
test('successful reports are preserved on rerun', async () => {
  await runAgent({ runDir, id: 1, exe: 'fake.exe' }, () => assert.fail('must skip completed'));
});
test('lock prevents concurrent writes to same agent', async () => {
  const base = path.join(runDir, 'agents', AGENTS[1]);
  fs.mkdirSync(base);
  fs.writeFileSync(path.join(base, 'active.lock'), 'test');
  await assert.rejects(runAgent({ runDir, id: 2, exe: 'fake.exe' }, fake), /active/);
  fs.unlinkSync(path.join(base, 'active.lock'));
});
test('zero exit with failed turn is not accepted', async () => {
  await assert.rejects(runAgent({ runDir, id: 2, exe: 'fake.exe' }, async opts => {
    await fake(opts);
    fs.writeFileSync(path.join(opts.dir, 'events.jsonl'), '{"type":"turn.failed"}\n');
    return { code: 0 };
  }), /completed turn/);
});
test('all eight reports are embedded fully and synthesis runs last', async () => {
  for (let id = 2; id <= 8; id++) await runAgent({ runDir, id, exe: 'fake.exe' }, fake);
  const prompt = composePrompt(runDir, 9, manifest());
  for (let id = 1; id <= 8; id++) assert.ok(prompt.includes(completedReport(runDir, id, manifest())));
  await runAgent({ runDir, id: 9, exe: 'fake.exe' }, fake);
  assert.ok(completedReport(runDir, 9, manifest()));
});
test('changed report and mismatched manifest provenance are rejected', () => {
  const base = path.join(runDir, 'agents', AGENTS[0]);
  const successFile = path.join(base, 'success.json');
  const successText = fs.readFileSync(successFile, 'utf8'), success = JSON.parse(successText);
  const reportFile = path.join(base, success.attempt, 'report.md');
  const report = fs.readFileSync(reportFile, 'utf8');
  fs.appendFileSync(reportFile, '\nTampered');
  assert.throws(() => composePrompt(runDir, 9, manifest()), /changed report/);
  fs.writeFileSync(reportFile, report);
  fs.writeFileSync(successFile, JSON.stringify({ ...success, sha: '0'.repeat(40) }));
  assert.throws(() => composePrompt(runDir, 9, manifest()), /Mismatched/);
  fs.writeFileSync(successFile, successText);
});
test('changed snapshot is rejected before invoking Codex', async () => {
  const file = path.join(runDir, 'source', 'app.txt'), original = fs.readFileSync(file);
  fs.appendFileSync(file, 'modified');
  await assert.rejects(runAgent({ runDir, id: 3, exe: 'fake.exe' }, fake), /changed/);
  fs.writeFileSync(file, original);
});
test('original repository changes during execution invalidate report', async () => {
  const another = initialize({ repo, outputRoot: path.join(root, 'drift'), offline: true });
  const file = path.join(repo, 'app.txt'), original = fs.readFileSync(file);
  await assert.rejects(runAgent({ runDir: another, id: 1, exe: 'fake.exe' }, async opts => {
    fs.appendFileSync(file, 'concurrent synthetic edit');
    return fake(opts);
  }), /Repository changed/);
  assert.equal(fs.existsSync(path.join(another, 'agents', AGENTS[0], 'success.json')), false);
  fs.writeFileSync(file, original);
});
test('arguments preserve spaces and do not expose a shell escape hatch', () => {
  const args = codexArgs('C:\\source with spaces', 'C:\\report with spaces.md', 'chosen-model');
  assert.ok(args.includes('C:\\source with spaces'));
  assert.ok(args.includes('C:\\report with spaces.md'));
  assert.equal(args[args.indexOf('--model') + 1], 'chosen-model');
  assert.ok(!args.includes('--dangerously-bypass-approvals-and-sandbox'));
});
test('fixture application bytes, status, refs and HEAD remain unchanged', () => {
  assert.deepEqual(repositoryState(repo), initial);
  console.log('Synthetic fixtures retained at: ' + root);
});



