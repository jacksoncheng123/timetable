/* Minimal timetable app logic with persistence and PWA support.
   Features: add/edit/delete timeslots, import/export JSON, offline-ready via service worker.
   Excludes AI and QR features.
*/

const STORAGE_KEY = 'timetable.v1'

// Hong Kong Time utilities
function getHKTDate(date = null) {
  // Create date in HKT (UTC+8)
  const baseDate = date ? new Date(date) : new Date()
  const utcTime = baseDate.getTime() + (baseDate.getTimezoneOffset() * 60000)
  return new Date(utcTime + (8 * 3600000)) // UTC+8 for HKT
}

function formatHKTDateString(date) {
  // Format date as YYYY-MM-DD in HKT
  const hktDate = getHKTDate(date)
  return hktDate.toISOString().slice(0, 10)
}

function formatHKTDateTime(date) {
  // Format full datetime in HKT
  const hktDate = getHKTDate(date)
  return hktDate.toLocaleString('en-HK', { 
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  })
}

function getCurrentHKTTime() {
  // Get current time in HKT as HH:MM format
  const hktDate = getHKTDate()
  return hktDate.toLocaleTimeString('en-HK', { 
    timeZone: 'Asia/Hong_Kong',
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  })
}

// Helper functions for clickable contact information
function formatClickableEmail(email) {
  if (!email || email === 'N/A') return email || 'N/A'
  const mailtoUrl = `mailto:${encodeURIComponent(email)}`
  return `<a href="${mailtoUrl}" class="contact-link email-link">${escapeHtml(email)}</a>`
}

function formatClickablePhone(phone) {
  if (!phone || phone === 'N/A') return phone || 'N/A'
  
  // Normalize phone number - remove spaces, dashes, parentheses
  let normalizedPhone = phone.replace(/[\s\-\(\)]/g, '')
  
  // Add default Hong Kong country code if no country code is present
  if (!normalizedPhone.startsWith('+')) {
    if (normalizedPhone.startsWith('852')) {
      normalizedPhone = '+' + normalizedPhone
    } else {
      normalizedPhone = '+852' + normalizedPhone
    }
  }
  
  return `<a href="tel:${normalizedPhone}" class="contact-link phone-link">${escapeHtml(phone)}</a>`
}

function formatClickableContact(contact) {
  if (!contact || contact === 'N/A') return contact || 'N/A'
  
  // Check if it looks like an Instagram handle (starts with @)
  if (contact.startsWith('@')) {
    const igHandle = contact.substring(1) // Remove the @
    return `<a href="https://instagram.com/${igHandle}" target="_blank" class="contact-link ig-link">${escapeHtml(contact)}</a>`
  }
  
  // Check if it looks like a phone number (contains digits)
  if (/\d/.test(contact)) {
    return formatClickablePhone(contact)
  }
  
  // If it contains @ it's probably an email
  if (contact.includes('@')) {
    return formatClickableEmail(contact)
  }
  
  // Otherwise, return as-is (could be other social media, etc.)
  return escapeHtml(contact)
}

// ICS export functionality
function formatICSDate(date, time) {
  const [hours, minutes] = time.split(':').map(Number)
  const dt = getHKTDate(date)
  dt.setHours(hours, minutes, 0, 0)
  
  // Use local time with timezone specification instead of UTC conversion
  const year = dt.getFullYear()
  const month = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  const hour = String(dt.getHours()).padStart(2, '0')
  const minute = String(dt.getMinutes()).padStart(2, '0')
  
  // Format as YYYYMMDDTHHMMSS with timezone
  return `${year}${month}${day}T${hour}${minute}00`
}

function generateICSContent() {
  const data = loadData()
  if (!data.length) {
    alert('No classes to export!')
    return null
  }
  
  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Timetable App//Timetable//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Hong_Kong',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:HKT',
    'END:STANDARD',
    'END:VTIMEZONE'
  ]
  
  data.forEach((item, index) => {
    const startDate = getHKTDate(item.startDate)
    const endDate = getHKTDate(item.endDate)
    
    // Generate events for each occurrence
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayName = weekdayName(d)
      
      if (item.weekdays && item.weekdays.includes(dayName)) {
        const iso = formatHKTDateString(d)
        
        // Skip exception dates
        if (item.exceptions && item.exceptions.includes(iso)) {
          continue
        }
        
        const dtStart = formatICSDate(d, item.startTime)
        const dtEnd = formatICSDate(d, item.endTime)
        const uid = `class-${index}-${iso}@timetable-app.local`
        
        let description = `Professor: ${item.profName || 'N/A'}`
        if (item.profEmail) description += `\\nProf Email: ${item.profEmail}`
        if (item.contactEmail) description += `\\nContact Email: ${item.contactEmail}`
        if (item.groupName) {
          description += `\\nGroup: ${item.groupName}`
          if (item.groupMembers && item.groupMembers.length > 0) {
            description += `\\nMembers: ${item.groupMembers.map(m => m.name).join(', ')}`
          }
        }
        
        icsContent.push(
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTART;TZID=Asia/Hong_Kong:${dtStart}`,
          `DTEND;TZID=Asia/Hong_Kong:${dtEnd}`,
          `SUMMARY:${item.title} (${item.crn})`,
          `LOCATION:${item.location || ''}`,
          `DESCRIPTION:${description}`,
          `CATEGORIES:CLASS`,
          'END:VEVENT'
        )
      }
    }
  })
  
  icsContent.push('END:VCALENDAR')
  return icsContent.join('\r\n')
}

function exportToICS() {
  const icsContent = generateICSContent()
  if (!icsContent) return
  
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = `timetable-${formatHKTDateString(getHKTDate())}.ics`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  URL.revokeObjectURL(url)
  alert('ICS file exported successfully! You can now import it into your calendar app.')
}

// Previous view tracking for navigation
let previousView = 'home'

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
  // Clean data older than 6 months using HKT
  const sixMonthsAgo = getHKTDate()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  
  const cleanedData = data.filter(item => {
    const endDate = getHKTDate(item.endDate)
    return endDate >= sixMonthsAgo
  })
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanedData))
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
      console.log('Reading file:', file.name)
      const parsed = JSON.parse(reader.result)
      console.log('Parsed data:', parsed)
      
      if (!Array.isArray(parsed)) {
        throw new Error('Invalid format: Expected an array')
      }
      
      // Validate and convert data format
      const validData = parsed.filter(item => {
        if (!item || !item.title) return false
        
        // Convert old format to new format if needed
        if (item.time && item.day && !item.startTime) {
          // Old format: {title, time: "09:00-10:00", day: "Mon"}
          const timeParts = item.time.split('-')
          if (timeParts.length === 2) {
            item.startTime = timeParts[0].trim()
            item.endTime = timeParts[1].trim()
          }
          
          // Convert day abbreviation to full name if needed
          const dayMap = {
            'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday',
            'Thu': 'Thursday', 'Fri': 'Friday', 'Sat': 'Saturday', 'Sun': 'Sunday'
          }
          if (dayMap[item.day]) {
            item.weekdays = [dayMap[item.day]]
          } else if (item.day) {
            item.weekdays = [item.day]
          }
          
          // Set default dates if missing
          if (!item.startDate) {
            const today = formatHKTDateString(getHKTDate())
            item.startDate = today
          }
          if (!item.endDate) {
            const futureDate = getHKTDate()
            futureDate.setMonth(futureDate.getMonth() + 4) // 4 months from now
            item.endDate = formatHKTDateString(futureDate)
          }
        }
        
        // Ensure required fields exist
        return item.title && item.startTime && item.endTime
      })
      
      console.log('Valid items after conversion:', validData.length, 'of', parsed.length)
      
      if (validData.length === 0) {
        throw new Error('No valid classes found in the file')
      }
      
      // Add default values for missing fields
      validData.forEach(item => {
        if (!item.location) item.location = 'TBD'
        if (!item.profName) item.profName = 'TBD'
        if (!item.crn) item.crn = 'N/A'
        if (!item.weekdays || !Array.isArray(item.weekdays)) {
          item.weekdays = ['Monday'] // Default to Monday if no weekdays
        }
        if (!item.startDate) {
          item.startDate = formatHKTDateString(getHKTDate())
        }
        if (!item.endDate) {
          const futureDate = getHKTDate()
          futureDate.setMonth(futureDate.getMonth() + 4)
          item.endDate = formatHKTDateString(futureDate)
        }
      })
      
      console.log('Final processed data:', validData)
      
      // Get existing data and append imported data
      const existingData = loadData()
      const combinedData = [...existingData, ...validData]
      
      saveData(combinedData)
      render()
      
      // Show success message
      alert(`Successfully imported ${validData.length} classes! Total classes: ${combinedData.length}`)
      
      // Refresh the current view
      const currentView = document.querySelector('.view:not(.hidden)')
      if (currentView) {
        const viewId = currentView.id
        if (viewId === 'monthlyView') renderMonthly()
        else if (viewId === 'homeView') render()
      }
      
    } catch (e) {
      console.error('Import error:', e)
      alert(`Import failed: ${e.message}`)
    }
  }
  
  reader.onerror = () => {
    console.error('File reading error')
    alert('Failed to read the file')
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
  
  // Add visibility change handler to refresh timetable when tab becomes visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Only refresh if we're on the home view with the timetable visible
      const homeView = document.getElementById('homeView')
      if (homeView && !homeView.classList.contains('hidden')) {
        render()
      }
    }
  })
  
  // Navigation
  const navHome = document.getElementById('navHome')
  const navMonthly = document.getElementById('navMonthly')
  const navAdd = document.getElementById('navAddFromSettings')
  
  if (navHome) {
    navHome.addEventListener('click', () => showView('home'))
  }
  
  if (navMonthly) {
    navMonthly.addEventListener('click', () => showView('monthly'))
  }
  
  if (navAdd) {
    navAdd.addEventListener('click', (e) => {
      e.preventDefault()
      showView('add')
      document.querySelector('.export-dropdown').classList.remove('show')
    })
  }

  // List view button
  const navList = document.getElementById('navList')
  if (navList) {
    navList.addEventListener('click', () => showView('list'))
  }

  // Detail view buttons
  const editClassBtn = document.getElementById('editClassBtn')
  const deleteClassBtn = document.getElementById('deleteClassBtn')
  const closeDetailBtn = document.getElementById('closeDetailBtn')
  
  if (editClassBtn) {
    editClassBtn.addEventListener('click', () => {
      if (window.currentDetailItem) {
        const data = loadData()
        const idx = data.findIndex(d => d.crn === window.currentDetailItem.crn && d.title === window.currentDetailItem.title)
        if (idx !== -1) loadIntoForm(idx)
      }
    })
  }
  
  if (deleteClassBtn) {
    deleteClassBtn.addEventListener('click', () => {
      if (window.currentDetailItem && confirm('Delete this class?')) {
        const data = loadData()
        const idx = data.findIndex(d => d.crn === window.currentDetailItem.crn && d.title === window.currentDetailItem.title)
        if (idx !== -1) {
          data.splice(idx, 1)
          saveData(data)
          showView('home')
          render()
        }
      }
    })
  }
  
  if (closeDetailBtn) {
    closeDetailBtn.addEventListener('click', () => showView(previousView))
  }

  // List view close button
  const closeListBtn = document.getElementById('closeListBtn')
  if (closeListBtn) {
    closeListBtn.addEventListener('click', () => showView('home'))
  }

  // Popup event listeners
  const closePopup = document.getElementById('closePopup')
  const popupOverlay = document.querySelector('.popup-overlay')
  const popupViewDetails = document.getElementById('popupViewDetails')
  
  if (closePopup) {
    closePopup.addEventListener('click', hideClassPopup)
  }
  
  if (popupOverlay) {
    popupOverlay.addEventListener('click', hideClassPopup)
  }
  
  if (popupViewDetails) {
    popupViewDetails.addEventListener('click', () => {
      const popup = document.getElementById('classPopup')
      const itemData = JSON.parse(popup.dataset.itemData)
      hideClassPopup()
      showClassDetails(itemData)
    })
  }

  // Keyboard support for popup
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideClassPopup()
      // Also hide tooltip
      const hoverTooltip = document.getElementById('hoverTooltip')
      if (hoverTooltip) hoverTooltip.classList.remove('show')
    }
  })

  // Form elements
  const classForm = document.getElementById('classForm')
  const exceptionsList = document.getElementById('exceptionsList')
  const exceptionDate = document.getElementById('exceptionDate')
  const addException = document.getElementById('addException')

  addException.addEventListener('click', () => {
    const d = exceptionDate.value
    if (!d) return
    
    // Convert to HKT format to ensure consistency
    const hktDate = formatHKTDateString(new Date(d + 'T00:00:00'))
    
    // Check if already exists
    const existing = Array.from(exceptionsList.querySelectorAll('li')).find(li => 
      li.querySelector('span').textContent === hktDate
    )
    if (existing) {
      alert('This date is already in the exceptions list')
      return
    }
    
    const li = document.createElement('li')
    li.className = 'list-group-item d-flex justify-content-between align-items-center'
    
    const dateSpan = document.createElement('span')
    dateSpan.textContent = hktDate
    li.appendChild(dateSpan)
    
    const rem = document.createElement('button')
    rem.className = 'btn btn-sm btn-danger'
    rem.textContent = 'Remove'
    rem.addEventListener('click', () => li.remove())
    li.appendChild(rem)
    
    exceptionsList.appendChild(li)
    exceptionDate.value = ''
  })

  // Group members functionality
  const membersList = document.getElementById('membersList')
  const memberName = document.getElementById('memberName')
  const memberContact = document.getElementById('memberContact')
  const addMember = document.getElementById('addMember')

  addMember.addEventListener('click', () => {
    const name = memberName.value.trim()
    const contact = memberContact.value.trim()
    if (!name) return
    
    // Check if already exists
    const existing = Array.from(membersList.querySelectorAll('.member-item')).find(item => 
      item.querySelector('.member-name').textContent === name
    )
    if (existing) {
      alert('This member is already in the list')
      return
    }
    
    const memberDiv = document.createElement('div')
    memberDiv.className = 'member-item'
    memberDiv.innerHTML = `
      <div class="member-info">
        <div class="member-name">${escapeHtml(name)}</div>
        <div class="member-contact">${escapeHtml(contact || 'No contact info')}</div>
      </div>
      <button class="remove-member" onclick="this.parentElement.remove()">Remove</button>
    `
    
    membersList.appendChild(memberDiv)
    memberName.value = ''
    memberContact.value = ''
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
      exceptions: Array.from(exceptionsList.querySelectorAll('li span')).map(span => span.textContent),
      // Group information
      groupName: document.getElementById('groupName').value.trim(),
      groupMembers: Array.from(membersList.querySelectorAll('.member-item')).map(item => ({
        name: item.querySelector('.member-name').textContent,
        contact: item.querySelector('.member-contact').textContent.replace('No contact info', '')
      }))
    }
    const data = loadData()
    if (index) data[Number(index)] = item
    else data.push(item)
    saveData(data)
    showView('home')
    render()
  })

  // Settings dropdown functionality
  const settingsBtn = document.getElementById('settingsBtn')
  const settingsDropdown = document.getElementById('settingsDropdown')
  const exportJsonFromSettings = document.getElementById('exportJsonFromSettings')
  const exportIcsFromSettings = document.getElementById('exportIcsFromSettings')
  const importBtnFromSettings = document.getElementById('importBtnFromSettings')
  
  // Toggle dropdown on button click
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    const dropdown = settingsBtn.parentElement
    dropdown.classList.toggle('show')
  })
  
  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    const dropdown = document.querySelector('.export-dropdown')
    if (dropdown) {
      dropdown.classList.remove('show')
    }
  })
  
  // Export options
  exportJsonFromSettings.addEventListener('click', (e) => {
    e.preventDefault()
    exportJSON()
    document.querySelector('.export-dropdown').classList.remove('show')
  })
  
  exportIcsFromSettings.addEventListener('click', (e) => {
    e.preventDefault()
    exportToICS()
    document.querySelector('.export-dropdown').classList.remove('show')
  })
  
  // Import functionality
  importBtnFromSettings.addEventListener('click', (e) => {
    e.preventDefault()
    console.log('Import button clicked from settings')
    const importFile = document.getElementById('importFile')
    if (importFile) {
      importFile.click()
    }
    document.querySelector('.export-dropdown').classList.remove('show')
  })
  
  // Import file handling
  const importFile = document.getElementById('importFile')
  
  if (!importFile) {
    console.error('Import file element not found')
    return
  }
  
  importFile.addEventListener('change', (e) => {
    const f = e.target.files[0]
    console.log('File selected:', f)
    if (f) {
      console.log('File details:', f.name, f.size, f.type)
      importJSON(f)
    } else {
      console.log('No file selected')
    }
    e.target.value = ''
  })

  // Weekly timetable is handled by the render() function

  showView('home')
  render()
})

// Long press functionality
function addLongPressListener(element, callback) {
  let pressTimer
  let startX, startY
  const longPressDelay = 500 // 500ms
  
  element.addEventListener('touchstart', (e) => {
    e.preventDefault() // Prevent default touch behaviors
    const touch = e.touches[0]
    startX = touch.clientX
    startY = touch.clientY
    
    pressTimer = setTimeout(() => {
      element.classList.add('long-press')
      callback()
      navigator.vibrate && navigator.vibrate(50) // Haptic feedback
    }, longPressDelay)
  })
  
  element.addEventListener('touchmove', (e) => {
    const touch = e.touches[0]
    const moveX = Math.abs(touch.clientX - startX)
    const moveY = Math.abs(touch.clientY - startY)
    
    // Cancel long press if finger moves too much
    if (moveX > 10 || moveY > 10) {
      clearTimeout(pressTimer)
      element.classList.remove('long-press')
    }
  })
  
  element.addEventListener('touchend', () => {
    clearTimeout(pressTimer)
    setTimeout(() => element.classList.remove('long-press'), 100)
  })
  
  // Desktop long press (mouse) - right click for popup
  element.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    callback()
  })
}

// Function to calculate time remaining until class ends
function getClassCountdown(item) {
  const now = getHKTDate()
  const currentTime = now.getHours() * 60 + now.getMinutes()
  const [endHour, endMin] = item.endTime.split(':').map(Number)
  const endTime = endHour * 60 + endMin
  
  // Check if class is currently happening
  const [startHour, startMin] = item.startTime.split(':').map(Number)
  const startTime = startHour * 60 + startMin
  
  const todayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()]
  const isToday = item.weekdays && item.weekdays.includes(todayName)
  const isCurrentlyHappening = isToday && currentTime >= startTime && currentTime < endTime
  
  if (!isCurrentlyHappening) {
    return null
  }
  
  const remainingMinutes = endTime - currentTime
  const hours = Math.floor(remainingMinutes / 60)
  const minutes = remainingMinutes % 60
  
  if (hours > 0) {
    return `Class ends in ${hours}h ${minutes}m`
  } else {
    return `Class ends in ${minutes}m`
  }
}

// Hover tooltip functionality
// Removed hover listener functionality as requested

// Show class popup
function showClassPopup(item) {
  const popup = document.getElementById('classPopup')
  const popupTitle = document.getElementById('popupTitle')
  const popupDetails = document.getElementById('popupDetails')
  
  popupTitle.textContent = item.title
  
  // Check for countdown
  const countdown = getClassCountdown(item)
  
  // If there's a countdown, put it at the top with more prominence
  const detailsHtml = `
    ${countdown ? `<div class="popup-detail-row countdown-highlight"><strong>⏰ ${countdown}</strong></div>` : ''}
    <div class="popup-detail-row"><strong>Course:</strong> ${item.title} (${item.crn})</div>
    <div class="popup-detail-row"><strong>Location:</strong> ${item.location}</div>
    <div class="popup-detail-row"><strong>Time:</strong> ${formatTimeRange(item.startTime, item.endTime)}</div>
    <div class="popup-detail-row"><strong>Professor:</strong> ${item.profName}</div>
    <div class="popup-detail-row"><strong>Days:</strong> ${item.weekdays ? item.weekdays.join(', ') : 'N/A'}</div>
    ${item.groupName ? `<div class="popup-detail-row"><strong>Group:</strong> ${item.groupName}</div>` : ''}
    ${item.groupMembers && item.groupMembers.length > 0 ? 
      `<div class="popup-detail-row"><strong>Members:</strong> ${item.groupMembers.map(m => m.name).join(', ')}</div>` : ''}
  `
  
  popupDetails.innerHTML = detailsHtml
  
  // Store item for full details button
  popup.dataset.itemData = JSON.stringify(item)
  
  popup.classList.add('show')
}

// Hide class popup
function hideClassPopup() {
  const popup = document.getElementById('classPopup')
  popup.classList.remove('show')
}

function showView(name){
  const homeView = document.getElementById('homeView')
  const addView = document.getElementById('addView')
  const monthlyView = document.getElementById('monthlyView')
  const detailView = document.getElementById('detailView')
  const listView = document.getElementById('listView')
  
  // Track previous view (don't track detail view transitions)
  const currentView = document.querySelector('.view:not(.hidden)')
  if (currentView && name !== 'detail') {
    const currentViewId = currentView.id
    if (currentViewId === 'homeView') previousView = 'home'
    else if (currentViewId === 'monthlyView') previousView = 'monthly'
    else if (currentViewId === 'listView') previousView = 'list'
    else if (currentViewId === 'addView') previousView = 'add'
  }
  
  // Hide all views first
  if (homeView) homeView.classList.add('hidden')
  if (addView) addView.classList.add('hidden')
  if (monthlyView) monthlyView.classList.add('hidden')
  if (detailView) detailView.classList.add('hidden')
  if (listView) listView.classList.add('hidden')
  
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
  } else if (name === 'detail' && detailView){
    detailView.classList.remove('hidden')
  } else if (name === 'list' && listView){
    listView.classList.remove('hidden')
    renderList()
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

  // compute occurrences for visible week (this week) using HKT
  const now = getHKTDate()
  const weekStart = startOfWeek(now) // Monday
  
  // Store current week start for comparison in refresh
  window._lastWeekStart = weekStart
  
  const occurrences = []
  data.forEach((item, idx) => {
    const start = getHKTDate(item.startDate)
    const end = getHKTDate(item.endDate)
    // iterate from weekStart to weekStart+27 (4 weeks)
    for (let d=0; d<7; d++){
      const day = getHKTDate(weekStart)
      day.setDate(weekStart.getDate()+d)
      const dayName = weekdayName(day)
      if (!item.weekdays.includes(dayName)) continue
      if (day < start || day > end) continue
      const iso = formatHKTDateString(day)
      if ((item.exceptions||[]).includes(iso)) continue
      occurrences.push({idx, item, day, iso})
    }
  })

  // current and next using HKT
  const nowTime = now.getHours()*60 + now.getMinutes()
  let current = null, next = null
  const occTimes = occurrences.map(o => {
    const [sh,sm] = o.item.startTime.split(':').map(Number)
    const [eh,em] = o.item.endTime.split(':').map(Number)
    const startM = sh*60+sm
    const endM = eh*60+em
    return {...o, startM, endM}
  }).sort((a,b)=> a.day - b.day || a.startM - b.startM)
  
  // Check for classes today and upcoming
  let hasClassesToday = false
  let nextToday = null
  
  for (const o of occTimes){
    const startM = o.startM
    const isToday = formatHKTDateString(o.day) === formatHKTDateString(now)
    
    // Check if current class
    if (isToday && startM <= nowTime && o.endM > nowTime) { 
      current = o
    }
    
    // Track if there are any classes today
    if (isToday) {
      hasClassesToday = true
      // Find next class today
      if (!nextToday && o.startM > nowTime) {
        nextToday = o
      }
    }
    
    // Find next class overall (today or future)
    if (!next && (o.day > now || (isToday && o.startM > nowTime))) { 
      next = o 
    }
  }
  
  // Update status display with enhanced messaging
  if (current) {
    document.getElementById('currentStatus').textContent = `Current: ${current.item.title} @ ${current.item.location} (${formatTimeRange(current.item.startTime,current.item.endTime)})`
  } else {
    document.getElementById('currentStatus').textContent = 'Current: No class in progress'
  }
  
  // Enhanced next class logic
  if (nextToday) {
    // Show next class today (no date needed)
    document.getElementById('nextStatus').textContent = `Next: ${nextToday.item.title} @ ${nextToday.item.location} (${formatTimeRange(nextToday.item.startTime,nextToday.item.endTime)})`
  } else if (next) {
    // Show next class from future days (with date)
    document.getElementById('nextStatus').textContent = `Next: ${next.item.title} @ ${next.item.location} on ${formatDate(next.day)} ${formatTimeRange(next.item.startTime,next.item.endTime)}`
  } else {
    document.getElementById('nextStatus').textContent = 'Next: No upcoming classes'
  }
  
  // Debug logging (temporary)
  console.log('Debug - Occurrences:', occurrences.length)
  console.log('Debug - Current:', current)
  console.log('Debug - Next Today:', nextToday)
  console.log('Debug - Next Overall:', next)
  console.log('Debug - Has Classes Today:', hasClassesToday)

  // Update timetable controls header with current week
  const weekEnd = getHKTDate(weekStart)
  weekEnd.setDate(weekStart.getDate() + 5) // Saturday
  const weekRange = `${weekStart.getDate()}/${weekStart.getMonth() + 1} - ${weekEnd.getDate()}/${weekEnd.getMonth() + 1}`
  document.querySelector('.timetable-controls h3').textContent = `Weekly Timetable (Mon–Sat) - ${weekRange}`

  // Calculate dynamic time range based on classes
  let earliestHour = 22
  let latestHour = 6
  
  data.forEach(item => {
    if (item.weekdays && item.weekdays.some(day => days.includes(day))) {
      const [startHour] = item.startTime.split(':').map(Number)
      const [endHour] = item.endTime.split(':').map(Number)
      earliestHour = Math.min(earliestHour, startHour)
      latestHour = Math.max(latestHour, endHour)
    }
  })
  
  // Default range if no classes
  if (earliestHour > latestHour) {
    earliestHour = 8
    latestHour = 18
  } else {
    // Add some padding, allow times from 0 (midnight) to 23 (11 PM)
    earliestHour = Math.max(0, earliestHour - 1)
    latestHour = Math.min(23, latestHour + 1)
  }

  // Clear previous content
  container.innerHTML = ''
  
  // Create table-based timetable structure
  const table = document.createElement('table')
  table.className = 'timetable-table'
  
  // Create table header
  const thead = document.createElement('thead')
  const headerRow = document.createElement('tr')
  
  // Add time column header
  const timeHeader = document.createElement('th')
  timeHeader.className = 'time-header'
  timeHeader.textContent = 'Time'
  headerRow.appendChild(timeHeader)
  
  // Add day headers
  days.forEach((dayName, dayIndex) => {
    const dayHeader = document.createElement('th')
    dayHeader.className = 'day-header'
    
    // Check if this is today
    const today = weekdayName(now)
    const isToday = dayName === today
    
    // Get the actual date for this day column
    const dayDate = getHKTDate(weekStart)
    dayDate.setDate(weekStart.getDate() + dayIndex)
    const dayNum = dayDate.getDate()
    const monthNum = dayDate.getMonth() + 1
    
    dayHeader.innerHTML = isToday ? `<strong>${dayName}</strong><br><small>${dayNum}/${monthNum}</small>` : `${dayName}<br><small>${dayNum}/${monthNum}</small>`
    
    if (isToday) {
      dayHeader.classList.add('today')
    }
    
    headerRow.appendChild(dayHeader)
  })
  
  thead.appendChild(headerRow)
  table.appendChild(thead)
  
  // Create table body
  const tbody = document.createElement('tbody')
  
  // Create time rows
  for (let h = earliestHour; h <= latestHour; h++) {
    const timeRow = document.createElement('tr')
    timeRow.className = 'time-row'
    timeRow.setAttribute('data-hour', h)
    
    // Time cell
    const timeCell = document.createElement('td')
    timeCell.className = 'time-cell'
    timeCell.textContent = (h < 10 ? '0' : '') + h + ':00'
    timeRow.appendChild(timeCell)
    
    // Day cells
    days.forEach((dayName, dayIndex) => {
      const dayCell = document.createElement('td')
      dayCell.className = 'day-cell'
      dayCell.setAttribute('data-day', dayName)
      dayCell.setAttribute('data-hour', h)
      
      // Check if this is today's column
      const today = weekdayName(now)
      const isToday = dayName === today
      
      if (isToday) {
        dayCell.classList.add('today-column')
        
        // Add current time indicator if this hour matches current time
        const currentHour = now.getHours()
        if (h === currentHour) {
          const currentTimeIndicator = document.createElement('div')
          currentTimeIndicator.className = 'current-time-indicator'
          
          const currentMinutes = now.getMinutes()
          const position = (currentMinutes / 60) * 100
          currentTimeIndicator.style.top = `${position}%`
          
          const timeLabel = document.createElement('span')
          timeLabel.className = 'current-time-label'
          timeLabel.textContent = getCurrentHKTTime()
          currentTimeIndicator.appendChild(timeLabel)
          
          dayCell.appendChild(currentTimeIndicator)
        }
      }
      
      timeRow.appendChild(dayCell)
    })
    
    tbody.appendChild(timeRow)
  }
  
  table.appendChild(tbody)
  container.appendChild(table)
  
  // Now position the classes on the table
  // Get all classes for this week and position them in the appropriate cells
  days.forEach((dayName, dayIndex) => {
    // Get classes for this day in this week
    const dayClasses = data.filter(item => {
      if (!item.weekdays || !item.weekdays.includes(dayName)) return false
      
      const start = getHKTDate(item.startDate)
      const end = getHKTDate(item.endDate)
      
      // Get the specific day for this column
      const checkDay = getHKTDate(weekStart)
      checkDay.setDate(weekStart.getDate() + dayIndex)
      
      if (checkDay < start || checkDay > end) return false
      
      const iso = formatHKTDateString(checkDay)
      if ((item.exceptions || []).includes(iso)) return false
      
      return true
    })
    
    // Sort classes by start time for proper overlap detection
    const sortedDayClasses = dayClasses.sort((a, b) => {
      const [aStartHour, aStartMin] = a.startTime.split(':').map(Number)
      const [bStartHour, bStartMin] = b.startTime.split(':').map(Number)
      const aStartMinutes = aStartHour * 60 + aStartMin
      const bStartMinutes = bStartHour * 60 + bStartMin
      
      if (aStartMinutes !== bStartMinutes) {
        return aStartMinutes - bStartMinutes
      }
      
      // If start times are the same, sort by end time
      const [aEndHour, aEndMin] = a.endTime.split(':').map(Number)
      const [bEndHour, bEndMin] = b.endTime.split(':').map(Number)
      return (aEndHour * 60 + aEndMin) - (bEndHour * 60 + bEndMin)
    })
    
    // Create a map of time slots to detect overlapping classes
    const timeSlotMap = []
    
    // First pass: determine track assignments without creating cards
    const classTracks = []
    sortedDayClasses.forEach((item, classIndex) => {
      const [startHour, startMin] = item.startTime.split(':').map(Number)
      const [endHour, endMin] = item.endTime.split(':').map(Number)
      
      // Calculate precise position to align with hour grid boxes
      const startOffsetInMinutes = (startHour - earliestHour) * 60 + startMin
      const endOffsetInMinutes = (endHour - earliestHour) * 60 + endMin
      
      // Find which track (horizontal position) this class should go in to avoid overlaps
      let track = 0
      let foundTrack = false
      
      while (!foundTrack) {
        // Check if this track is free for the entire duration of the class
        let trackFree = true
        for (let min = startOffsetInMinutes; min < endOffsetInMinutes; min++) {
          if (timeSlotMap[min] && timeSlotMap[min][track]) {
            trackFree = false
            break
          }
        }
        
        if (trackFree) {
          foundTrack = true
        } else {
          track++;
        }
      }
      
      // Mark this track as occupied for the duration of the class
      for (let min = startOffsetInMinutes; min < endOffsetInMinutes; min++) {
        if (!timeSlotMap[min]) timeSlotMap[min] = {};
        timeSlotMap[min][track] = true;
      }
      
      // Store track assignment for this class
      classTracks[classIndex] = track
    })
    
    // Calculate the total number of tracks needed for this day
    const totalTracks = Math.max(1, Object.keys(timeSlotMap.reduce((acc, slot) => {
      if (!slot) return acc;
      Object.keys(slot).forEach(t => acc[t] = true);
      return acc;
    }, {})).length);
    
    // Second pass: create the class cards with correct widths and positions
    sortedDayClasses.forEach((item, classIndex) => {
      const [startHour, startMin] = item.startTime.split(':').map(Number)
      const [endHour, endMin] = item.endTime.split(':').map(Number)
      
      // Check if this specific date is in the exceptions list
      const checkDay = getHKTDate(weekStart)
      checkDay.setDate(weekStart.getDate() + dayIndex)
      const dateStr = formatHKTDateString(checkDay)
      const isException = (item.exceptions || []).includes(dateStr)
      
      // Determine if this is the current class
      const isCurrent = current && current.item === item && 
                        formatHKTDateString(current.day) === formatHKTDateString(checkDay)
      
      // Get the assigned track for this class
      const track = classTracks[classIndex]
      
      // Create class element
      const classElement = document.createElement('div')
      classElement.className = `class-card table-positioned${isCurrent ? ' current-class' : ''}${isException ? ' exception-class' : ''}`
      
      // Calculate the duration in hours
      const startMinutes = startHour * 60 + startMin
      const endMinutes = endHour * 60 + endMin
      const durationMinutes = endMinutes - startMinutes
      const durationHours = durationMinutes / 60
      
      // Position the class element
      // Height should span multiple cells if the class is longer than 1 hour
      // Use responsive cell heights to match CSS
      let cellHeight = 60; // Default desktop height
      if (window.innerWidth <= 480) {
        cellHeight = 45; // Small screens
      } else if (window.innerWidth <= 768) {
        cellHeight = 50; // Mobile screens
      }
      
      const totalHeightPx = durationHours * cellHeight - 4; // Reduce by 4px to prevent overflow
      classElement.style.height = `${totalHeightPx}px`
      classElement.style.top = `${(startMin / 60) * cellHeight}px`
      
      // Set width and left position based on total tracks and assigned track
      if (totalTracks > 1) {
        // Multiple overlapping classes - distribute them horizontally
        const trackWidth = 100 / totalTracks;
        classElement.style.width = `calc(${trackWidth}% - 2px)`;
        classElement.style.left = `calc(${track * trackWidth}% + 1px)`;
        classElement.style.right = 'auto';
      } else {
        // Single class - use default CSS (full width)
        classElement.style.width = '';
        classElement.style.left = '';
        classElement.style.right = '';
      }
      
      // Class content
      classElement.innerHTML = `
        <div class="class-content">
          <div class="class-title">${escapeHtml(item.title)}</div>
          <div class="class-time">${formatTimeRange(item.startTime, item.endTime)}</div>
          <div class="class-location">${escapeHtml(item.location)}</div>
          ${isException ? '<div class="exception-note">No Class This Week</div>' : ''}
          ${durationHours > 1 ? `<div class="class-meta">Prof: ${escapeHtml(item.profName)}</div>` : ''}
        </div>
      `
      
      // Add event listeners
      classElement.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        showClassPopup(item)
      })
      
      classElement.addEventListener('touchend', (e) => {
        e.preventDefault()
        showClassPopup(item)
      })
      
      addLongPressListener(classElement, () => showClassDetails(item))
      
      // Find the appropriate table cell and append the class
      const targetCell = table.querySelector(`td[data-day="${dayName}"][data-hour="${startHour}"]`)
      if (targetCell) {
        targetCell.appendChild(classElement)
      }
    })
  })

  container.appendChild(table)

  // Set up auto-refresh of the timetable every minute to keep the time indicator up-to-date
  clearTimeout(window._timetableRefreshTimer)
  window._timetableRefreshTimer = setTimeout(() => {
    if (document.visibilityState === 'visible') {
      // Check if we need to refresh due to week change
      const currentWeekStart = startOfWeek(getHKTDate())
      const previousWeekStart = window._lastWeekStart || currentWeekStart
      window._lastWeekStart = currentWeekStart
      
      if (currentWeekStart.getTime() !== previousWeekStart.getTime()) {
        // Week has changed, refresh the timetable
        render()
      } else {
        // Just refresh the time indicator
        render()
      }
    }
  }, 60000) // Refresh every minute
}

// Monthly calendar variables
let currentMonthDate = getHKTDate()

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
  
  // Get first day of month and last day of month using HKT
  const firstDay = getHKTDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 1))
  const lastDay = getHKTDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 0))
  
  // Get the day of week for first day (0 = Sunday, 1 = Monday, etc.)
  let startDate = getHKTDate(firstDay)
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
  let currentDate = getHKTDate(startDate)
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
      
      // Style for today using HKT
      const today = getHKTDate()
      if (formatHKTDateString(currentDate) === formatHKTDateString(today)) {
        dayCell.classList.add('today')
      }
      
      dayCell.appendChild(dayNumber)
      
      // Add events for this day
      const dayEvents = getEventsForDay(data, currentDate)
      dayEvents.forEach(event => {
        const eventDiv = document.createElement('div')
        eventDiv.className = 'calendar-event'
        
        // Enhanced tooltip with group info
        let tooltipText = `${event.item.title} (${event.item.crn})\nLocation: ${event.item.location}\nTime: ${formatTimeRange(event.item.startTime, event.item.endTime)}\nProfessor: ${event.item.profName}`
        if (event.item.profEmail) tooltipText += `\nProf Email: ${event.item.profEmail}`
        if (event.item.contactEmail) tooltipText += `\nContact Email: ${event.item.contactEmail}`
        if (event.item.groupName) {
          tooltipText += `\nGroup: ${event.item.groupName}`
          if (event.item.groupMembers && event.item.groupMembers.length > 0) {
            tooltipText += '\nMembers: ' + event.item.groupMembers.map(m => m.name).join(', ')
          }
        }
        eventDiv.title = tooltipText
        
        eventDiv.textContent = `${event.item.title} ${formatTimeRange(event.item.startTime, event.item.endTime)}`
        
        // Add click functionality for popup (same as weekly view)
        eventDiv.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          showClassPopup(event.item)
        })
        
        // Add long press functionality for detail page
        addLongPressListener(eventDiv, () => showClassDetails(event.item))
        
        // Add hover functionality
        // Hover functionality removed
        
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
  const todayBtn = document.getElementById('todayMonth')
  
  // Remove existing listeners to prevent duplicates
  const newPrevBtn = prevBtn.cloneNode(true)
  const newNextBtn = nextBtn.cloneNode(true)
  const newTodayBtn = todayBtn.cloneNode(true)
  prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn)
  nextBtn.parentNode.replaceChild(newNextBtn, nextBtn)
  todayBtn.parentNode.replaceChild(newTodayBtn, todayBtn)
  
  newPrevBtn.addEventListener('click', () => {
    currentMonthDate.setMonth(currentMonthDate.getMonth() - 1)
    renderMonthly()
  })
  
  newNextBtn.addEventListener('click', () => {
    currentMonthDate.setMonth(currentMonthDate.getMonth() + 1)
    renderMonthly()
  })
  
  newTodayBtn.addEventListener('click', () => {
    currentMonthDate = getHKTDate()
    renderMonthly()
  })
}

// Get events for a specific day
function getEventsForDay(data, date) {
  const events = []
  const dateStr = formatHKTDateString(date)
  const dayName = weekdayName(date)
  
  data.forEach((item, idx) => {
    const start = getHKTDate(item.startDate)
    const end = getHKTDate(item.endDate)
    
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
  
  // Sort events by start time
  events.sort((a, b) => {
    const timeA = a.item.startTime || '00:00'
    const timeB = b.item.startTime || '00:00'
    return timeA.localeCompare(timeB)
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
    
    const dateSpan = document.createElement('span')
    dateSpan.textContent = d
    li.appendChild(dateSpan)
    
    const rem = document.createElement('button')
    rem.className = 'btn btn-sm btn-danger'
    rem.textContent = 'Remove'
    rem.addEventListener('click', ()=> li.remove())
    li.appendChild(rem)
    
    list.appendChild(li)
  })
  
  // Load group information
  document.getElementById('groupName').value = item.groupName || ''
  const membersList = document.getElementById('membersList')
  membersList.innerHTML = ''
  if (item.groupMembers && item.groupMembers.length > 0) {
    item.groupMembers.forEach(member => {
      const memberDiv = document.createElement('div')
      memberDiv.className = 'member-item'
      memberDiv.innerHTML = `
        <div class="member-info">
          <div class="member-name">${escapeHtml(member.name)}</div>
          <div class="member-contact">${escapeHtml(member.contact || 'No contact info')}</div>
        </div>
        <button class="remove-member" onclick="this.parentElement.remove()">Remove</button>
      `
      membersList.appendChild(memberDiv)
    })
  }
}

function deleteClass(index) {
  if (confirm('Are you sure you want to delete this class?')) {
    const data = loadData()
    data.splice(index, 1)
    saveData(data)
    
    // Refresh current view
    const currentView = document.querySelector('.view:not(.hidden)')
    if (currentView) {
      const viewId = currentView.id
      if (viewId === 'homeView') {
        render()
      } else if (viewId === 'monthlyView') {
        renderMonthly()
      } else if (viewId === 'listView') {
        renderList()
      }
    }
  }
}

function startOfWeek(d){
  // return Monday of the week of date d in HKT
  const dt = getHKTDate(d)
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
  return getHKTDate(d).toLocaleDateString('en-HK', { 
    timeZone: 'Asia/Hong_Kong',
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  })
}

function showClassDetails(item){
  // Capture current view before switching to detail
  const currentView = document.querySelector('.view:not(.hidden)')
  if (currentView) {
    const currentViewId = currentView.id
    if (currentViewId === 'homeView') previousView = 'home'
    else if (currentViewId === 'monthlyView') previousView = 'monthly'
    else if (currentViewId === 'listView') previousView = 'list'
    else if (currentViewId === 'addView') previousView = 'add'
  }
  
  const detailsHtml = `
    <div class="detail-row"><strong>Course:</strong> ${item.title} (${item.crn})</div>
    <div class="detail-row"><strong>Location:</strong> ${item.location}</div>
    <div class="detail-row"><strong>Time:</strong> ${formatTimeRange(item.startTime, item.endTime)}</div>
    <div class="detail-row"><strong>Professor:</strong> ${item.profName}</div>
    <div class="detail-row"><strong>Professor Email:</strong> ${formatClickableEmail(item.profEmail)}</div>
    <div class="detail-row"><strong>Contact Email:</strong> ${formatClickableEmail(item.contactEmail)}</div>
    <div class="detail-row"><strong>Days:</strong> ${item.weekdays ? item.weekdays.join(', ') : 'N/A'}</div>
    <div class="detail-row"><strong>Period:</strong> ${item.startDate} to ${item.endDate}</div>
    ${item.exceptions && item.exceptions.length > 0 ? 
      `<div class="detail-row"><strong>Exceptions:</strong> ${item.exceptions.join(', ')}</div>` : ''}
    ${item.groupName ? 
      `<div class="detail-row"><strong>Group:</strong> ${item.groupName}</div>` : ''}
    ${item.groupMembers && item.groupMembers.length > 0 ? 
      `<div class="detail-row"><strong>Group Members:</strong><br>
        ${item.groupMembers.map(member => 
          `• ${member.name}${member.contact ? ' (' + formatClickableContact(member.contact) + ')' : ''}`
        ).join('<br>')}</div>` : ''}
  `
  
  document.getElementById('classDetails').innerHTML = detailsHtml
  
  // Store current item for edit/delete actions
  window.currentDetailItem = item
  
  showView('detail')
}

function renderList(){
  const container = document.getElementById('classList')
  const data = loadData()
  
  if (!data.length) {
    container.innerHTML = '<div class="no-classes">No classes found. Add some classes to see them here.</div>'
    return
  }
  
  // Clear container
  container.innerHTML = ''
  
  // Sort classes by title
  const sortedData = [...data].sort((a, b) => {
    const titleA = a.title || a.crn || ''
    const titleB = b.title || b.crn || ''
    return titleA.localeCompare(titleB)
  })
  
  sortedData.forEach((item) => {
    const actualIndex = data.indexOf(item)
    const weekdaysStr = item.weekdays ? item.weekdays.join(', ') : 'N/A'
    const timeStr = formatTimeRange(item.startTime, item.endTime)
    
    // Create list item element
    const listItem = document.createElement('div')
    listItem.className = 'list-item'
    
    // Create content
    const listHTML = `
      <div class="list-header">
        <div class="list-title">${item.title || 'Untitled'}</div>
        <div class="list-crn">${item.crn || 'No CRN'}</div>
      </div>
      <div class="list-details">
        <div class="list-time">${timeStr}</div>
        <div class="list-days">${weekdaysStr}</div>
        <div class="list-location">${item.location || 'No location'}</div>
      </div>
      <div class="list-period">${item.startDate} to ${item.endDate}</div>
      ${item.exceptions && item.exceptions.length > 0 ? 
        `<div class="list-exceptions">Exceptions: ${item.exceptions.join(', ')}</div>` : ''}
      ${item.groupName ? 
        `<div class="list-group">Group: ${item.groupName}${item.groupMembers && item.groupMembers.length > 0 ? ` (${item.groupMembers.length} members)` : ''}</div>` : ''}
    `
    
    listItem.innerHTML = listHTML
    
    // Add click listener for showing details
    listItem.addEventListener('click', () => showClassDetails(item))
    
    // Add hover listener for tooltip
    // Hover functionality removed
    
    // Create actions container
    const actionsDiv = document.createElement('div')
    actionsDiv.className = 'list-actions'
    
    // Create edit button
    const editBtn = document.createElement('button')
    editBtn.className = 'edit-btn'
    editBtn.textContent = 'Edit'
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      loadIntoForm(actualIndex)
    })
    
    // Create delete button
    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'delete-btn'
    deleteBtn.textContent = 'Delete'
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      deleteClass(actualIndex)
    })
    
    actionsDiv.appendChild(editBtn)
    actionsDiv.appendChild(deleteBtn)
    listItem.appendChild(actionsDiv)
    
    container.appendChild(listItem)
  })
}

