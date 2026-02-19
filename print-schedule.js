function printSchedule() {
  const weekEnd = new Date(currentWeekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekRange = `${formatDisplayDate(currentWeekStart)} – ${formatDisplayDate(weekEnd)}`
  const company = String(data.companyName || '').trim()

  const businessHours = getBusinessHoursForWeek()
  const holidays = getHolidaysForWeek()

  // ── Build header row ──────────────────────────────────────────────────────
  const dayHeaders = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeekStart)
    d.setDate(d.getDate() + i)
    const isHol = holidays.includes(i)
    const isSun = i === 6
    const bh = businessHours[i]
    const hoursLine = bh ? `${bh.open}–${bh.close}` : ''
    const holName = isHol ? getHolidayName(formatDate(d)) : ''
    const tag = isHol ? ' holiday' : isSun ? ' sunday' : ''
    return `<th class="day-header${tag}">
      <div class="day-name">${DAY_ABBREV[i]}</div>
      <div class="day-date">${d.getDate()}/${d.getMonth() + 1}</div>
      ${holName ? `<div class="hol-name">${holName}</div>` : ''}
      <div class="biz-hours">${hoursLine}</div>
    </th>`
  }).join('')

  // ── Build employee rows ───────────────────────────────────────────────────
  const rows = data.employees
    .map((emp) => {
      const restDays = getRestDaysForEmployee(emp.vat)
      const weekHours = calculateWeekHours(emp.vat, currentWeekStart)
      const targetHours =
        emp.payType === 'monthly'
          ? Number(emp.weekWorkingHours || 40)
          : Number(getEmployeeWeekSettings(emp.vat).workingHours || 40)
      const hoursLabel = `${weekHours}h / ${targetHours}h`
      const payTag = emp.payType === 'monthly' ? 'Μ' : 'Ω'

      const cells = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(currentWeekStart)
        d.setDate(d.getDate() + i)
        const dateStr = formatDate(d)
        const shift = data.shifts[`${emp.vat}_${dateStr}`]
        const isHol = holidays.includes(i) || i === 6
        const isRest = restDays.includes(i)

        let content = ''
        let tdClass = isHol ? ' holiday-cell' : isRest && !shift ? ' rest-cell' : ''

        if (shift) {
          if (isWorkingType(shift)) {
            const t1 = `${shift.start}–${shift.end}`
            const t2 = shift.start2 && shift.end2 ? `<br>${shift.start2}–${shift.end2}` : ''
            const mode = shift.type === 'ΤΗΛ' ? ' <em>ΤΗΛ</em>' : ''
            content = `${t1}${mode}${t2}`
          } else if (shift.type === 'AN') {
            content = 'ΡΕΠΟ'
            tdClass += ' absence-cell'
          } else if (shift.type === 'ΜΕ' || shift.type === 'ME') {
            content = 'ΜΕ'
            tdClass += ' absence-cell'
          } else {
            content = String(shift.type || '')
            tdClass += ' absence-cell'
          }
        } else if (isRest) {
          content = '–'
          tdClass += ' rest-cell'
        }

        return `<td class="shift-td${tdClass}">${content}</td>`
      }).join('')

      return `<tr>
      <td class="emp-name">${employeeLabel(emp)}<span class="pay-tag">${payTag}</span><span class="emp-hours">${hoursLabel}</span></td>
      ${cells}
    </tr>`
    })
    .join('')

  // ── Assemble full document ────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="utf-8">
<title>Πρόγραμμα ${weekRange}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: landscape; margin: 1.2cm 1.5cm; }

  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9.5pt;
    color: #000;
    background: #fff;
  }

  /* ── Document header ── */
  .doc-header {
    text-align: center;
    margin-bottom: 14pt;
    border-bottom: 1.5pt solid #000;
    padding-bottom: 8pt;
  }
  .doc-header .company { font-size: 14pt; font-weight: bold; }
  .doc-header .period  { font-size: 11pt; margin-top: 3pt; }
  .doc-header .printed { font-size: 8pt; color: #555; margin-top: 3pt; }

  /* ── Table ── */
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  th, td {
    border: 0.5pt solid #888;
    padding: 4pt 5pt;
    vertical-align: middle;
  }

  /* Employee name column — wider */
  col.col-name { width: 16%; }
  col.col-day  { width: calc(84% / 7); }

  /* Day header cells */
  .day-header {
    background: #f0f0f0;
    text-align: center;
    font-weight: bold;
    font-size: 8.5pt;
  }
  .day-header .day-name  { font-size: 10pt; font-weight: bold; }
  .day-header .day-date  { font-size: 8pt; color: #333; }
  .day-header .hol-name  { font-size: 7.5pt; color: #000; font-style: italic; margin-top: 1pt; }
  .day-header .biz-hours { font-size: 7.5pt; color: #555; margin-top: 2pt; }

  .day-header.holiday { background: #ede9fe; border-top: 2pt solid #7c3aed; }
  .day-header.sunday  { background: #fff3e0; border-top: 1.5pt solid #f57c00; }

  /* Employee name cell */
  .emp-name {
    font-weight: bold;
    font-size: 9pt;
    text-align: left;
    background: #fafafa;
    padding-left: 6pt;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pay-tag {
    display: inline-block;
    margin-left: 5pt;
    font-size: 7pt;
    font-weight: bold;
    border: 0.5pt solid #888;
    border-radius: 2pt;
    padding: 0 2pt;
    vertical-align: middle;
    color: #444;
  }
  .emp-hours {
    display: inline-block;
    margin-left: 6pt;
    font-size: 7.5pt;
    font-weight: normal;
    color: #555;
    vertical-align: middle;
  }

  /* Shift cells */
  .shift-td {
    text-align: center;
    font-size: 8.5pt;
    vertical-align: middle;
    white-space: pre-wrap;
    line-height: 1.4;
  }
  .shift-td em { font-style: italic; font-size: 7.5pt; color: #444; }

  .holiday-cell { background: #f0f0f0; }
  .rest-cell    { background: #fafafa; color: #aaa; font-size: 8pt; }
  .absence-cell { background: #f8f8f8; font-style: italic; color: #555; font-size: 8.5pt; }

  /* Alternating rows */
  tbody tr:nth-child(even) td:not(.holiday-cell):not(.rest-cell):not(.absence-cell) {
    background: #fafafa;
  }
  tbody tr:nth-child(even) .emp-name { background: #f4f4f4; }

  /* Footer */
  .doc-footer {
    margin-top: 12pt;
    font-size: 7.5pt;
    color: #777;
    display: flex;
    justify-content: space-between;
  }

  /* Suppress browser-added URL/date in header/footer */
  @page { margin-top: 1.2cm; margin-bottom: 1.2cm; }
</style>
</head>
<body>

<div class="doc-header">
  ${company ? `<div class="company">${company}</div>` : ''}
  <div class="period">Εβδομαδιαίο Πρόγραμμα Εργασίας &nbsp;·&nbsp; ${weekRange}</div>
  <div class="printed">Εκτύπωση: ${new Date().toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
</div>

<table>
  <colgroup>
    <col class="col-name">
    ${Array(7).fill('<col class="col-day">').join('\n    ')}
  </colgroup>
  <thead>
    <tr>
      <th style="background:#f0f0f0; text-align:left; padding-left:6pt;">Εργαζόμενος</th>
      ${dayHeaders}
    </tr>
  </thead>
  <tbody>
    ${rows || '<tr><td colspan="8" style="text-align:center;padding:12pt;color:#999;">Δεν υπάρχουν εγγραφές</td></tr>'}
  </tbody>
</table>

<div class="doc-footer">
  <span>Σύνολο εργαζομένων: ${data.employees.length}</span>
  <span>${company}</span>
  <span>eSchedule</span>
</div>

</body>
</html>`

  // Use a hidden iframe so no extra window appears before the print dialog.
  const existing = document.getElementById('_printFrame')
  if (existing) existing.remove()
  const iframe = document.createElement('iframe')
  iframe.id = '_printFrame'
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;'
  document.body.appendChild(iframe)
  iframe.contentDocument.open()
  iframe.contentDocument.write(html)
  iframe.contentDocument.close()
  iframe.contentWindow.focus()
  setTimeout(() => {
    iframe.contentWindow.print()
  }, 300)
}

