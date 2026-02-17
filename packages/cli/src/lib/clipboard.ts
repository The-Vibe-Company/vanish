import { execSync } from 'node:child_process';
import { platform } from 'node:os';

/**
 * Copy text to system clipboard using native commands.
 * Fails silently if clipboard is not available (e.g., headless server).
 */
export function copyToClipboard(text: string): boolean {
  try {
    const os = platform();
    if (os === 'darwin') {
      execSync('pbcopy', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
    } else if (os === 'linux') {
      // Try xclip first, then xsel, then wl-copy (Wayland)
      try {
        execSync('xclip -selection clipboard', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
      } catch {
        try {
          execSync('xsel --clipboard --input', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
        } catch {
          execSync('wl-copy', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
        }
      }
    } else if (os === 'win32') {
      execSync('clip', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
    } else {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
