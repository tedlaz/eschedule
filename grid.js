// grid.js — Bar-style grid renderer for the simplified eSchedule UI
// Uses the visual style of workRestModal (horizontal 24h bars per cell)
// with the original grid's colour palette.

// ─── View state ───────────────────────────────────────────────────────────
let viewStart = null // leftmost day shown (any day of week)
let cardData = {} // keyed "vat_YYYY-MM-DD" → {start, end, guessed}
let cardVirtualEmployees = [] // temp employee records from card file
let cardMissingTimeCount = {} // keyed "vat_YYYY-MM" → count of entries with missing in/out time

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
  let html = '<thead><tr><th class="emp-col">Εργαζόμενος</th>'
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
      ${isHoliday || isSunday ? '<div class="premium-badge">+75%</div>' : ''}
    </th>`
  }
  html += '</tr></thead><tbody>'

  // ── Employee rows ──
  if (allEmployees.length === 0) {
    html +=
      '<tr><td colspan="8" class="empty-grid">Δεν υπάρχουν εργαζόμενοι.<br>Κάντε κλικ στο «👥 Εργαζόμενοι» για να προσθέσετε.</td></tr>'
  }

  allEmployees.forEach((emp) => {
    const isVirtual = !!emp._virtual
    const empMonday = getMonday(new Date(viewStart))
    const weekHours = isVirtual ? 0 : calculateWeekHours(emp.vat, empMonday)
    const weekCost = isVirtual
      ? { totalCost: 0, sundayHolidayHours: 0, nightHours: 0 }
      : calculateWeekCost(emp.vat, empMonday)
    const targetHours = isVirtual ? 0 : Number(emp.weekWorkingHours || 40)
    const hoursPercent = targetHours ? Math.min((weekHours / targetHours) * 100, 100) : 0
    const hoursClass = weekHours < targetHours ? 'danger' : weekHours > targetHours ? 'warning' : ''

    const payLabel = isVirtual ? '📋' : emp.payType === 'monthly' ? 'Μ' : emp.payType === 'daily' ? 'Η' : 'Ω'
    const payBg = isVirtual
      ? '#fef3c7'
      : emp.payType === 'monthly'
        ? '#dbeafe'
        : emp.payType === 'daily'
          ? '#d1fae5'
          : '#dcfce7'
    const payColor = isVirtual
      ? '#92400e'
      : emp.payType === 'monthly'
        ? '#1e40af'
        : emp.payType === 'daily'
          ? '#065f46'
          : '#166534'

    html += `<tr class="employee-row">
      <td class="emp-name-cell"
          onclick="${isVirtual ? '' : `openEmployeeModal('${String(emp.vat)}')`}"
          ${isVirtual ? '' : 'style="cursor:pointer"'}>
        <div class="emp-name-row">
          <span class="emp-name">${employeeLabel(emp)}</span>
          <span class="pay-badge" style="background:${payBg};color:${payColor}" title="${emp.payType || ''}">${payLabel}</span>
          ${!isVirtual ? `<span class="del-emp" onclick="event.stopPropagation();deleteEmployee('${String(emp.vat)}')" title="Διαγραφή">×</span>` : ''}
        </div>
        ${
          !isVirtual && targetHours
            ? `
        <div class="week-stats">${weekHours}h / ${targetHours}h
          <span class="week-cost">€${weekCost.totalCost}</span>
        </div>
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
      const isSelected = !isVirtual && selectedCells.some(
        (c) => c.employeeId === String(emp.vat) && c.dateStr === dateStr
      )
      // Card rest gap: only show when < 11h (violation)
      const cardGapRaw = cardEntry ? getGapToPrevCardEntry(emp.vat, dateStr) : null
      const cardGapH = cardGapRaw !== null && cardGapRaw < 11 ? cardGapRaw : null

      html += `<td class="day-cell${isHolSun ? ' holiday-day' : ''}${isSelected ? ' cell-selected' : ''}"
                   data-vat="${emp.vat}"
                   data-date="${dateStr}"
                   onclick="handleDayCellClick(event,'${String(emp.vat)}','${dateStr}')">
        ${renderShiftBar(shift, isHolSun, gapHours, prevGapH)}
        ${cardEntry ? renderCardBar(cardEntry, isIllegalCard, monthMissing, cardGapH) : ''}
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
      const [eh, em] = prev.end.split(':').map(Number)
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

// ─── Bar helpers ─────────────────────────────────────────────────────────
function pct(minutes) {
  return ((minutes / 1440) * 100).toFixed(3) + '%'
}

function minToStr(minutes) {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ─── Schedule bar ─────────────────────────────────────────────────────────
function renderShiftBar(shift, isHolSun, gapHours, prevGapH) {
  const gapLbl = gapHours != null ? `<span class="bar-gap-lbl">${gapHours}</span>` : ''

  if (!shift) {
    return `<div class="bar-wrap"><div class="bar bar-empty">${gapLbl}</div></div>`
  }
  if (isWorkingType(shift)) {
    return _buildWorkBar(shift, isHolSun, prevGapH)
  }
  if (shift.type === 'AN') {
    return `<div class="bar-wrap"><div class="bar bar-rest">${gapLbl || '<span class="bar-lbl">ΡΕΠΟ</span>'}</div></div>`
  }
  if (isNonWorkingType(shift)) {
    return '<div class="bar-wrap"><div class="bar bar-me"><span class="bar-lbl">ΜΕ</span></div></div>'
  }
  // Absence
  const paid = isPaidAbsenceType(shift.type)
  const cls = paid ? 'bar-paid' : 'bar-unpaid'
  return `<div class="bar-wrap"><div class="bar ${cls}"><span class="bar-lbl">${shift.type}</span></div></div>`
}

function _buildWorkBar(shift, isHolSun, prevGapH) {
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
  if (!segs.length) return '<div class="bar-wrap"><div class="bar bar-empty"></div></div>'

  segs.sort((a, b) => a.sm - b.sm)

  let segHtml = ''

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
    const lbl = segH >= 1 ? `<span class="seg-lbl">${Math.round(segH * 10) / 10}</span>` : ''
    segHtml += `<div class="seg ${s.cls}" style="left:${pct(s.sm)};width:${pct(s.em - s.sm)}" title="${s.title}">${lbl}</div>`
  })

  return `<div class="bar-wrap"><div class="bar bar-work">${segHtml}</div></div>`
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

  const hours = (em - sm) / 60
  const hoursLabel = hours >= 1 ? `<span class="seg-lbl">${Math.round(hours * 10) / 10}</span>` : ''
  const guessNote = entry.guessedStart ? ' (εκτ. έναρξη)' : entry.guessedEnd ? ' (εκτ. λήξη)' : ''
  const title = `📋 ${entry.start}–${entry.end}${guessNote}`
  // Illegal entries use red stripes; guessed-but-legal entries flash amber
  const segCls = illegal
    ? 'seg seg-card-illegal'
    : `seg seg-card${entry.guessed ? ' seg-card-flash' : ''}`

  let segHtml = ''
  // Show gap from previous card entry when it's a violation (< 11h)
  if (prevGapH !== null && sm > 0) {
    segHtml += `<div class="seg seg-gap" style="left:0;width:${pct(sm)}" title="από προηγ. κάρτα: ${prevGapH}h"><span class="gap-lbl" style="color:#dc2626">${prevGapH}</span></div>`
  }
  segHtml += `<div class="${segCls}" style="left:${pct(sm)};width:${pct(em - sm)}" title="${title}">${hoursLabel}</div>`

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
  if (name === 'save') {
    const n = Object.keys(cardData).length
    document.getElementById('cardSaveStatus').textContent = n
      ? `${n} εγγραφές έτοιμες για εξαγωγή.`
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
  renderGrid()
  document.getElementById('cardImportStatus').textContent = ''
  document.getElementById('cardClearStatus').textContent = 'Τα δεδομένα κάρτας διαγράφηκαν.'
  _cardTabSwitch('load')
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
            payType: 'hourly',
            hourlyRate: 0,
            weekWorkingHours: 40,
            weekWorkingDays: 5,
            defaultRestDays: [5, 6],
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
        const sm = toMinutes(schedShift.start), emRaw = toMinutes(schedShift.end)
        if (sm != null && emRaw != null) {
          let dur = (emRaw <= sm ? emRaw + 1440 : emRaw) - sm
          if (schedShift.start2 && schedShift.end2) {
            const sm2 = toMinutes(schedShift.start2), em2Raw = toMinutes(schedShift.end2)
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
      cardData[key] = {
        start: inTime,
        end: outTime,
        guessedStart,
        guessedEnd,
        guessed: guessedStart || guessedEnd,
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
      const payLabel =
        emp.payType === 'monthly' ? 'Μηνιαίος' : emp.payType === 'daily' ? 'Ημερήσιος' : 'Ωρομίσθιος'
      return `<div class="emp-list-item">
      <div>
        <strong>${employeeLabel(emp)}</strong>
        <span class="pay-badge" style="margin-left:6px;font-size:11px;padding:2px 6px;border-radius:999px;background:#e0e7ff;color:#3730a3">${payLabel}</span>
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
  document.getElementById('cardEditModal').classList.add('active')
}

function saveCardTimeEdit() {
  if (!_editingCardKey) return
  const inVal = document.getElementById('cardEditIn').value
  const outVal = document.getElementById('cardEditOut').value
  if (!inVal || !outVal) return
  cardData[_editingCardKey] = {
    start: inVal,
    end: outVal,
    guessedStart: false,
    guessedEnd: false,
    guessed: false,
  }
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
    const barBg = entry.guessed
      ? 'repeating-linear-gradient(45deg,#fbbf24,#fbbf24 6px,#d97706 6px,#d97706 12px)'
      : 'linear-gradient(135deg,#fbbf24,#d97706)'
    bar.style.cssText = `left:${leftPct.toFixed(2)}%;width:${Math.max(widthPct, 2).toFixed(2)}%;background:${barBg};cursor:pointer`
    bar.title = `📋 ${entry.start}–${entry.end}${guessNote}${entry.guessed ? ' — σύρετε άκρο για διόρθωση' : ' — κλικ για επεξεργασία'}`
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
    const barBg = entry.guessed
      ? 'repeating-linear-gradient(45deg,#fbbf24,#fbbf24 6px,#d97706 6px,#d97706 12px)'
      : 'linear-gradient(135deg,#fbbf24,#d97706)'
    bar.style.cssText = `left:${leftPct.toFixed(2)}%;width:${Math.max(widthPct, 2).toFixed(2)}%;background:${barBg};cursor:pointer`
    bar.title = `📋 ${entry.start}–${entry.end}${guessNote}${entry.guessed ? ' — σύρετε άκρο για διόρθωση' : ' — κλικ για επεξεργασία'}`
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
    // Keep guessed flags unchanged — the bar stays striped and draggable.
    // Flags are only cleared when the user explicitly saves via the edit modal.
    cardData[cardKey] = {
      start: newStart,
      end: newEnd,
      guessedStart: entry.guessedStart,
      guessedEnd: entry.guessedEnd,
      guessed: entry.guessed,
    }
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
  ;['load', 'save', 'check', 'print'].forEach((t) => {
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
  const minMonthly = (typeof getRule === 'function' && getRule('baseMinMonthlySalary')) || 880
  const minHourly = (typeof getRule === 'function' && getRule('baseMinHourlyRate')) || 5.86

  // Build the date list within range, plus one day before for boundary rest checks
  const rangeDates = []
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) rangeDates.push(formatDate(new Date(d)))

  const prevDay = new Date(from)
  prevDay.setDate(prevDay.getDate() - 1)
  const allDates = [formatDate(prevDay), ...rangeDates]

  data.employees.forEach((emp) => {
    // ── Salary below legal minimum ─────────────────────────────────────
    const tri = 1 + Math.min(emp.triennia || 0, 3) * 0.1
    if (emp.payType === 'monthly') {
      const adjMin = minMonthly * ((emp.weekWorkingHours || 40) / 40) * tri
      if ((emp.monthlySalary || 0) < adjMin - 0.005) {
        violations.push({
          sev: 'warn',
          emp,
          date: null,
          msg: `Μισθός €${(emp.monthlySalary || 0).toFixed(2)} < ελάχιστο €${adjMin.toFixed(2)}`,
        })
      }
    } else if (emp.payType === 'hourly') {
      const adjMin = minHourly * ((emp.weekWorkingHours || 40) / 40) * tri
      if ((emp.hourlyRate || 0) < adjMin - 0.005) {
        violations.push({
          sev: 'warn',
          emp,
          date: null,
          msg: `Ωρομίσθιο €${(emp.hourlyRate || 0).toFixed(2)} < ελάχιστο €${adjMin.toFixed(2)}`,
        })
      }
    }

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
            msg: `Κάρτα χωρίς προγραμματισμένη εργασία (${entry.start}–${entry.end})`,
          })
        }
      })
    }

    // Rule 2: monthly count of entries with missing in/out time (limit: 3)
    const monthKey = `${vat}_${monthVal}`
    const count = cardMissingTimeCount[monthKey] || 0
    if (count > 3) {
      violations.push({
        sev: 'error',
        emp,
        date: monthVal,
        msg: `${count} εγγραφές χωρίς ώρα αυτόν τον μήνα (μέγιστο 3)`,
      })
    } else if (count > 0) {
      violations.push({
        sev: 'warn',
        emp,
        date: monthVal,
        msg: `${count}/3 εγγραφές χωρίς ώρα αυτόν τον μήνα`,
      })
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

// ─── Patch resetAllData to also reset viewStart ───────────────────────────
// Use window assignment (not function declaration) to avoid hoisting issue.
const _origResetAllData = typeof resetAllData === 'function' ? resetAllData : null
window.resetAllData = async function () {
  if (_origResetAllData) await _origResetAllData()
  viewStart = getMonday(new Date())
  currentWeekStart = new Date(viewStart)
  renderGrid()
}
