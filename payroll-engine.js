function formatPayrollDayLabel(dayStr) {
  const d = parseISODateLocal(dayStr)
  return d.toLocaleDateString('el-GR', {
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function dayTimeText(day, employeeId = '') {
  const empIds = employeeId ? [String(employeeId)] : (data.employees || []).map((e) => String(e.vat))
  const ranges = []
  empIds.forEach((eid) => {
    const sh = data.shifts?.[`${eid}_${day}`]
    if (!sh || !isWorkingType(sh)) return
    if (sh.start && sh.end) ranges.push(`${sh.start}-${sh.end}`)
    if (sh.start2 && sh.end2) ranges.push(`${sh.start2}-${sh.end2}`)
  })
  if (!ranges.length) return '-'
  return ranges.join(', ')
}

function isHolidayOrSundayDate(dayStr) {
  const d = parseISODateLocal(dayStr)
  if (isNaN(d.getTime())) return false
  const dayIdx = (d.getDay() + 6) % 7
  const wk = getWeekKeyFromDateStr(dayStr)
  const holidayIdxs = new Set((data.weekHolidays || {})[wk] || [])
  return dayIdx === 6 || holidayIdxs.has(dayIdx)
}

// Returns true only for official/manual holidays — NOT Sundays.
function isOfficialHolidayDate(dayStr) {
  const d = parseISODateLocal(dayStr)
  if (isNaN(d.getTime())) return false
  const dayIdx = (d.getDay() + 6) % 7
  const wk = getWeekKeyFromDateStr(dayStr)
  const holidayIdxs = new Set((data.weekHolidays || {})[wk] || [])
  return holidayIdxs.has(dayIdx) // dayIdx===6 (Sunday) intentionally excluded
}

function shiftRangeToSlices(dayStr, start, end, originType = 'ΕΡΓ') {
  if (!isValidTime24h(start || '') || !isValidTime24h(end || '')) return []
  const startMin = toMinutes(start)
  let endMin = toMinutes(end)
  if (startMin == null || endMin == null) return []
  if (endMin <= startMin) endMin += 24 * 60
  const out = []
  for (let m = startMin; m < endMin; m += 15) {
    const dur = Math.min(15, endMin - m)
    const dayOffset = Math.floor(m / (24 * 60))
    const minuteInDay = ((m % (24 * 60)) + 24 * 60) % (24 * 60)
    const actualDay = plusDaysISO(dayStr, dayOffset)
    out.push({
      day: actualDay,
      sourceDay: dayStr,
      hours: dur / 60,
      isNight: minuteInDay < getRule('nightEndMinutes') || minuteInDay >= getRule('nightStartMinutes'),
      isHoliday: isHolidayOrSundayDate(dayStr),
      isOfficialHoliday: isOfficialHolidayDate(dayStr),
      shiftType: originType === 'ΤΗΛ' ? 'ΤΗΛ' : 'ΕΡΓ',
      absOrder: `${actualDay}T${String(Math.floor(minuteInDay / 60)).padStart(2, '0')}:${String(minuteInDay % 60).padStart(2, '0')}`,
    })
  }
  return out
}

function classifyWeekSlices(employeeId, weekKey) {
  const emp = (data.employees || []).find((e) => String(e.vat) === String(employeeId))
  const wsCfg = (data.weekEmployeeSettings || {})[`${weekKey}_${employeeId}`] || {}
  const weekTarget = getWorkingHours(wsCfg, getWorkingHours(emp || {}, 40))

  const weekStart = parseISODateLocal(weekKey)
  const weekEnd = plusDaysISO(weekKey, 6)
  const inWeek = (slice) => {
    const src = slice?.sourceDay || slice?.day || ''
    return src >= weekKey && src <= weekEnd
  }

  const _dailyIllegal = getRule('dailyIllegalThreshold')
  const _dailyYp = getRule('dailyYpThreshold')
  const _dailyYe = getRule('dailyYeThreshold')
  const _weekNorm4 = getRule('weeklyNormalMax')
  const _weekYe4 = getRule('weeklyYeMax')

  // Build per-day slice arrays (Mon=0 … Sun=6), sorted by time within each day
  const slicesByDay = []
  for (let i = 0; i < 7; i++) {
    const day = formatISODateLocal(
      new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i),
    )
    const sh = data.shifts?.[`${employeeId}_${day}`]
    if (!isWorkingType(sh)) {
      slicesByDay.push([])
      continue
    }
    const daySlices = [
      ...shiftRangeToSlices(day, sh.start, sh.end, sh.type),
      ...(sh.start2 && sh.end2 ? shiftRangeToSlices(day, sh.start2, sh.end2, sh.type2 || sh.type) : []),
    ]
      .filter((x) => inWeek(x))
      .sort((a, b) => a.absOrder.localeCompare(b.absOrder))
    slicesByDay.push(daySlices)
  }

  // Phase 1: apply daily thresholds to separate fixed categories.
  // Slices 0–8h/day are "eligible" for weekly round-robin.
  // Slices 8–9h/day are fixed ye.
  // Slices 9–11h/day are fixed yp.
  // Slices 11h+/day are fixed illegal.
  const dailyFixed = []
  const dailyEligible = []
  for (let i = 0; i < 7; i++) {
    let dayWorked = 0
    const eligible = []
    for (const sl of slicesByDay[i]) {
      if (dayWorked >= _dailyIllegal) {
        dailyFixed.push({ ...sl, category: 'illegal' })
      } else if (dayWorked >= _dailyYp) {
        dailyFixed.push({ ...sl, category: 'yp' })
      } else if (dayWorked >= _dailyYe) {
        dailyFixed.push({ ...sl, category: 'ye' })
      } else {
        eligible.push(sl)
      }
      dayWorked += sl.hours
    }
    dailyEligible.push(eligible)
  }

  // Phase 2: round-robin weekly bucketing of eligible slices.
  // Cycle Mon→Sun→Mon, taking up to 1 HOUR (4 slices) per day per pass.
  // Each slice is classified based on cumulative weekly hours from eligible slices:
  //   0 … weekTarget          → within
  //   weekTarget … weeklyMax  → additional  (part-time only; full-time skips to ye)
  //   weeklyMax  … yeMax      → ye
  //   yeMax+                  → yp
  // Note: eligible slices are only 0–8h/day; 8h+ are already fixed in Phase 1.
  const SLICES_PER_ROUND = 4 // 4 × 15min = 1 hour per day per round
  const weeklyClassified = []
  const ptrs = new Array(7).fill(0)
  let weekWorked = 0
  let anyLeft = true
  while (anyLeft) {
    anyLeft = false
    for (let i = 0; i < 7; i++) {
      if (ptrs[i] >= dailyEligible[i].length) continue
      anyLeft = true
      const take = Math.min(SLICES_PER_ROUND, dailyEligible[i].length - ptrs[i])
      for (let j = 0; j < take; j++) {
        const sl = dailyEligible[i][ptrs[i]++]
        let category
        if (weekWorked >= _weekYe4) {
          category = 'yp'
        } else if (weekWorked >= _weekNorm4) {
          category = 'ye'
        } else if (weekWorked >= Number(weekTarget || _weekNorm4)) {
          category = 'additional'
        } else {
          category = 'within'
        }
        weekWorked += sl.hours
        weeklyClassified.push({ ...sl, category })
      }
    }
  }

  // Merge and restore chronological order for downstream consumers
  return [...weeklyClassified, ...dailyFixed].sort((a, b) => a.absOrder.localeCompare(b.absOrder))
}

function getEmployeeDayPayrollMetrics(employeeId, day) {
  const weekKey = getWeekKeyFromDateStr(day)
  const slices = classifyWeekSlices(employeeId, weekKey).filter((s) => (s.sourceDay || s.day) === day)
  const out = { total: 0, night: 0, ye: 0, yp: 0, additional: 0, illegal: 0, holiday75: 0 }
  slices.forEach((s) => {
    out.total += s.hours
    if (s.isNight) out.night += s.hours
    if (s.isHoliday) out.holiday75 += s.hours
    if (s.category === 'ye') out.ye += s.hours
    else if (s.category === 'yp') out.yp += s.hours
    else if (s.category === 'additional') out.additional += s.hours
    else if (s.category === 'illegal') out.illegal += s.hours
  })
  Object.keys(out).forEach((k) => {
    out[k] = Math.round(out[k] * 100) / 100
  })
  return out
}

const PAYROLL_CATEGORIES = [
  { key: 'within', label: 'Εντός' },
  { key: 'additional', label: 'Πρόσθετη' },
  { key: 'ye', label: 'Υπεργασία' },
  { key: 'yp', label: 'Υπερωρίες' },
  { key: 'illegal', label: 'Παράνομες' },
]

const PAYROLL_BUCKET_KEYS = PAYROLL_CATEGORIES.flatMap((c) => [
  `${c.key}_work_day`,
  `${c.key}_work_night`,
  `${c.key}_holiday_day`, // official public holiday
  `${c.key}_holiday_night`,
  `${c.key}_sunday_day`, // Sunday (not official holiday)
  `${c.key}_sunday_night`,
])

function emptyPayrollBuckets() {
  const out = {}
  PAYROLL_BUCKET_KEYS.forEach((k) => {
    out[k] = 0
  })
  return out
}

function payrollBucketKey(category, isHoliday, isNight, isOfficialHoliday = true) {
  const dayType = isHoliday ? (isOfficialHoliday ? 'holiday' : 'sunday') : 'work'
  return `${category}_${dayType}_${isNight ? 'night' : 'day'}`
}

function bucketPayMultiplier(bucketKey) {
  const isNight = String(bucketKey).endsWith('_night')
  const isOfficialHoliday = String(bucketKey).includes('_holiday_')
  const isSunday = String(bucketKey).includes('_sunday_')
  const isHolidayOrSunday = isOfficialHoliday || isSunday
  const cat = String(bucketKey).split('_')[0]

  const mults = getRule('multipliers') || {}
  const premiumMode = (getRule('categoryPremiumMode') || {})[cat] || 'multiplicative'
  const base = Number(mults[cat] ?? 0)

  if (premiumMode === 'additive') {
    // 'within' category: base hour already covered by salary.
    // Official holiday: base re-included (fully paid) when holidayHoursFullyPaid = true.
    // Plain Sunday: premium-only (base in salary), so no base re-inclusion.
    const nightAdd = isNight ? getRule('withinNightAdd') : 0
    const holidayAdd = isHolidayOrSunday ? getRule('withinHolidayAdd') : 0
    const baseMultiplier =
      (isOfficialHoliday && getRule('holidayHoursFullyPaid') !== false) || !isHolidayOrSunday ? 1 : 0
    return baseMultiplier + nightAdd + holidayAdd
  }

  // 'multiplicative' mode: overtime/additional categories.
  // Apply premium factors on top of the category base multiplier.
  let mult = base
  if (isNight) mult *= getRule('nightPremiumFactor')
  if (isHolidayOrSunday) mult *= getRule('holidayPremiumFactor')
  return mult
}

function bucketAmount(hours, bucketKey, hourlyRate) {
  return Number(hours || 0) * Number(hourlyRate || 0) * bucketPayMultiplier(bucketKey)
}

function getEmployeeDayBucketMetrics(employeeId, day) {
  const weekKey = getWeekKeyFromDateStr(day)
  const slices = classifyWeekSlices(employeeId, weekKey).filter((s) => (s.sourceDay || s.day) === day)
  const out = emptyPayrollBuckets()
  slices.forEach((s) => {
    const cat = ['within', 'additional', 'ye', 'yp', 'illegal'].includes(s.category) ? s.category : 'within'
    const k = payrollBucketKey(cat, !!s.isHoliday, !!s.isNight, !!s.isOfficialHoliday)
    out[k] = (out[k] || 0) + Number(s.hours || 0)
  })
  Object.keys(out).forEach((k) => {
    out[k] = Math.round(out[k] * 100) / 100
  })
  return out
}

function sumBucketMetrics(list) {
  const out = emptyPayrollBuckets()
  list.forEach((obj) => {
    PAYROLL_BUCKET_KEYS.forEach((k) => {
      out[k] += Number(obj?.[k] || 0)
    })
  })
  PAYROLL_BUCKET_KEYS.forEach((k) => {
    out[k] = Math.round(out[k] * 100) / 100
  })
  return out
}

function payrollDayMetrics(day, employeeId = '') {
  const empIds = employeeId ? [String(employeeId)] : (data.employees || []).map((e) => String(e.vat))
  const perEmp = empIds.map((eid) => getEmployeeDayBucketMetrics(eid, day))
  const buckets = sumBucketMetrics(perEmp)
  const total = PAYROLL_BUCKET_KEYS.reduce((acc, k) => acc + Number(buckets[k] || 0), 0)
  const night = PAYROLL_BUCKET_KEYS.filter((k) => k.endsWith('_night')).reduce(
    (acc, k) => acc + Number(buckets[k] || 0),
    0,
  )
  const additional = [
    'additional_work_day',
    'additional_work_night',
    'additional_holiday_day',
    'additional_holiday_night',
    'additional_sunday_day',
    'additional_sunday_night',
  ].reduce((a, k) => a + Number(buckets[k] || 0), 0)
  const ye = [
    'ye_work_day',
    'ye_work_night',
    'ye_holiday_day',
    'ye_holiday_night',
    'ye_sunday_day',
    'ye_sunday_night',
  ].reduce((a, k) => a + Number(buckets[k] || 0), 0)
  const yp = [
    'yp_work_day',
    'yp_work_night',
    'yp_holiday_day',
    'yp_holiday_night',
    'yp_sunday_day',
    'yp_sunday_night',
  ].reduce((a, k) => a + Number(buckets[k] || 0), 0)
  const illegal = [
    'illegal_work_day',
    'illegal_work_night',
    'illegal_holiday_day',
    'illegal_holiday_night',
    'illegal_sunday_day',
    'illegal_sunday_night',
  ].reduce((a, k) => a + Number(buckets[k] || 0), 0)
  const holiday75 = PAYROLL_BUCKET_KEYS.filter(
    (k) => k.includes('_holiday_') || k.includes('_sunday_'),
  ).reduce((a, k) => a + Number(buckets[k] || 0), 0)
  return {
    ...buckets,
    holiday75: Math.round(holiday75 * 100) / 100,
    night: Math.round(night * 100) / 100,
    additional: Math.round(additional * 100) / 100,
    ye: Math.round(ye * 100) / 100,
    yp: Math.round(yp * 100) / 100,
    illegal: Math.round(illegal * 100) / 100,
    total: Math.round(total * 100) / 100,
  }
}

function classifyDayType(day, employeeId = '') {
  const empIds = employeeId ? [String(employeeId)] : (data.employees || []).map((e) => String(e.vat))
  let hasWork = false
  let hasPaidLeave = false
  let hasUnpaidLeave = false
  let hasAN = false
  let hasME = false

  empIds.forEach((eid) => {
    const sh = data.shifts?.[`${eid}_${day}`]
    if (!sh) return
    if (isWorkingType(sh)) hasWork = true
    else if (isAbsenceType(sh.type) && isPaidAbsenceType(sh.type)) hasPaidLeave = true
    else if (isAbsenceType(sh.type) && !isPaidAbsenceType(sh.type)) hasUnpaidLeave = true
    else if (String(sh.type).trim() === 'AN') hasAN = true
    else if (String(sh.type).trim() === 'ΜΕ' || String(sh.type).trim() === 'ME') hasME = true
  })

  if (hasWork && !hasPaidLeave && !hasUnpaidLeave && !hasAN && !hasME)
    return { code: 'ΕΡΓ', text: 'Εργασία', color: '#dbeafe', fg: '#1e40af' }
  if (!hasWork && hasPaidLeave && !hasUnpaidLeave && !hasAN && !hasME)
    return { code: 'ΑΔ+', text: 'Άδεια με αποδοχές', color: '#dcfce7', fg: '#166534' }
  if (!hasWork && hasUnpaidLeave && !hasAN && !hasME)
    return { code: 'ΑΔ', text: 'Άδεια χωρίς αποδοχές', color: '#ffedd5', fg: '#9a3412' }
  if (!hasWork && hasAN && !hasME && !hasPaidLeave && !hasUnpaidLeave)
    return { code: 'AN', text: 'Ανάπαυση', color: '#e2e8f0', fg: '#334155' }
  if (!hasWork && hasME && !hasAN && !hasPaidLeave && !hasUnpaidLeave)
    return { code: 'ΜΕ', text: 'Μη εργασία', color: '#dbeafe', fg: '#1e3a8a' }
  if (hasWork || hasPaidLeave || hasUnpaidLeave || hasAN || hasME)
    return { code: 'MIX', text: 'Μικτό', color: '#f1f5f9', fg: '#475569' }
  return { code: '-', text: 'Χωρίς καταχώριση', color: '#f8fafc', fg: '#64748b' }
}

function expandToFullMonth(rows, monthFilter) {
  const out = { ...rows }
  if (!monthFilter || !/^\d{4}-\d{2}$/.test(monthFilter)) return out
  const [y, m] = monthFilter.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (!(key in out)) out[key] = 0
  }
  return out
}

function setPayrollSummaryTab(tab) {
  const hoursPanel = document.getElementById('payrollTabHours')
  const amountPanel = document.getElementById('payrollTabAmounts')
  const btnHours = document.getElementById('payrollTabBtnHours')
  const btnAmounts = document.getElementById('payrollTabBtnAmounts')
  if (!hoursPanel || !amountPanel || !btnHours || !btnAmounts) return

  const showHours = tab !== 'amounts'
  hoursPanel.style.display = showHours ? 'block' : 'none'
  amountPanel.style.display = showHours ? 'none' : 'block'
  btnHours.classList.toggle('active', showHours)
  btnAmounts.classList.toggle('active', !showHours)
}

function togglePayrollWeek(weekId) {
  const weekBody = document.getElementById(weekId)
  const toggle = document.getElementById(weekId + '-toggle')
  if (!weekBody || !toggle) return

  const isVisible = weekBody.style.display !== 'none'
  weekBody.style.display = isVisible ? 'none' : ''
  toggle.textContent = isVisible ? '▶' : '▼'
}

function renderDailyPayrollTable(title, rows, employeeId = '', monthFilter = '') {
  const fullRows = expandToFullMonth(rows || {}, monthFilter)
  const entries = Object.entries(fullRows).sort((a, b) => a[0].localeCompare(b[0]))
  if (entries.length === 0) {
    return `<h3>${title}</h3><p style="color:#777; margin-bottom:12px;">No data</p>`
  }

  const fmtHours = (v) => {
    const n = Number(v || 0)
    return Math.abs(n) < 1e-9 ? '&nbsp;' : n.toFixed(2)
  }
  const fmtAmount = (v) => {
    const n = Number(v || 0)
    return Math.abs(n) < 1e-9 ? '&nbsp;' : `€${n.toFixed(2)}`
  }

  const subtotalRow = (labelHtml, totals) => {
    const cells = PAYROLL_BUCKET_KEYS.map((k) => `<td><strong>${fmtHours(totals[k])}</strong></td>`).join('')
    return `<tr class="week-separator"><td colspan="3">${labelHtml}</td>${cells}</tr>`
  }

  const amountSubtotalRow = (labelHtml, totals, hourlyRate) => {
    const cells = PAYROLL_BUCKET_KEYS.map(
      (k) => `<td><strong>${fmtAmount(bucketAmount(totals[k], k, hourlyRate))}</strong></td>`,
    ).join('')
    return `<tr class="week-separator"><td colspan="3">${labelHtml}</td>${cells}</tr>`
  }

  // Group entries by week
  const weekGroups = []
  let currentWeekKey = ''
  let currentWeekDays = []
  let currentWeekAgg = emptyPayrollBuckets()

  entries.forEach(([day], idx) => {
    const weekKey = getWeekKeyFromDateStr(day)

    if (currentWeekKey && weekKey !== currentWeekKey) {
      // Save previous week
      weekGroups.push({
        weekKey: currentWeekKey,
        days: currentWeekDays,
        agg: { ...currentWeekAgg },
      })
      currentWeekDays = []
      currentWeekAgg = emptyPayrollBuckets()
    }

    currentWeekKey = weekKey
    const m = payrollDayMetrics(day, employeeId)
    PAYROLL_BUCKET_KEYS.forEach((k) => {
      currentWeekAgg[k] += Number(m[k] || 0)
    })
    currentWeekDays.push({ day, metrics: m })

    // Last entry
    if (idx === entries.length - 1) {
      weekGroups.push({
        weekKey: currentWeekKey,
        days: currentWeekDays,
        agg: { ...currentWeekAgg },
      })
    }
  })

  // Find employee by VAT, with fallback to first employee if not found
  let selectedEmp = (data.employees || []).find((e) => String(e.vat) === String(employeeId || ''))
  if (!selectedEmp && employeeId && data.employees.length > 0) {
    selectedEmp = data.employees[0]
  }

  const isMonthly = selectedEmp?.payType === 'monthly'
  const weekHoursCfg = Number(selectedEmp?.weekWorkingHours || 40)
  const monthlySalary = Number(selectedEmp?.monthlySalary || 0)
  const baseHourlyRate =
    isMonthly && weekHoursCfg > 0
      ? monthlySalary / ((weekHoursCfg * getRule('monthlyWorkingDays')) / 6)
      : Number(selectedEmp?.hourlyRate || 0)

  // Calculate month totals
  let monthAgg = emptyPayrollBuckets()
  weekGroups.forEach((wk) => {
    PAYROLL_BUCKET_KEYS.forEach((k) => {
      monthAgg[k] += Number(wk.agg[k] || 0)
    })
  })

  // Build HTML with collapsible weeks
  let hoursHTML = ''
  let amountsHTML = ''

  weekGroups.forEach((week, weekIdx) => {
    const weekStart = parseISODateLocal(week.weekKey)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const weekLabel = `${weekStart.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' })} - ${weekEnd.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' })}`
    const weekId = `payroll-week-${monthFilter}-${weekIdx}`

    // Week total cells
    const weekTotalCells = PAYROLL_BUCKET_KEYS.map(
      (k) => `<td><strong>${fmtHours(week.agg[k])}</strong></td>`,
    ).join('')
    const weekAmountCells = PAYROLL_BUCKET_KEYS.map(
      (k) => `<td><strong>${fmtAmount(bucketAmount(week.agg[k], k, baseHourlyRate))}</strong></td>`,
    ).join('')

    // Build week rows (hours)
    let weekBodyHours = ''
    week.days.forEach(({ day, metrics }) => {
      const t = classifyDayType(day, employeeId)
      const badge = `<span style="display:inline-block;padding:1px 5px;border-radius:999px;background:${t.color};color:${t.fg};font-weight:700;" title="${t.text}">${t.code}</span>`
      const timeText = dayTimeText(day, employeeId)
      const bucketCells = PAYROLL_BUCKET_KEYS.map((k) => `<td>${fmtHours(metrics[k])}</td>`).join('')
      weekBodyHours += `<tr><td>${formatPayrollDayLabel(day)}</td><td style="text-align:left;">${badge}</td><td style="text-align:left;">${timeText}</td>${bucketCells}</tr>`
    })

    // Build week rows (amounts)
    let weekBodyAmounts = ''
    week.days.forEach(({ day, metrics }) => {
      const t = classifyDayType(day, employeeId)
      const badge = `<span style="display:inline-block;padding:1px 5px;border-radius:999px;background:${t.color};color:${t.fg};font-weight:700;" title="${t.text}">${t.code}</span>`
      const timeText = dayTimeText(day, employeeId)
      const amountCells = PAYROLL_BUCKET_KEYS.map(
        (k) => `<td>${fmtAmount(bucketAmount(metrics[k], k, baseHourlyRate))}</td>`,
      ).join('')
      weekBodyAmounts += `<tr><td>${formatPayrollDayLabel(day)}</td><td style="text-align:left;">${badge}</td><td style="text-align:left;">${timeText}</td>${amountCells}</tr>`
    })

    hoursHTML += `
      <tr class="payroll-week-header" onclick="togglePayrollWeek('${weekId}-hours')">
        <td colspan="3" style="cursor: pointer; user-select: none;">
          <span class="payroll-week-toggle" id="${weekId}-hours-toggle">▶</span>
          <strong>Εβδομάδα ${weekIdx + 1}</strong> <small>${weekLabel}</small>
        </td>
        ${weekTotalCells}
      </tr>
      <tbody id="${weekId}-hours" class="payroll-week-body" style="display:none;">
        ${weekBodyHours}
      </tbody>
    `

    amountsHTML += `
      <tr class="payroll-week-header" onclick="togglePayrollWeek('${weekId}-amounts')">
        <td colspan="3" style="cursor: pointer; user-select: none;">
          <span class="payroll-week-toggle" id="${weekId}-amounts-toggle">▶</span>
          <strong>Εβδομάδα ${weekIdx + 1}</strong> <small>${weekLabel}</small>
        </td>
        ${weekAmountCells}
      </tr>
      <tbody id="${weekId}-amounts" class="payroll-week-body" style="display:none;">
        ${weekBodyAmounts}
      </tbody>
    `
  })

  const catHead1 = PAYROLL_CATEGORIES.map((c) => `<th colspan="6">${c.label}</th>`).join('')
  const catHead2 = PAYROLL_CATEGORIES.map(
    () => `<th colspan="2">Εργ.</th><th colspan="2">Αργία</th><th colspan="2">Κυρ.</th>`,
  ).join('')
  const catHead3 = PAYROLL_CATEGORIES.map(
    () => `<th>Ημ.</th><th>Νυχ.</th><th>Ημ.</th><th>Νυχ.</th><th>Ημ.</th><th>Νυχ.</th>`,
  ).join('')

  return `
    <div class="payroll-tabs">
      <button id="payrollTabBtnHours" class="payroll-tab-btn active" onclick="setPayrollSummaryTab('hours')">Ώρες</button>
      <button id="payrollTabBtnAmounts" class="payroll-tab-btn" onclick="setPayrollSummaryTab('amounts')">Ποσά (€)</button>
    </div>

    <div id="payrollTabHours">
      <h3 style="margin:10px 0 6px;">${title}</h3>
      <div class="schedule-container" style="padding:10px; margin-bottom:10px;">
        <table class="schedule-table payroll-table">
          <thead>
            <tr>
              <th rowspan="3">Ημ/νία</th>
              <th rowspan="3">Τύπ.</th>
              <th rowspan="3" style="text-align:left;">Ώρα</th>
              ${catHead1}
            </tr>
            <tr>${catHead2}</tr>
            <tr>${catHead3}</tr>
          </thead>
          ${hoursHTML}
          <tfoot>
            ${subtotalRow('<strong>Σύνολα μήνα</strong>', monthAgg)}
          </tfoot>
        </table>
      </div>
    </div>

    <div id="payrollTabAmounts" style="display:none;">
      <h3 style="margin:10px 0 6px;">Daily Amounts (€)</h3>
      <div class="schedule-container" style="padding:10px; margin-bottom:10px;">
        <p style="margin:0 0 8px; color:#64748b; font-size:0.85em;">Βάση υπολογισμού: €${baseHourlyRate.toFixed(2)}/ώρα</p>
        <table class="schedule-table payroll-table">
          <thead>
            <tr>
              <th rowspan="3">Ημ/νία</th>
              <th rowspan="3">Τύπ.</th>
              <th rowspan="3" style="text-align:left;">Ώρα</th>
              ${catHead1}
            </tr>
            <tr>${catHead2}</tr>
            <tr>${catHead3}</tr>
          </thead>
          ${amountsHTML}
          <tfoot>
            ${amountSubtotalRow('<strong>Σύνολα μήνα</strong>', monthAgg, baseHourlyRate)}
          </tfoot>
        </table>
      </div>
    </div>
  `
}

function calculateMonthlyPayrollOverview(employeeId, monthFilter) {
  const emp = (data.employees || []).find((e) => String(e.vat) === String(employeeId || ''))
  if (!emp || !monthFilter) {
    // Fallback: return null but log for debugging
    console.warn(
      'Employee not found for payroll:',
      employeeId,
      'in',
      (data.employees || []).map((e) => e.vat),
    )
    return null
  }

  const weekHoursCfg = Number(emp.weekWorkingHours || 40)
  const monthlySalary = Number(emp.monthlySalary || 0)
  const isMonthly = emp.payType === 'monthly'
  const baseHourlyRate =
    isMonthly && weekHoursCfg > 0
      ? monthlySalary / ((weekHoursCfg * getRule('monthlyWorkingDays')) / 6)
      : Number(emp.hourlyRate || 0)

  const fullRows = expandToFullMonth({}, monthFilter)
  const days = Object.keys(fullRows).sort()
  const monthBuckets = emptyPayrollBuckets()
  days.forEach((day) => {
    const m = payrollDayMetrics(day, String(employeeId))
    PAYROLL_BUCKET_KEYS.forEach((k) => {
      monthBuckets[k] += Number(m[k] || 0)
    })
  })

  let extraTotal = 0
  const nonZeroHours = {}
  const nonZeroAmounts = {}

  // First pass: collect all amounts
  PAYROLL_BUCKET_KEYS.forEach((k) => {
    const h = Math.round(monthBuckets[k] * 100) / 100
    if (Math.abs(h) > 1e-9) nonZeroHours[k] = h
    if (!k.startsWith('within_')) {
      const amt = bucketAmount(h, k, baseHourlyRate)
      const a = Math.round(amt * 100) / 100
      if (Math.abs(a) > 1e-9) nonZeroAmounts[k] = a
      extraTotal += a
    }
  })

  let salaryTotal = 0
  if (isMonthly) {
    const _mwd = getRule('monthlyWorkingDays')
    const _wd = Number(emp.weekWorkingDays || 5)
    const _hourlyRateDed = weekHoursCfg > 0 ? monthlySalary / ((weekHoursCfg * _mwd) / 6) : 0
    const _dailyHoursDed = _wd > 0 ? weekHoursCfg / _wd : 0
    const absDays = countMonthlyAbsenceDaysInMonth(emp.vat, monthFilter, _wd)
    const deduction = absDays * _dailyHoursDed * _hourlyRateDed
    salaryTotal = Math.max(0, monthlySalary - deduction)
  } else {
    // Hourly employees: salaryTotal = within hours (work day + work night) × hourly rate
    const withinWorkDayHours = Math.round(monthBuckets['within_work_day'] * 100) / 100
    const withinWorkNightHours = Math.round(monthBuckets['within_work_night'] * 100) / 100

    // Calculate salary from within hours with their appropriate multipliers
    const withinDayAmount = bucketAmount(withinWorkDayHours, 'within_work_day', baseHourlyRate)
    const withinNightAmount = bucketAmount(withinWorkNightHours, 'within_work_night', baseHourlyRate)
    salaryTotal = Math.round((withinDayAmount + withinNightAmount) * 100) / 100

    // Record within amounts in hours map
    if (withinWorkDayHours > 1e-9) nonZeroHours['within_work_day'] = withinWorkDayHours
    if (withinWorkNightHours > 1e-9) nonZeroHours['within_work_night'] = withinWorkNightHours
    if (withinDayAmount > 1e-9) nonZeroAmounts['within_work_day'] = Math.round(withinDayAmount * 100) / 100
    if (withinNightAmount > 1e-9)
      nonZeroAmounts['within_work_night'] = Math.round(withinNightAmount * 100) / 100
  }

  const grandTotal = salaryTotal + extraTotal
  return {
    baseHourlyRate: Math.round(baseHourlyRate * 10000) / 10000,
    salaryTotal: Math.round(salaryTotal * 100) / 100,
    extraTotal: Math.round(extraTotal * 100) / 100,
    grandTotal: Math.round(grandTotal * 100) / 100,
    hours: nonZeroHours,
    amounts: nonZeroAmounts,
  }
}

function renderPayrollTable(title, rows, isMonth = false) {
  const entries = Object.entries(rows || {})
  if (entries.length === 0) {
    return `<h3>${title}</h3><p style="color:#777; margin-bottom:12px;">No data</p>`
  }

  const monthKey = String(entries[0][0] || '')
  const monthHours = Number(entries[0][1] || 0)
  const selectedEmpId = document.getElementById('payrollEmployeeFilter')?.value
  const overview =
    isMonth && selectedEmpId ? calculateMonthlyPayrollOverview(String(selectedEmpId), monthKey) : null

  // Use actual worked hours from slice-based calculation when available,
  // falling back to the aggregated contracted-daily total for non-monthly/overview-less cases.
  const displayHours = overview
    ? Math.round(Object.values(overview.hours || {}).reduce((a, v) => a + Number(v || 0), 0) * 100) / 100
    : monthHours

  const fmt = (v) => (Math.abs(Number(v || 0)) < 1e-9 ? '&nbsp;' : `€${Number(v).toFixed(2)}`)

  const body = `
    <tr>
      <td>${monthKey}</td>
      <td>${displayHours.toFixed(2)}</td>
      <td>${overview ? fmt(overview.salaryTotal) : '&nbsp;'}</td>
      <td>${overview ? fmt(overview.extraTotal) : '&nbsp;'}</td>
      <td><strong>${overview ? fmt(overview.grandTotal) : '&nbsp;'}</strong></td>
    </tr>
  `

  return `
    <h3 style="margin:10px 0 6px;">${title}</h3>
    <div class="schedule-container" style="padding:10px; margin-bottom:10px;">
      <table class="schedule-table payroll-table">
        <thead><tr><th>Περίοδος</th><th>Ώρες</th><th>Σύνολο μισθού</th><th>Σύνολο extra</th><th>Γενικό Σύνολο</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `
}

async function renderPayrollSummary() {
  const content = document.getElementById('payrollSummaryContent')
  const employeeId = document.getElementById('payrollEmployeeFilter')?.value
  const monthFilter = getPayrollMonthFilterValue()

  try {
    if (!monthFilter) {
      content.innerHTML = '<p style="color:#777;">Επίλεξε μήνα.</p>'
      return
    }
    const payload = aggregatePayrollClient(data, employeeId ? String(employeeId) : null)

    const dailyFiltered = Object.fromEntries(
      Object.entries(payload.daily || {}).filter(([day]) => day.startsWith(monthFilter)),
    )
    const monthlyFiltered = Object.fromEntries(
      Object.entries(payload.monthly || {}).filter(([month]) => month === monthFilter),
    )

    content.innerHTML =
      `<p style="margin: 0 0 8px; color:#555;"><strong>Month:</strong> ${monthFilter}</p>` +
      renderDailyPayrollTable('Daily Hours', dailyFiltered, employeeId || '', monthFilter) +
      renderPayrollTable('Σύνολα Μήνα', monthlyFiltered, true)
  } catch (err) {
    console.error(err)
    content.innerHTML = '<p style="color:#c0392b;">Failed to calculate payroll data.</p>'
  }
}

function shiftHours(start, end) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startM = sh * 60 + sm
  let endM = eh * 60 + em
  if (endM <= startM) endM += 24 * 60
  return Math.round(((endM - startM) / 60) * 100) / 100
}

function nightHours(start, end) {
  // Delegates to calculateNightHours (hours-calc.js) which holds the canonical
  // implementation. Rounds to 2 decimal places for payroll precision.
  return Math.round(calculateNightHours(start, end) * 100) / 100
}

function weekMondayISO(dayStr) {
  const d = parseISODateLocal(dayStr)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday-first
  d.setDate(diff)
  return formatISODateLocal(d)
}

function aggregatePayrollClient(state, employeeId = null) {
  const shifts = state.shifts || {}
  const employees = state.employees || []
  const weekHolidays = state.weekHolidays || {}
  const weekSettings = state.weekEmployeeSettings || {}
  const rules = state.payrollRules || {}
  const absence = rules.absencePolicies || {}
  const officialPaidIfAbsent = rules.officialHolidayPaidIfAbsent !== false
  const officialMultiplier = Number(rules.officialHolidayPayMultiplier ?? 1) || 1

  const empMap = new Map((employees || []).map((e) => [String(e.vat || ''), e]))
  const selectedIds = employeeId != null ? [String(employeeId)] : [...empMap.keys()]

  const daily = {}
  const weekly = {}
  const monthly = {}

  const datesByEmp = new Map(selectedIds.map((id) => [id, new Set()]))

  Object.keys(shifts).forEach((key) => {
    const [empStr, dayStr] = key.split('_')
    const eid = String(empStr)
    if (!datesByEmp.has(eid)) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) return
    datesByEmp.get(eid).add(dayStr)
  })

  Object.entries(weekHolidays).forEach(([wk, idxs]) => {
    const wkDate = parseISODateLocal(wk)
    if (isNaN(wkDate.getTime())) return
    ;(idxs || []).forEach((idx) => {
      const d = new Date(wkDate)
      d.setDate(d.getDate() + Number(idx))
      const day = formatISODateLocal(d)
      selectedIds.forEach((eid) => datesByEmp.get(eid)?.add(day))
    })
  })

  // Ensure payroll considers non-Sunday closed days even when there is no shift record
  Object.entries(state.weekBusinessHours || {}).forEach(([wk, bh]) => {
    const wkDate = parseISODateLocal(wk)
    if (isNaN(wkDate.getTime())) return
    for (let idx = 0; idx < 7; idx++) {
      if (idx === 6) continue // Sunday excluded by rule
      if (!bh?.[idx]?.closed) continue
      const d = new Date(wkDate)
      d.setDate(d.getDate() + idx)
      const day = formatISODateLocal(d)
      selectedIds.forEach((eid) => datesByEmp.get(eid)?.add(day))
    }
  })

  // Monthly-paid employees: include all days of configured weeks so planned-day rule is evaluated
  Object.keys(state.weekBusinessHours || {}).forEach((wk) => {
    const wkDate = parseISODateLocal(wk)
    if (isNaN(wkDate.getTime())) return
    selectedIds.forEach((eid) => {
      const emp = empMap.get(eid)
      if (!emp || emp.payType !== 'monthly') return
      for (let idx = 0; idx < 7; idx++) {
        const d = new Date(wkDate)
        d.setDate(d.getDate() + idx)
        datesByEmp.get(eid)?.add(formatISODateLocal(d))
      }
    })
  })

  selectedIds.forEach((eid) => {
    const emp = empMap.get(eid)
    if (!emp) return
    const dates = [...(datesByEmp.get(eid) || [])].sort()
    dates.forEach((dayKey) => {
      const d = new Date(`${dayKey}T00:00:00`)
      const weekKey = weekMondayISO(dayKey)
      const monthKey = dayKey.slice(0, 7)
      const dayIdx = (d.getDay() + 6) % 7 // Monday=0

      const holidayIdxs = new Set(weekHolidays[weekKey] || [])
      const isOfficialHoliday = holidayIdxs.has(dayIdx)
      const isSunday = dayIdx === 6
      const isHolidayOrSunday = isOfficialHoliday || isSunday
      const weekBusiness = (state.weekBusinessHours || {})[weekKey] || state.defaultBusinessHours || {}
      const isClosedNonSunday = false

      const ws = weekSettings[`${weekKey}_${eid}`] || {}
      const workingHours = getWorkingHours(ws, getWorkingHours(emp, 40))
      const standardDaily = Math.round((workingHours / 5) * 100) / 100

      const shift = shifts[`${eid}_${dayKey}`]
      let payable = 0

      if (emp?.payType === 'monthly') {
        const weekDays = Number(emp.weekWorkingDays || 5)
        const weekHours = Number(emp.weekWorkingHours || 40)
        const planned = getMonthlyPlannedDayIndexes(weekDays)
        const perDay = weekDays > 0 ? weekHours / weekDays : 0
        if (planned.includes(dayIdx) && !isOfficialHoliday) {
          if (isWorkingType(shift)) {
            payable = Math.round(perDay * 100) / 100
          } else if (shift && isAbsenceType(shift.type) && isPaidAbsenceType(shift.type)) {
            // paid leave (e.g. ΑΔΚΑΝ) counts as worked-equivalent for monthly employees
            payable = Math.round(perDay * 100) / 100
          }
        }
      } else if (isWorkingType(shift)) {
        const worked =
          shiftHours(shift.start || '00:00', shift.end || '00:00') +
          (shift.start2 && shift.end2 ? shiftHours(shift.start2, shift.end2) : 0)
        const night =
          nightHours(shift.start || '00:00', shift.end || '00:00') +
          (shift.start2 && shift.end2 ? nightHours(shift.start2, shift.end2) : 0)
        let premiumFactor = 1
        // Official holiday (even if it falls on a Sunday) → fully paid: base 1 + 75 % = ×1.75.
        // Plain Sunday within contracted hours → +75 % extra only (base already in salary).
        if (isOfficialHoliday && getRule('holidayHoursFullyPaid') !== false) {
          premiumFactor = 1 + getRule('withinHolidayAdd')
        } else if (isHolidayOrSunday) {
          premiumFactor += getRule('withinHolidayAdd')
        }
        if (night > 0 && worked > 0) premiumFactor += (night / worked) * getRule('withinNightAdd')
        payable = Math.round(worked * premiumFactor * 100) / 100
      } else {
        if (shift && isAbsenceType(shift.type)) {
          if (isPaidAbsenceType(shift.type) && !isSunday) {
            payable = Math.max(payable, Math.round(standardDaily * 100) / 100)
          }
        }
        if (isClosedNonSunday) {
          payable = Math.max(payable, Math.round(standardDaily * 100) / 100)
        }
        if (!isSunday && isOfficialHoliday && officialPaidIfAbsent) {
          payable = Math.max(payable, Math.round(standardDaily * officialMultiplier * 100) / 100)
        }
      }

      if (payable > 0) {
        daily[dayKey] = Math.round((daily[dayKey] || 0) + payable)
        weekly[weekKey] = Math.round((weekly[weekKey] || 0) + payable)
        monthly[monthKey] = Math.round((monthly[monthKey] || 0) + payable)
      }
    })
  })

  return {
    daily: Object.fromEntries(Object.entries(daily).sort(([a], [b]) => a.localeCompare(b))),
    weekly: Object.fromEntries(Object.entries(weekly).sort(([a], [b]) => a.localeCompare(b))),
    monthly: Object.fromEntries(Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b))),
  }
}

// Export/Import/Print
