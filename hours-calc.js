function roundToQuarter(hours) {
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

function calculateWeekHours(employeeId, weekStart) {
  let total = 0
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(weekStart)
    dayDate.setDate(dayDate.getDate() + i)
    const shift = data.shifts[`${employeeId}_${formatDate(dayDate)}`]
    if (isWorkingType(shift)) total += shiftTotalHours(shift)
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

function calculateNightHours(start, end) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startMin = sh * 60 + sm
  let endMin = eh * 60 + em
  if (endMin <= startMin) endMin += 24 * 60

  const _nightStartMin1 = getRule('nightStartMinutes')
  const _nightEndMin1 = getRule('nightEndMinutes')
  let nightMinutes = 0
  for (let m = startMin; m < endMin; m++) {
    const timeInDay = m % (24 * 60)
    if (timeInDay < _nightEndMin1 || timeInDay >= _nightStartMin1) nightMinutes++
  }

  return Math.round((nightMinutes / 60) * 10) / 10
}

function calculateShiftPremiums(shift, dayIndex) {
  if (!isWorkingType(shift)) return null

  const totalHours = shiftTotalHours(shift)
  const nightHours = shiftTotalNightHours(shift)
  const regularTimeHours = totalHours - nightHours
  const isSundayOrHoliday = isDayHolidayOrSunday(dayIndex)

  return {
    totalHours,
    nightHours,
    regularTimeHours,
    isSundayOrHoliday,
  }
}

// ─── Summary calculations ──────────────────────────────────────────────────

function calculateWeekSummary(employeeId, weekStart) {
  const emp = data.employees.find((e) => String(e.vat) === String(employeeId))
  const contractHours = Number(emp?.weekWorkingHours ?? 40)

  let workedHours = 0
  let dayHours = 0
  let nightHours = 0
  let sundayHolidayHours = 0
  let sundayHolidayDayHours = 0
  let sundayHolidayNightHours = 0

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(weekStart)
    dayDate.setDate(dayDate.getDate() + i)
    const shift = data.shifts[`${employeeId}_${formatDate(dayDate)}`]
    if (!shift || !isWorkingType(shift)) continue

    const total = shiftTotalHours(shift)
    const night = shiftTotalNightHours(shift)
    const day = total - night
    const isHolSun = isDayHolidayOrSunday(i)

    workedHours += total
    dayHours += day
    nightHours += night

    if (isHolSun) {
      sundayHolidayHours += total
      sundayHolidayDayHours += day
      sundayHolidayNightHours += night
    }
  }

  const r = (v) => Math.round(v * 100) / 100
  return {
    contractHours,
    workedHours: r(workedHours),
    extraHours: r(Math.max(0, workedHours - contractHours)),
    sundayHolidayHours: r(sundayHolidayHours),
    sundayHolidayDayHours: r(sundayHolidayDayHours),
    sundayHolidayNightHours: r(sundayHolidayNightHours),
    regularDayHours: r(dayHours - sundayHolidayDayHours),
    regularNightHours: r(nightHours - sundayHolidayNightHours),
    dayHours: r(dayHours),
    nightHours: r(nightHours),
  }
}

function calculateMonthSummary(employeeId, monthKey) {
  const totals = {
    contractHours: 0,
    workedHours: 0,
    extraHours: 0,
    sundayHolidayHours: 0,
    sundayHolidayDayHours: 0,
    sundayHolidayNightHours: 0,
    regularDayHours: 0,
    regularNightHours: 0,
    dayHours: 0,
    nightHours: 0,
  }

  const emp = data.employees.find((e) => String(e.vat) === String(employeeId))
  if (!emp) return totals

  const contractHours = Number(emp.weekWorkingHours ?? 40)
  const monthPrefix = `${monthKey}-`

  // Find all weeks that intersect this month
  const weekKeys = new Set()
  Object.keys(data.shifts || {}).forEach((k) => {
    const m = String(k).match(/^(.+?)_(\d{4}-\d{2}-\d{2})$/)
    if (!m || String(m[1]) !== String(employeeId)) return
    if (!String(m[2]).startsWith(monthPrefix)) return
    weekKeys.add(getWeekKeyFromDateStr(m[2]))
  })

  weekKeys.forEach((wk) => {
    const weekStart = parseISODateLocal(wk)
    // For each day in the week, only count if it's in the target month
    let weekWorked = 0
    let weekDay = 0
    let weekNight = 0
    let weekHolSun = 0
    let weekHolSunDay = 0
    let weekHolSunNight = 0

    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(weekStart)
      dayDate.setDate(dayDate.getDate() + i)
      const dateStr = formatDate(dayDate)
      if (!dateStr.startsWith(monthPrefix)) continue

      const shift = data.shifts[`${employeeId}_${dateStr}`]
      if (!shift || !isWorkingType(shift)) continue

      const total = shiftTotalHours(shift)
      const night = shiftTotalNightHours(shift)
      const day = total - night
      const isHolSun = isDateSundayOrHoliday(dayDate)

      weekWorked += total
      weekDay += day
      weekNight += night
      if (isHolSun) {
        weekHolSun += total
        weekHolSunDay += day
        weekHolSunNight += night
      }
    }

    totals.contractHours += contractHours
    totals.workedHours += weekWorked
    totals.extraHours += Math.max(0, weekWorked - contractHours)
    totals.sundayHolidayHours += weekHolSun
    totals.sundayHolidayDayHours += weekHolSunDay
    totals.sundayHolidayNightHours += weekHolSunNight
    totals.regularDayHours += weekDay - weekHolSunDay
    totals.regularNightHours += weekNight - weekHolSunNight
    totals.dayHours += weekDay
    totals.nightHours += weekNight
  })

  const r = (v) => Math.round(v * 100) / 100
  Object.keys(totals).forEach((k) => { totals[k] = r(totals[k]) })
  return totals
}
