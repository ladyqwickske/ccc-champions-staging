/**
 * Performance Debug (Console-Only) for cCc Portal
 * ================================================
 * Add <script src="perf-debug.js"></script> BEFORE other scripts in any page.
 *
 * All output goes to the browser developer console (F12 → Console).
 * Nothing is visible to regular visitors.
 *
 * Automatically instruments:
 *  - fetch() calls to the GAS/Cloudflare worker API
 *  - google.script.run calls (via portal-shim.js callFunction proxy)
 *  - DOMContentLoaded and window.load events
 *  - Custom marks added via  perfDebug.mark() / .measure()
 *
 * After all API calls finish a full summary table is printed.
 * You can also call  perfDebug.summary()  at any time from the console.
 */
(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────
  var PAGE_START = performance.now();
  var entries = [];   // { label, startMs, endMs, durationMs, status, category }
  var pendingApis = 0;
  var summaryPrinted = false;
  var settleTimer = null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function elapsed() { return performance.now() - PAGE_START; }

  function fmtMs(ms) {
    if (ms == null) return '—';
    if (ms < 1000) return ms.toFixed(0) + ' ms';
    return (ms / 1000).toFixed(2) + ' s';
  }

  function getPageName() {
    var path = window.location.pathname || '';
    var file = path.split('/').pop() || '';
    if (!file || file === '/') file = document.title || 'Unknown Page';
    return file.replace(/\.html$/, '');
  }

  // ── Entry recording ───────────────────────────────────────────────────────
  function addEntry(label, startMs, endMs, opts) {
    var o = opts || {};
    var entry = {
      label:      label,
      startMs:    Math.round(startMs),
      endMs:      Math.round(endMs),
      durationMs: Math.round(endMs - startMs),
      status:     o.status || 'ok',
      category:   o.category || 'custom'
    };
    entries.push(entry);

    // Log each entry as it happens
    var icon = entry.category === 'api' ? '🌐' : entry.category === 'render' ? '🎨' : entry.category === 'lifecycle' ? '📄' : '📌';
    var color = entry.durationMs < 500 ? 'color:#8bc34a' : entry.durationMs < 2000 ? 'color:#ffb300' : entry.durationMs < 5000 ? 'color:#ff9800' : 'color:#ff5252';
    var statusTag = entry.status === 'error' ? ' ✖ ERROR' : '';

    console.log(
      '%c⏱ %s %c%s%c  %c%s%c  (started +%s)%s',
      'color:#888', icon,
      'color:#e0e0e0;font-weight:600', entry.label,
      '',
      color + ';font-weight:700', fmtMs(entry.durationMs),
      '',
      fmtMs(entry.startMs),
      statusTag ? '%c' + statusTag : '',
      statusTag ? 'color:#ff5252;font-weight:700' : ''
    );

    // Schedule summary after all API calls settle
    scheduleSummary();
  }

  // ── Auto-print summary once all APIs finish ───────────────────────────────
  function scheduleSummary() {
    if (settleTimer) clearTimeout(settleTimer);
    // Wait 1.5 s after the last entry to print summary (covers parallel calls)
    settleTimer = setTimeout(function () {
      if (pendingApis === 0 && !summaryPrinted) {
        printSummary();
        summaryPrinted = true;
      }
    }, 1500);
  }

  function printSummary() {
    var apiEntries = entries.filter(function (e) { return e.category === 'api'; });
    var renderEntries = entries.filter(function (e) { return e.category === 'render'; });
    var customEntries = entries.filter(function (e) { return e.category === 'custom'; });

    var slowest = null;
    apiEntries.forEach(function (e) { if (!slowest || e.durationMs > slowest.durationMs) slowest = e; });
    var totalApiMs = apiEntries.reduce(function (s, e) { return s + e.durationMs; }, 0);
    var lastApiEnd = 0;
    apiEntries.forEach(function (e) { if (e.endMs > lastApiEnd) lastApiEnd = e.endMs; });
    var totalElapsed = elapsed();

    console.log('');
    console.group('%c⏱ Performance Summary — ' + getPageName(), 'color:#ffb300;font-size:14px;font-weight:700');

    // Overview
    console.log('%cTotal elapsed:      %c%s', 'color:#b0b0b0', 'color:#ffb300;font-weight:700', fmtMs(totalElapsed));
    var domEntry = entries.find(function (e) { return e.label === 'DOMContentLoaded'; });
    var loadEntry = entries.find(function (e) { return e.label === 'Window Load'; });
    if (domEntry)  console.log('%cDOM Ready:          %c%s', 'color:#b0b0b0', 'color:#8bc34a;font-weight:700', fmtMs(domEntry.durationMs));
    if (loadEntry) console.log('%cWindow Load:        %c%s', 'color:#b0b0b0', 'color:#8bc34a;font-weight:700', fmtMs(loadEntry.durationMs));

    if (apiEntries.length > 0) {
      console.log('%cAPI calls:          %c%d  (%s cumulative)', 'color:#b0b0b0', 'color:#64b5f6;font-weight:700', apiEntries.length, fmtMs(totalApiMs));
      console.log('%cLast API finished:  %c+%s', 'color:#b0b0b0', 'color:#ffb300;font-weight:700', fmtMs(lastApiEnd));
      if (slowest) {
        console.log('%c🐌 Slowest call:    %c%s  (%s)', 'color:#b0b0b0', 'color:#ff5252;font-weight:700', slowest.label, fmtMs(slowest.durationMs));
      }

      // Table of API calls sorted by duration (desc)
      console.log('');
      console.log('%cAPI Call Breakdown (sorted by duration):', 'color:#ffb300;font-weight:600');
      var tableData = apiEntries
        .slice()
        .sort(function (a, b) { return b.durationMs - a.durationMs; })
        .map(function (e) {
          return {
            'Call': e.label,
            'Duration': fmtMs(e.durationMs),
            'Started': '+' + fmtMs(e.startMs),
            'Finished': '+' + fmtMs(e.endMs),
            'Status': e.status === 'error' ? '✖ ERROR' : '✔ OK'
          };
        });
      console.table(tableData);
    } else {
      console.log('%cNo API calls recorded.', 'color:#888');
    }

    if (renderEntries.length > 0) {
      console.log('');
      console.log('%cRendering Phases:', 'color:#ffb300;font-weight:600');
      var renderTable = renderEntries.map(function (e) {
        return { 'Phase': e.label, 'Duration': fmtMs(e.durationMs), 'Started': '+' + fmtMs(e.startMs) };
      });
      console.table(renderTable);
    }

    if (customEntries.length > 0) {
      console.log('');
      console.log('%cCustom Marks:', 'color:#ffb300;font-weight:600');
      var customTable = customEntries.map(function (e) {
        return { 'Mark': e.label, 'Duration': fmtMs(e.durationMs), 'Started': '+' + fmtMs(e.startMs) };
      });
      console.table(customTable);
    }

    console.groupEnd();
  }

  // ── Monkey-patch fetch ────────────────────────────────────────────────────
  var _originalFetch = window.fetch;
  window.fetch = function (url, options) {
    var apiUrl = window.GAS_WEB_APP_URL || window.CLOUDFLARE_WORKER_URL || '';
    var urlStr = (typeof url === 'string') ? url : ((url && url.url) ? url.url : '');

    // Only instrument calls to our API endpoint
    if (!apiUrl || urlStr.indexOf(apiUrl.replace(/\/$/, '')) === -1) {
      return _originalFetch.apply(this, arguments);
    }

    var actionName = 'fetch';
    if (options && options.body) {
      try {
        var body = JSON.parse(options.body);
        actionName = body.action || body.fn || 'fetch';
      } catch (e) { /* ignore */ }
    }

    var startMs = elapsed();
    pendingApis++;
    summaryPrinted = false;

    return _originalFetch.apply(this, arguments).then(function (response) {
      var endMs = elapsed();
      pendingApis = Math.max(0, pendingApis - 1);
      addEntry('API › ' + actionName, startMs, endMs, {
        category: 'api',
        status: response.ok ? 'ok' : 'error'
      });
      return response;
    }).catch(function (err) {
      var endMs = elapsed();
      pendingApis = Math.max(0, pendingApis - 1);
      addEntry('API › ' + actionName, startMs, endMs, {
        category: 'api',
        status: 'error'
      });
      throw err;
    });
  };

  // ── Monkey-patch callFunction (portal-shim proxy) ─────────────────────────
  function patchCallFunction() {
    if (!window.callFunction) return;
    var orig = window.callFunction;
    window.callFunction = function (fnName, args) {
      var startMs = elapsed();
      pendingApis++;
      summaryPrinted = false;
      return orig(fnName, args).then(function (result) {
        var endMs = elapsed();
        pendingApis = Math.max(0, pendingApis - 1);
        addEntry('API › ' + fnName, startMs, endMs, { category: 'api', status: 'ok' });
        return result;
      }).catch(function (err) {
        var endMs = elapsed();
        pendingApis = Math.max(0, pendingApis - 1);
        addEntry('API › ' + fnName, startMs, endMs, { category: 'api', status: 'error' });
        throw err;
      });
    };
  }

  // ── Lifecycle events ──────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    addEntry('DOMContentLoaded', 0, elapsed(), { category: 'lifecycle' });
    patchCallFunction();
  });

  window.addEventListener('load', function () {
    addEntry('Window Load', 0, elapsed(), { category: 'lifecycle' });
  });

  // ── Public API (use from console or inline scripts) ───────────────────────
  var marks = {};
  window.perfDebug = {
    /** Start a named timer:  perfDebug.mark('My Task') */
    mark: function (name) { marks[name] = elapsed(); },
    /** End a named timer:  perfDebug.measure('My Task', 'render') */
    measure: function (name, category) {
      var start = marks[name];
      if (start == null) return;
      addEntry(name, start, elapsed(), { category: category || 'custom' });
      delete marks[name];
    },
    /** Record a completed timing directly */
    record: function (label, startMs, endMs, category) {
      addEntry(label, startMs, endMs, { category: category || 'custom' });
    },
    /** Print the summary table now (also available as perfDebug.summary() in console) */
    summary: function () { printSummary(); },
    /** Get raw entries array */
    getEntries: function () { return entries.slice(); }
  };

  // ── Startup log ───────────────────────────────────────────────────────────
  console.log('%c⏱ perf-debug loaded — %s', 'color:#ffb300;font-weight:700', getPageName());
  console.log('%c  Open DevTools Console to see timing data. Call perfDebug.summary() to reprint.', 'color:#888');

})();
