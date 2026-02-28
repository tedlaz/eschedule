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
  input.accept = '.json,.xlsx,.xls'
  input.multiple = true
  input.onchange = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const hasXlsx = files.some((f) => {
      const n = f.name.toLowerCase()
      return n.endsWith('.xlsx') || n.endsWith('.xls')
    })

    if (hasXlsx) {
      try {
        for (const file of files) {
          const n = file.name.toLowerCase()
          if (n.endsWith('.xlsx') || n.endsWith('.xls')) {
            await importXlsxScheduleFile(file)
          }
        }
      } catch (err) {
        console.error(err)
        alert('Σφάλμα εισαγωγής XLSX: ' + err.message)
      }
      return
    }

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

async function importXlsxScheduleFile(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
  if (!rows.length) throw new Error('Το αρχείο είναι κενό.')

  // Map column names (case-insensitive, trimmed)
  const colMap = (row) => {
    const norm = {}
    Object.keys(row).forEach((k) => {
      norm[k.trim().toLowerCase()] = row[k]
    })
    return norm
  }

  const vatAliases = ['αφμ', 'afm', 'vat', 'α.φ.μ.']
  const nameAliases = ['όνομα', 'ονομα', 'firstname', 'first_name', 'name']
  const surnameAliases = ['επώνυμο', 'επωνυμο', 'surname', 'lastname', 'last_name']
  const dateAliases = ['ημ/νια', 'ημ/νία', 'ημερομηνια', 'ημερομηνία', 'date', 'day']
  const occupAliases = ['απασχόληση', 'απασχοληση', 'occupation', 'shift', 'τύπος', 'τυπος']

  const findCol = (normRow, aliases) => {
    for (const a of aliases) {
      if (a in normRow) return normRow[a]
    }
    return undefined
  }

  // Parse rows into shifts and employee info
  const employeeMap = new Map() // vat -> {nickName, vat}
  const shiftMap = {} // key: vat_YYYY-MM-DD -> shift object

  const workRe = /(?:ΕΡΓΑΣΙΑ|ΕΡΓΑΣΊΑ|ΕΡΓ|WORK)\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/i
  const restRe = /ΑΝΑΠΑΥΣΗ|ΡΕΠΟ|REST|ΑΝ[\s/]|^ΑΝ$/i

  for (const raw of rows) {
    const r = colMap(raw)
    const vat = String(findCol(r, vatAliases) ?? '').trim()
    if (!vat) continue

    const firstName = String(findCol(r, nameAliases) ?? '').trim()
    const surname = String(findCol(r, surnameAliases) ?? '').trim()
    const dateRaw = String(findCol(r, dateAliases) ?? '').trim()
    const occup = String(findCol(r, occupAliases) ?? '').trim()

    if (!dateRaw || !occup) continue

    // Normalize date
    const dateStr = normalizeCardDate(dateRaw)
    if (!dateStr || dateStr.length < 8) continue

    // Store employee info
    if (!employeeMap.has(vat)) {
      const nick = surname && firstName ? `${surname} ${firstName}` : surname || firstName || vat
      employeeMap.set(vat, { vat, nickName: nick })
    }

    // Parse occupation
    const shiftKey = `${vat}_${dateStr}`
    const workMatch = occup.match(workRe)
    if (workMatch) {
      shiftMap[shiftKey] = {
        type: 'ΕΡΓ',
        start: workMatch[1].padStart(5, '0'),
        end: workMatch[2].padStart(5, '0'),
      }
    } else if (restRe.test(occup)) {
      shiftMap[shiftKey] = { type: 'AN' }
    }
    // Unknown occupation types are silently skipped
  }

  if (!employeeMap.size) throw new Error('Δεν βρέθηκαν εγγραφές με ΑΦΜ στο αρχείο.')

  // Build incoming state with monthly employee defaults
  const incomingEmployees = [...employeeMap.values()].map((e) => ({
    vat: e.vat,
    nickName: e.nickName,
    payType: 'monthly',
    monthlySalary: 0,
    hourlyRate: 0,
    triennia: 0,
    weekWorkingHours: 40,
    weekWorkingDays: 5,
    defaultRestDays: [5, 6],
  }))

  const incomingState = {
    employees: incomingEmployees,
    shifts: shiftMap,
  }

  // Merge into existing data
  data = mergeImportedState(data, incomingState)
  await clearPersistedState()
  await saveData()

  // Navigate to the first week in the imported data
  const dates = Object.keys(shiftMap)
    .map((k) => k.split('_')[1])
    .filter(Boolean)
    .sort()
  if (dates.length) {
    currentWeekStart = getMonday(new Date(dates[0]))
  }
  renderAll()

  const empCount = employeeMap.size
  const shiftCount = Object.keys(shiftMap).length
  alert(`Εισαγωγή ολοκληρώθηκε: ${empCount} εργαζόμενοι, ${shiftCount} βάρδιες.`)
}

// Multi-cell selection handlers
