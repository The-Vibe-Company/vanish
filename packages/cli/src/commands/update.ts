import { spawn } from 'node:child_process';

export async function updateCommand(): Promise<void> {
  const child = spawn('npm', ['install', '-g', 'vanish-cli@latest'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  const code = await new Promise<number>((resolve) => {
    child.on('error', (err) => {
      console.error(`Failed to start npm: ${err.message}`);
      resolve(1);
    });
    child.on('close', (exitCode) => resolve(exitCode ?? 1));
  });

  process.exit(code);
}
