function togglePayTypeFields() {
  const payType = document.getElementById('employeePayType')?.value || 'hourly'
  const hourly = document.getElementById('hourlyFields')
  const monthly = document.getElementById('monthlyFields')
  if (!hourly || !monthly) return
  hourly.style.display = payType === 'hourly' ? 'flex' : 'none'
  monthly.style.display = payType === 'monthly' ? 'flex' : 'none'
  updateEmployeeMinHints()
}

function updateEmployeeMinHints() {
  const PR = window.PAYROLL_RULES || {}
  const baseMinMonthly = Number(PR.baseMinMonthlySalary ?? 880)
  const baseMinHourly = Number(PR.baseMinHourlyRate ?? 5.86)
  const triennia = parseInt(document.getElementById('employeeTriennia')?.value || '0') || 0
  const bonus = 1 + triennia * 0.1

  // Hourly hint
  const minHourly = Math.round(baseMinHourly * bonus * 100) / 100
  const hourlyRateVal = parseFloat(document.getElementById('employeeHourlyRate')?.value) || 0
  const hourlyHint = document.getElementById('hourlyRateMinHint')
  if (hourlyHint) {
    const below = hourlyRateVal > 0 && hourlyRateVal < minHourly
    hourlyHint.textContent = `Ελάχιστο: €${minHourly.toFixed(2)}/ώρα`
    hourlyHint.style.color = below ? '#c0392b' : '#888'
    hourlyHint.style.fontWeight = below ? 'bold' : 'normal'
  }

  // Monthly hint (prorated by weekly hours relative to full-time 40 h)
  const weekHours = parseFloat(document.getElementById('employeeMonthlyWeekHours')?.value) || 40
  const minMonthly = Math.round(baseMinMonthly * bonus * (weekHours / 40) * 100) / 100
  const monthlyVal = parseFloat(document.getElementById('employeeMonthlySalary')?.value) || 0
  const monthlyHint = document.getElementById('monthlySalaryMinHint')
  if (monthlyHint) {
    const below = monthlyVal > 0 && monthlyVal < minMonthly
    monthlyHint.textContent = `Ελάχιστο: €${minMonthly.toFixed(2)}/μήνα`
    monthlyHint.style.color = below ? '#c0392b' : '#888'
    monthlyHint.style.fontWeight = below ? 'bold' : 'normal'
  }
}

function openEmployeeModal(employeeId = null) {
  const modal = document.getElementById('employeeModal')
  const title = document.getElementById('employeeModalTitle')

  let checkboxHtml = ''
  DAYS.forEach((day, i) => {
    checkboxHtml += `<div class="checkbox-item">
      <input type="checkbox" id="restDay${i}" value="${i}">
      <label for="restDay${i}">${DAY_ABBREV[i]}</label>
    </div>`
  })
  document.getElementById('restDaysCheckboxes').innerHTML = checkboxHtml

  // Clear all checkboxes first
  for (let i = 0; i < 7; i++) {
    document.getElementById(`restDay${i}`).checked = false
  }

  if (employeeId) {
    const emp = data.employees.find((e) => String(e.vat) === String(employeeId))
    title.textContent = 'Edit Employee'
    document.getElementById('editEmployeeId').value = employeeId
    document.getElementById('employeeNick').value = emp.nickName || ''
    document.getElementById('employeeVat').value = emp.vat || ''
    document.getElementById('employeePayType').value = emp.payType || 'hourly'
    document.getElementById('employeeTriennia').value = String(emp.triennia ?? 0)
    document.getElementById('employeeHourlyRate').value = emp.hourlyRate || 10
    document.getElementById('employeeHourlyWeekHours').value = emp.weekWorkingHours || 40
    document.getElementById('employeeHourlyWeekDays').value = emp.weekWorkingDays || 5
    document.getElementById('employeeMonthlySalary').value = emp.monthlySalary || 0
    document.getElementById('employeeMonthlyWeekHours').value = emp.weekWorkingHours || 40
    document.getElementById('employeeMonthlyWeekDays').value = emp.weekWorkingDays || 5
    emp.defaultRestDays.forEach((d) => {
      document.getElementById(`restDay${d}`).checked = true
    })
  } else {
    const empDefaults = data.defaultEmployeeSettings || {
      workingHours: 40,
      restDays: [5, 6],
      hourlyRate: 10,
    }
    title.textContent = 'Προσθήκη Εργαζομένου'
    document.getElementById('editEmployeeId').value = ''
    document.getElementById('employeeNick').value = ''
    document.getElementById('employeeVat').value = ''
    document.getElementById('employeePayType').value = 'hourly'
    document.getElementById('employeeTriennia').value = '0'
    document.getElementById('employeeHourlyRate').value = empDefaults.hourlyRate || 10
    document.getElementById('employeeHourlyWeekHours').value = 40
    document.getElementById('employeeHourlyWeekDays').value = 5
    document.getElementById('employeeMonthlySalary').value = 0
    document.getElementById('employeeMonthlyWeekHours').value = 40
    document.getElementById('employeeMonthlyWeekDays').value = 5
    empDefaults.restDays.forEach((d) => {
      document.getElementById(`restDay${d}`).checked = true
    })
  }

  togglePayTypeFields()
  modal.classList.add('active')
}

function saveEmployee() {
  const vat = document.getElementById('employeeVat').value.trim()
  const nickName = document.getElementById('employeeNick').value.trim()
  const payType = document.getElementById('employeePayType').value || 'hourly'
  const triennia = Math.min(
    3,
    Math.max(0, parseInt(document.getElementById('employeeTriennia')?.value || '0') || 0),
  )
  const hourlyRate = parseFloat(document.getElementById('employeeHourlyRate').value) || 10
  const hourlyWeekHours = parseFloat(document.getElementById('employeeHourlyWeekHours').value) || 40
  const hourlyWeekDays = parseInt(document.getElementById('employeeHourlyWeekDays').value) || 5
  const monthlySalary = parseFloat(document.getElementById('employeeMonthlySalary').value) || 0
  const monthlyWeekHours = parseFloat(document.getElementById('employeeMonthlyWeekHours').value) || 40
  const monthlyWeekDays = parseInt(document.getElementById('employeeMonthlyWeekDays').value) || 5
  const editId = document.getElementById('editEmployeeId').value

  const restDays = []
  for (let i = 0; i < 7; i++) {
    if (document.getElementById(`restDay${i}`).checked) {
      restDays.push(i)
    }
  }

  if (!nickName) {
    alert('Please enter employee nickname')
    return
  }
  if (!/^\d{9}$/.test(vat)) {
    alert('Το ΑΦΜ πρέπει να έχει ακριβώς 9 ψηφία')
    return
  }
  const duplicateVat = data.employees.find(
    (e) => String(e.vat || '') === vat && String(e.vat) !== String(editId || ''),
  )
  if (duplicateVat) {
    alert('Υπάρχει ήδη εργαζόμενος με αυτό το ΑΦΜ')
    return
  }

  if (restDays.length !== 2) {
    alert('Please select exactly 2 rest days')
    return
  }

  // Validation for monthly employees
  if (payType === 'monthly' && (monthlyWeekDays < 1 || monthlyWeekDays > 6)) {
    alert('Monthly employee working days/week must be between 1 and 6')
    return
  }

  // Validation for hourly employees
  if (payType === 'hourly' && hourlyRate <= 0) {
    alert('Hourly rate must be greater than 0')
    return
  }

  // Minimum salary / rate enforcement (prorated for partial-time)
  const _PR = window.PAYROLL_RULES || {}
  const _baseMinMonthly = Number(_PR.baseMinMonthlySalary ?? 880)
  const _baseMinHourly = Number(_PR.baseMinHourlyRate ?? 5.86)
  const _triBonus = 1 + triennia * 0.1
  if (payType === 'hourly') {
    const _minHourly = Math.round(_baseMinHourly * _triBonus * 100) / 100
    if (hourlyRate < _minHourly) {
      alert(
        `Το ωρομίσθιο €${hourlyRate.toFixed(2)} είναι κάτω από το ελάχιστο επιτρεπτό €${_minHourly.toFixed(2)}/ώρα (βάση €${_baseMinHourly.toFixed(2)} + ${triennia} τριετίες).`,
      )
      return
    }
  } else if (payType === 'monthly') {
    const _weekHrsM = monthlyWeekHours
    const _minMonthly = Math.round(_baseMinMonthly * _triBonus * (_weekHrsM / 40) * 100) / 100
    if (monthlySalary < _minMonthly) {
      alert(
        `Ο μηνιαίος μισθός €${monthlySalary.toFixed(2)} είναι κάτω από το ελάχιστο επιτρεπτό €${_minMonthly.toFixed(2)}/μήνα (βάση €${_baseMinMonthly.toFixed(2)} + ${triennia} τριετίες, αναλογικά ${_weekHrsM}h/εβδ.).`,
      )
      return
    }
  }

  if (editId) {
    const oldId = String(editId)
    const emp = data.employees.find((e) => String(e.vat) === oldId)
    const newId = String(vat)
    if (oldId !== newId) {
      const migratePrefixed = (obj) => {
        Object.keys(obj || {}).forEach((k) => {
          if (k.startsWith(`${oldId}_`)) {
            const nk = `${newId}_${k.slice(oldId.length + 1)}`
            obj[nk] = obj[k]
            delete obj[k]
          }
        })
      }
      const migrateSuffixed = (obj) => {
        Object.keys(obj || {}).forEach((k) => {
          if (k.endsWith(`_${oldId}`)) {
            const nk = `${k.slice(0, -oldId.length)}${newId}`
            obj[nk] = obj[k]
            delete obj[k]
          }
        })
      }
      migratePrefixed(data.shifts)
      migrateSuffixed(data.weekRestDays)
      migrateSuffixed(data.weekEmployeeSettings)
      emp.vat = newId
    }
    emp.vat = vat
    emp.nickName = nickName
    emp.payType = payType
    emp.triennia = triennia
    emp.hourlyRate = hourlyRate
    emp.weekWorkingHours = payType === 'monthly' ? monthlyWeekHours : hourlyWeekHours
    emp.weekWorkingDays = payType === 'monthly' ? monthlyWeekDays : hourlyWeekDays
    emp.monthlySalary = monthlySalary
    emp.defaultRestDays = restDays
  } else {
    data.employees.push({
      vat,
      nickName: nickName,
      payType,
      triennia,
      hourlyRate,
      weekWorkingHours: payType === 'monthly' ? monthlyWeekHours : hourlyWeekHours,
      weekWorkingDays: payType === 'monthly' ? monthlyWeekDays : hourlyWeekDays,
      monthlySalary,
      defaultRestDays: restDays,
    })
  }

  saveData()
  closeModal('employeeModal')
  renderAll()
}

function deleteEmployee(employeeId) {
  if (!confirm('Are you sure you want to delete this employee?')) return

  data.employees = data.employees.filter((e) => String(e.vat) !== String(employeeId))

  Object.keys(data.shifts).forEach((key) => {
    if (key.startsWith(`${employeeId}_`)) {
      delete data.shifts[key]
    }
  })

  Object.keys(data.weekRestDays).forEach((key) => {
    if (key.endsWith(`_${employeeId}`)) {
      delete data.weekRestDays[key]
    }
  })

  Object.keys(data.weekEmployeeSettings).forEach((key) => {
    if (key.endsWith(`_${employeeId}`)) {
      delete data.weekEmployeeSettings[key]
    }
  })

  saveData()
  renderAll()
}

// Shift Modal
