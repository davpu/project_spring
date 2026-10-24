import { startBusy, trackBusy } from './busy';

const isBusy = () => document.documentElement.hasAttribute('data-busy');

describe('busy cursor state', () => {
  it('stays busy until every overlapping task has finished', () => {
    const endFirst = startBusy();
    const endSecond = startBusy();
    expect(isBusy()).toBe(true);

    endFirst();
    endFirst(); // ending twice must not release someone else's slot
    expect(isBusy()).toBe(true);

    endSecond();
    expect(isBusy()).toBe(false);
  });

  it('clears after the tracked work rejects', async () => {
    const work = trackBusy(() => Promise.reject(new Error('offline')));
    expect(isBusy()).toBe(true);
    await expect(work).rejects.toThrow('offline');
    expect(isBusy()).toBe(false);
  });
});
