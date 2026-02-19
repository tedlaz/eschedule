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
      document.getElementById('shiftType2').value = shift.type2 === 'ΤΗΛ' ? 'ΤΗΛ' : 'ΕΡΓ'
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
      if (rest < 11 * 60)
        return {
          ok: false,
          msg: 'Ανάμεσα σε βάρδιες διαφορετικών ημερών απαιτούνται τουλάχιστον 11 ώρες ανάπαυση (προηγούμενη μέρα).',
        }
    }
  }

  const nextDate = plusDaysISO(dateStr, 1)
  const next = data.shifts[`${employeeId}_${nextDate}`]
  if (isWorkingType(next)) {
    const n = shiftIntervalsMinutes(next)
    if (n.length) {
      const nextFirst = n[0].start
      const rest = nextFirst + 24 * 60 - curLast
      if (rest < 11 * 60)
        return {
          ok: false,
          msg: 'Ανάμεσα σε βάρδιες διαφορετικών ημερών απαιτούνται τουλάχιστον 11 ώρες ανάπαυση (επόμενη μέρα).',
        }
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
      const sh = dayStr === pivotDateStr && candidateShift !== null ? candidateShift : data.shifts[key]
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
      return {
        ok: false,
        msg: 'Σε κάθε 7ήμερο πρέπει να υπάρχει τουλάχιστον 24 συνεχόμενες ώρες ξεκούρασης.',
      }
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
    const type2 = document.getElementById('shiftType2')?.value === 'ΤΗΛ' ? 'ΤΗΛ' : 'ΕΡΓ'
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
    if (has2) {
      rec.start2 = start2
      rec.end2 = end2
      rec.type2 = type2
    }
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
    const type2 = document.getElementById('shiftType2')?.value === 'ΤΗΛ' ? 'ΤΗΛ' : 'ΕΡΓ'
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
      if (has2) {
        rec.start2 = start2
        rec.end2 = end2
        rec.type2 = type2
      }
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

