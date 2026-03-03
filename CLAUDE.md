# eSchedule — Claude Instructions

## Project Summary
Greek work schedule management app. **Client-side only** — no build step, no backend, no framework.
- Pure HTML + CSS + Vanilla JavaScript
- All JS is globally scoped (no ES modules)
- State persisted via `localStorage` + `IndexedDB` (storage key: `eschedule_state_v1`)
- Purpose: schedule creation, checking, and card data comparison (no payroll/monetary features)

## Critical Rules
- **NEVER touch `index_old.html`** — it is the original UI, preserved as-is
- Do not introduce ES modules, bundlers, or frameworks
- All globals are intentional — do not wrap in IIFEs or modules
- Do not add a backend or server-side code

## Script Load Order (`index.html`)
Scripts must be loaded in this exact order (dependencies flow downward):

```
config.js → adeies.js → argies.js → app-state.js → date-utils.js →
data-storage.js → payroll.js → hours-calc.js → shift-helpers.js →
employees.js → shifts.js → card-diff.js → schedule.js → timeline.js →
import-data.js → print-schedule.js → grid.js → selection.js
```

App initialisation is an inline `<script>` block at the end of `index.html` (no separate `app.js`).

## Key Files

| File | Role |
|------|------|
| `index.html` | Single-page UI — all modals, layout, and inline init script |
| `style.css` | All styles |
| `app-state.js` | Global `data` object, `DAYS`, `DAY_ABBREV`, `currentWeekStart`, selection state |
| `config.js` | `window.DEFAULT_BUSINESS_HOURS`, `window.MAX_SHIFT_HOURS`, timeline colors |
| `adeies.js` | `window.ADEIES` — absence type definitions |
| `argies.js` | Greek Easter algorithm + public holiday list (`greekAllHolidaysForYear`) |
| `date-utils.js` | `getMonday`, `formatDate`, `formatDisplayDate`, `autoDetectGreekHolidaysForWeek`, `getRestDaysForEmployee` (hardcoded [5,6]) |
| `data-storage.js` | `saveData`, `loadData`, `normalizeLoadedState`, `sanitizeStateForPersist`, `resetAllData` |
| `payroll.js` | `PAYROLL_RULES` (night hours, daily/weekly thresholds only), `getRule()` |
| `hours-calc.js` | `calculateWeekHours`, `calculateShiftHours`, `calculateNightHours`, `calculateWeekSummary`, `calculateMonthSummary` |
| `shift-helpers.js` | `isWorkingType`, `isNonWorkingType`, `isPaidAbsenceType`, `absenceLabel`, `employeeLabel` |
| `employees.js` | `openEmployeeModal`, `saveEmployee`, `deleteEmployee` |
| `shifts.js` | `openShiftModal`, `saveShift`, `clearShift`, `toggleShiftFields`, validation |
| `schedule.js` | `ensureRestShiftsForWeek`, `copyPreviousWeekToCurrentWeek`, `renderSchedule` |
| `grid.js` | Bar-style grid renderer; `viewStart`, `changeView()`, summary modal, schedule check |
| `timeline.js` | Timeline modal and drag handlers |
| `selection.js` | Multi-cell selection (`selectedCells`, `isMultiSelectMode`) |
| `card-diff.js` | `readCardFileRows`, `parseCardFile`, `roundToHalfHour`, `toMinutes` |
| `export-data.js` | JSON schedule export |
| `import-data.js` | JSON schedule import and state merge |
| `print-schedule.js` | Print-to-PDF via hidden iframe |
| `payroll-engine.js` | **Not loaded** — kept as reference only (script tag removed) |

## Data Structures

### Global `data` object (defined in `app-state.js`)
```js
{
  employees: [],
  companyName: '',
  weekHolidays: {},        // key: "YYYY-MM-DD" → array of day indices 0–6
  customHolidayNames: {},  // key: "YYYY-MM-DD" → string
  shifts: {},              // key: "employeeVat_YYYY-MM-DD" → shift object
}
```

### Employee Object
```js
{ vat, nickName, weekWorkingHours, weekWorkingDays }
```

### Shift Object
```js
{ type, start, end, start2?, end2?, type2? }
```
Shift key format: `"${emp.vat}_YYYY-MM-DD"`

### Shift Types
- `ΕΡΓ` — Regular work
- `ΤΗΛ` — Telework
- `AN` — Rest
- `ΜΕ` — Non-work (part-time off)
- Absence codes from `window.ADEIES` (e.g. `ΑΔΚΑΝ`, `ΑΔΑΣ`)

## Grid Rendering (`grid.js`)
- `viewStart`: leftmost day shown (can be any day, not just Monday)
- `changeView(dayDelta)`: shifts view, keeps `currentWeekStart` synced to Monday
- Navigation buttons: ◀◀(-7) ◀(-1) [date range display] ▶(+1) ▶▶(+7)
- Each cell: 24h horizontal bar with colored segments
  - `seg-work` (purple), `seg-tel` (blue), `seg-holiday` (orange), `seg-rest` (gray stripes)
  - Card diff: amber `seg-card` bar shown below schedule bar when card data is loaded
  - Hover title shows `HH:MM–HH:MM` per segment

## Schedule Rules (`payroll.js`)
Night-work and hour threshold rules only (no monetary calculations):
- Night window: 22:00–06:00
- Daily thresholds: 8h (ΥΕ), 9h (ΥΠ), 11h (illegal)
- Weekly thresholds: 40h (normal max), 45h (ΥΕ max)
- Accessed via `getRule(key)` throughout the codebase

## Rest Days
Global default: Saturday (5) and Sunday (6) for all employees.
`getRestDaysForEmployee()` always returns `[5, 6]`.

## Summary Modal
`openSummaryModal()` / `renderSummary()` in `grid.js`:
- Week view: one table per week showing per-employee hour breakdown
- Month view: aggregated monthly totals
- Columns: Contract, Worked, Extra, Day, Night, Sunday/Holiday, Sun/Hol Day, Sun/Hol Night
- Calculation functions: `calculateWeekSummary()`, `calculateMonthSummary()` in `hours-calc.js`

## UI / Modals
All modals are defined inline in `index.html`. Currently active modals:
1. `employeeListModal` — employee list
2. `employeeModal` — add/edit employee (VAT, name, hours/week, days/week)
3. `shiftModal` — edit one shift cell
4. `cardImportModal` — import card CSV/XLSX
5. `scheduleModal` — load/save/check/print schedule (tabbed)
6. `summaryModal` — hour summary per employee (week/month view)
7. `timelineModal` — day timeline with drag handlers
8. `workRestModal` — work/rest compliance diagram

## Running Locally
```bash
npx serve .
# or
python -m http.server
```
Open `index.html` in any modern browser. No build step required.
