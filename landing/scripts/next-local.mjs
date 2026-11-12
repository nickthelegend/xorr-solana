// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
// Run Next in an allowlisted copy: it cannot discover or load the owner's .env.local.
import { cp, mkdir, rm, symlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const target = path.join(root, '.next-local/app');
const command = process.argv[2] || 'build';
if (!['build', 'dev', 'start'].includes(command)) throw new Error('Choose build, dev or start');
await mkdir(target, { recursive: true });
if (command !== 'start') {
  for (const entry of ['src', 'public', 'package.json', 'tsconfig.json', 'next.config.ts', 'postcss.config.mjs']) {
    await rm(path.join(target, entry), { recursive: true, force: true });
    await cp(path.join(root, entry), path.join(target, entry), { recursive: true });
  }
  await rm(path.join(target, 'node_modules'), { force: true, recursive: true });
  await symlink(path.join(root, 'node_modules'), path.join(target, 'node_modules'), 'dir');
}
const env = { ...process.env };
delete env.DATABASE_URL;
if (env.TEST_DATABASE_URL) {
  const url = new URL(env.TEST_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || !url.pathname.startsWith('/xorrpad_') || url.search) throw new Error('Only local xorrpad_ TEST_DATABASE_URL is allowed.');
  env.DATABASE_URL = env.TEST_DATABASE_URL; // Existing waitlist routes cannot reach a hosted DB in this process.
}
const args = [path.join(root, 'node_modules/next/dist/bin/next'), command,
  ...command === 'start' ? [] : ['--webpack'], ...process.argv.slice(3)];
const child = spawn(process.execPath, args, { cwd: target, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code ?? 1; });
