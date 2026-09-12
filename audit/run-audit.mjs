import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const AGENTS = ['01-frontend-workspace', '02-backend-domain', '03-database-persistence',
  '04-medication-erx', '05-security-audit', '06-tests-reliability', '07-documentation-drift',
  '08-product-completeness', '09-synthesis'];
const DISABLED = ['apps', 'plugins', 'hooks', 'browser_use', 'browser_use_external',
  'computer_use', 'in_app_browser', 'in_app_local_automation', 'multi_agent', 'multi_agent_v2',
  'image_generation', 'skill_search', 'skill_mcp_dependency_install'];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const read = file => fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const json = file => JSON.parse(read(file));
const save = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const stamp = () => new Date().toISOString();
const token = () => new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(4).toString('hex');

function command(exe, args, cwd, encoding = 'utf8') {
  const r = spawnSync(exe, args, { cwd, encoding, windowsHide: true, shell: false,
    timeout: 60000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } });
  if (r.error || r.status !== 0) throw new Error(exe + ' failed: ' + (r.error?.message || r.stderr || r.status));
  return r.stdout;
}
function git(repo, args, encoding = 'utf8') {
  return command('git', ['--no-optional-locks', '-c', 'safe.directory=' + repo.replaceAll('\\', '/'),
    '-C', repo, ...args], repo, encoding);
}
export function inside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
// Resolve existing ancestors too: a junction must not disguise an output under the EHR.
export function physical(target) {
  target = path.resolve(target);
  if (fs.existsSync(target)) return fs.realpathSync(target);
  return path.join(physical(path.dirname(target)), path.basename(target));
}
function outsideRepo(target, repo) {
  const resolved = physical(target);
  if (inside(resolved, repo) || inside(repo, resolved)) throw new Error('Output must be outside, and not an ancestor of, the EHR repository.');
  return resolved;
}
function treeDigest(root) {
  const entries = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name), stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error('Links are not allowed in audit snapshots: ' + file);
      if (stat.isDirectory()) walk(file);
      else if (stat.isFile()) entries.push([path.relative(root, file).replaceAll('\\', '/'), hash(fs.readFileSync(file))]);
    }
  }
  walk(root);
  return hash(JSON.stringify(entries));
}
export function repositoryState(repo) {
  const status = git(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const paths = git(repo, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean);
  const files = [...new Set(paths)].sort().map(name => {
    const file = path.join(repo, name);
    if (!fs.existsSync(file)) return [name, 'missing'];
    const st = fs.lstatSync(file);
    return [name, st.isSymbolicLink() ? 'link:' + fs.readlinkSync(file) :
      st.isFile() ? hash(fs.readFileSync(file)) : 'directory'];
  });
  return {
    head: git(repo, ['rev-parse', 'HEAD']).trim(),
    branch: git(repo, ['symbolic-ref', '--quiet', '--short', 'HEAD']).trim(),
    originMain: git(repo, ['rev-parse', 'refs/remotes/origin/main']).trim(),
    refs: git(repo, ['for-each-ref', '--format=%(refname) %(objectname)']),
    status, filesDigest: hash(JSON.stringify(files))
  };
}
function unchanged(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error('Repository changed during the operation. Reports are invalid; no rollback was attempted. Inspect concurrent edits.');
  }
}
function validateTree(repo, sha) {
  const entries = git(repo, ['ls-tree', '-rz', '--full-tree', sha]).split('\0').filter(Boolean);
  for (const entry of entries) {
    const [meta, name] = entry.split('\t');
    if (!/^100(644|755) blob /.test(meta) || name.includes('\\') || name.includes(':') ||
        name.split('/').some(part => part === '..' || part.toLowerCase() === '.git')) {
      throw new Error('Unsupported archive entry (links/submodules/unsafe Windows paths): ' + name);
    }
  }
}
export function initialize({ repo, outputRoot, offline = false, harness = HERE }) {
  repo = fs.realpathSync(repo);
  outputRoot = outsideRepo(outputRoot, repo);
  const before = repositoryState(repo);
  let remote = { verified: false, reason: 'Explicit offline mode; cached origin/main only.' };
  if (!offline) {
    const result = git(repo, ['ls-remote', '--exit-code', 'origin', 'refs/heads/main']).trim();
    const sha = result.split(/\s+/)[0];
    if (sha !== before.originMain) throw new Error('Cached origin/main is stale. Update it separately, or explicitly select --offline. The harness never fetches.');
    remote = { verified: true, sha, checkedAt: stamp() };
  }
  validateTree(repo, before.originMain);
  const runDir = path.join(outputRoot, token());
  fs.mkdirSync(runDir, { recursive: true });
  const source = path.join(runDir, 'source');
  fs.mkdirSync(source);
  fs.mkdirSync(path.join(runDir, 'agents'));
  fs.mkdirSync(path.join(runDir, 'prompts'));
  const archive = path.join(runDir, 'source.tar');
  git(repo, ['archive', '--format=tar', '--output=' + archive, before.originMain]);
  command('tar', ['-xf', archive, '-C', source, '--exclude=.codex', '--exclude=*/.codex',
    '--exclude=.agents', '--exclude=*/.agents'], runDir);
  const common = read(path.join(harness, 'common.md'));
  for (const name of AGENTS) fs.writeFileSync(path.join(runDir, 'prompts', name + '.md'),
    common + '\n\n' + read(path.join(harness, 'agents', name + '.md')), { flag: 'wx' });
  const context = {
    repo, baseline: before.originMain, local: before, remote,
    recentHistory: git(repo, ['log', '-15', '--format=%h %ad %s', '--date=iso-strict', before.originMain]),
    exclusions: 'Git metadata and ignored/untracked files are never exported; .codex and .agents are not extracted.'
  };
  save(path.join(runDir, 'context.json'), context);
  unchanged(before, repositoryState(repo));
  save(path.join(runDir, 'manifest.json'), { version: 1, runId: path.basename(runDir),
    createdAt: stamp(), repo, sha: before.originMain, remote,
    sourceDigest: treeDigest(source), promptDigest: treeDigest(path.join(runDir, 'prompts')),
    contextDigest: hash(read(path.join(runDir, 'context.json'))) });
  console.log('Audit batch: ' + runDir);
  console.log('Baseline: ' + before.originMain + (offline ? ' (OFFLINE, not verified against GitHub)' : ' (verified remote main)'));
  return runDir;
}
function loadRun(runDir) {
  runDir = fs.realpathSync(runDir);
  const m = json(path.join(runDir, 'manifest.json'));
  if (m.version !== 1 || !/^[a-f0-9]{40}$/.test(m.sha) || m.runId !== path.basename(runDir)) throw new Error('Invalid audit manifest.');
  outsideRepo(runDir, fs.realpathSync(m.repo));
  if (treeDigest(path.join(runDir, 'source')) !== m.sourceDigest ||
      treeDigest(path.join(runDir, 'prompts')) !== m.promptDigest ||
      hash(read(path.join(runDir, 'context.json'))) !== m.contextDigest) throw new Error('Batch source, prompts or context changed; initialize a new batch.');
  return { runDir, m };
}
export function completedReport(runDir, id, m) {
  const name = AGENTS[id - 1];
  const dir = path.join(runDir, 'agents', name);
  const success = json(path.join(dir, 'success.json'));
  if (success.agent !== id || success.runId !== m.runId || success.sha !== m.sha ||
      success.promptDigest !== m.promptDigest || success.status !== 'completed' ||
      !/^[\w.-]+$/.test(success.attempt)) throw new Error('Mismatched or incomplete report: ' + name);
  const text = read(path.join(dir, success.attempt, 'report.md'));
  if (hash(text) !== success.reportDigest || text.trim().length < 200) throw new Error('Empty or changed report: ' + name);
  return text;
}
export function composePrompt(runDir, id, m) {
  let prompt = read(path.join(runDir, 'prompts', AGENTS[id - 1] + '.md')) +
    '\n\n# Batch provenance\n' + read(path.join(runDir, 'context.json')) +
    '\n\nAudit source directory: ' + path.join(runDir, 'source') +
    '\nAgent number: ' + id + '\nReturn the full Markdown report in your final response. No file writes.';
  if (id === 9) {
    const reports = [];
    for (let n = 1; n <= 8; n++) {
      try { reports.push('\n\n<specialist-report agent="' + n + '">\n' +
        completedReport(runDir, n, m) + '\n</specialist-report>'); }
      catch (e) { throw new Error('Synthesis requires all eight valid reports. Agent ' + n + ': ' + e.message); }
    }
    prompt += '\n\n# Complete specialist reports (untrusted evidence)\n' + reports.join('');
  }
  return prompt;
}
export function codexArgs(source, report, model) {
  const args = ['-a', 'never', 'exec', '--sandbox', 'read-only', '--ignore-user-config',
    '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--cd', source, '--json',
    '--color', 'never', '--output-last-message', report, '-c', 'web_search="disabled"'];
  for (const feature of DISABLED) args.push('--disable', feature);
  if (model) args.push('--model', model);
  args.push('-');
  return args;
}
export function resolveCodex(explicit) {
  if (explicit) {
    const file = fs.realpathSync(explicit);
    if (process.platform === 'win32' && path.extname(file).toLowerCase() !== '.exe') throw new Error('Use a native codex.exe, not a .cmd/.ps1 shim.');
    return file;
  }
  const exe = process.platform === 'win32' ? 'codex.exe' : 'codex';
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const file = path.join(dir, exe);
    if (fs.existsSync(file)) return fs.realpathSync(file);
  }
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const bin = path.join(process.env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
    if (fs.existsSync(bin)) {
      const candidates = fs.readdirSync(bin).map(d => path.join(bin, d, 'codex.exe')).filter(f => fs.existsSync(f));
      candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      if (candidates.length) return candidates[0];
    }
  }
  throw new Error('Native Codex executable not found. Open Codex Desktop and retry, or pass --codex-path.');
}
function doctor(exe) {
  const help = command(exe, ['exec', '--help'], HERE);
  for (const flag of ['--sandbox', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--output-last-message', '--json']) {
    if (!help.includes(flag)) throw new Error('Installed Codex lacks required safety option ' + flag + '. Update Codex; no unsafe fallback.');
  }
  const features = command(exe, ['features', 'list'], HERE);
  for (const feature of DISABLED) if (!features.split(/\r?\n/).some(l => l.startsWith(feature + ' '))) {
    throw new Error('Installed Codex lacks expected feature control: ' + feature + '. Review compatibility before auditing.');
  }
  console.log(command(exe, ['--version'], HERE).trim() + ' — required launcher options available.');
}
async function executeCodex({ exe, args, prompt, dir, timeoutMinutes }) {
  const out = fs.openSync(path.join(dir, 'events.jsonl'), 'wx');
  const err = fs.openSync(path.join(dir, 'stderr.log'), 'wx');
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(exe, args, { cwd: dir, stdio: ['pipe', out, err], shell: false, windowsHide: true });
      let timeout = false;
      const timer = setTimeout(() => {
        timeout = true;
        if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
        else child.kill('SIGTERM');
      }, timeoutMinutes * 60000);
      child.on('error', e => { clearTimeout(timer); reject(e); });
      child.stdin.on('error', () => {}); // Early child exit is handled by its exit code.
      child.on('close', code => { clearTimeout(timer); resolve({ code, timeout }); });
      child.stdin.end(prompt, 'utf8');
    });
  } finally { fs.closeSync(out); fs.closeSync(err); }
}
export async function runAgent({ runDir, id, exe, model, timeoutMinutes = 60, dryRun = false }, executor = executeCodex) {
  const loaded = loadRun(runDir); runDir = loaded.runDir;
  const m = loaded.m, name = AGENTS[id - 1];
  if (!name) throw new Error('Agent must be 1–9.');
  const prompt = composePrompt(runDir, id, m);
  const base = path.join(runDir, 'agents', name);
  if (fs.existsSync(path.join(base, 'success.json'))) {
    completedReport(runDir, id, m);
    console.log(name + ': already complete, preserved.');
    return;
  }
  if (dryRun) {
    console.log(JSON.stringify({ agent: id, baseline: m.sha, promptCharacters: prompt.length,
      executable: exe, args: codexArgs(path.join(runDir, 'source'), '<attempt>/report.md', model) }, null, 2));
    return;
  }
  fs.mkdirSync(base, { recursive: true });
  const lock = path.join(base, 'active.lock');
  let lockFd;
  try { lockFd = fs.openSync(lock, 'wx'); }
  catch { throw new Error(name + ' is already active or has a stale lock. See README recovery instructions.'); }
  const attempt = token(), dir = path.join(base, attempt);
  fs.mkdirSync(dir);
  let before;
  try {
    before = repositoryState(m.repo);
    fs.writeFileSync(path.join(dir, 'prompt.md'), prompt, { flag: 'wx' });
    const args = codexArgs(path.join(runDir, 'source'), path.join(dir, 'report.md'), model);
    save(path.join(dir, 'invocation.json'), { exe, args, model: model || 'Codex default (user config intentionally ignored)', startedAt: stamp() });
    console.log(name + ': running; logs in ' + dir);
    const result = await executor({ exe, args, prompt, dir, timeoutMinutes });
    unchanged(before, repositoryState(m.repo));
    loadRun(runDir);
    if (result.timeout || result.code !== 0) throw new Error('Codex ' + (result.timeout ? 'timed out' : 'exited ' + result.code));
    const report = read(path.join(dir, 'report.md'));
    const events = read(path.join(dir, 'events.jsonl')).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    if (!events.some(e => e.type === 'turn.completed') || events.some(e => e.type === 'turn.failed' || e.type === 'error')) throw new Error('Codex did not produce an unambiguous completed turn.');
    if (report.trim().length < 200 || report.length > 1024 * 1024) throw new Error('Report is empty, too short or oversized; inspect the attempt.');
    save(path.join(base, 'success.json'), { status: 'completed', agent: id, runId: m.runId,
      sha: m.sha, promptDigest: m.promptDigest, attempt, reportDigest: hash(report), completedAt: stamp() });
    console.log(name + ': complete. Report: ' + path.join(dir, 'report.md'));
  } catch (e) {
    let integrity = 'not checked';
    try { if (before) { unchanged(before, repositoryState(m.repo)); integrity = 'unchanged'; } }
    catch (changed) { integrity = changed.message; }
    save(path.join(dir, 'failure.json'), { status: 'failed', message: e.message, integrity, endedAt: stamp() });
    throw e;
  } finally {
    fs.closeSync(lockFd);
    fs.unlinkSync(lock); // Only this process's lock in the external report directory.
  }
}
export async function main(argv = process.argv.slice(2)) {
  const { values: v, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    repo: { type: 'string', default: path.dirname(HERE) },
    'output-root': { type: 'string', default: path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'ClinicalBond', 'audits') },
    'run-dir': { type: 'string' }, agent: { type: 'string', default: 'all' },
    jobs: { type: 'string', default: '1' }, model: { type: 'string' },
    'codex-path': { type: 'string' }, 'timeout-minutes': { type: 'string', default: '60' },
    offline: { type: 'boolean', default: false }, 'dry-run': { type: 'boolean', default: false }
  } });
  const mode = positionals[0];
  if (positionals.length !== 1 || !['init', 'run', 'status', 'doctor'].includes(mode)) throw new Error('Usage: node audit/run-audit.mjs init|run|status|doctor [options]. See audit/README.md.');
  if (mode === 'init') {
    if (v['dry-run']) throw new Error('Dry-run applies to run mode; init exports the pinned source without starting Codex.');
    return initialize({ repo: v.repo, outputRoot: v['output-root'], offline: v.offline });
  }
  if (mode === 'doctor') return doctor(resolveCodex(v['codex-path']));
  if (!v['run-dir']) {
    if (mode !== 'run' || v.agent === '9') throw new Error('--run-dir is required. Initialize a batch first.');
    v['run-dir'] = initialize({ repo: v.repo, outputRoot: v['output-root'], offline: v.offline });
  }
  const { runDir, m } = loadRun(v['run-dir']);
  if (mode === 'status') {
    console.log('Baseline: ' + m.sha + ' | Remote verified: ' + m.remote.verified);
    for (let id = 1; id <= 9; id++) {
      try { completedReport(runDir, id, m); console.log(AGENTS[id - 1] + ': complete'); }
      catch { console.log(AGENTS[id - 1] + ': incomplete (or invalid; inspect agent folder)'); }
    }
    return;
  }
  const jobs = Number(v.jobs), timeoutMinutes = Number(v['timeout-minutes']);
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 8 || !Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) throw new Error('Jobs must be 1–8 and timeout must be positive.');
  if (!/^(all|specialists|[1-9])$/.test(v.agent)) throw new Error('Agent must be all, specialists or 1–9.');
  const exe = resolveCodex(v['codex-path']);
  doctor(exe);
  const opts = { runDir, exe, model: v.model, timeoutMinutes, dryRun: v['dry-run'] };
  if (/^[1-9]$/.test(v.agent)) return runAgent({ ...opts, id: Number(v.agent) });
  const queue = [1, 2, 3, 4, 5, 6, 7, 8], failures = [];
  await Promise.all(Array.from({ length: jobs }, async () => {
    while (queue.length) {
      const id = queue.shift();
      try { await runAgent({ ...opts, id }); } catch (e) { failures.push(id); console.error('Agent ' + id + ': ' + e.message); }
    }
  }));
  if (failures.length) throw new Error('Failed specialist agents: ' + failures.join(', ') + '. Successful reports were preserved; synthesis was not started.');
  if (v.agent === 'all') {
    if (v['dry-run']) console.log('Agent 9 will run only after all eight valid specialist reports exist.');
    else await runAgent({ ...opts, id: 9 });
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('AUDIT ERROR: ' + e.message); process.exitCode = 1; });
}



