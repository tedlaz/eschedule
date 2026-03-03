function handleCellClick(event, employeeId, dateStr) {
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
        openShiftModal(employeeId, dateStr)
      }
    } else {
      // No selection - standard behavior
      openShiftModal(employeeId, dateStr)
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
  renderGrid()
}

function clearSelection() {
  selectedCells = []
  updateSelectionUI()
  renderGrid()
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
      <span class="selection-count">${selectedCells.length} κελί${selectedCells.length > 1 ? 'α' : ''} επιλεγμένα</span>
      <button class="btn-primary" onclick="openShiftModalForSelection()">✏️ Επεξεργασία επιλεγμένων</button>
      <button class="btn-secondary" onclick="clearSelection()">✕ Εκκαθάριση</button>
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
  modalTitle.textContent = `Επεξεργασία ${selectedCells.length} βαρδιών`

  // Set default values
  document.getElementById('shiftType').value = 'ΕΡΓ'
  document.getElementById('shiftStart').value = '09:00'
  document.getElementById('shiftEnd').value = '17:00'
  document.getElementById('hasSecondShift').checked = false
  const t2 = document.getElementById('shiftType2')
  if (t2) t2.value = 'ΕΡΓ'
  document.getElementById('shiftStart2').value = ''
  document.getElementById('shiftEnd2').value = ''
  toggleSecondShiftFields()
  document.getElementById('absenceReason').value = ''

  toggleShiftFields()
  modal.classList.add('active')
}

