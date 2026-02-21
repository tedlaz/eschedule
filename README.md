# eSchedule

A **client-side only** Greek work scheduling app. Handles weekly schedules, shifts, absences, business hours, Greek public holidays, payroll summaries, JSON export/import, a shift timeline, a work/rest compliance diagram, and a time-card diff tool.

[Live demo](https://tedlaz.github.io/eschedule)

## Tech

- Pure HTML + CSS + Vanilla JavaScript — no build step, no backend, no dependencies

## Features

- **Weekly schedule grid** — per-employee shifts, absences and rest days across a 7-day week
- **Greek public holidays** — auto-detected via Easter algorithm (`argies.js`); custom holiday names per date
- **Minimum wage enforcement** — statutory monthly salary (default €880) and hourly rate (default €5.86) are enforced at employee save time, with prorating for part-time contracts and automatic triennial (τριετία) bonuses (+10 % per 3-year period, up to +30 %)
- **Payroll summary** — full Greek labour-law rules: night premium (+25 %), holiday pay (×1.75), Sunday premium (+75 %), overtime tiers (Πρόσθετη / Υπερεργασία / Υπερωρία / Παράνομη)
- **Monthly payroll export** — per-employee JSON with all bucket hours and amounts
- **Timeline modal** — visual shift bar per employee for a given day, with drag-to-adjust
- **Work/rest diagram** — compliance check for 11-hour daily rest and 24-hour weekly rest
- **Card diff** — compare scheduled times against clock-card CSV data
- **JSON export / import** — full state backup and merge
- **Print** — clean landscape PDF via hidden iframe (no browser chrome)

## Persistence

State is written to both `localStorage` (`eschedule_state_v1`) and `IndexedDB`; the most recent / largest snapshot wins on load.

## Run

Open `index.html` in any modern browser, or serve with any static file server:

```bash
npx serve .
# or
python -m http.server
```

## File structure

| File                | Purpose                                                 |
| ------------------- | ------------------------------------------------------- |
| `index.html`        | Single-page UI — all modals and layout                  |
| `style.css`         | All styles                                              |
| `payroll.js`        | `window.PAYROLL_RULES` — configurable payroll constants |
| `config.js`         | `window.DEFAULT_BUSINESS_HOURS` — default opening hours |
| `argies.js`         | Greek Easter algorithm + public holiday definitions     |
| `adeies.js`         | Absence type definitions                                |
| `app-state.js`      | Global `data` object and shared constants               |
| `shift-helpers.js`  | Shift/absence type predicates                           |
| `date-utils.js`     | Date/time math and formatting utilities                 |
| `data-storage.js`   | IndexedDB + localStorage save/load/normalize            |
| `schedule.js`       | Main schedule grid rendering and week navigation        |
| `hours-calc.js`     | Week hours, costs, premiums, summary bar                |
| `timeline.js`       | Timeline modal and drag handlers                        |
| `employees.js`      | Employee CRUD modal                                     |
| `shifts.js`         | Shift modal, validation, save/clear                     |
| `business-hours.js` | Business hours, defaults and rest-days modals           |
| `payroll-engine.js` | Payroll calculation engine and summary rendering        |
| `export-data.js`    | JSON schedule export                                    |
| `import-data.js`    | JSON schedule import and state merge                    |
| `work-rest.js`      | Work/rest compliance diagram                            |
| `print-schedule.js` | Print-to-PDF via hidden iframe                          |
| `selection.js`      | Multi-cell selection                                    |
| `card-diff.js`      | Time-card diff tool                                     |
| `app.js`            | App bootstrap (`DOMContentLoaded` init)                 |

## Employee fields

| Field                         | Description                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| ΑΦΜ                           | 9-digit tax ID (unique key)                                                                                               |
| Nickname                      | Short label shown in the schedule grid                                                                                    |
| Τύπος αμοιβής                 | `hourly` (ωρομίσθιος) or `monthly` (μηνιαίος)                                                                             |
| Τριετίες                      | Number of completed 3-year employment periods (0–3). Each period adds **+10 %** to the statutory minimum (max **+30 %**). |
| €/Ώρα or Μηνιαίος μισθός      | Actual pay; must be ≥ the effective minimum (base × triennial bonus, prorated for part-time hours)                        |
| Εβδομαδιαίες ώρες εργασίας    | Contracted weekly hours (used for overtime thresholds and prorating)                                                      |
| Εβδομαδιαίες εργάσιμες ημέρες | Contracted working days per week                                                                                          |
| Ημέρες Ρεπό                   | Default rest days (2); can be overridden per week                                                                         |

### Minimum wage calculation

```
effective_min_monthly = baseMinMonthlySalary × (1 + triennia × 0.1) × (weeklyHours / 40)
effective_min_hourly  = baseMinHourlyRate    × (1 + triennia × 0.1)
```

The baseline values (`baseMinMonthlySalary` = €880, `baseMinHourlyRate` = €5.86) are configurable at runtime via the **⚙️🔧 Ρυθμίσεις → Προεπιλογές** tab and are persisted in the app state.

## Settings modal (⚙️🔧)

The single **⚙️🔧** toolbar button opens a two-tab modal:

| Tab                     | Contents                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **⚙️ Ωράριο Εβδομάδας** | Current-week business hours and holiday flags (🎉) for each day. Changes affect only the selected week.                                                   |
| **🔧 Προεπιλογές**      | Statutory minimum monthly salary and hourly rate (baseline for minimum-wage checks), and the default weekly business-hours template applied to new weeks. |

## Payroll rules

See [payroll_rules.md](payroll_rules.md) for the full documentation of the Greek payroll calculation rules implemented in `payroll-engine.js` and configured via `payroll.js`.
