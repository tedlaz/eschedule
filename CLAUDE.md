# eSchedule — Claude Instructions

## Project Summary
Greek work schedule management app. **Client-side only** — no build step, no backend, no framework.
- Pure HTML + CSS + Vanilla JavaScript
- All JS is globally scoped (no ES modules)
- State persisted via `localStorage` + `IndexedDB` (storage key: `eschedule_state_v1`)

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
employees.js → shifts.js → card-diff.js → business-hours.js →
payroll-engine.js → schedule.js → grid.js → selection.js →
timeline.js → work-rest.js → export-data.js → import-data.js →
print-schedule.js → app.js
```

`app.js` is always last — it bootstraps the app in `DOMContentLoaded`.

## Key Files

| File | Role |
|------|------|
| `index.html` | Single-page UI — all modals and layout |
| `style.css` | All styles |
| `app-state.js` | Global `data` object, `DAYS`, `DAY_ABBREV`, `currentWeekStart`, selection state |
| `app.js` | App bootstrap — `DOMContentLoaded` init, calls `applyPayrollRuleOverrides` |
| `config.js` | `window.DEFAULT_BUSINESS_HOURS`, `window.MAX_SHIFT_HOURS`, timeline colors |
| `adeies.js` | `window.ADEIES` — absence type definitions |
| `argies.js` | Greek Easter algorithm + public holiday list (`greekAllHolidaysForYear`) |
| `date-utils.js` | `getMonday`, `formatDate`, `formatDisplayDate`, `getBusinessHoursForWeek`, `autoDetectGreekHolidaysForWeek` |
| `data-storage.js` | `saveData`, `loadData`, `normalizeLoadedState`, `sanitizeStateForPersist`, `resetAllData` |
| `payroll.js` | `PAYROLL_RULES`, `getRule()`, `applyPayrollRuleOverrides()` — **single source of truth for all pay rules** |
| `payroll-engine.js` | Pure payroll computation — reads rules only via `getRule()` |
| `hours-calc.js` | `calculateWeekHours`, `calculateWeekCost`, `calculateShiftHours` |
| `shift-helpers.js` | `isWorkingType`, `isNonWorkingType`, `isPaidAbsenceType`, `absenceLabel`, `employeeLabel` |
| `employees.js` | `openEmployeeModal`, `saveEmployee`, `deleteEmployee`, `togglePayTypeFields` |
| `shifts.js` | `openShiftModal`, `saveShift`, `clearShift`, `toggleShiftFields`, validation |
| `schedule.js` | `ensureRestShiftsForWeek`, `copyPreviousWeekToCurrentWeek` |
| `grid.js` | Bar-style grid renderer; `viewStart` global, `changeView(dayDelta)` |
| `timeline.js` | Timeline modal and drag handlers |
| `selection.js` | Multi-cell selection (`selectedCells`, `isMultiSelectMode`) |
| `business-hours.js` | Business hours/rest-day modals; `getHolidayName` |
| `card-diff.js` | `readCardFileRows`, `parseCardFile`, `roundToHalfHour`, `toMinutes` |
| `work-rest.js` | Work/rest compliance diagram (11h daily, 24h weekly rest) |
| `export-data.js` | JSON schedule export |
| `import-data.js` | JSON schedule import and state merge |
| `print-schedule.js` | Print-to-PDF via hidden iframe |

## Data Structures

### Global `data` object (defined in `app-state.js`)
```js
{
  employees: [],
  companyName: '',
  defaultBusinessHours: { 0..6: { open, close, closed } },
  defaultEmployeeSettings: { workingHours, restDays, hourlyRate, dailyRate },
  payrollRules: { absencePolicies, officialHolidayPaidIfAbsent, officialHolidayPayMultiplier },
  weekBusinessHours: {},   // key: "YYYY-MM-DD" (Monday of week)
  weekRestDays: {},        // key: "YYYY-MM-DD_employeeId"
  weekEmployeeSettings: {},// key: "YYYY-MM-DD_employeeVat"
  weekHolidays: {},        // key: "YYYY-MM-DD" → array of day indices 0–6
  customHolidayNames: {},  // key: "YYYY-MM-DD" → string
  shifts: {},              // key: "employeeVat_YYYY-MM-DD" → shift object
}
```

### Employee Object
```js
{ vat, nickName, payType, triennia, hourlyRate, weekWorkingHours,
  weekWorkingDays, monthlySalary, dailyRate, defaultRestDays }
```
`payType` is one of: `"hourly"`, `"monthly"`, `"daily"`

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

## Payroll Architecture
All rules are data, not code. Never add magic numbers to the engine.

```
payroll.js          ← edit rules here (single source of truth)
  └─ PAYROLL_RULES  ← all thresholds, multipliers, premium modes
  └─ getRule(key)   ← zero-fallback accessor used by every calculation
  └─ applyPayrollRuleOverrides()  ← merges persisted overrides on load

payroll-engine.js   ← pure computation; reads rules only via getRule()
hours-calc.js       ← aggregations; reads rules only via getRule()
business-hours.js   ← settings UI; writes overrides to data.payrollRules
app.js              ← calls applyPayrollRuleOverrides(data.payrollRules) on startup
```

## Minimum Wage Calculation
```
effective_min_monthly = baseMinMonthlySalary × (1 + triennia × 0.1) × (weeklyHours / 40)
effective_min_hourly  = baseMinHourlyRate    × (1 + triennia × 0.1)
```
Defaults: `baseMinMonthlySalary` = €880, `baseMinHourlyRate` = €5.86 (configurable via UI).

## UI / Modals
All modals are defined inline in `index.html`. Currently active modals:
1. `companyModal` — company name + default business hours
2. `employeeListModal` — employee list
3. `employeeModal` — add/edit employee
4. `shiftModal` — edit one shift cell
5. `cardImportModal` — import card CSV/XLSX

Settings toolbar button (⚙️🔧) opens a two-tab modal:
- **⚙️ Ωράριο Εβδομάδας** — current-week business hours and holiday flags
- **🔧 Προεπιλογές** — statutory minimum wages and default weekly template

## Running Locally
```bash
npx serve .
# or
python -m http.server
```
Open `index.html` in any modern browser. No build step required.
