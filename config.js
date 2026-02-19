// ============================================================
// eSchedule — User Configuration
// Edit this file to customise default business hours.
//
// Days:  0 = Δευτέρα (Mon)  1 = Τρίτη (Tue)  2 = Τετάρτη (Wed)
//        3 = Πέμπτη (Thu)   4 = Παρασκευή (Fri)
//        5 = Σάββατο (Sat)  6 = Κυριακή (Sun)
//
// open / close : time in HH:MM format (24-hour clock)
// ============================================================

window.DEFAULT_BUSINESS_HOURS = {
  0: { open: '09:00', close: '17:00', closed: false }, // Δευτέρα
  1: { open: '09:00', close: '17:00', closed: false }, // Τρίτη
  2: { open: '09:00', close: '17:00', closed: false }, // Τετάρτη
  3: { open: '09:00', close: '17:00', closed: false }, // Πέμπτη
  4: { open: '09:00', close: '17:00', closed: false }, // Παρασκευή
  5: { open: '00:00', close: '00:00', closed: false }, // Σάββατο
  6: { open: '00:00', close: '00:00', closed: false }, // Κυριακή
}
