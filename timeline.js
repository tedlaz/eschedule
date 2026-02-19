function openTimelineModal(dayIndex) {
  const businessHours = getBusinessHoursForWeek()
  selectedTimelineDay = dayIndex
  renderTimeline()
  document.getElementById('timelineModal').classList.add('active')
}

function renderTimeline() {
  // Build colored segments for a timeline shift bar
  function buildTimelineSegments(startH, endH, isHoliday, gridStart, gridCount, employeeId, dateStr) {
    const totalDuration = endH - startH
    if (totalDuration <= 0) return ''

    // Get payroll classification for this employee's shifts
    const weekKey = getWeekKeyFromDateStr(dateStr)
    const classified = classifyWeekSlices(employeeId, weekKey)
      .filter((s) => (s.sourceDay || s.day) === dateStr)
      .sort((a, b) => a.absOrder.localeCompare(b.absOrder))

    // Build map: HH:MM -> category from classified slices
    // absOrder format: YYYY-MM-DDTHH:MM-idx
    const categoryByTime = {}
    classified.forEach((slice) => {
      const [datePart, timeAndIdx] = slice.absOrder.split('T')
      const [timeStr] = timeAndIdx.split('-') // HH:MM
      categoryByTime[timeStr] = slice.category
    })

    // Walk through shift in 15-min steps, grouping consecutive same (category + day/night)
    const blocks = []
    let h = startH
    const STEP = 0.25 // 15 minutes

    while (h < endH) {
      // Get category at this hour
      const hh = Math.floor(h)
      const mm = Math.round((h - hh) * 60)
      const timeKey = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
      let category = categoryByTime[timeKey] || 'within'

      // Check if night
      const isNight = hh % 24 >= 22 || hh % 24 < 6

      // Extend block while category and day/night don't change
      let blockEnd = h + STEP
      while (blockEnd < endH) {
        const nextHh = Math.floor(blockEnd)
        const nextMm = Math.round((blockEnd - nextHh) * 60)
        const nextTimeKey = `${String(nextHh).padStart(2, '0')}:${String(nextMm).padStart(2, '0')}`
        const nextCategory = categoryByTime[nextTimeKey] || 'within'
        const nextIsNight = nextHh % 24 >= 22 || nextHh % 24 < 6

        if (nextCategory !== category || nextIsNight !== isNight) break
        blockEnd += STEP
      }
      blockEnd = Math.min(blockEnd, endH)

      let segClass = `seg-${category}`
      if (isHoliday && isNight) segClass += ' seg-holiday-night'
      else if (isHoliday) segClass += ' seg-holiday'
      else if (isNight) segClass += ' seg-night'

      const leftPct = ((h - startH) / totalDuration) * 100
      const widthPct = ((blockEnd - h) / totalDuration) * 100

      blocks.push(
        `<div class="timeline-segment ${segClass}" style="left:${leftPct}%;width:${widthPct}%"></div>`,
      )
      h = blockEnd
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
    </div>
    <div style="grid-column: 1 / -1; padding: 8px; background: #f5f5f5; font-size: 0.85em; display: flex; gap: 16px; flex-wrap: wrap;">
      <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 18px; height: 12px; background: linear-gradient(135deg, #4caf50, #388e3c); border-radius: 2px;"></div><span>Εντός</span></div>
      <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 18px; height: 12px; background: linear-gradient(135deg, #2196f3, #1976d2); border-radius: 2px;"></div><span>Πρόσθετη</span></div>
      <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 18px; height: 12px; background: linear-gradient(135deg, #ff9800, #f57c00); border-radius: 2px;"></div><span>Υπερεργασία</span></div>
      <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 18px; height: 12px; background: linear-gradient(135deg, #f44336, #d32f2f); border-radius: 2px;"></div><span>Υπερωρίες</span></div>
      <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 18px; height: 12px; background: linear-gradient(135deg, #c62828, #880e4f); border-radius: 2px;"></div><span>Παράνομη</span></div>
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
      const segments = buildTimelineSegments(startHour, endHour, isHolidayOrSun, hours[0], hours.length, emp.vat, dateStr)

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

