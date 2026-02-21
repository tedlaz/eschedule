currentWeekStart = getMonday(new Date())

document.addEventListener('DOMContentLoaded', async () => {
  populateAdeiesInShiftType()
  await loadData()
  applyPayrollRuleOverrides(data.payrollRules || {})
  ensureRestShiftsForWeek(currentWeekStart)
  await saveData()
  renderAll()

  // extra persistence safety
  window.addEventListener('beforeunload', () => {
    try {
      const payload = JSON.stringify(sanitizeStateForPersist(data))
      localStorage.setItem(STORAGE_KEY, payload)
    } catch {}
  })
  setInterval(() => {
    saveData()
  }, 15000)
})
