import { spawn } from 'node:child_process';

const HEAP_FLAGS = '--max-old-space-size=12288 --max-semi-space-size=128';

const env = {
  ...process.env,
  NODE_OPTIONS: process.env.NODE_OPTIONS
    ? `${process.env.NODE_OPTIONS} ${HEAP_FLAGS}`
    : HEAP_FLAGS,
};

console.log('[build.mjs] NODE_OPTIONS =', env.NODE_OPTIONS);

const child = spawn('next', ['build', '--webpack'], {
  env,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (err) => {
  console.error('[build.mjs] failed to spawn next:', err);
  process.exit(1);
});
