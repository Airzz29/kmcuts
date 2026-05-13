const socket = io();

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const RETRY_LIMIT = 3;

let currentSchedule = {};
let currentBookings = [];
let searchQuery = '';
let activeStatus = 'pending';
let retryCount = 0;

function getWeekDateRangeStrings() {
    const now = new Date();
    const dow = now.getDay();
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    const fmt = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: fmt(monday), end: fmt(sunday) };
}

function calculateAnalytics(bookings) {
    const normalized = bookings.map(normalizeBookingForView);
    const { start: wStart, end: wEnd } = getWeekDateRangeStrings();
    const thisWeek = normalized.filter(
        (b) => b.status !== 'declined' && b.date >= wStart && b.date <= wEnd
    ).length;

    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonth = normalized.filter((b) => b.status !== 'declined' && b.date.startsWith(monthPrefix)).length;

    const priceForDuration = (dur) => {
        const d = Number(dur);
        if (d === 30) return 35;
        if (d === 45) return 45;
        if (d === 60) return 60;
        return 40;
    };
    const revenue = normalized
        .filter(
            (b) =>
                (b.status === 'accepted' || b.status === 'finished') && b.date.startsWith(monthPrefix)
        )
        .reduce((sum, b) => sum + priceForDuration(b.duration), 0);

    const finished = normalized.filter((b) => b.status === 'finished').length;
    const accepted = normalized.filter((b) => b.status === 'accepted').length;
    const declined = normalized.filter((b) => b.status === 'declined').length;
    const denom = accepted + finished + declined;
    const completion = denom ? Math.round((finished / denom) * 100) : 0;

    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    setText('stat-this-week', String(thisWeek));
    setText('stat-this-month', String(thisMonth));
    setText('stat-revenue', `$${Math.round(revenue)}`);
    setText('stat-completion', `${completion}%`);
}

async function loadSettings() {
    const res = await fetch('/api/settings');
    if (!res.ok) return;
    const data = await res.json();
    if (data.notification_email) {
        const input = document.getElementById('notificationEmailInput');
        if (input) input.value = data.notification_email;
    }
}

async function saveNotificationEmail() {
    const value = document.getElementById('notificationEmailInput').value.trim();
    if (!value) return;
    const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'notification_email', value })
    });
    if (!res.ok) return;
    const msg = document.getElementById('emailSavedMsg');
    if (msg) {
        msg.style.opacity = '1';
        setTimeout(() => {
            msg.style.opacity = '0';
        }, 2000);
    }
}

function switchTab(tab) {
    document.querySelectorAll('.admin-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach((t) => t.classList.remove('active'));
    document.querySelector(`.admin-tab[data-tab="${tab}"]`)?.classList.add('active');
    document.getElementById(`tab-${tab}`)?.classList.add('active');
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

let currentServices = [];

async function loadServices() {
    try {
        const res = await fetch('/api/services');
        if (!res.ok) return;
        currentServices = await res.json();
        renderServicesList();
    } catch (_) {}
}

function renderServicesList() {
    const list = document.getElementById('servicesList');
    if (!list) return;
    if (!currentServices.length) {
        list.innerHTML = '<p style="color:var(--muted);font-size:0.83rem;">No services yet.</p>';
        return;
    }
    list.innerHTML = currentServices
        .map(
            (s) => `
    <div class="service-row" id="service-row-${s.id}">
      <div class="service-row-info">
        <span class="service-row-name">${escapeHtml(s.name)}</span>
        <span class="service-row-meta">$${Number(s.price).toFixed(2)} · ${s.duration}min</span>
      </div>
      <div class="service-row-actions">
        <button type="button" class="service-edit-btn" onclick="editService(${s.id})">Edit</button>
        <button type="button" class="service-delete-btn" onclick="deleteService(${s.id})">Delete</button>
      </div>
    </div>
  `
        )
        .join('');
}

async function addService() {
    const name = document.getElementById('newServiceName').value.trim();
    const price = parseFloat(document.getElementById('newServicePrice').value);
    const duration = parseInt(document.getElementById('newServiceDuration').value, 10);
    if (!name || Number.isNaN(price) || Number.isNaN(duration) || price <= 0 || duration < 1) {
        showToast('Please fill in all service fields correctly', 'error');
        return;
    }
    const res = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price, duration })
    });
    if (res.ok) {
        document.getElementById('newServiceName').value = '';
        document.getElementById('newServicePrice').value = '';
        document.getElementById('newServiceDuration').value = '';
        await loadServices();
        showToast('Service added', 'success');
    } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Failed to add service', 'error');
    }
}

async function deleteService(id) {
    if (!confirm('Delete this service?')) return;
    const res = await fetch(`/api/services/${id}`, { method: 'DELETE' });
    if (res.ok) {
        await loadServices();
        showToast('Service deleted', 'success');
    } else {
        showToast('Failed to delete service', 'error');
    }
}

async function editService(id) {
    const service = currentServices.find((s) => Number(s.id) === Number(id));
    if (!service) return;
    const row = document.getElementById(`service-row-${id}`);
    if (!row) return;
    row.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;align-items:center;">
      <input type="text" value="${escapeHtml(service.name)}" id="edit-name-${id}" class="setting-input" style="flex:2;min-width:120px;">
      <input type="number" value="${Number(service.price)}" id="edit-price-${id}" class="setting-input" style="flex:1;min-width:80px;" step="0.01" min="0">
      <input type="number" value="${Number(service.duration)}" id="edit-duration-${id}" class="setting-input" style="flex:1;min-width:80px;" min="1">
      <button type="button" class="service-edit-btn" onclick="saveEditService(${id})">Save</button>
      <button type="button" class="service-delete-btn" onclick="renderServicesList()">Cancel</button>
    </div>
  `;
}

async function saveEditService(id) {
    const name = document.getElementById(`edit-name-${id}`).value.trim();
    const price = parseFloat(document.getElementById(`edit-price-${id}`).value);
    const duration = parseInt(document.getElementById(`edit-duration-${id}`).value, 10);
    if (!name || Number.isNaN(price) || Number.isNaN(duration) || price <= 0 || duration < 1) {
        showToast('Invalid service details', 'error');
        return;
    }
    const res = await fetch(`/api/services/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price, duration })
    });
    if (res.ok) {
        await loadServices();
        showToast('Service updated', 'success');
    } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Failed to update service', 'error');
    }
}

async function loadBlockedDates() {
    try {
        const res = await fetch('/api/blocked-dates');
        if (!res.ok) return;
        const dates = await res.json();
        const list = document.getElementById('blockedDatesList');
        if (!list) return;
        if (!dates.length) {
            list.innerHTML = '<p style="color:var(--muted);font-size:0.83rem;">No dates blocked.</p>';
            return;
        }
        list.innerHTML = dates
            .map(
                (d) => `
    <div class="blocked-date-row">
      <div>
        <span>${escapeHtml(d.date)}</span>
        ${d.reason ? `<small style="color:var(--muted);"> — ${escapeHtml(d.reason)}</small>` : ''}
      </div>
      <button type="button" class="unblock-btn" onclick="removeBlockedDate('${escapeHtml(d.date)}')">Remove</button>
    </div>
  `
            )
            .join('');
    } catch (_) {}
}

async function addBlockedDate() {
    const date = document.getElementById('blockDateInput').value;
    const reason = document.getElementById('blockReasonInput').value.trim();
    if (!date) {
        showToast('Please select a date', 'error');
        return;
    }
    const res = await fetch('/api/blocked-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, reason })
    });
    if (res.ok) {
        document.getElementById('blockDateInput').value = '';
        document.getElementById('blockReasonInput').value = '';
        await loadBlockedDates();
        showToast('Date blocked', 'success');
    } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Failed to block date', 'error');
    }
}

async function removeBlockedDate(date) {
    const res = await fetch(`/api/blocked-dates/${encodeURIComponent(date)}`, { method: 'DELETE' });
    if (res.ok) {
        await loadBlockedDates();
        showToast('Date unblocked', 'success');
    } else {
        showToast('Failed to remove block', 'error');
    }
}

function mergeBookingIntoList(booking) {
    if (!booking || booking.id == null) return;
    const id = Number(booking.id);
    const idx = currentBookings.findIndex((b) => Number(b.id) === id);
    if (idx === -1) {
        currentBookings.unshift(booking);
        return;
    }
    currentBookings[idx] = { ...currentBookings[idx], ...booking };
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
            booking.phone.toLowerCase().includes(searchQuery) ||
            (booking.customer_email || '').toLowerCase().includes(searchQuery)
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
        bookingsList.innerHTML = '<div class="booking-card booking-empty">No bookings found for current filters.</div>';
        return;
    }

    const grouped = filteredBookings.reduce((acc, booking) => {
        if (!acc[booking.date]) acc[booking.date] = [];
        acc[booking.date].push(booking);
        return acc;
    }, {});

    bookingsList.innerHTML = Object.entries(grouped).map(([date, bookings]) => {
        const heading = moment.tz(date, 'Australia/Perth').format('dddd, MMMM D, YYYY');
        const cards = bookings.map((booking) => {
            const dateShort = moment.tz(booking.date, 'YYYY-MM-DD', 'Australia/Perth').format('ddd MMM D');
            return `
            <div class="booking-card ${booking.status}" data-status="${booking.status}" data-booking-id="${booking.id}">
                <div class="booking-card-head">
                    <h3 class="booking-card-name">${booking.customer_name}</h3>
                    <span class="booking-status-badge ${booking.status}">${booking.status}</span>
                </div>
                <div class="booking-row-service">
                    <i class="fas fa-cut"></i>
                    <span>${booking.service} (${booking.duration} min)</span>
                </div>
                <div class="booking-row-datetime">
                    <span><i class="fas fa-calendar"></i>${dateShort}</span>
                    <span><i class="fas fa-clock"></i>${booking.time}</span>
                </div>
                <div class="booking-row-contact">
                    <span><i class="fas fa-phone"></i>${booking.phone}</span>
                    <span><i class="fas fa-envelope"></i>${booking.customer_email || '—'}</span>
                </div>
                <div class="booking-actions">
                    ${renderBookingActions(booking)}
                </div>
            </div>
        `;
        }).join('');

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
    calculateAnalytics(currentBookings);
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
        if (data.booking) {
            mergeBookingIntoList(data.booking);
        }
        showToast('Haircut marked as finished', 'success');
        filterBookings('finished');
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
socket.on('bookingUpdated', (booking) => {
    mergeBookingIntoList(booking);
    updateBookingsUI();
});
socket.on('bookingUpdate', (booking) => {
    mergeBookingIntoList(booking);
    updateBookingsUI();
});
socket.on('bookingDeleted', () => loadInitialData());
socket.on('scheduleUpdate', (newSchedule) => {
    currentSchedule = newSchedule;
    updateScheduleUI();
});

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadServices();
    loadBlockedDates();
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
