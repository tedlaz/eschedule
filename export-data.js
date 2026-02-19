function exportSelectedMonthData() {
  const monthFilter = document.getElementById('payrollMonthFilter')?.value || currentMonthValue()
  if (!/^\d{4}-\d{2}$/.test(monthFilter)) {
    alert('Μη έγκυρος μήνας')
    return
  }

  const snapshot = sanitizeStateForPersist(data)
  const monthPrefix = `${monthFilter}-`

  const weekIntersectsMonth = (weekKey) => {
    const ws = parseISODateLocal(weekKey)
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws)
      d.setDate(d.getDate() + i)
      if (formatISODateLocal(d).startsWith(monthPrefix)) return true
    }
    return false
  }

  const monthShiftsEntries = Object.entries(snapshot.shifts || {})
    .filter(([k]) => String(k).includes(`_${monthPrefix}`))
    .map(([k, v]) => {
      const m = String(k).match(/^(.+?)_(\d{4}-\d{2}-\d{2})$/)
      const vat = m ? m[1] : ''
      const day = m ? m[2] : ''
      const week = day ? getWeekKeyFromDateStr(day) : ''
      return { k, v, vat, day, week }
    })
    .sort((a, b) => {
      if (a.week !== b.week) return String(a.week).localeCompare(String(b.week))
      if (a.day !== b.day) return String(a.day).localeCompare(String(b.day))
      if (a.vat !== b.vat) return String(a.vat).localeCompare(String(b.vat))
      return String(a.k).localeCompare(String(b.k))
    })

  const monthShifts = {}
  monthShiftsEntries.forEach((e) => {
    monthShifts[e.k] = e.v
  })

  const weeksFromShifts = new Set(monthShiftsEntries.map((e) => e.week).filter(Boolean))
  Object.keys(snapshot.weekBusinessHours || {}).forEach((wk) => {
    if (weekIntersectsMonth(String(wk))) weeksFromShifts.add(String(wk))
  })
  Object.keys(snapshot.weekHolidays || {}).forEach((wk) => {
    if (weekIntersectsMonth(String(wk))) weeksFromShifts.add(String(wk))
  })

  const sortedWeeks = [...weeksFromShifts].sort((a, b) => String(a).localeCompare(String(b)))
  const monthWeekBusinessHours = {}
  const monthWeekHolidays = {}
  sortedWeeks.forEach((wk) => {
    if (snapshot.weekBusinessHours?.[wk]) monthWeekBusinessHours[wk] = snapshot.weekBusinessHours[wk]
    if (snapshot.weekHolidays?.[wk]) monthWeekHolidays[wk] = snapshot.weekHolidays[wk]
  })

  const out = {
    __meta: { exportedAt: Date.now(), month: monthFilter, mode: 'month-compact' },
    companyName: snapshot.companyName || '',
    employees: snapshot.employees || [],
    defaultBusinessHours: snapshot.defaultBusinessHours || JSON.parse(JSON.stringify(DEFAULT_BUSINESS_HOURS)),
    defaultEmployeeSettings: snapshot.defaultEmployeeSettings || {
      workingHours: 40,
      restDays: [5, 6],
      hourlyRate: 10,
    },
    payrollRules: snapshot.payrollRules || {},
    weekBusinessHours: monthWeekBusinessHours,
    weekHolidays: monthWeekHolidays,
    weekRestDays: {},
    weekEmployeeSettings: {},
    shifts: monthShifts,
  }

  const allPayrollSummaries = (snapshot.employees || [])
    .map((emp) => {
      const overview = calculateMonthlyPayrollOverview(String(emp.vat), monthFilter)
      if (!overview) return null
      return {
        employeeId: String(emp.vat),
        employeeName: String(emp.nickName || ''),
        month: monthFilter,
        baseHourlyRate: overview.baseHourlyRate,
        totals: {
          salaryTotal: overview.salaryTotal,
          extraTotal: overview.extraTotal,
          grandTotal: overview.grandTotal,
        },
        hours: overview.hours,
        amounts: overview.amounts,
      }
    })
    .filter(Boolean)

  if (allPayrollSummaries.length > 0) {
    out.payrollSummaries = allPayrollSummaries
  }

  const dataStr = JSON.stringify(out, null, 2)
  const blob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `eschedule-${monthFilter}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function exportSchedule() {
  const dataStr = JSON.stringify(sanitizeStateForPersist(data), null, 2)
  const blob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `work-schedule-${formatDate(new Date())}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// Work/Rest Intervals Modal
