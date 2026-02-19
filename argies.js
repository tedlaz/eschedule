function orthodoxEaster(year) {
  // Meeus Julian algorithm για Πάσχα στο Ιουλιανό ημερολόγιο
  const a = year % 4
  const b = year % 7
  const c = year % 19
  const d = (19 * c + 15) % 30
  const e = (2 * a + 4 * b - d + 34) % 7

  const month = Math.floor((d + e + 114) / 31) // 3 = Μάρτιος, 4 = Απρίλιος (Ιουλιανό)
  const day = ((d + e + 114) % 31) + 1

  // Ημερομηνία Πάσχα στο Ιουλιανό ημερολόγιο, εκφρασμένη ως "έτος-μήνας-ημέρα"
  // Θα τη χρησιμοποιήσουμε ως βάση για να προσθέσουμε 13 ημέρες
  const julianEaster = new Date(year, month - 1, day)

  // Μετατροπή σε Γρηγοριανό: +13 ημέρες για 1900–2099
  const gregorianEaster = new Date(julianEaster)
  gregorianEaster.setDate(gregorianEaster.getDate() + 13)

  return gregorianEaster // αντικείμενο Date (Gregorian)
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function greekMovableHolidays(year) {
  const easter = orthodoxEaster(year)

  return {
    'Καθαρά Δευτέρα': addDays(easter, -48),
    'Μεγάλη Παρασκευή': addDays(easter, -2),
    'Κυριακή του Πάσχα': easter,
    'Δευτέρα του Πάσχα': addDays(easter, 1),
    'Δευτέρα του Αγίου Πνεύματος': addDays(easter, 50),
  }
}

function greekFixedHolidays(year) {
  return [
    new Date(year, 0, 1), // Πρωτοχρονιά
    new Date(year, 0, 6), // Θεοφάνεια
    new Date(year, 2, 25), // Επανάσταση του 1821
    new Date(year, 4, 1), // Πρωτομαγιά
    new Date(year, 7, 15), // Κοίμηση της Θεοτόκου
    new Date(year, 9, 28), // Επέτειος του ΟΧΙ
    new Date(year, 11, 25), // Χριστούγεννα
    new Date(year, 11, 26), // Σύναξη της Θεοτόκου
  ]
}

function greekAllHolidaysForYear(year) {
  return [...greekFixedHolidays(year), ...Object.values(greekMovableHolidays(year))]
}

// Returns the holiday name for a given YYYY-MM-DD string, or null if not a holiday.
function greekHolidayNameForDate(dateStr) {
  if (typeof dateStr !== 'string') return null
  const year = parseInt(dateStr.slice(0, 4), 10)
  if (!year) return null

  const fixed = [
    { month: 1, day: 1, name: 'Πρωτοχρονιά' },
    { month: 1, day: 6, name: 'Θεοφάνεια' },
    { month: 3, day: 25, name: 'Επανάσταση 1821' },
    { month: 5, day: 1, name: 'Πρωτομαγιά' },
    { month: 8, day: 15, name: 'Κοίμηση Θεοτόκου' },
    { month: 10, day: 28, name: 'Επέτειος ΟΧΙ' },
    { month: 12, day: 25, name: 'Χριστούγεννα' },
    { month: 12, day: 26, name: 'Σύναξη Θεοτόκου' },
  ]
  const mmdd = dateStr.slice(5) // "MM-DD"
  for (const h of fixed) {
    const hStr = `${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`
    if (mmdd === hStr) return h.name
  }

  const movable = greekMovableHolidays(year)
  for (const [name, date] of Object.entries(movable)) {
    const d = date
    const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (s === dateStr) return name
  }

  return null
}
