/**
 * cCc dates — one way to show dates and times on every page: in UTC.
 *
 *   cccDate(v)       '2026-09-27'              a calendar date
 *   cccDateTime(v)   '2026-09-27 17:00 UTC'    a moment (a plain date stays a date)
 *   cccParse(v)      Date or null              reads whatever the server sends
 *   cccTodayUTC()    '2026-09-27'
 *
 * Accepted: Date objects, milliseconds, '2026-09-27', '2026-09-27 17:00[:00][ UTC]',
 * ISO ('2026-09-27T17:00:00.000Z', with or without Z / offset — no zone means UTC),
 * '9/27/2026', and JavaScript's long form ('Sun Sep 27 2026 19:00:00 GMT+0200 (…)').
 * A value that only has a date (no time, or midnight in the long form) is a
 * calendar date and never moves to another day.
 */
(function () {
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var ymdUTC = function (d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  // → { date: Date, dateOnly: boolean } or null
  function read(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : { date: v, dateOnly: false };
    if (typeof v === 'number') return isFinite(v) ? { date: new Date(v), dateOnly: false } : null;
    var s = String(v).trim();
    var m;
    // 2026-09-27
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return { date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])), dateOnly: true };
    // 2026-09-27 17:00[:00][.000][ UTC] or 2026-09-27T17:00[:00][.000][Z|±hh:mm]
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(Z|UTC|GMT|[+-]\d{2}:?\d{2})?$/i))) {
      var utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0), m[7] ? Math.round(Number('0.' + m[7]) * 1000) : 0);
      var zone = m[8] ? m[8].toUpperCase() : '';
      if (zone && zone !== 'Z' && zone !== 'UTC' && zone !== 'GMT') {
        var z = zone.replace(':', ''), sign = z[0] === '-' ? -1 : 1;
        utc -= sign * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5))) * 60000;
      }
      return { date: new Date(utc), dateOnly: false };
    }
    // 9/27/2026
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return { date: new Date(Date.UTC(+m[3], +m[1] - 1, +m[2])), dateOnly: true };
    // Sun Sep 27 2026 19:00:00 GMT+0200 (…)
    if ((m = s.match(/^(?:[A-Za-z]{3},?\s+)?([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\s*GMT([+-]\d{4}))?/)) && MONTHS[m[1].toLowerCase()] !== undefined) {
      var mon = MONTHS[m[1].toLowerCase()];
      var midnight = !m[4] || (+m[4] === 0 && +m[5] === 0 && +(m[6] || 0) === 0);
      if (midnight) return { date: new Date(Date.UTC(+m[3], mon, +m[2])), dateOnly: true };
      var ms = Date.UTC(+m[3], mon, +m[2], +m[4], +m[5], +(m[6] || 0));
      if (m[7]) { var sg = m[7][0] === '-' ? -1 : 1; ms -= sg * (Number(m[7].slice(1, 3)) * 60 + Number(m[7].slice(3, 5))) * 60000; }
      return { date: new Date(ms), dateOnly: false };
    }
    var t = Date.parse(s);
    return isNaN(t) ? null : { date: new Date(t), dateOnly: false };
  }

  window.cccParse = function (v) { var r = read(v); return r ? r.date : null; };

  window.cccDate = function (v, fallback) {
    var r = read(v);
    if (!r) return fallback !== undefined ? fallback : (v === null || v === undefined ? '' : String(v));
    return ymdUTC(r.date);
  };

  window.cccDateTime = function (v, fallback) {
    var r = read(v);
    if (!r) return fallback !== undefined ? fallback : (v === null || v === undefined ? '' : String(v));
    if (r.dateOnly) return ymdUTC(r.date);
    return ymdUTC(r.date) + ' ' + pad(r.date.getUTCHours()) + ':' + pad(r.date.getUTCMinutes()) + ' UTC';
  };

  window.cccTodayUTC = function () { return ymdUTC(new Date()); };
})();
