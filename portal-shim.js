(function () {
  if (window.google && window.google.script && window.google.script.run) {
    return; // Already running inside Apps Script
  }

  const API_URL = window.GAS_WEB_APP_URL;
  if (!API_URL || API_URL.includes('YOUR_WEB_APP_DEPLOYMENT_ID')) {
    console.warn('[portal-shim] GAS_WEB_APP_URL is not set. Update pages/config.js');
  }

  async function callApi(functionName, args) {
    if (!API_URL) {
      throw new Error('GAS_WEB_APP_URL is not configured.');
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'api', fn: functionName, args: Array.isArray(args) ? args : [] })
    });

    const payload = await response.json();
    if (!payload || payload.ok !== true) {
      const errMsg = payload && (payload.error || payload.message) ? (payload.error || payload.message) : 'Unknown error';
      throw new Error(errMsg);
    }

    return payload.data;
  }

  function createRunner() {
    const handlers = { success: null, failure: null };
    const runner = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'withSuccessHandler') {
          return (fn) => { handlers.success = fn; return runner; };
        }
        if (prop === 'withFailureHandler') {
          return (fn) => { handlers.failure = fn; return runner; };
        }
        return (...args) => {
          const capturedHandlers = { success: handlers.success, failure: handlers.failure };
          callApi(prop, args)
            .then((result) => { if (capturedHandlers.success) capturedHandlers.success(result); })
            .catch((err) => { if (capturedHandlers.failure) capturedHandlers.failure(err); else console.error(err); });
          return runner;
        };
      }
    });
    return runner;
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, 'run', {
    get() { return createRunner(); }
  });

  window.callFunction = function(functionName, args = []) {
    return callApi(functionName, args);
  };
})();
