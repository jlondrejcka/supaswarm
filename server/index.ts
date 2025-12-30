import { spawn } from 'child_process';

const next = spawn('npx', ['next', 'dev', '-p', '3000'], {
  stdio: 'inherit',
  shell: true
});

next.on('close', (code) => {
  process.exit(code || 0);
});
