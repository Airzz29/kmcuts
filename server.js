require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const http = require('http');
const { Server } = require('socket.io');
const moment = require('moment-timezone');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const TZ = 'Australia/Perth';
const DB_PATH = path.join(__dirname, 'bookings.db');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'kmcuts$$';

const sessionSecret =
    process.env.SESSION_SECRET ||
    (process.env.NODE_ENV === 'production' ? null : 'dev-session-secret-change-me');

if (!sessionSecret) {
    throw new Error('SESSION_SECRET is required in production');
}

const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) {
                reject(err);
                return;
            }
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(row);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
}

function toMinutes(time12h) {
    if (!time12h || typeof time12h !== 'string') return NaN;
    const parts = time12h.trim().split(' ');
    if (parts.length !== 2) return NaN;
    const [clock, meridianRaw] = parts;
    const meridian = meridianRaw.toUpperCase();
    const [hRaw, mRaw] = clock.split(':');
    const h = Number(hRaw);
    const m = Number(mRaw);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 1 || h > 12 || m < 0 || m > 59) {
        return NaN;
    }
    let hours24 = h % 12;
    if (meridian === 'PM') hours24 += 12;
    if (meridian !== 'AM' && meridian !== 'PM') return NaN;
    return hours24 * 60 + m;
}

function formatMinutes(minutes) {
    const h24 = Math.floor(minutes / 60);
    const m = minutes % 60;
    const meridian = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${meridian}`;
}

function normalizeDate(dateStr) {
    const parsed = moment.tz(dateStr, 'YYYY-MM-DD', true, TZ);
    if (!parsed.isValid()) return null;
    return parsed.format('YYYY-MM-DD');
}

function normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '');
}

async function initializeDatabase() {
    await run('PRAGMA journal_mode = WAL');
    await run('PRAGMA foreign_keys = ON');
    await run('PRAGMA busy_timeout = 5000');

    await run(`
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            service TEXT NOT NULL,
            duration INTEGER NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS schedule (
            day TEXT PRIMARY KEY,
            is_open INTEGER NOT NULL DEFAULT 0,
            start_time TEXT,
            end_time TEXT
        )
    `);

    await run('CREATE INDEX IF NOT EXISTS idx_bookings_date_status ON bookings(date, status)');
    await run('CREATE INDEX IF NOT EXISTS idx_bookings_date_time ON bookings(date, time)');

    const dayRows = await all('SELECT day FROM schedule');
    if (dayRows.length === 0) {
        const defaultSchedule = {
            Sunday: { isOpen: false, hours: { start: '', end: '' } },
            Monday: { isOpen: true, hours: { start: '3:30 PM', end: '8:00 PM' } },
            Tuesday: { isOpen: true, hours: { start: '3:30 PM', end: '8:00 PM' } },
            Wednesday: { isOpen: false, hours: { start: '', end: '' } },
            Thursday: { isOpen: true, hours: { start: '3:30 PM', end: '8:00 PM' } },
            Friday: { isOpen: true, hours: { start: '3:30 PM', end: '8:00 PM' } },
            Saturday: { isOpen: true, hours: { start: '8:00 AM', end: '2:00 PM' } }
        };

        for (const [day, details] of Object.entries(defaultSchedule)) {
            await run(
                'INSERT INTO schedule (day, is_open, start_time, end_time) VALUES (?, ?, ?, ?)',
                [day, details.isOpen ? 1 : 0, details.hours.start || null, details.hours.end || null]
            );
        }
    }
}

async function getScheduleObject() {
    const rows = await all('SELECT day, is_open, start_time, end_time FROM schedule');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const schedule = {};
    for (const day of days) {
        schedule[day] = { isOpen: false, hours: { start: '', end: '' } };
    }
    rows.forEach((row) => {
        schedule[row.day] = {
            isOpen: row.is_open === 1,
            hours: { start: row.start_time || '', end: row.end_time || '' }
        };
    });
    return schedule;
}

function requireAuth(req, res, next) {
    if (req.session && req.session.isAuthenticated) {
        next();
        return;
    }
    if (req.path.startsWith('/api/')) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
    }
    res.redirect('/login');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '256kb' }));
app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 365
    }
}));

app.get('/', async (req, res, next) => {
    try {
        const schedule = await getScheduleObject();
        res.render('index', { schedule });
    } catch (error) {
        next(error);
    }
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/admin', requireAuth, async (req, res, next) => {
    try {
        const schedule = await getScheduleObject();
        const bookings = await all('SELECT * FROM bookings ORDER BY date(date) ASC, time ASC');
        res.render('admin', { schedule, bookings, moment });
    } catch (error) {
        next(error);
    }
});

app.get('/payment', (req, res) => {
    res.render('payment');
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        req.session.isAuthenticated = true;
        req.session.loginTimestamp = Date.now();
        res.json({ success: true, timestamp: req.session.loginTimestamp });
        return;
    }
    res.status(401).json({ success: false, message: 'Invalid credentials' });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

app.get('/api/check-auth', (req, res) => {
    res.json({ isAuthenticated: Boolean(req.session && req.session.isAuthenticated) });
});

app.get('/api/schedule', async (req, res, next) => {
    try {
        const schedule = await getScheduleObject();
        res.json(schedule);
    } catch (error) {
        next(error);
    }
});

app.post('/api/schedule', requireAuth, async (req, res, next) => {
    try {
        const incoming = req.body || {};
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        await run('BEGIN IMMEDIATE TRANSACTION');
        for (const day of days) {
            const item = incoming[day] || { isOpen: false, hours: { start: '', end: '' } };
            const isOpen = item.isOpen ? 1 : 0;
            const start = (item.hours && item.hours.start) || null;
            const end = (item.hours && item.hours.end) || null;

            if (isOpen) {
                const startMin = toMinutes(start);
                const endMin = toMinutes(end);
                if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) {
                    await run('ROLLBACK');
                    res.status(400).json({ success: false, message: `Invalid hours for ${day}` });
                    return;
                }
            }

            await run(
                `INSERT INTO schedule (day, is_open, start_time, end_time)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(day) DO UPDATE SET
                    is_open = excluded.is_open,
                    start_time = excluded.start_time,
                    end_time = excluded.end_time`,
                [day, isOpen, start, end]
            );
        }
        await run('COMMIT');

        const schedule = await getScheduleObject();
        io.emit('scheduleUpdate', schedule);
        io.emit('scheduleUpdated', schedule);
        res.json({ success: true, message: 'Schedule updated successfully' });
    } catch (error) {
        try { await run('ROLLBACK'); } catch (_) {}
        next(error);
    }
});

app.get('/api/available-dates', async (req, res, next) => {
    try {
        const rows = await all('SELECT day, is_open FROM schedule');
        res.json(rows.map((r) => ({ day: r.day, available: r.is_open === 1 })));
    } catch (error) {
        next(error);
    }
});

app.get('/api/available-slots', async (req, res, next) => {
    try {
        const date = normalizeDate(req.query.date);
        const duration = Number(req.query.duration);
        if (!date || !Number.isInteger(duration) || duration <= 0) {
            res.status(400).json({ error: 'Invalid date or duration' });
            return;
        }

        const day = moment.tz(date, TZ).format('dddd');
        const schedule = await getScheduleObject();
        const daySchedule = schedule[day];
        if (!daySchedule || !daySchedule.isOpen) {
            res.json([]);
            return;
        }

        const startMin = toMinutes(daySchedule.hours.start);
        const endMin = toMinutes(daySchedule.hours.end);
        if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) {
            res.json([]);
            return;
        }

        const bookings = await all(
            "SELECT time FROM bookings WHERE date = ? AND status != 'declined'",
            [date]
        );
        const bookedSet = new Set(bookings.map((b) => b.time));
        const slots = [];
        for (let current = startMin; current + duration <= endMin; current += duration) {
            const time = formatMinutes(current);
            slots.push({ time, available: !bookedSet.has(time) });
        }
        res.json(slots);
    } catch (error) {
        next(error);
    }
});

app.get('/api/bookings', async (req, res, next) => {
    try {
        const rows = await all('SELECT * FROM bookings ORDER BY date DESC, time DESC');
        res.json(rows);
    } catch (error) {
        next(error);
    }
});

app.get('/api/bookings/month/:year/:month', async (req, res, next) => {
    try {
        const year = Number(req.params.year);
        const month = Number(req.params.month);
        if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
            res.status(400).json({ error: 'Invalid year or month' });
            return;
        }
        const startDate = moment.tz({ year, month: month - 1, day: 1 }, TZ).format('YYYY-MM-DD');
        const endDate = moment.tz({ year, month, day: 0 }, TZ).format('YYYY-MM-DD');
        const rows = await all(
            `SELECT date, COUNT(*) as booking_count, GROUP_CONCAT(time) as booked_times
             FROM bookings
             WHERE date BETWEEN ? AND ? AND status != 'declined'
             GROUP BY date`,
            [startDate, endDate]
        );
        res.json(rows.map((row) => ({
            date: row.date,
            booking_count: Number(row.booking_count),
            booked_times: row.booked_times ? row.booked_times.split(',') : []
        })));
    } catch (error) {
        next(error);
    }
});

app.get('/api/bookings/date/:date', async (req, res, next) => {
    try {
        const date = normalizeDate(req.params.date);
        if (!date) {
            res.status(400).json({ error: 'Invalid date format' });
            return;
        }
        const rows = await all(
            "SELECT time FROM bookings WHERE date = ? AND status != 'declined'",
            [date]
        );
        res.json(rows.map((r) => r.time));
    } catch (error) {
        next(error);
    }
});

app.get('/api/booked-slots', async (req, res, next) => {
    try {
        const date = normalizeDate(req.query.date);
        if (!date) {
            res.status(400).json({ error: 'Date parameter is required' });
            return;
        }
        const rows = await all(
            "SELECT time, duration FROM bookings WHERE date = ? AND status != 'declined'",
            [date]
        );
        res.json(rows);
    } catch (error) {
        next(error);
    }
});

app.post('/api/bookings', async (req, res, next) => {
    try {
        const { customerName, phone, service, duration, date, time } = req.body || {};
        const cleanName = String(customerName || '').trim();
        const cleanPhone = normalizePhone(phone);
        const cleanService = String(service || '').trim();
        const cleanDuration = Number(duration);
        const cleanDate = normalizeDate(date);
        const cleanTime = String(time || '').trim();

        if (!cleanName || !cleanService || !cleanDate || !cleanTime || !Number.isInteger(cleanDuration) || cleanDuration <= 0) {
            res.status(400).json({ error: 'Invalid booking payload' });
            return;
        }
        if (!/^\d{10}$/.test(cleanPhone)) {
            res.status(400).json({ error: 'Phone must be a 10-digit number' });
            return;
        }

        const day = moment.tz(cleanDate, TZ).format('dddd');
        const schedule = await getScheduleObject();
        const daySchedule = schedule[day];
        if (!daySchedule || !daySchedule.isOpen) {
            res.status(400).json({ error: 'Selected day is closed' });
            return;
        }

        const bookingMin = toMinutes(cleanTime);
        const startMin = toMinutes(daySchedule.hours.start);
        const endMin = toMinutes(daySchedule.hours.end);
        if (!Number.isFinite(bookingMin) || !Number.isFinite(startMin) || !Number.isFinite(endMin)) {
            res.status(400).json({ error: 'Invalid time format' });
            return;
        }
        if (bookingMin < startMin || bookingMin + cleanDuration > endMin) {
            res.status(400).json({ error: 'Booking time is outside business hours' });
            return;
        }

        await run('BEGIN IMMEDIATE TRANSACTION');
        const existing = await get(
            "SELECT id FROM bookings WHERE date = ? AND time = ? AND status != 'declined' LIMIT 1",
            [cleanDate, cleanTime]
        );
        if (existing) {
            await run('ROLLBACK');
            res.status(409).json({ error: 'Time slot already booked' });
            return;
        }

        const result = await run(
            `INSERT INTO bookings (customer_name, phone, service, duration, date, time, status)
             VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
            [cleanName, cleanPhone, cleanService, cleanDuration, cleanDate, cleanTime]
        );
        await run('COMMIT');

        const booking = await get('SELECT * FROM bookings WHERE id = ?', [result.lastID]);
        io.emit('newBooking', booking);
        res.status(201).json({ success: true, booking });
    } catch (error) {
        try { await run('ROLLBACK'); } catch (_) {}
        next(error);
    }
});

app.post('/api/bookings/:id/:action', requireAuth, async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const action = req.params.action;
        if (!Number.isInteger(id) || id <= 0) {
            res.status(400).json({ error: 'Invalid booking id' });
            return;
        }
        if (action !== 'accept' && action !== 'decline') {
            res.status(400).json({ error: 'Invalid action' });
            return;
        }
        const status = action === 'accept' ? 'accepted' : 'declined';
        const result = await run('UPDATE bookings SET status = ? WHERE id = ?', [status, id]);
        if (!result.changes) {
            res.status(404).json({ error: 'Booking not found' });
            return;
        }
        const booking = await get('SELECT * FROM bookings WHERE id = ?', [id]);
        io.emit('bookingUpdated', booking);
        io.emit('bookingUpdate', booking);
        res.json({ success: true, status });
    } catch (error) {
        next(error);
    }
});

app.post('/api/bookings/:id/finish', requireAuth, async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            res.status(400).json({ error: 'Invalid booking id' });
            return;
        }
        const result = await run("UPDATE bookings SET status = 'finished' WHERE id = ?", [id]);
        if (!result.changes) {
            res.status(404).json({ error: 'Booking not found' });
            return;
        }
        const booking = await get('SELECT * FROM bookings WHERE id = ?', [id]);
        io.emit('bookingUpdated', booking);
        io.emit('bookingUpdate', booking);
        res.json({ success: true, message: 'Booking marked as finished' });
    } catch (error) {
        next(error);
    }
});

app.delete('/api/bookings/:id/delete', requireAuth, async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            res.status(400).json({ error: 'Invalid booking id' });
            return;
        }
        const booking = await get('SELECT * FROM bookings WHERE id = ?', [id]);
        if (!booking) {
            res.status(404).json({ error: 'Booking not found' });
            return;
        }
        await run('DELETE FROM bookings WHERE id = ?', [id]);
        io.emit('bookingDeleted', { bookingId: id, date: booking.date, time: booking.time });
        res.json({ success: true, message: 'Booking deleted successfully' });
    } catch (error) {
        next(error);
    }
});

app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

app.use((req, res) => {
    if (req.accepts('html')) {
        res.status(404).render('404');
        return;
    }
    if (req.accepts('json')) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    res.status(404).send('Not found');
});

app.use((err, req, res, next) => {
    console.error('Error:', err);
    if (req.path.startsWith('/api/')) {
        res.status(500).json({ error: 'Server error', message: err.message });
        return;
    }
    res.status(500).render('404', { error: err.message });
});

io.on('connection', (socket) => {
    socket.on('scheduleUpdate', (payload) => {
        io.emit('scheduleUpdate', payload);
    });
    socket.on('bookingStatusUpdated', (payload) => {
        io.emit('bookingStatusUpdated', payload);
    });
    socket.on('bookingDeleted', (payload) => {
        io.emit('bookingDeleted', payload);
    });
});

initializeDatabase()
    .then(() => {
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    });
