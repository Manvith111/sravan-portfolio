'use strict';

// Errors created here carry an HTTP status and are safe to show to the client.
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

module.exports = { httpError };
