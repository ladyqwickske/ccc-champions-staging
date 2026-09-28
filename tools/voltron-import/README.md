# Voltron tournament import

Copies each member's tournament **Score** from the Voltron Nexus clan portal into the
matching **troop-based** event in the database, the same way *Troop Events → Batch Entry → Save All* does.

- Tournaments without results for the clan are skipped.
- `event-map.json` maps a Voltron tournament name to an event type. A key may also be a
  word in the name (`Arachne` matches `Arachne's Swarm`). The troop-based event of that
  type whose start–end dates cover the tournament's end date gets the scores; if no such
  event exists yet, the tournament is skipped and picked up on a later run once it does.
- Members marked "Did not play" are recorded with `0`.
- Running it again updates the same rows (no duplicates), so it is safe to run daily.

## Setup

```
cd tools/voltron-import
npm install
npx playwright install chromium
```

## Run

```
VOLTRON_KEY=<portal key> node voltron-import.js                 # dry run, writes nothing
VOLTRON_KEY=<portal key> node voltron-import.js --write         # save to the database
VOLTRON_KEY=<portal key> node voltron-import.js --write --report report.json
```

`WORKER_URL` selects the database Worker (default: the staging Worker).

From another Node script (e.g. the chesttracker routine):

```js
const { runVoltronImport, printReport } = require('./tools/voltron-import/voltron-import');
const report = await runVoltronImport({ key: process.env.VOLTRON_KEY, workerUrl, write: true });
printReport(report, console.log);
```

## Name matching

Voltron names are matched to the Members list in this order:

1. exact
2. `name-corrections.json` (Voltron name → member name)
3. ignoring case, accents and extra spaces (`ELCHİN094` → `ELCHiN094`)
4. letters and digits only (`A S H C A T` → `ASHCAT`, `LNAS ツ` → `LNAS :)`)

Steps 3 and 4 are listed in the report under "Recorded under a slightly different member name".
Names that match nothing are **not recorded** and listed under "NOT recorded"; add them to
`name-corrections.json` if they are members.
