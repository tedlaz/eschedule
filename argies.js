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
