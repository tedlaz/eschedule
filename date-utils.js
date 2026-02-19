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

function autoDetectGreekHolidaysForWeek(weekStart) {
  if (typeof greekAllHolidaysForYear !== 'function') return []
  const years = new Set()
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    years.add(d.getFullYear())
  }
  const allHolidays = []
  years.forEach((yr) => allHolidays.push(...greekAllHolidaysForYear(yr)))
  const indices = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    const dStr = formatDate(d)
    if (allHolidays.some((h) => formatDate(h) === dStr)) indices.push(i)
  }
  return indices
}

function getHolidaysForWeek() {
  const weekKey = getWeekKey()
  if (!data.weekHolidays[weekKey]) {
    data.weekHolidays[weekKey] = autoDetectGreekHolidaysForWeek(currentWeekStart)
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

