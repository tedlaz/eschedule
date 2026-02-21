// =============================================================================
// payroll.js — Payroll Rules Configuration for eSchedule
// =============================================================================
//
// This file contains all configurable payroll constants.
// Edit the values in window.PAYROLL_RULES to customise calculations without
// touching any application logic.
//
// Greek Labour Law references used as defaults:
//   N.2874/2000  — working time, daily/weekly overtime thresholds
//   N.4808/2021  — labour relations reform
//   N.549/1977   — night-work premium (+25 %)
//   N.435/1976   — Sunday / public-holiday premium (+75 %)
//   ΕΓΣΣΕ        — National General Collective Agreement (monthly divisor = 25)
// =============================================================================

window.PAYROLL_RULES = {
  // ---------------------------------------------------------------------------
  // 1. NIGHT-WORK WINDOW
  //    Any shift minute outside [nightEndHour, nightStartHour) is classified
  //    as "night" and attracts the night premium.
  //    Greek law: 22:00 – 06:00 (Art. 2, N.2874/2000 / N.549/1977).
  // ---------------------------------------------------------------------------
  nightStartHour: 22, // 22:00 — night period begins
  nightEndHour: 6, // 06:00 — night period ends (next morning)

  // ---------------------------------------------------------------------------
  // 2. DAILY HOUR THRESHOLDS
  //    Category is assigned based on cumulative hours worked in that calendar
  //    day (across all shifts for the employee).
  //
  //    0 – dailyYeThreshold          → 'within'   (normal agreed hours)
  //    dailyYeThreshold – dailyYpThreshold → 'ye'  (υπερεργασία: 9th hour)
  //    dailyYpThreshold – dailyIllegalThreshold → 'yp' (υπερωρία: 10th–11th)
  //    dailyIllegalThreshold +       → 'illegal'  (παράνομη: 12th hour+)
  //
  //    Standard for 8-hour contracts under N.2874/2000.
  // ---------------------------------------------------------------------------
  dailyYeThreshold: 8, // 9th hour starts after 8 worked hours
  dailyYpThreshold: 9, // 10th–11th hours start after 9 worked hours
  dailyIllegalThreshold: 11, // 12th hour starts after 11 worked hours

  // ---------------------------------------------------------------------------
  // 3. WEEKLY HOUR THRESHOLDS
  //    Applied cumulatively across Mon–Sun.
  //
  //    0 – weeklyNormalMax           → 'within'    (standard full-time week)
  //    weeklyNormalMax – weeklyYeMax → 'ye'         (υπερεργασία, 40–45 h/week)
  //    weeklyYeMax +                 → 'yp'         (υπερωρία, beyond 45 h)
  //
  //    Part-time employees additionally use the 'additional' category for
  //    hours between their contractual threshold and weeklyNormalMax.
  //
  //    N.2874/2000, Art. 4.
  // ---------------------------------------------------------------------------
  weeklyNormalMax: 40, // standard full-time hours per week (inclusive)
  weeklyYeMax: 45, // υπερεργασία ceiling — beyond this becomes υπερωρία

  // ---------------------------------------------------------------------------
  // 4. BASE PAY MULTIPLIERS PER CATEGORY
  //    Applied to the employee's base hourly rate for each classified slice.
  //
  //    'within'     → 0       salary already covers these hours (no extra pay)
  //    'additional' → 1.12    part-time over-threshold: base + 12 %
  //    'ye'         → 1.20    υπερεργασία:              base + 20 %
  //    'yp'         → 1.40    υπερωρία:                 base + 40 %
  //    'illegal'    → 1.80    παράνομη υπερωρία:        base + 80 %
  //
  //    ΕΓΣΣΕ 2024 / N.2874/2000, Art. 4.
  //    Note: 'within' uses *additive* night/holiday adjustors instead
  //    (see withinNightAdd / withinHolidayAdd below).
  // ---------------------------------------------------------------------------
  multipliers: {
    within: 0, // no extra — covered by agreed salary
    additional: 1.12, // +12 % — πρόσθετη απασχόληση (part-time only)
    ye: 1.2, // +20 % — υπερεργασία
    yp: 1.4, // +40 % — υπερωρία αμειβόμενη
    illegal: 1.8, // +80 % — παράνομη υπερωρία
  },

  // ---------------------------------------------------------------------------
  // 5. PREMIUM STACKING FACTORS
  //    Multiplied on top of the base category rate (section 4) when night
  //    and/or holiday conditions are present on the same slice.
  //
  //    Night   ×1.25 — N.549/1977 / ΕΓΣΣΕ (+25 % for night work)
  //    Holiday ×1.75 — N.435/1976 / ΕΓΣΣΕ (+75 % for holiday/Sunday work)
  //
  //    Example: YE slice on a night shift
  //      = hourlyRate × multipliers.ye (1.20) × nightPremiumFactor (1.25)
  //      = hourlyRate × 1.50
  //
  //    For the 'within' category (base multiplier = 0) different additive
  //    premiums apply; see withinNightAdd and withinHolidayAdd below.
  // ---------------------------------------------------------------------------
  nightPremiumFactor: 1.25, // ×1.25 for any night-classified slice
  holidayPremiumFactor: 1.75, // ×1.75 for holiday / Sunday slices

  // Additive premiums for 'within' category (multipliers.within = 0 above)
  withinNightAdd: 0.25, // +25 % of hourly rate per night hour (within)
  withinHolidayAdd: 0.75, // +75 % of hourly rate per holiday/Sunday hour (within)

  // ---------------------------------------------------------------------------
  // 5b. HOLIDAY HOURS FULLY PAID
  //    When true, hours worked on a holiday/Sunday are always paid in full
  //    (base hour + holiday premium) even when the weekly total stays within
  //    the normal 40-hour agreement — i.e. those hours are never treated as
  //    "already covered by salary".
  //
  //    Applies to official public holidays only (not Sundays).
  //    Sunday hours within normal weekly hours are always +75 % extra only
  //    (the base hour is considered already covered by the salary agreement).
  //
  //    true  → within_holiday multiplier = 1 + withinHolidayAdd = 1.75
  //            (base 1.0 + 75 % premium — official holiday fully paid)
  //    false → within_holiday multiplier = withinHolidayAdd only = 0.75
  //            (only the premium, base hour already in salary)
  //
  //    Greek law (N.435/1976): work on a public holiday always entitles the
  //    employee to full day pay × 1.75 regardless of weekly hours worked.
  //    Sundays: +75 % extra only when within contracted hours (ΕΓΣΣΕ).
  // ---------------------------------------------------------------------------
  holidayHoursFullyPaid: true, // recommended: true (Greek law default)

  // ---------------------------------------------------------------------------
  // 6. MONTHLY SALARY PARAMETERS
  //    Used to convert a gross monthly salary to a per-day and per-hour rate.
  //
  //    Per-day deduction for each day of unpaid absence:
  //      deductionPerDay = monthlySalary / monthlyWorkingDays
  //
  //    Base hourly rate for monthly employees:
  //      baseHourlyRate = monthlySalary / (weeklyHours × monthlyWorkingDays / 6)
  //                     = monthlySalary × 6 / (weeklyHours × monthlyWorkingDays)
  //
  //    Example (€880/month, 40 h/week):
  //      baseHourlyRate = 880 × 6 / (40 × 25) = 5.28 €/h
  //
  //    Greek practice: 25 working days/month is the conventional divisor
  //    used in most collective agreements (ΕΓΣΣΕ).
  // ---------------------------------------------------------------------------
  monthlyWorkingDays: 25, // conventional monthly working-day divisor

  // ---------------------------------------------------------------------------
  // 7. MINIMUM SALARY / HOURLY RATE BASELINE
  //    The national minimum for full-time employment (5 days / 40 h per week).
  //
  //    Partial-time monthly minimums are prorated: min × (weeklyHours / 40).
  //    Each 3-year employment period (τριετία) adds 10 % to the base,
  //    for up to 3 periods (maximum +30 %).
  //
  //    Edit these values when the statutory minimum changes.
  // ---------------------------------------------------------------------------
  baseMinMonthlySalary: 880, // € / month baseline (full-time, 40 h/week)
  baseMinHourlyRate: 5.86, // € / hour baseline (hourly employees)
}

// Pre-computed convenience values derived from PAYROLL_RULES.
// Scripts can use these instead of recalculating multiplications.
window.PAYROLL_RULES.nightStartMinutes = window.PAYROLL_RULES.nightStartHour * 60 // 1320
window.PAYROLL_RULES.nightEndMinutes = window.PAYROLL_RULES.nightEndHour * 60 // 360
