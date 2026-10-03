// Reads a date, time and length written in a task, for example:
//   "Meeting with Adam tomorrow at 3pm"   -> tomorrow 15:00, title "Meeting with Adam"
//   "Call the bank Fri 10:30 for 30 min"  -> Friday 10:30 for 30 minutes
//   "Dentist 5 Oct 2-3pm"                 -> 5 October 14:00-15:00
// The Google Calendar pop-up uses it to fill itself in; everything stays editable there.
// Plain script: runs in the panel (window.TaskPopWhen) and in tests (module.exports).
(function (root) {
  const MONTH_RE = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const DAY_FULL = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday';
  const DAY_SHORT = 'sun|mon|tues?|weds?|thur?s?|fri|sat';
  const DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const AMPM = '(am|pm|a\\.m\\.?|p\\.m\\.?)';
  const PART = '(?:\\s+(morning|afternoon|evening|night))?';
  const NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

  const pad = (n) => String(n).padStart(2, '0');
  const dayOf = (d) => ({ y: d.getFullYear(), m: d.getMonth(), d: d.getDate() });
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const validDay = (y, m, d) => m >= 0 && m < 12 && d >= 1 && d <= new Date(y, m + 1, 0).getDate();
  const isPm = (s) => !!s && s[0].toLowerCase() === 'p';

  function to24(h, min, ampm, hint) {
    if (h > 23 || min > 59) return null;
    if (ampm) {
      if (h < 1 || h > 12) return null;
      if (isPm(ampm) && h < 12) h += 12;
      if (!isPm(ampm) && h === 12) h = 0;
      return { h, m: min };
    }
    if (h > 12 || h === 0) return { h, m: min }; // 24-hour clock
    if (hint === 'pm' && h < 12) return { h: h + 12, m: min };
    if (hint === 'am') return { h: h === 12 ? 0 : h, m: min };
    // No am/pm: 1-7 is most likely afternoon (3 -> 3pm), 8-12 as written.
    return { h: h <= 7 ? h + 12 : h, m: min };
  }

  /**
   * text: the task title. Returns { title, date: {y,m,d}|null, time: {h,m}|null, durationMin|null, found }.
   * options.locale decides whether 5/10 means 5 October (most places) or May 10 (en-US).
   */
  function parse(text, now = new Date(), options = {}) {
    const original = String(text || '');
    let work = original;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthFirst = /^en-(us|ph)\b/i.test(options.locale || '');
    const out = { date: null, time: null, durationMin: null, part: null };

    // Find the first match that `accept` agrees with, blank it out of `work`, and return it.
    const take = (re, accept) => {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
      let m;
      while ((m = g.exec(work))) {
        if (!accept || accept(m)) {
          work = work.slice(0, m.index) + ' '.repeat(m[0].length) + work.slice(m.index + m[0].length);
          return m;
        }
        if (m[0].length === 0) g.lastIndex += 1;
      }
      return null;
    };
    const setDate = (d) => { if (!out.date) out.date = dayOf(d); };
    const setPart = (p) => { if (p && !out.part) out.part = p.toLowerCase(); };

    // ---- Dates ----
    let m = take(/\b(?:on\s+)?(\d{4})-(\d{1,2})-(\d{1,2})\b/i, (x) => validDay(+x[1], +x[2] - 1, +x[3]));
    if (m) out.date = { y: +m[1], m: +m[2] - 1, d: +m[3] };

    const monthDate = (mon, day, year) => {
      const mi = MONTHS.indexOf(mon.slice(0, 3).toLowerCase());
      let y = year ? +year : today.getFullYear();
      if (!validDay(y, mi, +day)) return false;
      if (!year && new Date(y, mi, +day) < today) y += 1;
      if (!validDay(y, mi, +day)) return false;
      out.date = out.date || { y, m: mi, d: +day };
      return true;
    };
    if (!out.date) {
      take(new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\.?(?:,?\\s+(\\d{4}))?\\b`, 'i'),
        (x) => monthDate(x[2], x[1], x[3]));
    }
    if (!out.date) {
      take(new RegExp(`\\b(?:on\\s+)?(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b(?![:.]\\d)(?!\\s*${AMPM})`, 'i'),
        (x) => monthDate(x[1], x[2], x[3]));
    }
    if (!out.date) {
      take(/\b(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/, (x) => {
        const day = monthFirst ? +x[2] : +x[1];
        const mon = (monthFirst ? +x[1] : +x[2]) - 1;
        let y = x[3] ? (x[3].length === 2 ? 2000 + +x[3] : +x[3]) : today.getFullYear();
        if (!validDay(y, mon, day)) return false;
        if (!x[3] && new Date(y, mon, day) < today) y += 1;
        out.date = { y, m: mon, d: day };
        return true;
      });
    }

    // ---- Length ("for 30 min", "for an hour", "for 1.5 hours", "for half an hour") ----
    m = take(/\bfor\s+(?:(\d+(?:\.\d+)?)|(an?|one|half\s+an?))\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i);
    if (m) {
      const unitIsHour = /^h/i.test(m[3]);
      let amount = m[1] ? parseFloat(m[1]) : /half/i.test(m[2]) ? 0.5 : 1;
      if (/half/i.test(m[2] || '') && !unitIsHour) amount = 0.5;
      const minutes = Math.round(unitIsHour ? amount * 60 : amount);
      if (minutes >= 5 && minutes <= 24 * 60) out.durationMin = minutes;
    }

    // ---- Days ----
    m = take(new RegExp(`\\b(?:the\\s+)?day\\s+after\\s+tomorrow\\b${PART}`, 'i'));
    if (m) { setDate(addDays(today, 2)); setPart(m[1]); }
    m = take(new RegExp(`\\b(today|tonight)\\b(?!['’]s)${PART}`, 'i'));
    if (m) { setDate(today); setPart(m[1].toLowerCase() === 'tonight' ? 'night' : m[2]); }
    m = take(new RegExp(`\\b(tomorrow|tmrw|tmr)\\b(?!['’]s)${PART}`, 'i'));
    if (m) { setDate(addDays(today, 1)); setPart(m[2]); }
    m = take(/\bin\s+(\d+|an?|one|two|three|four|five|six|seven)\s+(days?|weeks?)\b/i);
    if (m) {
      const n = /^\d+$/.test(m[1]) ? +m[1] : NUMBER_WORDS[m[1].toLowerCase()];
      setDate(addDays(today, /^w/i.test(m[2]) ? n * 7 : n));
    }
    const weekday = (word, which) => {
      const target = DAY_INDEX[word.slice(0, 3).toLowerCase()];
      const now0 = today.getDay();
      if (which && which.toLowerCase() === 'next') {
        const nextMonday = addDays(today, ((8 - now0) % 7) || 7);
        return addDays(nextMonday, (target + 6) % 7);
      }
      return addDays(today, (target - now0 + 7) % 7);
    };
    m = take(new RegExp(`\\b(?:(on|this|next)\\s+)?(${DAY_FULL})\\b(?!['’]s)${PART}`, 'i'))
      || take(new RegExp(`\\b(on|this|next)\\s+(${DAY_SHORT})\\b\\.?${PART}`, 'i'))
      || take(new RegExp(`\\b()(${DAY_SHORT})\\b\\.?(?=\\s+(?:at\\s+)?\\d)`, 'i'));
    if (m) { setDate(weekday(m[2], m[1])); setPart(m[3]); }
    m = take(/\bnext\s+week\b/i);
    if (m) setDate(weekday('mon', 'next'));
    m = take(/\b(?:this|in\s+the)\s+(morning|afternoon|evening)\b/i);
    if (m) setPart(m[1]);

    const hint = out.part === 'morning' ? 'am' : out.part ? 'pm' : null;

    // ---- Times ----
    // Ranges: "2-3pm", "14:00-16:30", "from 3 to 4:30pm"
    m = take(new RegExp(`(\\bfrom\\s+|\\b(?:at|@)\\s*)?\\b(\\d{1,2})(?:[:.](\\d{2}))?\\s*${AMPM}?\\s*(?:-|–|—|\\bto\\b|\\buntil\\b|\\btill\\b)\\s*(\\d{1,2})(?:[:.](\\d{2}))?\\s*${AMPM}?(?![\\w:])`, 'i'),
      // A bare "11-12" only counts right after a day ("Thursday 11-12"), not in "chapters 2-3".
      (x) => !!(x[1] || x[3] || x[4] || x[6] || x[7] || (out.date && /\s{3,}$/.test(work.slice(0, x.index)))));
    if (m) {
      const endAmpm = m[7] || null;
      const startAmpm = m[4] || (endAmpm && +m[2] <= +m[5] ? endAmpm : null);
      const s = to24(+m[2], +(m[3] || 0), startAmpm, hint);
      const e = to24(+m[5], +(m[6] || 0), endAmpm, s && s.h >= 12 ? 'pm' : hint);
      if (s && e) {
        out.time = s;
        let len = (e.h * 60 + e.m) - (s.h * 60 + s.m);
        if (len <= 0) len += 12 * 60;
        if (len > 0 && len <= 24 * 60 && !out.durationMin) out.durationMin = len;
      }
    }
    if (!out.time) {
      m = take(new RegExp(`(?:\\b(?:at|@)\\s*)?\\b(\\d{1,2})[:.](\\d{2})\\s*${AMPM}?(?![\\w:.])`, 'i'),
        (x) => !!to24(+x[1], +x[2], x[3], hint));
      if (m) out.time = to24(+m[1], +m[2], m[3], hint);
    }
    if (!out.time) {
      m = take(new RegExp(`(?:\\b(?:at|@)\\s*)?\\b(\\d{1,2})\\s*${AMPM}(?![\\w])`, 'i'), (x) => !!to24(+x[1], 0, x[2], hint));
      if (m) out.time = to24(+m[1], 0, m[2], hint);
    }
    if (!out.time) {
      m = take(/\b(?:at|@)\s*(\d{1,2})\b(?![:.]\d)(?!\s*(?:%|st\b|nd\b|rd\b|th\b|days?\b|weeks?\b|min|h\b|hours?\b|people|pm|am))/i,
        (x) => !!to24(+x[1], 0, null, hint));
      if (m) out.time = to24(+m[1], 0, null, hint);
    }
    if (!out.time) {
      m = take(/\b(?:at\s+)?(noon|midday)\b/i);
      if (m) out.time = { h: 12, m: 0 };
    }
    if (!out.time && out.part) {
      out.time = { morning: { h: 9, m: 0 }, afternoon: { h: 14, m: 0 }, evening: { h: 18, m: 0 }, night: { h: 20, m: 0 } }[out.part] || null;
    }

    const found = !!(out.date || out.time || out.durationMin);
    let title = original;
    if (found) {
      title = work
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .trim();
      const connectors = /^(?:(?:\b(?:at|on|by|from|for|in|this|next)\b|@|-|–|—|,|;)\s*)+|(?:\s*(?:\b(?:at|on|by|from|for|in|this|next)\b|@|-|–|—|,|;))+$/gi;
      for (let i = 0; i < 3; i += 1) title = title.replace(connectors, '').trim();
      title = title.replace(/\s{2,}/g, ' ').replace(/\(\s*\)/g, '').trim();
      if (!title) title = original.trim();
    }
    return { title, date: out.date, time: out.time, durationMin: out.durationMin, found };
  }

  /**
   * What the calendar pop-up starts with for a task.
   * Returns { title, allDay, start (ms), durationMin, found }.
   */
  function suggest({ title, remindAt = null, now = new Date(), defaultMinutes = 60, locale } = {}) {
    const p = parse(title, now, { locale });
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let { date, time } = p;
    if (!date && !time && remindAt) {
      const r = new Date(remindAt);
      date = dayOf(r);
      time = { h: r.getHours(), m: r.getMinutes() };
    }
    const allDay = !!date && !time;
    if (!date) {
      if (time) {
        const atToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), time.h, time.m);
        date = dayOf(atToday.getTime() > now.getTime() ? today : addDays(today, 1));
      } else if (now.getHours() >= 21) {
        date = dayOf(addDays(today, 1));
        time = { h: 9, m: 0 };
      } else {
        date = dayOf(today);
        time = { h: now.getHours() + 1, m: 0 };
      }
    }
    const start = allDay
      ? new Date(date.y, date.m, date.d)
      : new Date(date.y, date.m, date.d, time.h, time.m);
    return { title: p.title, allDay, start: start.getTime(), durationMin: p.durationMin || defaultMinutes, found: p.found };
  }

  const api = { parse, suggest, pad };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskPopWhen = api;
}(typeof window !== 'undefined' ? window : globalThis));
