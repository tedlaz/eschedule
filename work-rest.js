function openWorkRestModal() {
  // Set title with week date range
  const weekEnd = new Date(currentWeekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const startStr = currentWeekStart.toLocaleDateString('el-GR')
  const endStr = weekEnd.toLocaleDateString('el-GR')
  document.getElementById('workRestTitle').textContent =
    `📊 Διαστήματα Εργασίας/Ανάπαυσης (${startStr} - ${endStr})`

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

