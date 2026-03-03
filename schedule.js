function renderAll() {
  renderSchedule()
  renderCompanyName()
}

function renderCompanyName() {
  const el = document.getElementById('companyName')
  if (!el) return
  const name = String(data.companyName || '').trim()
  el.textContent = name || 'Προσθέστε όνομα εταιρείας…'
  el.classList.toggle('company-name-placeholder', !name)
}

function editCompanyName() {
  const el = document.getElementById('companyName')
  if (!el) return
  const current = String(data.companyName || '').trim()
  const input = document.createElement('input')
  input.type = 'text'
  input.value = current
  input.className = 'company-name-input'
  input.placeholder = 'Όνομα εταιρείας'
  input.maxLength = 100
  el.replaceWith(input)
  input.focus()
  input.select()
  const commit = () => {
    data.companyName = input.value.trim()
    saveData()
    const span = document.createElement('span')
    span.id = 'companyName'
    span.className = 'company-name'
    span.onclick = editCompanyName
    input.replaceWith(span)
    renderCompanyName()
  }
  input.addEventListener('blur', commit)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      input.blur()
    }
    if (e.key === 'Escape') {
      input.value = current
      input.blur()
    }
  })
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

  // weekHolidays for the current week are intentionally NOT copied: they are
  // auto-detected per week (Greek national holidays differ week to week).

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

  const holidays = getHolidaysForWeek()
  let html = '<thead><tr><th>Εργαζόμενος</th>'

  // Header with days
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(currentWeekStart)
    dayDate.setDate(dayDate.getDate() + i)
    const isHoliday = holidays.includes(i)
    const isSunday = i === 6

    let thClass = ''
    if (isHoliday) thClass += ' holiday-header'
    else if (isSunday) thClass += ' sunday-header'

    html += `<th class="${thClass} clickable" onclick="openTimelineModal(${i})">
                ${DAY_ABBREV[i]}<br>
                <small>${dayDate.getDate()}</small>
                ${isHoliday ? `<div class="holiday-name">${getHolidayName(formatDate(dayDate))}</div>` : ''}
                ${isHoliday || isSunday ? '<div class="premium-badge">+75%</div>' : ''}
            </th>`
  }
  html += '</tr></thead><tbody>'

  // Employee rows
  data.employees.forEach((emp) => {
    const weekSettings = getEmployeeWeekSettings(emp.vat)
    const weekHours = calculateWeekHours(emp.vat, currentWeekStart)
    const weekCost = calculateWeekCost(emp.vat, currentWeekStart)
    const targetHours =
      emp.payType === 'monthly' ? Number(emp.weekWorkingHours || 40) : Number(weekSettings.workingHours || 40)
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
      const isRestDay = restDays.includes(i)
      const shift = data.shifts[`${emp.vat}_${dateStr}`]
      const isHolidayOrSun = isDayHolidayOrSunday(i)

      let cellClass = 'shift-cell'
      if (isRestDay && !shift) cellClass += ' rest-day'
      if (isHolidayOrSun) cellClass += ' holiday-day'

      const isSelected = selectedCells.some(
        (c) => String(c.employeeId) === String(emp.vat) && c.dateStr === dateStr,
      )
      if (isSelected) cellClass += ' selected-cell'

      html += `<td class="${cellClass}" data-employee-id="${emp.vat}" data-date="${dateStr}" onclick="handleCellClick(event, '${String(emp.vat)}', '${dateStr}')">`

      if (shift) {
        if (isWorkingType(shift)) {
          const premiums = calculateShiftPremiums(shift, i)
          let premiumIndicators = ''
          if (premiums && premiums.isSundayOrHoliday)
            premiumIndicators += '<span class="shift-premium sun">+75%</span>'
          if (premiums && premiums.nightHours > 0)
            premiumIndicators += '<span class="shift-premium night">🌙' + premiums.nightHours + 'h</span>'
          const modeTag = String(shift.type) === 'ΤΗΛ' ? '<span class="telework-badge">ΤΗΛ</span>' : ''
          const second =
            shift.start2 && shift.end2
              ? ` / ${shift.start2}-${shift.end2}${shift.type2 === 'ΤΗΛ' ? '(ΤΗΛ)' : ''}`
              : ''
          const timeText = `${shift.start} - ${shift.end}${second}`
          const totalShiftHours = shiftTotalHours(shift)
          const overworkBadge = totalShiftHours > 8 ? '<span class="overtime-badge">ΥΕ</span>' : ''
          const overtimeBadge = totalShiftHours > 9 ? '<span class="yperoria-badge">ΥΠ</span>' : ''
          const badgesRow =
            modeTag || overworkBadge || overtimeBadge
              ? `<div class="shift-badges">${modeTag}${overworkBadge}${overtimeBadge}</div>`
              : ''
          html += `<div class="shift-block${isHolidayOrSun ? ' shift-holiday' : ''}"><span class="shift-time">${timeText}</span>${badgesRow}${premiumIndicators ? '<div class="premium-indicators">' + premiumIndicators + '</div>' : ''}</div>`
        } else if (String(shift.type) === 'AN') {
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

