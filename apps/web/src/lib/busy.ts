/**
 * App-wide "something is loading" state. Each piece of work holds a slot
 * while it runs; the page shows the hourglass cursor while any slot is held,
 * so overlapping requests don't clear each other's cursor.
 *
 * The flag lives on `<html data-busy>` and the cursor itself is CSS in
 * `app/providers.tsx`, so nothing has to re-render to show it.
 */

let active = 0;

const sync = () =>
  document.documentElement.toggleAttribute('data-busy', active > 0);

/** Marks the app busy until the returned function is called (once). */
export function startBusy(): () => void {
  active += 1;
  sync();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    active -= 1;
    sync();
  };
}

/** Shows the hourglass while `work` runs, whether it resolves or rejects. */
export async function trackBusy<T>(work: () => Promise<T>): Promise<T> {
  const end = startBusy();
  try {
    return await work();
  } finally {
    end();
  }
}
