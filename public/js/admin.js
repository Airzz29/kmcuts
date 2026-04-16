const socket = io();

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const RETRY_LIMIT = 3;

let currentSchedule = {};
let currentBookings = [];
let searchQuery = '';
let activeStatus = 'pending';
let retryCount = 0;

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach((tab) => tab.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach((btn) => btn.classList.remove('active'));
    document.getElementById(`${tabName}-tab`)?.classList.add('active');
    document.querySelector(`[onclick="showTab('${tabName}')"]`)?.classList.add('active');
}

function normalizeBookingForView(booking) {
    return {
        ...booking,
        customer_name: booking.customer_name || booking.customerName || 'No name provided',
        customerName: booking.customerName || booking.customer_name || 'No name provided',
        duration: Number(booking.duration || 0),
        id: Number(booking.id)
    };
}

function bookingDateTimeValue(booking) {
    return moment.tz(`${booking.date} ${booking.time}`, 'YYYY-MM-DD h:mm A', 'Australia/Perth').valueOf();
}

function getFilteredBookings() {
    const dateFilter = document.getElementById('bookingDateFilter')?.value || '';
    const sortDirection = document.getElementById('bookingSort')?.value || 'desc';

    let bookings = currentBookings
        .map(normalizeBookingForView)
        .filter((booking) => booking.status === activeStatus);

    if (searchQuery && activeStatus === 'accepted') {
        bookings = bookings.filter((booking) =>
            booking.customer_name.toLowerCase().includes(searchQuery) ||
            booking.phone.toLowerCase().includes(searchQuery)
        );
    }

    if (dateFilter) {
        bookings = bookings.filter((booking) => booking.date === dateFilter);
    }

    bookings.sort((a, b) => {
        const diff = bookingDateTimeValue(a) - bookingDateTimeValue(b);
        return sortDirection === 'asc' ? diff : -diff;
    });

    return bookings;
}

function renderBookingsSummary(filteredBookings) {
    const summaryEl = document.getElementById('bookingsSummary');
    if (!summaryEl) return;

    const dateGroups = new Set(filteredBookings.map((b) => b.date)).size;
    summaryEl.textContent = `${filteredBookings.length} ${activeStatus} bookings across ${dateGroups} day(s)`;
}

function renderBookingsList() {
    const bookingsList = document.querySelector('.bookings-list');
    if (!bookingsList) return;

    const filteredBookings = getFilteredBookings();
    renderBookingsSummary(filteredBookings);

    if (!filteredBookings.length) {
        bookingsList.innerHTML = '<div class="booking-card">No bookings found for current filters.</div>';
        return;
    }

    const grouped = filteredBookings.reduce((acc, booking) => {
        if (!acc[booking.date]) acc[booking.date] = [];
        acc[booking.date].push(booking);
        return acc;
    }, {});

    bookingsList.innerHTML = Object.entries(grouped).map(([date, bookings]) => {
        const heading = moment.tz(date, 'Australia/Perth').format('dddd, MMMM D, YYYY');
        const cards = bookings.map((booking) => `
            <div class="booking-card ${booking.status}" data-status="${booking.status}" data-booking-id="${booking.id}">
                <div class="booking-info">
                    <h3>${booking.customer_name}</h3>
                    <div class="booking-details">
                        <p class="service-info"><i class="fas fa-cut"></i><span>${booking.service} (${booking.duration}min)</span></p>
                        <p class="date-info"><i class="fas fa-calendar"></i><span>${heading}</span></p>
                        <p class="time-info"><i class="fas fa-clock"></i><span>${booking.time}</span></p>
                        <p class="phone-info"><i class="fas fa-phone"></i><span>${booking.phone}</span></p>
                        <p class="status ${booking.status}">Status: ${booking.status}</p>
                    </div>
                </div>
                <div class="booking-actions">
                    ${renderBookingActions(booking)}
                </div>
            </div>
        `).join('');

        return `
            <div class="booking-date-group">
                <div class="booking-date-header">${heading} <span>(${bookings.length})</span></div>
                ${cards}
            </div>
        `;
    }).join('');
}

function renderBookingActions(booking) {
    if (booking.status === 'pending') {
        return `
            <button onclick="handleBooking('${booking.id}', 'accept')" class="action-button accept">
                <i class="fas fa-check"></i> Accept
            </button>
            <button onclick="handleBooking('${booking.id}', 'decline')" class="action-button decline">
                <i class="fas fa-times"></i> Decline
            </button>
        `;
    }
    if (booking.status === 'accepted') {
        return `
            <button onclick="handleBooking('${booking.id}', 'decline')" class="action-button decline">
                <i class="fas fa-times"></i> Decline Cut
            </button>
            <button onclick="handleFinishCut('${booking.id}')" class="action-button finish">
                <i class="fas fa-check-circle"></i> Finish Cut
            </button>
        `;
    }
    if (booking.status === 'declined') {
        return `
            <button onclick="handleBooking('${booking.id}', 'accept')" class="action-button accept">
                <i class="fas fa-check"></i> Accept Booking
            </button>
            <button onclick="handleDeleteBooking('${booking.id}')" class="action-button delete">
                <i class="fas fa-trash"></i> Delete Forever
            </button>
        `;
    }
    return '';
}

function updateCounts() {
    const normalized = currentBookings.map(normalizeBookingForView);
    document.getElementById('pending-count').textContent = normalized.filter((b) => b.status === 'pending').length;
    document.getElementById('accepted-count').textContent = normalized.filter((b) => b.status === 'accepted').length;
    document.getElementById('declined-count').textContent = normalized.filter((b) => b.status === 'declined').length;
    document.getElementById('finished-count').textContent = normalized.filter((b) => b.status === 'finished').length;
}

function updateBookingsUI() {
    updateCounts();
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) {
        searchContainer.style.display = activeStatus === 'accepted' ? 'block' : 'none';
    }
    renderBookingsList();
}

function filterBookings(status) {
    activeStatus = status;
    document.querySelectorAll('.booking-filter').forEach((btn) => btn.classList.remove('active'));
    document.querySelector(`[data-status="${status}"]`)?.classList.add('active');
    updateBookingsUI();
}

function handleSearch(event) {
    searchQuery = event.target.value.toLowerCase();
    updateBookingsUI();
}

function clearBookingFilters() {
    const dateFilter = document.getElementById('bookingDateFilter');
    const sortFilter = document.getElementById('bookingSort');
    const searchInput = document.querySelector('.search-input');
    if (dateFilter) dateFilter.value = '';
    if (sortFilter) sortFilter.value = 'desc';
    if (searchInput) searchInput.value = '';
    searchQuery = '';
    updateBookingsUI();
}

async function handleBooking(bookingId, action) {
    if (action === 'decline' && !confirm('Are you sure you want to decline this booking?')) {
        return;
    }
    try {
        const response = await fetch(`/api/bookings/${bookingId}/${action}`, { method: 'POST' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Failed to ${action} booking`);
        showToast(`Booking ${action}ed successfully`, 'success');
        await loadInitialData();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function handleFinishCut(bookingId) {
    try {
        const response = await fetch(`/api/bookings/${bookingId}/finish`, { method: 'POST' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to finish booking');
        showToast('Haircut marked as finished', 'success');
        await loadInitialData();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function handleDeleteBooking(bookingId) {
    if (!confirm('WARNING: This will permanently delete the booking. Continue?')) {
        return;
    }
    try {
        const response = await fetch(`/api/bookings/${bookingId}/delete`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to delete booking');
        showToast('Booking deleted successfully', 'success');
        await loadInitialData();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function updateScheduleUI() {
    Object.entries(currentSchedule).forEach(([day, { isOpen, hours }]) => {
        const dayRoot = document.querySelector(`[data-day="${day}"]`);
        const dayRow = dayRoot?.closest('.day-row');
        if (!dayRow) return;
        dayRow.querySelector('input[type="checkbox"]').checked = isOpen;
        const start = (hours.start || '3:30 PM').split(' ');
        const end = (hours.end || '8:00 PM').split(' ');
        dayRow.querySelector('.start-time').value = start[0];
        dayRow.querySelector('.start-meridian').value = start[1] || 'PM';
        dayRow.querySelector('.end-time').value = end[0];
        dayRow.querySelector('.end-meridian').value = end[1] || 'PM';
        dayRow.querySelector('.hours-input')?.classList.toggle('active', isOpen);
    });
}

function toggleDay(day) {
    const dayRow = document.querySelector(`[data-day="${day}"]`)?.closest('.day-row');
    if (!dayRow) return;
    const checked = dayRow.querySelector('input[type="checkbox"]').checked;
    if (!currentSchedule[day]) {
        currentSchedule[day] = { isOpen: false, hours: { start: '3:30 PM', end: '8:00 PM' } };
    }
    currentSchedule[day].isOpen = checked;
    dayRow.querySelector('.hours-input')?.classList.toggle('active', checked);
}

function updateHours(day) {
    const dayRow = document.querySelector(`[data-day="${day}"]`)?.closest('.day-row');
    if (!dayRow) return;
    const startTime = dayRow.querySelector('.start-time').value;
    const startMeridian = dayRow.querySelector('.start-meridian').value;
    const endTime = dayRow.querySelector('.end-time').value;
    const endMeridian = dayRow.querySelector('.end-meridian').value;
    if (!currentSchedule[day]) {
        currentSchedule[day] = { isOpen: false, hours: { start: '', end: '' } };
    }
    currentSchedule[day].hours = { start: `${startTime} ${startMeridian}`, end: `${endTime} ${endMeridian}` };
}

async function saveSchedule() {
    try {
        DAYS.forEach((day) => {
            if (!currentSchedule[day]) {
                currentSchedule[day] = { isOpen: false, hours: { start: '', end: '' } };
            }
            updateHours(day);
        });
        const response = await fetch('/api/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentSchedule)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Failed to save schedule');
        showToast('Schedule updated successfully', 'success');
        await fetchCurrentSchedule();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function fetchCurrentSchedule() {
    const response = await fetch('/api/schedule');
    if (!response.ok) throw new Error('Failed to fetch schedule');
    currentSchedule = await response.json();
    updateScheduleUI();
}

async function loadInitialData() {
    showLoading(true);
    try {
        const [scheduleRes, bookingsRes] = await Promise.all([
            fetch('/api/schedule'),
            fetch('/api/bookings')
        ]);
        if (!scheduleRes.ok || !bookingsRes.ok) {
            throw new Error('Failed to load data');
        }
        currentSchedule = await scheduleRes.json();
        currentBookings = await bookingsRes.json();
        retryCount = 0;
        updateScheduleUI();
        updateBookingsUI();
    } catch (error) {
        if (retryCount < RETRY_LIMIT) {
            retryCount += 1;
            setTimeout(loadInitialData, retryCount * 1500);
        } else {
            showToast('Unable to load admin data', 'error');
        }
    } finally {
        showLoading(false);
    }
}

function logout() {
    fetch('/api/logout', { method: 'POST' }).finally(() => {
        window.location.href = '/login';
    });
}

function showLoading(show) {
    const loader = document.querySelector('.loader');
    if (show && !loader) {
        document.body.insertAdjacentHTML('beforeend', `
            <div class="loader">
                <div class="spinner"></div>
                <p>Loading...</p>
            </div>
        `);
    } else if (!show && loader) {
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
            setTimeout(() => toast.remove(), 250);
        }, 2600);
    }, 50);
}

socket.on('newBooking', () => loadInitialData());
socket.on('bookingUpdated', () => loadInitialData());
socket.on('bookingDeleted', () => loadInitialData());
socket.on('scheduleUpdate', (newSchedule) => {
    currentSchedule = newSchedule;
    updateScheduleUI();
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('bookingDateFilter')?.addEventListener('change', updateBookingsUI);
    document.getElementById('bookingSort')?.addEventListener('change', updateBookingsUI);
    document.querySelectorAll('.time-picker, .meridian-select').forEach((input) => {
        input.addEventListener('change', (event) => {
            const day = event.target.closest('.day-row')?.querySelector('[data-day]')?.dataset.day;
            if (day) updateHours(day);
        });
    });
    loadInitialData();
});
