function openEmployeeModal(employeeId = null) {
  const modal = document.getElementById('employeeModal')
  const title = document.getElementById('employeeModalTitle')

  if (employeeId) {
    const emp = data.employees.find((e) => String(e.vat) === String(employeeId))
    title.textContent = 'Επεξεργασία Εργαζομένου'
    document.getElementById('editEmployeeId').value = employeeId
    document.getElementById('employeeNick').value = emp.nickName || ''
    document.getElementById('employeeVat').value = emp.vat || ''
    document.getElementById('employeeWeekHours').value = emp.weekWorkingHours || 40
    document.getElementById('employeeWeekDays').value = emp.weekWorkingDays || 5
  } else {
    title.textContent = 'Προσθήκη Εργαζομένου'
    document.getElementById('editEmployeeId').value = ''
    document.getElementById('employeeNick').value = ''
    document.getElementById('employeeVat').value = ''
    document.getElementById('employeeWeekHours').value = 40
    document.getElementById('employeeWeekDays').value = 5
  }

  modal.classList.add('active')
}

function saveEmployee() {
  const vat = document.getElementById('employeeVat').value.trim()
  const nickName = document.getElementById('employeeNick').value.trim()
  const weekWorkingHours = parseFloat(document.getElementById('employeeWeekHours').value) || 40
  const weekWorkingDays = parseInt(document.getElementById('employeeWeekDays').value) || 5
  const editId = document.getElementById('editEmployeeId').value

  if (!nickName) {
    alert('Εισάγετε όνομα εργαζομένου')
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
      migratePrefixed(data.shifts)
      emp.vat = newId
    }
    emp.vat = vat
    emp.nickName = nickName
    emp.weekWorkingHours = weekWorkingHours
    emp.weekWorkingDays = weekWorkingDays
  } else {
    data.employees.push({
      vat,
      nickName,
      weekWorkingHours,
      weekWorkingDays,
    })
  }

  saveData()
  closeModal('employeeModal')
  renderAll()
}

function deleteEmployee(employeeId) {
  if (!confirm('Διαγραφή εργαζομένου;')) return

  data.employees = data.employees.filter((e) => String(e.vat) !== String(employeeId))

  Object.keys(data.shifts).forEach((key) => {
    if (key.startsWith(`${employeeId}_`)) {
      delete data.shifts[key]
    }
  })

  saveData()
  renderAll()
}
