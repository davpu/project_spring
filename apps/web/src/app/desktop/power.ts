/**
 * Browser side effects behind the Shut Down dialog, kept here so tests can
 * mock them.
 */

const BOOT_FLAG = 'spring:boot';

/** Reloads the page and asks the next load to play the boot sequence. */
export function restart() {
  try {
    sessionStorage.setItem(BOOT_FLAG, '1');
  } catch {
    // Storage blocked: reload anyway, just without the boot screen.
  }
  window.location.reload();
}

let bootRequested: boolean | undefined;

/**
 * Whether this page load came from `restart()`. The flag is cleared on first
 * read so a normal reload doesn't replay the boot, and the answer is kept for
 * the rest of the page load so StrictMode's double render sees it too.
 */
export function wasBootRequested(): boolean {
  if (bootRequested === undefined) {
    try {
      bootRequested = sessionStorage.getItem(BOOT_FLAG) !== null;
      sessionStorage.removeItem(BOOT_FLAG);
    } catch {
      bootRequested = false;
    }
  }
  return bootRequested;
}

/**
 * Tries to close the tab. Browsers only allow it for tabs opened by script
 * (or with no history), so callers must handle the tab staying open.
 */
export function closeTab() {
  window.close();
}
