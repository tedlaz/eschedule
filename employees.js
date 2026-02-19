function togglePayTypeFields() {
  const payType = document.getElementById('employeePayType')?.value || 'hourly'
  const hourly = document.getElementById('hourlyFields')
  const monthly = document.getElementById('monthlyFields')
  if (!hourly || !monthly) return
  hourly.style.display = payType === 'hourly' ? 'flex' : 'none'
  monthly.style.display = payType === 'monthly' ? 'flex' : 'none'
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
    document.getElementById('employeeNick').value = emp.nickName || ''
    document.getElementById('employeePayType').value = emp.payType || 'hourly'
    document.getElementById('employeeMinHours').value = getWorkingHours(emp, 40)
    document.getElementById('employeeMaxHours').value = getWorkingHours(emp, 40)
    document.getElementById('employeeHourlyRate').value = emp.hourlyRate || 10
    document.getElementById('employeeMonthlySalary').value = emp.monthlySalary || 1000
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
    document.getElementById('employeeNick').value = ''
    document.getElementById('employeePayType').value = 'hourly'
    document.getElementById('employeeMinHours').value = getWorkingHours(empDefaults, 40)
    document.getElementById('employeeMaxHours').value = getWorkingHours(empDefaults, 40)
    document.getElementById('employeeHourlyRate').value = empDefaults.hourlyRate || 10
    document.getElementById('employeeMonthlySalary').value = 1000
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
  const workingHours = parseInt(document.getElementById('employeeMinHours').value) || 40
  const hourlyRate = parseFloat(document.getElementById('employeeHourlyRate').value) || 10
  const monthlySalary = parseFloat(document.getElementById('employeeMonthlySalary').value) || 0
  const weekWorkingHours = parseFloat(document.getElementById('employeeMonthlyWeekHours').value) || 40
  const weekWorkingDays = parseInt(document.getElementById('employeeMonthlyWeekDays').value) || 5
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

  // single working-hours field: no min/max validation needed
  if (payType === 'monthly' && (weekWorkingDays < 1 || weekWorkingDays > 6)) {
    alert('Monthly employee working days/week must be between 1 and 6')
    return
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
    emp.weekWorkingHours = payType === 'monthly' ? weekWorkingHours : workingHours
    emp.monthlySalary = monthlySalary
    emp.weekWorkingDays = weekWorkingDays
    emp.defaultRestDays = restDays
  } else {
    data.employees.push({
      vat,
      nickName: nickName,
      payType,
      weekWorkingHours: payType === 'monthly' ? weekWorkingHours : workingHours,
      monthlySalary,
      weekWorkingDays,
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
