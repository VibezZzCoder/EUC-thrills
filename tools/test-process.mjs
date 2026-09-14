/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

/** One lock shared by the runner's copies. A busy lock refuses, never queues
 * another heavy job invisibly. Only a confirmed dead owner's lock is reclaimed. */
export function acquireLock(path, label) {
  const guard = `${path}.claim`;
  try { mkdirSync(guard); } catch (e) {
    if (e.code === 'EEXIST') throw new Error(`Another runner is claiming the validation lock, or an interrupted claim needs inspection: ${guard}`);
    throw e;
  }
  try {
  function take() { mkdirSync(path); }
  try { take(); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner;
    try { owner = JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8')); }
    catch { throw new Error(`Validation lock is being created or needs inspection: ${path}`); }
    if (!Number.isInteger(owner.pid) || owner.pid <= 0) throw new Error(`Invalid validation lock: ${path}`);
    let alive = true;
    try { process.kill(owner.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
    if (alive) throw new Error(`Validation is already running (PID ${owner.pid}, ${owner.label}). Ask its coordinator to schedule this scope after that job.`);
    // Never reclaim a lock if a previous supervised child is still alive.
    if (owner.childPid) {
      try { process.kill(process.platform === 'win32' ? owner.childPid : -owner.childPid, 0); throw new Error(`An owned process group is still running (leader ${owner.childPid}); inspect it before reclaiming ${path}.`); }
      catch (e) { if (e.code !== 'ESRCH') throw e; }
    }
    rmSync(path, { recursive: true });
    take();
  }
  const owner = { pid: process.pid, label, startedAt: new Date().toISOString() };
  const save = () => writeFileSync(join(path, 'owner.json'), JSON.stringify(owner));
  save();
  return {
    child(pid) { owner.childPid = pid; save(); },
    release() {
      if (!existsSync(path)) return;
      const current = JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8'));
      if (current.pid === process.pid) rmSync(path, { recursive: true });
    },
  };
  } finally { rmSync(guard, { recursive: true }); }
}

/** Stream output and preserve the actual exit code. On timeout, interruption,
 * or normal parent exit, terminate only this command's process group. */
export async function runCommand(command, args, {
  cwd, env = process.env, timeoutMs, logPath, onSpawn = () => {}, quiet = false,
}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('A positive command timeout is required.');
  // Open before spawn: an unwritable log must not strand a child. Synchronous
  // writes also make log failures observable without an unhandled stream error.
  const log = openSync(logPath, 'w');
  const started = Date.now();
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let reason = null;
    let result = { code: 1, signal: null };
    let finishing = false;
    let escalation;
    let fallback;
    const write = (data) => {
      try { writeSync(log, data); } catch { result.code = 1; stop('log-error'); }
    };
    const kill = (signal) => {
      if (!child.pid) return;
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal); }
      catch (e) { if (e.code !== 'ESRCH' && !quiet) process.stderr.write(`cleanup: ${e.message}\n`); }
    };
    const stop = (why) => {
      reason ??= why;
      kill('SIGTERM');
      escalation ??= setTimeout(() => kill('SIGKILL'), 1500);
      fallback ??= setTimeout(finish, 3000);
    };
    const interrupt = () => stop('interrupted');
    const parentExit = () => kill('SIGKILL');
    const timer = setTimeout(() => stop('timeout'), timeoutMs);
    const pulse = setInterval(() => {
      const message = `[validation] still running (${Math.round((Date.now() - started) / 1000)}s); ${logPath}\n`;
      write(message);
      if (!quiet) process.stderr.write(message);
    }, 30_000);
    function finish() {
      if (finishing) return;
      finishing = true;
      clearTimeout(timer); clearInterval(pulse); clearTimeout(escalation); clearTimeout(fallback);
      process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
      process.off('exit', parentExit);
      kill('SIGKILL');
      closeSync(log);
      resolve({ ...result, code: reason === 'timeout' ? 124 : reason === 'interrupted' ? 130 : reason ? 1 : result.code, reason, durationMs: Date.now() - started });
    }
    process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
    process.on('exit', parentExit);
    child.on('spawn', () => { try { onSpawn(child.pid); } catch (e) { write(`${e.message}\n`); stop('spawn-callback-error'); } });
    child.stdout.on('data', (data) => { if (!finishing) write(data); if (!quiet) process.stdout.write(data); });
    child.stderr.on('data', (data) => { if (!finishing) write(data); if (!quiet) process.stderr.write(data); });
    child.once('error', (error) => { write(`${error.message}\n`); result = { code: 1, signal: null }; finish(); });
    child.once('exit', (code, signal) => {
      result = { code: code ?? 1, signal };
      // A child may have left descendants holding the output pipe open.
      kill('SIGTERM');
      escalation ??= setTimeout(() => kill('SIGKILL'), 1500);
      fallback ??= setTimeout(finish, 3000);
    });
    child.once('close', finish);
  });
}
