# Payroll Rules (eschedule)

> All configurable values live in **`payroll.js`** (`window.PAYROLL_RULES`).
> Edit that file to customise thresholds and multipliers without touching application logic.

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
- Only day-type and night premiums are paid on top.

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

## 5) Monthly Salary Parameters

| Parameter                   | Value                         | Description                           |
| --------------------------- | ----------------------------- | ------------------------------------- |
| Monthly working-day divisor | **25**                        | Per-day deduction = salary ÷ 25       |
| Base hourly rate            | salary × 6 ÷ (weekHours × 25) | e.g. €880 ÷ (40 × 25/6) = **€5.28/h** |

> Configurable via `payroll.js` → `monthlyWorkingDays` (25).

Absence deductions for monthly employees: each unpaid absence day deducts `salary / 25`.

---

## 6) Practical Implementation Notes

- 15-minute slices are used for accurate cross-midnight and mixed-condition shifts.
- A second shift on the same day may have a different type (`ΕΡΓ`/`ΤΗΛ`) and is processed independently.
- Aggregations are produced per day, per week, and per month.
- The Payroll Summary table shows columns per bucket key grouped by category → day type → time zone.
- Greek national holidays (fixed + Easter-cycle) are auto-detected from `argies.js`; they populate `weekHolidays` on first access and can be overridden manually.

---

## 7) Confirmed Business Decisions (from user)

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
