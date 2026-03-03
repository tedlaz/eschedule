// =============================================================================
// payroll.js — Schedule Rules Configuration for eSchedule
// =============================================================================
// Night-work window and hour thresholds for schedule checking/summaries.
// Greek Labour Law references:
//   N.2874/2000 — working time, daily/weekly overtime thresholds
//   N.549/1977  — night-work definition (22:00–06:00)
// =============================================================================

window.PAYROLL_RULES = {
  // Night-work window
  nightStartHour: 22,
  nightEndHour: 6,

  // Daily hour thresholds
  dailyYeThreshold: 8,
  dailyYpThreshold: 9,
  dailyIllegalThreshold: 11,

  // Weekly hour thresholds
  weeklyNormalMax: 40,
  weeklyYeMax: 45,
}

// Pre-computed convenience values
window.PAYROLL_RULES.nightStartMinutes = window.PAYROLL_RULES.nightStartHour * 60
window.PAYROLL_RULES.nightEndMinutes = window.PAYROLL_RULES.nightEndHour * 60

window.getRule = function (key) {
  return window.PAYROLL_RULES[key]
}
