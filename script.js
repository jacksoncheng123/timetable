// Initialize courses from localStorage
let courses = JSON.parse(localStorage.getItem('courses')) || [];

// Days of the week
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Handle form submission
document.getElementById('courseForm').addEventListener('submit', function (e) {
  e.preventDefault();

  const course = {
    id: Date.now().toString(),
    courseName: document.getElementById('courseName').value,
    courseCode: document.getElementById('courseCode').value,
    location: document.getElementById('location').value,
    time: {
      start: document.getElementById('startTime').value,
      end: document.getElementById('endTime').value,
    },
    day: document.getElementById('day').value,
    dateRange: {
      start: document.getElementById('startDate').value,
      end: document.getElementById('endDate').value,
    },
    professor: {
      name: document.getElementById('profName').value,
      email: document.getElementById('profEmail').value,
    },
    ta: {
      name: document.getElementById('taName').value,
      email: document.getElementById('taEmail').value,
    },
  };

  // Basic validation
  if (!course.courseName || !course.courseCode || !course.location || !course.day ||
      !course.time.start || !course.time.end || !course.dateRange.start ||
      !course.dateRange.end || !course.professor.name || !course.professor.email) {
    alert('Please fill in all required fields.');
    return;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(course.professor.email) || (course.ta.email && !emailRegex.test(course.ta.email))) {
    alert('Please enter valid email addresses.');
    return;
  }

  // Validate start time is before end time
  if (course.time.start >= course.time.end) {
    alert('Start time must be before end time.');
    return;
  }

  // Add course to array and save to localStorage
  courses.push(course);
  localStorage.setItem('courses', JSON.stringify(courses));

  // Reset form
  this.reset();

  // Update UI
  updateCourseList();
  updateTimetable();
});

// Remove course
function removeCourse(id) {
  courses = courses.filter(course => course.id !== id);
  localStorage.setItem('courses', JSON.stringify(courses));
  updateCourseList();
  updateTimetable();
}

// Update course list
function updateCourseList() {
  const courseList = document.getElementById('courseList');
  courseList.innerHTML = '';
  courses.forEach(course => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `
      ${course.courseName} (${course.courseCode}) - ${course.day} ${course.time.start}-${course.time.end}
      <button class="btn btn-danger btn-sm" onclick="removeCourse('${course.id}')">Remove</button>
    `;
    courseList.appendChild(li);
  });
}

// Generate dynamic time slots based on course times
function generateTimeSlots() {
  if (courses.length === 0) return [];

  // Collect all start and end times
  const times = [];
  courses.forEach(course => {
    times.push(course.time.start);
    times.push(course.time.end);
  });

  // Convert times to minutes for sorting and slot generation
  const timeToMinutes = time => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Get unique times, convert to minutes, sort, and generate 30-minute slots
  const uniqueTimes = [...new Set(times)].map(timeToMinutes).sort((a, b) => a - b);

  // Generate 30-minute slots between min and max times
  const minTime = Math.floor(uniqueTimes[0] / 30) * 30;
  const maxTime = Math.ceil(uniqueTimes[uniqueTimes.length - 1] / 30) * 30;
  const slots = [];
  for (let t = minTime; t <= maxTime; t += 30) {
    const hours = Math.floor(t / 60).toString().padStart(2, '0');
    const minutes = (t % 60).toString().padStart(2, '0');
    slots.push(`${hours}:${minutes}`);
  }

  return slots;
}

// Update timetable
function updateTimetable() {
  const tbody = document.getElementById('timetableBody');
  tbody.innerHTML = '';

  // Generate dynamic time slots
  const timeSlots = generateTimeSlots();
  if (timeSlots.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="8" class="text-center">No courses added yet.</td>';
    tbody.appendChild(row);
    return;
  }

  // Create rows for each time slot
  timeSlots.forEach(time => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${time}</td>`;
    days.forEach(day => {
      const td = document.createElement('td');
      const matchingCourses = courses.filter(course => {
        const slotTime = time;
        return course.day === day &&
               course.time.start <= slotTime &&
               course.time.end > slotTime;
      });
      if (matchingCourses.length > 0) {
        td.innerHTML = matchingCourses.map(course => `
          <div class="course-card">
            <strong>${course.courseName}</strong> (${course.courseCode})<br>
            ${course.location}<br>
            Prof: ${course.professor.name}<br>
            ${course.ta.name ? `TA: ${course.ta.name}` : ''}
          </div>
        `).join('');
      }
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });
}

// Initialize UI on page load
updateCourseList();
updateTimetable();
