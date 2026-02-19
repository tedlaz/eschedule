function mergeImportedState(baseState, incomingState) {
  const base = normalizeLoadedState(baseState || {})
  const incoming = normalizeLoadedState(incomingState || {})

  const byVat = new Map()
  ;(base.employees || []).forEach((e) => byVat.set(String(e.vat), { ...e }))
  ;(incoming.employees || []).forEach((e) => byVat.set(String(e.vat), { ...e }))

  return {
    ...base,
    companyName: incoming.companyName || base.companyName || '',
    customHolidayNames: { ...(base.customHolidayNames || {}), ...(incoming.customHolidayNames || {}) },
    employees: [...byVat.values()].sort((a, b) => String(a.vat).localeCompare(String(b.vat))),
    defaultBusinessHours: incoming.defaultBusinessHours || base.defaultBusinessHours,
    defaultEmployeeSettings: incoming.defaultEmployeeSettings || base.defaultEmployeeSettings,
    payrollRules: incoming.payrollRules || base.payrollRules,
    weekBusinessHours: { ...(base.weekBusinessHours || {}), ...(incoming.weekBusinessHours || {}) },
    weekHolidays: { ...(base.weekHolidays || {}), ...(incoming.weekHolidays || {}) },
    weekRestDays: {},
    weekEmployeeSettings: {},
    shifts: { ...(base.shifts || {}), ...(incoming.shifts || {}) },
  }
}

function importSchedule() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.multiple = true
  input.onchange = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const appendMode = confirm(
      'Append mode? OK = append/merge with existing data, Cancel = replace with imported data.',
    )

    try {
      let nextData = appendMode ? normalizeLoadedState(data) : normalizeLoadedState({})

      for (const file of files) {
        const raw = await file.text()
        const parsed = JSON.parse(raw)
        nextData = appendMode ? mergeImportedState(nextData, parsed) : normalizeLoadedState(parsed)
      }

      data = nextData
      await clearPersistedState()
      await saveData()
      renderAll()
      alert(appendMode ? 'Data appended successfully!' : 'Schedule imported successfully!')
    } catch (err) {
      console.error(err)
      alert('Error importing file(s). Please ensure all are valid JSON files.')
    }
  }
  input.click()
}

// Multi-cell selection handlers
