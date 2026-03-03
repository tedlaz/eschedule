function exportSchedule() {
  const dataStr = JSON.stringify(sanitizeStateForPersist(data), null, 2)
  const blob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `work-schedule-${formatDate(new Date())}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// Work/Rest Intervals Modal
