// Data structures
// const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAYS = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή']
// const DAY_ABBREV = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_ABBREV = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ']

let data = {
  employees: [],
  companyName: '',
  weekHolidays: {}, // key: "YYYY-MM-DD" (Monday of week), value: array of day indices (0-6) that are holidays
  customHolidayNames: {}, // key: "YYYY-MM-DD", value: custom holiday name string
  shifts: {}, // key: "employeeId_YYYY-MM-DD", value: shift object
}

let currentWeekStart = null // set in app.js after all modules load
let selectedTimelineDay = 0 // 0 = Monday

// Multi-cell selection state
let selectedCells = [] // Array of {employeeId, dateStr} objects
let isMultiSelectMode = false

