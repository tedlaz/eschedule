function openTimelineModal(dayIndex) {
  selectedTimelineDay = dayIndex
  renderTimeline()
  document.getElementById('timelineModal').classList.add('active')
}

function renderTimeline() {
  // Build colored segments for a timeline shift bar
  // Classifies hours by daily thresholds: within / ye / yp / illegal
  function buildTimelineSegments(startH, endH, isHoliday, gridStart, gridCount, employeeId, dateStr) {
    const totalDuration = endH - startH
    if (totalDuration <= 0) return ''

    // Calculate total worked hours for this employee on this day (across all segments)
    const shift = data.shifts[`${employeeId}_${dateStr}`]
    const dailyTotal = shift ? shiftTotalHours(shift) : totalDuration

    // Daily hour thresholds from payroll rules
    const yeThresh = getRule('dailyYeThreshold') || 8
    const ypThresh = getRule('dailyYpThreshold') || 9
    const illegalThresh = getRule('dailyIllegalThreshold') || 11

    // Assign category per 15-min step based on cumulative hours worked
    const colors = window.TIMELINE_COLORS || {}
    const blocks = []
    let h = startH
    const STEP = 0.25

    // Calculate hours already worked before this segment (for split shifts)
    let cumulBefore = 0
    if (shift && shift.start2 && shift.end2) {
      const s1 = parseInt(shift.start.split(':')[0]) + parseInt(shift.start.split(':')[1]) / 60
      let e1 = parseInt(shift.end.split(':')[0]) + parseInt(shift.end.split(':')[1]) / 60
      if (e1 <= s1) e1 += 24
      // If this segment is the second one, count the first segment's hours
      if (Math.abs(startH - s1) > 0.1) cumulBefore = e1 - s1
    }

    let cumul = cumulBefore

    while (h < endH) {
      let category
      if (cumul >= illegalThresh) category = 'illegal'
      else if (cumul >= ypThresh) category = 'yp'
      else if (cumul >= yeThresh) category = 'ye'
      else category = 'within'

      let blockEnd = h + STEP
      cumul += STEP
      while (blockEnd < endH) {
        let nextCat
        if (cumul >= illegalThresh) nextCat = 'illegal'
        else if (cumul >= ypThresh) nextCat = 'yp'
        else if (cumul >= yeThresh) nextCat = 'ye'
        else nextCat = 'within'

        if (nextCat !== category) break
        blockEnd += STEP
        cumul += STEP
      }
      blockEnd = Math.min(blockEnd, endH)

      const leftPct = ((h - startH) / totalDuration) * 100
      const widthPct = ((blockEnd - h) / totalDuration) * 100
      const bgColor = colors[category] || colors.within || 'linear-gradient(135deg, #4caf50, #388e3c)'

      blocks.push(
        `<div class="timeline-segment seg-${category}" style="left:${leftPct}%;width:${widthPct}%;background:${bgColor}"></div>`,
      )
      h = blockEnd
    }

    return blocks.join('')
  }

  const dayDate = new Date(currentWeekStart)
  dayDate.setDate(dayDate.getDate() + selectedTimelineDay)
  const dateStr = formatDate(dayDate)

  // Update modal title
  document.getElementById('timelineModalTitle').textContent =
    `📊 ${DAYS[selectedTimelineDay]}, ${formatDisplayDate(dayDate)} - Εργαζόμενοι`

  // Render day selector
  let selectorHtml = ''
  for (let i = 0; i < 7; i++) {
    const d = new Date(currentWeekStart)
    d.setDate(d.getDate() + i)
    const isActive = i === selectedTimelineDay
    selectorHtml += `<button class="timeline-day-btn ${isActive ? 'active' : ''}"
                      onclick="selectTimelineDay(${i})">
                      ${DAY_ABBREV[i]} ${d.getDate()}
                    </button>`
  }
  document.getElementById('timelineDaySelector').innerHTML = selectorHtml

  // Calculate hour range from actual shifts (default 06:00–22:00)
  let minHour = 6
  let maxHour = 22

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
      <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 18px; height: 12px; background: linear-gradient(135deg, #4caf50, #388e3c); border-radius: 2px;"></div><span>Εντός (≤${getRule('dailyYeThreshold') || 8}ω)</span></div>
      <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 18px; height: 12px; background: linear-gradient(135deg, #ff9800, #f57c00); border-radius: 2px;"></div><span>Υπερεργασία (${getRule('dailyYeThreshold') || 8}–${getRule('dailyYpThreshold') || 9}ω)</span></div>
      <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 18px; height: 12px; background: linear-gradient(135deg, #f44336, #d32f2f); border-radius: 2px;"></div><span>Υπερωρίες (${getRule('dailyYpThreshold') || 9}–${getRule('dailyIllegalThreshold') || 11}ω)</span></div>
      <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 18px; height: 12px; background: linear-gradient(135deg, #c62828, #880e4f); border-radius: 2px;"></div><span>Παράνομη (>${getRule('dailyIllegalThreshold') || 11}ω)</span></div>
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
      const isNightHour = hMod >= 22 || hMod < 6
      let cellClass = isNightHour ? 'night-hour' : 'business-open'
      html += `<div class="timeline-hour-cell ${cellClass}"></div>`
    })

    const intervals = [{ start: shift.start, end: shift.end, slot: 1 }]
    if (shift.start2 && shift.end2) intervals.push({ start: shift.start2, end: shift.end2, slot: 2 })

    intervals.forEach((it) => {
      const startHour = parseInt(it.start.split(':')[0]) + parseInt(it.start.split(':')[1]) / 60
      const endHour = getEffectiveEndHour(it.start, it.end)
      const startOffset = ((startHour - hours[0]) / hours.length) * 100
      const width = ((endHour - startHour) / hours.length) * 100
      const segments = buildTimelineSegments(
        startHour,
        endHour,
        isHolidayOrSun,
        hours[0],
        hours.length,
        emp.vat,
        dateStr,
      )

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
          let countClass = staffCounts[h] === 0 ? 'low' : staffCounts[h] <= 2 ? 'medium' : 'good'
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
        // Validate maximum shift hours
        const maxShiftHours = window.MAX_SHIFT_HOURS || 13
        const duration1 =
          (toMinutes(next.end) -
            toMinutes(next.start) +
            (toMinutes(next.end) < toMinutes(next.start) ? 1440 : 0)) /
          60
        const duration2 =
          (toMinutes(next.end2) -
            toMinutes(next.start2) +
            (toMinutes(next.end2) < toMinutes(next.start2) ? 1440 : 0)) /
          60
        const totalShiftHours = duration1 + duration2
        if (totalShiftHours > maxShiftHours) {
          alert(
            `Οι ώρες βάρδιας δεν μπορούν να υπερβαίνουν τις ${maxShiftHours} ώρες (συνολικά: ${totalShiftHours.toFixed(2)}h)`,
          )
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
      }
    } else {
      // Validate maximum shift hours for single shift
      const maxShiftHours = window.MAX_SHIFT_HOURS || 13
      const duration =
        (toMinutes(next.end) -
          toMinutes(next.start) +
          (toMinutes(next.end) < toMinutes(next.start) ? 1440 : 0)) /
        60
      if (duration > maxShiftHours) {
        alert(
          `Οι ώρες βάρδιας δεν μπορούν να υπερβαίνουν τις ${maxShiftHours} ώρες (συνολικά: ${duration.toFixed(2)}h)`,
        )
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
    }

    renderTimeline()
    renderSchedule()
    // updateSummary()
  }

  dragState = null
  document.removeEventListener('mousemove', handleShiftBarMouseMove)
  document.removeEventListener('mouseup', handleShiftBarMouseUp)
}
