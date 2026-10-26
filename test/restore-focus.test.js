const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dictation-pad-test-'));
  const prevApp = path.join(dir, 'prev-app');
  const log = path.join(dir, 'osascript.log');
  const bin = path.join(dir, 'bin');
  const port = 20000 + Math.floor(Math.random() * 20000);
  fs.mkdirSync(bin);
  const stub = path.join(bin, 'osascript');
  fs.writeFileSync(stub, '#!/bin/sh\nprintf "%s" "$2" > "$OSASCRIPT_LOG"\n');
  fs.chmodSync(stub, 0o755);
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'stt-push-server.js')], {
    env: { ...process.env, PORT: String(port), DICTATION_PAD_PREV_APP_FILE: prevApp, OSASCRIPT_LOG: log, PATH: `${bin}:${process.env.PATH}` },
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}/restore-focus`;
  try {
    let response;
    for (let i = 0; i < 50; i++) {
      try { response = await fetch(url); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(response, 'server should start and route should respond');
    assert.deepEqual(await response.json(), { state: 'skipped' }, 'missing app file should be harmless');
    fs.writeFileSync(prevApp, '');
    response = await fetch(url);
    assert.deepEqual(await response.json(), { state: 'skipped' }, 'empty app file should be harmless');
    fs.writeFileSync(prevApp, 'Safari"; do bad things');
    response = await fetch(url);
    assert.deepEqual(await response.json(), { state: 'restored' });
    assert.equal(fs.readFileSync(log, 'utf8'), 'tell application "System Events" to set frontmost of process "Safari do bad things" to true');
    fs.writeFileSync(prevApp, 'Google Chrome');
    response = await fetch(url);
    assert.deepEqual(await response.json(), { state: 'skipped' }, 'pad Chrome must never be restored as the previous app');
    fs.writeFileSync(prevApp, 'osascript');
    response = await fetch(url);
    assert.deepEqual(await response.json(), { state: 'skipped' }, 'osascript must never be restored as the previous app');
    assert.equal(fs.readFileSync(log, 'utf8'), 'tell application "System Events" to set frontmost of process "Safari do bad things" to true', 'skipped targets must not invoke osascript');
    console.log('restore-focus.test.js: PASS (route, app sanitization, empty/missing file, Chrome/osascript guards)');
  } finally {
    server.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
