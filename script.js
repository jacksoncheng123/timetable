/* Minimal timetable app logic with persistence and PWA support.
   Features: add/edit/delete timeslots, import/export JSON, offline-ready via service worker.
   Excludes AI and QR features.
*/

const STORAGE_KEY = 'timetable.v1'

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    console.error('Failed to load data', e)
    return []
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function render() {
  const container = document.getElementById('timetable')
  const data = loadData()
  if (!data.length) {
    container.innerHTML = '<div class="empty">No classes yet.</div>'
    return
  }

  container.innerHTML = ''
  data.forEach((item, idx) => {
    const card = document.createElement('div')
    card.className = 'class-card'
    card.innerHTML = `
      <div class="class-title">${escapeHtml(item.title)}</div>
      <div class="class-meta">${escapeHtml(item.day)} ${escapeHtml(item.time)}</div>
      <div class="class-actions">
        <button data-index="${idx}" class="edit">Edit</button>
        <button data-index="${idx}" class="delete">Delete</button>
      </div>
    `
    container.appendChild(card)
  })

  container.querySelectorAll('.edit').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = Number(e.target.dataset.index)
      openEditor(loadData()[i], i)
    })
  })

  container.querySelectorAll('.delete').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = Number(e.target.dataset.index)
      const data = loadData()
      data.splice(i, 1)
      saveData(data)
      render()
    })
  })
}

function escapeHtml(s){
  if (!s && s !== 0) return ''
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]))
}

function openEditor(item = {}, index = null) {
  const title = prompt('Class title', item.title || '')
  if (title === null) return
  const day = prompt('Day (e.g. Mon)', item.day || '')
  if (day === null) return
  const time = prompt('Time (e.g. 09:00-10:00)', item.time || '')
  if (time === null) return

  const data = loadData()
  const newItem = { title: title.trim(), day: day.trim(), time: time.trim() }
  if (index === null) data.push(newItem)
  else data[index] = newItem
  saveData(data)
  render()
}

function clearAll() {
  if (!confirm('Clear all classes?')) return
  saveData([])
  render()
}

function exportJSON() {
  const data = loadData()
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'timetable.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function importJSON(file) {
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result)
      if (!Array.isArray(parsed)) throw new Error('Invalid format')
      saveData(parsed)
      render()
    } catch (e) {
      alert('Invalid file')
    }
  }
  reader.readAsText(file)
}

// Service worker registration for PWA
if ('serviceWorker' in navigator) {
  // Only register in production, unregister in development
  window.addEventListener('load', async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations()
      for (const r of regs) await r.unregister()
      console.log('Service workers unregistered for development')
    } catch (e) {
      console.warn('SW unregister failed', e)
    }
    // Don't register new SW in development to avoid caching issues
  })
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('App initialized successfully')
  
  // Navigation
  const navHome = document.getElementById('navHome')
  const navMonthly = document.getElementById('navMonthly')
  const navAdd = document.getElementById('navAdd')
  
  if (navHome) {
    navHome.addEventListener('click', () => showView('home'))
  }
  
  if (navMonthly) {
    navMonthly.addEventListener('click', () => showView('monthly'))
  }
  
  if (navAdd) {
    navAdd.addEventListener('click', () => showView('add'))
  }

  // Form elements
  const classForm = document.getElementById('classForm')
  const exceptionsList = document.getElementById('exceptionsList')
  const exceptionDate = document.getElementById('exceptionDate')
  const addException = document.getElementById('addException')

  addException.addEventListener('click', () => {
    const d = exceptionDate.value
    if (!d) return
    const li = document.createElement('li')
    li.className = 'list-group-item d-flex justify-content-between align-items-center'
    li.textContent = d
    const rem = document.createElement('button')
    rem.className = 'btn btn-sm btn-danger'
    rem.textContent = 'Remove'
    rem.addEventListener('click', () => li.remove())
    li.appendChild(rem)
    exceptionsList.appendChild(li)
    exceptionDate.value = ''
  })

  document.getElementById('cancelAdd').addEventListener('click', () => showView('home'))

  classForm.addEventListener('submit', (e) => {
    e.preventDefault()
    alert('Form submitted!')
    const index = document.getElementById('editingIndex').value
    const item = {
      crn: document.getElementById('crn').value.trim(),
      title: document.getElementById('title').value.trim(),
      profName: document.getElementById('profName').value.trim(),
      profEmail: document.getElementById('profEmail').value.trim(),
      contactEmail: document.getElementById('contactEmail').value.trim(),
      location: document.getElementById('location').value.trim(),
      startDate: document.getElementById('startDate').value,
      endDate: document.getElementById('endDate').value,
      startTime: document.getElementById('startTime').value,
      endTime: document.getElementById('endTime').value,
      weekdays: Array.from(document.querySelectorAll('#weekdayCheckboxes input:checked')).map(n => n.value),
      exceptions: Array.from(exceptionsList.querySelectorAll('li')).map(li => li.firstChild.textContent)
    }
    const data = loadData()
    if (index) data[Number(index)] = item
    else data.push(item)
    saveData(data)
    showView('home')
    render()
  })

  document.getElementById('clearBtn').addEventListener('click', clearAll)
  document.getElementById('exportBtn').addEventListener('click', exportJSON)
  const importBtn = document.getElementById('importBtn')
  const importFile = document.getElementById('importFile')
  importBtn.addEventListener('click', () => importFile.click())
  importFile.addEventListener('change', (e) => {
    const f = e.target.files[0]
    if (f) importJSON(f)
    e.target.value = ''
  })

  // Temporary button to unregister SW and reload
  document.getElementById('unregisterSW').addEventListener('click', async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations()
      for (const r of regs) await r.unregister()
      alert('Cache refreshed. Reloading page...')
      window.location.reload()
    } catch (e) {
      console.warn('Failed to unregister SW', e)
      window.location.reload()
    }
  })

  showView('home')
  render()
})

function showView(name){
  const homeView = document.getElementById('homeView')
  const addView = document.getElementById('addView')
  const monthlyView = document.getElementById('monthlyView')
  
  // Hide all views first
  if (homeView) homeView.classList.add('hidden')
  if (addView) addView.classList.add('hidden')
  if (monthlyView) monthlyView.classList.add('hidden')
  
  if (name === 'home' && homeView){
    homeView.classList.remove('hidden')
    render()
  } else if (name === 'monthly' && monthlyView){
    monthlyView.classList.remove('hidden')
    renderMonthly()
  } else if (name === 'add' && addView){
    addView.classList.remove('hidden')
    document.getElementById('classForm').reset()
    document.getElementById('editingIndex').value = ''
    document.getElementById('exceptionsList').innerHTML = ''
  }
}

// Render weekly grid (Mon-Sat) and compute current/next
function render(){
  const container = document.getElementById('timetable')
  const data = loadData()
  // build grid: rows per hour slot (simple approach 06:00-22:00)
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const hours = []
  for (let h=6; h<=22; h++) hours.push((h<10? '0':'')+h+':00')

  // compute occurrences for visible week (this week)
  const now = new Date()
  const weekStart = startOfWeek(now) // Monday
  const occurrences = []
  data.forEach((item, idx) => {
    const start = new Date(item.startDate)
    const end = new Date(item.endDate)
    // iterate from weekStart to weekStart+27 (4 weeks)
    for (let d=0; d<28; d++){
      const day = new Date(weekStart)
      day.setDate(weekStart.getDate()+d)
      const dayName = weekdayName(day)
      if (!item.weekdays.includes(dayName)) continue
      if (day < start || day > end) continue
      const iso = day.toISOString().slice(0,10)
      if ((item.exceptions||[]).includes(iso)) continue
      occurrences.push({idx, item, day, iso})
    }
  })

  // current and next
  const nowTime = now.getHours()*60 + now.getMinutes()
  let current = null, next = null
  const occTimes = occurrences.map(o => {
    const [sh,sm] = o.item.startTime.split(':').map(Number)
    const [eh,em] = o.item.endTime.split(':').map(Number)
    const startM = sh*60+sm
    const endM = eh*60+em
    return {...o, startM, endM}
  }).sort((a,b)=> a.day - b.day || a.startM - b.startM)
  for (const o of occTimes){
    const startM = o.startM
    if (o.day.toDateString() === now.toDateString() && startM <= nowTime && o.endM > nowTime) { current = o; break }
    if (!next && o.day >= now && (o.day > now || o.startM > nowTime)) { next = o }
  }
  document.getElementById('currentStatus').textContent = current ? `Current: ${current.item.title} @ ${current.item.location} (${formatTimeRange(current.item.startTime,current.item.endTime)})` : 'Current: No class in progress'
  document.getElementById('nextStatus').textContent = next ? `Next: ${next.item.title} @ ${next.item.location} on ${formatDate(next.day)} ${formatTimeRange(next.item.startTime,next.item.endTime)}` : 'Next: No upcoming classes'

  // render grid simple list per day
  container.innerHTML = ''
  days.forEach(dayName => {
    const col = document.createElement('div')
    col.className = 'day-column'
    const h = document.createElement('h4')
    h.textContent = dayName
    col.appendChild(h)
    const list = document.createElement('div')
    list.className = 'day-list'
    const dayOcc = occTimes.filter(o => weekdayName(o.day) === dayName)
    if (!dayOcc.length) list.innerHTML = '<div class="empty">—</div>'
    dayOcc.forEach(o => {
      const card = document.createElement('div')
      card.className = 'class-card'
      card.innerHTML = `
        <div>
          <div class="class-title">${escapeHtml(o.item.title)} <small class="text-muted">(${escapeHtml(o.item.crn)})</small></div>
          <div class="class-meta">${escapeHtml(o.item.location)} • ${formatTimeRange(o.item.startTime,o.item.endTime)}</div>
          <div class="class-meta">Prof: ${escapeHtml(o.item.profName)}</div>
        </div>
      `
      card.addEventListener('click', () => showClassDetails(o.item))
      list.appendChild(card)
    })
    col.appendChild(list)
    container.appendChild(col)
  })

  // wire edit/delete - removed as buttons are gone
}

// Monthly calendar variables
let currentMonthDate = new Date()

// Render monthly calendar
function renderMonthly(){
  console.log('Rendering monthly calendar')
  const container = document.getElementById('monthlyCalendar')
  const data = loadData()
  
  if (!container) {
    console.error('Monthly calendar container not found')
    return
  }
  
  // Update month/year header
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December']
  const monthYearEl = document.getElementById('monthYear')
  if (monthYearEl) {
    monthYearEl.textContent = `${monthNames[currentMonthDate.getMonth()]} ${currentMonthDate.getFullYear()}`
  }
  
  // Get first day of month and last day of month
  const firstDay = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 1)
  const lastDay = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 0)
  
  // Get the day of week for first day (0 = Sunday, 1 = Monday, etc.)
  let startDate = new Date(firstDay)
  startDate.setDate(startDate.getDate() - firstDay.getDay())
  
  // Generate calendar grid
  container.innerHTML = ''
  
  // Create day headers
  const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const headerRow = document.createElement('div')
  headerRow.className = 'calendar-header'
  dayHeaders.forEach(day => {
    const header = document.createElement('div')
    header.className = 'calendar-day-header'
    header.textContent = day
    headerRow.appendChild(header)
  })
  container.appendChild(headerRow)
  
  // Generate 6 weeks (42 days) to ensure we cover the entire month
  let currentDate = new Date(startDate)
  for (let week = 0; week < 6; week++) {
    const weekRow = document.createElement('div')
    weekRow.className = 'calendar-week'
    
    for (let day = 0; day < 7; day++) {
      const dayCell = document.createElement('div')
      dayCell.className = 'calendar-day'
      
      // Add day number
      const dayNumber = document.createElement('div')
      dayNumber.className = 'calendar-day-number'
      dayNumber.textContent = currentDate.getDate()
      
      // Style for current month vs other months
      if (currentDate.getMonth() !== currentMonthDate.getMonth()) {
        dayCell.classList.add('other-month')
      }
      
      // Style for today
      const today = new Date()
      if (currentDate.toDateString() === today.toDateString()) {
        dayCell.classList.add('today')
      }
      
      dayCell.appendChild(dayNumber)
      
      // Add events for this day
      const dayEvents = getEventsForDay(data, currentDate)
      dayEvents.forEach(event => {
        const eventDiv = document.createElement('div')
        eventDiv.className = 'calendar-event'
        eventDiv.textContent = `${event.item.title} ${formatTimeRange(event.item.startTime, event.item.endTime)}`
        eventDiv.addEventListener('click', () => showClassDetails(event.item))
        dayCell.appendChild(eventDiv)
      })
      
      weekRow.appendChild(dayCell)
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    container.appendChild(weekRow)
  }
  
  // Add navigation event listeners (remove existing ones first)
  const prevBtn = document.getElementById('prevMonth')
  const nextBtn = document.getElementById('nextMonth')
  
  // Remove existing listeners to prevent duplicates
  const newPrevBtn = prevBtn.cloneNode(true)
  const newNextBtn = nextBtn.cloneNode(true)
  prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn)
  nextBtn.parentNode.replaceChild(newNextBtn, nextBtn)
  
  newPrevBtn.addEventListener('click', () => {
    currentMonthDate.setMonth(currentMonthDate.getMonth() - 1)
    renderMonthly()
  })
  
  newNextBtn.addEventListener('click', () => {
    currentMonthDate.setMonth(currentMonthDate.getMonth() + 1)
    renderMonthly()
  })
}

// Get events for a specific day
function getEventsForDay(data, date) {
  const events = []
  const dateStr = date.toISOString().slice(0, 10)
  const dayName = weekdayName(date)
  
  data.forEach((item, idx) => {
    const start = new Date(item.startDate)
    const end = new Date(item.endDate)
    
    // Check if date is within range
    if (date >= start && date <= end) {
      // Check if this weekday is selected
      if (item.weekdays && item.weekdays.includes(dayName)) {
        // Check exceptions
        if (!(item.exceptions || []).includes(dateStr)) {
          events.push({item, idx, date})
        }
      }
    }
  })
  
  return events
}

function loadIntoForm(index){
  const data = loadData()
  const item = data[index]
  if (!item) return
  showView('add')
  document.getElementById('editingIndex').value = index
  document.getElementById('crn').value = item.crn || ''
  document.getElementById('title').value = item.title || ''
  document.getElementById('profName').value = item.profName || ''
  document.getElementById('profEmail').value = item.profEmail || ''
  document.getElementById('contactEmail').value = item.contactEmail || ''
  document.getElementById('location').value = item.location || ''
  document.getElementById('startDate').value = item.startDate || ''
  document.getElementById('endDate').value = item.endDate || ''
  document.getElementById('startTime').value = item.startTime || ''
  document.getElementById('endTime').value = item.endTime || ''
  // weekdays
  document.querySelectorAll('#weekdayCheckboxes input').forEach(inp => inp.checked = (item.weekdays||[]).includes(inp.value))
  // exceptions
  const list = document.getElementById('exceptionsList')
  list.innerHTML = ''
  (item.exceptions||[]).forEach(d=>{
    const li = document.createElement('li')
    li.className = 'list-group-item d-flex justify-content-between align-items-center'
    li.textContent = d
    const rem = document.createElement('button')
    rem.className = 'btn btn-sm btn-danger'
    rem.textContent = 'Remove'
    rem.addEventListener('click', ()=> li.remove())
    li.appendChild(rem)
    list.appendChild(li)
  })
}

function startOfWeek(d){
  // return Monday of the week of date d
  const dt = new Date(d)
  const day = dt.getDay() || 7
  dt.setDate(dt.getDate() - day + 1)
  dt.setHours(0,0,0,0)
  return dt
}

function weekdayName(d){
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()]
}

function formatTimeRange(s,e){
  return `${s} - ${e}`
}

function formatDate(d){
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function showClassDetails(item){
  const details = `
Title: ${item.title}
CRN: ${item.crn}
Location: ${item.location}
Time: ${formatTimeRange(item.startTime, item.endTime)}
Professor: ${item.profName}
Professor Email: ${item.profEmail || 'N/A'}
Contact Email: ${item.contactEmail || 'N/A'}
Repeat: ${item.weekdays.join(', ')}
Start: ${item.startDate}
End: ${item.endDate}
  `
  const choice = confirm(details + '\n\nClick OK to Edit, Cancel to Delete')
  if (choice) {
    // Edit - find index and load
    const data = loadData()
    const idx = data.findIndex(d => d.crn === item.crn && d.title === item.title) // simple match
    if (idx !== -1) loadIntoForm(idx)
  } else {
    // Delete
    const data = loadData()
    const idx = data.findIndex(d => d.crn === item.crn && d.title === item.title)
    if (idx !== -1 && confirm('Delete this class?')) {
      data.splice(idx, 1)
      saveData(data)
      render()
    }
  }
}
