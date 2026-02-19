// Data structures
// const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAYS = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή']
// const DAY_ABBREV = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_ABBREV = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ']

// Default business hours (template for new weeks)
const DEFAULT_BUSINESS_HOURS = {
  0: { open: '09:00', close: '17:00', closed: false }, // Monday
  1: { open: '09:00', close: '17:00', closed: false },
  2: { open: '09:00', close: '17:00', closed: false },
  3: { open: '09:00', close: '17:00', closed: false },
  4: { open: '09:00', close: '17:00', closed: false },
  5: { open: '09:00', close: '20:00', closed: false }, // Saturday
  6: { open: '09:00', close: '17:00', closed: false }, // Sunday
}

let data = {
  employees: [],
  defaultBusinessHours: JSON.parse(JSON.stringify(DEFAULT_BUSINESS_HOURS)),
  defaultEmployeeSettings: { workingHours: 40, restDays: [5, 6], hourlyRate: 10 },
  payrollRules: {
    absencePolicies: {
      holiday: { paid: true, multiplier: 1.0 },
      sick: { paid: false, multiplier: 0.0 },
      other: { paid: false, multiplier: 0.0 },
    },
    officialHolidayPaidIfAbsent: true,
    officialHolidayPayMultiplier: 1.0,
  },
  weekBusinessHours: {}, // key: "YYYY-MM-DD" (Monday of week), value: business hours for week
  weekRestDays: {}, // key: "YYYY-MM-DD_employeeId", value: array of rest day indices
  weekEmployeeSettings: {}, // key: "YYYY-MM-DD_employeeVat", value: {workingHours}
  weekHolidays: {}, // key: "YYYY-MM-DD" (Monday of week), value: array of day indices (0-6) that are holidays
  shifts: {}, // key: "employeeId_YYYY-MM-DD", value: shift object
}

let currentWeekStart = getMonday(new Date())
let selectedTimelineDay = 0 // 0 = Monday


// Multi-cell selection state
let selectedCells = [] // Array of {employeeId, dateStr} objects
let isMultiSelectMode = false

function isWorkingType(shift) {
  const t = String(shift?.type || '').trim()
  return t === 'ΕΡΓ' || t === 'ΤΗΛ'
}

function isNonWorkingType(shift) {
  const t = String(shift?.type || '').trim()
  return !!shift && (t === 'ΜΕ' || t === 'ME')
}

function getAdeies() {
  return Array.isArray(window.ADEIES) ? window.ADEIES : []
}

function isAbsenceType(type) {
  const t = String(type || '').trim()
  // ΜΕ is a non-working marker, not a leave/absence type in payroll logic
  if (t === 'ΜΕ' || t === 'ME') return false
  return getAdeies().some((a) => String(a.code || '').trim() === t)
}

function isPaidAbsenceType(type) {
  const t = String(type || '')
  const r = getAdeies().find((a) => a.code === t)
  return !!r?.paid
}

function absenceLabel(type) {
  const t = String(type || '')
  const r = getAdeies().find((a) => a.code === t)
  return r?.name || t
}

function populateAdeiesInShiftType() {
  const sel = document.getElementById('shiftType')
  if (!sel) return
  getAdeies().forEach((a) => {
    if ([...sel.options].some((o) => o.value === a.code)) return
    const opt = document.createElement('option')
    opt.value = a.code
    opt.textContent = `${a.name}${a.paid ? ' (με αποδοχές)' : ' (χωρίς αποδοχές)'}`
    sel.appendChild(opt)
  })
}

function employeeLabel(emp) {
  return (emp?.nickName || '').trim()
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  populateAdeiesInShiftType()
  await loadData()
  ensureRestShiftsForWeek(currentWeekStart)
  await saveData()
  renderAll()

  // extra persistence safety
  window.addEventListener('beforeunload', () => {
    try {
      const payload = JSON.stringify(sanitizeStateForPersist(data))
      localStorage.setItem(STORAGE_KEY, payload)
      } catch {}
  })
  setInterval(() => {
    saveData()
  }, 15000)
})

function renderAll() {
  renderSchedule()
  // updateSummary()
}

function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

function formatDate(date) {
  // Use local calendar date (not UTC ISO) to avoid off-by-one key mismatches
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDisplayDate(date) {
  return date.toLocaleDateString('el-GR', { month: 'numeric', day: 'numeric', year: 'numeric' })
}

function getWeekKey() {
  return formatDate(currentWeekStart)
}

function getBusinessHoursForWeek() {
  const weekKey = getWeekKey()
  if (!data.weekBusinessHours[weekKey]) {
    // Copy default hours for this week
    data.weekBusinessHours[weekKey] = JSON.parse(JSON.stringify(data.defaultBusinessHours))
  }
  return data.weekBusinessHours[weekKey]
}

function getHolidaysForWeek() {
  const weekKey = getWeekKey()
  if (!data.weekHolidays[weekKey]) {
    data.weekHolidays[weekKey] = []
  }
  return data.weekHolidays[weekKey]
}

function isDayHolidayOrSunday(dayIndex) {
  const holidays = getHolidaysForWeek()
  return dayIndex === 6 || holidays.includes(dayIndex) // 6 = Sunday (Κυριακή)
}

function getRestDaysForEmployee(employeeId) {
  // No per-week employee rest-day settings; use employee defaults only
  const emp = data.employees.find((e) => String(e.vat) === String(employeeId))
  return emp ? emp.defaultRestDays : [5, 6]
}

function getWorkingHours(source, fallback = 40) {
  return Number(source?.weekWorkingHours ?? source?.workingHours ?? fallback) || fallback
}

function getEmployeeWeekSettings(employeeId) {
  // No per-week employee settings; use employee defaults only
  const emp = data.employees.find((e) => String(e.vat) === String(employeeId))
  return emp
    ? { workingHours: getWorkingHours(emp, 40), hourlyRate: emp.hourlyRate || 10 }
    : { workingHours: 40, hourlyRate: 10 }
}

// Helper: check if a time range spans overnight (end is next day)
function isOvernightRange(startTime, endTime) {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  return endMin <= startMin
}

// Helper: get effective end hour (adds 24 if overnight) for timeline/calculations
function getEffectiveEndHour(startTime, endTime) {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  let endDecimal = eh + em / 60
  const startDecimal = sh + sm / 60
  if (endDecimal <= startDecimal) endDecimal += 24
  return endDecimal
}

// Helper: check if a shift is within business hours (handles overnight for both)
function isWithinBusinessHours(shiftStart, shiftEnd, bhOpen, bhClose) {
  const [ss, ssm] = shiftStart.split(':').map(Number)
  const [se, sem] = shiftEnd.split(':').map(Number)
  const [bo, bom] = bhOpen.split(':').map(Number)
  const [bc, bcm] = bhClose.split(':').map(Number)

  let shiftStartMin = ss * 60 + ssm
  let shiftEndMin = se * 60 + sem
  let bhOpenMin = bo * 60 + bom
  let bhCloseMin = bc * 60 + bcm

  // Normalize overnight ranges to continuous timeline
  if (shiftEndMin <= shiftStartMin) shiftEndMin += 24 * 60
  if (bhCloseMin <= bhOpenMin) bhCloseMin += 24 * 60

  return shiftStartMin >= bhOpenMin && shiftEndMin <= bhCloseMin
}

function ensureRestShiftsForWeek(weekStart) {
  const ws = new Date(weekStart)
  data.employees.forEach((emp) => {
    const weekHours = Number(emp.weekWorkingHours || 40)
    const weekDays = Number(emp.weekWorkingDays || 5)
    const isPartial = weekHours < 40
    const planned = new Set(getMonthlyPlannedDayIndexes(weekDays))

    for (let i = 0; i < 7; i++) {
      const d = new Date(ws)
      d.setDate(d.getDate() + i)
      const key = `${emp.vat}_${formatDate(d)}`
      if (data.shifts[key]) continue

      // For part-time employees with <5 days/week, non-planned days are ΜΗ ΕΡΓΑΣΙΑ (ΜΕ)
      if (isPartial && weekDays < 5 && !planned.has(i)) {
        data.shifts[key] = { type: 'ΜΕ' }
        continue
      }

      const restDays = getRestDaysForEmployee(emp.vat)
      if (restDays.includes(i)) data.shifts[key] = { type: 'AN' }
    }
  })
}

function changeWeek(delta) {
  currentWeekStart.setDate(currentWeekStart.getDate() + delta * 7)
  ensureRestShiftsForWeek(currentWeekStart)
  saveData()
  renderAll()
}

function copyPreviousWeekToCurrentWeek() {
  if (!confirm('Να αντιγραφούν τα δεδομένα της προηγούμενης εβδομάδας στην τρέχουσα;')) return

  const currentWeekKey = formatDate(currentWeekStart)
  const prevWeekStart = new Date(currentWeekStart)
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)
  const prevWeekKey = formatDate(prevWeekStart)

  // copy week-level settings
  if (data.weekBusinessHours?.[prevWeekKey]) {
    data.weekBusinessHours[currentWeekKey] = JSON.parse(JSON.stringify(data.weekBusinessHours[prevWeekKey]))
  }
  if (data.weekHolidays?.[prevWeekKey]) {
    data.weekHolidays[currentWeekKey] = JSON.parse(JSON.stringify(data.weekHolidays[prevWeekKey]))
  }

  // copy daily shifts (Mon..Sun) for each employee
  ;(data.employees || []).forEach((emp) => {
    for (let i = 0; i < 7; i++) {
      const srcDate = new Date(prevWeekStart)
      srcDate.setDate(srcDate.getDate() + i)
      const dstDate = new Date(currentWeekStart)
      dstDate.setDate(dstDate.getDate() + i)

      const srcKey = `${emp.vat}_${formatDate(srcDate)}`
      const dstKey = `${emp.vat}_${formatDate(dstDate)}`

      if (data.shifts[srcKey]) data.shifts[dstKey] = JSON.parse(JSON.stringify(data.shifts[srcKey]))
      else delete data.shifts[dstKey]
    }
  })

  ensureRestShiftsForWeek(currentWeekStart)
  saveData()
  renderAll()
}

function renderSchedule() {
  const table = document.getElementById('scheduleTable')
  const weekEnd = new Date(currentWeekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  const weekRange = `${formatDisplayDate(currentWeekStart)}-${formatDisplayDate(weekEnd)}`
  document.getElementById('weekDisplay').textContent = weekRange

  // Update print header
  const printHeader = document.getElementById('printHeader')
  if (printHeader) {
    printHeader.textContent = `Πρόγραμμα Εργασίας: ${weekRange}`
  }

  const businessHours = getBusinessHoursForWeek()
  const holidays = getHolidaysForWeek()
  let html = '<thead><tr><th>Εργαζόμενος</th>'

  // Header with days
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(currentWeekStart)
    dayDate.setDate(dayDate.getDate() + i)
    const businessDay = businessHours[i]
    const isClosed = false
    const isHoliday = holidays.includes(i)
    const isSunday = i === 6
    const overnight = !isClosed && isOvernightRange(businessDay.open, businessDay.close)

    let thClass = isClosed ? 'closed' : ''
    if (isHoliday || isSunday) thClass += ' holiday-header'

    const hoursDisplay = !isClosed
      ? `<div class="business-hours">${businessDay.open} - ${businessDay.close}${overnight ? ' +1' : ''}</div>`
      : '<div class="business-hours">Closed</div>'

    html += `<th class="${thClass} clickable" onclick="openTimelineModal(${i})">
                ${DAY_ABBREV[i]}${isHoliday ? ' 🎉' : ''}${isSunday ? ' ☀️' : ''}<br>
                <small>${dayDate.getDate()}</small>
                ${hoursDisplay}
                ${(isHoliday || isSunday) && !isClosed ? '<div class="premium-badge">+75%</div>' : ''}
            </th>`
  }
  html += '</tr></thead><tbody>'

  // Employee rows
  data.employees.forEach((emp) => {
    const weekSettings = getEmployeeWeekSettings(emp.vat)
    const weekHours = calculateWeekHours(emp.vat, currentWeekStart)
    const weekCost = calculateWeekCost(emp.vat, currentWeekStart)
    const targetHours = emp.payType === 'monthly' ? Number(emp.weekWorkingHours || 40) : Number(weekSettings.workingHours || 40)
    const hoursPercent = Math.min((weekHours / (targetHours || 1)) * 100, 100)
    let hoursClass = ''
    if (weekHours < targetHours) hoursClass = 'danger'
    else if (weekHours > targetHours) hoursClass = 'warning'

    const restDays = getRestDaysForEmployee(emp.vat)

    let costTooltip = `Ωρες: ${weekCost.totalHours}h | Κόστος: €${weekCost.totalCost}`
    if (weekCost.sundayHolidayHours > 0) costTooltip += ` | Κυρ/Αργ: ${weekCost.sundayHolidayHours}h`
    if (weekCost.nightHours > 0) costTooltip += ` | Νυχτ: ${weekCost.nightHours}h`

    html += `<tr class="employee-row">
                <td class="employee-name" onclick="openEmployeeModal('${String(emp.vat)}')" style="cursor: pointer;" title="${costTooltip}">
                    ${employeeLabel(emp)} <span style="font-size:11px; padding:2px 6px; border-radius:999px; background:${emp.payType === 'monthly' ? '#dbeafe' : '#dcfce7'}; color:${emp.payType === 'monthly' ? '#1e40af' : '#166534'}; font-weight:700;">${emp.payType === 'monthly' ? 'Μ' : 'Ω'}</span>
                    <span class="delete-employee" onclick="event.stopPropagation(); deleteEmployee('${String(emp.vat)}')" title="Delete employee">×</span>
                    <div class="employee-hours">${weekHours}h / ${targetHours}h</div>
                    <div class="hours-bar">
                        <div class="hours-fill ${hoursClass}" style="width: ${hoursPercent}%"></div>
                    </div>
                    <div class="employee-cost">€${weekCost.totalCost}${weekCost.sundayHolidayHours > 0 ? ' <span class="badge-sunday">☀' + weekCost.sundayHolidayHours + 'h</span>' : ''}${weekCost.nightHours > 0 ? ' <span class="badge-night">🌙' + weekCost.nightHours + 'h</span>' : ''}</div>
                </td>`

    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(currentWeekStart)
      dayDate.setDate(dayDate.getDate() + i)
      const dateStr = formatDate(dayDate)
      const businessDay = businessHours[i]
      const isClosed = false
      const isRestDay = restDays.includes(i)
      const shift = data.shifts[`${emp.vat}_${dateStr}`]
      const isHolidayOrSun = isDayHolidayOrSunday(i)

      let cellClass = 'shift-cell'
      if (isClosed) cellClass += ' closed-day'
      else if (isRestDay && !shift) cellClass += ' rest-day'
      if (isHolidayOrSun && !isClosed) cellClass += ' holiday-day'

      const isSelected = selectedCells.some((c) => String(c.employeeId) === String(emp.vat) && c.dateStr === dateStr)
      if (isSelected) cellClass += ' selected-cell'

      html += `<td class="${cellClass}" data-employee-id="${emp.vat}" data-date="${dateStr}" data-closed="${isClosed}" onclick="handleCellClick(event, '${String(emp.vat)}', '${dateStr}', ${isClosed})">`

      if (shift) {
        if (isWorkingType(shift)) {
          const premiums = calculateShiftPremiums(shift, i)
          let premiumIndicators = ''
          if (premiums && premiums.isSundayOrHoliday)
            premiumIndicators += '<span class="shift-premium sun">+75%</span>'
          if (premiums && premiums.nightHours > 0)
            premiumIndicators += '<span class="shift-premium night">🌙' + premiums.nightHours + 'h</span>'
          const modeTag = String(shift.type)==='ΤΗΛ' ? '<span class="telework-badge">ΤΗΛ</span>' : ''
          const second = shift.start2 && shift.end2
            ? ` / ${shift.start2}-${shift.end2}${shift.type2 === 'ΤΗΛ' ? '(ΤΗΛ)' : ''}`
            : ''
          const timeText = `${shift.start} - ${shift.end}${second}`
          const totalShiftHours = shiftTotalHours(shift)
          const overworkBadge = totalShiftHours > 8 ? '<span class="overtime-badge">ΥΕ</span>' : ''
          const overtimeBadge = totalShiftHours > 9 ? '<span class="yperoria-badge">ΥΠ</span>' : ''
          const badgesRow = (modeTag || overworkBadge || overtimeBadge) ? `<div class="shift-badges">${modeTag}${overworkBadge}${overtimeBadge}</div>` : ''
          html += `<div class="shift-block${isHolidayOrSun ? ' shift-holiday' : ''}"><span class="shift-time">${timeText}</span>${badgesRow}${premiumIndicators ? '<div class="premium-indicators">' + premiumIndicators + '</div>' : ''}</div>`
        } else if (String(shift.type)==='AN') {
          html += `<div class="shift-block absence-other">ΡΕΠΟ</div>`
        } else {
          if (isNonWorkingType(shift)) {
            html += `<div class="shift-block absence-nonwork" title="ΜΗ ΕΡΓΑΣΙΑ">ΜΕ</div>`
          } else {
            const absenceClass = isPaidAbsenceType(shift.type) ? 'absence-paid' : 'absence-unpaid'
            const label = String(shift.type || '')
            html += `<div class="shift-block ${absenceClass}" title="${absenceLabel(shift.type)}">${label}</div>`
          }
        }
      } else if (isRestDay) {
        html += '<small style="color:#999">Rest</small>'
      }

      html += '</td>'
    }
    html += '</tr>'
  })

  if (data.employees.length === 0) {
    html +=
      '<tr><td colspan="8" style="text-align:center; padding:40px; color:#999;">No employees added yet. Click "Add Employee" to get started.</td></tr>'
  }

  html += '</tbody>'
  table.innerHTML = html
  setupCellHoverPreview()
}

let cellPreviewTimer = null
let cellPreviewEl = null

function hideCellHoverPreview() {
  if (cellPreviewTimer) {
    clearTimeout(cellPreviewTimer)
    cellPreviewTimer = null
  }
  if (cellPreviewEl) cellPreviewEl.classList.remove('active')
}

function showCellHoverPreview(cell) {
  if (!cell) return
  if (!cellPreviewEl) {
    cellPreviewEl = document.createElement('div')
    cellPreviewEl.id = 'cellHoverPreview'
    cellPreviewEl.className = 'cell-hover-preview'
    document.body.appendChild(cellPreviewEl)
  }

  const block = cell.querySelector('.shift-block')
  if (!block) return
  cellPreviewEl.innerHTML = block.outerHTML

  const rect = cell.getBoundingClientRect()
  const top = Math.max(8, rect.top + window.scrollY - 10)
  const left = rect.left + window.scrollX + rect.width / 2
  cellPreviewEl.style.top = `${top}px`
  cellPreviewEl.style.left = `${left}px`
  cellPreviewEl.classList.add('active')
}

function setupCellHoverPreview() {
  document.querySelectorAll('.shift-cell').forEach((cell) => {
    if (cell.dataset.previewBound === '1') return
    cell.dataset.previewBound = '1'

    cell.addEventListener('mouseenter', () => {
      hideCellHoverPreview()
      cellPreviewTimer = setTimeout(() => showCellHoverPreview(cell), 1000)
    })

    cell.addEventListener('mouseleave', () => {
      hideCellHoverPreview()
    })
  })
}

function openTimelineModal(dayIndex) {
  const businessHours = getBusinessHoursForWeek()
  selectedTimelineDay = dayIndex
  renderTimeline()
  document.getElementById('timelineModal').classList.add('active')
}

function renderTimeline() {
  // Build colored segments for a timeline shift bar
  function buildTimelineSegments(startH, endH, isHoliday, gridStart, gridCount) {
    // Break the shift into contiguous blocks by type: regular, night, holiday+night
    const totalDuration = endH - startH
    if (totalDuration <= 0) return ''

    const blocks = []
    let cursor = startH

    while (cursor < endH) {
      const isNight = cursor % 24 >= 22 || cursor % 24 < 6
      // Find end of this block type
      let blockEnd = cursor
      const step = 0.25 // 15-minute resolution
      while (blockEnd < endH) {
        const nextIsNight = blockEnd % 24 >= 22 || blockEnd % 24 < 6
        if (nextIsNight !== isNight) break
        blockEnd += step
      }
      blockEnd = Math.min(blockEnd, endH)

      let segClass = 'seg-regular'
      if (isHoliday && isNight) segClass = 'seg-holiday-night'
      else if (isHoliday) segClass = 'seg-holiday'
      else if (isNight) segClass = 'seg-night'

      const leftPct = ((cursor - startH) / totalDuration) * 100
      const widthPct = ((blockEnd - cursor) / totalDuration) * 100

      blocks.push(
        `<div class="timeline-segment ${segClass}" style="left:${leftPct}%;width:${widthPct}%"></div>`,
      )
      cursor = blockEnd
    }

    return blocks.join('')
  }

  const businessHours = getBusinessHoursForWeek()
  const dayDate = new Date(currentWeekStart)
  dayDate.setDate(dayDate.getDate() + selectedTimelineDay)
  const dateStr = formatDate(dayDate)
  const businessDay = businessHours[selectedTimelineDay]

  // Update modal title
  document.getElementById('timelineModalTitle').textContent =
    `📊 ${DAYS[selectedTimelineDay]}, ${formatDisplayDate(dayDate)} - Εργαζόμενοι`

  // Render day selector
  let selectorHtml = ''
  for (let i = 0; i < 7; i++) {
    const d = new Date(currentWeekStart)
    d.setDate(d.getDate() + i)
    const bh = businessHours[i]
    const isActive = i === selectedTimelineDay
    const isClosed = bh.closed
    selectorHtml += `<button class="timeline-day-btn ${isActive ? 'active' : ''} ${isClosed ? 'closed' : ''}"
                      onclick="selectTimelineDay(${i})" ${isClosed ? 'disabled' : ''}>
                      ${DAY_ABBREV[i]} ${d.getDate()}
                    </button>`
  }
  document.getElementById('timelineDaySelector').innerHTML = selectorHtml

  if (businessDay.closed) {
    document.getElementById('timelineGrid').innerHTML = `
      <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: #999;">
        Business is closed on ${DAYS[selectedTimelineDay]}
      </div>`
    return
  }

  // Calculate hour range - start with business hours, then expand to include all shifts
  const openHour = parseInt(businessDay.open.split(':')[0])
  let closeHourRaw =
    parseInt(businessDay.close.split(':')[0]) + (parseInt(businessDay.close.split(':')[1]) > 0 ? 1 : 0)
  const bhOvernight = isOvernightRange(businessDay.open, businessDay.close)
  // For overnight business hours, effective close is next day (e.g., 01:00 -> 25)
  let effectiveCloseHour = bhOvernight ? closeHourRaw + 24 : closeHourRaw

  let minHour = openHour
  let maxHour = effectiveCloseHour

  // Check all shifts to find the actual min/max hours needed
  data.employees.forEach((emp) => {
    const shift = data.shifts[`${emp.vat}_${dateStr}`]
    if (isWorkingType(shift)) {
      const intervals = [{ start: shift.start, end: shift.end }]
      if (shift.start2 && shift.end2) intervals.push({ start: shift.start2, end: shift.end2 })
      intervals.forEach((it) => {
        const shiftStartH = parseInt(it.start.split(':')[0])
        const shiftEffectiveEnd = getEffectiveEndHour(it.start, it.end)
        const shiftEndH = Math.ceil(shiftEffectiveEnd)
        minHour = Math.min(minHour, shiftStartH)
        maxHour = Math.max(maxHour, shiftEndH)
      })
    }
  })

  const hours = []
  for (let h = minHour; h <= maxHour; h++) {
    hours.push(h)
  }

  // Build timeline grid
  let html = `
    <div style="background: #667eea; padding: 10px; font-weight: 600; color: white;">Employee</div>
    <div class="timeline-hours-header">
      ${hours.map((h) => `<div class="timeline-hour-label">${(h % 24).toString().padStart(2, '0')}:00</div>`).join('')}
    </div>`

  // Staff count per hour
  const staffCounts = {}
  hours.forEach((h) => (staffCounts[h] = 0))

  // Filter to only show working employees
  const workingEmployees = data.employees.filter((emp) => {
    const shift = data.shifts[`${emp.vat}_${dateStr}`]
    return isWorkingType(shift)
  })

  // Employee rows - only show working employees
  workingEmployees.forEach((emp) => {
    const shift = data.shifts[`${emp.vat}_${dateStr}`]
    const isHolidayOrSun = isDayHolidayOrSunday(selectedTimelineDay)

    html += `<div class="timeline-employee-row">
      <div class="timeline-employee-name">${employeeLabel(emp)}</div>
      <div class="timeline-employee-hours" style="position: relative;">`

    // Hour cells background
    hours.forEach((h) => {
      const hMod = h % 24
      const isBusinessHour = bhOvernight
        ? (h >= openHour || h < closeHourRaw) && h < effectiveCloseHour
        : hMod >= openHour && hMod < closeHourRaw
      const isNightHour = hMod >= 22 || hMod < 6
      let cellClass = isBusinessHour ? 'business-open' : 'business-closed'
      if (isNightHour) cellClass += ' night-hour'
      html += `<div class="timeline-hour-cell ${cellClass}"></div>`
    })

    const intervals = [{ start: shift.start, end: shift.end, slot: 1 }]
    if (shift.start2 && shift.end2) intervals.push({ start: shift.start2, end: shift.end2, slot: 2 })

    intervals.forEach((it) => {
      const startHour = parseInt(it.start.split(':')[0]) + parseInt(it.start.split(':')[1]) / 60
      const endHour = getEffectiveEndHour(it.start, it.end)
      const startOffset = ((startHour - hours[0]) / hours.length) * 100
      const width = ((endHour - startHour) / hours.length) * 100
      const segments = buildTimelineSegments(startHour, endHour, isHolidayOrSun, hours[0], hours.length)

      html += `<div class="timeline-shift-bar"
                data-employee-id="${emp.vat}"
                data-date="${dateStr}"
                data-hours-start="${hours[0]}"
                data-hours-count="${hours.length}"
                data-slot="${it.slot}"
                style="left: ${startOffset}%; width: ${width}%;"
                title="Drag edges to resize, drag bar to move">
                ${segments}
                <div class="drag-handle left" data-handle="left"></div>
                <div class="time-label">${it.start} - ${it.end}</div>
                <div class="drag-handle right" data-handle="right"></div>
              </div>`

      hours.forEach((h) => {
        if (h >= Math.floor(startHour) && h < Math.ceil(endHour)) {
          staffCounts[h]++
        }
      })
    })

    html += `</div></div>`
  })

  // Show message if no one is working
  if (workingEmployees.length === 0) {
    html += `<div class="timeline-employee-row">
      <div style="grid-column: 1 / -1; padding: 30px; text-align: center; color: #999; background: #f8f9fa;">
        No employees scheduled to work on this day
      </div>
    </div>`
  }

  // Staff count row
  html += `<div class="staff-count-row">
    <div class="staff-count-label">Staff Count</div>
    <div class="staff-count-cells">
      ${hours
        .map((h) => {
          const hMod = h % 24
          const isBusinessHour = bhOvernight
            ? (h >= openHour || h < closeHourRaw) && h < effectiveCloseHour
            : hMod >= openHour && hMod < closeHourRaw
          let countClass = staffCounts[h] === 0 ? 'low' : staffCounts[h] <= 2 ? 'medium' : 'good'
          if (!isBusinessHour) countClass += ' outside-hours'
          return `<div class="staff-count-cell ${countClass}">${staffCounts[h]}</div>`
        })
        .join('')}
    </div>
  </div>`

  document.getElementById('timelineGrid').innerHTML = html

  // Attach drag handlers to shift bars
  initTimelineDragHandlers()
}

// Timeline drag functionality
let dragState = null

function initTimelineDragHandlers() {
  const shiftBars = document.querySelectorAll('.timeline-shift-bar[data-employee-id]')

  shiftBars.forEach((bar) => {
    bar.addEventListener('mousedown', handleShiftBarMouseDown)
  })
}

function handleShiftBarMouseDown(e) {
  const bar = e.target.closest('.timeline-shift-bar')
  if (!bar) return

  const handle = e.target.dataset.handle
  const container = bar.parentElement
  const containerRect = container.getBoundingClientRect()

  const employeeId = String(bar.dataset.employeeId)
  const dateStr = bar.dataset.date
  const hoursStart = parseInt(bar.dataset.hoursStart)
  const hoursCount = parseInt(bar.dataset.hoursCount)
  const slot = Number(bar.dataset.slot || 1)

  const shift = data.shifts[`${employeeId}_${dateStr}`]
  if (!shift) return

  const initialStart = slot === 2 ? shift.start2 : shift.start
  const initialEnd = slot === 2 ? shift.end2 : shift.end
  if (!initialStart || !initialEnd) return

  bar.classList.add('dragging')

  dragState = {
    bar,
    container,
    containerRect,
    handle, // 'left', 'right', or undefined (move whole bar)
    employeeId,
    dateStr,
    hoursStart,
    hoursCount,
    slot,
    initialStart,
    initialEnd,
    startX: e.clientX,
  }

  e.preventDefault()
  document.addEventListener('mousemove', handleShiftBarMouseMove)
  document.addEventListener('mouseup', handleShiftBarMouseUp)
}

function handleShiftBarMouseMove(e) {
  if (!dragState) return

  const { bar, containerRect, handle, hoursStart, hoursCount, initialStart, initialEnd, startX } = dragState

  // Calculate position relative to container
  const deltaX = e.clientX - startX
  const containerWidth = containerRect.width
  const deltaHours = (deltaX / containerWidth) * hoursCount

  // Parse initial times (handle overnight by using effective end)
  const [startH, startM] = initialStart.split(':').map(Number)
  const [endH, endM] = initialEnd.split(':').map(Number)
  let newStartHour = startH + startM / 60
  let newEndHour = endH + endM / 60
  // If overnight shift, make end > start for continuous positioning
  if (newEndHour <= newStartHour) newEndHour += 24

  if (handle === 'left') {
    // Resize from left (change start time)
    newStartHour += deltaHours
    newStartHour = Math.max(hoursStart, Math.min(newStartHour, newEndHour - 0.25))
  } else if (handle === 'right') {
    // Resize from right (change end time)
    newEndHour += deltaHours
    newEndHour = Math.max(newStartHour + 0.25, Math.min(newEndHour, hoursStart + hoursCount))
  } else {
    // Move whole bar
    const duration = newEndHour - newStartHour
    newStartHour += deltaHours
    newStartHour = Math.max(hoursStart, Math.min(newStartHour, hoursStart + hoursCount - duration))
    newEndHour = newStartHour + duration
  }

  // Round to quarter hours
  newStartHour = roundToQuarter(newStartHour)
  newEndHour = roundToQuarter(newEndHour)

  // Update bar position visually
  const startOffset = ((newStartHour - hoursStart) / hoursCount) * 100
  const width = ((newEndHour - newStartHour) / hoursCount) * 100
  bar.style.left = `${startOffset}%`
  bar.style.width = `${width}%`

  // Update time label
  const newStartStr = formatTimeFromHours(newStartHour)
  const newEndStr = formatTimeFromHours(newEndHour)
  const label = bar.querySelector('.time-label')
  if (label) {
    label.textContent = `${newStartStr} - ${newEndStr}`
  }

  // Store for mouseup
  dragState.newStart = newStartStr
  dragState.newEnd = newEndStr
}

function handleShiftBarMouseUp(e) {
  if (!dragState) return

  const { bar, employeeId, dateStr, slot, newStart, newEnd } = dragState
  bar.classList.remove('dragging')

  // Save the changes if there were any
  if (newStart && newEnd) {
    const key = `${employeeId}_${dateStr}`
    const next = { ...(data.shifts[key] || {}) }
    if (slot === 2) {
      next.start2 = newStart
      next.end2 = newEnd
    } else {
      next.start = newStart
      next.end = newEnd
    }

    // keep minimum 3-hour gap between split shifts
    if (next.start2 && next.end2) {
      const gap = toMinutes(next.start2) - toMinutes(next.end)
      if (gap < 180) {
        alert('Το κενό μεταξύ των 2 βαρδιών πρέπει να είναι τουλάχιστον 3 ώρες')
      } else {
        const restChk = validate11hRestBetweenDays(employeeId, dateStr, next)
        if (!restChk.ok) alert(restChk.msg)
        else {
          const weeklyRestChk = validate24hRestInAny7Days(employeeId, dateStr, next)
          if (!weeklyRestChk.ok) alert(weeklyRestChk.msg)
          else {
            data.shifts[key] = next
            saveData()
          }
        }
      }
    } else {
      const restChk = validate11hRestBetweenDays(employeeId, dateStr, next)
      if (!restChk.ok) alert(restChk.msg)
      else {
        const weeklyRestChk = validate24hRestInAny7Days(employeeId, dateStr, next)
        if (!weeklyRestChk.ok) alert(weeklyRestChk.msg)
        else {
          data.shifts[key] = next
          saveData()
        }
      }
    }

    renderTimeline()
    renderSchedule()
    // updateSummary()
  }

  dragState = null
  document.removeEventListener('mousemove', handleShiftBarMouseMove)
  document.removeEventListener('mouseup', handleShiftBarMouseUp)
}

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

  const extraHours = Object.values(weekHoursMap).reduce((acc, h) => acc + Math.max(0, Number(h || 0) - 40), 0)
  const hourlyBase = Number(monthlySalary || 0) * 0.006 // salary/25*6/40
  const extraPay = extraHours * hourlyBase * 1.2 // +20% υπερεργασία
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

  let nightMinutes = 0
  // Night period 1: 00:00-06:00 (0 to 360 minutes)
  // Night period 2: 22:00-24:00 (1320 to 1440 minutes)
  // For overnight: also 24:00-30:00 maps to 00:00-06:00 next day

  for (let m = startMin; m < endMin; m++) {
    const timeInDay = m % (24 * 60)
    if (timeInDay >= 0 && timeInDay < 360)
      nightMinutes++ // 00:00-06:00
    else if (timeInDay >= 1320) nightMinutes++ // 22:00-24:00
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

  if (isSundayOrHoliday) {
    sundayHolidayExtra = totalHours * 0.75
  }
  nightExtra = nightHours * 0.25

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
    const weeklyDeduction = Math.round(((monthlySalary / 25) * absDays) * 100) / 100
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
function togglePayTypeFields() {
  const payType = document.getElementById('employeePayType')?.value || 'hourly'
  const hourly = document.getElementById('hourlyFields')
  const monthly = document.getElementById('monthlyFields')
  if (!hourly || !monthly) return
  hourly.style.display = payType === 'hourly' ? 'flex' : 'none'
  monthly.style.display = payType === 'monthly' ? 'flex' : 'none'
}

function openEmployeeModal(employeeId = null) {
  const modal = document.getElementById('employeeModal')
  const title = document.getElementById('employeeModalTitle')

  let checkboxHtml = ''
  DAYS.forEach((day, i) => {
    checkboxHtml += `<div class="checkbox-item">
      <input type="checkbox" id="restDay${i}" value="${i}">
      <label for="restDay${i}">${DAY_ABBREV[i]}</label>
    </div>`
  })
  document.getElementById('restDaysCheckboxes').innerHTML = checkboxHtml

  // Clear all checkboxes first
  for (let i = 0; i < 7; i++) {
    document.getElementById(`restDay${i}`).checked = false
  }

  if (employeeId) {
    const emp = data.employees.find((e) => String(e.vat) === String(employeeId))
    title.textContent = 'Edit Employee'
    document.getElementById('editEmployeeId').value = employeeId
    document.getElementById('employeeNick').value = emp.nickName || ''
    document.getElementById('employeeVat').value = emp.vat || ''
    document.getElementById('employeeNick').value = emp.nickName || ''
    document.getElementById('employeePayType').value = emp.payType || 'hourly'
    document.getElementById('employeeMinHours').value = getWorkingHours(emp, 40)
    document.getElementById('employeeMaxHours').value = getWorkingHours(emp, 40)
    document.getElementById('employeeHourlyRate').value = emp.hourlyRate || 10
    document.getElementById('employeeMonthlySalary').value = emp.monthlySalary || 1000
    document.getElementById('employeeMonthlyWeekHours').value = emp.weekWorkingHours || 40
    document.getElementById('employeeMonthlyWeekDays').value = emp.weekWorkingDays || 5
    emp.defaultRestDays.forEach((d) => {
      document.getElementById(`restDay${d}`).checked = true
    })
  } else {
    const empDefaults = data.defaultEmployeeSettings || {
      workingHours: 40,
      restDays: [5, 6],
      hourlyRate: 10,
    }
    title.textContent = 'Προσθήκη Εργαζομένου'
    document.getElementById('editEmployeeId').value = ''
    document.getElementById('employeeNick').value = ''
    document.getElementById('employeeVat').value = ''
    document.getElementById('employeeNick').value = ''
    document.getElementById('employeePayType').value = 'hourly'
    document.getElementById('employeeMinHours').value = getWorkingHours(empDefaults, 40)
    document.getElementById('employeeMaxHours').value = getWorkingHours(empDefaults, 40)
    document.getElementById('employeeHourlyRate').value = empDefaults.hourlyRate || 10
    document.getElementById('employeeMonthlySalary').value = 1000
    document.getElementById('employeeMonthlyWeekHours').value = 40
    document.getElementById('employeeMonthlyWeekDays').value = 5
    empDefaults.restDays.forEach((d) => {
      document.getElementById(`restDay${d}`).checked = true
    })
  }

  togglePayTypeFields()
  modal.classList.add('active')
}

function saveEmployee() {
  const vat = document.getElementById('employeeVat').value.trim()
  const nickName = document.getElementById('employeeNick').value.trim()
  const payType = document.getElementById('employeePayType').value || 'hourly'
  const workingHours = parseInt(document.getElementById('employeeMinHours').value) || 40
  const hourlyRate = parseFloat(document.getElementById('employeeHourlyRate').value) || 10
  const monthlySalary = parseFloat(document.getElementById('employeeMonthlySalary').value) || 0
  const weekWorkingHours = parseFloat(document.getElementById('employeeMonthlyWeekHours').value) || 40
  const weekWorkingDays = parseInt(document.getElementById('employeeMonthlyWeekDays').value) || 5
  const editId = document.getElementById('editEmployeeId').value

  const restDays = []
  for (let i = 0; i < 7; i++) {
    if (document.getElementById(`restDay${i}`).checked) {
      restDays.push(i)
    }
  }

  if (!nickName) {
    alert('Please enter employee nickname')
    return
  }
  if (!/^\d{9}$/.test(vat)) {
    alert('Το ΑΦΜ πρέπει να έχει ακριβώς 9 ψηφία')
    return
  }
  const duplicateVat = data.employees.find((e) => String(e.vat || '') === vat && String(e.vat) !== String(editId || ''))
  if (duplicateVat) {
    alert('Υπάρχει ήδη εργαζόμενος με αυτό το ΑΦΜ')
    return
  }

  if (restDays.length !== 2) {
    alert('Please select exactly 2 rest days')
    return
  }

  // single working-hours field: no min/max validation needed
  if (payType === 'monthly' && (weekWorkingDays < 1 || weekWorkingDays > 6)) {
    alert('Monthly employee working days/week must be between 1 and 6')
    return
  }

  if (editId) {
    const oldId = String(editId)
    const emp = data.employees.find((e) => String(e.vat) === oldId)
    const newId = String(vat)
    if (oldId !== newId) {
      const migratePrefixed = (obj) => {
        Object.keys(obj || {}).forEach((k) => {
          if (k.startsWith(`${oldId}_`)) {
            const nk = `${newId}_${k.slice(oldId.length+1)}`
            obj[nk] = obj[k]
            delete obj[k]
          }
        })
      }
      const migrateSuffixed = (obj) => {
        Object.keys(obj || {}).forEach((k) => {
          if (k.endsWith(`_${oldId}`)) {
            const nk = `${k.slice(0, -oldId.length)}${newId}`
            obj[nk] = obj[k]
            delete obj[k]
          }
        })
      }
      migratePrefixed(data.shifts)
      migrateSuffixed(data.weekRestDays)
      migrateSuffixed(data.weekEmployeeSettings)
      emp.vat = newId
    }
    emp.vat = vat
    emp.nickName = nickName
    emp.payType = payType
    emp.weekWorkingHours = payType === 'monthly' ? weekWorkingHours : workingHours
    emp.monthlySalary = monthlySalary
    emp.weekWorkingDays = weekWorkingDays
    emp.defaultRestDays = restDays
  } else {
    data.employees.push({
      vat,
      nickName: nickName,
      payType,
      weekWorkingHours: payType === 'monthly' ? weekWorkingHours : workingHours,
      monthlySalary,
      weekWorkingDays,
      defaultRestDays: restDays,
    })
  }

  saveData()
  closeModal('employeeModal')
  renderAll()
}

function deleteEmployee(employeeId) {
  if (!confirm('Are you sure you want to delete this employee?')) return

  data.employees = data.employees.filter((e) => String(e.vat) !== String(employeeId))

  Object.keys(data.shifts).forEach((key) => {
    if (key.startsWith(`${employeeId}_`)) {
      delete data.shifts[key]
    }
  })

  Object.keys(data.weekRestDays).forEach((key) => {
    if (key.endsWith(`_${employeeId}`)) {
      delete data.weekRestDays[key]
    }
  })

  Object.keys(data.weekEmployeeSettings).forEach((key) => {
    if (key.endsWith(`_${employeeId}`)) {
      delete data.weekEmployeeSettings[key]
    }
  })

  saveData()
  renderAll()
}

// Shift Modal
function openShiftModal(employeeId, dateStr, isClosed) {
  if (isClosed) {
    alert('Business is closed on this day')
    return
  }

  const modal = document.getElementById('shiftModal')
  document.getElementById('shiftEmployeeId').value = employeeId
  document.getElementById('shiftDate').value = dateStr

  const shift = data.shifts[`${employeeId}_${dateStr}`]

  if (shift) {
    document.getElementById('shiftType').value = shift.type
    if (isWorkingType(shift)) {
      document.getElementById('shiftStart').value = shift.start
      document.getElementById('shiftEnd').value = shift.end
      const has2 = !!(shift.start2 && shift.end2)
      document.getElementById('hasSecondShift').checked = has2
      document.getElementById('shiftType2').value = (shift.type2 === 'ΤΗΛ' ? 'ΤΗΛ' : 'ΕΡΓ')
      document.getElementById('shiftStart2').value = shift.start2 || ''
      document.getElementById('shiftEnd2').value = shift.end2 || ''
      toggleSecondShiftFields()
    } else {
      document.getElementById('hasSecondShift').checked = false
      document.getElementById('shiftStart2').value = ''
      document.getElementById('shiftEnd2').value = ''
      toggleSecondShiftFields()
    }
    document.getElementById('absenceReason').value = shift.reason || ''
  } else {
    const restDays = getRestDaysForEmployee(employeeId)
    const dayOfWeek = new Date(dateStr).getDay()
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1

    if (restDays.includes(dayIndex)) {
      document.getElementById('shiftType').value = 'rest'
    } else {
      document.getElementById('shiftType').value = 'working'
      const businessHours = getBusinessHoursForWeek()
      const businessDay = businessHours[dayIndex]
      document.getElementById('shiftStart').value = businessDay.open
      document.getElementById('shiftEnd').value = businessDay.close
      document.getElementById('hasSecondShift').checked = false
      document.getElementById('shiftStart2').value = ''
      document.getElementById('shiftEnd2').value = ''
      toggleSecondShiftFields()
    }
    document.getElementById('absenceReason').value = ''
  }

  toggleShiftFields()
  modal.classList.add('active')
}

function toggleShiftFields() {
  const shiftType = document.getElementById('shiftType').value
  const workingFields = document.getElementById('workingShiftFields')
  const absenceReason = document.getElementById('absenceReasonGroup')

  if (shiftType === 'ΕΡΓ' || shiftType === 'ΤΗΛ') {
    workingFields.style.display = 'block'
    absenceReason.style.display = 'none'
    const t2 = document.getElementById('shiftType2')
    if (t2 && !document.getElementById('hasSecondShift')?.checked) t2.value = shiftType
  } else if (shiftType === 'AN') {
    workingFields.style.display = 'none'
    absenceReason.style.display = 'none'
  } else {
    workingFields.style.display = 'none'
    absenceReason.style.display = 'block'
  }
}

function isValidTime24h(time) {
  const regex = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
  return regex.test(time)
}

function shiftIntervalsMinutes(shift) {
  if (!isWorkingType(shift)) return []
  const out = []
  const add = (s, e) => {
    const sm = toMinutes(s)
    let em = toMinutes(e)
    if (sm == null || em == null) return
    if (em <= sm) em += 24 * 60
    out.push({ start: sm, end: em })
  }
  add(shift.start, shift.end)
  if (shift.start2 && shift.end2) add(shift.start2, shift.end2)
  out.sort((a, b) => a.start - b.start)
  return out
}

function plusDaysISO(dateStr, delta) {
  const d = parseISODateLocal(dateStr)
  d.setDate(d.getDate() + delta)
  return formatISODateLocal(d)
}

function validate11hRestBetweenDays(employeeId, dateStr, candidateShift) {
  if (!isWorkingType(candidateShift)) return { ok: true }

  const cur = shiftIntervalsMinutes(candidateShift)
  if (!cur.length) return { ok: true }
  const curFirst = cur[0].start
  const curLast = cur[cur.length - 1].end

  const prevDate = plusDaysISO(dateStr, -1)
  const prev = data.shifts[`${employeeId}_${prevDate}`]
  if (isWorkingType(prev)) {
    const p = shiftIntervalsMinutes(prev)
    if (p.length) {
      const prevLast = p[p.length - 1].end
      const rest = curFirst + 24 * 60 - prevLast
      if (rest < 11 * 60) return { ok: false, msg: 'Ανάμεσα σε βάρδιες διαφορετικών ημερών απαιτούνται τουλάχιστον 11 ώρες ανάπαυση (προηγούμενη μέρα).' }
    }
  }

  const nextDate = plusDaysISO(dateStr, 1)
  const next = data.shifts[`${employeeId}_${nextDate}`]
  if (isWorkingType(next)) {
    const n = shiftIntervalsMinutes(next)
    if (n.length) {
      const nextFirst = n[0].start
      const rest = nextFirst + 24 * 60 - curLast
      if (rest < 11 * 60) return { ok: false, msg: 'Ανάμεσα σε βάρδιες διαφορετικών ημερών απαιτούνται τουλάχιστον 11 ώρες ανάπαυση (επόμενη μέρα).' }
    }
  }

  return { ok: true }
}

function validate24hRestInAny7Days(employeeId, pivotDateStr, candidateShift = null) {
  const collectIntervals = (windowStartStr) => {
    const intervals = []
    for (let d = 0; d < 7; d++) {
      const dayStr = plusDaysISO(windowStartStr, d)
      const key = `${employeeId}_${dayStr}`
      const sh = (dayStr === pivotDateStr && candidateShift !== null) ? candidateShift : data.shifts[key]
      if (!isWorkingType(sh)) continue
      const dayOffset = d * 24 * 60
      const add = (s, e) => {
        const sm = toMinutes(s)
        let em = toMinutes(e)
        if (sm == null || em == null) return
        if (em <= sm) em += 24 * 60
        intervals.push({ start: dayOffset + sm, end: dayOffset + em })
      }
      add(sh.start, sh.end)
      if (sh.start2 && sh.end2) add(sh.start2, sh.end2)
    }
    intervals.sort((a, b) => a.start - b.start)
    return intervals
  }

  for (let back = 0; back < 7; back++) {
    const ws = plusDaysISO(pivotDateStr, -back)
    const merged = []
    collectIntervals(ws).forEach((it) => {
      if (!merged.length || it.start > merged[merged.length - 1].end) merged.push({ ...it })
      else merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, it.end)
    })

    let prevEnd = 0
    let maxRest = 0
    merged.forEach((m) => {
      maxRest = Math.max(maxRest, m.start - prevEnd)
      prevEnd = Math.max(prevEnd, m.end)
    })
    maxRest = Math.max(maxRest, 7 * 24 * 60 - prevEnd)

    if (maxRest < 24 * 60) {
      return { ok: false, msg: 'Σε κάθε 7ήμερο πρέπει να υπάρχει τουλάχιστον 24 συνεχόμενες ώρες ξεκούρασης.' }
    }
  }

  return { ok: true }
}

function toggleSecondShiftFields() {
  const on = !!document.getElementById('hasSecondShift')?.checked
  const el = document.getElementById('secondShiftFields')
  if (el) el.style.display = on ? 'flex' : 'none'
  const t2 = document.getElementById('shiftType2')
  const t1 = document.getElementById('shiftType')
  if (on && t2 && t1 && !t2.value) t2.value = t1.value === 'ΤΗΛ' ? 'ΤΗΛ' : 'ΕΡΓ'
}

function shiftTotalHours(shift) {
  if (!isWorkingType(shift)) return 0
  let h = calculateShiftHours(shift.start, shift.end)
  if (shift.start2 && shift.end2) h += calculateShiftHours(shift.start2, shift.end2)
  return Math.round(h * 100) / 100
}

function shiftTotalNightHours(shift) {
  if (!isWorkingType(shift)) return 0
  let h = calculateNightHours(shift.start, shift.end)
  if (shift.start2 && shift.end2) h += calculateNightHours(shift.start2, shift.end2)
  return Math.round(h * 10) / 10
}

function saveShift() {
  const employeeIdVal = document.getElementById('shiftEmployeeId').value
  const dateVal = document.getElementById('shiftDate').value
  const shiftType = document.getElementById('shiftType').value

  // Check if this is a multi-cell save
  if (employeeIdVal === 'multi' && dateVal === 'multi') {
    saveMultipleShifts(shiftType)
    return
  }

  const employeeId = String(employeeIdVal)
  const dateStr = dateVal
  const key = `${employeeId}_${dateStr}`

  if (shiftType === 'ΕΡΓ' || shiftType === 'ΤΗΛ') {
    const start = document.getElementById('shiftStart').value
    const end = document.getElementById('shiftEnd').value
    const has2 = !!document.getElementById('hasSecondShift')?.checked
    const type2 = (document.getElementById('shiftType2')?.value === 'ΤΗΛ') ? 'ΤΗΛ' : 'ΕΡΓ'
    const start2 = document.getElementById('shiftStart2').value
    const end2 = document.getElementById('shiftEnd2').value

    if (!isValidTime24h(start) || !isValidTime24h(end)) {
      alert('Please enter valid times in 24-hour format (HH:MM)')
      return
    }

    if (start === end) {
      alert('Start and end time cannot be the same')
      return
    }

    if (has2) {
      if (!isValidTime24h(start2) || !isValidTime24h(end2) || start2 === end2) {
        alert('Please enter valid second-shift times in 24-hour format (HH:MM)')
        return
      }
      const gap = toMinutes(start2) - toMinutes(end)
      if (gap < 180) {
        alert('Το κενό μεταξύ των 2 βαρδιών πρέπει να είναι τουλάχιστον 3 ώρες')
        return
      }
    }

    const date = new Date(dateStr)
    const dayOfWeek = date.getDay()
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const businessHours = getBusinessHoursForWeek()
    const businessDay = businessHours[dayIndex]

    if (!isWithinBusinessHours(start, end, businessDay.open, businessDay.close)) {
      if (!confirm('Shift hours are outside business hours. Continue anyway?')) {
        return
      }
    }

    const rec = { type: shiftType, start, end }
    if (has2) { rec.start2 = start2; rec.end2 = end2; rec.type2 = type2 }
    const restChk = validate11hRestBetweenDays(employeeId, dateStr, rec)
    if (!restChk.ok) {
      alert(restChk.msg)
      return
    }
    const weeklyRestChk = validate24hRestInAny7Days(employeeId, dateStr, rec)
    if (!weeklyRestChk.ok) {
      alert(weeklyRestChk.msg)
      return
    }
    data.shifts[key] = rec
  } else if (shiftType === 'AN') {
    data.shifts[key] = { type: 'AN' }
  } else {
    const reason = document.getElementById('absenceReason').value
    data.shifts[key] = { type: shiftType, reason }
  }

  saveData()
  closeModal('shiftModal')
  renderAll()
}

function saveMultipleShifts(shiftType) {
  if (selectedCells.length === 0) return

  if (shiftType === 'ΕΡΓ' || shiftType === 'ΤΗΛ') {
    const start = document.getElementById('shiftStart').value
    const end = document.getElementById('shiftEnd').value
    const has2 = !!document.getElementById('hasSecondShift')?.checked
    const type2 = (document.getElementById('shiftType2')?.value === 'ΤΗΛ') ? 'ΤΗΛ' : 'ΕΡΓ'
    const start2 = document.getElementById('shiftStart2').value
    const end2 = document.getElementById('shiftEnd2').value

    if (!isValidTime24h(start) || !isValidTime24h(end)) {
      alert('Please enter valid times in 24-hour format (HH:MM)')
      return
    }

    if (start === end) {
      alert('Start and end time cannot be the same')
      return
    }

    if (has2) {
      if (!isValidTime24h(start2) || !isValidTime24h(end2) || start2 === end2) {
        alert('Please enter valid second-shift times in 24-hour format (HH:MM)')
        return
      }
      const gap = toMinutes(start2) - toMinutes(end)
      if (gap < 180) {
        alert('Το κενό μεταξύ των 2 βαρδιών πρέπει να είναι τουλάχιστον 3 ώρες')
        return
      }
    }

    const businessHours = getBusinessHoursForWeek()
    let outsideHoursWarningShown = false

    // Apply to all selected cells
    for (const cell of selectedCells) {
      const date = new Date(cell.dateStr)
      const dayOfWeek = date.getDay()
      const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      const businessDay = businessHours[dayIndex]

      if (
        !outsideHoursWarningShown &&
        !isWithinBusinessHours(start, end, businessDay.open, businessDay.close)
      ) {
        if (!confirm('Some shifts are outside business hours. Continue anyway?')) {
          return
        }
        outsideHoursWarningShown = true
      }

      const key = `${cell.employeeId}_${cell.dateStr}`
      const rec = { type: shiftType, start, end }
      if (has2) { rec.start2 = start2; rec.end2 = end2; rec.type2 = type2 }
      const restChk = validate11hRestBetweenDays(cell.employeeId, cell.dateStr, rec)
      if (!restChk.ok) {
        alert(`${cell.employeeId} ${cell.dateStr}: ${restChk.msg}`)
        return
      }
      const weeklyRestChk = validate24hRestInAny7Days(cell.employeeId, cell.dateStr, rec)
      if (!weeklyRestChk.ok) {
        alert(`${cell.employeeId} ${cell.dateStr}: ${weeklyRestChk.msg}`)
        return
      }
      data.shifts[key] = rec
    }
  } else if (shiftType === 'AN') {
    for (const cell of selectedCells) {
      const key = `${cell.employeeId}_${cell.dateStr}`
      data.shifts[key] = { type: 'AN' }
    }
  } else {
    const reason = document.getElementById('absenceReason').value
    for (const cell of selectedCells) {
      const key = `${cell.employeeId}_${cell.dateStr}`
      data.shifts[key] = { type: shiftType, reason }
    }
  }

  saveData()
  closeModal('shiftModal')
  clearSelection()
  renderAll()
}

function clearShift() {
  const employeeIdVal = document.getElementById('shiftEmployeeId').value
  const dateVal = document.getElementById('shiftDate').value

  // Check if this is a multi-cell clear
  if (employeeIdVal === 'multi' && dateVal === 'multi') {
    if (selectedCells.length > 0) {
      for (const cell of selectedCells) {
        delete data.shifts[`${cell.employeeId}_${cell.dateStr}`]
      }
      saveData()
      closeModal('shiftModal')
      clearSelection()
      renderAll()
    }
    return
  }

  const employeeId = employeeIdVal
  const dateStr = dateVal
  delete data.shifts[`${employeeId}_${dateStr}`]

  saveData()
  closeModal('shiftModal')
  renderAll()
}

// Business Hours Modal (per week)
function openBusinessHoursModal() {
  const modal = document.getElementById('businessHoursModal')
  const form = document.getElementById('businessHoursForm')
  const businessHours = getBusinessHoursForWeek()
  const holidays = getHolidaysForWeek()

  let html = ''
  DAYS.forEach((day, i) => {
    const bh = businessHours[i]
    const isHoliday = holidays.includes(i)
    html += `
      <div class="form-group" style="border-bottom: 1px solid #eee; padding-bottom: 15px;">
        <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
          <label style="min-width: 100px; margin-bottom: 0;">${day}</label>
          <div class="checkbox-item">
            <input type="checkbox" id="holiday${i}" ${isHoliday ? 'checked' : ''}>
            <label for="holiday${i}">🎉 Αργία</label>
          </div>
          <input type="text" id="bhOpen${i}" value="${bh.open}" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" class="time-input-24h">
          <span>to</span>
          <input type="text" id="bhClose${i}" value="${bh.close}" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" class="time-input-24h">
        </div>
      </div>`
  })
  form.innerHTML = html
  modal.classList.add('active')
}

function toggleBusinessDay(dayIndex) {
  const isClosed = document.getElementById(`closed${dayIndex}`).checked
  document.getElementById(`bhOpen${dayIndex}`).disabled = isClosed
  document.getElementById(`bhClose${dayIndex}`).disabled = isClosed
}

function copyFromDefaultHours() {
  DAYS.forEach((day, i) => {
    const bh = data.defaultBusinessHours[i]
    document.getElementById(`closed${i}`).checked = bh.closed
    document.getElementById(`bhOpen${i}`).value = bh.open
    document.getElementById(`bhClose${i}`).value = bh.close
    document.getElementById(`bhOpen${i}`).disabled = bh.closed
    document.getElementById(`bhClose${i}`).disabled = bh.closed
    document.getElementById(`holiday${i}`).checked = false
  })
}

function saveBusinessHours() {
  const weekKey = getWeekKey()
  const weekHours = {}
  const holidays = []

  let hasError = false
  DAYS.forEach((day, i) => {
    const open = document.getElementById(`bhOpen${i}`).value
    const close = document.getElementById(`bhClose${i}`).value
    const closed = document.getElementById(`closed${i}`).checked
    const isHoliday = document.getElementById(`holiday${i}`).checked

    if (!closed && (!isValidTime24h(open) || !isValidTime24h(close))) {
      hasError = true
    }

    weekHours[i] = { open, close, closed }
    if (isHoliday) holidays.push(i)
  })

  if (hasError) {
    alert('Please enter valid times in 24-hour format (HH:MM)')
    return
  }

  data.weekBusinessHours[weekKey] = weekHours
  data.weekHolidays[weekKey] = holidays
  saveData()
  closeModal('businessHoursModal')
  renderAll()
}

// Defaults Modal
function openDefaultsModal() {
  const modal = document.getElementById('defaultsModal')
  const form = document.getElementById('defaultBusinessHoursForm')

  // Populate default business hours form
  let html = ''
  DAYS.forEach((day, i) => {
    const bh = data.defaultBusinessHours[i]
    html += `
      <div class="form-group" style="border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 10px;">
        <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
          <label style="min-width: 100px; margin-bottom: 0;">${day}</label>
          <input type="text" id="defBhOpen${i}" value="${bh.open}" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" class="time-input-24h">
          <span>to</span>
          <input type="text" id="defBhClose${i}" value="${bh.close}" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" class="time-input-24h">
        </div>
      </div>`
  })
  form.innerHTML = html

  modal.classList.add('active')
}

function toggleDefaultBusinessDay(dayIndex) {
  const isClosed = document.getElementById(`defClosed${dayIndex}`).checked
  document.getElementById(`defBhOpen${dayIndex}`).disabled = isClosed
  document.getElementById(`defBhClose${dayIndex}`).disabled = isClosed
}

function openEmployeePresetsModal() {
  const modal = document.getElementById('employeePresetsModal')
  const container = document.getElementById('employeePresetsForm')

  if (!data.employees.length) {
    container.innerHTML = '<p style="color:#999; text-align:center; padding:16px;">No employees available.</p>'
    modal.classList.add('active')
    return
  }

  container.innerHTML = data.employees
    .map(
      (emp) => `
      <div class="form-group" style="border-bottom:1px solid #eee; padding-bottom:14px; margin-bottom:14px;">
        <label style="font-weight:700;">${employeeLabel(emp)}</label>
        <div class="form-row">
          <div class="form-group">
            <label style="font-size:0.9em; font-weight:normal;">Working Hours/Week</label>
            <input type="number" id="presetMin_${emp.vat}" value="${getWorkingHours(emp, 40)}" min="0" max="80">
          </div>
          <div class="form-group" style="display:none;">
            <label style="font-size:0.9em; font-weight:normal;">Working Hours/Week (legacy hidden)</label>
            <input type="number" id="presetMax_${emp.vat}" value="${getWorkingHours(emp, 40)}" min="0" max="80">
          </div>
          <div class="form-group">
            <label style="font-size:0.9em; font-weight:normal;">€/Ώρα</label>
            <input type="number" id="presetRate_${emp.vat}" value="${emp.hourlyRate || 10}" min="0" step="0.5">
          </div>
        </div>
        <div class="form-group">
          <label style="font-size:0.9em; font-weight:normal;">Default Rest Days (2)</label>
          <div class="checkbox-group">
            ${DAYS.map(
              (day, i) => `
                <div class="checkbox-item">
                  <input type="checkbox" id="presetRest_${emp.vat}_${i}" ${
                    (emp.defaultRestDays || []).includes(i) ? 'checked' : ''
                  }>
                  <label for="presetRest_${emp.vat}_${i}">${DAY_ABBREV[i]}</label>
                </div>
              `,
            ).join('')}
          </div>
        </div>
      </div>
    `,
    )
    .join('')

  modal.classList.add('active')
}

function saveEmployeePresets() {
  for (const emp of data.employees) {
    const workingHours = parseInt(document.getElementById(`presetMin_${emp.vat}`)?.value) || 0
    const hourlyRate = parseFloat(document.getElementById(`presetRate_${emp.vat}`)?.value) || 0

    const restDays = []
    for (let i = 0; i < 7; i++) {
      if (document.getElementById(`presetRest_${emp.vat}_${i}`)?.checked) restDays.push(i)
    }
    if (restDays.length !== 2) {
      alert(`${employeeLabel(emp)}: select exactly 2 default rest days`)
      return
    }

    emp.weekWorkingHours = workingHours
    emp.defaultRestDays = restDays
  }

  saveData()
  closeModal('employeePresetsModal')
  renderAll()
}

function saveDefaults() {
  // Save default business hours
  let hasError = false
  DAYS.forEach((day, i) => {
    const open = document.getElementById(`defBhOpen${i}`).value
    const close = document.getElementById(`defBhClose${i}`).value
    const closed = false

    if ((!isValidTime24h(open) || !isValidTime24h(close))) {
      hasError = true
    }

    data.defaultBusinessHours[i] = { open, close, closed }
  })

  if (hasError) {
    alert('Please enter valid times in 24-hour format (HH:MM)')
    return
  }

  saveData()
  closeModal('defaultsModal')
  alert('Defaults saved successfully!')
}

// Employee Week Settings Modal
function openEmployeeWeekModal(employeeId) {
  const emp = data.employees.find((e) => String(e.vat) === String(employeeId))
  if (!emp) return

  const modal = document.getElementById('employeeWeekModal')
  const weekEnd = new Date(currentWeekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  document.getElementById('employeeWeekModalTitle').textContent = `${employeeLabel(emp)} - Ρυθμίσεις Εβδομάδας`
  document.getElementById('employeeWeekSubtitle').textContent =
    `Ρυθμίσεις για ${formatDisplayDate(currentWeekStart)} - ${formatDisplayDate(weekEnd)}`
  document.getElementById('employeeWeekId').value = employeeId

  // Load current week settings or defaults
  const weekSettings = getEmployeeWeekSettings(employeeId)
  document.getElementById('weekMinHours').value = weekSettings.workingHours
  document.getElementById('weekMaxHours').value = weekSettings.workingHours
  document.getElementById('weekHourlyRate').value = weekSettings.hourlyRate || emp.hourlyRate || 10

  // Load rest days
  const restDays = getRestDaysForEmployee(employeeId)
  const checkboxGroup = document.getElementById('weekRestDaysCheckboxes')
  checkboxGroup.innerHTML = DAYS.map(
    (day, i) => `
    <div class="checkbox-item">
      <input type="checkbox" id="weekRest_${i}" ${restDays.includes(i) ? 'checked' : ''}>
      <label for="weekRest_${i}">${DAY_ABBREV[i]}</label>
    </div>
  `,
  ).join('')

  modal.classList.add('active')
}

function resetEmployeeWeekToDefault() {
  const employeeId = String(document.getElementById('employeeWeekId').value)
  const emp = data.employees.find((e) => String(e.vat) === String(employeeId))
  if (!emp) return

  document.getElementById('weekMinHours').value = getWorkingHours(emp, 40)
  document.getElementById('weekMaxHours').value = getWorkingHours(emp, 40)
  document.getElementById('weekHourlyRate').value = emp.hourlyRate || 10

  DAYS.forEach((day, i) => {
    const checkbox = document.getElementById(`weekRest_${i}`)
    if (checkbox) {
      checkbox.checked = emp.defaultRestDays.includes(i)
    }
  })
}

function saveEmployeeWeekSettings() {
  const employeeId = String(document.getElementById('employeeWeekId').value)
  const weekKey = getWeekKey()
  const key = `${weekKey}_${employeeId}`

  const workingHours = parseInt(document.getElementById('weekMinHours').value) || 40
  const hourlyRate = parseFloat(document.getElementById('weekHourlyRate').value) || 10

  // Get rest days
  const restDays = []
  for (let i = 0; i < 7; i++) {
    const checkbox = document.getElementById(`weekRest_${i}`)
    if (checkbox && checkbox.checked) {
      restDays.push(i)
    }
  }

  if (restDays.length !== 2) {
    alert('Please select exactly 2 rest days')
    return
  }

  // Save week-specific settings
  data.weekEmployeeSettings[key] = { workingHours, hourlyRate }
  data.weekRestDays[key] = restDays

  saveData()
  closeModal('employeeWeekModal')
  renderAll()
}

// Rest Days Modal (per week)
function openRestDaysModal() {
  const modal = document.getElementById('restDaysModal')
  const form = document.getElementById('restDaysForm')

  let html = ''
  data.employees.forEach((emp) => {
    const restDays = getRestDaysForEmployee(emp.vat)
    html += `
      <div class="form-group" style="border-bottom: 1px solid #eee; padding-bottom: 15px;">
        <label style="margin-bottom: 10px;">${employeeLabel(emp)}</label>
        <div class="checkbox-group">
          ${DAYS.map(
            (day, i) => `
            <div class="checkbox-item">
              <input type="checkbox" id="empRest_${emp.vat}_${i}"
                ${restDays.includes(i) ? 'checked' : ''}>
              <label for="empRest_${emp.vat}_${i}">${DAY_ABBREV[i]}</label>
            </div>
          `,
          ).join('')}
        </div>
      </div>`
  })

  if (data.employees.length === 0) {
    html = '<p style="color: #999; text-align: center; padding: 20px;">No employees added yet.</p>'
  }

  form.innerHTML = html
  modal.classList.add('active')
}

function resetRestDaysToDefault() {
  data.employees.forEach((emp) => {
    DAYS.forEach((day, i) => {
      const checkbox = document.getElementById(`empRest_${emp.vat}_${i}`)
      if (checkbox) {
        checkbox.checked = emp.defaultRestDays.includes(i)
      }
    })
  })
}

function saveWeekRestDays() {
  const weekKey = getWeekKey()

  data.employees.forEach((emp) => {
    const restDays = []
    for (let i = 0; i < 7; i++) {
      const checkbox = document.getElementById(`empRest_${emp.vat}_${i}`)
      if (checkbox && checkbox.checked) {
        restDays.push(i)
      }
    }

    if (restDays.length !== 2) {
      alert(`${employeeLabel(emp)} must have exactly 2 rest days`)
      return
    }

    const key = `${weekKey}_${emp.vat}`
    data.weekRestDays[key] = restDays
  })

  saveData()
  closeModal('restDaysModal')
  renderAll()
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active')

  // Reset shift modal title when closing
  if (modalId === 'shiftModal') {
    const modal = document.getElementById('shiftModal')
    const title = modal.querySelector('h2')
    title.textContent = 'Edit Shift'
  }
}

// Data persistence (client-side only)
const STORAGE_KEY = 'eschedule_state_v1'
const IDB_NAME = 'eschedule_db'
const IDB_STORE = 'kv'
const IDB_KEY = 'state'

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbSetState(payload) {
  const db = await idbOpen()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(payload, IDB_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function idbGetState() {
  const db = await idbOpen()
  const val = await new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return val
}

async function clearPersistedState() {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
  try {
    const db = await idbOpen()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).delete(IDB_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {}
}

function normalizeShiftKey(rawKey) {
  const m = String(rawKey || '').match(/^(.+?)_(.+)$/)
  if (!m) return String(rawKey || '').trim()
  const vat = String(m[1] || '').trim()
  const day = normalizeCardDate(m[2])
  return `${vat}_${day}`
}

function shiftTypePriority(shift) {
  if (isWorkingType(shift)) return 4
  if (shift && isAbsenceType(shift.type) && isPaidAbsenceType(shift.type)) return 3
  if (shift && isAbsenceType(shift.type)) return 2
  if (shift && (String(shift.type).trim() === 'AN' || String(shift.type).trim() === 'ΜΕ' || String(shift.type).trim() === 'ME')) return 1
  return 0
}

function sanitizeStateForPersist(state) {
  const out = { ...state }

  out.employees = (state.employees || []).map((e) => ({
    vat: String(e.vat || '').trim(),
    nickName: String(e.nickName || '').trim(),
    payType: e.payType === 'monthly' ? 'monthly' : 'hourly',
    weekWorkingHours: Number(e.weekWorkingHours || 40),
    monthlySalary: Number(e.monthlySalary || 0),
    weekWorkingDays: Number(e.weekWorkingDays || 5),
    defaultRestDays: Array.isArray(e.defaultRestDays) ? e.defaultRestDays : [5, 6],
  }))

  const normalizedShiftEntries = []
  const shiftKeyRe = /^(.+?)_(\d{4}-\d{2}-\d{2})$/

  Object.entries(state.shifts || {}).forEach(([k, v]) => {
    const t = String(v?.type || '').trim()
    if (!t) return

    let clean = null
    if (['ΕΡΓ', 'ΤΗΛ'].includes(t)) {
      clean = { type: t, start: String(v.start || '09:00'), end: String(v.end || '17:00') }
      if (v.start2 && v.end2) {
        clean.start2 = String(v.start2)
        clean.end2 = String(v.end2)
        clean.type2 = String(v.type2 || t) === 'ΤΗΛ' ? 'ΤΗΛ' : 'ΕΡΓ'
      }
    } else if (t === 'AN') {
      clean = { type: 'AN' }
    } else if (String(t) === 'ΜΕ' || String(t) === 'ME') {
      clean = { type: 'ΜΕ' }
    } else {
      // Keep any configured/custom absence types (do not drop unknown types)
      clean = v?.reason ? { type: t, reason: String(v.reason) } : { type: t }
    }

    const m = String(k).match(shiftKeyRe)
    const vat = m ? m[1] : ''
    const day = m ? m[2] : ''
    const week = day ? getWeekKeyFromDateStr(day) : ''
    const nk = normalizeShiftKey(k)
    const mk = String(nk).match(/^(.+?)_(\d{4}-\d{2}-\d{2})$/)
    const nvat = mk ? mk[1] : vat
    const nday = mk ? mk[2] : day
    const nweek = nday ? getWeekKeyFromDateStr(nday) : week
    normalizedShiftEntries.push({ key: nk, value: clean, vat: nvat, day: nday, week: nweek, isWorking: ['ΕΡΓ', 'ΤΗΛ'].includes(clean.type) })
  })

  // Keep only weeks that have at least one working schedule, to keep JSON small
  const activeWeeks = new Set(normalizedShiftEntries.filter((e) => e.isWorking && e.week).map((e) => e.week))

  const cleanShifts = {}
  normalizedShiftEntries
    .filter((e) => e.week && activeWeeks.has(e.week))
    .sort((a, b) => {
      if (a.week !== b.week) return a.week.localeCompare(b.week)
      if (a.day !== b.day) return a.day.localeCompare(b.day)
      if (a.vat !== b.vat) return String(a.vat).localeCompare(String(b.vat))
      return String(a.key).localeCompare(String(b.key))
    })
    .forEach((e) => {
      const existing = cleanShifts[e.key]
      if (!existing || shiftTypePriority(e.value) >= shiftTypePriority(existing)) cleanShifts[e.key] = e.value
    })

  const sortObjectByDateKey = (obj) => {
    const outObj = {}
    Object.keys(obj || {}).sort((a, b) => String(a).localeCompare(String(b))).forEach((k) => {
      outObj[k] = obj[k]
    })
    return outObj
  }

  const filterWeekMapToActive = (obj) => {
    const outObj = {}
    Object.keys(obj || {})
      .filter((wk) => activeWeeks.has(String(wk)))
      .sort((a, b) => String(a).localeCompare(String(b)))
      .forEach((wk) => {
        outObj[wk] = obj[wk]
      })
    return outObj
  }

  out.shifts = cleanShifts
  out.weekBusinessHours = filterWeekMapToActive(state.weekBusinessHours || {})
  out.weekHolidays = sortObjectByDateKey(filterWeekMapToActive(state.weekHolidays || {}))
  out.weekRestDays = {}
  out.weekEmployeeSettings = {}
  out.__meta = { savedAt: Date.now() }

  return out
}

async function saveData() {
  try {
    ensureRestShiftsForWeek(currentWeekStart)
    data = sanitizeStateForPersist(data)
    const payload = JSON.stringify(data)
    localStorage.setItem(STORAGE_KEY, payload)
    try { await idbSetState(payload) } catch {}
  } catch (err) {
    console.error('Failed to save state to localStorage', err)
  }
}

function normalizeLoadedState(loaded) {
  // Normalize shifts to target schema:
  // - working/teleworking => {type,start,end}
  // - rest/holiday/sick/other => {type[,reason]}
  if (loaded.shifts) {
    const normalizedShifts = {}
    Object.entries(loaded.shifts || {}).forEach(([k, v]) => {
      const nk = normalizeShiftKey(k)
      const t = String(v?.type || '').trim()
      if (!t) return

      if (['ΕΡΓ', 'ΤΗΛ'].includes(t)) {
        const cand = {
          type: t,
          start: String(v?.start || '09:00'),
          end: String(v?.end || '17:00'),
        }
        if (v?.start2 && v?.end2) {
          cand.start2 = String(v.start2)
          cand.end2 = String(v.end2)
          cand.type2 = String(v?.type2 || t) === 'ΤΗΛ' ? 'ΤΗΛ' : 'ΕΡΓ'
        }
        if (!normalizedShifts[nk] || shiftTypePriority(cand) >= shiftTypePriority(normalizedShifts[nk])) normalizedShifts[nk] = cand
        return
      }

      if (t === 'AN') {
        const cand = { type: 'AN' }
        if (!normalizedShifts[nk] || shiftTypePriority(cand) >= shiftTypePriority(normalizedShifts[nk])) normalizedShifts[nk] = cand
        return
      }

      if (String(t) === 'ΜΕ' || String(t) === 'ME') {
        const cand = { type: 'ΜΕ' }
        if (!normalizedShifts[nk] || shiftTypePriority(cand) >= shiftTypePriority(normalizedShifts[nk])) normalizedShifts[nk] = cand
        return
      }

      // Keep any configured/custom absence types (do not drop unknown types)
      const r = String(v?.reason || '').trim()
      const cand = r ? { type: t, reason: r } : { type: t }
      if (!normalizedShifts[nk] || shiftTypePriority(cand) >= shiftTypePriority(normalizedShifts[nk])) normalizedShifts[nk] = cand
    })
    loaded.shifts = normalizedShifts
  }

  if (loaded.employees) {
    loaded.employees = loaded.employees.map((emp) => ({
      ...emp,
      payType: emp.payType || 'hourly',
      vat: String(emp.vat || '').trim(),
      nickName: String(emp.nickName || '').trim(),
      weekWorkingHours: Number(emp.weekWorkingHours ?? emp.workingHours ?? 40),
      weekWorkingDays: Number(emp.weekWorkingDays ?? 5),
      monthlySalary: Number(emp.monthlySalary ?? 0),
      defaultRestDays: emp.defaultRestDays || emp.restDays || [5, 6],
    }))
  }
  const payrollRules = loaded.payrollRules || {}
  return {
    employees: loaded.employees || [],
    defaultBusinessHours: loaded.defaultBusinessHours ? Object.fromEntries(Object.entries(loaded.defaultBusinessHours).map(([k,d]) => [k, { open: String(d?.open||'09:00'), close: String(d?.close||'17:00'), closed: false }])) : JSON.parse(JSON.stringify(DEFAULT_BUSINESS_HOURS)),
    defaultEmployeeSettings: loaded.defaultEmployeeSettings
      ? {
          ...loaded.defaultEmployeeSettings,
          workingHours: getWorkingHours(loaded.defaultEmployeeSettings, 40),
        }
      : {
          workingHours: 40,
          restDays: [5, 6],
          hourlyRate: 10,
        },
    payrollRules: {
      absencePolicies: {
        holiday: {
          paid: payrollRules.absencePolicies?.holiday?.paid ?? true,
          multiplier: Number(payrollRules.absencePolicies?.holiday?.multiplier ?? 1),
        },
        sick: {
          paid: payrollRules.absencePolicies?.sick?.paid ?? false,
          multiplier: Number(payrollRules.absencePolicies?.sick?.multiplier ?? 0),
        },
        other: {
          paid: payrollRules.absencePolicies?.other?.paid ?? false,
          multiplier: Number(payrollRules.absencePolicies?.other?.multiplier ?? 0),
        },
      },
      officialHolidayPaidIfAbsent: payrollRules.officialHolidayPaidIfAbsent ?? true,
      officialHolidayPayMultiplier: Number(payrollRules.officialHolidayPayMultiplier ?? 1),
    },
    weekBusinessHours: Object.fromEntries(Object.entries(loaded.weekBusinessHours || {}).map(([wk,v]) => [wk, Object.fromEntries(Object.entries(v||{}).map(([k,d]) => [k, { open: String(d?.open||'09:00'), close: String(d?.close||'17:00'), closed: false }]))])),
    weekRestDays: loaded.weekRestDays || {},
    weekEmployeeSettings: loaded.weekEmployeeSettings || {},
    weekHolidays: loaded.weekHolidays || {},
    shifts: loaded.shifts || {},
  }
}

function pickBestSnapshot(candidates) {
  const parsed = candidates
    .map((raw) => {
      try { return raw ? JSON.parse(raw) : null } catch { return null }
    })
    .filter(Boolean)
  if (!parsed.length) return {}

  parsed.sort((a, b) => {
    const ta = Number(a?.__meta?.savedAt || 0)
    const tb = Number(b?.__meta?.savedAt || 0)
    if (ta !== tb) return tb - ta
    const sa = Number((a?.employees?.length || 0) + Object.keys(a?.shifts || {}).length)
    const sb = Number((b?.employees?.length || 0) + Object.keys(b?.shifts || {}).length)
    return sb - sa
  })
  return parsed[0]
}

async function loadData() {
  try {
    const localPrimary = localStorage.getItem(STORAGE_KEY)
    const localBackup = null
    let idbRaw = null
    try { idbRaw = await idbGetState() } catch {}

    const loaded = pickBestSnapshot([localPrimary, idbRaw])
    data = normalizeLoadedState(loaded)

    // self-heal all backends with chosen snapshot
    const payload = JSON.stringify(sanitizeStateForPersist(data))
    localStorage.setItem(STORAGE_KEY, payload)
    try { await idbSetState(payload) } catch {}
  } catch (err) {
    console.error('Failed to load state from storage', err)
    data = normalizeLoadedState({})
  }
}

function parseISODateLocal(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
function formatISODateLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getWeekKeyFromDateStr(dateStr) {
  const d = parseISODateLocal(dateStr)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday-first
  d.setDate(diff)
  return formatISODateLocal(d)
}

function aggregateWeeklyFromDaily(dailyMap) {
  const weekly = {}
  Object.entries(dailyMap || {}).forEach(([dayStr, hours]) => {
    const wk = getWeekKeyFromDateStr(dayStr)
    weekly[wk] = (weekly[wk] || 0) + Number(hours || 0)
  })
  Object.keys(weekly).forEach((k) => {
    weekly[k] = Math.round(weekly[k] * 100) / 100
  })
  return weekly
}

function currentMonthValue() {
  const now = new Date()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${m}`
}

function getPayrollMonthFilterValue() {
  const el = document.getElementById('payrollMonthFilter')
  const raw = String(el?.value || '').trim()
  if (/^\d{4}-\d{2}$/.test(raw)) return raw
  const alt = raw.replace('/', '-').replace('.', '-').slice(0, 7)
  if (/^\d{4}-\d{2}$/.test(alt)) return alt
  return ''
}

async function openPayrollModal() {
  const employeeSelect = document.getElementById('payrollEmployeeFilter')
  employeeSelect.innerHTML = ''
  data.employees.forEach((emp) => {
    const opt = document.createElement('option')
    opt.value = String(emp.vat)
    opt.textContent = `${employeeLabel(emp)}${emp.vat ? ' (' + emp.vat + ')' : ''}`
    employeeSelect.appendChild(opt)
  })
  if (data.employees.length > 0) employeeSelect.value = String(data.employees[0].vat)

  const monthInput = document.getElementById('payrollMonthFilter')
  if (!monthInput.value) monthInput.value = currentMonthValue()
  // Firefox fallback: when month picker support is partial/missing, allow typed YYYY-MM
  if (monthInput.type !== 'month') {
    monthInput.placeholder = 'YYYY-MM'
    monthInput.pattern = '\\d{4}-\\d{2}'
    if (!monthInput.value) monthInput.value = currentMonthValue()
  }
  monthInput.oninput = () => renderPayrollSummary()
  monthInput.onchange = () => renderPayrollSummary()

  document.getElementById('payrollModal').classList.add('active')
  await renderPayrollSummary()
}

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
    const minuteInDay = ((m % (24 * 60)) + (24 * 60)) % (24 * 60)
    const actualDay = plusDaysISO(dayStr, dayOffset)
    out.push({
      day: actualDay,
      sourceDay: dayStr,
      hours: dur / 60,
      isNight: minuteInDay < 360 || minuteInDay >= 1320,
      isHoliday: isHolidayOrSundayDate(dayStr),
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

  const slices = []
  for (let i = 0; i < 7; i++) {
    const day = formatISODateLocal(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i))
    const sh = data.shifts?.[`${employeeId}_${day}`]
    if (!isWorkingType(sh)) continue
    slices.push(...shiftRangeToSlices(day, sh.start, sh.end, sh.type))
    if (sh.start2 && sh.end2) slices.push(...shiftRangeToSlices(day, sh.start2, sh.end2, sh.type2 || sh.type))
  }

  const filtered = slices.filter((x) => inWeek(x)).sort((a, b) => a.absOrder.localeCompare(b.absOrder))
  const byShiftDayWorked = {}
  let weekWorked = 0

  return filtered.map((sl) => {
    const thresholdDay = sl.sourceDay || sl.day
    const dayWorked = byShiftDayWorked[thresholdDay] || 0
    let category = 'within'

    if (dayWorked >= 11) category = 'illegal' // 12η+
    else if (dayWorked >= 9) category = 'yp' // 10η-11η
    else if (dayWorked >= 8) category = 'ye' // 9η
    else if (Number(weekTarget || 40) < 40 && weekWorked >= Number(weekTarget || 40) && weekWorked < 40) category = 'additional'
    else if (weekWorked >= 40 && weekWorked < 45) category = 'ye' // εβδομαδιαία 40->45
    else if (weekWorked >= 45) category = 'yp'

    byShiftDayWorked[thresholdDay] = dayWorked + sl.hours
    weekWorked += sl.hours

    return { ...sl, category }
  })
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
  Object.keys(out).forEach((k) => { out[k] = Math.round(out[k] * 100) / 100 })
  return out
}

const PAYROLL_CATEGORIES = [
  { key: 'within', label: 'Εντός' },
  { key: 'additional', label: 'Πρόσθετη' },
  { key: 'ye', label: 'Υπερεργασία' },
  { key: 'yp', label: 'Υπερωρία' },
  { key: 'illegal', label: 'Παράνομη Υπ.' },
]

const PAYROLL_BUCKET_KEYS = PAYROLL_CATEGORIES.flatMap((c) => [
  `${c.key}_work_day`,
  `${c.key}_work_night`,
  `${c.key}_holiday_day`,
  `${c.key}_holiday_night`,
])

function emptyPayrollBuckets() {
  const out = {}
  PAYROLL_BUCKET_KEYS.forEach((k) => { out[k] = 0 })
  return out
}

function payrollBucketKey(category, isHoliday, isNight) {
  return `${category}_${isHoliday ? 'holiday' : 'work'}_${isNight ? 'night' : 'day'}`
}


function bucketPayMultiplier(bucketKey) {
  const isNight = String(bucketKey).endsWith('_night')
  const isHoliday = String(bucketKey).includes('_holiday_')
  const cat = String(bucketKey).split('_')[0]

  const baseFactorMap = {
    within: 0,
    additional: 1.12,
    ye: 1.2,
    yp: 1.4,
    illegal: 1.8,
  }

  const base = Number(baseFactorMap[cat] ?? 0)
  if (cat === 'within') {
    return (isNight ? 0.25 : 0) + (isHoliday ? 0.75 : 0)
  }

  let mult = base
  if (isNight) mult *= 1.25
  if (isHoliday) mult *= 1.75
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
    const k = payrollBucketKey(cat, !!s.isHoliday, !!s.isNight)
    out[k] = (out[k] || 0) + Number(s.hours || 0)
  })
  Object.keys(out).forEach((k) => { out[k] = Math.round(out[k] * 100) / 100 })
  return out
}

function sumBucketMetrics(list) {
  const out = emptyPayrollBuckets()
  list.forEach((obj) => {
    PAYROLL_BUCKET_KEYS.forEach((k) => {
      out[k] += Number(obj?.[k] || 0)
    })
  })
  PAYROLL_BUCKET_KEYS.forEach((k) => { out[k] = Math.round(out[k] * 100) / 100 })
  return out
}

function payrollDayMetrics(day, employeeId = '') {
  const empIds = employeeId ? [String(employeeId)] : (data.employees || []).map((e) => String(e.vat))
  const perEmp = empIds.map((eid) => getEmployeeDayBucketMetrics(eid, day))
  const buckets = sumBucketMetrics(perEmp)
  const total = PAYROLL_BUCKET_KEYS.reduce((acc, k) => acc + Number(buckets[k] || 0), 0)
  const night = PAYROLL_BUCKET_KEYS.filter((k) => k.endsWith('_night')).reduce((acc, k) => acc + Number(buckets[k] || 0), 0)
  const additional = ['additional_work_day', 'additional_work_night', 'additional_holiday_day', 'additional_holiday_night'].reduce((a, k) => a + Number(buckets[k] || 0), 0)
  const ye = ['ye_work_day', 'ye_work_night', 'ye_holiday_day', 'ye_holiday_night'].reduce((a, k) => a + Number(buckets[k] || 0), 0)
  const yp = ['yp_work_day', 'yp_work_night', 'yp_holiday_day', 'yp_holiday_night'].reduce((a, k) => a + Number(buckets[k] || 0), 0)
  const illegal = ['illegal_work_day', 'illegal_work_night', 'illegal_holiday_day', 'illegal_holiday_night'].reduce((a, k) => a + Number(buckets[k] || 0), 0)
  const holiday75 = PAYROLL_BUCKET_KEYS.filter((k) => k.includes('_holiday_')).reduce((a, k) => a + Number(buckets[k] || 0), 0)
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
    const cells = PAYROLL_BUCKET_KEYS.map((k) => `<td><strong>${fmtAmount(bucketAmount(totals[k], k, hourlyRate))}</strong></td>`).join('')
    return `<tr class="week-separator"><td colspan="3">${labelHtml}</td>${cells}</tr>`
  }


  let body = ''
  let amountBody = ''
  let currentWeek = ''
  let weekAgg = emptyPayrollBuckets()
  let weekAmountAgg = emptyPayrollBuckets()
  let monthAgg = emptyPayrollBuckets()
  let monthAmountAgg = emptyPayrollBuckets()

  const selectedEmp = (data.employees || []).find((e) => String(e.vat) === String(employeeId || ''))
  const isMonthly = selectedEmp?.payType === 'monthly'
  const weekHoursCfg = Number(selectedEmp?.weekWorkingHours || 40)
  const monthlySalary = Number(selectedEmp?.monthlySalary || 0)
  const isFullTimeMonthly = isMonthly && weekHoursCfg >= 40
  const isPartTimeMonthly = isMonthly && weekHoursCfg > 0 && weekHoursCfg < 40
  const baseHourlyRate = isFullTimeMonthly
    ? (monthlySalary / 25)
    : isPartTimeMonthly
      ? (monthlySalary / ((weekHoursCfg * 25) / 6))
      : Number(selectedEmp?.hourlyRate || 0)

  entries.forEach(([day], idx) => {
    const weekKey = getWeekKeyFromDateStr(day)
    const m = payrollDayMetrics(day, employeeId)

    if (currentWeek && weekKey !== currentWeek) {
      const prevWeekStart = parseISODateLocal(currentWeek)
      const prevWeekEnd = new Date(prevWeekStart)
      prevWeekEnd.setDate(prevWeekEnd.getDate() + 6)
      body += subtotalRow(`<strong>Σύνολο εβδομάδας</strong> <small style="margin-left:8px;">${prevWeekStart.toLocaleDateString('el-GR')} - ${prevWeekEnd.toLocaleDateString('el-GR')}</small>`, weekAgg)
      amountBody += amountSubtotalRow(`<strong>Σύνολο εβδομάδας</strong> <small style="margin-left:8px;">${prevWeekStart.toLocaleDateString('el-GR')} - ${prevWeekEnd.toLocaleDateString('el-GR')}</small>`, weekAmountAgg, baseHourlyRate)
      weekAgg = emptyPayrollBuckets()
      weekAmountAgg = emptyPayrollBuckets()
    }

    currentWeek = weekKey
    PAYROLL_BUCKET_KEYS.forEach((k) => {
      weekAgg[k] += Number(m[k] || 0)
      monthAgg[k] += Number(m[k] || 0)
      weekAmountAgg[k] += Number(m[k] || 0)
      monthAmountAgg[k] += Number(m[k] || 0)
    })

    const t = classifyDayType(day, employeeId)
    const badge = `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${t.color};color:${t.fg};font-weight:700;">${t.code}</span> <span style="color:#475569;">${t.text}</span>`
    const timeText = dayTimeText(day, employeeId)
    const bucketCells = PAYROLL_BUCKET_KEYS.map((k) => `<td>${fmtHours(m[k])}</td>`).join('')
    body += `<tr><td>${formatPayrollDayLabel(day)}</td><td style="text-align:left;">${badge}</td><td style="text-align:left;">${timeText}</td>${bucketCells}</tr>`
    const amountCells = PAYROLL_BUCKET_KEYS.map((k) => `<td>${fmtAmount(bucketAmount(m[k], k, baseHourlyRate))}</td>`).join('')
    amountBody += `<tr><td>${formatPayrollDayLabel(day)}</td><td style="text-align:left;">${badge}</td><td style="text-align:left;">${timeText}</td>${amountCells}</tr>`

    if (idx === entries.length - 1) {
      const lastWeekStart = parseISODateLocal(currentWeek)
      const lastWeekEnd = new Date(lastWeekStart)
      lastWeekEnd.setDate(lastWeekEnd.getDate() + 6)
      body += subtotalRow(`<strong>Σύνολο εβδομάδας</strong> <small style="margin-left:8px;">${lastWeekStart.toLocaleDateString('el-GR')} - ${lastWeekEnd.toLocaleDateString('el-GR')}</small>`, weekAgg)
      amountBody += amountSubtotalRow(`<strong>Σύνολο εβδομάδας</strong> <small style="margin-left:8px;">${lastWeekStart.toLocaleDateString('el-GR')} - ${lastWeekEnd.toLocaleDateString('el-GR')}</small>`, weekAmountAgg, baseHourlyRate)
    }
  })

  const catHead1 = PAYROLL_CATEGORIES.map((c) => `<th colspan="4">${c.label}</th>`).join('')
  const catHead2 = PAYROLL_CATEGORIES.map(() => `<th colspan="2">Εργάσιμη</th><th colspan="2">Αργία</th>`).join('')
  const catHead3 = PAYROLL_CATEGORIES.map(() => `<th>Ημέρα</th><th>Νύχτα</th><th>Ημέρα</th><th>Νύχτα</th>`).join('')

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
              <th rowspan="3">Ημέρα</th>
              <th rowspan="3" style="text-align:left;">Τύπος</th>
              <th rowspan="3" style="text-align:left;">Ώρα (από-έως)</th>
              ${catHead1}
            </tr>
            <tr>${catHead2}</tr>
            <tr>${catHead3}</tr>
          </thead>
          <tbody>${body}</tbody>
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
              <th rowspan="3">Ημέρα</th>
              <th rowspan="3" style="text-align:left;">Τύπος</th>
              <th rowspan="3" style="text-align:left;">Ώρα (από-έως)</th>
              ${catHead1}
            </tr>
            <tr>${catHead2}</tr>
            <tr>${catHead3}</tr>
          </thead>
          <tbody>${amountBody}</tbody>
          <tfoot>
            ${amountSubtotalRow('<strong>Σύνολα μήνα</strong>', monthAmountAgg, baseHourlyRate)}
          </tfoot>
        </table>
      </div>
    </div>
  `
}


function calculateMonthlyPayrollOverview(employeeId, monthFilter) {
  const emp = (data.employees || []).find((e) => String(e.vat) === String(employeeId || ''))
  if (!emp || !monthFilter) return null

  const weekHoursCfg = Number(emp.weekWorkingHours || 40)
  const monthlySalary = Number(emp.monthlySalary || 0)
  const isMonthly = emp.payType === 'monthly'
  const baseHourlyRate = isMonthly
    ? (weekHoursCfg >= 40
      ? (monthlySalary / 25)
      : (weekHoursCfg > 0 ? (monthlySalary / ((weekHoursCfg * 25) / 6)) : 0))
    : Number(emp.hourlyRate || 0)

  const fullRows = expandToFullMonth({}, monthFilter)
  const days = Object.keys(fullRows).sort()
  const monthBuckets = emptyPayrollBuckets()
  days.forEach((day) => {
    const m = payrollDayMetrics(day, String(employeeId))
    PAYROLL_BUCKET_KEYS.forEach((k) => { monthBuckets[k] += Number(m[k] || 0) })
  })

  let extraTotal = 0
  const nonZeroHours = {}
  const nonZeroAmounts = {}

  PAYROLL_BUCKET_KEYS.forEach((k) => {
    const h = Math.round(monthBuckets[k] * 100) / 100
    if (Math.abs(h) > 1e-9) nonZeroHours[k] = h
    const amt = bucketAmount(h, k, baseHourlyRate)
    const a = Math.round(amt * 100) / 100
    if (Math.abs(a) > 1e-9) nonZeroAmounts[k] = a
    extraTotal += a
  })

  let salaryTotal = 0
  if (isMonthly) {
    const absDays = countMonthlyAbsenceDaysInMonth(emp.vat, monthFilter, Number(emp.weekWorkingDays || 5))
    const deduction = (monthlySalary / 25) * absDays
    salaryTotal = Math.max(0, monthlySalary - deduction)
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
  const overview = isMonth && selectedEmpId ? calculateMonthlyPayrollOverview(String(selectedEmpId), monthKey) : null

  const fmt = (v) => (Math.abs(Number(v || 0)) < 1e-9 ? '&nbsp;' : `€${Number(v).toFixed(2)}`)

  const body = `
    <tr>
      <td>${monthKey}</td>
      <td>${monthHours.toFixed(2)}</td>
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
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startM = sh * 60 + sm
  let endM = eh * 60 + em
  if (endM <= startM) endM += 24 * 60
  let nightMin = 0
  for (let m = startM; m < endM; m++) {
    const mod = m % (24 * 60)
    if (mod < 360 || mod >= 1320) nightMin++
  }
  return Math.round((nightMin / 60) * 100) / 100
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

  const empMap = new Map((employees || []).map((e) => [String(e.vat || ""), e]))
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
        const worked = shiftHours(shift.start || '00:00', shift.end || '00:00') + ((shift.start2 && shift.end2) ? shiftHours(shift.start2, shift.end2) : 0)
        const night = nightHours(shift.start || '00:00', shift.end || '00:00') + ((shift.start2 && shift.end2) ? nightHours(shift.start2, shift.end2) : 0)
        let premiumFactor = 1
        if (isHolidayOrSunday) premiumFactor += 0.75
        if (night > 0 && worked > 0) premiumFactor += (night / worked) * 0.25
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
  monthShiftsEntries.forEach((e) => { monthShifts[e.k] = e.v })

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

  const selectedEmpId = document.getElementById('payrollEmployeeFilter')?.value || ''
  const payrollOverview = selectedEmpId ? calculateMonthlyPayrollOverview(String(selectedEmpId), monthFilter) : null

  const out = {
    __meta: { exportedAt: Date.now(), month: monthFilter, mode: 'month-compact' },
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

  if (payrollOverview) {
    out.payrollSummary = {
      employeeId: String(selectedEmpId),
      month: monthFilter,
      baseHourlyRate: payrollOverview.baseHourlyRate,
      totals: {
        salaryTotal: payrollOverview.salaryTotal,
        extraTotal: payrollOverview.extraTotal,
        grandTotal: payrollOverview.grandTotal,
      },
      hours: payrollOverview.hours,
      amounts: payrollOverview.amounts,
    }
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
function openWorkRestModal() {
  // Set title with week date range
  const weekEnd = new Date(currentWeekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const startStr = currentWeekStart.toLocaleDateString('el-GR')
  const endStr = weekEnd.toLocaleDateString('el-GR')
  document.getElementById('workRestTitle').textContent = `📊 Διαστήματα Εργασίας/Ανάπαυσης (${startStr} - ${endStr})`

  renderWorkRestDiagram()
  document.getElementById('workRestModal').classList.add('active')
}

function renderWorkRestDiagram() {
  const container = document.getElementById('workRestDiagram')

  if (data.employees.length === 0) {
    container.innerHTML =
      '<p style="color: #999; text-align: center; padding: 40px;">Δεν έχουν προστεθεί εργαζόμενοι ακόμη.</p>'
    return
  }

  // Week starts Monday 00:00, ends Sunday 24:00 = 168 hours total
  const totalWeekHours = 168

  let html = '<div class="work-rest-container">'

  // Header row with day markers
  html += `<div class="work-rest-header">
    <div class="work-rest-header-name"></div>
    <div class="work-rest-day-markers">
      ${DAY_ABBREV.map((day) => `<div class="work-rest-day-marker">${day}</div>`).join('')}
    </div>
  </div>`

  data.employees.forEach((emp) => {
    const intervals = calculateWorkRestIntervals(emp.vat)

    html += `<div class="work-rest-row">
      <div class="work-rest-name">${employeeLabel(emp)}</div>
      <div class="work-rest-bar">`

    // Add day separator lines (6 lines between 7 days)
    for (let d = 1; d < 7; d++) {
      const leftPercent = ((d * 24) / totalWeekHours) * 100
      html += `<div class="work-rest-day-separator" style="left: ${leftPercent}%;"></div>`
    }

    intervals.forEach((interval) => {
      const widthPercent = (interval.duration / totalWeekHours) * 100
      const label = interval.duration >= 3 ? `${interval.duration}ω` : ''
      const cssClass = interval.type === 'work' ? 'work' : 'rest'
      const typeText = interval.type === 'work' ? 'Εργασία' : 'Ανάπαυση'

      html += `<div class="work-rest-segment ${cssClass}" style="width: ${widthPercent}%;" title="${typeText}: ${interval.duration} ώρες">
                <span class="segment-label">${label}</span>
              </div>`
    })

    html += `</div></div>`
  })

  html += '</div>'
  container.innerHTML = html
}

function calculateWorkRestIntervals(employeeId) {
  const intervals = []

  // Collect all shifts for the week with their start/end times as hours from Monday 00:00
  const shifts = []

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(currentWeekStart)
    dayDate.setDate(dayDate.getDate() + i)
    const dateStr = formatDate(dayDate)
    const shift = data.shifts[`${employeeId}_${dateStr}`]

    if (isWorkingType(shift)) {
      const dayStartHour = i * 24
      const addInterval = (s, e) => {
        const [startH, startM] = s.split(':').map(Number)
        const [endH, endM] = e.split(':').map(Number)
        const shiftStart = dayStartHour + startH + startM / 60
        let shiftEnd = dayStartHour + endH + endM / 60
        if (shiftEnd <= shiftStart) shiftEnd += 24 // overnight
        shifts.push({ start: shiftStart, end: shiftEnd })
      }

      addInterval(shift.start, shift.end)
      if (shift.start2 && shift.end2) addInterval(shift.start2, shift.end2)
    }
  }

  // Sort shifts by start time
  shifts.sort((a, b) => a.start - b.start)

  // Build intervals
  let currentHour = 0
  let lastWorkEnd = null

  shifts.forEach((shift, idx) => {
    // Rest before this shift
    if (shift.start > currentHour) {
      const restDuration = Math.round((shift.start - currentHour) * 10) / 10
      intervals.push({
        type: 'rest',
        duration: restDuration,
        betweenShifts: lastWorkEnd !== null && idx > 0,
      })
    }

    // Work shift
    const workDuration = Math.round((shift.end - shift.start) * 10) / 10
    intervals.push({
      type: 'work',
      duration: workDuration,
      betweenShifts: false,
    })

    currentHour = shift.end
    lastWorkEnd = shift.end
  })

  // Rest after last shift until end of week
  if (currentHour < 168) {
    const restDuration = Math.round((168 - currentHour) * 10) / 10
    intervals.push({
      type: 'rest',
      duration: restDuration,
      betweenShifts: false,
    })
  }

  // If no shifts at all, one big rest block
  if (shifts.length === 0) {
    intervals.push({
      type: 'rest',
      duration: 168,
      betweenShifts: false,
    })
  }

  return intervals
}

function printSchedule() {
  window.print()
}

function mergeImportedState(baseState, incomingState) {
  const base = normalizeLoadedState(baseState || {})
  const incoming = normalizeLoadedState(incomingState || {})

  const byVat = new Map()
  ;(base.employees || []).forEach((e) => byVat.set(String(e.vat), { ...e }))
  ;(incoming.employees || []).forEach((e) => byVat.set(String(e.vat), { ...e }))

  return {
    ...base,
    employees: [...byVat.values()].sort((a, b) => String(a.vat).localeCompare(String(b.vat))),
    defaultBusinessHours: incoming.defaultBusinessHours || base.defaultBusinessHours,
    defaultEmployeeSettings: incoming.defaultEmployeeSettings || base.defaultEmployeeSettings,
    payrollRules: incoming.payrollRules || base.payrollRules,
    weekBusinessHours: { ...(base.weekBusinessHours || {}), ...(incoming.weekBusinessHours || {}) },
    weekHolidays: { ...(base.weekHolidays || {}), ...(incoming.weekHolidays || {}) },
    weekRestDays: {},
    weekEmployeeSettings: {},
    shifts: { ...(base.shifts || {}), ...(incoming.shifts || {}) },
  }
}

function importSchedule() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.multiple = true
  input.onchange = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const appendMode = confirm('Append mode? OK = append/merge with existing data, Cancel = replace with imported data.')

    try {
      let nextData = appendMode ? normalizeLoadedState(data) : normalizeLoadedState({})

      for (const file of files) {
        const raw = await file.text()
        const parsed = JSON.parse(raw)
        nextData = appendMode
          ? mergeImportedState(nextData, parsed)
          : normalizeLoadedState(parsed)
      }

      data = nextData
      await clearPersistedState()
      await saveData()
      renderAll()
      alert(appendMode ? 'Data appended successfully!' : 'Schedule imported successfully!')
    } catch (err) {
      console.error(err)
      alert('Error importing file(s). Please ensure all are valid JSON files.')
    }
  }
  input.click()
}

// Multi-cell selection handlers
function handleCellClick(event, employeeId, dateStr, isClosed) {

  // Check if Ctrl/Cmd is held or multi-select mode is on
  if (event.ctrlKey || event.metaKey || isMultiSelectMode) {
    toggleCellSelection(employeeId, dateStr)
  } else {
    // Normal click - if cells are selected, open modal for them
    if (selectedCells.length > 0) {
      // Check if clicking on a selected cell
      const isSelected = selectedCells.some((c) => c.employeeId === employeeId && c.dateStr === dateStr)
      if (isSelected) {
        openShiftModalForSelection()
      } else {
        // Clear selection and select just this cell, then open modal
        clearSelection()
        openShiftModal(employeeId, dateStr, isClosed)
      }
    } else {
      // No selection - standard behavior
      openShiftModal(employeeId, dateStr, isClosed)
    }
  }
}

function toggleCellSelection(employeeId, dateStr) {
  const index = selectedCells.findIndex((c) => c.employeeId === employeeId && c.dateStr === dateStr)

  if (index >= 0) {
    // Remove from selection
    selectedCells.splice(index, 1)
  } else {
    // Add to selection
    selectedCells.push({ employeeId, dateStr })
  }

  updateSelectionUI()
  renderSchedule()
}

function clearSelection() {
  selectedCells = []
  updateSelectionUI()
  renderSchedule()
}

function toggleMultiSelectMode() {
  isMultiSelectMode = !isMultiSelectMode
  const btn = document.getElementById('multiSelectBtn')
  if (btn) {
    btn.classList.toggle('btn-active', isMultiSelectMode)
    btn.textContent = isMultiSelectMode ? '✓' : '☐'
  }
  if (!isMultiSelectMode) {
    // Optionally clear selection when exiting mode
    // clearSelection()
  }
}

function updateSelectionUI() {
  const container = document.getElementById('selectionActions')
  if (!container) return

  if (selectedCells.length > 0) {
    container.style.display = 'flex'
    container.innerHTML = `
      <span class="selection-count">${selectedCells.length} cell${selectedCells.length > 1 ? 's' : ''} selected</span>
      <button class="btn-primary" onclick="openShiftModalForSelection()">Edit Selected</button>
      <button class="btn-secondary" onclick="clearSelection()">Clear Selection</button>
    `
  } else {
    container.style.display = 'none'
    container.innerHTML = ''
  }
}

function openShiftModalForSelection() {
  if (selectedCells.length === 0) return

  const modal = document.getElementById('shiftModal')

  // Use first selected cell as reference
  const firstCell = selectedCells[0]
  document.getElementById('shiftEmployeeId').value = 'multi'
  document.getElementById('shiftDate').value = 'multi'

  // Update modal title to indicate multi-edit
  const modalTitle = modal.querySelector('h2')
  modalTitle.textContent = `Edit ${selectedCells.length} Shifts`

  // Set default values
  document.getElementById('shiftType').value = 'working'
  const businessHours = getBusinessHoursForWeek()
  const firstDate = new Date(firstCell.dateStr)
  const dayOfWeek = firstDate.getDay()
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const businessDay = businessHours[dayIndex]
  document.getElementById('shiftStart').value = businessDay.open
  document.getElementById('shiftEnd').value = businessDay.close
  document.getElementById('hasSecondShift').checked = false
  const t2 = document.getElementById('shiftType2'); if (t2) t2.value = document.getElementById('shiftType').value === 'ΤΗΛ' ? 'ΤΗΛ' : 'ΕΡΓ'
  document.getElementById('shiftStart2').value = ''
  document.getElementById('shiftEnd2').value = ''
  toggleSecondShiftFields()
  document.getElementById('absenceReason').value = ''

  toggleShiftFields()
  modal.classList.add('active')
}

function openCardDiffModal() {
  document.getElementById('cardDiffReport').innerHTML = ''
  document.getElementById('cardDiffModal').classList.add('active')
}

function parseCardFile(text) {
  const lines = String(text || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
  if (!lines.length) return []

  // Plain machine format fallback:
  // <VAT> <YYYY-MM-DD> <HH:MM-HH:MM>
  const plainRe = /^(\S+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/
  if (plainRe.test(lines[0])) {
    return lines.map((ln) => {
      const m = ln.match(plainRe)
      if (!m) return null
      return { employee: m[1], date: m[2], in: m[3], out: m[4] }
    }).filter(Boolean)
  }

  const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ','
  const headers = lines[0].split(delimiter).map((h) => h.trim().toLowerCase())
  const idx = {
    employee: headers.findIndex((h) => ['employee', 'name', 'employee_name', 'εργαζόμενος', 'ονομα', 'nick', 'nickname', 'vat', 'afm', 'αφμ'].includes(h)),
    date: headers.findIndex((h) => ['date', 'day', 'ημερομηνια', 'ημ/νια'].includes(h)),
    in: headers.findIndex((h) => ['in', 'checkin', 'clockin', 'εισοδος', 'start'].includes(h)),
    out: headers.findIndex((h) => ['out', 'checkout', 'clockout', 'εξοδος', 'end'].includes(h)),
  }
  if (idx.employee < 0 || idx.date < 0 || idx.in < 0 || idx.out < 0) {
    throw new Error('Missing columns. Need employee/date/in/out or plain format: <VAT> <YYYY-MM-DD> <HH:MM-HH:MM>')
  }

  return lines.slice(1).map((ln) => {
    const c = ln.split(delimiter).map((x) => x.trim())
    return {
      employee: c[idx.employee] || '',
      date: c[idx.date] || '',
      in: c[idx.in] || '',
      out: c[idx.out] || '',
    }
  })
}

function normalizeCardDate(value) {
  const s = String(value || '').trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m1 = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (m1) {
    const dd = String(Number(m1[1])).padStart(2, '0')
    const mm = String(Number(m1[2])).padStart(2, '0')
    const yy = m1[3]
    return `${yy}-${mm}-${dd}`
  }
  const m2 = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/)
  if (m2) {
    const yy = m2[1]
    const mm = String(Number(m2[2])).padStart(2, '0')
    const dd = String(Number(m2[3])).padStart(2, '0')
    return `${yy}-${mm}-${dd}`
  }
  return s.slice(0, 10)
}

function toMinutes(t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function diffMinutes(schedule, actual) {
  const s = toMinutes(schedule)
  const a = toMinutes(actual)
  if (s == null || a == null) return null
  let d = a - s
  return d
}

function bestShiftDiffForCard(shift, actualIn, actualOut) {
  if (!isWorkingType(shift)) return null
  const candidates = []
  if (shift.start && shift.end) candidates.push({ in: shift.start, out: shift.end, label: `${shift.start}-${shift.end}` })
  if (shift.start2 && shift.end2) candidates.push({ in: shift.start2, out: shift.end2, label: `${shift.start2}-${shift.end2}` })
  if (!candidates.length) return null

  let best = null
  candidates.forEach((c) => {
    const dIn = diffMinutes(c.in, actualIn)
    const dOut = diffMinutes(c.out, actualOut)
    if (dIn == null || dOut == null) return
    const score = Math.abs(dIn) + Math.abs(dOut)
    if (!best || score < best.score) best = { ...c, dIn, dOut, score }
  })

  return best
}

function bestShiftDiffForCardWithUsed(shift, actualIn, actualOut, used = new Set()) {
  if (!isWorkingType(shift)) return null
  const candidates = []
  if (shift.start && shift.end) candidates.push({ in: shift.start, out: shift.end, label: `${shift.start}-${shift.end}`, idx: 1 })
  if (shift.start2 && shift.end2) candidates.push({ in: shift.start2, out: shift.end2, label: `${shift.start2}-${shift.end2}`, idx: 2 })

  const available = candidates.filter((c) => !used.has(c.idx))
  const pool = available.length ? available : candidates
  let best = null
  pool.forEach((c) => {
    const dIn = diffMinutes(c.in, actualIn)
    const dOut = diffMinutes(c.out, actualOut)
    if (dIn == null || dOut == null) return
    const score = Math.abs(dIn) + Math.abs(dOut)
    if (!best || score < best.score) best = { ...c, dIn, dOut, score }
  })
  return best
}

async function runCardDiffReport() {
  const inputEl = document.getElementById('cardFileInput')
  const f = inputEl?.files?.[0]
  if (!f) return alert('Επίλεξε αρχείο κάρτας')
  const threshold = Number(document.getElementById('cardDiffThreshold').value || 15)

  let fileText = ''
  try {
    fileText = await f.text()
  } catch (err) {
    console.error('Card file read failed', err)
    if (inputEl) inputEl.value = ''
    alert('Δεν μπόρεσα να διαβάσω το αρχείο (πιθανό permission/stale reference). Επίλεξε ξανά το αρχείο κάρτας και ξαναδοκίμασε.')
    return
  }

  const rows = parseCardFile(fileText)
  if (!rows.length) return alert('Δεν βρέθηκαν γραμμές στο αρχείο κάρτας')

  const employeeByName = Object.fromEntries((data.employees || []).map((e) => [String(e.nickName || '').trim().toLowerCase(), e]))
  const employeeByNick = Object.fromEntries((data.employees || []).map((e) => [String(e.nickName || '').trim().toLowerCase(), e]))
  const employeeByVat = Object.fromEntries((data.employees || []).map((e) => [String(e.vat || '').trim(), e]))

  const firstDate = normalizeCardDate(rows[0]?.date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDate)) return alert('Μη έγκυρη ημερομηνία στην πρώτη γραμμή αρχείου κάρτας')
  const monthKey = firstDate.slice(0, 7)
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  const daysInMonth = new Date(year, month, 0).getDate()

  const machineByVatDay = {}
  rows.forEach((r) => {
    const rawEmp = String(r.employee || '').trim()
    const emp = employeeByVat[rawEmp] || employeeByNick[rawEmp.toLowerCase()] || employeeByName[rawEmp.toLowerCase()]
    if (!emp) return
    const d = normalizeCardDate(r.date)
    if (!d.startsWith(`${monthKey}-`)) return
    const k = `${emp.vat}_${d}`
    machineByVatDay[k] = machineByVatDay[k] || []
    machineByVatDay[k].push({ in: String(r.in || ''), out: String(r.out || '') })
  })

  const issues = []

  ;(data.employees || []).forEach((emp) => {
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const day = `${monthKey}-${String(dayNum).padStart(2, '0')}`
      const key = `${emp.vat}_${day}`
      const sh = data.shifts?.[key]
      const actualLines = machineByVatDay[key] || []

      const expectedSegs = []
      if (isWorkingType(sh)) {
        if (sh.start && sh.end) expectedSegs.push({ in: sh.start, out: sh.end, label: `${sh.start}-${sh.end}` })
        if (sh.start2 && sh.end2) expectedSegs.push({ in: sh.start2, out: sh.end2, label: `${sh.start2}-${sh.end2}` })
      }

      if (!expectedSegs.length && actualLines.length) {
        issues.push({
          type: 'EXTRA_CARD',
          employee: `${employeeLabel(emp)} (${emp.vat})`,
          date: day,
          note: `Υπάρχει κάρτα χωρίς προγραμματισμένη εργασία (${actualLines.map((x) => `${x.in}-${x.out}`).join(', ')})`,
        })
        continue
      }

      if (expectedSegs.length && !actualLines.length) {
        issues.push({
          type: 'MISSING_CARD',
          employee: `${employeeLabel(emp)} (${emp.vat})`,
          date: day,
          note: `Λείπει εγγραφή κάρτας. Πρόγραμμα: ${expectedSegs.map((x) => x.label).join(', ')}`,
        })
        continue
      }

      if (!expectedSegs.length && !actualLines.length) continue

      const usedActual = new Set()
      expectedSegs.forEach((seg) => {
        let best = null
        actualLines.forEach((a, idx) => {
          if (usedActual.has(idx)) return
          const dIn = diffMinutes(seg.in, a.in)
          const dOut = diffMinutes(seg.out, a.out)
          if (dIn == null || dOut == null) return
          const score = Math.abs(dIn) + Math.abs(dOut)
          if (!best || score < best.score) best = { idx, dIn, dOut, score, actual: a }
        })

        if (!best) {
          issues.push({
            type: 'MISSING_CARD',
            employee: `${employeeLabel(emp)} (${emp.vat})`,
            date: day,
            note: `Λείπει γραμμή κάρτας για βάρδια ${seg.label}`,
          })
          return
        }

        usedActual.add(best.idx)
        const scheduledHours = shiftHours(seg.in, seg.out)
        const actualHours = shiftHours(best.actual.in, best.actual.out)
        const workDeltaHours = Math.round((actualHours - scheduledHours) * 100) / 100

        if (Math.abs(best.dIn) > threshold || Math.abs(best.dOut) > threshold) {
          issues.push({
            type: 'DIFF',
            employee: `${employeeLabel(emp)} (${emp.vat})`,
            date: day,
            sched: seg.label,
            actual: `${best.actual.in}-${best.actual.out}`,
            inDiffHours: Math.round((best.dIn / 60) * 100) / 100,
            outDiffHours: Math.round((best.dOut / 60) * 100) / 100,
            workDeltaHours,
          })
        }
      })

      actualLines.forEach((a, idx) => {
        if (usedActual.has(idx)) return
        issues.push({
          type: 'EXTRA_CARD',
          employee: `${employeeLabel(emp)} (${emp.vat})`,
          date: day,
          note: `Επιπλέον γραμμή κάρτας χωρίς αντίστοιχη βάρδια (${a.in}-${a.out})`,
        })
      })
    }
  })


  const out = document.getElementById('cardDiffReport')
  if (!issues.length) {
    out.innerHTML = '<p style="color:#16a34a; font-weight:600;">Δεν βρέθηκαν αποκλίσεις πάνω από το όριο.</p>'
    return
  }

  const rowsHtml = issues
    .map((x) => {
      if (x.type !== 'DIFF') return `<tr><td>${x.employee || '-'}</td><td>${x.date || '-'}</td><td colspan="5">${x.note}</td></tr>`
      return `<tr><td>${x.employee}</td><td>${x.date}</td><td>${x.sched}</td><td>${x.actual}</td><td>${x.inDiffHours.toFixed(2)}</td><td>${x.outDiffHours.toFixed(2)}</td><td>${x.workDeltaHours.toFixed(2)}</td></tr>`
    })
    .join('')

  out.innerHTML = `
    <div class="schedule-container" style="padding:10px;">
      <table class="schedule-table payroll-table">
        <thead><tr><th>Εργαζόμενος</th><th>Ημερομηνία</th><th>Πρόγραμμα</th><th>Κάρτα</th><th>Διαφορά εισόδου (ώρες)</th><th>Διαφορά εξόδου (ώρες)</th><th>Πραγμ.-Προγρ. (ώρες)</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="margin-top:8px; color:#666;">Σύνολο εγγραφών αναφοράς: ${issues.length}</p>
    </div>`
}
