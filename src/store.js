'use strict';

const fs = require('fs');
const path = require('path');
const { createDefaultState } = require('./defaults');

// A small JSON-file store. Writes are queued so concurrent requests cannot interleave,
// and each write goes to a temp file first so a crash cannot leave half-written JSON.
function createStore(filePath) {
  let state = null;
  let writeQueue = Promise.resolve();

  function writeToDisk(next) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  }

  function read() {
    if (state === null) {
      if (fs.existsSync(filePath)) {
        state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } else {
        state = createDefaultState();
        writeToDisk(state);
      }
    }
    return state;
  }

  // mutate receives the current state and must return a new state object.
  function update(mutate) {
    const run = () => {
      const next = mutate(read());
      writeToDisk(next);
      state = next;
      return next;
    };
    const result = writeQueue.then(run);
    writeQueue = result.catch(() => {});
    return result;
  }

  return { read, update };
}

module.exports = { createStore };
