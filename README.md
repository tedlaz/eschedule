# eSchedule

`eSchedule` is a **client-side only** version of `workschedule` with the same core functionality (weekly scheduling, shifts, absences, business hours, holidays, payroll summaries, exports/imports, timeline/work-rest views).

## Tech
- HTML + CSS + Vanilla JavaScript
- No backend / no API required

## Persistence
- Data is saved in browser `localStorage` key: `eschedule_state_v1`

## Run
Just open `index.html` in your browser (or serve with any static server).

## Notes
- Payroll summary is calculated fully in-browser (same rule model used in workschedule backend).
- Import/Export JSON still works as before.
