let selectedDate = null;
let selectedTime = null;
let selectedService = null;
let selectedDuration = null;

const socket = io();

// Add socket listener for schedule updates
socket.on('scheduleUpdate', (newSchedule) => {
    console.log('Received schedule update:', newSchedule); // Debug log
    window.serverSchedule = newSchedule;
    
    // If modal is open, re-render the calendar
    const modal = document.getElementById('bookingModal');
    if (modal && modal.style.display === 'flex') {
        const currentDate = new Date(document.querySelector('.current-month').dataset.date);
        renderCalendar(currentDate);
    }
});

// Add these utility functions at the top of the file after the initial variables
function showLoading(show) {
    const loader = document.querySelector('.loader');
    if (show) {
        if (!loader) {
            const loaderHTML = `
                <div class="loader">
                    <div class="spinner"></div>
                    <p>Loading...</p>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', loaderHTML);
        }
    } else if (loader) {
        loader.remove();
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }, 100);
}

function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initBookingModal();
});

function initBookingModal() {
    const modal = document.getElementById('bookingModal');
    const closeBtn = document.querySelector('.close-modal');
    
    // Event listeners for booking buttons
    document.querySelectorAll('.book-button, .book-nav-button').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent any default button behavior
            selectedService = button.dataset.service;
            selectedDuration = button.dataset.duration;
            openBookingModal();
        });
    });
    
    // Close button event listener
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeBookingModal();
        });
    }
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeBookingModal();
        }
    });

    // Initialize the first view
    if (modal) {
        console.log('Modal initialized'); // Debug log
    }
}

function openBookingModal() {
    console.log('Opening modal'); // Debug log
    const modal = document.getElementById('bookingModal');
    if (modal) {
        modal.style.display = 'flex'; // Changed to flex for better centering
        renderCalendar(new Date());
    }
}

function closeBookingModal() {
    const modal = document.getElementById('bookingModal');
    if (modal) {
        modal.style.display = 'none';
        resetBookingForm();
    }
}

// Calendar Navigation
function changeMonth(delta) {
    const currentDate = new Date(`${document.querySelector('.current-month').dataset.date}T00:00:00`);
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1);
    const today = new Date();
    
    // Set hours to 0 for proper date comparison
    today.setHours(0, 0, 0, 0);
    
    // If trying to go to a past month, stay on current month
    if (newDate < today && delta < 0) {
        newDate.setMonth(today.getMonth());
        newDate.setFullYear(today.getFullYear());
    }
    
    renderCalendar(newDate);
}

// Render calendar with available dates
async function renderCalendar(date) {
    try {
        showLoading(true);
        const calendar = document.getElementById('bookingCalendar');
        const monthDisplay = document.querySelector('.current-month');
        
        // Ensure we're not showing past months
        const today = new Date();
        if (date < today) {
            date = today;
        }
        
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        
        // Format month display
        monthDisplay.textContent = date.toLocaleDateString('en-US', { 
            month: 'long', 
            year: 'numeric' 
        });
        monthDisplay.dataset.date = formatLocalDate(new Date(date.getFullYear(), date.getMonth(), 1));
        
        // Get booked slots for the month
        const bookedRes = await fetch(`/api/bookings/month/${date.getFullYear()}/${date.getMonth() + 1}`, {
            headers: { 'Accept': 'application/json' }
        });

        if (!bookedRes.ok) {
            console.error('Bookings fetch failed:', await bookedRes.text());
            throw new Error('Failed to fetch bookings');
        }

        const bookedDays = await bookedRes.json();
        const schedule = window.serverSchedule; // Use the current schedule from window object
        
        let calendarHTML = '<div class="calendar-grid">';
        
        // Add days of week headers
        const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        weekdays.forEach(day => {
            calendarHTML += `<div class="weekday">${day}</div>`;
        });
        
        // Add empty cells for days before the first day of the month
        for (let i = 0; i < firstDay.getDay(); i++) {
            calendarHTML += '<div class="calendar-day empty"></div>';
        }
        
        // Add days of the month
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const currentDate = new Date(date.getFullYear(), date.getMonth(), day);
            const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
            const dateString = formatLocalDate(currentDate);
            
            const daySchedule = schedule[dayOfWeek];
            const isScheduledDay = daySchedule && daySchedule.isOpen;
            const bookedDay = bookedDays.find(bd => bd.date === dateString);
            const isFullyBooked = bookedDay && bookedDay.booking_count >= getMaxBookingsForDay(daySchedule);
            const isPastDate = currentDate < today;
            
            const classes = [
                'calendar-day',
                isScheduledDay && !isPastDate && !isFullyBooked ? 'available' : 'unavailable',
                isPastDate ? 'past' : '',
                isFullyBooked ? 'fully-booked' : '',
                currentDate.toDateString() === today.toDateString() ? 'today' : ''
            ].filter(Boolean).join(' ');
            
            const isClickable = isScheduledDay && !isPastDate && !isFullyBooked;
            
            calendarHTML += `
                <div class="${classes}"
                     data-date="${dateString}"
                     ${isClickable ? `onclick="selectDate('${dateString}')"` : ''}
                >
                    <span class="day-number">${day}</span>
                    ${currentDate.toDateString() === today.toDateString() ? '<span class="today-marker"></span>' : ''}
                    ${isFullyBooked ? '<span class="fully-booked-marker">Fully Booked</span>' : ''}
                    ${!isScheduledDay && !isPastDate ? '<span class="fully-booked-marker">Closed</span>' : ''}
                </div>`;
        }
        
        calendarHTML += '</div>';
        calendar.innerHTML = calendarHTML;
        
    } catch (error) {
        console.error('Error rendering calendar:', error);
        showToast('Failed to load calendar. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// Handle date selection and fetch available time slots
async function selectDate(date) {
    try {
        showLoading(true);
        selectedDate = date;
        
        const perthDate = moment.tz(date, 'Australia/Perth');
        const dayOfWeek = perthDate.format('dddd');
        const formattedDate = perthDate.format('dddd, MMMM D, YYYY');
        
        // Get schedule for the selected day
        const daySchedule = window.serverSchedule[dayOfWeek];
        if (!daySchedule || !daySchedule.isOpen) {
            showToast(`${dayOfWeek} is not available for bookings`, 'error');
            return;
        }

        // Fetch booked slots for the date
        const response = await fetch(`/api/bookings/date/${date}`);
        if (!response.ok) {
            throw new Error('Failed to fetch booked slots');
        }
        const bookedSlots = await response.json();

        // Generate time slots
        const { start, end } = daySchedule.hours;
        const timeSlots = generateTimeSlots(start, end, selectedDuration);
        
        // Update UI with available time slots
        const slotSelection = document.getElementById('slotSelection');
        slotSelection.innerHTML = `
            <div class="booking-modal-header">
                <button class="back-button" onclick="backToCalendar()">
                    <i class="fas fa-arrow-left"></i> Back to Calendar
                </button>
                <h3 class="selected-date">${formattedDate}</h3>
            </div>
            <div class="schedule-info">
                <p>Available Times (${start} - ${end})</p>
            </div>
            <div class="time-slots">
                ${timeSlots.map(time => {
                    const isBooked = bookedSlots.includes(time);
                    return `
                        <div class="time-slot ${isBooked ? 'booked' : ''}" 
                             ${!isBooked ? `onclick="selectTimeSlot('${time}')"` : ''}>
                            ${time}
                            ${isBooked ? '<span class="booked-status">Booked</span>' : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        
        // Show the slot selection view
        document.getElementById('dateSelection').style.display = 'none';
        slotSelection.style.display = 'block';
        
    } catch (error) {
        console.error('Error loading time slots:', error);
        showToast('Failed to load available times', 'error');
    } finally {
        showLoading(false);
    }
}

async function fetchSchedule(dayOfWeek) {
    const response = await fetch('/api/schedule');
    if (!response.ok) throw new Error('Failed to fetch schedule');
    const schedule = await response.json();
    return schedule[dayOfWeek];
}

async function fetchAvailableSlots(date) {
    const response = await fetch(`/api/available-slots?date=${date}`);
    if (!response.ok) throw new Error('Failed to fetch available slots');
    return response.json();
}

// Add helper function to generate time slots
function generateTimeSlots(startTime, endTime, duration) {
    if (!startTime || !endTime || !duration) return [];
    
    const slots = [];
    const durationMinutes = parseInt(duration);
    
    // Convert start and end times to minutes since midnight
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    
    for (let minutes = startMinutes; minutes + durationMinutes <= endMinutes; minutes += durationMinutes) {
        slots.push(formatTimeFromMinutes(minutes));
    }
    
    return slots;
}

// Add these helper functions
function timeToMinutes(timeStr) {
    const [time, meridian] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    
    if (meridian === 'PM' && hours !== 12) {
        hours += 12;
    } else if (meridian === 'AM' && hours === 12) {
        hours = 0;
    }
    
    return hours * 60 + minutes;
}

function formatTimeFromMinutes(minutes) {
    let hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const meridian = hours >= 12 ? 'PM' : 'AM';
    
    if (hours > 12) {
        hours -= 12;
    } else if (hours === 0) {
        hours = 12;
    }
    
    return `${hours}:${mins.toString().padStart(2, '0')} ${meridian}`;
}

function convertTimeStringToMinutes(timeStr) {
    const [time, meridian] = timeStr.split(' ');
    const [hours, minutes] = time.split(':').map(Number);
    let totalMinutes = hours * 60 + minutes;
    
    if (meridian === 'PM' && hours !== 12) {
        totalMinutes += 12 * 60;
    } else if (meridian === 'AM' && hours === 12) {
        totalMinutes = minutes;
    }
    
    return totalMinutes;
}

function convertMinutesToTimeString(minutes) {
    let hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    let meridian = 'AM';
    
    if (hours >= 12) {
        meridian = 'PM';
        if (hours > 12) hours -= 12;
    }
    if (hours === 0) hours = 12;
    
    return `${hours}:${mins.toString().padStart(2, '0')} ${meridian}`;
}

// Display available time slots
async function displayTimeSlots(availableSlots, bookedSlots) {
    const slotSelection = document.getElementById('slotSelection');
    const slotsContainer = document.getElementById('slotsContainer');
    const dateSelection = document.getElementById('dateSelection');
    
    let slotsHTML = `
        <div class="slots-header">
            <button class="back-button" onclick="backToCalendar()">
                <i class="fas fa-arrow-left"></i> Back to Calendar
            </button>
            <h3>${new Date(selectedDate).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })}</h3>
        </div>
        <div class="slots-grid">
    `;

    if (availableSlots.length === 0) {
        slotsHTML += `<div class="no-slots-message">No available time slots for this date.</div>`;
    } else {
        const allSlots = [...availableSlots];
        allSlots.sort((a, b) => {
            const timeA = new Date(`1970/01/01 ${a}`);
            const timeB = new Date(`1970/01/01 ${b}`);
            return timeA - timeB;
        });

        allSlots.forEach(slot => {
            const endTime = calculateEndTime(slot, selectedDuration);
            const isBooked = bookedSlots.some(bookedSlot => bookedSlot.time === slot);
            
            slotsHTML += `
                <div class="time-slot ${isBooked ? 'booked' : ''} ${slot === selectedTime ? 'selected' : ''}"
                     ${!isBooked ? `onclick="selectTimeSlot('${slot}')"` : ''}>
                    ${time} - ${formatTime(endTime)}
                    ${isBooked ? '<div class="booked-overlay">Booked</div>' : ''}
                </div>
            `;
        });
    }
    
    slotsHTML += '</div>';
    slotsContainer.innerHTML = slotsHTML;
    
    dateSelection.style.display = 'none';
    slotSelection.style.display = 'block';
}

// Add helper function to calculate end time
function calculateEndTime(startTime, duration) {
    const [hours, minutes] = startTime.split(':');
    const date = new Date();
    date.setHours(parseInt(hours));
    date.setMinutes(parseInt(minutes) + parseInt(duration));
    return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
}

// Helper function to format time
function formatTime(time) {
    // Check if time is an object with available property
    if (typeof time === 'object' && time.hasOwnProperty('time')) {
        time = time.time;
    }
    
    if (!time || typeof time !== 'string') {
        return 'Invalid Time';
    }

    try {
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const formattedHour = hour % 12 || 12;
        return `${formattedHour}:${minutes} ${ampm}`;
    } catch (error) {
        console.error('Error formatting time:', error);
        return 'Invalid Time Format';
    }
}

// Handle time slot selection
function selectTimeSlot(time) {
    selectedTime = time;
    
    // Update UI to show selected slot
    document.querySelectorAll('.time-slot').forEach(slot => {
        slot.classList.remove('selected');
        if (slot.textContent.trim() === formatTime(time)) {
            slot.classList.add('selected');
        }
    });
    
    // Show booking form
    showBookingForm();
}

// Show booking form after time slot selection
function showBookingForm() {
    const slotSelection = document.getElementById('slotSelection');
    const bookingForm = document.getElementById('bookingForm');
    
    // Format date and time for display using moment-timezone
    const formattedDate = moment.tz(selectedDate, 'Australia/Perth')
        .format('dddd, MMMM D, YYYY');
    
    bookingForm.innerHTML = `
        <div class="booking-summary">
            <h3>Booking Summary</h3>
            <div class="summary-details">
                <div class="summary-item">
                    <i class="fas fa-cut"></i>
                    <span>${selectedService}</span>
                </div>
                <div class="summary-item">
                    <i class="fas fa-calendar"></i>
                    <span>${formattedDate}</span>
                </div>
                <div class="summary-item">
                    <i class="fas fa-clock"></i>
                    <span>${formatTime(selectedTime)}</span>
                </div>
            </div>
        </div>
        <div class="booking-form">
            <div class="form-group">
                <label for="customerName">
                    <i class="fas fa-user"></i>
                    Your Name
                </label>
                <input type="text" id="customerName" required 
                       placeholder="Enter your full name">
            </div>
            <div class="form-group">
                <label for="customerPhone">
                    <i class="fas fa-phone"></i>
                    Phone Number
                </label>
                <input type="tel" id="customerPhone" required 
                       pattern="[0-9]{10}"
                       maxlength="10"
                       placeholder="Example: 0434863410"
                       oninput="this.value = this.value.replace(/[^0-9]/g, '').slice(0, 10)">
                <small class="phone-hint">Please enter a 10-digit phone number</small>
            </div>
            <div class="form-actions">
                <button class="back-button" onclick="backToTimeSlots()">
                    <i class="fas fa-arrow-left"></i> Back
                </button>
                <button class="confirm-button" onclick="submitBooking()">
                    Confirm Booking <i class="fas fa-check"></i>
                </button>
            </div>
        </div>
    `;
    
    slotSelection.style.display = 'none';
    bookingForm.style.display = 'block';
}

// Add back to time slots function
function backToTimeSlots() {
    document.getElementById('bookingForm').style.display = 'none';
    document.getElementById('slotSelection').style.display = 'block';
}

// Back to calendar view
function backToCalendar() {
    document.getElementById('slotSelection').style.display = 'none';
    document.getElementById('dateSelection').style.display = 'block';
    selectedTime = null;
}

// Reset booking form
function resetBookingForm() {
    selectedDate = null;
    selectedTime = null;
    document.getElementById('customerName').value = '';
    document.getElementById('customerPhone').value = '';
    document.getElementById('dateSelection').style.display = 'block';
    document.getElementById('slotSelection').style.display = 'none';
    document.getElementById('bookingForm').style.display = 'none';
}

// Add this CSS selector helper for the time slot selection
Element.prototype.matches = Element.prototype.matches || Element.prototype.msMatchesSelector;
Element.prototype.closest = Element.prototype.closest || function (selector) {
    let el = this;
    while (el) {
        if (el.matches(selector)) {
            return el;
        }
        el = el.parentElement;
    }
    return null;
};

// Handle booking submission
async function submitBooking() {
    const customerName = document.getElementById('customerName').value.trim();
    const customerPhone = document.getElementById('customerPhone').value.trim();
    
    if (!customerName) {
        showToast('Please enter your name', 'error');
        return;
    }
    
    if (!customerPhone || customerPhone.length !== 10 || !/^\d{10}$/.test(customerPhone)) {
        showToast('Please enter a valid 10-digit phone number', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/bookings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                customerName,
                phone: customerPhone,
                service: selectedService,
                duration: selectedDuration,
                date: selectedDate,
                time: selectedTime
            })
        });
        
        if (!response.ok) {
            let errorMessage = 'Booking failed';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (_) {}
            throw new Error(errorMessage);
        }
        
        showToast('Booking submitted successfully!', 'success');
        closeBookingModal();
    } catch (error) {
        console.error('Error submitting booking:', error);
        showToast(error.message || 'Failed to submit booking. Please try again.', 'error');
    }
}

// Helper function to calculate max bookings for a day
function getMaxBookingsForDay(daySchedule) {
    if (!daySchedule || !daySchedule.isOpen) return 0;
    
    const startHour = convertTo24Hour(daySchedule.hours.start);
    const endHour = convertTo24Hour(daySchedule.hours.end);
    const duration = parseInt(selectedDuration);
    
    const totalMinutes = (endHour - startHour) * 60;
    return Math.floor(totalMinutes / duration);
}

// Add this helper function at the top with other utility functions
function convertTo24Hour(timeStr) {
    if (!timeStr) return 0;
    const [time, meridian] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    
    if (meridian === 'PM' && hours !== 12) {
        hours += 12;
    } else if (meridian === 'AM' && hours === 12) {
        hours = 0;
    }
    
    return hours;
} 