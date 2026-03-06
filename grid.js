// grid.js — Bar-style grid renderer for the simplified eSchedule UI
// Uses the visual style of workRestModal (horizontal 24h bars per cell)
// with the original grid's colour palette.

// ─── View state ───────────────────────────────────────────────────────────
let viewStart = null // leftmost day shown (any day of week)
let cardData = {} // keyed "vat_YYYY-MM-DD" → {start, end, guessed}
let cardVirtualEmployees = [] // temp employee records from card file
let cardMissingTimeCount = {} // keyed "vat_YYYY-MM" → count of entries with missing in/out time
let shiftCorrections = {} // "vat_YYYY-MM-DD" → correction object
let correctionTolerance = 15 // minutes — configurable
let selectedCorrCells = [] // [{vat, dateStr}] for multi-select correction editing

// ─── Navigation ──────────────────────────────────────────────────────────
function changeView(dayDelta) {
  viewStart = new Date(viewStart)
  viewStart.setDate(viewStart.getDate() + dayDelta)
  // Keep currentWeekStart in sync (for functions that need it)
  currentWeekStart = getMonday(new Date(viewStart))
  _ensureRestForView()
  saveData()
  renderGrid()
}

function _ensureRestForView() {
  const firstMonday = getMonday(new Date(viewStart))
  ensureRestShiftsForWeek(firstMonday)
  const lastDay = new Date(viewStart)
  lastDay.setDate(lastDay.getDate() + 6)
  const lastMonday = getMonday(lastDay)
  if (formatDate(firstMonday) !== formatDate(lastMonday)) {
    ensureRestShiftsForWeek(lastMonday)
  }
}

// ─── Per-day holiday helpers ──────────────────────────────────────────────
function getHolidaysForDay(date) {
  const monday = getMonday(new Date(date))
  const weekKey = formatDate(monday)
  if (!data.weekHolidays[weekKey]) {
    data.weekHolidays[weekKey] = autoDetectGreekHolidaysForWeek(monday)
  }
  return data.weekHolidays[weekKey] || []
}

function isDateHoliday(date) {
  const dow = (date.getDay() + 6) % 7
  return getHolidaysForDay(date).includes(dow)
}

function isDateSundayOrHoliday(date) {
  return date.getDay() === 0 || isDateHoliday(date)
}

function getHolidayNameForDate(date) {
  if (typeof getHolidayName === 'function') return getHolidayName(formatDate(date))
  return ''
}

// ─── Main render ─────────────────────────────────────────────────────────
function renderGrid() {
  const table = document.getElementById('scheduleTable')
  if (!table || !viewStart) return

  // Update company name in header
  if (typeof renderCompanyName === 'function') renderCompanyName()

  // Update date range display
  const viewEnd = new Date(viewStart)
  viewEnd.setDate(viewEnd.getDate() + 6)
  const rangeEl = document.getElementById('viewRangeDisplay')
  if (rangeEl) {
    rangeEl.textContent = `${formatDisplayDate(viewStart)} – ${formatDisplayDate(viewEnd)}`
  }

  // Combined employee list: real + card-only virtual employees
  const allEmployees = [...data.employees]
  cardVirtualEmployees.forEach((ve) => {
    if (!allEmployees.some((e) => String(e.vat) === String(ve.vat))) {
      allEmployees.push(ve)
    }
  })

  // ── Header ──
  let html =
    '<thead><tr><th class="emp-col" style="cursor:pointer" onclick="openEmployeeListModal()" title="Διαχείριση εργαζομένων">👥 Εργαζόμενοι</th>'
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(viewStart)
    dayDate.setDate(dayDate.getDate() + i)
    const isHoliday = isDateHoliday(dayDate)
    const isSunday = dayDate.getDay() === 0
    const dow = (dayDate.getDay() + 6) % 7
    let thCls = isSunday ? 'sunday-header' : ''
    if (isHoliday) thCls = 'holiday-header'
    const holidayName = isHoliday ? getHolidayNameForDate(dayDate) : ''
    html += `<th class="${thCls}" title="${holidayName || (isHoliday ? '' : 'Κάντε κλικ για timeline')}"
               onclick="openGridDayTimeline('${formatDate(dayDate)}')" style="cursor:pointer">
      <div class="day-abbrev">${DAY_ABBREV[dow]}</div>
      <div class="day-date">${dayDate.getDate()}/${dayDate.getMonth() + 1}</div>
      ${holidayName ? `<div class="holiday-name-hdr">${holidayName}</div>` : ''}
    </th>`
  }
  html += '</tr></thead><tbody>'

  // ── Employee rows ──
  if (allEmployees.length === 0) {
    html +=
      '<tr><td colspan="8" class="empty-grid">Δεν υπάρχουν εργαζόμενοι.<br>Κάντε κλικ στο «👥 Εργαζόμενος» στην κεφαλίδα για να προσθέσετε.</td></tr>'
  }

  allEmployees.forEach((emp) => {
    const isVirtual = !!emp._virtual
    const empMonday = getMonday(new Date(viewStart))
    const weekHours = isVirtual ? 0 : calculateWeekHours(emp.vat, empMonday)
    const targetHours = isVirtual ? 0 : Number(emp.weekWorkingHours || 40)
    const hoursPercent = targetHours ? Math.min((weekHours / targetHours) * 100, 100) : 0
    const hoursClass = weekHours < targetHours ? 'danger' : weekHours > targetHours ? 'warning' : ''

    html += `<tr class="employee-row">
      <td class="emp-name-cell"
          onclick="${isVirtual ? '' : `openEmployeeModal('${String(emp.vat)}')`}"
          ${isVirtual ? '' : 'style="cursor:pointer"'}>
        <div class="emp-name-row">
          <span class="emp-name">${employeeLabel(emp)}</span>
          ${isVirtual ? '<span class="pay-badge" style="background:#fef3c7;color:#92400e">📋</span>' : ''}
          ${!isVirtual ? `<span class="del-emp" onclick="event.stopPropagation();deleteEmployee('${String(emp.vat)}')" title="Διαγραφή">×</span>` : ''}
        </div>
        ${
          !isVirtual && targetHours
            ? `
        <div class="week-stats">${weekHours}h / ${targetHours}h</div>
        <div class="hours-bar-wrap">
          <div class="hours-bar-fill ${hoursClass}" style="width:${hoursPercent.toFixed(1)}%"></div>
        </div>`
            : ''
        }
      </td>`

    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(viewStart)
      dayDate.setDate(dayDate.getDate() + i)
      const dateStr = formatDate(dayDate)
      const shift = data.shifts[`${emp.vat}_${dateStr}`]
      const cardEntry = cardData[`${emp.vat}_${dateStr}`]
      const isHolSun = isDateSundayOrHoliday(dayDate)
      const isGapCell = !isVirtual && (!shift || shift.type === 'AN')
      const isWorkCell = !isVirtual && shift && isWorkingType(shift)
      // Only show gap labels when they are a violation (< 11h legal minimum)
      const gapHoursRaw = isGapCell ? getInterShiftGapHours(emp.vat, dateStr) : null
      const gapHours = gapHoursRaw !== null && gapHoursRaw < 11 ? gapHoursRaw : null
      // Only show prevGapH on work cells when the previous day was also a work day
      // (no adjacent gap cell already showing the same interval)
      let prevGapH = null
      if (isWorkCell) {
        const prevDate = new Date(dayDate)
        prevDate.setDate(prevDate.getDate() - 1)
        const prevShift = data.shifts[`${emp.vat}_${formatDate(prevDate)}`]
        if (prevShift && isWorkingType(prevShift)) {
          const raw = getGapToPrevShift(emp.vat, dateStr, shift.start)
          prevGapH = raw !== null && raw < 11 ? raw : null
        }
      }

      const isIllegalCard = !isVirtual && !!cardEntry && (!shift || !isWorkingType(shift))
      const monthMissing = cardEntry?.guessed
        ? cardMissingTimeCount[`${emp.vat}_${dateStr.slice(0, 7)}`] || 0
        : 0
      const isSelected =
        !isVirtual && selectedCells.some((c) => c.employeeId === String(emp.vat) && c.dateStr === dateStr)
      // Card rest gap: only show when < 11h (violation)
      const cardGapRaw = cardEntry ? getGapToPrevCardEntry(emp.vat, dateStr) : null
      const cardGapH = cardGapRaw !== null && cardGapRaw < 11 ? cardGapRaw : null

      const spilloverSegs = isVirtual ? [] : getOvernightSpillover(emp.vat, dateStr)
      // Detect if this cell's shift crosses midnight (for seamless bar styling)
      const isOvernightOut =
        !isVirtual &&
        shift &&
        isWorkingType(shift) &&
        (() => {
          const sm = toMinutes(shift.start),
            em = toMinutes(shift.end)
          return sm !== null && em !== null && em <= sm && em > 0
        })()
      const overnightCls =
        (isOvernightOut ? ' overnight-out' : '') + (spilloverSegs.length ? ' overnight-in' : '')

      const corrEntry = shiftCorrections[`${emp.vat}_${dateStr}`]
      const missingCardCorr = corrEntry && corrEntry.corrType === 'missing_card'
      html += `<td class="day-cell${isHolSun ? ' holiday-day' : ''}${isSelected ? ' cell-selected' : ''}${overnightCls}"
                   data-vat="${emp.vat}"
                   data-date="${dateStr}"
                   onclick="handleDayCellClick(event,'${String(emp.vat)}','${dateStr}')">
        ${renderShiftBar(shift, isHolSun, gapHours, prevGapH, spilloverSegs, String(emp.vat))}
        ${cardEntry ? renderCardBar(cardEntry, isIllegalCard, monthMissing, cardGapH) : ''}
        ${missingCardCorr ? renderMissingCardBar(corrEntry, String(emp.vat), dateStr) : ''}
      </td>`
    }
    html += '</tr>'
  })

  html += '</tbody>'
  table.innerHTML = html
}

// ─── Inter-shift rest gap ─────────────────────────────────────────────────
// Returns the gap in hours from the previous work shift end to shiftStart on
// dateStr.  Used to annotate the pre-shift area of work-day bars.
function getGapToPrevShift(vat, dateStr, shiftStart) {
  const date = parseISODateLocal(dateStr)
  const [sh, sm] = shiftStart.split(':').map(Number)
  const startMin = sh * 60 + sm // minutes from midnight of dateStr

  for (let i = 1; i <= 14; i++) {
    const d = new Date(date)
    d.setDate(d.getDate() - i)
    const s = data.shifts[`${vat}_${formatDate(d)}`]
    if (s && isWorkingType(s) && s.end) {
      const [eh, em] = s.end.split(':').map(Number)
      const prevEndMin = -(i * 1440) + eh * 60 + em
      return Math.round(((startMin - prevEndMin) / 60) * 10) / 10
    }
  }
  return null
}

// Returns the gap in hours from the previous card entry end to cardStart on
// dateStr for the same employee.  Used to flag < 11h rest violations on cards.
function getGapToPrevCardEntry(vat, dateStr) {
  const entry = cardData[`${vat}_${dateStr}`]
  if (!entry || !entry.start) return null
  const [sh, sm] = entry.start.split(':').map(Number)
  const startMin = sh * 60 + sm
  const date = parseISODateLocal(dateStr)
  for (let i = 1; i <= 14; i++) {
    const d = new Date(date)
    d.setDate(d.getDate() - i)
    const prev = cardData[`${vat}_${formatDate(d)}`]
    if (prev && prev.end) {
      // Use latest end time (end2 if double entry, otherwise end)
      const lastEnd = prev.end2 && prev.start2 ? prev.end2 : prev.end
      const [eh, em] = lastEnd.split(':').map(Number)
      const prevEndMin = -(i * 1440) + eh * 60 + em
      return Math.round(((startMin - prevEndMin) / 60) * 10) / 10
    }
  }
  return null
}

// Returns total rest hours between the previous work shift end and the next
// work shift start, measured through the given date.  Returns null if either
// side cannot be found within 14 days.
function getInterShiftGapHours(vat, dateStr) {
  const date = parseISODateLocal(dateStr)

  // Minutes relative to midnight of dateStr (negative = before, positive = after)
  let prevEndMin = null
  for (let i = 1; i <= 14; i++) {
    const d = new Date(date)
    d.setDate(d.getDate() - i)
    const s = data.shifts[`${vat}_${formatDate(d)}`]
    if (s && isWorkingType(s) && s.end) {
      const [h, m] = s.end.split(':').map(Number)
      prevEndMin = -(i * 1440) + h * 60 + m
      break
    }
  }

  let nextStartMin = null
  for (let i = 1; i <= 14; i++) {
    const d = new Date(date)
    d.setDate(d.getDate() + i)
    const s = data.shifts[`${vat}_${formatDate(d)}`]
    if (s && isWorkingType(s) && s.start) {
      const [h, m] = s.start.split(':').map(Number)
      nextStartMin = i * 1440 + h * 60 + m
      break
    }
  }

  if (prevEndMin === null || nextStartMin === null) return null
  const gapH = (nextStartMin - prevEndMin) / 60
  return Math.round(gapH * 10) / 10
}

// ─── Overnight spillover ──────────────────────────────────────────────────
// Returns array of spillover segments from the previous day's shift that
// extend past midnight into dateStr.  Each: { endMinutes, cls, title, originDateStr }
function getOvernightSpillover(vat, dateStr) {
  const date = parseISODateLocal(dateStr)
  const prevDate = new Date(date)
  prevDate.setDate(prevDate.getDate() - 1)
  const prevDateStr = formatDate(prevDate)
  const prevShift = data.shifts[`${vat}_${prevDateStr}`]

  if (!prevShift || !isWorkingType(prevShift)) return []

  const prevIsHolSun = isDateSundayOrHoliday(prevDate)
  const result = []

  const checkSeg = (start, end, type) => {
    const sm = toMinutes(start)
    const em = toMinutes(end)
    if (sm === null || em === null) return
    if (em > sm || em === 0) return // not overnight or ends exactly at midnight
    const cls = prevIsHolSun ? 'seg-holiday' : type === 'ΤΗΛ' ? 'seg-tel' : 'seg-work'
    result.push({
      endMinutes: em,
      cls,
      title: `${start}–${end} (${prevDateStr})`,
      originDateStr: prevDateStr,
    })
  }

  checkSeg(prevShift.start, prevShift.end, prevShift.type)
  if (prevShift.start2 && prevShift.end2) {
    checkSeg(prevShift.start2, prevShift.end2, prevShift.type2 || prevShift.type)
  }
  return result
}

// ─── Bar helpers ─────────────────────────────────────────────────────────
function pct(minutes) {
  return ((minutes / 1440) * 100).toFixed(3) + '%'
}

function minToStr(minutes) {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ─── Spillover segment helper ─────────────────────────────────────────────
// Renders faded segments from a previous day's overnight shift inside the
// current bar.  Segments are absolutely positioned (don't affect flex layout)
// and each one captures clicks to route to the origin date.
function _renderSpilloverSegs(spilloverSegs, vat) {
  if (!spilloverSegs || !spilloverSegs.length) return ''
  const originDate = spilloverSegs[0].originDateStr
  let html = ''
  spilloverSegs.forEach((seg) => {
    html += `<div class="seg ${seg.cls} seg-spillover" style="left:0;width:${pct(seg.endMinutes)}" title="${seg.title}" onclick="event.stopPropagation();handleDayCellClick(event,'${vat}','${originDate}')"></div>`
  })
  return html
}

// ─── Schedule bar ─────────────────────────────────────────────────────────
function renderShiftBar(shift, isHolSun, gapHours, prevGapH, spilloverSegs, vat) {
  const gapLbl = gapHours != null ? `<span class="bar-gap-lbl">${gapHours}</span>` : ''
  const spillHtml = _renderSpilloverSegs(spilloverSegs, vat)
  const hasSpill = !!spillHtml
  const extL = hasSpill ? ' bar-extends-left' : ''

  if (!shift) {
    return `<div class="bar-wrap${extL}"><div class="bar bar-empty">${spillHtml}${gapLbl}</div></div>`
  }
  if (isWorkingType(shift)) {
    return _buildWorkBar(shift, isHolSun, prevGapH, spillHtml)
  }
  if (shift.type === 'AN') {
    return `<div class="bar-wrap${extL}"><div class="bar bar-rest">${spillHtml}${gapLbl || '<span class="bar-lbl">ΡΕΠΟ</span>'}</div></div>`
  }
  if (isNonWorkingType(shift)) {
    return `<div class="bar-wrap${extL}"><div class="bar bar-me">${spillHtml}<span class="bar-lbl">ΜΕ</span></div></div>`
  }
  // Absence
  const paid = isPaidAbsenceType(shift.type)
  const cls = paid ? 'bar-paid' : 'bar-unpaid'
  return `<div class="bar-wrap${extL}"><div class="bar ${cls}">${spillHtml}<span class="bar-lbl">${shift.type}</span></div></div>`
}

function _buildWorkBar(shift, isHolSun, prevGapH, spillHtml) {
  const segs = []
  const addSeg = (start, end, type) => {
    const sm = toMinutes(start)
    let em = toMinutes(end)
    if (sm === null || em === null) return
    if (em <= sm) em += 1440
    const cls = isHolSun ? 'seg-holiday' : type === 'ΤΗΛ' ? 'seg-tel' : 'seg-work'
    segs.push({ sm, em, cls, title: `${start}–${end}` })
  }
  addSeg(shift.start, shift.end, shift.type)
  if (shift.start2 && shift.end2) addSeg(shift.start2, shift.end2, shift.type2 || shift.type)
  if (!segs.length) return `<div class="bar-wrap"><div class="bar bar-empty">${spillHtml || ''}</div></div>`

  segs.sort((a, b) => a.sm - b.sm)
  const hasOvernight = segs.some((s) => s.em > 1440)
  const hasSpill = !!spillHtml
  const extCls = (hasSpill ? ' bar-extends-left' : '') + (hasOvernight ? ' bar-extends-right' : '')

  let segHtml = spillHtml || ''

  // Show gap from previous shift end to start of today's first segment
  const firstSm = segs[0].sm
  if (prevGapH != null && firstSm > 0) {
    segHtml += `<div class="seg seg-gap" style="left:0;width:${pct(firstSm)}" title="από προηγ. βάρδια: ${prevGapH}h"><span class="gap-lbl" style="color:#dc2626">${prevGapH}</span></div>`
  }

  segs.forEach((s, idx) => {
    // Show gap between two work segments (split shift)
    if (idx > 0) {
      const gapMin = s.sm - segs[idx - 1].em
      if (gapMin > 0) {
        const gapH = gapMin / 60
        const gapLabel = gapH >= 1 ? `${Math.round(gapH * 10) / 10}` : `${gapMin}'`
        segHtml += `<div class="seg seg-gap" style="left:${pct(segs[idx - 1].em)};width:${pct(gapMin)}" title="${minToStr(segs[idx - 1].em)}–${minToStr(s.sm)}"><span class="gap-lbl">${gapLabel}</span></div>`
      }
    }
    const segH = (s.em - s.sm) / 60
    const isOvernight = s.em > 1440
    // Cap at midnight for rendering — the spillover handles the next-day portion
    const renderEm = isOvernight ? 1440 : s.em
    const lbl = segH >= 1 ? `<span class="seg-lbl">${Math.round(segH * 10) / 10}</span>` : ''
    segHtml += `<div class="seg ${s.cls}" style="left:${pct(s.sm)};width:${pct(renderEm - s.sm)}" title="${s.title}">${lbl}</div>`
  })

  return `<div class="bar-wrap${extCls}"><div class="bar bar-work">${segHtml}</div></div>`
}

// ─── Card bar ─────────────────────────────────────────────────────────────
// illegal: card entry exists but no working shift scheduled (labour-law violation)
// missingCount: monthly count of guessed entries for this employee (limit: 3/month)
// prevGapH: hours since previous card entry end (shown only when < 11h — violation)
function renderCardBar(entry, illegal = false, missingCount = 0, prevGapH = null) {
  if (!entry) return ''
  const sm = toMinutes(entry.start)
  let em = toMinutes(entry.end)
  if (sm === null || em === null) return ''
  if (em <= sm) em += 1440

  const intervals = [{ start: entry.start, end: entry.end, sMin: sm, eMin: em }]
  if (entry.start2 && entry.end2) {
    const sm2 = toMinutes(entry.start2)
    let em2 = toMinutes(entry.end2)
    if (sm2 !== null && em2 !== null) {
      if (em2 <= sm2) em2 += 1440
      intervals.push({ start: entry.start2, end: entry.end2, sMin: sm2, eMin: em2 })
    }
  }

  let totalMin = 0
  intervals.forEach((iv) => {
    totalMin += iv.eMin - iv.sMin
  })
  const hours = totalMin / 60
  const hoursLabel = hours >= 1 ? `<span class="seg-lbl">${Math.round(hours * 10) / 10}</span>` : ''

  const guessNote = entry.guessedStart ? ' (εκτ. έναρξη)' : entry.guessedEnd ? ' (εκτ. λήξη)' : ''
  const titleParts = [`📋 ${entry.start}–${entry.end}`]
  if (entry.start2 && entry.end2) titleParts.push(`${entry.start2}–${entry.end2}`)
  const title = titleParts.join(' + ') + guessNote
  // Illegal entries use red stripes; guessed-but-legal entries flash amber
  const segCls = illegal ? 'seg seg-card-illegal' : `seg seg-card${entry.guessed ? ' seg-card-flash' : ''}`

  let segHtml = ''
  // Show gap from previous card entry when it's a violation (< 11h)
  if (prevGapH !== null && sm > 0) {
    segHtml += `<div class="seg seg-gap" style="left:0;width:${pct(sm)}" title="από προηγ. κάρτα: ${prevGapH}h"><span class="gap-lbl" style="color:#dc2626">${prevGapH}</span></div>`
  }
  // First interval — show hours label on this segment
  segHtml += `<div class="${segCls}" style="left:${pct(intervals[0].sMin)};width:${pct(intervals[0].eMin - intervals[0].sMin)}" title="${title}">${hoursLabel}</div>`
  // Second interval (if present)
  if (intervals.length > 1) {
    segHtml += `<div class="${segCls}" style="left:${pct(intervals[1].sMin)};width:${pct(intervals[1].eMin - intervals[1].sMin)}" title="${title}"></div>`
  }

  const illegalBadge = illegal
    ? `<span class="card-illegal-badge" title="Προσοχή: Εργάστηκε χωρίς πρόγραμμα">!</span>`
    : ''
  const missingBadge =
    missingCount > 0
      ? `<span class="card-missing-badge${missingCount > 3 ? ' exceeded' : ''}" title="${missingCount > 3 ? 'Υπέρβαση ορίου: ' : ''}${missingCount} εγγραφ${missingCount === 1 ? 'ή' : 'ές'} χωρίς ώρα αυτόν τον μήνα (μέγιστο 3)">${missingCount}/3</span>`
      : ''
  const wrapClass = 'bar-wrap card-bar-wrap'

  return `<div class="${wrapClass}">${illegalBadge}${missingBadge}<div class="bar bar-card">${segHtml}</div></div>`
}

// ─── Cell click → shift modal ─────────────────────────────────────────────
function handleDayCellClick(event, vat, dateStr) {
  if (!data.employees.some((e) => String(e.vat) === String(vat))) return // virtual employee
  handleCellClick(event, String(vat), dateStr)
}

// ─── renderAll shim (called by existing modules after save/change) ─────────
function renderAll() {
  renderGrid()
  renderCompanyName()
}

// ─── Card import ─────────────────────────────────────────────────────────
function _cardTabSwitch(name) {
  ;['load', 'save', 'check', 'clear'].forEach((t) => {
    document.getElementById(`cardTab-${t}`).classList.toggle('active', t === name)
    document.getElementById(`cardPanel-${t}`).classList.toggle('active', t === name)
  })
  // Refresh status labels when switching
  if (name === 'load') {
    refreshSavedMonthsList()
  }
  if (name === 'save') {
    const n = Object.keys(cardData).length
    const month = detectCardMonth()
    document.getElementById('cardSaveStatus').textContent = n
      ? `${n} εγγραφές (${month || '—'}) — έτοιμες για αποθήκευση.`
      : 'Δεν υπάρχουν φορτωμένα δεδομένα κάρτας.'
  }
  if (name === 'check') {
    const el = document.getElementById('cardCheckMonth')
    if (!el.value) {
      const keys = Object.keys(cardData)
      if (keys.length) {
        const dates = keys.map((k) => k.slice(k.lastIndexOf('_') + 1)).sort()
        el.value = dates[0].slice(0, 7) // earliest month in loaded card data
      } else {
        const now = viewStart || new Date()
        el.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      }
    }
  }
  if (name === 'clear') {
    const n = Object.keys(cardData).length
    document.getElementById('cardClearStatus').textContent = n
      ? `Θα διαγραφούν ${n} εγγραφές.`
      : 'Δεν υπάρχουν δεδομένα κάρτας.'
  }
}

function clearCardData() {
  cardData = {}
  cardVirtualEmployees = []
  cardMissingTimeCount = {}
  shiftCorrections = {}
  selectedCorrCells = []
  renderGrid()
  document.getElementById('cardImportStatus').textContent = ''
  document.getElementById('cardClearStatus').textContent = 'Τα δεδομένα κάρτας διαγράφηκαν.'
  _cardTabSwitch('load')
}

// ─── Monthly card + corrections persistence ─────────────────────────────

function detectCardMonth() {
  const keys = Object.keys(cardData)
  if (!keys.length) return null
  // Count occurrences of each YYYY-MM
  const counts = {}
  keys.forEach((k) => {
    const m = k.match(/_(\d{4}-\d{2})/)
    if (m) counts[m[1]] = (counts[m[1]] || 0) + 1
  })
  // Return the most common month
  let best = null,
    bestN = 0
  for (const [month, n] of Object.entries(counts)) {
    if (n > bestN) {
      best = month
      bestN = n
    }
  }
  return best
}

async function saveMonthlyCard() {
  const month = detectCardMonth()
  if (!month) {
    alert('Δεν υπάρχουν δεδομένα κάρτας.')
    return
  }
  const payload = {
    cardData,
    cardVirtualEmployees,
    cardMissingTimeCount,
    shiftCorrections,
    correctionTolerance,
    savedAt: Date.now(),
  }
  try {
    const db = await idbOpen()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(JSON.stringify(payload), `card_${month}`)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
    const statusEl = document.getElementById('cardSaveStatus')
    if (statusEl) statusEl.textContent = `Αποθηκεύτηκε μήνας ${month}.`
  } catch (e) {
    alert('Σφάλμα αποθήκευσης: ' + e.message)
  }
}

async function listSavedCardMonths() {
  try {
    const db = await idbOpen()
    const keys = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).getAllKeys()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return keys
      .filter((k) => String(k).startsWith('card_'))
      .map((k) => String(k).slice(5))
      .sort()
      .reverse()
  } catch {
    return []
  }
}

async function loadMonthlyCard(month) {
  if (!month) {
    alert('Επιλέξτε μήνα.')
    return
  }
  try {
    const db = await idbOpen()
    const raw = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(`card_${month}`)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()
    if (!raw) {
      alert('Δεν βρέθηκαν δεδομένα για ' + month)
      return
    }
    const payload = JSON.parse(raw)
    cardData = payload.cardData || {}
    cardVirtualEmployees = payload.cardVirtualEmployees || []
    cardMissingTimeCount = payload.cardMissingTimeCount || {}
    shiftCorrections = payload.shiftCorrections || {}
    correctionTolerance = payload.correctionTolerance || 15
    const tolInput = document.getElementById('corrToleranceInput')
    if (tolInput) tolInput.value = correctionTolerance
    computeCorrections()
    renderGrid()
    const statusEl = document.getElementById('cardImportStatus')
    if (statusEl)
      statusEl.textContent = `Φορτώθηκε μήνας ${month} (${Object.keys(cardData).length} εγγραφές).`
    closeModal('cardImportModal')
  } catch (e) {
    alert('Σφάλμα φόρτωσης: ' + e.message)
  }
}

async function deleteMonthlyCard(month) {
  if (!month) return
  if (!confirm(`Διαγραφή αποθηκευμένων δεδομένων για ${month};`)) return
  try {
    const db = await idbOpen()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).delete(`card_${month}`)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
    await refreshSavedMonthsList()
  } catch (e) {
    alert('Σφάλμα: ' + e.message)
  }
}

async function refreshSavedMonthsList() {
  const listEl = document.getElementById('cardSavedMonthsList')
  if (!listEl) return
  const months = await listSavedCardMonths()
  if (!months.length) {
    listEl.innerHTML = '<span style="color:#9ca3af;font-size:12px">Δεν υπάρχουν αποθηκευμένοι μήνες.</span>'
    return
  }
  listEl.innerHTML = months
    .map(
      (m) =>
        `<div style="display:flex;align-items:center;gap:8px;padding:4px 0">
      <button class="btn-primary" style="font-size:12px;padding:3px 10px" onclick="loadMonthlyCard('${m}')">📂 ${m}</button>
      <button style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px;padding:2px" onclick="deleteMonthlyCard('${m}')" title="Διαγραφή">✕</button>
    </div>`,
    )
    .join('')
}

function exportCardData() {
  if (!Object.keys(cardData).length) {
    alert('Δεν υπάρχουν δεδομένα κάρτας για αποθήκευση.')
    return
  }

  const allEmps = [...data.employees, ...cardVirtualEmployees]

  // Build rows array (header + data) — column names match parseCardFile aliases
  const sheetRows = [['ΑΦΜ', 'Επώνυμο', 'Όνομα', 'Ημ/νία', 'Είσοδος', 'Έξοδος']]

  Object.keys(cardData)
    .sort()
    .forEach((key) => {
      const entry = cardData[key]
      if (!entry || !entry.start || !entry.end) return
      const sep = key.lastIndexOf('_')
      const vat = key.slice(0, sep)
      const date = key.slice(sep + 1)
      const emp = allEmps.find((e) => String(e.vat) === String(vat))
      let surname = '',
        firstName = ''
      if (emp) {
        const parts = (emp.nickName || '').trim().split(/\s+/)
        surname = parts[0] || ''
        firstName = parts.slice(1).join(' ') || ''
      }
      sheetRows.push([vat, surname, firstName, date, entry.start, entry.end])
      if (entry.start2 && entry.end2) {
        sheetRows.push([vat, surname, firstName, date, entry.start2, entry.end2])
      }
    })

  const ws = XLSX.utils.aoa_to_sheet(sheetRows)
  // Auto-width for readability
  ws['!cols'] = [12, 16, 16, 14, 10, 10].map((w) => ({ wch: w }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Κάρτα')
  XLSX.writeFile(wb, `karta_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

async function importCardFile(file) {
  try {
    const rows = await readCardFileRows(file)
    if (!rows.length) {
      alert('Δεν βρέθηκαν εγγραφές στο αρχείο.')
      return 0
    }

    cardData = {}
    cardVirtualEmployees = []

    rows.forEach((row) => {
      const dateStr = normalizeCardDate(row.date)
      if (!dateStr) return

      // Find employee by VAT or nickname
      let emp = data.employees.find(
        (e) =>
          String(e.vat) === String(row.employee) ||
          (e.nickName || '').toLowerCase() === String(row.employee).toLowerCase(),
      )

      if (!emp) {
        // Use or create virtual employee
        const displayName = [row.surname, row.firstName].filter(Boolean).join(' ').trim() || row.employee
        emp = cardVirtualEmployees.find((ve) => String(ve.vat) === String(row.employee))
        if (!emp) {
          emp = {
            vat: String(row.employee),
            nickName: displayName,
            weekWorkingHours: 40,
            weekWorkingDays: 5,
            _virtual: true,
          }
          cardVirtualEmployees.push(emp)
        }
      }

      const key = `${emp.vat}_${dateStr}`
      const maxH = window.MAX_SHIFT_HOURS || 13
      // Use scheduled shift duration when available; fall back to contracted daily hours
      const schedShift = data.shifts[key]
      let dailyH = guessEmployeeDailyHours(emp)
      if (schedShift && isWorkingType(schedShift)) {
        const sm = toMinutes(schedShift.start),
          emRaw = toMinutes(schedShift.end)
        if (sm != null && emRaw != null) {
          let dur = (emRaw <= sm ? emRaw + 1440 : emRaw) - sm
          if (schedShift.start2 && schedShift.end2) {
            const sm2 = toMinutes(schedShift.start2),
              em2Raw = toMinutes(schedShift.end2)
            if (sm2 != null && em2Raw != null) dur += (em2Raw <= sm2 ? em2Raw + 1440 : em2Raw) - sm2
          }
          dailyH = dur / 60
        }
      }
      let inTime = row.in ? roundToHalfHour(row.in) : ''
      let outTime = row.out ? roundToHalfHour(row.out) : ''
      let guessedStart = false,
        guessedEnd = false
      if (inTime && !outTime) {
        outTime = roundToHalfHour(addHoursToTime(inTime, Math.min(dailyH, maxH)))
        guessedEnd = true
      } else if (!inTime && outTime) {
        inTime = roundToHalfHour(subtractHoursFromTime(outTime, Math.min(dailyH, maxH)))
        guessedStart = true
      }
      if (!inTime || !outTime) return // both still missing — skip

      if (cardData[key]) {
        // Second entry for same employee+day → store as start2/end2
        cardData[key].start2 = inTime
        cardData[key].end2 = outTime
        cardData[key].guessedStart2 = guessedStart
        cardData[key].guessedEnd2 = guessedEnd
        if (guessedStart || guessedEnd) cardData[key].guessed = true
      } else {
        cardData[key] = {
          start: inTime,
          end: outTime,
          guessedStart,
          guessedEnd,
          guessed: guessedStart || guessedEnd,
        }
      }
    })

    // Compute per-employee per-month count of entries with missing in/out time
    cardMissingTimeCount = {}
    Object.keys(cardData).forEach((key) => {
      const entry = cardData[key]
      if (entry.guessedStart || entry.guessedEnd) {
        const monthKey = key.slice(0, -3) // "vat_YYYY-MM-DD" → "vat_YYYY-MM"
        cardMissingTimeCount[monthKey] = (cardMissingTimeCount[monthKey] || 0) + 1
      }
    })

    const tolInput = document.getElementById('corrToleranceInput')
    if (tolInput) correctionTolerance = parseInt(tolInput.value, 10) || 15
    computeCorrections()
    renderGrid()
    return rows.length
  } catch (e) {
    alert('Σφάλμα ανάγνωσης αρχείου: ' + e.message)
    return 0
  }
}

// ─── Employee list modal ──────────────────────────────────────────────────
function openEmployeeListModal() {
  renderEmployeeList()
  document.getElementById('employeeListModal').classList.add('active')
}

function renderEmployeeList() {
  const list = document.getElementById('empListBody')
  if (!list) return
  if (!data.employees.length) {
    list.innerHTML = '<p style="color:#999;text-align:center;padding:16px">Δεν υπάρχουν εργαζόμενοι</p>'
    return
  }
  list.innerHTML = data.employees
    .map((emp) => {
      return `<div class="emp-list-item">
      <div>
        <strong>${employeeLabel(emp)}</strong>
        <span style="color:#888;font-size:12px;margin-left:6px">ΑΦΜ: ${emp.vat}</span>
      </div>
      <div>
        <button class="btn-sm btn-secondary" onclick="closeModal('employeeListModal');openEmployeeModal('${emp.vat}')">✏ Επεξεργασία</button>
        <button class="btn-sm btn-danger" onclick="deleteEmployee('${emp.vat}')">× Διαγραφή</button>
      </div>
    </div>`
    })
    .join('')
}

// ─── Card import modal ────────────────────────────────────────────────────
function openCardImportModal() {
  _cardTabSwitch('load')
  document.getElementById('cardImportModal').classList.add('active')
}

async function handleCardFileSelect(input) {
  const file = input.files[0]
  if (!file) return
  document.getElementById('cardImportStatus').textContent = 'Φόρτωση…'
  const count = await importCardFile(file)
  document.getElementById('cardImportStatus').textContent = count
    ? `✓ ${count} εγγραφές φορτώθηκαν`
    : 'Δεν βρέθηκαν εγγραφές'
  input.value = ''
}

// ─── Generic modal close ──────────────────────────────────────────────────
function closeModal(id) {
  const el = document.getElementById(id)
  if (el) el.classList.remove('active')

  // Reset shift modal title when closing
  if (id === 'shiftModal') {
    const title = el?.querySelector('h2')
    if (title) title.textContent = 'Edit Shift'
  }

  // Restore card grid injected shifts when timeline closes
  if (id === 'timelineModal' && typeof cardGridRestoreShifts === 'function') {
    cardGridRestoreShifts()
  }
}

// ─── Card time correction ─────────────────────────────────────────────────
let _editingCardKey = null

function openCardTimeEdit(key) {
  _editingCardKey = key
  const entry = cardData[key] || {}
  document.getElementById('cardEditIn').value = entry.start || ''
  document.getElementById('cardEditOut').value = entry.end || ''
  const row2 = document.getElementById('cardEdit2ndRow')
  if (entry.start2 && entry.end2) {
    document.getElementById('cardEditIn2').value = entry.start2 || ''
    document.getElementById('cardEditOut2').value = entry.end2 || ''
    row2.style.display = ''
  } else {
    document.getElementById('cardEditIn2').value = ''
    document.getElementById('cardEditOut2').value = ''
    row2.style.display = 'none'
  }
  document.getElementById('cardEditModal').classList.add('active')
}

function saveCardTimeEdit() {
  if (!_editingCardKey) return
  const inVal = document.getElementById('cardEditIn').value
  const outVal = document.getElementById('cardEditOut').value
  if (!inVal || !outVal) return
  const entry = {
    start: inVal,
    end: outVal,
    guessedStart: false,
    guessedEnd: false,
    guessed: false,
  }
  const in2Val = document.getElementById('cardEditIn2').value
  const out2Val = document.getElementById('cardEditOut2').value
  if (in2Val && out2Val) {
    entry.start2 = in2Val
    entry.end2 = out2Val
  }
  cardData[_editingCardKey] = entry
  closeModal('cardEditModal')
  renderTimeline()
  renderGrid()
}

// ─── Override renderSchedule so timeline drag-saves redraw the bar grid ───
function renderSchedule() {
  renderGrid()
}

// ─── Timeline integration ─────────────────────────────────────────────────

// Wrap timeline.js's renderTimeline so card data is always appended.
// IMPORTANT: use window assignment (not function declaration) to avoid hoisting
// shadowing the timeline.js version before we can capture it.
const _origRenderTimeline = typeof renderTimeline === 'function' ? renderTimeline : null
window.renderTimeline = function () {
  if (_origRenderTimeline) _origRenderTimeline()
  // Replace day-selector buttons with simple arrow navigation
  _replaceTimelineDaySelector()
  // Inject card data for the displayed day
  const dayDate = new Date(currentWeekStart)
  dayDate.setDate(dayDate.getDate() + (selectedTimelineDay || 0))
  _appendCardDataToTimeline(formatDate(dayDate))
}

function _replaceTimelineDaySelector() {
  const sel = document.getElementById('timelineDaySelector')
  if (!sel) return
  const dayDate = new Date(currentWeekStart)
  dayDate.setDate(dayDate.getDate() + (selectedTimelineDay || 0))
  sel.innerHTML = `
    <button class="timeline-day-btn" onclick="_timelineNavDay(-1)"
            style="font-size:16px;padding:4px 10px">◀</button>
    <button class="timeline-day-btn" onclick="_timelineNavDay(1)"
            style="font-size:16px;padding:4px 10px">▶</button>`
}

// Navigate timeline by one day, crossing week boundaries freely
function _timelineNavDay(delta) {
  let day = (selectedTimelineDay || 0) + delta
  if (day < 0) {
    currentWeekStart = new Date(currentWeekStart)
    currentWeekStart.setDate(currentWeekStart.getDate() - 7)
    day = 6
  } else if (day > 6) {
    currentWeekStart = new Date(currentWeekStart)
    currentWeekStart.setDate(currentWeekStart.getDate() + 7)
    day = 0
  }
  selectedTimelineDay = day
  renderTimeline()
}

// Open the timeline modal for a date string (YYYY-MM-DD) clicked from the header
function openGridDayTimeline(dateStr) {
  const d = parseISODateLocal(dateStr)
  currentWeekStart = getMonday(new Date(d))
  // 0=Mon … 6=Sun mapping used by timeline.js
  const jsDay = d.getDay()
  selectedTimelineDay = jsDay === 0 ? 6 : jsDay - 1
  renderTimeline()
  document.getElementById('timelineModal').classList.add('active')
}

// Append amber card-data rows directly after each matching employee schedule row
function _appendCardDataToTimeline(dateStr) {
  const grid = document.getElementById('timelineGrid')
  if (!grid) return

  // Remove previously injected card rows
  grid.querySelectorAll('[data-card-row]').forEach((el) => el.remove())

  if (!Object.keys(cardData).length) return

  // Read hour count from the header labels (needed for positioning)
  const hourLabels = grid.querySelectorAll('.timeline-hour-label')
  if (!hourLabels.length) return
  const hoursCount = hourLabels.length

  const allEmps = [...data.employees, ...cardVirtualEmployees]

  // Walk each rendered schedule row and inject a card row immediately after it
  grid.querySelectorAll('.timeline-employee-row:not([data-card-row])').forEach((schedRow) => {
    const shiftBar = schedRow.querySelector('.timeline-shift-bar')
    if (!shiftBar) return

    const vat = shiftBar.dataset.employeeId
    const rowDate = shiftBar.dataset.date || dateStr
    const hoursStart = parseInt(shiftBar.dataset.hoursStart, 10)

    const entry = cardData[`${vat}_${rowDate}`]
    if (!entry || !entry.start || !entry.end) return

    const emp = allEmps.find((e) => String(e.vat) === String(vat))

    const smMin = toMinutes(entry.start)
    let emMin = toMinutes(entry.end)
    if (smMin === null || emMin === null) return
    if (emMin <= smMin) emMin += 24 * 60

    const smH = smMin / 60
    const emH = emMin / 60
    const leftPct = Math.max(0, ((smH - hoursStart) / hoursCount) * 100)
    const widthPct = Math.min(100 - leftPct, ((emH - smH) / hoursCount) * 100)

    // Card row — same structure as .timeline-employee-row
    const row = document.createElement('div')
    row.className = 'timeline-employee-row'
    row.setAttribute('data-card-row', '1')

    // Name cell — just a small "card" badge, no repeated name
    // margin-top: -2px cancels the grid gap so it visually attaches to the row above
    const nameDiv = document.createElement('div')
    nameDiv.className = 'timeline-employee-name'
    nameDiv.style.cssText =
      'font-style:italic;color:#92400e;background:#fffbeb;font-size:11px;justify-content:flex-end;margin-top:-2px'
    nameDiv.textContent = '📋 κάρτα'

    // Hours container — copy cell classes from the schedule row so backgrounds match
    const hoursDiv = document.createElement('div')
    hoursDiv.className = 'timeline-employee-hours'
    hoursDiv.style.cssText = 'position:relative;margin-top:-2px'
    const schedCells = schedRow.querySelectorAll('.timeline-hour-cell')
    for (let i = 0; i < hoursCount; i++) {
      const cell = document.createElement('div')
      cell.className = schedCells[i] ? schedCells[i].className : 'timeline-hour-cell'
      hoursDiv.appendChild(cell)
    }

    // Amber bar — same class for consistent height/radius
    const bar = document.createElement('div')
    bar.className = 'timeline-shift-bar'
    const guessNote = entry.guessedStart ? ' (εκτ. έναρξη)' : entry.guessedEnd ? ' (εκτ. λήξη)' : ''
    const titleParts = [`📋 ${entry.start}–${entry.end}`]
    if (entry.start2 && entry.end2) titleParts.push(`${entry.start2}–${entry.end2}`)
    const fullTitle = titleParts.join(' + ') + guessNote
    const barBg = entry.guessed
      ? 'repeating-linear-gradient(45deg,#fbbf24,#fbbf24 6px,#d97706 6px,#d97706 12px)'
      : 'linear-gradient(135deg,#fbbf24,#d97706)'
    bar.style.cssText = `left:${leftPct.toFixed(2)}%;width:${Math.max(widthPct, 2).toFixed(2)}%;background:${barBg};cursor:pointer`
    bar.title = `${fullTitle}${entry.guessed ? ' — σύρετε άκρο για διόρθωση' : ' — κλικ για επεξεργασία'}`
    bar.setAttribute('data-card-key', `${vat}_${rowDate}`)
    bar.setAttribute('data-hours-start', hoursStart)
    bar.setAttribute('data-hours-count', hoursCount)
    // Click on bar body opens manual edit; drag handles handle dragging
    bar.onclick = (e) => {
      if (!e.target.dataset.handle) openCardTimeEdit(`${vat}_${rowDate}`)
    }

    const lbl = document.createElement('div')
    lbl.className = 'time-label'
    lbl.textContent = `${entry.start} - ${entry.end}${entry.guessed ? ' ?' : ''}`
    bar.appendChild(lbl)

    // Add drag handle only on the guessed side
    if (entry.guessedStart) {
      const h = document.createElement('div')
      h.className = 'drag-handle left'
      h.dataset.handle = 'left'
      bar.appendChild(h)
    }
    if (entry.guessedEnd) {
      const h = document.createElement('div')
      h.className = 'drag-handle right'
      h.dataset.handle = 'right'
      bar.appendChild(h)
    }

    hoursDiv.appendChild(bar)

    // Second interval bar (if double card entry)
    if (entry.start2 && entry.end2) {
      const sm2Min = toMinutes(entry.start2)
      let em2Min = toMinutes(entry.end2)
      if (sm2Min !== null && em2Min !== null) {
        if (em2Min <= sm2Min) em2Min += 24 * 60
        const sm2H = sm2Min / 60
        const em2H = em2Min / 60
        const left2 = Math.max(0, ((sm2H - hoursStart) / hoursCount) * 100)
        const width2 = Math.min(100 - left2, ((em2H - sm2H) / hoursCount) * 100)
        const bar2 = document.createElement('div')
        bar2.className = 'timeline-shift-bar'
        const bar2Bg = entry.guessed
          ? 'repeating-linear-gradient(45deg,#fbbf24,#fbbf24 6px,#d97706 6px,#d97706 12px)'
          : 'linear-gradient(135deg,#fbbf24,#d97706)'
        bar2.style.cssText = `left:${left2.toFixed(2)}%;width:${Math.max(width2, 2).toFixed(2)}%;background:${bar2Bg};cursor:pointer`
        bar2.title = fullTitle
        bar2.onclick = (e) => {
          if (!e.target.dataset.handle) openCardTimeEdit(`${vat}_${rowDate}`)
        }
        const lbl2 = document.createElement('div')
        lbl2.className = 'time-label'
        lbl2.textContent = `${entry.start2} - ${entry.end2}`
        bar2.appendChild(lbl2)
        hoursDiv.appendChild(bar2)
      }
    }

    row.appendChild(nameDiv)
    row.appendChild(hoursDiv)

    // Insert directly after the matching schedule row
    schedRow.insertAdjacentElement('afterend', row)
  })

  // ── Standalone rows for employees with card data but no schedule row ──
  // Collect VATs that already got a card row injected above
  const renderedVats = new Set()
  grid.querySelectorAll('.timeline-shift-bar[data-employee-id]').forEach((bar) => {
    renderedVats.add(bar.dataset.employeeId)
  })

  // Grid parameters from any existing bar; fall back to defaults
  let hoursStart = 6
  const anyBar = grid.querySelector('.timeline-shift-bar[data-hours-start]')
  if (anyBar) hoursStart = parseInt(anyBar.dataset.hoursStart, 10)

  // Reference hour cells for copying business/night classes
  const refCells = grid.querySelectorAll('.timeline-employee-row:not([data-card-row]) .timeline-hour-cell')

  Object.keys(cardData).forEach((key) => {
    if (!key.endsWith('_' + dateStr)) return
    const vat = key.slice(0, -(dateStr.length + 1))
    if (renderedVats.has(String(vat))) return // already shown paired under a schedule row

    const entry = cardData[key]
    if (!entry || !entry.start || !entry.end) return

    const emp = allEmps.find((e) => String(e.vat) === String(vat))
    const empName = emp
      ? emp.nickName || [emp.surname, emp.firstName].filter(Boolean).join(' ').trim() || String(vat)
      : String(vat)

    const smMin = toMinutes(entry.start)
    let emMin = toMinutes(entry.end)
    if (smMin === null || emMin === null) return
    if (emMin <= smMin) emMin += 24 * 60

    const smH = smMin / 60
    const emH = emMin / 60
    const leftPct = Math.max(0, ((smH - hoursStart) / hoursCount) * 100)
    const widthPct = Math.min(100 - leftPct, ((emH - smH) / hoursCount) * 100)

    const row = document.createElement('div')
    row.className = 'timeline-employee-row'
    row.setAttribute('data-card-row', '1')

    const nameDiv = document.createElement('div')
    nameDiv.className = 'timeline-employee-name'
    nameDiv.style.cssText = 'font-style:italic;color:#92400e;background:#fffbeb;font-size:11px'
    nameDiv.textContent = `📋 ${empName}`

    const hoursDiv = document.createElement('div')
    hoursDiv.className = 'timeline-employee-hours'
    hoursDiv.style.cssText = 'position:relative'
    for (let i = 0; i < hoursCount; i++) {
      const cell = document.createElement('div')
      cell.className = refCells[i] ? refCells[i].className : 'timeline-hour-cell'
      hoursDiv.appendChild(cell)
    }

    const bar = document.createElement('div')
    bar.className = 'timeline-shift-bar'
    const guessNote = entry.guessedStart ? ' (εκτ. έναρξη)' : entry.guessedEnd ? ' (εκτ. λήξη)' : ''
    const stTitleParts = [`📋 ${entry.start}–${entry.end}`]
    if (entry.start2 && entry.end2) stTitleParts.push(`${entry.start2}–${entry.end2}`)
    const stFullTitle = stTitleParts.join(' + ') + guessNote
    const barBg = entry.guessed
      ? 'repeating-linear-gradient(45deg,#fbbf24,#fbbf24 6px,#d97706 6px,#d97706 12px)'
      : 'linear-gradient(135deg,#fbbf24,#d97706)'
    bar.style.cssText = `left:${leftPct.toFixed(2)}%;width:${Math.max(widthPct, 2).toFixed(2)}%;background:${barBg};cursor:pointer`
    bar.title = `${stFullTitle}${entry.guessed ? ' — σύρετε άκρο για διόρθωση' : ' — κλικ για επεξεργασία'}`
    bar.setAttribute('data-card-key', key)
    bar.setAttribute('data-hours-start', hoursStart)
    bar.setAttribute('data-hours-count', hoursCount)
    bar.onclick = (e) => {
      if (!e.target.dataset.handle) openCardTimeEdit(key)
    }

    const lbl = document.createElement('div')
    lbl.className = 'time-label'
    lbl.textContent = `${entry.start} - ${entry.end}${entry.guessed ? ' ?' : ''}`
    bar.appendChild(lbl)

    if (entry.guessedStart) {
      const h = document.createElement('div')
      h.className = 'drag-handle left'
      h.dataset.handle = 'left'
      bar.appendChild(h)
    }
    if (entry.guessedEnd) {
      const h = document.createElement('div')
      h.className = 'drag-handle right'
      h.dataset.handle = 'right'
      bar.appendChild(h)
    }

    hoursDiv.appendChild(bar)

    // Second interval bar (if double card entry)
    if (entry.start2 && entry.end2) {
      const sm2Min = toMinutes(entry.start2)
      let em2Min = toMinutes(entry.end2)
      if (sm2Min !== null && em2Min !== null) {
        if (em2Min <= sm2Min) em2Min += 24 * 60
        const sm2H = sm2Min / 60
        const em2H = em2Min / 60
        const left2 = Math.max(0, ((sm2H - hoursStart) / hoursCount) * 100)
        const width2 = Math.min(100 - left2, ((em2H - sm2H) / hoursCount) * 100)
        const bar2 = document.createElement('div')
        bar2.className = 'timeline-shift-bar'
        bar2.style.cssText = `left:${left2.toFixed(2)}%;width:${Math.max(width2, 2).toFixed(2)}%;background:${barBg};cursor:pointer`
        bar2.title = stFullTitle
        bar2.onclick = (e) => {
          if (!e.target.dataset.handle) openCardTimeEdit(key)
        }
        const lbl2 = document.createElement('div')
        lbl2.className = 'time-label'
        lbl2.textContent = `${entry.start2} - ${entry.end2}`
        bar2.appendChild(lbl2)
        hoursDiv.appendChild(bar2)
      }
    }
    row.appendChild(nameDiv)
    row.appendChild(hoursDiv)
    grid.appendChild(row)
  })

  // Attach drag handlers to all card bars that have guessed sides
  initCardDragHandlers()
}

// ─── Card bar drag (guessed-side only) ────────────────────────────────────
let _cardDragState = null

function initCardDragHandlers() {
  document.querySelectorAll('.timeline-shift-bar[data-card-key]').forEach((bar) => {
    // Remove any previous listener to avoid duplicates, then re-add
    bar.removeEventListener('mousedown', _cardBarMouseDown)
    bar.addEventListener('mousedown', _cardBarMouseDown)
  })
}

function _cardBarMouseDown(e) {
  const handle = e.target.dataset.handle
  if (!handle) return // only drag handles start a drag
  e.preventDefault()
  e.stopPropagation()

  const bar = e.target.closest('.timeline-shift-bar')
  if (!bar) return
  const container = bar.parentElement
  const containerRect = container.getBoundingClientRect()
  const cardKey = bar.dataset.cardKey
  const hoursStart = parseInt(bar.dataset.hoursStart, 10)
  const hoursCount = parseInt(bar.dataset.hoursCount, 10)
  const entry = cardData[cardKey]
  if (!entry) return

  bar.classList.add('dragging')
  _cardDragState = {
    bar,
    container,
    containerRect,
    handle,
    cardKey,
    hoursStart,
    hoursCount,
    initialStart: entry.start,
    initialEnd: entry.end,
    startX: e.clientX,
  }
  document.addEventListener('mousemove', _cardBarMouseMove)
  document.addEventListener('mouseup', _cardBarMouseUp)
}

function _cardBarMouseMove(e) {
  if (!_cardDragState) return
  const { bar, containerRect, handle, hoursStart, hoursCount, initialStart, initialEnd } = _cardDragState

  const deltaHours = ((e.clientX - _cardDragState.startX) / containerRect.width) * hoursCount
  const [sh, sm] = initialStart.split(':').map(Number)
  const [eh, em] = initialEnd.split(':').map(Number)
  let s = sh + sm / 60
  let en = eh + em / 60
  if (en <= s) en += 24

  if (handle === 'left') {
    s = Math.max(hoursStart, Math.min(s + deltaHours, en - 0.25))
  } else {
    en = Math.max(s + 0.25, Math.min(en + deltaHours, hoursStart + hoursCount))
  }
  s = roundToQuarter(s)
  en = roundToQuarter(en)

  const startOff = ((s - hoursStart) / hoursCount) * 100
  const width = ((en - s) / hoursCount) * 100
  bar.style.left = `${startOff}%`
  bar.style.width = `${width}%`

  const newStartStr = formatTimeFromHours(s)
  const newEndStr = formatTimeFromHours(en)
  const lbl = bar.querySelector('.time-label')
  if (lbl) lbl.textContent = `${newStartStr} - ${newEndStr}`

  _cardDragState.newStart = newStartStr
  _cardDragState.newEnd = newEndStr
}

function _cardBarMouseUp() {
  if (!_cardDragState) return
  const { bar, cardKey, handle, newStart, newEnd } = _cardDragState
  bar.classList.remove('dragging')

  if (newStart && newEnd) {
    const entry = cardData[cardKey] || {}
    // Keep guessed flags and second interval unchanged — the bar stays striped and draggable.
    // Flags are only cleared when the user explicitly saves via the edit modal.
    const updated = {
      start: newStart,
      end: newEnd,
      guessedStart: entry.guessedStart,
      guessedEnd: entry.guessedEnd,
      guessed: entry.guessed,
    }
    if (entry.start2 && entry.end2) {
      updated.start2 = entry.start2
      updated.end2 = entry.end2
    }
    cardData[cardKey] = updated
    renderTimeline()
    renderGrid()
  }

  _cardDragState = null
  document.removeEventListener('mousemove', _cardBarMouseMove)
  document.removeEventListener('mouseup', _cardBarMouseUp)
}

// ─── Schedule modal (tabbed) ──────────────────────────────────────────────

function openScheduleModal(tab) {
  _schedTabSwitch(tab || 'load')
  document.getElementById('scheduleModal').classList.add('active')
}

// Keep old name as alias (called from anywhere that still references it)
function openScheduleCheckModal() {
  openScheduleModal('check')
}

function _schedTabSwitch(name) {
  ;['load', 'save', 'check', 'print', 'changes'].forEach((t) => {
    document.getElementById(`schedTab-${t}`).classList.toggle('active', t === name)
    document.getElementById(`schedPanel-${t}`).classList.toggle('active', t === name)
  })
  const now = viewStart || new Date()
  if (name === 'check') {
    const el = document.getElementById('schedCheckMonth')
    if (!el.value) el.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }
  if (name === 'print') {
    document.getElementById('schedPrintDate').value = formatDate(getMonday(now))
  }
  if (name === 'changes') {
    const el = document.getElementById('changesMonth')
    if (!el.value) {
      // Default to detected card month, or current month
      const cardMonth = detectCardMonth()
      if (cardMonth) {
        el.value = cardMonth
      } else {
        const now = viewStart || new Date()
        el.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      }
    }
    // Sync tolerance value from card Load tab or current setting
    const tolTarget = document.getElementById('changesTolerance')
    if (tolTarget) tolTarget.value = correctionTolerance
    renderChangesPreview()
  }
}

function exportScheduleAsJson() {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `eschedule_${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Corrections (schedule vs card comparison) ─────────────────────────────

function runComputeCorrections() {
  if (Object.keys(cardData).length === 0) {
    alert('Δεν υπάρχουν δεδομένα κάρτας. Φορτώστε πρώτα αρχείο κάρτας.')
    return
  }
  // Read tolerance from the Changes tab input (or fall back to card Load tab input)
  const tolEl = document.getElementById('changesTolerance') || document.getElementById('corrToleranceInput')
  if (tolEl) correctionTolerance = parseInt(tolEl.value, 10) || 15
  computeCorrections()
  renderGrid()
  renderChangesPreview()
}

function computeCorrections() {
  shiftCorrections = {}
  // Collect all relevant keys from both schedule and card
  const allKeys = new Set([...Object.keys(data.shifts), ...Object.keys(cardData)])
  for (const key of allKeys) {
    const shift = data.shifts[key]
    const card = cardData[key]
    const dateStr = key.slice(key.indexOf('_') + 1)
    const dateObj = parseISODateLocal(dateStr)
    const hasWorkShift = shift && isWorkingType(shift)
    const hasCard = !!card

    if (hasCard && !hasWorkShift) {
      // Card exists but no scheduled work → new entry
      shiftCorrections[key] = {
        corrType: 'new_entry',
        resolved: true,
        type: 'ΕΡΓ',
        start: card.start,
        end: card.end,
        start2: card.start2,
        end2: card.end2,
      }
    } else if (hasWorkShift && !hasCard) {
      // Schedule exists but no card
      if (isDateSundayOrHoliday(dateObj)) continue // Sunday/holiday — skip
      shiftCorrections[key] = {
        corrType: 'missing_card',
        resolved: false,
        type: null,
      }
    } else if (hasWorkShift && hasCard) {
      // Both exist — compare times
      const tol = correctionTolerance
      const sStart = toMinutes(shift.start)
      const sEnd = toMinutes(shift.end)
      const cStart = toMinutes(card.start)
      const cEnd = toMinutes(card.end)
      if (sStart == null || sEnd == null || cStart == null || cEnd == null) continue
      const startDiff = Math.abs(sStart - cStart)
      const endDiff = Math.abs(sEnd - cEnd)
      // Check second segments too
      let seg2Diff = false
      if (shift.start2 || card.start2) {
        const ss2 = shift.start2 ? toMinutes(shift.start2) : -1
        const se2 = shift.end2 ? toMinutes(shift.end2) : -1
        const cs2 = card.start2 ? toMinutes(card.start2) : -1
        const ce2 = card.end2 ? toMinutes(card.end2) : -1
        if (ss2 < 0 && cs2 >= 0) seg2Diff = true
        else if (ss2 >= 0 && cs2 < 0) seg2Diff = true
        else if (ss2 >= 0 && cs2 >= 0) {
          seg2Diff = Math.abs(ss2 - cs2) > tol || Math.abs(se2 - ce2) > tol
        }
      }
      if (startDiff > tol || endDiff > tol || seg2Diff) {
        shiftCorrections[key] = {
          corrType: 'time_diff',
          resolved: true,
          type: shift.type,
          start: card.start,
          end: card.end,
          start2: card.start2,
          end2: card.end2,
          type2: shift.type2,
        }
      }
    }
  }
}

function renderMissingCardBar(corr, vat, dateStr) {
  if (!corr) return ''
  const isSel = selectedCorrCells.some((c) => c.vat === vat && c.dateStr === dateStr)
  let inner
  if (corr.resolved) {
    const label = corr.type ? absenceLabel(corr.type) : '—'
    inner = `<div class="bar bar-corr-resolved"><span class="corr-label">${label}</span></div>`
  } else {
    inner = `<div class="bar bar-corr-pending"><span class="corr-label">?</span></div>`
  }
  return `<div class="bar-wrap card-bar-wrap corr-bar-wrap${isSel ? ' corr-selected' : ''}" onclick="event.stopPropagation();handleCorrBarClick(event,'${vat}','${dateStr}')">${inner}</div>`
}

function handleCorrBarClick(event, vat, dateStr) {
  if (event.ctrlKey || event.metaKey || isMultiSelectMode) {
    // Toggle correction cell selection
    const idx = selectedCorrCells.findIndex((c) => c.vat === vat && c.dateStr === dateStr)
    if (idx >= 0) {
      selectedCorrCells.splice(idx, 1)
    } else {
      selectedCorrCells.push({ vat, dateStr })
    }
    renderGrid()
  } else if (selectedCorrCells.length > 0) {
    // Already have selection — check if clicking a selected cell
    const isSel = selectedCorrCells.some((c) => c.vat === vat && c.dateStr === dateStr)
    if (isSel) {
      openCorrectionModalForSelection()
    } else {
      selectedCorrCells = []
      openCorrectionModal(vat, dateStr)
    }
  } else {
    openCorrectionModal(vat, dateStr)
  }
}

function openCorrectionModalForSelection() {
  if (!selectedCorrCells.length) return
  const modal = document.getElementById('correctionModal')
  if (!modal) return

  // Populate dropdown
  const sel = document.getElementById('corrAbsenceType')
  if (sel && sel.options.length <= 1) {
    ;[
      { code: 'AN', label: 'Ανάπαυση / Ρεπό (AN)' },
      { code: 'ΜΕ', label: 'Μη Εργασια (ΜΕ)' },
    ].forEach((s) => {
      const opt = document.createElement('option')
      opt.value = s.code
      opt.textContent = s.label
      sel.appendChild(opt)
    })
    getAdeies().forEach((a) => {
      if (a.code === 'ΜΕ') return
      const opt = document.createElement('option')
      opt.value = a.code
      opt.textContent = `${a.name}${a.paid ? ' (με αποδοχές)' : ''}`
      sel.appendChild(opt)
    })
  }

  document.getElementById('corrVat').value = 'multi'
  document.getElementById('corrDate').value = 'multi'
  document.getElementById('corrEmpName').textContent = `${selectedCorrCells.length} ημέρες`
  document.getElementById('corrDateDisplay').textContent = ''
  document.getElementById('corrInfo').innerHTML =
    `<div style="font-size:12px;color:#6b7280">${selectedCorrCells.length} κελιά επιλεγμένα</div>`
  document.getElementById('corrAbsenceType').value = ''
  document.getElementById('corrReason').value = ''

  modal.classList.add('active')
}

function openCorrectionModal(vat, dateStr) {
  const key = `${vat}_${dateStr}`
  const corr = shiftCorrections[key]
  if (!corr) return
  const modal = document.getElementById('correctionModal')
  if (!modal) return

  // Populate correction type dropdown if needed (no ΕΡΓ/ΤΗΛ — only non-work types)
  const sel = document.getElementById('corrAbsenceType')
  if (sel && sel.options.length <= 1) {
    ;[
      { code: 'AN', label: 'Ανάπαυση / Ρεπό (AN)' },
      { code: 'ΜΕ', label: 'Μη Εργασια (ΜΕ)' },
    ].forEach((s) => {
      const opt = document.createElement('option')
      opt.value = s.code
      opt.textContent = s.label
      sel.appendChild(opt)
    })
    getAdeies().forEach((a) => {
      if (a.code === 'ΜΕ') return // already added above
      const opt = document.createElement('option')
      opt.value = a.code
      opt.textContent = `${a.name}${a.paid ? ' (με αποδοχές)' : ''}`
      sel.appendChild(opt)
    })
  }

  document.getElementById('corrVat').value = vat
  document.getElementById('corrDate').value = dateStr

  const emp = data.employees.find((e) => String(e.vat) === vat)
  const empName = emp ? emp.nickName || emp.vat : vat
  document.getElementById('corrEmpName').textContent = empName
  document.getElementById('corrDateDisplay').textContent = dateStr

  // Show original schedule and card info
  const shift = data.shifts[key]
  const card = cardData[key]
  let infoHtml = ''
  if (shift && isWorkingType(shift)) {
    infoHtml += `<div><strong>Πρόγραμμα:</strong> ${shift.type} ${shift.start || ''}–${shift.end || ''}${shift.start2 ? ' / ' + shift.start2 + '–' + shift.end2 : ''}</div>`
  } else {
    infoHtml += `<div><strong>Πρόγραμμα:</strong> ${shift ? shift.type : '(κενό)'}</div>`
  }
  if (card) {
    infoHtml += `<div><strong>Κάρτα:</strong> ${card.start}–${card.end}${card.start2 ? ' / ' + card.start2 + '–' + card.end2 : ''}</div>`
  } else {
    infoHtml += `<div><strong>Κάρτα:</strong> (δεν υπάρχει)</div>`
  }
  document.getElementById('corrInfo').innerHTML = infoHtml

  // Populate values
  document.getElementById('corrAbsenceType').value = corr.type || ''
  document.getElementById('corrReason').value = corr.reason || ''

  modal.classList.add('active')
}

function saveCorrection() {
  const corrType = document.getElementById('corrAbsenceType').value
  if (!corrType) {
    alert('Επιλέξτε τύπο.')
    return
  }
  const reason = document.getElementById('corrReason').value || undefined
  const isMulti = document.getElementById('corrVat').value === 'multi'

  if (isMulti) {
    // Apply to all selected correction cells
    for (const cell of selectedCorrCells) {
      const key = `${cell.vat}_${cell.dateStr}`
      const corr = shiftCorrections[key]
      if (corr) {
        corr.type = corrType
        corr.reason = reason
        corr.resolved = true
      }
    }
    selectedCorrCells = []
  } else {
    const vat = document.getElementById('corrVat').value
    const dateStr = document.getElementById('corrDate').value
    const corr = shiftCorrections[`${vat}_${dateStr}`]
    if (corr) {
      corr.type = corrType
      corr.reason = reason
      corr.resolved = true
    }
  }

  closeModal('correctionModal')
  renderGrid()
}

function _correctionKeysForMonth(month) {
  if (!month) return Object.keys(shiftCorrections)
  return Object.keys(shiftCorrections).filter((k) => {
    const dateStr = k.slice(k.indexOf('_') + 1)
    return dateStr.startsWith(month)
  })
}

function renderChangesPreview() {
  const el = document.getElementById('schedChangesResults')
  if (!el) return
  if (!Object.keys(cardData).length) {
    el.innerHTML =
      '<p style="color:#ef4444;font-size:13px">Δεν έχουν φορτωθεί δεδομένα κάρτας. Εισάγετε πρώτα αρχείο κάρτας.</p>'
    return
  }
  const month = document.getElementById('changesMonth')?.value || ''
  const keys = _correctionKeysForMonth(month)
  if (!keys.length) {
    el.innerHTML = `<p style="color:#9ca3af;font-size:13px">Δεν βρέθηκαν διαφορές για ${month || 'όλους τους μήνες'}.</p>`
    return
  }
  const resolved = keys.filter((k) => shiftCorrections[k].resolved).length
  const pending = keys.length - resolved
  let html = `<p style="font-size:13px;color:#6b7280;margin-bottom:10px"><strong>${keys.length}</strong> διαφορ${keys.length === 1 ? 'ά' : 'ές'}: <span style="color:#22c55e">${resolved} ολοκληρωμέν${resolved === 1 ? 'η' : 'ες'}</span>`
  if (pending) html += `, <span style="color:#ef4444">${pending} εκκρεμ${pending === 1 ? 'ής' : 'είς'}</span>`
  html += '</p>'
  if (pending) {
    html +=
      '<p style="font-size:12px;color:#ef4444;margin-bottom:10px">Ορίστε τύπο για τις εκκρεμείς διαφορές πριν εξάγετε.</p>'
  }
  // Group by employee
  const byEmp = {}
  for (const key of keys) {
    const vat = key.split('_')[0]
    if (!byEmp[vat]) byEmp[vat] = []
    const dateStr = key.slice(vat.length + 1)
    byEmp[vat].push({ dateStr, corr: shiftCorrections[key] })
  }
  html += '<div style="max-height:240px;overflow-y:auto">'
  for (const vat of Object.keys(byEmp)) {
    const emp = data.employees.find((e) => String(e.vat) === vat)
    const name = emp ? emp.nickName || emp.vat : vat
    html += `<div style="margin-bottom:8px"><strong style="font-size:13px">${name}</strong><ul style="margin:4px 0 0 16px;font-size:12px;color:#374151">`
    for (const c of byEmp[vat].sort((a, b) => a.dateStr.localeCompare(b.dateStr))) {
      const corr = c.corr
      const icon = corr.resolved
        ? '<span style="color:#22c55e">&#10003;</span>'
        : '<span style="color:#ef4444">&#10007;</span>'
      let desc = ''
      if (corr.corrType === 'time_diff')
        desc = `${corr.start}-${corr.end}${corr.start2 ? ' / ' + corr.start2 + '-' + corr.end2 : ''}`
      else if (corr.corrType === 'new_entry') desc = `(νέα) ${corr.start}-${corr.end}`
      else if (corr.corrType === 'missing_card') desc = corr.type ? absenceLabel(corr.type) : 'εκκρεμεί...'
      html += `<li>${icon} ${c.dateStr}: ${desc}</li>`
    }
    html += '</ul></div>'
  }
  html += '</div>'
  el.innerHTML = html
}

function exportChangesAsJson() {
  if (!Object.keys(cardData).length) {
    alert('Δεν έχουν φορτωθεί δεδομένα κάρτας.')
    return
  }
  const month = document.getElementById('changesMonth')?.value || ''
  const keys = _correctionKeysForMonth(month)
  if (!keys.length) {
    alert(`Δεν βρέθηκαν διαφορές για ${month || 'κανέναν μήνα'}.`)
    return
  }
  const pending = keys.filter((k) => !shiftCorrections[k].resolved)
  if (pending.length) {
    alert(`Υπάρχουν ${pending.length} εκκρεμείς διαφορές για ${month}. Ορίστε τύπο πριν εξάγετε.`)
    return
  }
  // Build export with only resolved corrections for the selected month
  const shifts = {}
  const affectedVats = new Set()
  for (const key of keys) {
    const corr = shiftCorrections[key]
    const shift = {}
    shift.type = corr.type
    if (corr.start) {
      shift.start = corr.start
      shift.end = corr.end
    }
    if (corr.start2) {
      shift.start2 = corr.start2
      shift.end2 = corr.end2
    }
    if (corr.type2) shift.type2 = corr.type2
    if (corr.reason) shift.reason = corr.reason
    shifts[key] = shift
    affectedVats.add(key.split('_')[0])
  }
  const employees = data.employees.filter((e) => affectedVats.has(String(e.vat)))
  const exportObj = {
    companyName: data.companyName,
    employees,
    shifts,
    weekHolidays: data.weekHolidays,
    customHolidayNames: data.customHolidayNames,
  }
  const json = JSON.stringify(exportObj, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `eschedule_changes_${month || 'all'}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function printWeeklySchedule() {
  if (typeof printSchedule !== 'function') {
    alert('Σφάλμα: το print-schedule.js δεν φορτώθηκε σωστά.')
    return
  }
  const input = document.getElementById('schedPrintDate')
  // Ensure a default date is always present
  if (!input.value) input.value = formatDate(getMonday(viewStart || new Date()))
  const dateVal = input.value
  if (!dateVal) {
    alert('Επιλέξτε ημερομηνία για εκτύπωση.')
    return
  }

  try {
    const monday = getMonday(parseISODateLocal(dateVal))
    const saved = currentWeekStart
    currentWeekStart = monday
    printSchedule()
    currentWeekStart = saved
  } catch (e) {
    console.error('printWeeklySchedule error:', e)
    alert('Σφάλμα εκτύπωσης: ' + e.message)
  }
}

// ─── Schedule correctness check ──────────────────────────────────────────

function runScheduleCheck() {
  const monthVal = document.getElementById('schedCheckMonth').value // "YYYY-MM"
  if (!monthVal) return
  const [year, month] = monthVal.split('-').map(Number)
  const from = new Date(year, month - 1, 1)
  const to = new Date(year, month, 0) // last day of month

  const violations = []
  const maxShiftH = window.MAX_SHIFT_HOURS || 13

  // Build the date list within range, plus one day before for boundary rest checks
  const rangeDates = []
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) rangeDates.push(formatDate(new Date(d)))

  const prevDay = new Date(from)
  prevDay.setDate(prevDay.getDate() - 1)
  const allDates = [formatDate(prevDay), ...rangeDates]

  data.employees.forEach((emp) => {
    // ── Per-day + consecutive-day checks ──────────────────────────────
    let lastWork = null // { dateStr, endMin } — endMin relative to midnight of dateStr

    allDates.forEach((dateStr) => {
      const shift = data.shifts[`${emp.vat}_${dateStr}`]
      if (!shift || !isWorkingType(shift)) return

      const [sh, sm] = (shift.start || '00:00').split(':').map(Number)
      const startMin = sh * 60 + sm

      // 11h rest against previous working day
      if (lastWork) {
        const daysDiff = (parseISODateLocal(dateStr) - parseISODateLocal(lastWork.dateStr)) / 86400000
        const gapMin = startMin + daysDiff * 1440 - lastWork.endMin
        if (gapMin < 11 * 60 && rangeDates.includes(dateStr)) {
          const gapH = Math.round((gapMin / 60) * 10) / 10
          violations.push({
            sev: 'error',
            emp,
            date: dateStr,
            msg: `Ανάπαυση ${gapH}ω < 11ω (από ${lastWork.dateStr})`,
          })
        }
      }

      // Max shift hours + split gap
      const s1 = toMinutes(shift.start)
      let e1 = toMinutes(shift.end)
      if (s1 != null && e1 != null) {
        if (e1 <= s1) e1 += 1440
        let totalWorkMin = e1 - s1
        if (shift.start2 && shift.end2) {
          const s2 = toMinutes(shift.start2)
          let e2 = toMinutes(shift.end2)
          if (s2 != null && e2 != null) {
            if (e2 <= s2) e2 += 1440
            const gapMin = s2 - toMinutes(shift.end) // raw gap between parts
            if (gapMin < 180 && rangeDates.includes(dateStr))
              violations.push({
                sev: 'error',
                emp,
                date: dateStr,
                msg: `Κενό split βάρδιας ${Math.round((gapMin / 60) * 10) / 10}ω < 3ω`,
              })
            totalWorkMin += e2 - s2
          }
        }
        if (totalWorkMin / 60 > maxShiftH && rangeDates.includes(dateStr))
          violations.push({
            sev: 'error',
            emp,
            date: dateStr,
            msg: `Ώρες βάρδιας ${Math.round((totalWorkMin / 60) * 10) / 10}ω > max ${maxShiftH}ω`,
          })
      }

      // Track last work end (use end of last segment; handle overnight)
      const endKey = shift.end2 || shift.end
      const refKey = shift.start2 || shift.start
      const [eh, em] = (endKey || '00:00').split(':').map(Number)
      const [rh, rm] = (refKey || '00:00').split(':').map(Number)
      let endMin = eh * 60 + em
      if (endMin <= rh * 60 + rm) endMin += 1440
      lastWork = { dateStr, endMin }
    })

    // ── 24h rest: one check per Mon–Sun week overlapping the range ───
    const checkedWeeks = new Set()
    rangeDates.forEach((dateStr) => {
      const weekKey = formatDate(getMonday(parseISODateLocal(dateStr)))
      if (checkedWeeks.has(weekKey)) return
      checkedWeeks.add(weekKey)
      if (typeof validate24hRestInAny7Days === 'function') {
        const chk = validate24hRestInAny7Days(emp.vat, weekKey)
        if (!chk.ok)
          violations.push({
            sev: 'error',
            emp,
            date: weekKey,
            msg: `Εβδ. ${weekKey}: δεν υπάρχει 24ω συνεχής ανάπαυση`,
          })
      }
    })
  })

  _renderCheckResults(violations)
}

function _renderCheckResults(violations) {
  const el = document.getElementById('schedCheckResults')
  if (!violations.length) {
    el.innerHTML =
      '<div style="color:#16a34a;font-weight:600;padding:16px 0;font-size:14px">✅ Δεν βρέθηκαν παραβάσεις!</div>'
    return
  }

  const errors = violations.filter((v) => v.sev === 'error')
  const warnings = violations.filter((v) => v.sev === 'warn')

  let html = `<div style="font-size:12px;color:#6b7280;margin-bottom:10px">
    ${errors.length ? `<span style="color:#dc2626;font-weight:600">🔴 ${errors.length} σφάλμα${errors.length !== 1 ? 'τα' : ''}</span>` : ''}
    ${errors.length && warnings.length ? '&nbsp;&nbsp;' : ''}
    ${warnings.length ? `<span style="color:#d97706;font-weight:600">🟡 ${warnings.length} προειδοποίηση${warnings.length !== 1 ? 'εις' : ''}</span>` : ''}
  </div><div style="display:flex;flex-direction:column;gap:5px">`

  ;[...errors, ...warnings].forEach((v) => {
    const bg = v.sev === 'error' ? '#fef2f2' : '#fffbeb'
    const border = v.sev === 'error' ? '#dc2626' : '#d97706'
    const icon = v.sev === 'error' ? '🔴' : '🟡'
    const dateLbl = v.date
      ? `<span style="color:#6b7280;font-size:11px;margin-left:6px">${v.date}</span>`
      : ''
    html += `<div style="display:flex;gap:8px;align-items:flex-start;padding:7px 10px;
                         background:${bg};border-radius:6px;border-left:3px solid ${border}">
      <span style="flex-shrink:0">${icon}</span>
      <div>
        <span style="font-weight:600;font-size:12px">${employeeLabel(v.emp)}</span>${dateLbl}
        <div style="font-size:12px;color:#374151;margin-top:2px">${v.msg}</div>
      </div>
    </div>`
  })

  el.innerHTML = html + '</div>'
}

// ─── Card check ───────────────────────────────────────────────────────────

function runCardCheck() {
  const out = document.getElementById('cardCheckResults')
  const monthVal = document.getElementById('cardCheckMonth').value // "YYYY-MM"

  if (!Object.keys(cardData).length) {
    out.innerHTML =
      '<p style="color:#9ca3af;font-size:13px">Δεν υπάρχουν δεδομένα κάρτας. Φορτώστε αρχείο κάρτας πρώτα.</p>'
    return
  }
  if (!monthVal) {
    out.innerHTML = '<p style="color:#9ca3af;font-size:13px">Επιλέξτε μήνα και πατήστε «Εκτέλεση».</p>'
    return
  }

  const violations = []
  const allEmps = [...data.employees, ...cardVirtualEmployees]

  // Collect VATs with card data in the selected month
  const vatSet = new Set()
  Object.keys(cardData).forEach((key) => {
    const sep = key.lastIndexOf('_')
    if (key.slice(sep + 1).startsWith(monthVal)) vatSet.add(key.slice(0, sep))
  })

  if (!vatSet.size) {
    out.innerHTML = `<p style="color:#9ca3af;font-size:13px">Δεν υπάρχουν δεδομένα κάρτας για τον μήνα ${monthVal}.</p>`
    return
  }

  vatSet.forEach((vat) => {
    const emp = allEmps.find((e) => String(e.vat) === String(vat))
    if (!emp) return
    const isVirtual = !!emp._virtual

    // Rule 1: card data without a scheduled working shift (virtual employees have no schedule)
    if (!isVirtual) {
      Object.keys(cardData).forEach((key) => {
        const sep = key.lastIndexOf('_')
        const dateStr = key.slice(sep + 1)
        if (key.slice(0, sep) !== String(vat) || !dateStr.startsWith(monthVal)) return
        const shift = data.shifts[key]
        if (!shift || !isWorkingType(shift)) {
          const entry = cardData[key]
          violations.push({
            sev: 'error',
            emp,
            date: dateStr,
            msg: `Κάρτα χωρίς προγραμματισμένη εργασία (${entry.start}–${entry.end}${entry.start2 && entry.end2 ? ' + ' + entry.start2 + '–' + entry.end2 : ''})`,
          })
        }
      })
    }

    // Rule 2: entries with missing start or end time (per entry, limit 3/month)
    const missingEntries = []
    Object.keys(cardData).forEach((key) => {
      const sep = key.lastIndexOf('_')
      const dateStr = key.slice(sep + 1)
      if (key.slice(0, sep) !== String(vat) || !dateStr.startsWith(monthVal)) return
      const entry = cardData[key]
      if (entry.guessedStart || entry.guessedEnd) {
        const missing =
          entry.guessedStart && entry.guessedEnd
            ? 'ώρα έναρξης & λήξης'
            : entry.guessedStart
              ? 'ώρα έναρξης'
              : 'ώρα λήξης'
        missingEntries.push({ dateStr, missing })
      }
    })
    missingEntries.sort((a, b) => a.dateStr.localeCompare(b.dateStr))
    if (missingEntries.length > 3) {
      missingEntries.forEach((e) => {
        violations.push({ sev: 'error', emp, date: e.dateStr, msg: `Λείπει ${e.missing}` })
      })
      violations.push({
        sev: 'error',
        emp,
        date: monthVal,
        msg: `${missingEntries.length} εγγραφές χωρίς ώρα αυτόν τον μήνα (μέγιστο 3)`,
      })
    } else if (missingEntries.length > 0) {
      missingEntries.forEach((e) => {
        violations.push({ sev: 'warn', emp, date: e.dateStr, msg: `Λείπει ${e.missing}` })
      })
    }

    // Rule 3: 11-hour rest gap between consecutive card entries
    // Collect all card dates for this employee in the month, sorted
    const empCardDates = Object.keys(cardData)
      .filter((key) => {
        const sep = key.lastIndexOf('_')
        return key.slice(0, sep) === String(vat) && key.slice(sep + 1).startsWith(monthVal)
      })
      .map((key) => key.slice(key.lastIndexOf('_') + 1))
      .sort()

    for (const dateStr of empCardDates) {
      const gapH = getGapToPrevCardEntry(vat, dateStr)
      if (gapH !== null && gapH < 11) {
        violations.push({
          sev: 'error',
          emp,
          date: dateStr,
          msg: `Ανάπαυση ${gapH.toFixed(1)} ωρών μεταξύ βαρδιών (ελάχιστο 11)`,
        })
      }
    }
  })

  _renderCardCheckResults(violations)
}

function _renderCardCheckResults(violations) {
  const el = document.getElementById('cardCheckResults')
  if (!violations.length) {
    el.innerHTML =
      '<div style="color:#16a34a;font-weight:600;padding:16px 0;font-size:14px">✅ Δεν βρέθηκαν παραβάσεις!</div>'
    return
  }

  const errors = violations.filter((v) => v.sev === 'error')
  const warnings = violations.filter((v) => v.sev === 'warn')

  let html = `<div style="font-size:12px;color:#6b7280;margin-bottom:10px">
    ${errors.length ? `<span style="color:#dc2626;font-weight:600">🔴 ${errors.length} σφάλμα${errors.length !== 1 ? 'τα' : ''}</span>` : ''}
    ${errors.length && warnings.length ? '&nbsp;&nbsp;' : ''}
    ${warnings.length ? `<span style="color:#d97706;font-weight:600">🟡 ${warnings.length} προειδοποίηση${warnings.length !== 1 ? 'εις' : ''}</span>` : ''}
  </div><div style="display:flex;flex-direction:column;gap:5px">`

  ;[...errors, ...warnings].forEach((v) => {
    const bg = v.sev === 'error' ? '#fef2f2' : '#fffbeb'
    const border = v.sev === 'error' ? '#dc2626' : '#d97706'
    const icon = v.sev === 'error' ? '🔴' : '🟡'
    const dateLbl = v.date
      ? `<span style="color:#6b7280;font-size:11px;margin-left:6px">${v.date}</span>`
      : ''
    html += `<div style="display:flex;gap:8px;align-items:flex-start;padding:7px 10px;
                         background:${bg};border-radius:6px;border-left:3px solid ${border}">
      <span style="flex-shrink:0">${icon}</span>
      <div>
        <span style="font-weight:600;font-size:12px">${employeeLabel(v.emp)}</span>${dateLbl}
        <div style="font-size:12px;color:#374151;margin-top:2px">${v.msg}</div>
      </div>
    </div>`
  })

  el.innerHTML = html + '</div>'
}

// ─── Summary modal ───────────────────────────────────────────────────────

let _summaryViewMode = 'week'

function openSummaryModal() {
  const input = document.getElementById('summaryMonth')
  if (!input.value) {
    const now = new Date()
    input.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }
  document.getElementById('summaryModal').classList.add('active')
}

function renderSummary(viewMode) {
  if (viewMode) _summaryViewMode = viewMode
  const modes = ['week', 'month', 'cardWeek', 'cardMonth']
  const btnIds = ['summaryViewWeek', 'summaryViewMonth', 'summaryViewCardWeek', 'summaryViewCardMonth']
  modes.forEach((m, i) => {
    const btn = document.getElementById(btnIds[i])
    if (btn) btn.style.fontWeight = _summaryViewMode === m ? '700' : '400'
  })

  const monthVal = document.getElementById('summaryMonth').value
  const out = document.getElementById('summaryResults')
  if (!monthVal) {
    out.innerHTML = '<p style="color:#9ca3af;font-size:13px">Επιλέξτε μήνα.</p>'
    return
  }

  const isCard = _summaryViewMode === 'cardWeek' || _summaryViewMode === 'cardMonth'
  if (!isCard && !data.employees.length) {
    out.innerHTML = '<p style="color:#9ca3af;font-size:13px">Δεν υπάρχουν εργαζόμενοι.</p>'
    return
  }
  if (isCard && !Object.keys(cardData).length) {
    out.innerHTML = '<p style="color:#9ca3af;font-size:13px">Δεν υπάρχουν δεδομένα κάρτας.</p>'
    return
  }

  const renderers = {
    week: _renderWeekSummary,
    month: _renderMonthSummary,
    cardWeek: _renderWeekCardSummary,
    cardMonth: _renderMonthCardSummary,
  }
  out.innerHTML = renderers[_summaryViewMode](monthVal)
}

// ─── Detailed hour classification (30 buckets) ──────────────────────────
// 5 hour-categories × 3 day-types × 2 time-of-day = 30 buckets
const _H_CATS = ['within', 'additional', 'ye', 'yp', 'illegal']
const _D_TYPES = ['work', 'holiday', 'sunday']
const _T_TYPES = ['day', 'night']

function _emptyBuckets() {
  const b = {}
  _H_CATS.forEach((c) =>
    _D_TYPES.forEach((d) =>
      _T_TYPES.forEach((t) => {
        b[`${c}_${d}_${t}`] = 0
      }),
    ),
  )
  return b
}

function _classifyDayHours(employeeId, dateStr, dailyContract) {
  const buckets = _emptyBuckets()
  const shift = data.shifts[`${employeeId}_${dateStr}`]
  if (!shift || !isWorkingType(shift)) return buckets

  const yeThresh = getRule('dailyYeThreshold') || 8
  const ypThresh = getRule('dailyYpThreshold') || 9
  const illegalThresh = getRule('dailyIllegalThreshold') || 11
  const nightStartMin = getRule('nightStartMinutes') || 1320
  const nightEndMin = getRule('nightEndMinutes') || 360
  const withinThresh = dailyContract != null ? Math.min(dailyContract, yeThresh) : yeThresh

  // Day type: holiday > sunday > work
  const date = parseISODateLocal(dateStr)
  const dow = date.getDay()
  let dayType = 'work'
  if (isDateHoliday(date)) dayType = 'holiday'
  else if (dow === 0) dayType = 'sunday'

  // Walk through shift minute-by-minute
  const intervals = [{ start: shift.start, end: shift.end }]
  if (shift.start2 && shift.end2) intervals.push({ start: shift.start2, end: shift.end2 })
  let cumulMin = 0

  intervals.forEach((iv) => {
    const [sh, sm] = iv.start.split(':').map(Number)
    const [eh, em] = iv.end.split(':').map(Number)
    let sMin = sh * 60 + sm
    let eMin = eh * 60 + em
    if (eMin <= sMin) eMin += 1440

    for (let m = sMin; m < eMin; m++) {
      const tod = m % 1440
      const timeType = tod >= nightStartMin || tod < nightEndMin ? 'night' : 'day'
      const h = cumulMin / 60
      let cat
      if (h < withinThresh) cat = 'within'
      else if (h < yeThresh) cat = 'additional'
      else if (h < ypThresh) cat = 'ye'
      else if (h < illegalThresh) cat = 'yp'
      else cat = 'illegal'

      buckets[`${cat}_${dayType}_${timeType}`] += 1 / 60
      cumulMin++
    }
  })

  const r = (v) => Math.round(v * 100) / 100
  Object.keys(buckets).forEach((k) => {
    buckets[k] = r(buckets[k])
  })
  return buckets
}

function _aggregateBuckets(target, source) {
  Object.keys(source).forEach((k) => {
    target[k] = Math.round(((target[k] || 0) + (source[k] || 0)) * 100) / 100
  })
  return target
}

function _bucketTotal(b) {
  let s = 0
  Object.values(b).forEach((v) => {
    s += v
  })
  return Math.round(s * 100) / 100
}

// Redistribute excess "within" hours to "additional" based on contract.
// At the daily level all hours up to 8h are classified as "within".
// This function moves the weekly/monthly excess beyond contractHours
// from "within" to "additional" using priority fill: normal workday/day
// hours fill Εντός first; night, holiday, sunday hours overflow last.
function _redistributeAdditional(buckets, contractHours) {
  // Fill order: most "normal" hours stay in Εντός first
  const fillOrder = [
    'within_work_day',
    'within_work_night',
    'within_holiday_day',
    'within_holiday_night',
    'within_sunday_day',
    'within_sunday_night',
  ]
  let totalWithin = 0
  fillOrder.forEach((k) => {
    totalWithin += buckets[k] || 0
  })
  totalWithin = Math.round(totalWithin * 100) / 100

  if (totalWithin <= contractHours || totalWithin === 0) return buckets

  let remaining = Math.round(contractHours * 100) / 100
  fillOrder.forEach((wk) => {
    const val = buckets[wk] || 0
    if (remaining >= val) {
      remaining = Math.round((remaining - val) * 100) / 100
    } else {
      const overflow = Math.round((val - remaining) * 100) / 100
      buckets[wk] = Math.round(remaining * 100) / 100
      const ak = wk.replace('within_', 'additional_')
      buckets[ak] = Math.round(((buckets[ak] || 0) + overflow) * 100) / 100
      remaining = 0
    }
  })
  return buckets
}

function _detailedWeekBuckets(employeeId, weekStart) {
  const emp = data.employees.find((e) => String(e.vat) === String(employeeId))
  const weekContract = Number(emp?.weekWorkingHours ?? 40)
  const weekDays = Number(emp?.weekWorkingDays ?? 5) || 5
  const dailyContract = weekContract / weekDays
  const totals = _emptyBuckets()
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    _aggregateBuckets(totals, _classifyDayHours(employeeId, formatDate(d), dailyContract))
  }
  _redistributeAdditional(totals, weekContract)
  return totals
}

function _monthWeekBuckets(employeeId, weekStart, monthFirstDay, monthLastDay) {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const isFirstPartial = weekStart < monthFirstDay
  const isLastPartial = weekEnd > monthLastDay

  const emp = data.employees.find((e) => String(e.vat) === String(employeeId))
  const weekContract = Number(emp?.weekWorkingHours ?? 40)
  const weekDays = Number(emp?.weekWorkingDays ?? 5) || 5
  const dailyContract = weekContract / weekDays

  // Full week — use standard calculation
  if (!isFirstPartial && !isLastPartial) {
    return { buckets: _detailedWeekBuckets(employeeId, weekStart), contract: weekContract }
  }

  // Separate days into in-month and out-of-month
  const inMonthDays = []
  const outMonthDays = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    const ds = formatDate(d)
    if (d >= monthFirstDay && d <= monthLastDay) {
      inMonthDays.push(ds)
    } else {
      outMonthDays.push(ds)
    }
  }

  // Classify in-month days (raw, no redistribution)
  const inMonthBuckets = _emptyBuckets()
  inMonthDays.forEach((ds) => _aggregateBuckets(inMonthBuckets, _classifyDayHours(employeeId, ds, dailyContract)))

  // If no in-month working hours → contract = 0
  if (_bucketTotal(inMonthBuckets) === 0) {
    return { buckets: inMonthBuckets, contract: 0 }
  }

  // Partial week (first or last) — check out-of-month shifts for effective contract
  let hasOutMonthSchedule = false
  outMonthDays.forEach((ds) => {
    if (data.shifts[`${employeeId}_${ds}`]) hasOutMonthSchedule = true
  })

  if (hasOutMonthSchedule) {
    // Effective contract: out-of-month within hours consumed part of the contract
    let outWithin = 0
    outMonthDays.forEach((ds) => {
      const dayB = _classifyDayHours(employeeId, ds, dailyContract)
      Object.keys(dayB).forEach((k) => {
        if (k.startsWith('within_')) outWithin += dayB[k]
      })
    })
    outWithin = Math.round(outWithin * 100) / 100
    const effectiveContract = Math.max(0, Math.round((weekContract - outWithin) * 100) / 100)
    _redistributeAdditional(inMonthBuckets, effectiveContract)
    return { buckets: inMonthBuckets, contract: effectiveContract }
  }

  // No schedule on out-of-month days: proportional contract
  const propContract = Math.round(((weekContract * inMonthDays.length) / 7) * 100) / 100
  _redistributeAdditional(inMonthBuckets, propContract)
  return { buckets: inMonthBuckets, contract: propContract }
}

function _detailedMonthBuckets(employeeId, monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const totals = _emptyBuckets()
  const seen = new Set()
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const mon = getMonday(new Date(d))
    const key = formatDate(mon)
    if (!seen.has(key)) {
      seen.add(key)
      _aggregateBuckets(totals, _monthWeekBuckets(employeeId, mon, firstDay, lastDay).buckets)
    }
  }
  return totals
}

// ─── Card-based hour classification (mirrors schedule classification) ────

function _classifyCardDayHours(employeeId, dateStr, dailyContract) {
  const buckets = _emptyBuckets()
  const entry = cardData[`${employeeId}_${dateStr}`]
  if (!entry || !entry.start || !entry.end) return buckets

  const yeThresh = getRule('dailyYeThreshold') || 8
  const ypThresh = getRule('dailyYpThreshold') || 9
  const illegalThresh = getRule('dailyIllegalThreshold') || 11
  const nightStartMin = getRule('nightStartMinutes') || 1320
  const nightEndMin = getRule('nightEndMinutes') || 360
  const withinThresh = dailyContract != null ? Math.min(dailyContract, yeThresh) : yeThresh

  const date = parseISODateLocal(dateStr)
  const dow = date.getDay()
  let dayType = 'work'
  if (isDateHoliday(date)) dayType = 'holiday'
  else if (dow === 0) dayType = 'sunday'

  const intervals = [{ start: entry.start, end: entry.end }]
  if (entry.start2 && entry.end2) intervals.push({ start: entry.start2, end: entry.end2 })
  let cumulMin = 0

  intervals.forEach((iv) => {
    const [sh, sm] = iv.start.split(':').map(Number)
    const [eh, em] = iv.end.split(':').map(Number)
    let sMin = sh * 60 + sm
    let eMin = eh * 60 + em
    if (eMin <= sMin) eMin += 1440

    for (let m = sMin; m < eMin; m++) {
      const tod = m % 1440
      const timeType = tod >= nightStartMin || tod < nightEndMin ? 'night' : 'day'
      const h = cumulMin / 60
      let cat
      if (h < withinThresh) cat = 'within'
      else if (h < yeThresh) cat = 'additional'
      else if (h < ypThresh) cat = 'ye'
      else if (h < illegalThresh) cat = 'yp'
      else cat = 'illegal'
      buckets[`${cat}_${dayType}_${timeType}`] += 1 / 60
      cumulMin++
    }
  })

  const r = (v) => Math.round(v * 100) / 100
  Object.keys(buckets).forEach((k) => {
    buckets[k] = r(buckets[k])
  })
  return buckets
}

function _detailedWeekCardBuckets(employeeId, weekStart) {
  const emp =
    data.employees.find((e) => String(e.vat) === String(employeeId)) ||
    cardVirtualEmployees.find((e) => String(e.vat) === String(employeeId))
  const weekContract = Number(emp?.weekWorkingHours ?? 40)
  const weekDays = Number(emp?.weekWorkingDays ?? 5) || 5
  const dailyContract = weekContract / weekDays
  const totals = _emptyBuckets()
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    _aggregateBuckets(totals, _classifyCardDayHours(employeeId, formatDate(d), dailyContract))
  }
  _redistributeAdditional(totals, weekContract)
  return totals
}

function _monthWeekCardBuckets(employeeId, weekStart, monthFirstDay, monthLastDay) {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const isFirstPartial = weekStart < monthFirstDay
  const isLastPartial = weekEnd > monthLastDay

  const emp =
    data.employees.find((e) => String(e.vat) === String(employeeId)) ||
    cardVirtualEmployees.find((e) => String(e.vat) === String(employeeId))
  const weekContract = Number(emp?.weekWorkingHours ?? 40)
  const weekDays = Number(emp?.weekWorkingDays ?? 5) || 5
  const dailyContract = weekContract / weekDays

  if (!isFirstPartial && !isLastPartial) {
    return { buckets: _detailedWeekCardBuckets(employeeId, weekStart), contract: weekContract }
  }

  const inMonthDays = []
  const outMonthDays = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    const ds = formatDate(d)
    if (d >= monthFirstDay && d <= monthLastDay) {
      inMonthDays.push(ds)
    } else {
      outMonthDays.push(ds)
    }
  }

  const inMonthBuckets = _emptyBuckets()
  inMonthDays.forEach((ds) => _aggregateBuckets(inMonthBuckets, _classifyCardDayHours(employeeId, ds, dailyContract)))

  if (_bucketTotal(inMonthBuckets) === 0) {
    return { buckets: inMonthBuckets, contract: 0 }
  }

  // Check out-of-month card entries for effective contract
  let hasOutMonthData = false
  outMonthDays.forEach((ds) => {
    if (cardData[`${employeeId}_${ds}`]) hasOutMonthData = true
  })

  if (hasOutMonthData) {
    let outWithin = 0
    outMonthDays.forEach((ds) => {
      const dayB = _classifyCardDayHours(employeeId, ds, dailyContract)
      Object.keys(dayB).forEach((k) => {
        if (k.startsWith('within_')) outWithin += dayB[k]
      })
    })
    outWithin = Math.round(outWithin * 100) / 100
    const effectiveContract = Math.max(0, Math.round((weekContract - outWithin) * 100) / 100)
    _redistributeAdditional(inMonthBuckets, effectiveContract)
    return { buckets: inMonthBuckets, contract: effectiveContract }
  }

  const propContract = Math.round(((weekContract * inMonthDays.length) / 7) * 100) / 100
  _redistributeAdditional(inMonthBuckets, propContract)
  return { buckets: inMonthBuckets, contract: propContract }
}

// ─── Summary table rendering ─────────────────────────────────────────────
const _thS =
  'padding:3px 2px;font-size:10px;text-align:center;color:#fff;border:1px solid rgba(255,255,255,0.25);white-space:nowrap'
const _thBg = 'background:#6366f1'

function _summaryTableHead() {
  const catLabels = ['Εντός', 'Πρόσθετη', 'Υπερεργασία', 'Υπερωρίες', 'Παράνομες']
  const dayLabels = ['Εργ.', 'Αργία', 'Κυρ.']

  let r1 = `<th rowspan="3" style="${_thS};${_thBg};text-align:left;min-width:100px;position:sticky;left:0;z-index:2">Εργαζόμενος</th>`
  r1 += `<th rowspan="3" style="${_thS};${_thBg};min-width:34px" title="Συμβατικές ώρες">Σύμβ.</th>`
  r1 += `<th rowspan="3" style="${_thS};${_thBg};min-width:34px" title="Σύνολο ωρών">Σύν.</th>`
  let r2 = '',
    r3 = ''
  catLabels.forEach((c) => {
    r1 += `<th colspan="6" style="${_thS};${_thBg}">${c}</th>`
    dayLabels.forEach((d) => {
      r2 += `<th colspan="2" style="${_thS};${_thBg}">${d}</th>`
      r3 += `<th style="${_thS};${_thBg}">Ημ.</th><th style="${_thS};${_thBg}">Νυχ.</th>`
    })
  })
  return `<thead><tr>${r1}</tr><tr>${r2}</tr><tr>${r3}</tr></thead>`
}

function _fmtV(v) {
  if (!v) return ''
  return v % 1 === 0 ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function _summaryRow(label, buckets, bold, contractHours) {
  const fw = bold ? 'font-weight:700;' : ''
  const bg = bold ? '#eef2ff' : '#fff'
  const tdS = `text-align:center;padding:2px 3px;font-size:11px;border:1px solid #e5e7eb;${fw}`
  let html = `<td style="${tdS};text-align:left;white-space:nowrap;position:sticky;left:0;z-index:1;background:${bg}">${label}</td>`
  html += `<td style="${tdS};background:${bg}">${_fmtV(contractHours)}</td>`
  html += `<td style="${tdS};font-weight:700;background:${bg}">${_fmtV(_bucketTotal(buckets))}</td>`
  _H_CATS.forEach((c) => {
    _D_TYPES.forEach((d) => {
      _T_TYPES.forEach((t) => {
        html += `<td style="${tdS};background:${bg}">${_fmtV(buckets[`${c}_${d}_${t}`])}</td>`
      })
    })
  })
  return `<tr>${html}</tr>`
}

function _renderMonthSummary(monthVal) {
  const [year, month] = monthVal.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)

  // Collect unique week starts
  const weekStarts = []
  const seen = new Set()
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const mon = getMonday(new Date(d))
    const key = formatDate(mon)
    if (!seen.has(key)) {
      seen.add(key)
      weekStarts.push(mon)
    }
  }

  const grandTotals = _emptyBuckets()
  let totalContract = 0
  let rows = ''
  data.employees.forEach((emp) => {
    const empBuckets = _emptyBuckets()
    let empContract = 0
    weekStarts.forEach((ws) => {
      const { buckets, contract } = _monthWeekBuckets(emp.vat, ws, firstDay, lastDay)
      _aggregateBuckets(empBuckets, buckets)
      empContract += contract
    })
    empContract = Math.round(empContract * 100) / 100
    rows += _summaryRow(employeeLabel(emp), empBuckets, false, empContract)
    _aggregateBuckets(grandTotals, empBuckets)
    totalContract += empContract
  })
  return `<table style="border-collapse:collapse;border:1px solid #d1d5db;font-family:inherit">
    ${_summaryTableHead()}<tbody>${rows}${_summaryRow('Σύνολο', grandTotals, true, Math.round(totalContract * 100) / 100)}</tbody></table>`
}

function _renderWeekSummary(monthVal) {
  const [year, month] = monthVal.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)

  const weekStarts = []
  const seen = new Set()
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const mon = getMonday(new Date(d))
    const key = formatDate(mon)
    if (!seen.has(key)) {
      seen.add(key)
      weekStarts.push(mon)
    }
  }

  let html = ''
  weekStarts.forEach((ws) => {
    const wEnd = new Date(ws)
    wEnd.setDate(wEnd.getDate() + 6)
    // Show in-month date range for boundary weeks
    const rangeStart = ws < firstDay ? firstDay : ws
    const rangeEnd = wEnd > lastDay ? lastDay : wEnd
    const label = `${formatDate(rangeStart).slice(5)} — ${formatDate(rangeEnd).slice(5)}`
    const grandTotals = _emptyBuckets()
    let totalContract = 0
    let rows = ''
    data.employees.forEach((emp) => {
      const { buckets, contract } = _monthWeekBuckets(emp.vat, ws, firstDay, lastDay)
      rows += _summaryRow(employeeLabel(emp), buckets, false, contract)
      _aggregateBuckets(grandTotals, buckets)
      totalContract += contract
    })
    html += `<div style="margin-bottom:18px">
      <div style="font-weight:600;font-size:13px;color:#374151;margin-bottom:4px">Εβδ. ${label}</div>
      <table style="border-collapse:collapse;border:1px solid #d1d5db;font-family:inherit">
        ${_summaryTableHead()}<tbody>${rows}${_summaryRow('Σύνολο', grandTotals, true, Math.round(totalContract * 100) / 100)}</tbody></table></div>`
  })
  return html || '<p style="color:#9ca3af;font-size:13px">Δεν βρέθηκαν δεδομένα.</p>'
}

// ─── Card summary rendering ─────────────────────────────────────────────

const _thCardBg = 'background:#b45309'

function _cardSummaryTableHead() {
  const catLabels = ['Εντός', 'Πρόσθετη', 'Υπερεργασία', 'Υπερωρίες', 'Παράνομες']
  const dayLabels = ['Εργ.', 'Αργία', 'Κυρ.']

  let r1 = `<th rowspan="3" style="${_thS};${_thCardBg};text-align:left;min-width:100px;position:sticky;left:0;z-index:2">Εργαζόμενος</th>`
  r1 += `<th rowspan="3" style="${_thS};${_thCardBg};min-width:34px" title="Συμβατικές ώρες">Σύμβ.</th>`
  r1 += `<th rowspan="3" style="${_thS};${_thCardBg};min-width:34px" title="Σύνολο ωρών">Σύν.</th>`
  let r2 = '',
    r3 = ''
  catLabels.forEach((c) => {
    r1 += `<th colspan="6" style="${_thS};${_thCardBg}">${c}</th>`
    dayLabels.forEach((d) => {
      r2 += `<th colspan="2" style="${_thS};${_thCardBg}">${d}</th>`
      r3 += `<th style="${_thS};${_thCardBg}">Ημ.</th><th style="${_thS};${_thCardBg}">Νυχ.</th>`
    })
  })
  return `<thead><tr>${r1}</tr><tr>${r2}</tr><tr>${r3}</tr></thead>`
}

function _allCardEmployees() {
  const byVat = new Map()
  data.employees.forEach((e) => byVat.set(String(e.vat), e))
  cardVirtualEmployees.forEach((e) => {
    if (!byVat.has(String(e.vat))) byVat.set(String(e.vat), e)
  })
  return [...byVat.values()]
}

function _renderMonthCardSummary(monthVal) {
  const [year, month] = monthVal.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)

  const weekStarts = []
  const seen = new Set()
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const mon = getMonday(new Date(d))
    const key = formatDate(mon)
    if (!seen.has(key)) {
      seen.add(key)
      weekStarts.push(mon)
    }
  }

  const allEmps = _allCardEmployees()
  if (!allEmps.length) return '<p style="color:#9ca3af;font-size:13px">Δεν υπάρχουν εργαζόμενοι.</p>'

  const grandTotals = _emptyBuckets()
  let totalContract = 0
  let rows = ''
  allEmps.forEach((emp) => {
    const empBuckets = _emptyBuckets()
    let empContract = 0
    weekStarts.forEach((ws) => {
      const { buckets, contract } = _monthWeekCardBuckets(emp.vat, ws, firstDay, lastDay)
      _aggregateBuckets(empBuckets, buckets)
      empContract += contract
    })
    empContract = Math.round(empContract * 100) / 100
    rows += _summaryRow(employeeLabel(emp), empBuckets, false, empContract)
    _aggregateBuckets(grandTotals, empBuckets)
    totalContract += empContract
  })
  return `<table style="border-collapse:collapse;border:1px solid #d1d5db;font-family:inherit">
    ${_cardSummaryTableHead()}<tbody>${rows}${_summaryRow('Σύνολο', grandTotals, true, Math.round(totalContract * 100) / 100)}</tbody></table>`
}

function _renderWeekCardSummary(monthVal) {
  const [year, month] = monthVal.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)

  const weekStarts = []
  const seen = new Set()
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const mon = getMonday(new Date(d))
    const key = formatDate(mon)
    if (!seen.has(key)) {
      seen.add(key)
      weekStarts.push(mon)
    }
  }

  const allEmps = _allCardEmployees()
  if (!allEmps.length) return '<p style="color:#9ca3af;font-size:13px">Δεν υπάρχουν εργαζόμενοι.</p>'

  let html = ''
  weekStarts.forEach((ws) => {
    const wEnd = new Date(ws)
    wEnd.setDate(wEnd.getDate() + 6)
    const rangeStart = ws < firstDay ? firstDay : ws
    const rangeEnd = wEnd > lastDay ? lastDay : wEnd
    const label = `${formatDate(rangeStart).slice(5)} — ${formatDate(rangeEnd).slice(5)}`
    const grandTotals = _emptyBuckets()
    let totalContract = 0
    let rows = ''
    allEmps.forEach((emp) => {
      const { buckets, contract } = _monthWeekCardBuckets(emp.vat, ws, firstDay, lastDay)
      rows += _summaryRow(employeeLabel(emp), buckets, false, contract)
      _aggregateBuckets(grandTotals, buckets)
      totalContract += contract
    })
    html += `<div style="margin-bottom:18px">
      <div style="font-weight:600;font-size:13px;color:#92400e;margin-bottom:4px">Κάρτα Εβδ. ${label}</div>
      <table style="border-collapse:collapse;border:1px solid #d1d5db;font-family:inherit">
        ${_cardSummaryTableHead()}<tbody>${rows}${_summaryRow('Σύνολο', grandTotals, true, Math.round(totalContract * 100) / 100)}</tbody></table></div>`
  })
  return html || '<p style="color:#9ca3af;font-size:13px">Δεν βρέθηκαν δεδομένα κάρτας.</p>'
}

// ─── Patch resetAllData to also reset viewStart ───────────────────────────
// Use window assignment (not function declaration) to avoid hoisting issue.
const _origResetAllData = typeof resetAllData === 'function' ? resetAllData : null
window.resetAllData = async function () {
  if (_origResetAllData) await _origResetAllData()
  viewStart = getMonday(new Date())
  currentWeekStart = new Date(viewStart)
  renderGrid()
}
