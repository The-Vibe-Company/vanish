import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
}));

const { updateCommand } = await import('../src/commands/update.js');

describe('updateCommand', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.spawn.mockReset();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      throw new Error(`exit ${code}`);
    });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs npm install globally for vanish-cli latest', async () => {
    const child = new EventEmitter();
    mocks.spawn.mockReturnValue(child);

    const result = updateCommand();
    child.emit('close', 0);

    await expect(result).rejects.toThrow('exit 0');
    expect(mocks.spawn).toHaveBeenCalledWith('npm', ['install', '-g', 'vanish-cli@latest'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  });

  it('exits non-zero when npm fails', async () => {
    const child = new EventEmitter();
    mocks.spawn.mockReturnValue(child);

    const result = updateCommand();
    child.emit('close', 2);

    await expect(result).rejects.toThrow('exit 2');
  });

  it('exits with an error when npm cannot be started', async () => {
    const child = new EventEmitter();
    mocks.spawn.mockReturnValue(child);

    const result = updateCommand();
    child.emit('error', new Error('missing npm'));

    await expect(result).rejects.toThrow('exit 1');
    expect(errorSpy).toHaveBeenCalledWith('Failed to start npm: missing npm');
  });
});
