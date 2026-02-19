function roundToQuarter(hours) {
  // Round to nearest 15 minutes (0.25 hours)
  return Math.round(hours * 4) / 4
}

function formatTimeFromHours(hours) {
  const h = Math.floor(hours) % 24
  const m = Math.round((hours - Math.floor(hours)) * 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function selectTimelineDay(dayIndex) {
  selectedTimelineDay = dayIndex
  renderTimeline()
}

function getMonthlyPlannedDayIndexes(weekDays) {
  const d = Math.max(1, Math.min(6, Number(weekDays || 5)))
  return [0, 1, 2, 3, 4, 5].slice(0, d) // Monday..Saturday
}

function countMonthlyAbsenceDaysInWeek(employeeId, weekStart, weekDays = 5) {
  const plannedDays = getMonthlyPlannedDayIndexes(weekDays)
  const weekKey = formatDate(weekStart)
  const holidays = data.weekHolidays[weekKey] || []
  let abs = 0
  for (const i of plannedDays) {
    if (holidays.includes(i)) continue // official holiday excluded
    const dayDate = new Date(weekStart)
    dayDate.setDate(dayDate.getDate() + i)
    const shift = data.shifts[`${employeeId}_${formatDate(dayDate)}`]
    if (shift && isAbsenceType(shift.type) && !isPaidAbsenceType(shift.type)) abs++
  }
  return abs
}

function countMonthlyAbsenceDaysInMonth(employeeId, monthKey, weekDays = 5) {
  let abs = 0
  Object.keys(data.shifts || {}).forEach((k) => {
    const [empStr, dayStr] = k.split('_')
    if (String(empStr) !== String(employeeId)) return
    if (!String(dayStr || '').startsWith(monthKey)) return
    const d = parseISODateLocal(dayStr)
    const dayIdx = (d.getDay() + 6) % 7
    const planned = getMonthlyPlannedDayIndexes(weekDays)
    if (!planned.includes(dayIdx)) return
    const wk = getWeekKeyFromDateStr(dayStr)
    const holidays = data.weekHolidays[wk] || []
    if (holidays.includes(dayIdx)) return
    const shift = data.shifts[k]
    if (shift && isAbsenceType(shift.type) && !isPaidAbsenceType(shift.type)) abs++
  })
  return abs
}

function calculateMonthlyOverworkExtra(employeeId, monthKey, monthlySalary, weekWorkingHours = 40) {
  if (Number(weekWorkingHours || 40) < 40) return { extraHours: 0, extraPay: 0, hourlyBase: 0 }

  const weekHoursMap = {}
  Object.entries(data.shifts || {}).forEach(([k, shift]) => {
    const [empStr, dayStr] = String(k).split('_')
    if (String(empStr) !== String(employeeId)) return
    if (!String(dayStr || '').startsWith(monthKey)) return
    if (!isWorkingType(shift)) return
    const wk = getWeekKeyFromDateStr(dayStr)
    weekHoursMap[wk] = (weekHoursMap[wk] || 0) + shiftTotalHours(shift)
  })

  const _PR2 = window.PAYROLL_RULES || {}
  const _weekNorm = _PR2.weeklyNormalMax ?? 40
  const _mwd = _PR2.monthlyWorkingDays ?? 25
  const extraHours = Object.values(weekHoursMap).reduce(
    (acc, h) => acc + Math.max(0, Number(h || 0) - _weekNorm),
    0,
  )
  const hourlyBase = (Number(monthlySalary || 0) * 6) / (_mwd * _weekNorm)
  const extraPay = extraHours * hourlyBase * (_PR2.multipliers?.ye ?? 1.2) // +20% υπερεργασία
  return {
    extraHours: Math.round(extraHours * 100) / 100,
    extraPay: Math.round(extraPay * 100) / 100,
    hourlyBase: Math.round(hourlyBase * 10000) / 10000,
  }
}

function calculateWeekHours(employeeId, weekStart) {
  let total = 0
  const weekKey = formatDate(weekStart)
  const businessHours = data.weekBusinessHours[weekKey] || data.defaultBusinessHours || {}
  const holidays = data.weekHolidays[weekKey] || []

  const emp = data.employees.find((e) => String(e.vat) === String(employeeId))
  if (emp?.payType === 'monthly') {
    const weekDays = Number(emp.weekWorkingDays || 5)
    const weekHours = Number(emp.weekWorkingHours || 40)
    const planned = new Set(getMonthlyPlannedDayIndexes(weekDays))
    const perDay = weekDays > 0 ? weekHours / weekDays : 0

    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(weekStart)
      dayDate.setDate(dayDate.getDate() + i)
      const shift = data.shifts[`${employeeId}_${formatDate(dayDate)}`]

      if (isWorkingType(shift)) {
        total += shiftTotalHours(shift)
        continue
      }

      if (shift && isAbsenceType(shift.type) && isPaidAbsenceType(shift.type)) {
        total += perDay
      }
    }
    return Math.round(total * 100) / 100
  }

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(weekStart)
    dayDate.setDate(dayDate.getDate() + i)
    const shift = data.shifts[`${employeeId}_${formatDate(dayDate)}`]

    // Main grid KPI should reflect actual worked hours only
    if (isWorkingType(shift)) {
      total += shiftTotalHours(shift)
    }
  }
  return Math.round(total * 100) / 100
}

function calculateShiftHours(start, end) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startMin = sh * 60 + sm
  let endMin = eh * 60 + em
  if (endMin <= startMin) endMin += 24 * 60
  const hours = (endMin - startMin) / 60
  return Math.round(hours * 100) / 100
}

// Calculate night hours (22:00-06:00) within a shift
function calculateNightHours(start, end) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startMin = sh * 60 + sm
  let endMin = eh * 60 + em
  if (endMin <= startMin) endMin += 24 * 60 // overnight shift

  const _PR1 = window.PAYROLL_RULES || {}
  const _nightStartMin1 = _PR1.nightStartMinutes ?? 1320
  const _nightEndMin1 = _PR1.nightEndMinutes ?? 360
  let nightMinutes = 0
  for (let m = startMin; m < endMin; m++) {
    const timeInDay = m % (24 * 60)
    if (timeInDay < _nightEndMin1 || timeInDay >= _nightStartMin1) nightMinutes++
  }

  return Math.round((nightMinutes / 60) * 10) / 10
}

// Calculate premium cost breakdown for a single shift
function calculateShiftPremiums(shift, dayIndex) {
  if (!isWorkingType(shift)) return null

  const totalHours = shiftTotalHours(shift)
  const nightHours = shiftTotalNightHours(shift)
  const regularTimeHours = totalHours - nightHours
  const isSundayOrHoliday = isDayHolidayOrSunday(dayIndex)

  // Premiums:
  // Sunday/Holiday: +75% on all hours
  // Night (22:00-06:00): +25% on night hours
  // Both stack additively

  let premiumMultiplier = 1.0
  let sundayHolidayExtra = 0
  let nightExtra = 0

  const _PR3 = window.PAYROLL_RULES || {}
  if (isSundayOrHoliday) {
    sundayHolidayExtra = totalHours * (_PR3.withinHolidayAdd ?? 0.75)
  }
  nightExtra = nightHours * (_PR3.withinNightAdd ?? 0.25)

  return {
    totalHours,
    nightHours,
    regularTimeHours,
    isSundayOrHoliday,
    sundayHolidayExtra, // extra hours equivalent from Sunday/holiday premium
    nightExtra, // extra hours equivalent from night premium
    effectiveHours: totalHours + sundayHolidayExtra + nightExtra,
  }
}

// Calculate week cost for an employee
function calculateWeekCost(employeeId, weekStart) {
  const emp = data.employees.find((e) => String(e.vat) === String(employeeId))
  if (!emp) return { totalHours: 0, effectiveHours: 0, totalCost: 0, sundayHolidayHours: 0, nightHours: 0 }

  if (emp.payType === 'monthly') {
    const totalHours = calculateWeekHours(employeeId, weekStart)
    const monthlySalary = Number(emp.monthlySalary || 0)
    const weeklyBase = Math.round(((monthlySalary * 12) / 52) * 100) / 100
    const absDays = countMonthlyAbsenceDaysInWeek(employeeId, weekStart, Number(emp.weekWorkingDays || 5))
    const weeklyDeduction =
      Math.round((monthlySalary / (window.PAYROLL_RULES?.monthlyWorkingDays ?? 25)) * absDays * 100) / 100
    const weeklyCost = Math.max(0, Math.round((weeklyBase - weeklyDeduction) * 100) / 100)
    return {
      totalHours,
      effectiveHours: totalHours,
      totalCost: weeklyCost,
      sundayHolidayHours: 0,
      nightHours: 0,
      hourlyRate: totalHours > 0 ? Math.round((weeklyCost / totalHours) * 100) / 100 : 0,
    }
  }

  const previousWeek = currentWeekStart
  currentWeekStart = new Date(weekStart)
  const settings = getEmployeeWeekSettings(employeeId)
  const holidays = getHolidaysForWeek()
  const businessHours = getBusinessHoursForWeek()
  currentWeekStart = previousWeek

  const hourlyRate = settings.hourlyRate || emp.hourlyRate || 10
  const standardDailyHours = Math.round((getWorkingHours(settings, getWorkingHours(emp, 40)) / 5) * 100) / 100

  const rules = data.payrollRules || {}
  const absencePolicies = rules.absencePolicies || {}
  const officialHolidayPaidIfAbsent = rules.officialHolidayPaidIfAbsent !== false
  const officialHolidayPayMultiplier = Number(rules.officialHolidayPayMultiplier ?? 1) || 1

  let totalHours = 0
  let effectiveHours = 0
  let sundayHolidayHours = 0
  let nightHours = 0

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(weekStart)
    dayDate.setDate(dayDate.getDate() + i)
    const shift = data.shifts[`${employeeId}_${formatDate(dayDate)}`]
    const premiums = calculateShiftPremiums(shift, i)

    if (premiums) {
      totalHours += premiums.totalHours
      effectiveHours += premiums.effectiveHours
      if (premiums.isSundayOrHoliday) sundayHolidayHours += premiums.totalHours
      nightHours += premiums.nightHours
      continue
    }

    let nonWorkingPaidHours = 0

    if (shift && isAbsenceType(shift.type)) {
      if (isPaidAbsenceType(shift.type)) {
        nonWorkingPaidHours = Math.max(nonWorkingPaidHours, standardDailyHours)
      }
    }

    const isClosedNonSunday = i !== 6 && !!businessHours[i]?.closed
    if (isClosedNonSunday) {
      // User rule: closed day (except Sunday) counts as working day
      nonWorkingPaidHours = Math.max(nonWorkingPaidHours, standardDailyHours)
    }

    if (officialHolidayPaidIfAbsent && holidays.includes(i)) {
      nonWorkingPaidHours = Math.max(nonWorkingPaidHours, standardDailyHours * officialHolidayPayMultiplier)
    }

    effectiveHours += nonWorkingPaidHours
  }

  return {
    totalHours: Math.round(totalHours * 10) / 10,
    effectiveHours: Math.round(effectiveHours * 10) / 10,
    totalCost: Math.round(effectiveHours * hourlyRate * 100) / 100,
    sundayHolidayHours: Math.round(sundayHolidayHours * 10) / 10,
    nightHours: Math.round(nightHours * 10) / 10,
    hourlyRate,
  }
}

function updateSummary() {
  let totalEmployees = data.employees.length
  let totalHours = 0
  let absences = 0

  data.employees.forEach((emp) => {
    totalHours += calculateWeekHours(emp.vat, currentWeekStart)
  })

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(currentWeekStart)
    dayDate.setDate(dayDate.getDate() + i)
    const dateStr = formatDate(dayDate)

    data.employees.forEach((emp) => {
      const shift = data.shifts[`${emp.vat}_${dateStr}`]
      if (shift && isAbsenceType(shift.type)) {
        absences++
      }
    })
  }

  document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card">
      <h3>${totalEmployees}</h3>
      <p>Total Employees</p>
    </div>
    <div class="summary-card">
      <h3>${totalHours}</h3>
      <p>Scheduled Hours</p>
    </div>
    <div class="summary-card">
      <h3>${absences}</h3>
      <p>Absences This Week</p>
    </div>`
}

// Employee Modal
