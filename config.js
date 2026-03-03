// ============================================================
// eSchedule — User Configuration
// ============================================================

// ============================================================
// Timeline Segment Colors (Payroll Categories)
// Edit these to customize the appearance of shift bars in the timeline view.
// Format: CSS linear-gradient
// ============================================================

window.TIMELINE_COLORS = {
  within: 'linear-gradient(135deg, #4caf50, #388e3c)', // Εντός - Green
  additional: 'linear-gradient(135deg, #2196f3, #1976d2)', // Πρόσθετη - Light Blue
  ye: 'linear-gradient(135deg, #ff9800, #f57c00)', // Υπερεργασία - Orange
  yp: 'linear-gradient(135deg, #f44336, #d32f2f)', // Υπερωρίες - Red
  illegal: 'linear-gradient(135deg, #c62828, #880e4f)', // Παράνομη - Dark Red/Maroon
}

// ============================================================
// Validation Rules
// ============================================================

window.MAX_SHIFT_HOURS = 13 // Maximum hours per shift (including split shifts)
