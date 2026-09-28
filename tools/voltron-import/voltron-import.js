#!/usr/bin/env node
/**
 * VOLTRON TOURNAMENT IMPORT
 * =========================
 * Reads each member's tournament Score from the Voltron Nexus clan portal and
 * records it on the matching troop-based event in the database (via the Worker),
 * exactly as the "Batch Entry -> Save All" button on the Troop Events tab does.
 *
 *   - Only tournaments that have results are read.
 *   - A tournament is only imported when event-map.json maps its name to an
 *     event type, and a troop-based event of that type covers its date.
 *   - "Did not play" members are recorded with 0.
 *   - Names that cannot be matched to a member are listed, never guessed.
 *
 * Usage (dry run by default, nothing is written):
 *   VOLTRON_KEY=... node voltron-import.js
 *   VOLTRON_KEY=... node voltron-import.js --write
 *   VOLTRON_KEY=... node voltron-import.js --write --report report.json
 *
 * Environment:
 *   VOLTRON_KEY   access key for the portal (the ?k= value), required
 *   WORKER_URL    database Worker, defaults to the staging Worker
 *
 * Can also be used from another script (e.g. the chesttracker routine):
 *   const { runVoltronImport } = require('./voltron-import');
 *   const report = await runVoltronImport({ key, workerUrl, write: true });
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PORTAL_BASE = 'https://nexusportal.voltron.me';
const DEFAULT_WORKER_URL = 'https://ccc-db-staging.lady-qwickske.workers.dev/';
const EVENT_MAP_FILE = path.join(__dirname, 'event-map.json');
const CORRECTIONS_FILE = path.join(__dirname, 'name-corrections.json');
const BATCH_SIZE = 50;

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* fall through */ }
  try { return require('@playwright/test'); } catch (e) { /* fall through */ }
  throw new Error('Playwright is not installed. Run "npm install" in tools/voltron-import.');
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Keys starting with "_" are comments.
  Object.keys(data).forEach(k => { if (k.startsWith('_')) delete data[k]; });
  return data;
}

// "26 Sep 2026" -> "2026-09-26"
function parsePortalDate(text) {
  const m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/.exec(text || '');
  if (!m) return '';
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return '';
  return m[3] + '-' + String(month).padStart(2, '0') + '-' + m[1].padStart(2, '0');
}

// "3,485,622,748" -> 3485622748, "—" -> null
function parseScore(text) {
  const digits = String(text || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

// Loose name key: ignore case, accents (İ/i, ö/o), and extra whitespace.
function looseKey(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i') // dotless ı
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Portal scraping (the portal is a Blazor Server app, so it needs a browser)
// ---------------------------------------------------------------------------

async function openPortal(key) {
  const { chromium } = loadPlaywright();
  const launchOptions = {};
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxy) {
    // Behind a TLS-inspecting proxy (e.g. a sandbox) Chromium must accept its certificate.
    launchOptions.proxy = { server: proxy };
    launchOptions.args = ['--ignore-certificate-errors'];
  }
  if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  // Opening the portal with the key unlocks it for this browser session.
  await page.goto(PORTAL_BASE + '/champ?k=' + encodeURIComponent(key), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => /Clan Points/.test(document.body.innerText) && document.querySelectorAll('table tbody tr').length > 0, null, { timeout: 60000 })
    .catch(() => { throw new Error('Could not unlock the Voltron portal. Is VOLTRON_KEY correct?'); });
  await page.waitForTimeout(1000);
  return { browser, page };
}

async function gotoTournamentList(page) {
  await page.goto(PORTAL_BASE + '/champ/tournaments', { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Rows render only after the Blazor circuit connects and loads the data.
  try {
    await page.waitForFunction(() => /Took part/.test(document.body.innerText) && document.querySelectorAll('table tbody tr').length > 0, null, { timeout: 60000 });
  } catch (e) {
    throw new Error('Could not open the Voltron tournament list: ' + e.message.split('\n')[0]);
  }
  await page.waitForTimeout(1500);
}

async function readTournamentList(page) {
  await gotoTournamentList(page);
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('table tr')];
    const out = [];
    rows.forEach((tr, index) => {
      const cells = [...tr.querySelectorAll('td')];
      if (cells.length < 3) return;
      out.push({
        index,
        dateText: (cells[0].innerText || '').split('\n')[0].trim(),
        name: (cells[1].innerText || '').split('\n')[0].trim(),
        clickable: tr.classList.contains('vl-ps-click'),
        noResults: /no results received/i.test(tr.innerText)
      });
    });
    return out;
  });
}

async function readTournamentDetail(page, rowIndex) {
  await gotoTournamentList(page);
  const before = page.url();
  const row = page.locator('table tr').nth(rowIndex);
  // A side rail overlaps the table for Playwright's hit test, so force the click.
  await row.click({ force: true });
  await page.waitForFunction(prev => location.href !== prev && /\/champ\/tournaments\/[^/?#]+/.test(location.pathname), before, { timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll('th')].some(th => /score/i.test(th.innerText)), null, { timeout: 30000 });
  await page.waitForTimeout(1000);

  return page.evaluate(() => {
    const table = [...document.querySelectorAll('table')].find(t => [...t.querySelectorAll('th')].some(th => /score/i.test(th.innerText)));
    const headers = [...table.querySelectorAll('th')].map(th => th.innerText.trim().toLowerCase());
    const col = name => headers.indexOf(name);
    const iMember = col('member'), iResult = col('result'), iScore = col('score'), iPoints = col('points');
    const results = [];
    [...table.querySelectorAll('tbody tr')].forEach(tr => {
      const cells = [...tr.querySelectorAll('td')];
      if (cells.length <= Math.max(iMember, iScore)) return;
      const text = i => (i >= 0 && cells[i] ? cells[i].innerText.trim() : '');
      results.push({
        name: text(iMember).split('\n')[0].trim(),
        result: text(iResult),
        scoreText: text(iScore),
        pointsText: text(iPoints)
      });
    });
    const header = document.body.innerText.match(/Ended[^\n]*/);
    return { url: location.href, ended: header ? header[0].trim() : '', results };
  });
}

// ---------------------------------------------------------------------------
// Worker (database) calls
// ---------------------------------------------------------------------------

let proxyDispatcher;
function getProxyDispatcher() {
  // Node's fetch ignores HTTPS_PROXY; route through it when one is set.
  if (proxyDispatcher !== undefined) return proxyDispatcher;
  proxyDispatcher = null;
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxy) {
    try { proxyDispatcher = new (require('undici').ProxyAgent)(proxy); }
    catch (e) { console.warn('HTTPS_PROXY is set but undici is not installed; calling the Worker directly.'); }
  }
  return proxyDispatcher;
}

async function workerCall(workerUrl, body) {
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
  const dispatcher = getProxyDispatcher();
  if (dispatcher) init.dispatcher = dispatcher;
  const res = await (dispatcher ? require('undici').fetch : fetch)(workerUrl, init);
  if (!res.ok) throw new Error('Worker ' + body.action + ' failed: HTTP ' + res.status);
  return res.json();
}

async function loadEvents(workerUrl, sinceDate) {
  const result = await workerCall(workerUrl, { action: 'getAllEvents', sinceDate });
  if (!result || !result.success) throw new Error('getAllEvents failed: ' + (result && result.message));
  return result.events || [];
}

async function loadMembers(workerUrl) {
  const result = await workerCall(workerUrl, { action: 'getAllMembers' });
  const list = Array.isArray(result) ? result : (result && (result.members || result.data)) || [];
  if (!list.length) throw new Error('getAllMembers returned no members');
  return list.map(m => m.name).filter(Boolean);
}

async function saveRecords(workerUrl, eventName, records) {
  let saved = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    const result = await workerCall(workerUrl, { action: 'batchRecordManualParticipation', eventName, records: chunk });
    if (!result || result.success === false) throw new Error('Saving to "' + eventName + '" failed: ' + (result && result.message));
    saved += result.successCount || chunk.length;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

// Compact key: letters and digits only, so "A S H C A T" / "彡V E L V E T彡" / "LNAS ツ"
// meet "ASHCAT" / "VELVET" / "LNAS :)".
function compactKey(name) {
  return looseKey(name).replace(/[^\p{L}\p{N}]/gu, '').replace(/[^a-z0-9]/g, '');
}

function buildMatcher(memberNames, corrections) {
  const exact = new Map(memberNames.map(n => [n, n]));
  const loose = new Map();
  const compact = new Map();
  memberNames.forEach(n => {
    const k = looseKey(n);
    loose.set(k, loose.has(k) ? null : n); // null = ambiguous
    const c = compactKey(n);
    if (c) compact.set(c, compact.has(c) ? null : n);
  });
  const correctionMap = new Map(Object.entries(corrections).map(([from, to]) => [looseKey(from), to]));

  return function match(voltronName) {
    if (exact.has(voltronName)) return { member: voltronName, how: 'exact' };
    const fixed = correctionMap.get(looseKey(voltronName));
    if (fixed) {
      if (exact.has(fixed)) return { member: fixed, how: 'correction' };
      return { member: null, how: 'correction-target-missing', target: fixed };
    }
    const k = looseKey(voltronName);
    if (loose.has(k)) {
      const m = loose.get(k);
      return m ? { member: m, how: 'loose' } : { member: null, how: 'ambiguous' };
    }
    const c = compactKey(voltronName);
    if (c && compact.has(c)) {
      const m = compact.get(c);
      return m ? { member: m, how: 'letters-only' } : { member: null, how: 'ambiguous' };
    }
    return { member: null, how: 'unmatched' };
  };
}

function findEvent(events, eventType, date) {
  const candidates = events.filter(e =>
    e.participationMethod === 'troop-based' &&
    String(e.eventType || '').trim().toLowerCase() === eventType.trim().toLowerCase() &&
    e.startDate <= date && date <= e.endDate);
  return candidates.length === 1 ? { event: candidates[0] } : { event: null, count: candidates.length };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runVoltronImport(options) {
  const opts = Object.assign({ workerUrl: DEFAULT_WORKER_URL, write: false, log: console.log }, options || {});
  if (!opts.key) throw new Error('No Voltron access key given (VOLTRON_KEY).');
  const log = opts.log;
  const eventMap = opts.eventMap || readJson(EVENT_MAP_FILE, {});
  const corrections = opts.corrections || readJson(CORRECTIONS_FILE, {});
  const eventMapLoose = new Map(Object.entries(eventMap).map(([k, v]) => [looseKey(k), v]));

  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 2);
  const [events, members] = await Promise.all([
    loadEvents(opts.workerUrl, since.toISOString().substring(0, 10)),
    loadMembers(opts.workerUrl)
  ]);
  const match = buildMatcher(members, corrections);

  const report = { mode: opts.write ? 'write' : 'dry-run', tournaments: [], nameIssues: [] };
  const { browser, page } = await openPortal(opts.key);
  try {
    const list = await readTournamentList(page);
    log('Voltron: ' + list.length + ' tournaments listed.');

    for (const t of list) {
      const date = parsePortalDate(t.dateText);
      const entry = { tournament: t.name, date, status: '', event: null };
      report.tournaments.push(entry);

      if (t.noResults || !t.clickable) { entry.status = 'skipped: no results for this clan'; continue; }
      const eventType = eventMapLoose.get(looseKey(t.name));
      if (!eventType) { entry.status = 'skipped: no entry in event-map.json'; continue; }
      const found = findEvent(events, eventType, date);
      if (!found.event) {
        entry.status = found.count > 1
          ? 'skipped: ' + found.count + ' troop-based "' + eventType + '" events cover ' + date
          : 'skipped: no troop-based "' + eventType + '" event covers ' + date;
        continue;
      }
      entry.event = found.event.eventName;

      const detail = await readTournamentDetail(page, t.index);
      entry.url = detail.url;
      const records = [];
      const seen = new Map();
      let played = 0, notPlayed = 0;
      for (const r of detail.results) {
        const score = parseScore(r.scoreText);
        const didNotPlay = score === null || /did not play/i.test(r.result);
        const m = match(r.name);
        if (!m.member) {
          report.nameIssues.push({ tournament: t.name, date, voltronName: r.name, problem: m.how, target: m.target || '', score: didNotPlay ? 0 : score });
          continue;
        }
        if (m.how !== 'exact') {
          report.nameIssues.push({ tournament: t.name, date, voltronName: r.name, problem: 'matched-' + m.how, member: m.member, score: didNotPlay ? 0 : score });
        }
        if (seen.has(m.member)) {
          report.nameIssues.push({ tournament: t.name, date, voltronName: r.name, problem: 'duplicate', member: m.member, alsoFrom: seen.get(m.member) });
          continue;
        }
        seen.set(m.member, r.name);
        records.push({ memberName: m.member, points: didNotPlay ? 0 : score, notes: '', extra: '' });
        didNotPlay ? notPlayed++ : played++;
      }
      entry.records = records.length;
      entry.played = played;
      entry.didNotPlay = notPlayed;
      entry.missingMembers = members.filter(n => !seen.has(n));

      if (opts.write) {
        entry.saved = await saveRecords(opts.workerUrl, found.event.eventName, records);
        entry.status = 'written';
      } else {
        entry.status = 'dry-run (not written)';
        entry.preview = records;
      }
    }
  } finally {
    await browser.close();
  }
  return report;
}

function printReport(report, log) {
  log('');
  log('=== Tournaments (' + report.mode + ') ===');
  report.tournaments.forEach(t => {
    log('- ' + t.date + '  ' + t.tournament + (t.event ? '  ->  ' + t.event : '') + '  |  ' + t.status +
      (t.records != null ? '  |  ' + t.played + ' played, ' + t.didNotPlay + ' did not play' + (t.saved != null ? ', ' + t.saved + ' saved' : '') : ''));
  });

  log('');
  log('=== Name overview ===');
  const problems = report.nameIssues.filter(i => !i.problem.startsWith('matched-'));
  const loose = report.nameIssues.filter(i => i.problem.startsWith('matched-'));
  if (!problems.length) log('All Voltron names matched a member.');
  else {
    log('NOT recorded (add to name-corrections.json):');
    problems.forEach(i => log('  ' + i.voltronName + '  [' + i.problem + (i.target ? ' -> ' + i.target : '') + (i.member ? ' -> ' + i.member : '') + ']  ' + i.tournament + ' ' + i.date + (i.score != null ? '  score ' + i.score : '')));
  }
  if (loose.length) {
    log('Recorded under a slightly different member name (check these):');
    loose.forEach(i => log('  ' + i.voltronName + '  ->  ' + i.member + '  [' + i.problem.replace('matched-', '') + ']'));
  }
  report.tournaments.filter(t => t.missingMembers && t.missingMembers.length).forEach(t => {
    log('Members with no row in Voltron for ' + t.tournament + ' ' + t.date + ' (nothing recorded):');
    log('  ' + t.missingMembers.join(', '));
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const reportIdx = args.indexOf('--report');
  runVoltronImport({
    key: process.env.VOLTRON_KEY,
    workerUrl: process.env.WORKER_URL || DEFAULT_WORKER_URL,
    write: args.includes('--write')
  }).then(report => {
    printReport(report, console.log);
    if (reportIdx !== -1 && args[reportIdx + 1]) fs.writeFileSync(args[reportIdx + 1], JSON.stringify(report, null, 2));
  }).catch(err => {
    console.error('Voltron import failed: ' + err.message);
    process.exit(1);
  });
}

module.exports = { runVoltronImport, printReport, looseKey, compactKey, parsePortalDate, parseScore };
