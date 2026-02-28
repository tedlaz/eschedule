function roundToHalfHour(timeStr) {
  const m = String(timeStr || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return timeStr
  let h = Number(m[1])
  let min = Number(m[2])
  const remainder = min % 30
  if (remainder < 15) {
    min = min - remainder
  } else {
    min = min - remainder + 30
  }
  if (min >= 60) {
    min = 0
    h++
  }
  if (h >= 24) h = 0
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0')
}

function openCardDiffModal() {
  document.getElementById('cardDiffReport').innerHTML = ''
  document.getElementById('cardDiffModal').classList.add('active')
}

async function readCardFileRows(file) {
  const name = String(file.name || '').toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ';' })
    return parseCardFile(csv)
  }
  const text = await file.text()
  return parseCardFile(text)
}

function parseCardFile(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
  if (!lines.length) return []

  // Plain machine format fallback:
  // <VAT> <YYYY-MM-DD> <HH:MM-HH:MM>
  const plainRe = /^(\S+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/
  if (plainRe.test(lines[0])) {
    return lines
      .map((ln) => {
        const m = ln.match(plainRe)
        if (!m) return null
        return { employee: m[1], date: m[2], in: m[3], out: m[4], surname: '', firstName: '' }
      })
      .filter(Boolean)
  }

  const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ','
  const headers = lines[0].split(delimiter).map((h) => h.trim().toLowerCase())
  const idx = {
    employee: headers.findIndex((h) =>
      [
        'employee',
        'name',
        'employee_name',
        'εργαζόμενος',
        'ονομα',
        'nick',
        'nickname',
        'vat',
        'afm',
        'αφμ',
        'επώνυμο',
        'επωνυμο',
      ].includes(h),
    ),
    date: headers.findIndex((h) =>
      ['date', 'day', 'ημερομηνια', 'ημ/νια', 'ημ/νία', 'ημερομηνία'].includes(h),
    ),
    in: headers.findIndex((h) =>
      ['in', 'checkin', 'clockin', 'εισοδος', 'είσοδος', 'start', 'από', 'απο', 'αρχή', 'αρχη'].includes(h),
    ),
    out: headers.findIndex((h) =>
      [
        'out',
        'checkout',
        'clockout',
        'εξοδος',
        'έξοδος',
        'end',
        'έως',
        'εως',
        'τέλος',
        'τελος',
        'λήξη',
      ].includes(h),
    ),
  }
  if (idx.employee < 0 || idx.date < 0 || idx.in < 0 || idx.out < 0) {
    throw new Error(
      'Missing columns. Need employee/date/in/out or plain format: <VAT> <YYYY-MM-DD> <HH:MM-HH:MM>',
    )
  }

  const surnameIdx = headers.findIndex(
    (h, i) => i !== idx.employee && ['επώνυμο', 'επωνυμο', 'surname', 'lastname', 'last_name'].includes(h),
  )
  const firstNameIdx = headers.findIndex(
    (h, i) => i !== idx.employee && ['όνομα', 'ονομα', 'firstname', 'first_name'].includes(h),
  )

  return lines.slice(1).map((ln) => {
    const c = ln.split(delimiter).map((x) => x.trim())
    return {
      employee: c[idx.employee] || '',
      date: c[idx.date] || '',
      in: c[idx.in] || '',
      out: c[idx.out] || '',
      surname: surnameIdx >= 0 ? c[surnameIdx] || '' : '',
      firstName: firstNameIdx >= 0 ? c[firstNameIdx] || '' : '',
    }
  })
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
  if (shift.start && shift.end)
    candidates.push({ in: shift.start, out: shift.end, label: `${shift.start}-${shift.end}` })
  if (shift.start2 && shift.end2)
    candidates.push({ in: shift.start2, out: shift.end2, label: `${shift.start2}-${shift.end2}` })
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
  if (shift.start && shift.end)
    candidates.push({ in: shift.start, out: shift.end, label: `${shift.start}-${shift.end}`, idx: 1 })
  if (shift.start2 && shift.end2)
    candidates.push({ in: shift.start2, out: shift.end2, label: `${shift.start2}-${shift.end2}`, idx: 2 })

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

  let rows
  try {
    rows = await readCardFileRows(f)
  } catch (err) {
    console.error('Card file read failed', err)
    if (inputEl) inputEl.value = ''
    alert('Δεν μπόρεσα να διαβάσω το αρχείο. Επίλεξε ξανά.')
    return
  }
  if (!rows.length) return alert('Δεν βρέθηκαν γραμμές στο αρχείο κάρτας')

  const employeeByName = Object.fromEntries(
    (data.employees || []).map((e) => [
      String(e.nickName || '')
        .trim()
        .toLowerCase(),
      e,
    ]),
  )
  const employeeByNick = Object.fromEntries(
    (data.employees || []).map((e) => [
      String(e.nickName || '')
        .trim()
        .toLowerCase(),
      e,
    ]),
  )
  const employeeByVat = Object.fromEntries((data.employees || []).map((e) => [String(e.vat || '').trim(), e]))

  const firstDate = normalizeCardDate(rows[0]?.date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDate))
    return alert('Μη έγκυρη ημερομηνία στην πρώτη γραμμή αρχείου κάρτας')
  const monthKey = firstDate.slice(0, 7)
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  const daysInMonth = new Date(year, month, 0).getDate()

  const machineByVatDay = {}
  rows.forEach((r) => {
    const rawEmp = String(r.employee || '').trim()
    const emp =
      employeeByVat[rawEmp] || employeeByNick[rawEmp.toLowerCase()] || employeeByName[rawEmp.toLowerCase()]
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
        if (sh.start && sh.end)
          expectedSegs.push({ in: sh.start, out: sh.end, label: `${sh.start}-${sh.end}` })
        if (sh.start2 && sh.end2)
          expectedSegs.push({ in: sh.start2, out: sh.end2, label: `${sh.start2}-${sh.end2}` })
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
      if (x.type !== 'DIFF')
        return `<tr><td>${x.employee || '-'}</td><td>${x.date || '-'}</td><td colspan="5">${x.note}</td></tr>`
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

function openCardGridModal() {
  document.getElementById('cardGridContainer').innerHTML = ''
  document.getElementById('cardGridModal').classList.add('active')
}

// Stored card entries from last renderCardGrid() call, keyed by vat_date
let _cardGridByKey = {}
let _cardGridEmployees = [] // all employees shown in card grid (existing + virtual)
let _cardGridInjected = null // {saved: {key: shift|undefined}, prevWeekStart, addedEmployees: []}

function cardGridOpenTimeline(weekStartStr, dayIndex) {
  // Clean up any previous injection
  cardGridRestoreShifts()

  const prevWeekStart = new Date(currentWeekStart)
  currentWeekStart = new Date(weekStartStr + 'T00:00:00')
  ensureRestShiftsForWeek(currentWeekStart)

  // Add virtual employees (from card data) temporarily to data.employees
  const existingVats = new Set((data.employees || []).map((e) => e.vat))
  const addedEmployees = _cardGridEmployees.filter((e) => !existingVats.has(e.vat))
  addedEmployees.forEach((e) => data.employees.push(e))

  // Inject card data as shifts for ALL 7 days of the week
  const saved = {}
  const dayMinStart = {} // per day index: earliest shift start hour
  const dayMaxEnd = {} // per day index: latest shift end hour
  for (let d = 0; d < 7; d++) {
    const dayDate = new Date(currentWeekStart)
    dayDate.setDate(dayDate.getDate() + d)
    const dateStr = formatDate(dayDate)

    ;(_cardGridEmployees || []).forEach((emp) => {
      const k = `${emp.vat}_${dateStr}`
      const cardEntries = _cardGridByKey[k]
      if (!cardEntries || cardEntries.length === 0) return
      if (!(k in saved)) saved[k] = data.shifts[k]
      const first = cardEntries[0]
      const shift = { type: 'ΕΡΓ', start: first.in, end: first.out || first.in }
      if (cardEntries.length > 1) {
        shift.start2 = cardEntries[1].in
        shift.end2 = cardEntries[1].out || cardEntries[1].in
      }
      data.shifts[k] = shift

      // Track min/max hours for business hours override
      cardEntries.forEach((ce) => {
        if (ce.in) {
          const h = parseInt(ce.in.split(':')[0])
          dayMinStart[d] = Math.min(dayMinStart[d] ?? 24, h)
        }
        if (ce.out) {
          const h = parseInt(ce.out.split(':')[0]) + (parseInt(ce.out.split(':')[1]) > 0 ? 1 : 0)
          dayMaxEnd[d] = Math.max(dayMaxEnd[d] ?? 0, h)
        }
      })
    })
  }

  // Override business hours for this week to match actual card shift range
  const weekKey = getWeekKey()
  const bh = getBusinessHoursForWeek()
  const savedBH = JSON.parse(JSON.stringify(bh))
  for (let d = 0; d < 7; d++) {
    if (dayMinStart[d] != null && dayMaxEnd[d] != null) {
      const openH = Math.max(0, dayMinStart[d] - 1)
      const closeH = Math.min(23, dayMaxEnd[d])
      bh[d] = {
        open: String(openH).padStart(2, '0') + ':00',
        close: String(closeH).padStart(2, '0') + ':00',
        closed: false,
      }
    }
  }

  _cardGridInjected = { saved, prevWeekStart, addedEmployees, savedBH, weekKey }
  renderAll()
  openTimelineModal(dayIndex)
}

function cardGridRestoreShifts() {
  if (!_cardGridInjected) return
  const { saved, prevWeekStart, addedEmployees, savedBH, weekKey } = _cardGridInjected
  // Restore shifts
  Object.keys(saved).forEach((k) => {
    if (saved[k] === undefined) delete data.shifts[k]
    else data.shifts[k] = saved[k]
  })
  // Restore business hours
  if (savedBH && weekKey && data.weekBusinessHours[weekKey]) {
    data.weekBusinessHours[weekKey] = savedBH
  }
  // Remove virtual employees that were temporarily added
  if (addedEmployees && addedEmployees.length) {
    const removeVats = new Set(addedEmployees.map((e) => e.vat))
    data.employees = (data.employees || []).filter((e) => !removeVats.has(e.vat))
  }
  currentWeekStart = prevWeekStart
  _cardGridInjected = null
  renderAll()
}

function guessEmployeeDailyHours(emp) {
  const weekH = Number(emp.weekWorkingHours || 40)
  const weekD = Number(emp.weekWorkingDays || 5)
  if (weekD > 0) return Math.round((weekH / weekD) * 2) / 2 // round to .5
  return 8
}

function addHoursToTime(timeStr, hours) {
  const m = String(timeStr).match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return timeStr
  let totalMin = Number(m[1]) * 60 + Number(m[2]) + Math.round(hours * 60)
  if (totalMin >= 24 * 60) totalMin = 24 * 60 - 1
  if (totalMin < 0) totalMin = 0
  const h = Math.floor(totalMin / 60)
  const min = totalMin % 60
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0')
}

function subtractHoursFromTime(timeStr, hours) {
  const m = String(timeStr).match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return timeStr
  let totalMin = Number(m[1]) * 60 + Number(m[2]) - Math.round(hours * 60)
  if (totalMin < 0) totalMin = 0
  const h = Math.floor(totalMin / 60)
  const min = totalMin % 60
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0')
}

async function renderCardGrid() {
  const inputEl = document.getElementById('cardGridFileInput')
  const f = inputEl?.files?.[0]
  if (!f) return alert('Επίλεξε αρχείο κάρτας')

  let rows
  try {
    rows = await readCardFileRows(f)
  } catch (err) {
    console.error('Card file read failed', err)
    if (inputEl) inputEl.value = ''
    alert('Δεν μπόρεσα να διαβάσω το αρχείο. Επίλεξε ξανά.')
    return
  }
  if (!rows.length) return alert('Δεν βρέθηκαν γραμμές στο αρχείο κάρτας')

  // Build employee lookup maps
  const employeeByVat = Object.fromEntries((data.employees || []).map((e) => [String(e.vat || '').trim(), e]))
  const employeeByNick = Object.fromEntries(
    (data.employees || []).map((e) => [
      String(e.nickName || '')
        .trim()
        .toLowerCase(),
      e,
    ]),
  )

  // Parse rows into {vat, date, in, out} with rounding
  const entries = []
  const virtualEmployees = {} // keyed by raw identifier
  const maxShiftH = window.MAX_SHIFT_HOURS || 13
  rows.forEach((r) => {
    const rawEmp = String(r.employee || '').trim()
    if (!rawEmp) return
    let emp = employeeByVat[rawEmp] || employeeByNick[rawEmp.toLowerCase()]
    if (!emp) {
      // Create virtual employee from card data
      if (!virtualEmployees[rawEmp]) {
        const surname = String(r.surname || '').trim()
        const firstName = String(r.firstName || '').trim()
        const displayName = [surname, firstName].filter(Boolean).join(' ') || rawEmp
        virtualEmployees[rawEmp] = {
          vat: rawEmp,
          nickName: displayName,
          weekWorkingHours: 40,
          weekWorkingDays: 5,
          defaultRestDays: [5, 6],
          payType: 'hourly',
          hourlyRate: 0,
          _virtual: true,
        }
      }
      emp = virtualEmployees[rawEmp]
    }
    const d = normalizeCardDate(r.date)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return
    const dailyH = guessEmployeeDailyHours(emp)
    let inTime = r.in ? roundToHalfHour(r.in) : ''
    let outTime = r.out ? roundToHalfHour(r.out) : ''
    let guessedIn = false,
      guessedOut = false
    if (inTime && !outTime) {
      outTime = roundToHalfHour(addHoursToTime(inTime, Math.min(dailyH, maxShiftH)))
      guessedOut = true
    } else if (!inTime && outTime) {
      inTime = roundToHalfHour(subtractHoursFromTime(outTime, Math.min(dailyH, maxShiftH)))
      guessedIn = true
    }
    if (!inTime && !outTime) return
    entries.push({ vat: emp.vat, date: d, in: inTime, out: outTime, guessedIn, guessedOut })
  })

  if (!entries.length) return alert('Δεν βρέθηκαν έγκυρες εγγραφές στο αρχείο κάρτας')

  // Group entries by key (vat_date), merging multiple entries per day
  const byKey = {}
  entries.forEach((e) => {
    const k = `${e.vat}_${e.date}`
    if (!byKey[k]) byKey[k] = []
    byKey[k].push(e)
  })

  // Store globally so cardGridOpenTimeline can use it
  _cardGridByKey = byKey

  // Collect all dates and find weeks
  const allDates = [...new Set(entries.map((e) => e.date))].sort()
  const weekStarts = new Set()
  allDates.forEach((d) => {
    const mon = getMonday(new Date(d + 'T00:00:00'))
    weekStarts.add(formatDate(mon))
  })
  const sortedWeeks = [...weekStarts].sort()

  // Show employees from card data + any existing employees with card entries
  const cardVats = new Set(entries.map((e) => e.vat))
  const existingWithCard = (data.employees || []).filter((e) => cardVats.has(e.vat))
  const existingVats = new Set(existingWithCard.map((e) => e.vat))
  const virtuals = Object.values(virtualEmployees).filter((e) => !existingVats.has(e.vat))
  const allEmployees = [...existingWithCard, ...virtuals]

  // Store globally so cardGridOpenTimeline can inject them into timeline
  _cardGridEmployees = allEmployees

  const container = document.getElementById('cardGridContainer')
  let html = ''

  sortedWeeks.forEach((weekStart) => {
    const ws = new Date(weekStart + 'T00:00:00')
    const weekEnd = new Date(ws)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const weekRange = `${formatDisplayDate(ws)} - ${formatDisplayDate(weekEnd)}`

    html += `<h3 style="margin:16px 0 6px; color:#334155;">Εβδομάδα: ${weekRange}</h3>`
    html += '<div class="schedule-container" style="margin-bottom:16px;"><table class="schedule-table">'

    // Header row
    html += '<thead><tr><th>Εργαζόμενος</th>'
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(ws)
      dayDate.setDate(dayDate.getDate() + i)
      const isSunday = i === 6
      const dateStr = formatDate(dayDate)
      const isHoliday = typeof getHolidayName === 'function' && !!getHolidayName(dateStr)
      let thClass = ''
      if (isHoliday) thClass = 'holiday-header'
      else if (isSunday) thClass = 'sunday-header'
      html += `<th class="${thClass} clickable" onclick="cardGridOpenTimeline('${weekStart}',${i})">${DAY_ABBREV[i]}<br><small>${dayDate.getDate()}</small>`
      if (isHoliday) html += `<div class="holiday-name">${getHolidayName(dateStr)}</div>`
      html += '</th>'
    }
    html += '</tr></thead><tbody>'

    // Employee rows
    allEmployees.forEach((emp) => {
      let weekHours = 0
      html += `<tr class="employee-row"><td class="employee-name">${employeeLabel(emp)}</td>`

      for (let i = 0; i < 7; i++) {
        const dayDate = new Date(ws)
        dayDate.setDate(dayDate.getDate() + i)
        const dateStr = formatDate(dayDate)
        const k = `${emp.vat}_${dateStr}`
        const dayEntries = byKey[k] || []
        const isSunday = i === 6
        const isHoliday = typeof getHolidayName === 'function' && !!getHolidayName(dateStr)

        let cellClass = 'shift-cell'
        if (isHoliday || isSunday) cellClass += ' holiday-day'

        html += `<td class="${cellClass}">`
        if (dayEntries.length > 0) {
          const parts = dayEntries.map((e) => {
            const warnStyle = 'style="color:white;font-size:1.2em;font-weight:bold;vertical-align:middle;"'
            const inMark = e.guessedIn ? `<span ${warnStyle}>&gt;</span>` : ''
            const outMark = e.guessedOut ? `<span ${warnStyle}>&gt;</span>` : ''
            const timeText = `${inMark}${e.in} - ${e.out}${outMark}`
            const h = shiftHours(e.in, e.out)
            weekHours += h
            return timeText
          })
          const hasGuessed = dayEntries.some((e) => e.guessedIn || e.guessedOut)
          const allText = parts.join(' / ')
          const guessTitle = hasGuessed ? ' title="> = εκτίμηση (έλειπε από το αρχείο)"' : ''
          const guessClass = hasGuessed ? ' card-guessed' : ''
          html += `<div class="shift-block${isHoliday || isSunday ? ' shift-holiday' : ''}${guessClass}"${guessTitle}><span class="shift-time">${allText}</span></div>`
        }
        html += '</td>'
      }

      html += '</tr>'
    })

    if (!allEmployees.length) {
      html +=
        '<tr><td colspan="8" style="text-align:center; padding:20px; color:#999;">Δεν υπάρχουν εργαζόμενοι.</td></tr>'
    }

    html += '</tbody></table></div>'
  })

  container.innerHTML = html
}
