{
  id: String, // Unique ID (generated using timestamp or UUID)
  courseName: String,
  courseCode: String,
  location: String,
  time: { start: String, end: String }, // e.g., { start: "09:00", end: "10:30" }
  day: String, // e.g., "Monday"
  dateRange: { start: String, end: String }, // e.g., { start: "2025-09-01", end: "2025-11-29" }
  professor: { name: String, email: String },
  ta: { name: String, email: String }
}
