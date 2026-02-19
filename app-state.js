// Data structures
// const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAYS = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή']
// const DAY_ABBREV = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_ABBREV = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ']

// Default business hours — loaded from config.js (window.DEFAULT_BUSINESS_HOURS)
// Falls back to the values below when config.js is absent.
const DEFAULT_BUSINESS_HOURS = window.DEFAULT_BUSINESS_HOURS || {
  0: { open: '09:00', close: '17:00', closed: false }, // Monday
  1: { open: '09:00', close: '17:00', closed: false },
  2: { open: '09:00', close: '17:00', closed: false },
  3: { open: '09:00', close: '17:00', closed: false },
  4: { open: '09:00', close: '17:00', closed: false },
  5: { open: '00:00', close: '00:00', closed: false }, // Saturday
  6: { open: '00:00', close: '00:00', closed: false }, // Sunday
}

let data = {
  employees: [],
  companyName: '',
  defaultBusinessHours: JSON.parse(JSON.stringify(DEFAULT_BUSINESS_HOURS)),
  defaultEmployeeSettings: { workingHours: 40, restDays: [5, 6], hourlyRate: 10 },
  payrollRules: {
    absencePolicies: {
      holiday: { paid: true, multiplier: 1.0 },
      sick: { paid: false, multiplier: 0.0 },
      other: { paid: false, multiplier: 0.0 },
    },
    officialHolidayPaidIfAbsent: true,
    officialHolidayPayMultiplier: 1.0,
  },
  weekBusinessHours: {}, // key: "YYYY-MM-DD" (Monday of week), value: business hours for week
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

