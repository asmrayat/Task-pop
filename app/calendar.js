// Google Calendar hand-off.
// TaskPop doesn't connect to your Google account. It builds a link to Google Calendar's own
// "new event" page with the details filled in, and opens it in your browser; you check the
// event there and click Save. Link format: calendar.google.com/calendar/render?action=TEMPLATE
// (text, dates, details, location, recur, vcon=meet, authuser).

const BASE = 'https://calendar.google.com/calendar/render';
const LENGTHS = [15, 30, 45, 60, 90, 120, 180]; // minutes offered as the default event length
const MAX_SPAN_MS = 7 * 24 * 3600 * 1000;

const two = (n) => String(n).padStart(2, '0');
const utcStamp = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}T${two(d.getUTCHours())}${two(d.getUTCMinutes())}${two(d.getUTCSeconds())}Z`;
};
const localDay = (d) => `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}`;
const isEmail = (v) => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const text = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');

/** Checks what the panel sent. Returns a clean event or null. */
function cleanEvent(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const title = text(raw.title, 300).replace(/\n+/g, ' ');
  const start = Number(raw.start);
  const allDay = raw.allDay === true;
  if (!title || !Number.isFinite(start) || Math.abs(start - now) > 5 * 365 * 24 * 3600 * 1000) return null;
  let end = Number(raw.end);
  if (allDay) {
    end = start;
  } else if (!Number.isFinite(end) || end <= start || end - start > MAX_SPAN_MS) {
    return null;
  }
  return {
    title,
    start,
    end,
    allDay,
    location: text(raw.location, 300).replace(/\n+/g, ' '),
    details: text(raw.details, 2000),
    meet: raw.meet === true,
    repeatDaily: raw.repeatDaily === true,
    remind: raw.remind === true,
  };
}

/** The Google Calendar link for an event (from cleanEvent). `account` picks a Google account. */
function googleCalendarUrl(event, account = '') {
  let dates;
  if (event.allDay) {
    const d = new Date(event.start);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    dates = `${localDay(d)}/${localDay(next)}`; // the end day is exclusive
  } else {
    dates = `${utcStamp(event.start)}/${utcStamp(event.end)}`;
  }
  const params = [['action', 'TEMPLATE'], ['text', event.title], ['dates', dates]];
  if (event.details) params.push(['details', event.details]);
  if (event.location) params.push(['location', event.location]);
  if (event.repeatDaily) params.push(['recur', 'RRULE:FREQ=DAILY']);
  if (event.meet) params.push(['vcon', 'meet']);
  if (isEmail(account)) params.push(['authuser', account]);
  // The "/" between start and end is left as-is, the way Google's own links write it.
  const encode = (k, v) => (k === 'dates' ? v.split('/').map(encodeURIComponent).join('/') : encodeURIComponent(v));
  return `${BASE}?${params.map(([k, v]) => `${k}=${encode(k, v)}`).join('&')}`;
}

module.exports = { cleanEvent, googleCalendarUrl, isEmail, LENGTHS, BASE };
