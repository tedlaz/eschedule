function handleCellClick(event, employeeId, dateStr, isClosed) {
  // Check if Ctrl/Cmd is held or multi-select mode is on
  if (event.ctrlKey || event.metaKey || isMultiSelectMode) {
    toggleCellSelection(employeeId, dateStr)
  } else {
    // Normal click - if cells are selected, open modal for them
    if (selectedCells.length > 0) {
      // Check if clicking on a selected cell
      const isSelected = selectedCells.some((c) => c.employeeId === employeeId && c.dateStr === dateStr)
      if (isSelected) {
        openShiftModalForSelection()
      } else {
        // Clear selection and select just this cell, then open modal
        clearSelection()
        openShiftModal(employeeId, dateStr, isClosed)
      }
    } else {
      // No selection - standard behavior
      openShiftModal(employeeId, dateStr, isClosed)
    }
  }
}

function toggleCellSelection(employeeId, dateStr) {
  const index = selectedCells.findIndex((c) => c.employeeId === employeeId && c.dateStr === dateStr)

  if (index >= 0) {
    // Remove from selection
    selectedCells.splice(index, 1)
  } else {
    // Add to selection
    selectedCells.push({ employeeId, dateStr })
  }

  updateSelectionUI()
  renderSchedule()
}

function clearSelection() {
  selectedCells = []
  updateSelectionUI()
  renderSchedule()
}

function toggleMultiSelectMode() {
  isMultiSelectMode = !isMultiSelectMode
  const btn = document.getElementById('multiSelectBtn')
  if (btn) {
    btn.classList.toggle('btn-active', isMultiSelectMode)
    btn.textContent = isMultiSelectMode ? '✓' : '☐'
  }
  if (!isMultiSelectMode) {
    // Optionally clear selection when exiting mode
    // clearSelection()
  }
}

function updateSelectionUI() {
  const container = document.getElementById('selectionActions')
  if (!container) return

  if (selectedCells.length > 0) {
    container.style.display = 'flex'
    container.innerHTML = `
      <span class="selection-count">${selectedCells.length} cell${selectedCells.length > 1 ? 's' : ''} selected</span>
      <button class="btn-primary" onclick="openShiftModalForSelection()">Edit Selected</button>
      <button class="btn-secondary" onclick="clearSelection()">Clear Selection</button>
    `
  } else {
    container.style.display = 'none'
    container.innerHTML = ''
  }
}

function openShiftModalForSelection() {
  if (selectedCells.length === 0) return

  const modal = document.getElementById('shiftModal')

  // Use first selected cell as reference
  const firstCell = selectedCells[0]
  document.getElementById('shiftEmployeeId').value = 'multi'
  document.getElementById('shiftDate').value = 'multi'

  // Update modal title to indicate multi-edit
  const modalTitle = modal.querySelector('h2')
  modalTitle.textContent = `Edit ${selectedCells.length} Shifts`

  // Set default values
  document.getElementById('shiftType').value = 'working'
  const businessHours = getBusinessHoursForWeek()
  const firstDate = new Date(firstCell.dateStr)
  const dayOfWeek = firstDate.getDay()
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const businessDay = businessHours[dayIndex]
  document.getElementById('shiftStart').value = businessDay.open
  document.getElementById('shiftEnd').value = businessDay.close
  document.getElementById('hasSecondShift').checked = false
  const t2 = document.getElementById('shiftType2')
  if (t2) t2.value = document.getElementById('shiftType').value === 'ΤΗΛ' ? 'ΤΗΛ' : 'ΕΡΓ'
  document.getElementById('shiftStart2').value = ''
  document.getElementById('shiftEnd2').value = ''
  toggleSecondShiftFields()
  document.getElementById('absenceReason').value = ''

  toggleShiftFields()
  modal.classList.add('active')
}

