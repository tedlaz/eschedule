# Payroll Rules (eschedule)

> All configurable values live in **`payroll.js`** (`window.PAYROLL_RULES`).
> Edit that file to customise thresholds and multipliers without touching application logic.
> Use `getRule('key')` anywhere in code to read a rule — never access `PAYROLL_RULES` directly.

## Architecture overview

```
payroll.js
  PAYROLL_RULES          ← single object — all rule data
  getRule(key)           ← zero-fallback accessor for all calculations
  applyPayrollRuleOverrides(obj) ← merges persisted overrides on startup

payroll-engine.js        ← computation; calls getRule() only
hours-calc.js            ← aggregations; calls getRule() only
business-hours.js        ← UI for editing rules; writes to data.payrollRules
app.js                   ← calls applyPayrollRuleOverrides(data.payrollRules) on load
```

Rule values flow:

1. Code defaults in `payroll.js` → `PAYROLL_RULES`
2. On startup, `applyPayrollRuleOverrides` overlays user-saved overrides from `data.payrollRules` (localStorage / IndexedDB)
3. Engine reads rules exclusively through `getRule()` — no fallback magic numbers anywhere in engine files

---

## Scope

These rules define how work time is classified and paid, combining:

1. **Time zone** (day/night)
2. **Day type** (regular working day / official public holiday / Sunday)
3. **Workload category** (within agreement, additional, YE, YP, illegal)

---

## 1) Time Zones

| Period     | Hours                      | Premium  |
| ---------- | -------------------------- | -------- |
| Day work   | `06:00 – 22:00`            | —        |
| Night work | `22:00 – 06:00` (next day) | **+25%** |

> Configurable via `payroll.js` → `nightStartHour` (22) / `nightEndHour` (6).

---

## 2) Day Types

Three distinct day types are tracked separately:

### 2.1 Regular working day

No day-type premium.

### 2.2 Official public holiday

- Greek national holidays are auto-detected (fixed + Easter-cycle movable holidays).
- Additional holidays may be set manually per week in the Business Hours modal.
- Hours worked are **fully paid**: base hour + **+75% premium = ×1.75**.
  - This is unconditional — even if total weekly hours remain within the contracted limit.
- Basis: N.435/1976, ΕΓΣΣΕ.

### 2.3 Sunday

- Hours worked within contracted weekly hours: **+75% extra only** (base hour is considered covered by salary).
- Hours worked beyond contracted hours fall into the normal overtime categories (YE/YP/illegal); those categories always include both the base hour and their own premium, stacked with the ×1.75 holiday/Sunday factor.

### 2.4 Official holiday falling on a Sunday

- The **holiday rule takes precedence**: hours are fully paid (×1.75), not the Sunday-only rule.

> Configurable via `payroll.js` → `withinHolidayAdd` (0.75), `holidayHoursFullyPaid` (true).

---

## 3) Workload Categories

Categories are assigned per 15-minute time slice based on cumulative hours worked.

### 3.1 Within agreed hours (`within`)

- Hours within the contracted schedule.
- **Base hour not paid again** (covered by salary).
- Only day-type and night premiums are paid on top (additive mode — see Section 5).

### 3.2 Additional work (`additional`) – part-time employees only

- Hours **above the contractual threshold** and **up to 40 h/week**.
- **Paid in full**: base hour + **+12% premium** (×1.12).

### 3.3 Overwork (`YE`, υπερεργασία)

- **Daily rule:** 9th hour of the day (after 8 worked hours).
- **Weekly rule:** hours from **40 to 45** per week.
- **Paid in full**: base hour + **+20% premium** (×1.20).

### 3.4 Overtime (`YP`, υπερωρία)

- **Daily rule:** 10th and 11th hour of the day (after 9 worked hours).
- **Paid in full**: base hour + **+40% premium** (×1.40).

### 3.5 Illegal overtime (`illegal`, παράνομη υπερωρία)

- **Daily rule:** 12th hour and above (after 11 worked hours).
- **Paid in full**: base hour + **+80% premium** (×1.80).

> Daily and weekly thresholds are configurable via `payroll.js` →
> `dailyYeThreshold` (8), `dailyYpThreshold` (9), `dailyIllegalThreshold` (11),
> `weeklyNormalMax` (40), `weeklyYeMax` (45).

---

## 4) Combination / Stacking Logic

Each 15-minute slice is tagged with:

- workload category (`within` / `additional` / `ye` / `yp` / `illegal`)
- time zone (`day` / `night`)
- day type (`work` / `holiday` / `sunday`)

This produces bucket keys of the form `{category}_{daytype}_{timezone}`, e.g. `ye_holiday_night`.

### 4.1 `within` category — multiplier table

| Day type             | Time      | Multiplier | Explanation             |
| -------------------- | --------- | ---------- | ----------------------- |
| Regular              | Day       | ×0         | no extra pay            |
| Regular              | Night     | ×0.25      | night premium only      |
| **Official holiday** | **Day**   | **×1.75**  | base + 75% (fully paid) |
| **Official holiday** | **Night** | **×2.00**  | base + 75% + 25%        |
| Sunday               | Day       | ×0.75      | +75% extra only         |
| Sunday               | Night     | ×1.00      | +75% + 25% extra        |

### 4.2 Overtime categories — stacking

For `additional`, `YE`, `YP`, `illegal`:

```
pay = hourlyRate × categoryMultiplier × nightFactor × holidayFactor
```

- `nightFactor` = 1.25 if night slice, else 1
- `holidayFactor` = 1.75 if official holiday **or** Sunday slice, else 1

Both factors stack multiplicatively.

Examples:

- `within + regular + day` → ×0.00 (no extra)
- `within + regular + night` → ×0.25
- `within + holiday + day` → ×1.75 (fully paid)
- `within + sunday + night` → ×1.00
- `ye + regular + day` → ×1.20
- `ye + holiday + night` → ×1.20 × 1.75 × 1.25 = ×2.625
- `yp + sunday + day` → ×1.40 × 1.75 = ×2.45

---

## 5) Category Premium Modes

Each category declares how night/holiday premiums combine with its base multiplier via the `categoryPremiumMode` object in `payroll.js`:

| Mode               | Formula                                                                                  | Used by              |
| ------------------ | ---------------------------------------------------------------------------------------- | -------------------- |
| `'additive'`       | `baseMultiplier + withinNightAdd (if night) + withinHolidayAdd (if holiday)`             | `within`             |
| `'multiplicative'` | `categoryMultiplier × nightPremiumFactor (if night) × holidayPremiumFactor (if holiday)` | all other categories |

The engine (`bucketPayMultiplier` in `payroll-engine.js`) reads `categoryPremiumMode[cat]` and branches accordingly — **no hardcoded category names in the engine**.

---

## 6) Monthly Salary Parameters

| Parameter                   | Value                         | Description                           |
| --------------------------- | ----------------------------- | ------------------------------------- |
| Monthly working-day divisor | **25**                        | Per-day deduction = salary ÷ 25       |
| Base hourly rate            | salary × 6 ÷ (weekHours × 25) | e.g. €880 ÷ (40 × 25/6) = **€5.28/h** |

> Configurable via `payroll.js` → `monthlyWorkingDays` (25).

Absence deductions for monthly employees: each unpaid absence day deducts `salary / 25`.

---

## 7) Minimum Wage & Triennial Increments

### 7.1 Statutory baseline

The Greek national minimum for a full-time contract (5 days / 40 h per week):

| Baseline               | Default value | Config key (`payroll.js`) |
| ---------------------- | ------------- | ------------------------- |
| Minimum monthly salary | **€880**      | `baseMinMonthlySalary`    |
| Minimum hourly rate    | **€5.86**     | `baseMinHourlyRate`       |

Both values can be updated at runtime without touching code, through the **⚙️🔧 Ρυθμίσεις → Προεπιλογές** tab. Changes are persisted in the app state (localStorage / IndexedDB) and restored on next load via `applyPayrollRuleOverrides`.

### 7.2 Triennial increments (τριετίες)

Every completed 3-year employment period adds **+10 %** to the statutory baseline, up to a maximum of **3 periods (+30 %)**:

| Τριετίες | Bonus | Multiplier |
| -------- | ----- | ---------- |
| 0        | 0 %   | ×1.00      |
| 1        | +10 % | ×1.10      |
| 2        | +20 % | ×1.20      |
| 3        | +30 % | ×1.30      |

The number of triennia is set per employee in the employee form and stored on the employee record (`emp.triennia`).

### 7.3 Part-time prorating

For employees with fewer than 40 contracted hours per week, the monthly minimum is prorated proportionally:

```
effective_min_monthly = baseMinMonthlySalary × (1 + triennia × 0.1) × (weeklyHours / 40)
effective_min_hourly  = baseMinHourlyRate    × (1 + triennia × 0.1)
```

### 7.4 Enforcement

The application **blocks saving** an employee record if the entered salary or hourly rate falls below the effective minimum. Live hints below the salary/rate fields show the current minimum in real time (turning red when the value is below the threshold).

---

## 8) How to Edit Existing Rules

All rule values are in the `window.PAYROLL_RULES` object in **`payroll.js`**. Edit the value next to the key you want to change. The engine reads it automatically — no other file needs touching.

### Common edits

| What to change                   | Key in `payroll.js`      | Example          |
| -------------------------------- | ------------------------ | ---------------- |
| Night window start               | `nightStartHour`         | `21` for 21:00   |
| Night window end                 | `nightEndHour`           | `7` for 07:00    |
| 9th-hour (`YE`) daily threshold  | `dailyYeThreshold`       | `8` (default)    |
| 10th-hour (`YP`) daily threshold | `dailyYpThreshold`       | `9` (default)    |
| Illegal OT daily threshold       | `dailyIllegalThreshold`  | `11` (default)   |
| Full-time weekly hour cap        | `weeklyNormalMax`        | `40` (default)   |
| YE weekly ceiling                | `weeklyYeMax`            | `45` (default)   |
| Part-time extra premium          | `multipliers.additional` | `1.12` (+12 %)   |
| YE multiplier                    | `multipliers.ye`         | `1.2` (+20 %)    |
| YP multiplier                    | `multipliers.yp`         | `1.4` (+40 %)    |
| Illegal OT multiplier            | `multipliers.illegal`    | `1.8` (+80 %)    |
| Night premium factor             | `nightPremiumFactor`     | `1.25` (×1.25)   |
| Holiday/Sunday premium           | `holidayPremiumFactor`   | `1.75` (×1.75)   |
| Night add for `within`           | `withinNightAdd`         | `0.25` (+25 %)   |
| Holiday add for `within`         | `withinHolidayAdd`       | `0.75` (+75 %)   |
| Holiday hours fully paid         | `holidayHoursFullyPaid`  | `true` / `false` |
| Monthly working-day divisor      | `monthlyWorkingDays`     | `25` (default)   |
| Minimum monthly salary           | `baseMinMonthlySalary`   | `880`            |
| Minimum hourly rate              | `baseMinHourlyRate`      | `5.86`           |

> **Note:** `nightStartMinutes` and `nightEndMinutes` are **derived** (= `nightStartHour × 60` etc.) and are recomputed automatically. Never set them directly.

After editing `payroll.js`, reload the page. If you need to override a value at runtime without editing the file, use the **⚙️ → Προεπιλογές** UI and the value will be saved and restored on future loads.

---

## 9) How to Add a New Pay Category

Adding a new category (e.g. a special `night_shift_bonus` tier or a custom `agreed_extra` category) requires changes in exactly **three places**:

### Step 1 — `payroll.js`: declare the category's rate and premium mode

```js
// In the multipliers object:
multipliers: {
  within:       0,
  additional:   1.12,
  ye:           1.2,
  yp:           1.4,
  illegal:      1.8,
  agreed_extra: 1.15,  // ← add your new category here (+15 %)
},

// In categoryPremiumMode:
categoryPremiumMode: {
  within:       'additive',
  additional:   'multiplicative',
  ye:           'multiplicative',
  yp:           'multiplicative',
  illegal:      'multiplicative',
  agreed_extra: 'multiplicative',  // ← and here
},
```

> Use `'additive'` only if the base hour is already covered by salary (like `within`).
> Use `'multiplicative'` for any category that is paid in full on top of regular pay.

### Step 2 — `payroll-engine.js`: register the category label

Find the `PAYROLL_CATEGORIES` array and add an entry:

```js
const PAYROLL_CATEGORIES = [
  { key: 'within', label: 'Εντός' },
  { key: 'additional', label: 'Πρόσθετη' },
  { key: 'ye', label: 'Υπεργασία' },
  { key: 'yp', label: 'Υπερωρίες' },
  { key: 'illegal', label: 'Παράνομες' },
  { key: 'agreed_extra', label: 'Συμφωνημένη Extra' }, // ← add here
]
```

This automatically creates all six bucket keys (`agreed_extra_work_day`, `agreed_extra_work_night`, etc.) and adds the category to every payroll table column without any further code changes.

### Step 3 — `payroll-engine.js`: assign slices to the new category

The weekly slice classification is in the `classifyWeekSlices` function. Find the weekly bucketing section (Phase 2) and extend the threshold logic:

```js
// Example: classify slices between weeklyNormalMax and a new ceiling as 'agreed_extra'
if (weekWorked >= getRule('weeklyYeMax')) {
  category = 'yp'
} else if (weekWorked >= getRule('weeklyNormalMax')) {
  category = 'agreed_extra' // ← your new category
} else if (weekWorked >= Number(weekTarget || getRule('weeklyNormalMax'))) {
  category = 'additional'
} else {
  category = 'within'
}
```

Or for a daily threshold, extend the Phase 1 loop:

```js
// Example: add a tier between dailyYeThreshold and a new threshold
const _myThreshold = getRule('dailyMyThreshold') // defined in payroll.js
if (dayWorked >= _dailyIllegal) {
  dailyFixed.push({ ...sl, category: 'illegal' })
} else if (dayWorked >= _myThreshold) {
  dailyFixed.push({ ...sl, category: 'agreed_extra' }) // ← new tier
} else if (dayWorked >= _dailyYp) {
  // ...
}
```

Add the corresponding threshold key to `payroll.js` section 2 (daily thresholds) or section 3 (weekly thresholds).

No engine formula code changes — the `bucketPayMultiplier` function reads `categoryPremiumMode` and `multipliers` from `PAYROLL_RULES` and handles any key automatically.

---

## 10) Practical Implementation Notes

- 15-minute slices are used for accurate cross-midnight and mixed-condition shifts.
- A second shift on the same day may have a different type (`ΕΡΓ`/`ΤΗΛ`) and is processed independently.
- Aggregations are produced per day, per week, and per month.
- The Payroll Summary table shows columns per bucket key grouped by category → day type → time zone.
- Greek national holidays (fixed + Easter-cycle) are auto-detected from `argies.js`; they populate `weekHolidays` on first access and can be overridden manually.
- The canonical night-hours calculation lives in `calculateNightHours` (`hours-calc.js`); `nightHours` in `payroll-engine.js` delegates to it to avoid duplication.

---

## 11) Confirmed Business Decisions

1. 10th and 11th daily hours are overtime `YP` +40%.
2. Weekly 40→45 hours are `YE` +20%.
3. For part-time, hours above contracted limit up to 40/week are `additional` +12%.
4. `within` hours are part of salary — no base-hour extra payout.
5. `additional/YE/YP/illegal` are always paid in full (base hour + category premium).
6. Night and holiday/Sunday premiums stack on top of the category rate.
7. Illegal overtime starts at the 12th daily hour.
8. Holiday hours worked are **always fully paid (×1.75)**, even within the normal 40-hour week.
9. Sunday hours within contracted hours receive **+75% extra only** (base in salary).
10. When an official holiday falls on a Sunday, **holiday rules take precedence** (×1.75 fully paid).
