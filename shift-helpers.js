function isWorkingType(shift) {
  const t = String(shift?.type || '').trim()
  return t === 'ΕΡΓ' || t === 'ΤΗΛ'
}

function isNonWorkingType(shift) {
  const t = String(shift?.type || '').trim()
  return !!shift && (t === 'ΜΕ' || t === 'ME')
}

function getAdeies() {
  return Array.isArray(window.ADEIES) ? window.ADEIES : []
}

function isAbsenceType(type) {
  const t = String(type || '').trim()
  // ΜΕ is a non-working marker, not a leave/absence type in payroll logic
  if (t === 'ΜΕ' || t === 'ME') return false
  return getAdeies().some((a) => String(a.code || '').trim() === t)
}

function isPaidAbsenceType(type) {
  const t = String(type || '')
  const r = getAdeies().find((a) => a.code === t)
  return !!r?.paid
}

function absenceLabel(type) {
  const t = String(type || '')
  const r = getAdeies().find((a) => a.code === t)
  return r?.name || t
}

function populateAdeiesInShiftType() {
  const sel = document.getElementById('shiftType')
  if (!sel) return
  getAdeies().forEach((a) => {
    if ([...sel.options].some((o) => o.value === a.code)) return
    const opt = document.createElement('option')
    opt.value = a.code
    opt.textContent = `${a.name}${a.paid ? ' (με αποδοχές)' : ' (χωρίς αποδοχές)'}`
    sel.appendChild(opt)
  })
}

function employeeLabel(emp) {
  return (emp?.nickName || '').trim()
}

// Initialize
