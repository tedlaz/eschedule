const STORAGE_KEY = 'eschedule_state_v1'
const IDB_NAME = 'eschedule_db'
const IDB_STORE = 'kv'
const IDB_KEY = 'state'

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbSetState(payload) {
  const db = await idbOpen()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(payload, IDB_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function idbGetState() {
  const db = await idbOpen()
  const val = await new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return val
}

async function clearPersistedState() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
  try {
    const db = await idbOpen()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).delete(IDB_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {}
}

async function resetAllData() {
  if (
    !confirm('Να διαγραφούν ΟΛΑ τα δεδομένα (εργαζόμενοι, βάρδιες, αργίες) και να ξεκινήσετε από την αρχή;')
  )
    return
  await clearPersistedState()
  data = normalizeLoadedState({})
  currentWeekStart = getMonday(new Date())
  selectedCells = []
  isMultiSelectMode = false
  const btn = document.getElementById('multiSelectBtn')
  if (btn) {
    btn.classList.remove('btn-active')
    btn.textContent = '☐'
  }
  renderAll()
}

function normalizeShiftKey(rawKey) {
  const m = String(rawKey || '').match(/^(.+?)_(.+)$/)
  if (!m) return String(rawKey || '').trim()
  const vat = String(m[1] || '').trim()
  const day = normalizeCardDate(m[2])
  return `${vat}_${day}`
}

function shiftTypePriority(shift) {
  if (isWorkingType(shift)) return 4
  if (shift && isAbsenceType(shift.type) && isPaidAbsenceType(shift.type)) return 3
  if (shift && isAbsenceType(shift.type)) return 2
  if (
    shift &&
    (String(shift.type).trim() === 'AN' ||
      String(shift.type).trim() === 'ΜΕ' ||
      String(shift.type).trim() === 'ME')
  )
    return 1
  return 0
}

function sanitizeStateForPersist(state) {
  const out = { ...state }

  out.employees = (state.employees || []).map((e) => {
    const base = {
      vat: String(e.vat || '').trim(),
      nickName: String(e.nickName || '').trim(),
      payType: e.payType === 'monthly' ? 'monthly' : 'hourly',
      weekWorkingHours: Number(e.weekWorkingHours || 40),
      weekWorkingDays: Number(e.weekWorkingDays || 5),
      defaultRestDays: Array.isArray(e.defaultRestDays) ? e.defaultRestDays : [5, 6],
    }
    if (base.payType === 'hourly') {
      base.hourlyRate = Number(e.hourlyRate || 0)
    } else {
      base.monthlySalary = Number(e.monthlySalary || 0)
    }
    return base
  })

  const normalizedShiftEntries = []
  const shiftKeyRe = /^(.+?)_(\d{4}-\d{2}-\d{2})$/

  Object.entries(state.shifts || {}).forEach(([k, v]) => {
    const t = String(v?.type || '').trim()
    if (!t) return

    let clean = null
    if (['ΕΡΓ', 'ΤΗΛ'].includes(t)) {
      clean = { type: t, start: String(v.start || '09:00'), end: String(v.end || '17:00') }
      if (v.start2 && v.end2) {
        clean.start2 = String(v.start2)
        clean.end2 = String(v.end2)
        clean.type2 = String(v.type2 || t) === 'ΤΗΛ' ? 'ΤΗΛ' : 'ΕΡΓ'
      }
    } else if (t === 'AN') {
      clean = { type: 'AN' }
    } else if (String(t) === 'ΜΕ' || String(t) === 'ME') {
      clean = { type: 'ΜΕ' }
    } else {
      // Keep any configured/custom absence types (do not drop unknown types)
      clean = v?.reason ? { type: t, reason: String(v.reason) } : { type: t }
    }

    const m = String(k).match(shiftKeyRe)
    const vat = m ? m[1] : ''
    const day = m ? m[2] : ''
    const week = day ? getWeekKeyFromDateStr(day) : ''
    const nk = normalizeShiftKey(k)
    const mk = String(nk).match(/^(.+?)_(\d{4}-\d{2}-\d{2})$/)
    const nvat = mk ? mk[1] : vat
    const nday = mk ? mk[2] : day
    const nweek = nday ? getWeekKeyFromDateStr(nday) : week
    normalizedShiftEntries.push({
      key: nk,
      value: clean,
      vat: nvat,
      day: nday,
      week: nweek,
      isWorking: ['ΕΡΓ', 'ΤΗΛ'].includes(clean.type),
    })
  })

  // Keep only weeks that have at least one working schedule, to keep JSON small
  const activeWeeks = new Set(normalizedShiftEntries.filter((e) => e.isWorking && e.week).map((e) => e.week))

  const cleanShifts = {}
  normalizedShiftEntries
    .filter((e) => e.week && activeWeeks.has(e.week))
    .sort((a, b) => {
      if (a.week !== b.week) return a.week.localeCompare(b.week)
      if (a.day !== b.day) return a.day.localeCompare(b.day)
      if (a.vat !== b.vat) return String(a.vat).localeCompare(String(b.vat))
      return String(a.key).localeCompare(String(b.key))
    })
    .forEach((e) => {
      const existing = cleanShifts[e.key]
      if (!existing || shiftTypePriority(e.value) >= shiftTypePriority(existing)) cleanShifts[e.key] = e.value
    })

  const sortObjectByDateKey = (obj) => {
    const outObj = {}
    Object.keys(obj || {})
      .sort((a, b) => String(a).localeCompare(String(b)))
      .forEach((k) => {
        outObj[k] = obj[k]
      })
    return outObj
  }

  const filterWeekMapToActive = (obj) => {
    const outObj = {}
    Object.keys(obj || {})
      .filter((wk) => activeWeeks.has(String(wk)))
      .sort((a, b) => String(a).localeCompare(String(b)))
      .forEach((wk) => {
        outObj[wk] = obj[wk]
      })
    return outObj
  }

  out.shifts = cleanShifts
  out.weekBusinessHours = filterWeekMapToActive(state.weekBusinessHours || {})
  // Keep weekHolidays for active weeks AND for any week that has at least one holiday
  // (manual or auto-detected), so holidays are not wiped on weeks without working shifts.
  const rawHolidays = state.weekHolidays || {}
  const filteredHolidays = {}
  Object.keys(rawHolidays)
    .sort((a, b) => String(a).localeCompare(String(b)))
    .forEach((wk) => {
      const entries = rawHolidays[wk]
      if (activeWeeks.has(String(wk)) || (Array.isArray(entries) && entries.length > 0)) {
        filteredHolidays[wk] = entries
      }
    })
  out.weekHolidays = filteredHolidays
  // Persist custom holiday names, keeping only entries with a non-empty name
  const rawCustomNames = state.customHolidayNames || {}
  const cleanCustomNames = {}
  Object.keys(rawCustomNames)
    .sort()
    .forEach((k) => {
      const v = String(rawCustomNames[k] || '').trim()
      if (v) cleanCustomNames[k] = v
    })
  out.customHolidayNames = cleanCustomNames
  out.companyName = String(state.companyName || '')
  out.weekRestDays = {}
  out.weekEmployeeSettings = {}
  out.__meta = { savedAt: Date.now() }

  return out
}

async function saveData() {
  try {
    ensureRestShiftsForWeek(currentWeekStart)
    data = sanitizeStateForPersist(data)
    const payload = JSON.stringify(data)
    localStorage.setItem(STORAGE_KEY, payload)
    try {
      await idbSetState(payload)
    } catch {}
  } catch (err) {
    console.error('Failed to save state to localStorage', err)
  }
}

function normalizeLoadedState(loaded) {
  // Normalize shifts to target schema:
  // - working/teleworking => {type,start,end}
  // - rest/holiday/sick/other => {type[,reason]}
  if (loaded.shifts) {
    const normalizedShifts = {}
    Object.entries(loaded.shifts || {}).forEach(([k, v]) => {
      const nk = normalizeShiftKey(k)
      const t = String(v?.type || '').trim()
      if (!t) return

      if (['ΕΡΓ', 'ΤΗΛ'].includes(t)) {
        const cand = {
          type: t,
          start: String(v?.start || '09:00'),
          end: String(v?.end || '17:00'),
        }
        if (v?.start2 && v?.end2) {
          cand.start2 = String(v.start2)
          cand.end2 = String(v.end2)
          cand.type2 = String(v?.type2 || t) === 'ΤΗΛ' ? 'ΤΗΛ' : 'ΕΡΓ'
        }
        if (!normalizedShifts[nk] || shiftTypePriority(cand) >= shiftTypePriority(normalizedShifts[nk]))
          normalizedShifts[nk] = cand
        return
      }

      if (t === 'AN') {
        const cand = { type: 'AN' }
        if (!normalizedShifts[nk] || shiftTypePriority(cand) >= shiftTypePriority(normalizedShifts[nk]))
          normalizedShifts[nk] = cand
        return
      }

      if (String(t) === 'ΜΕ' || String(t) === 'ME') {
        const cand = { type: 'ΜΕ' }
        if (!normalizedShifts[nk] || shiftTypePriority(cand) >= shiftTypePriority(normalizedShifts[nk]))
          normalizedShifts[nk] = cand
        return
      }

      // Keep any configured/custom absence types (do not drop unknown types)
      const r = String(v?.reason || '').trim()
      const cand = r ? { type: t, reason: r } : { type: t }
      if (!normalizedShifts[nk] || shiftTypePriority(cand) >= shiftTypePriority(normalizedShifts[nk]))
        normalizedShifts[nk] = cand
    })
    loaded.shifts = normalizedShifts
  }

  if (loaded.employees) {
    loaded.employees = loaded.employees.map((emp) => ({
      ...emp,
      payType: emp.payType || 'hourly',
      vat: String(emp.vat || '').trim(),
      nickName: String(emp.nickName || '').trim(),
      hourlyRate: Number(emp.hourlyRate ?? 0),
      weekWorkingHours: Number(emp.weekWorkingHours ?? emp.workingHours ?? 40),
      weekWorkingDays: Number(emp.weekWorkingDays ?? 5),
      monthlySalary: Number(emp.monthlySalary ?? 0),
      defaultRestDays: emp.defaultRestDays || emp.restDays || [5, 6],
    }))
  }
  const payrollRules = loaded.payrollRules || {}
  return {
    employees: loaded.employees || [],
    defaultBusinessHours: loaded.defaultBusinessHours
      ? Object.fromEntries(
          Object.entries(loaded.defaultBusinessHours).map(([k, d]) => [
            k,
            { open: String(d?.open || '09:00'), close: String(d?.close || '17:00'), closed: false },
          ]),
        )
      : JSON.parse(JSON.stringify(DEFAULT_BUSINESS_HOURS)),
    defaultEmployeeSettings: loaded.defaultEmployeeSettings
      ? {
          ...loaded.defaultEmployeeSettings,
          workingHours: getWorkingHours(loaded.defaultEmployeeSettings, 40),
        }
      : {
          workingHours: 40,
          restDays: [5, 6],
          hourlyRate: 10,
        },
    payrollRules: {
      absencePolicies: {
        holiday: {
          paid: payrollRules.absencePolicies?.holiday?.paid ?? true,
          multiplier: Number(payrollRules.absencePolicies?.holiday?.multiplier ?? 1),
        },
        sick: {
          paid: payrollRules.absencePolicies?.sick?.paid ?? false,
          multiplier: Number(payrollRules.absencePolicies?.sick?.multiplier ?? 0),
        },
        other: {
          paid: payrollRules.absencePolicies?.other?.paid ?? false,
          multiplier: Number(payrollRules.absencePolicies?.other?.multiplier ?? 0),
        },
      },
      officialHolidayPaidIfAbsent: payrollRules.officialHolidayPaidIfAbsent ?? true,
      officialHolidayPayMultiplier: Number(payrollRules.officialHolidayPayMultiplier ?? 1),
      baseMinMonthlySalary:
        payrollRules.baseMinMonthlySalary != null ? Number(payrollRules.baseMinMonthlySalary) : undefined,
      baseMinHourlyRate:
        payrollRules.baseMinHourlyRate != null ? Number(payrollRules.baseMinHourlyRate) : undefined,
    },
    weekBusinessHours: Object.fromEntries(
      Object.entries(loaded.weekBusinessHours || {}).map(([wk, v]) => [
        wk,
        Object.fromEntries(
          Object.entries(v || {}).map(([k, d]) => [
            k,
            { open: String(d?.open || '09:00'), close: String(d?.close || '17:00'), closed: false },
          ]),
        ),
      ]),
    ),
    weekRestDays: loaded.weekRestDays || {},
    weekEmployeeSettings: loaded.weekEmployeeSettings || {},
    weekHolidays: loaded.weekHolidays || {},
    customHolidayNames: loaded.customHolidayNames || {},
    companyName: String(loaded.companyName || ''),
    shifts: loaded.shifts || {},
  }
}

function pickBestSnapshot(candidates) {
  const parsed = candidates
    .map((raw) => {
      try {
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    })
    .filter(Boolean)
  if (!parsed.length) return {}

  parsed.sort((a, b) => {
    const ta = Number(a?.__meta?.savedAt || 0)
    const tb = Number(b?.__meta?.savedAt || 0)
    if (ta !== tb) return tb - ta
    const sa = Number((a?.employees?.length || 0) + Object.keys(a?.shifts || {}).length)
    const sb = Number((b?.employees?.length || 0) + Object.keys(b?.shifts || {}).length)
    return sb - sa
  })
  return parsed[0]
}

async function loadData() {
  try {
    const localPrimary = localStorage.getItem(STORAGE_KEY)
    const localBackup = null
    let idbRaw = null
    try {
      idbRaw = await idbGetState()
    } catch {}

    const loaded = pickBestSnapshot([localPrimary, idbRaw])
    data = normalizeLoadedState(loaded)

    // Restore user-edited minimum salary/rate into window.PAYROLL_RULES
    if (data.payrollRules?.baseMinMonthlySalary != null) {
      window.PAYROLL_RULES = window.PAYROLL_RULES || {}
      window.PAYROLL_RULES.baseMinMonthlySalary = data.payrollRules.baseMinMonthlySalary
    }
    if (data.payrollRules?.baseMinHourlyRate != null) {
      window.PAYROLL_RULES = window.PAYROLL_RULES || {}
      window.PAYROLL_RULES.baseMinHourlyRate = data.payrollRules.baseMinHourlyRate
    }

    // self-heal all backends with chosen snapshot
    const payload = JSON.stringify(sanitizeStateForPersist(data))
    localStorage.setItem(STORAGE_KEY, payload)
    try {
      await idbSetState(payload)
    } catch {}
  } catch (err) {
    console.error('Failed to load state from storage', err)
    data = normalizeLoadedState({})
  }
}
