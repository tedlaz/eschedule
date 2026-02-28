function openCardDiffModal() {
  document.getElementById('cardDiffReport').innerHTML = ''
  document.getElementById('cardDiffModal').classList.add('active')
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
        return { employee: m[1], date: m[2], in: m[3], out: m[4] }
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

  let fileText = ''
  try {
    fileText = await f.text()
  } catch (err) {
    console.error('Card file read failed', err)
    if (inputEl) inputEl.value = ''
    alert(
      'Δεν μπόρεσα να διαβάσω το αρχείο (πιθανό permission/stale reference). Επίλεξε ξανά το αρχείο κάρτας και ξαναδοκίμασε.',
    )
    return
  }

  const rows = parseCardFile(fileText)
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
