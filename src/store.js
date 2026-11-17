'use strict';

const { createDefaultState } = require('./defaults');

// Holds the site state in memory and writes every change through a storage backend.
// Writes are queued so concurrent requests cannot interleave.
// A backend with alwaysReload set is re-read before every change, because other server instances may write too.
function createStore(backend) {
  let state = null;
  let writeQueue = Promise.resolve();

  async function load() {
    let loaded = await backend.loadState();
    if (!loaded) {
      loaded = createDefaultState();
      await backend.saveState(loaded);
    }
    state = loaded;
    return state;
  }

  async function refresh() {
    if (state === null || backend.alwaysReload) return load();
    return state;
  }

  // Synchronous read. Routes call refresh() first, so state is loaded by the time they run.
  function read() {
    if (state === null) throw new Error('Store is not loaded yet');
    return state;
  }

  // mutate receives the current state and must return a new state object.
  function update(mutate) {
    const run = async () => {
      const current = await refresh();
      const next = mutate(current);
      await backend.saveState(next);
      state = next;
      return next;
    };
    const result = writeQueue.then(run);
    writeQueue = result.catch(() => {});
    return result;
  }

  return { load, refresh, read, update };
}

module.exports = { createStore };
