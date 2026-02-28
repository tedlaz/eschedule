function getHolidayName(dateStr) {
  const custom = data.customHolidayNames?.[dateStr]
  if (custom) return custom
  if (typeof greekHolidayNameForDate === 'function') return greekHolidayNameForDate(dateStr) || ''
  return ''
}

// Settings Modal — combines Business Hours (week) + Defaults in two tabs
function openSettingsModal(tab) {
  // Build week business hours form
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
    html += `<div style="display:grid; grid-template-columns:88px 82px 1fr 56px 10px 56px; align-items:center; gap:2px 6px; padding:3px 0; border-bottom:1px solid #f0f0f0;">
      <label style="font-size:0.87em; font-weight:600; margin:0;">${day}</label>
      <label style="font-size:0.81em; display:flex; align-items:center; gap:3px; margin:0; cursor:pointer; white-space:nowrap;">
        <input type="checkbox" id="holiday${i}" ${isHoliday ? 'checked' : ''} onchange="toggleHolidayNameInput(${i})"> 🎉 Αργία
      </label>
      <input type="text" id="holidayName${i}" value="${holidayName}" placeholder="Όνομα αργίας" style="font-size:0.81em; display:${isHoliday ? '' : 'none'}; padding:2px 4px; min-width:0;">
      <input type="text" id="bhOpen${i}" value="${bh.open}" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" class="time-input-24h" style="padding:3px; text-align:center; width:100%;">
      <span style="text-align:center; color:#bbb; font-size:0.85em;">—</span>
      <input type="text" id="bhClose${i}" value="${bh.close}" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" class="time-input-24h" style="padding:3px; text-align:center; width:100%;">
    </div>`
  })
  form.innerHTML = html

  // Build defaults form
  const msSalEl = document.getElementById('defBaseMinMonthlySalary')
  const msRateEl = document.getElementById('defBaseMinHourlyRate')
  if (msSalEl) msSalEl.value = Number(getRule('baseMinMonthlySalary')).toFixed(2)
  if (msRateEl) msRateEl.value = Number(getRule('baseMinHourlyRate')).toFixed(2)

  const defForm = document.getElementById('defaultBusinessHoursForm')
  let defHtml = ''
  DAYS.forEach((day, i) => {
    const bh = data.defaultBusinessHours[i]
    defHtml += `<div style="display:grid; grid-template-columns:88px 56px 10px 56px; align-items:center; gap:2px 6px; padding:3px 0; border-bottom:1px solid #f0f0f0;">
      <label style="font-size:0.87em; font-weight:600; margin:0;">${day}</label>
      <input type="text" id="defBhOpen${i}" value="${bh.open}" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" class="time-input-24h" style="padding:3px; text-align:center; width:100%;">
      <span style="text-align:center; color:#bbb; font-size:0.85em;">—</span>
      <input type="text" id="defBhClose${i}" value="${bh.close}" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" class="time-input-24h" style="padding:3px; text-align:center; width:100%;">
    </div>`
  })
  defForm.innerHTML = defHtml

  switchSettingsTab(tab || 'week')
  document.getElementById('settingsModal').classList.add('active')
}

function switchSettingsTab(tab) {
  const isWeek = tab === 'week'
  document.getElementById('settingsTabWeek').style.display = isWeek ? '' : 'none'
  document.getElementById('settingsTabDefaults').style.display = isWeek ? 'none' : ''
  const wBtn = document.getElementById('settingsTabBtnWeek')
  wBtn.style.borderBottomColor = isWeek ? '#667eea' : 'transparent'
  wBtn.style.fontWeight = isWeek ? '700' : '400'
  wBtn.style.color = isWeek ? '#667eea' : '#64748b'
  const dBtn = document.getElementById('settingsTabBtnDefaults')
  dBtn.style.borderBottomColor = isWeek ? 'transparent' : '#667eea'
  dBtn.style.fontWeight = isWeek ? '400' : '700'
  dBtn.style.color = isWeek ? '#64748b' : '#667eea'
}

function openBusinessHoursModal() {
  openSettingsModal('week')
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
  closeModal('settingsModal')
  renderAll()
}

// Defaults Modal — now part of combined settings modal
function openDefaultsModal() {
  openSettingsModal('defaults')
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
  window.PAYROLL_RULES.baseMinMonthlySalary = newBaseMonthly
  window.PAYROLL_RULES.baseMinHourlyRate = newBaseHourly
  // Persist all of PAYROLL_RULES (minus derived keys) so applyPayrollRuleOverrides
  // can restore every rule on the next page load.
  const DERIVED_KEYS = new Set(['nightStartMinutes', 'nightEndMinutes'])
  data.payrollRules = {}
  Object.entries(window.PAYROLL_RULES).forEach(([k, v]) => {
    if (!DERIVED_KEYS.has(k)) data.payrollRules[k] = v
  })

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
  closeModal('settingsModal')
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

  // Restore card grid injected shifts when timeline closes
  if (modalId === 'timelineModal' && typeof cardGridRestoreShifts === 'function') {
    cardGridRestoreShifts()
  }
}

// Data persistence (client-side only)
