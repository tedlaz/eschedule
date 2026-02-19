# Payroll Rules (eschedule)

## Scope
These rules define how work time is classified and paid, combining:
1. **Time zone** (day/night)
2. **Day type** (working day/holiday)
3. **Workload category** (within agreement, additional, YE, YP, illegal)

---

## 1) Time Zones

- **Day work:** `06:00 - 22:00`
- **Night work:** `22:00 - 06:00` (next day)
  - Night premium: **+25%**

---

## 2) Day Types

- **Regular working day**
- **Holiday / Sunday**
  - Holiday premium: **+75%**

> Sunday is treated as holiday by default.

---

## 3) Workload Categories

### 3.1 Within agreed hours (`within`)
- Hours that belong to the agreed schedule/salary coverage.
- **No base-hour extra payout** (already covered by salary agreement).
- Only applicable premiums are paid on top (e.g. night, holiday).

### 3.2 Additional work (`additional`) – part-time only
- For reduced contracts, hours **above agreed** and **up to 40 weekly hours**.
- Premium: **+12%**.
- This category is paid in full: base hour + premium.

### 3.3 Overwork (`YE`, υπερεργασία)
- **Daily rule:** 9th hour of the day.
- **Weekly rule:** hours from **40 to 45** per week.
- Premium: **+20%**.
- Paid in full: base hour + premium.

### 3.4 Overtime (`YP`, υπερωρία)
- **Daily rule:** 10th and 11th hour of the day.
- Premium: **+40%**.
- Paid in full: base hour + premium.

### 3.5 Illegal overtime (`illegal`, παράνομη υπερωρία)
- **Daily rule:** 12th hour and above.
- Premium: **+80%**.
- Paid in full: base hour + premium.

---

## 4) Combination / Stacking Logic

Payroll calculation is combinational: each time slice gets tags for:
- workload category (`within`/`additional`/`YE`/`YP`/`illegal`)
- time zone (day/night)
- day type (regular/holiday)

### 4.1 Base treatment by category
- `within`: base hour is already paid (do not pay hour again)
- `additional`, `YE`, `YP`, `illegal`: pay **full hour value** plus category premium

### 4.2 Premium stacking
- Night and holiday premiums stack with workload category.
- For categories paid in full (`additional`, `YE`, `YP`, `illegal`), night/holiday premiums apply on the category-valued amount.

Examples:
- `within + regular + day` → no extra payout
- `within + regular + night` → pay only +25%
- `within + holiday + night` → pay holiday + night premiums only
- `YE + regular + day` → base hour +20%
- `YE + holiday + night` → value(YE) plus holiday/night premiums stacked

---

## 5) Practical Implementation Notes

- Use fine-grained time slicing (e.g., 15-minute slices) for accurate cross-midnight and mixed-condition shifts.
- Second shift on same day may have different type (`ΕΡΓ`/`ΤΗΛ`) and should be processed independently.
- Aggregations required:
  - per day
  - per week
  - per month
- Payroll Summary should present category totals and weekly/monthly subtotals.

---

## 6) Confirmed Business Decisions (from user)

1. 10th and 11th daily hours are overtime `YP` +40%.
2. Weekly 40→45 hours are `YE` +20%.
3. For part-time, above agreed hours until 40/week are `additional` +12%.
4. `within` hours are part of salary (no base-hour extra payout).
5. `additional/YE/YP/illegal` are paid fully (base hour + category premium).
6. For combined cases, apply night/holiday premiums in addition, according to the stacking model above.
7. Illegal overtime starts at the 12th hour and above.
