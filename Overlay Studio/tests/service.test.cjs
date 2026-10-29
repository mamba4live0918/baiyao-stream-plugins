'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createStudio } = require('../electron/service.cjs');
const HTML = '<!doctype html><html><head><title>First</title></head><body>First</body></html>';
const NEXT = '<!doctype html><html><head><title>Next</title></head><body>Next</body></html>';
const skillDir = path.resolve(__dirname, '../resources/build-live-overlay-games');

async function fixture(t, behavior) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'overlay-studio-test-'));
  const calls = [];
  const spawnImpl = (file, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.kill = () => { child.emit('close', null, 'SIGTERM'); return true; };
    const call = { file, args, options, child, input: '' }; calls.push(call);
    child.stdin.on('data', chunk => { call.input += chunk; });
    setImmediate(async () => {
      try {
        if (args.includes('--version')) { child.stdout.end('codex-cli 0.163.0'); child.emit('close', 0); }
        else if (args[0] === 'login') { child.stderr.end('Logged in using ChatGPT'); child.emit('close', 0); }
        else if (behavior) await behavior(call);
      } catch (error) { child.emit('error', error); }
    });
    return child;
  };
  const options = { root, skillDir, codexPath: process.execPath, spawnImpl };
  const service = await createStudio(options);
  t.after(async () => { await service.dispose(); await fs.rm(root, { recursive: true, force: true }); });
  return { root, calls, service, options, invoke: service.invoke };
}
async function waitDone(invoke) {
  for (let n = 0; n < 200; n++) {
    const job = await invoke('jobs.current');
    if (job && job.state !== 'running') return job;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Job did not finish');
}
async function output(call, html, exitCode = 0) {
  await fs.writeFile(path.join(call.options.cwd, 'index.html'), html);
  call.child.emit('close', exitCode);
}

test('imports persist across service restart, and invalid identifiers cannot reach outside data', async t => {
  const f = await fixture(t);
  const p = await f.invoke('projects.import', { name: '测试插件', html: HTML });
  assert.equal(p.html, HTML); assert.equal(p.status, 'ready'); assert.equal(p.versions, 0);
  const restarted = await createStudio(f.options); t.after(() => restarted.dispose());
  assert.equal((await restarted.invoke('projects.get', { id: p.id })).html, HTML);
  for (const id of ['../outside', '..\\outside', 'C:\\outside', '', 'constructor']) {
    await assert.rejects(f.invoke('projects.get', { id }), /invalid|无效/i);
  }
  assert.equal((await f.invoke('projects.list')).length, 1);
});

test('rejects incomplete HTML, excessive imports and invalid project fields before writing projects', async t => {
  const f = await fixture(t);
  for (const html of ['', '<div>Fragment</div>', '<html><body>Unclosed', HTML + '\0']) {
    await assert.rejects(f.invoke('projects.import', { name: 'Bad', html }));
  }
  await assert.rejects(f.invoke('projects.import', { name: 'Huge', html: HTML + ' '.repeat(20 * 1024 * 1024) }), /large|20|大小/i);
  await assert.rejects(f.invoke('projects.create', { name: 'Bad', width: -1, height: 1080 }));
  assert.deepEqual(await f.invoke('projects.list'), []);
});

test('successful isolated generation commits a revision; restore preserves the replaced HTML', async t => {
  const f = await fixture(t, call => output(call, NEXT));
  const p = await f.invoke('projects.import', { name: 'Demo', html: HTML });
  const job = await f.invoke('jobs.start', { projectId: p.id, instruction: 'change title' });
  assert.equal(job.state, 'running');
  assert.equal((await waitDone(f.invoke)).state, 'completed');
  const updated = await f.invoke('projects.get', { id: p.id });
  assert.equal(updated.html, NEXT); assert.equal(updated.versions, 1);
  const restored = await f.invoke('projects.restore', { id: p.id, versionId: updated.history[0].id });
  assert.equal(restored.html, HTML); assert.equal(restored.versions, 2);
  const restoredNext = await f.invoke('projects.restore', { id: p.id, versionId: restored.history[0].id });
  assert.equal(restoredNext.html, NEXT);
  const call = f.calls.find(c => c.args.includes('exec'));
  assert.equal(call.options.shell, false); assert.equal(call.options.windowsHide, true);
  assert.deepEqual(call.args.slice(0, 3), ['-a', 'never', 'exec']);
  assert.equal(call.args[call.args.indexOf('--sandbox') + 1], 'workspace-write');
  assert.ok(call.options.cwd.startsWith(path.join(f.root, 'jobs') + path.sep));
  assert.ok(call.input.includes('change title')); assert.ok(call.input.includes('index.html'));
  assert.ok(!call.args.some(a => a.includes('dangerously')));
});

test('failed and malformed outputs preserve last good revision', async t => {
  for (const [html, code] of [[NEXT, 1], ['bad html', 0], ['', 0]]) {
    const f = await fixture(t, call => output(call, html, code));
    const p = await f.invoke('projects.import', { name: 'Demo', html: HTML });
    await f.invoke('jobs.start', { projectId: p.id });
    assert.equal((await waitDone(f.invoke)).state, 'failed');
    const after = await f.invoke('projects.get', { id: p.id });
    assert.equal(after.html, HTML); assert.equal(after.versions, 0);
  }
});

test('cancellation and duplicate job protection prevent partial artifact promotion', async t => {
  let active;
  const f = await fixture(t, async call => { active = call; await fs.writeFile(path.join(call.options.cwd, 'index.html'), NEXT); });
  const p = await f.invoke('projects.import', { name: 'Demo', html: HTML });
  await f.invoke('jobs.start', { projectId: p.id });
  await assert.rejects(f.invoke('jobs.start', { projectId: p.id }), /active|running|正在/i);
  for (let i = 0; !active && i < 100; i++) await new Promise(r => setTimeout(r, 10));
  assert.ok(active);
  assert.equal((await f.invoke('jobs.cancel')).state, 'cancelled');
  active.child.emit('close', 0);
  assert.equal((await f.invoke('projects.get', { id: p.id })).html, HTML);
  assert.equal((await f.invoke('jobs.current')).state, 'cancelled');
});

test('JSONL chunk parsing shows assistant progress but redacts credentials and suppresses raw commands', async t => {
  const f = await fixture(t, async call => {
    const messages = [
      { type: 'item.completed', item: { type: 'agent_message', text: 'Working on physics sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456' } },
      { type: 'item.completed', item: { type: 'command_execution', command: 'secret-command', aggregated_output: 'secret-output' } }
    ].map(x => JSON.stringify(x)).join('\n') + '\n';
    call.child.stdout.write(messages.slice(0, 31)); call.child.stdout.write(messages.slice(31));
    call.child.stderr.write('Authorization: Bearer SUPERSECRET123456789\n');
    call.child.stdout.write('x'.repeat(300000) + '\n');
    await output(call, NEXT);
  });
  const p = await f.invoke('projects.import', { name: 'Demo', html: HTML });
  await f.invoke('jobs.start', { projectId: p.id });
  const job = await waitDone(f.invoke);
  const logs = JSON.stringify(job.logs);
  assert.match(logs, /Working on physics/);
  assert.doesNotMatch(logs, /ABCDEFGHIJKLMNOPQRSTUVWXYZ|SUPERSECRET|secret-command|secret-output/);
  assert.ok(logs.length < 100000);
});

test('rejects linked managed project directories', async t => {
  const f = await fixture(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'overlay-studio-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  const p = await f.invoke('projects.import', { name: 'Demo', html: HTML });
  const projectDir = path.join(f.root, 'projects', p.id);
  await fs.rm(projectDir, { recursive: true, force: true });
  await fs.symlink(outside, projectDir, 'junction');
  await assert.rejects(f.invoke('projects.get', { id: p.id }), /link|outside|链接|路径/i);
  assert.deepEqual(await fs.readdir(outside), []);
});

test('drafts save validated fields and refuse export until there is an HTML artifact', async t => {
  const f = await fixture(t);
  const p = await f.invoke('projects.create', { name: 'Draft', brief: 'one', width: 1080, height: 1920, style: 'pixel' });
  assert.equal(p.hasHtml, false); assert.equal(p.status, 'draft'); assert.equal(p.html, '');
  await assert.rejects(f.invoke('projects.export', { id: p.id }));
  const saved = await f.invoke('projects.save', { id: p.id, name: 'Changed', brief: 'two', width: 1920, height: 1080, style: 'flat' });
  assert.equal(saved.name, 'Changed'); assert.equal(saved.width, 1920); assert.equal(saved.brief, 'two');
  await assert.rejects(f.invoke('projects.save', { id: p.id, name: '' }));
  assert.equal((await f.invoke('projects.get', { id: p.id })).name, 'Changed');
  await assert.rejects(f.invoke('readFile', { path: 'anything' }));
});

test('exit success without a generated file and turn.failed both fail safely', async t => {
  for (const behavior of [call => call.child.emit('close', 0), async call => {
    call.child.stdout.write(JSON.stringify({ type: 'turn.failed', error: { message: 'Quota exceeded' } }) + '\n');
    await output(call, NEXT);
  }]) {
    const f = await fixture(t, behavior);
    const p = await f.invoke('projects.create', { name: 'Draft' });
    await f.invoke('jobs.start', { projectId: p.id });
    assert.equal((await waitDone(f.invoke)).state, 'failed');
    assert.equal((await f.invoke('projects.get', { id: p.id })).hasHtml, false);
  }
});

test('iteration begins with last artifact and rejects hard-linked replacement output', async t => {
  let copiedInput;
  const f = await fixture(t, async call => {
    const file = path.join(call.options.cwd, 'index.html');
    copiedInput = await fs.readFile(file, 'utf8');
    await fs.unlink(file);
    await fs.link(outsideFile, file);
    call.child.emit('close', 0);
  });
  const outsideFile = path.join(f.root, 'outside.html');
  await fs.writeFile(outsideFile, NEXT);
  const p = await f.invoke('projects.import', { name: 'Demo', html: HTML });
  await f.invoke('jobs.start', { projectId: p.id });
  assert.equal((await waitDone(f.invoke)).state, 'failed');
  assert.equal(copiedInput, HTML);
  assert.equal((await f.invoke('projects.get', { id: p.id })).html, HTML);
  assert.equal(await fs.readFile(outsideFile, 'utf8'), NEXT);
});

test('settings persist executable choice and clearing the path returns to autodetection', async t => {
  const f = await fixture(t);
  await f.invoke('settings.save', { codexPath: process.execPath });
  const second = await createStudio({ ...f.options, codexPath: '' }); t.after(() => second.dispose());
  assert.equal((await second.invoke('bootstrap')).settings.codexPath, process.execPath);
  await assert.rejects(f.invoke('settings.save', { codexPath: 'relative.exe' }));
  const cleared=await f.invoke('settings.save', { codexPath: '' });
  assert.equal(cleared.codexPath,'');
  assert.equal(cleared.engine,'codex');
});

test('cancelling immediately prevents spawn and preserves saved artifact', async t => {
  const f = await fixture(t, call => output(call, NEXT));
  const p = await f.invoke('projects.import', { name: 'Demo', html: HTML });
  await f.invoke('jobs.start', { projectId: p.id });
  await f.invoke('jobs.cancel');
  await f.service.dispose();
  assert.equal(f.calls.filter(call => call.args.includes('exec')).length, 0);
  const next = await createStudio(f.options); t.after(() => next.dispose());
  assert.equal((await next.invoke('projects.get', { id: p.id })).html, HTML);
});

test('malformed outer document text cannot masquerade as HTML inside a quoted string', async t => {
  const f = await fixture(t);
  await assert.rejects(f.invoke('projects.import', { name: 'Bad', html: 'garbage "<html><body>oops</body></html>"' }));
});

test('iteration that exits successfully without changing the artifact is reported as incomplete', async t => {
  const f = await fixture(t, call => call.child.emit('close', 0));
  const p = await f.invoke('projects.import', { name: 'Demo', html: HTML });
  await f.invoke('jobs.start', { projectId: p.id });
  assert.equal((await waitDone(f.invoke)).state, 'failed');
  const after = await f.invoke('projects.get', { id: p.id });
  assert.equal(after.html, HTML); assert.equal(after.versions, 0);
});

test('isolated job includes the bundled starter and referenced skill files for Codex to reuse', async t => {
  let included = false;
  const f = await fixture(t, async call => {
    const bundled = path.join(call.options.cwd, '.overlay-skill');
    const starter = await fs.readFile(path.join(bundled, 'assets', 'overlay-starter.html'), 'utf8');
    const rules = await fs.readFile(path.join(bundled, 'references', 'runtime-contract.md'), 'utf8');
    included = /<html/i.test(starter) && rules.length > 100 && call.input.includes('.overlay-skill');
    await output(call, NEXT);
  });
  const p = await f.invoke('projects.create', { name: 'New' });
  await f.invoke('jobs.start', { projectId: p.id });
  assert.equal((await waitDone(f.invoke)).state, 'completed');
  assert.equal(included, true);
});

test('benign stderr warnings stay out of progress while failed process diagnostics are bounded and redacted', async t => {
  const f = await fixture(t, async call => {
    call.child.stderr.write('2026-10-19 WARN codex_core::skills: invalid icon path C:\\private\\skills\\icon.svg\n');
    call.child.stderr.write('WARN shell snapshot unavailable for PowerShell\n');
    call.child.stderr.write('Connection failed: Authorization: Bearer SUPERSECRET123456789\n');
    await output(call, NEXT, 1);
  });
  const p = await f.invoke('projects.create', { name: 'New' });
  await f.invoke('jobs.start', { projectId: p.id });
  const job = await waitDone(f.invoke);
  assert.equal(job.state, 'failed');
  const logs = JSON.stringify(job.logs);
  assert.doesNotMatch(logs, /invalid icon|PowerShell|SUPERSECRET|private/);
  assert.match(logs, /Connection failed/);
});

test('bundled seed, rules and status expose actual local resources without starting a model job', async t => {
  const f = await fixture(t);
  const seeded = await f.invoke('projects.seed', { template: 'starter' });
  assert.match(seeded.html, /<html/i);
  const rules = await f.invoke('rules.read');
  assert.match(rules.content, /overlay/i); assert.ok(rules.sections.length >= 3);
  const boot = await f.invoke('bootstrap');
  assert.equal(boot.status.available, true); assert.equal(boot.status.loggedIn, true);
  assert.match(boot.status.version, /0.163/); assert.equal(boot.job, null);
  assert.equal(f.calls.filter(c => c.args.includes('exec')).length, 0);
});
