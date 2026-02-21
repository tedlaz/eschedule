function getHolidayName(dateStr) {
  const custom = data.customHolidayNames?.[dateStr]
  if (custom) return custom
  if (typeof greekHolidayNameForDate === 'function') return greekHolidayNameForDate(dateStr) || ''
  return ''
}

// Business Hours Modal (per week)
function openBusinessHoursModal() {
  const modal = document.getElementById('businessHoursModal')
  const form = document.getElementById('businessHoursForm')
  const businessHours = getBusinessHoursForWeek()
  const holidays = getHolidaysForWeek()

  let html = ''
  DAYS.forEach((day, i) => {
    const bh = businessHours[i]
    const isHoliday = holidays.includes(i)
    const dayDate = new Date(currentWeekStart)
    dayDate.setDate(dayDate.getDate() + i)
    const dateStr = formatDate(dayDate)
    const holidayName = getHolidayName(dateStr)
    html += `
      <div class="form-group" style="border-bottom: 1px solid #eee; padding-bottom: 15px;">
        <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
          <label style="min-width: 100px; margin-bottom: 0;">${day}</label>
          <div class="checkbox-item">
            <input type="checkbox" id="holiday${i}" ${isHoliday ? 'checked' : ''} onchange="toggleHolidayNameInput(${i})">
            <label for="holiday${i}">Αργία</label>
          </div>
          <input type="text" id="holidayName${i}" value="${holidayName}" placeholder="Όνομα αργίας" style="width:160px; display:${isHoliday ? 'block' : 'none'}">
          <input type="text" id="bhOpen${i}" value="${bh.open}" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" class="time-input-24h">
          <span>to</span>
          <input type="text" id="bhClose${i}" value="${bh.close}" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" class="time-input-24h">
        </div>
      </div>`
  })
  form.innerHTML = html
  modal.classList.add('active')
}

function toggleHolidayNameInput(i) {
  const checked = document.getElementById(`holiday${i}`)?.checked
  const nameEl = document.getElementById(`holidayName${i}`)
  if (nameEl) nameEl.style.display = checked ? 'block' : 'none'
}

function toggleBusinessDay(dayIndex) {
  const isClosed = document.getElementById(`closed${dayIndex}`).checked
  document.getElementById(`bhOpen${dayIndex}`).disabled = isClosed
  document.getElementById(`bhClose${dayIndex}`).disabled = isClosed
}

function copyFromDefaultHours() {
  DAYS.forEach((day, i) => {
    const bh = data.defaultBusinessHours[i]
    document.getElementById(`bhOpen${i}`).value = bh.open
    document.getElementById(`bhClose${i}`).value = bh.close
    document.getElementById(`holiday${i}`).checked = false
  })
}

function saveBusinessHours() {
  const weekKey = getWeekKey()
  const weekHours = {}
  const holidays = []

  let hasError = false
  DAYS.forEach((day, i) => {
    const open = document.getElementById(`bhOpen${i}`).value
    const close = document.getElementById(`bhClose${i}`).value
    const isHoliday = document.getElementById(`holiday${i}`).checked
    const holidayNameRaw = String(document.getElementById(`holidayName${i}`)?.value || '').trim()

    if (!isValidTime24h(open) || !isValidTime24h(close)) {
      hasError = true
    }

    weekHours[i] = { open, close, closed: false }
    if (isHoliday) {
      holidays.push(i)
      const dayDate = new Date(currentWeekStart)
      dayDate.setDate(dayDate.getDate() + i)
      const dateStr = formatDate(dayDate)
      if (holidayNameRaw) {
        if (!data.customHolidayNames) data.customHolidayNames = {}
        data.customHolidayNames[dateStr] = holidayNameRaw
      } else {
        delete data.customHolidayNames?.[dateStr]
      }
    } else {
      // If unchecked, remove any stored custom name for this date
      const dayDate = new Date(currentWeekStart)
      dayDate.setDate(dayDate.getDate() + i)
      const dateStr = formatDate(dayDate)
      delete data.customHolidayNames?.[dateStr]
    }
  })

  if (hasError) {
    alert('Please enter valid times in 24-hour format (HH:MM)')
    return
  }

  data.weekBusinessHours[weekKey] = weekHours
  data.weekHolidays[weekKey] = holidays
  saveData()
  closeModal('businessHoursModal')
  renderAll()
}

// Defaults Modal
function openDefaultsModal() {
  const modal = document.getElementById('defaultsModal')
  const form = document.getElementById('defaultBusinessHoursForm')

  // Populate base minimum salary / rate fields from live PAYROLL_RULES
  const PR = window.PAYROLL_RULES || {}
  const msSalEl = document.getElementById('defBaseMinMonthlySalary')
  const msRateEl = document.getElementById('defBaseMinHourlyRate')
  if (msSalEl) msSalEl.value = Number(PR.baseMinMonthlySalary ?? 880).toFixed(2)
  if (msRateEl) msRateEl.value = Number(PR.baseMinHourlyRate ?? 5.86).toFixed(2)

  // Populate default business hours form
  let html = ''
  DAYS.forEach((day, i) => {
    const bh = data.defaultBusinessHours[i]
    html += `
      <div class="form-group" style="border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 10px;">
        <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
          <label style="min-width: 100px; margin-bottom: 0;">${day}</label>
          <input type="text" id="defBhOpen${i}" value="${bh.open}" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" class="time-input-24h">
          <span>to</span>
          <input type="text" id="defBhClose${i}" value="${bh.close}" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" class="time-input-24h">
        </div>
      </div>`
  })
  form.innerHTML = html

  modal.classList.add('active')
}

function toggleDefaultBusinessDay(dayIndex) {
  const isClosed = document.getElementById(`defClosed${dayIndex}`).checked
  document.getElementById(`defBhOpen${dayIndex}`).disabled = isClosed
  document.getElementById(`defBhClose${dayIndex}`).disabled = isClosed
}

function openEmployeePresetsModal() {
  const modal = document.getElementById('employeePresetsModal')
  const container = document.getElementById('employeePresetsForm')

  if (!data.employees.length) {
    container.innerHTML =
      '<p style="color:#999; text-align:center; padding:16px;">No employees available.</p>'
    modal.classList.add('active')
    return
  }

  container.innerHTML = data.employees
    .map(
      (emp) => `
      <div class="form-group" style="border-bottom:1px solid #eee; padding-bottom:14px; margin-bottom:14px;">
        <label style="font-weight:700;">${employeeLabel(emp)}</label>
        <div class="form-row">
          <div class="form-group">
            <label style="font-size:0.9em; font-weight:normal;">Working Hours/Week</label>
            <input type="number" id="presetMin_${emp.vat}" value="${getWorkingHours(emp, 40)}" min="0" max="80">
          </div>
          <div class="form-group" style="display:none;">
            <label style="font-size:0.9em; font-weight:normal;">Working Hours/Week (legacy hidden)</label>
            <input type="number" id="presetMax_${emp.vat}" value="${getWorkingHours(emp, 40)}" min="0" max="80">
          </div>
          <div class="form-group">
            <label style="font-size:0.9em; font-weight:normal;">€/Ώρα</label>
            <input type="number" id="presetRate_${emp.vat}" value="${emp.hourlyRate || 10}" min="0" step="0.5">
          </div>
        </div>
        <div class="form-group">
          <label style="font-size:0.9em; font-weight:normal;">Default Rest Days (2)</label>
          <div class="checkbox-group">
            ${DAYS.map(
              (day, i) => `
                <div class="checkbox-item">
                  <input type="checkbox" id="presetRest_${emp.vat}_${i}" ${
                    (emp.defaultRestDays || []).includes(i) ? 'checked' : ''
                  }>
                  <label for="presetRest_${emp.vat}_${i}">${DAY_ABBREV[i]}</label>
                </div>
              `,
            ).join('')}
          </div>
        </div>
      </div>
    `,
    )
    .join('')

  modal.classList.add('active')
}

function saveEmployeePresets() {
  for (const emp of data.employees) {
    const workingHours = parseInt(document.getElementById(`presetMin_${emp.vat}`)?.value) || 0
    const hourlyRate = parseFloat(document.getElementById(`presetRate_${emp.vat}`)?.value) || 0

    const restDays = []
    for (let i = 0; i < 7; i++) {
      if (document.getElementById(`presetRest_${emp.vat}_${i}`)?.checked) restDays.push(i)
    }
    if (restDays.length !== 2) {
      alert(`${employeeLabel(emp)}: select exactly 2 default rest days`)
      return
    }

    emp.weekWorkingHours = workingHours
    emp.defaultRestDays = restDays
  }

  saveData()
  closeModal('employeePresetsModal')
  renderAll()
}

function saveDefaults() {
  // Save base minimum salary / hourly rate
  const newBaseMonthly = parseFloat(document.getElementById('defBaseMinMonthlySalary')?.value)
  const newBaseHourly = parseFloat(document.getElementById('defBaseMinHourlyRate')?.value)
  if (isNaN(newBaseMonthly) || newBaseMonthly < 0) {
    alert('Ο ελάχιστος μηνιαίος μισθός πρέπει να είναι θετικός αριθμός.')
    return
  }
  if (isNaN(newBaseHourly) || newBaseHourly < 0) {
    alert('Το ελάχιστο ωρομίσθιο πρέπει να είναι θετικός αριθμός.')
    return
  }
  window.PAYROLL_RULES = window.PAYROLL_RULES || {}
  window.PAYROLL_RULES.baseMinMonthlySalary = newBaseMonthly
  window.PAYROLL_RULES.baseMinHourlyRate = newBaseHourly
  // Persist into data.payrollRules so it survives page reload
  data.payrollRules = data.payrollRules || {}
  data.payrollRules.baseMinMonthlySalary = newBaseMonthly
  data.payrollRules.baseMinHourlyRate = newBaseHourly

  // Save default business hours
  let hasError = false
  DAYS.forEach((day, i) => {
    const open = document.getElementById(`defBhOpen${i}`).value
    const close = document.getElementById(`defBhClose${i}`).value
    const closed = false

    if (!isValidTime24h(open) || !isValidTime24h(close)) {
      hasError = true
    }

    data.defaultBusinessHours[i] = { open, close, closed }
  })

  if (hasError) {
    alert('Please enter valid times in 24-hour format (HH:MM)')
    return
  }

  saveData()
  closeModal('defaultsModal')
  alert('Defaults saved successfully!')
}

// Employee Week Settings Modal
function openEmployeeWeekModal(employeeId) {
  const emp = data.employees.find((e) => String(e.vat) === String(employeeId))
  if (!emp) return

  const modal = document.getElementById('employeeWeekModal')
  const weekEnd = new Date(currentWeekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  document.getElementById('employeeWeekModalTitle').textContent =
    `${employeeLabel(emp)} - Ρυθμίσεις Εβδομάδας`
  document.getElementById('employeeWeekSubtitle').textContent =
    `Ρυθμίσεις για ${formatDisplayDate(currentWeekStart)} - ${formatDisplayDate(weekEnd)}`
  document.getElementById('employeeWeekId').value = employeeId

  // Load current week settings or defaults
  const weekSettings = getEmployeeWeekSettings(employeeId)
  document.getElementById('weekMinHours').value = weekSettings.workingHours
  document.getElementById('weekMaxHours').value = weekSettings.workingHours
  document.getElementById('weekHourlyRate').value = weekSettings.hourlyRate || emp.hourlyRate || 10

  // Load rest days
  const restDays = getRestDaysForEmployee(employeeId)
  const checkboxGroup = document.getElementById('weekRestDaysCheckboxes')
  checkboxGroup.innerHTML = DAYS.map(
    (day, i) => `
    <div class="checkbox-item">
      <input type="checkbox" id="weekRest_${i}" ${restDays.includes(i) ? 'checked' : ''}>
      <label for="weekRest_${i}">${DAY_ABBREV[i]}</label>
    </div>
  `,
  ).join('')

  modal.classList.add('active')
}

function resetEmployeeWeekToDefault() {
  const employeeId = String(document.getElementById('employeeWeekId').value)
  const emp = data.employees.find((e) => String(e.vat) === String(employeeId))
  if (!emp) return

  document.getElementById('weekMinHours').value = getWorkingHours(emp, 40)
  document.getElementById('weekMaxHours').value = getWorkingHours(emp, 40)
  document.getElementById('weekHourlyRate').value = emp.hourlyRate || 10

  DAYS.forEach((day, i) => {
    const checkbox = document.getElementById(`weekRest_${i}`)
    if (checkbox) {
      checkbox.checked = emp.defaultRestDays.includes(i)
    }
  })
}

function saveEmployeeWeekSettings() {
  const employeeId = String(document.getElementById('employeeWeekId').value)
  const weekKey = getWeekKey()
  const key = `${weekKey}_${employeeId}`

  const workingHours = parseInt(document.getElementById('weekMinHours').value) || 40
  const hourlyRate = parseFloat(document.getElementById('weekHourlyRate').value) || 10

  // Get rest days
  const restDays = []
  for (let i = 0; i < 7; i++) {
    const checkbox = document.getElementById(`weekRest_${i}`)
    if (checkbox && checkbox.checked) {
      restDays.push(i)
    }
  }

  if (restDays.length !== 2) {
    alert('Please select exactly 2 rest days')
    return
  }

  // Save week-specific settings
  data.weekEmployeeSettings[key] = { workingHours, hourlyRate }
  data.weekRestDays[key] = restDays

  saveData()
  closeModal('employeeWeekModal')
  renderAll()
}

// Rest Days Modal (per week)
function openRestDaysModal() {
  const modal = document.getElementById('restDaysModal')
  const form = document.getElementById('restDaysForm')

  let html = ''
  data.employees.forEach((emp) => {
    const restDays = getRestDaysForEmployee(emp.vat)
    html += `
      <div class="form-group" style="border-bottom: 1px solid #eee; padding-bottom: 15px;">
        <label style="margin-bottom: 10px;">${employeeLabel(emp)}</label>
        <div class="checkbox-group">
          ${DAYS.map(
            (day, i) => `
            <div class="checkbox-item">
              <input type="checkbox" id="empRest_${emp.vat}_${i}"
                ${restDays.includes(i) ? 'checked' : ''}>
              <label for="empRest_${emp.vat}_${i}">${DAY_ABBREV[i]}</label>
            </div>
          `,
          ).join('')}
        </div>
      </div>`
  })

  if (data.employees.length === 0) {
    html = '<p style="color: #999; text-align: center; padding: 20px;">No employees added yet.</p>'
  }

  form.innerHTML = html
  modal.classList.add('active')
}

function resetRestDaysToDefault() {
  data.employees.forEach((emp) => {
    DAYS.forEach((day, i) => {
      const checkbox = document.getElementById(`empRest_${emp.vat}_${i}`)
      if (checkbox) {
        checkbox.checked = emp.defaultRestDays.includes(i)
      }
    })
  })
}

function saveWeekRestDays() {
  const weekKey = getWeekKey()

  data.employees.forEach((emp) => {
    const restDays = []
    for (let i = 0; i < 7; i++) {
      const checkbox = document.getElementById(`empRest_${emp.vat}_${i}`)
      if (checkbox && checkbox.checked) {
        restDays.push(i)
      }
    }

    if (restDays.length !== 2) {
      alert(`${employeeLabel(emp)} must have exactly 2 rest days`)
      return
    }

    const key = `${weekKey}_${emp.vat}`
    data.weekRestDays[key] = restDays
  })

  saveData()
  closeModal('restDaysModal')
  renderAll()
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active')

  // Reset shift modal title when closing
  if (modalId === 'shiftModal') {
    const modal = document.getElementById('shiftModal')
    const title = modal.querySelector('h2')
    title.textContent = 'Edit Shift'
  }
}

// Data persistence (client-side only)
