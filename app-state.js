// Data structures
// const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAYS = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή']
// const DAY_ABBREV = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_ABBREV = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ']

let data = {
  employees: [],
  companyName: '',
  defaultEmployeeSettings: { workingHours: 40, restDays: [5, 6], hourlyRate: 10, dailyRate: 0 },
  payrollRules: {
    absencePolicies: {
      holiday: { paid: true, multiplier: 1.0 },
      sick: { paid: false, multiplier: 0.0 },
      other: { paid: false, multiplier: 0.0 },
    },
    officialHolidayPaidIfAbsent: true,
    officialHolidayPayMultiplier: 1.0,
  },
  weekRestDays: {}, // key: "YYYY-MM-DD_employeeId", value: array of rest day indices
  weekEmployeeSettings: {}, // key: "YYYY-MM-DD_employeeVat", value: {workingHours}
  weekHolidays: {}, // key: "YYYY-MM-DD" (Monday of week), value: array of day indices (0-6) that are holidays
  customHolidayNames: {}, // key: "YYYY-MM-DD", value: custom holiday name string
  shifts: {}, // key: "employeeId_YYYY-MM-DD", value: shift object
}

let currentWeekStart = null // set in app.js after all modules load
let selectedTimelineDay = 0 // 0 = Monday

// Multi-cell selection state
let selectedCells = [] // Array of {employeeId, dateStr} objects
let isMultiSelectMode = false

