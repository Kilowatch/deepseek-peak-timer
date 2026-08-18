/**
 * DeepSeek Pricing Clock Calculator Engine
 */

const TRANSITIONS = [
  { minute: 0, kind: "off" },
  { minute: 60, kind: "peak" },
  { minute: 240, kind: "off" },
  { minute: 360, kind: "peak" },
  { minute: 600, kind: "off" }
];

const SWITCHES = TRANSITIONS.filter(function (t, i) {
  const prev = TRANSITIONS[(i - 1 + TRANSITIONS.length) % TRANSITIONS.length];
  return t.kind !== prev.kind;
});

class DeepSeekCalculator {
  constructor() {
    this.zone = "local";
    this.autoDetectedTimezone = this.detectLocalTimezone();
  }

  detectLocalTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local Time";
    } catch (e) {
      return "Local Time";
    }
  }

  getTimezoneName() {
    return this.zone === "utc" ? "UTC" : this.autoDetectedTimezone;
  }

  getGmtOffsetLabel() {
    const offsetMinutes = this.getDisplayOffset();
    const sign = offsetMinutes >= 0 ? "+" : "−";
    const abs = Math.abs(offsetMinutes);
    const hours = Math.floor(abs / 60);
    const minutes = abs % 60;
    return "GMT" + sign + hours + (minutes ? ":" + (minutes < 10 ? "0" : "") + minutes : "");
  }

  getDisplayOffset() {
    return this.zone === "utc" ? 0 : -new Date().getTimezoneOffset();
  }

  setZone(newZone) {
    if (newZone === "local" || newZone === "utc") {
      this.zone = newZone;
    }
  }

  getFormatters() {
    const isUtc = this.zone === "utc";
    const base = isUtc
      ? { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false }
      : { hour: "2-digit", minute: "2-digit", hour12: false };
    
    return {
      timeFmt: new Intl.DateTimeFormat(undefined, base),
      timeZoneFmt: new Intl.DateTimeFormat(undefined, Object.assign({}, base, { timeZoneName: "short" }))
    };
  }

  formatClock(totalSeconds) {
    const sec = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;
    return (
      (hours < 10 ? "0" : "") + hours + ":" +
      (minutes < 10 ? "0" : "") + minutes + ":" +
      (seconds < 10 ? "0" : "") + seconds
    );
  }

  formatAwayLabel(milliseconds) {
    const mins = Math.max(0, Math.floor(milliseconds / 60000));
    const hours = Math.floor(mins / 60);
    return hours ? (hours + "h " + (mins % 60) + "m") : (mins + "m");
  }

  formatDurationLabel(milliseconds) {
    const mins = Math.max(0, Math.round(milliseconds / 60000));
    const hours = Math.floor(mins / 60);
    const rest = mins % 60;
    if (!hours) return rest + "m";
    return rest ? (hours + "h " + rest + "m") : (hours + "h");
  }

  getCurrentUtcWindow(now) {
    if (!now) now = new Date();
    const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
    let index = 0;
    for (let i = 0; i < TRANSITIONS.length; i++) {
      if (TRANSITIONS[i].minute <= minuteOfDay) {
        index = i;
      }
    }
    const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const next = TRANSITIONS[index + 1];
    let endMinute = next ? next.minute : 1440;
    let nextKind = next ? next.kind : TRANSITIONS[0].kind;

    if (!next && nextKind === TRANSITIONS[index].kind) {
      endMinute = 1440 + TRANSITIONS[1].minute;
      nextKind = TRANSITIONS[1].kind;
    }

    return {
      kind: TRANSITIONS[index].kind,
      isPeak: TRANSITIONS[index].kind === "peak",
      nextKind: nextKind,
      end: new Date(dayStart + endMinute * 60000),
      minuteOfDay: minuteOfDay
    };
  }

  getNextSwitches(now, count) {
    if (!now) now = new Date();
    if (!count) count = 5;
    const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
    const out = [];
    let day = 0;
    let index = 0;
    while (out.length < count) {
      const absolute = day * 1440 + SWITCHES[index].minute;
      if (absolute > minuteOfDay) {
        out.push({
          date: new Date(dayStart + absolute * 60000),
          kind: SWITCHES[index].kind
        });
      }
      index++;
      if (index >= SWITCHES.length) {
        index = 0;
        day++;
      }
    }
    return out;
  }

  getCurrentWindowStart(now) {
    if (!now) now = new Date();
    const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
    let best = null;
    [-1, 0].forEach(function (day) {
      SWITCHES.forEach(function (s) {
        const absolute = day * 1440 + s.minute;
        if (absolute <= minuteOfDay && (best === null || absolute > best)) {
          best = absolute;
        }
      });
    });
    return new Date(dayStart + best * 60000);
  }

  getWindowList(now, count) {
    if (!now) now = new Date();
    if (!count) count = 4;
    const upcoming = this.getNextSwitches(now, count);
    let start = this.getCurrentWindowStart(now);
    let kind = this.getCurrentUtcWindow(now).kind;
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push({
        start: start,
        end: upcoming[i].date,
        kind: kind,
        isPeak: kind === "peak",
        current: i === 0
      });
      start = upcoming[i].date;
      kind = upcoming[i].kind;
    }
    return out;
  }

  getDisplaySegments() {
    const offset = this.getDisplayOffset();
    const points = TRANSITIONS.map(function (t) {
      return {
        minute: ((t.minute + offset) % 1440 + 1440) % 1440,
        kind: t.kind
      };
    });
    points.sort(function (a, b) {
      return a.minute - b.minute;
    });

    const raw = [];
    if (points[0].minute > 0) {
      raw.push({ start: 0, end: points[0].minute, kind: points[points.length - 1].kind });
    }
    points.forEach(function (point, i) {
      const end = i + 1 < points.length ? points[i + 1].minute : 1440;
      if (end > point.minute) {
        raw.push({ start: point.minute, end: end, kind: point.kind });
      }
    });

    const merged = [];
    raw.forEach(function (segment) {
      const last = merged[merged.length - 1];
      if (last && last.kind === segment.kind) {
        last.end = segment.end;
      } else {
        merged.push({ start: segment.start, end: segment.end, kind: segment.kind });
      }
    });
    return merged;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DeepSeekCalculator;
}
