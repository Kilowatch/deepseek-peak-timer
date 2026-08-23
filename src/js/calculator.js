/** DeepSeek V4 peak/off-peak schedule and cost calculator. */
const PRICING_SOURCE = 'https://api-docs.deepseek.com/quick_start/pricing/';
const CHANGELOG_SOURCE = 'https://api-docs.deepseek.com/updates/';
const PRICING_EFFECTIVE_AT = '2026-08-16T16:00:00Z';
// From 2026-08-23 00:00 Beijing time, Saturday and Sunday use off-peak rates all day.
const WEEKEND_OFF_PEAK_EFFECTIVE_AT = Date.parse('2026-08-22T16:00:00Z');
const PRICING_CATALOGUE = {
  version: '2026-08-16',
  models: [
    { id: 'deepseek-v4-flash', label: 'V4 Flash', cacheHit: { off: 0.007, peak: 0.014 }, cacheMiss: { off: 0.22, peak: 0.44 }, output: { off: 0.66, peak: 1.32 }, concurrency: 2500 },
    { id: 'deepseek-v4-pro', label: 'V4 Pro', cacheHit: { off: 0.022, peak: 0.044 }, cacheMiss: { off: 0.66, peak: 1.32 }, output: { off: 1.98, peak: 3.96 }, concurrency: 500 },
    { id: 'deepseek-v4-flash-vision-exp', label: 'V4 Flash Vision (Exp)', cacheHit: { off: 0.007, peak: 0.014 }, cacheMiss: { off: 0.22, peak: 0.44 }, output: { off: 0.66, peak: 1.32 }, concurrency: 2500, note: 'Images are converted to input tokens.' }
  ]
};
const TRANSITIONS = [{ minute: 0, kind: 'off' }, { minute: 60, kind: 'peak' }, { minute: 240, kind: 'off' }, { minute: 360, kind: 'peak' }, { minute: 600, kind: 'off' }];
const SWITCHES = TRANSITIONS.filter((item, index) => item.kind !== TRANSITIONS[(index + TRANSITIONS.length - 1) % TRANSITIONS.length].kind);

class DeepSeekCalculator {
  constructor() { this.zone = 'local'; this.autoDetectedTimezone = this.detectLocalTimezone(); }
  detectLocalTimezone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local Time'; } catch (_) { return 'Local Time'; } }
  setZone(zone) { if (['local', 'utc', 'beijing'].includes(zone)) this.zone = zone; }
  getTimezoneName() { return this.zone === 'beijing' ? 'Asia/Shanghai' : (this.zone === 'utc' ? 'UTC' : this.autoDetectedTimezone); }
  getDisplayOffset(now) { if (this.zone === 'utc') return 0; if (this.zone === 'beijing') return 480; return -(now || new Date()).getTimezoneOffset(); }
  getGmtOffsetLabel(now) { const offset = this.getDisplayOffset(now); const sign = offset >= 0 ? '+' : '−'; const absolute = Math.abs(offset); return 'GMT' + sign + Math.floor(absolute / 60) + (absolute % 60 ? ':' + String(absolute % 60).padStart(2, '0') : ''); }
  getFormatters() { const options = { hour: '2-digit', minute: '2-digit', hour12: false }; if (this.zone !== 'local') options.timeZone = this.getTimezoneName(); return { timeFmt: new Intl.DateTimeFormat(undefined, options), timeZoneFmt: new Intl.DateTimeFormat(undefined, Object.assign({}, options, { timeZoneName: 'short' })) }; }
  formatClock(seconds) { const value = Math.max(0, Math.floor(seconds)); return [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60].map((n) => String(n).padStart(2, '0')).join(':'); }
  formatAwayLabel(milliseconds) { const minutes = Math.max(0, Math.floor(milliseconds / 60000)); return minutes >= 60 ? Math.floor(minutes / 60) + 'h ' + minutes % 60 + 'm' : minutes + 'm'; }
  formatDurationLabel(milliseconds) { return this.formatAwayLabel(milliseconds).replace(' 0m', ''); }
  isBeijingWeekend(now) { const beijing = new Date(now.getTime() + 480 * 60000); const day = beijing.getUTCDay(); return now.getTime() >= WEEKEND_OFF_PEAK_EFFECTIVE_AT && (day === 0 || day === 6); }
  getRateKind(now) { const minute = now.getUTCHours() * 60 + now.getUTCMinutes(); return this.isBeijingWeekend(now) ? 'off' : ((minute >= 60 && minute < 240) || (minute >= 360 && minute < 600) ? 'peak' : 'off'); }
  getSwitchesAround(now, direction, count) { const result = []; const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()); for (let offset = 0; result.length < count && offset < 14; offset += 1) { const date = new Date(day + direction * offset * 1440 * 60000); const candidates = direction > 0 ? SWITCHES : SWITCHES.slice().reverse(); candidates.forEach((sw) => { const candidate = new Date(date.getTime() + sw.minute * 60000); if ((direction > 0 ? candidate > now : candidate <= now) && this.getRateKind(candidate) !== this.getRateKind(new Date(candidate.getTime() - 1))) result.push({ date: candidate, kind: this.getRateKind(candidate) }); }); } return result.sort((a, b) => direction * (a.date - b.date)).slice(0, count); }
  getCurrentUtcWindow(now) { now = now || new Date(); const kind = this.getRateKind(now); const next = this.getSwitchesAround(now, 1, 1)[0]; return { kind, isPeak: kind === 'peak', nextKind: next.kind, end: next.date, minuteOfDay: now.getUTCHours() * 60 + now.getUTCMinutes() }; }
  // Keep the timeline marker on the same clock used to format the countdown.
  getDisplayMinute(now) { now = now || new Date(); return (now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60 + now.getUTCMilliseconds() / 60000 + this.getDisplayOffset(now) + 1440) % 1440; }
  getTimelinePosition(now) { return this.getDisplayMinute(now) / 1440 * 100; }
  getNextSwitches(now, count) { return this.getSwitchesAround(now || new Date(), 1, count || 5); }
  getWindowList(now, count) { now = now || new Date(); count = count || 4; const current = this.getCurrentUtcWindow(now); const previous = this.getSwitchesAround(now, -1, 1)[0]; let start = previous ? previous.date : now; let kind = current.kind; return [current.end].concat(this.getNextSwitches(current.end, count - 1).map((item) => item.date)).map((end, index) => { const window = { start, end, kind, current: index === 0 }; start = end; kind = kind === 'peak' ? 'off' : 'peak'; return window; }); }
  getDisplaySegments(now) { now = now || new Date(); const displayMinute = this.getDisplayMinute(now); const displayDayStart = new Date(now.getTime() - displayMinute * 60000); const segments = []; let start = 0; let kind = this.getRateKind(displayDayStart); for (let minute = 1; minute <= 1440; minute += 1) { const nextKind = minute === 1440 ? null : this.getRateKind(new Date(displayDayStart.getTime() + minute * 60000)); if (nextKind !== kind) { segments.push({ start, end: minute, kind }); start = minute; kind = nextKind; } } return segments; }
  estimate(modelId, usage, kind) { const model = PRICING_CATALOGUE.models.find((item) => item.id === modelId) || PRICING_CATALOGUE.models[0]; const rateKind = kind || this.getCurrentUtcWindow().kind; const values = usage || {}; return (Number(values.cacheHit || 0) * model.cacheHit[rateKind] + Number(values.cacheMiss || 0) * model.cacheMiss[rateKind] + Number(values.output || 0) * model.output[rateKind]) / 1000000; }
}
if (typeof module !== 'undefined' && module.exports) module.exports = { DeepSeekCalculator, PRICING_CATALOGUE, PRICING_SOURCE, CHANGELOG_SOURCE, PRICING_EFFECTIVE_AT, WEEKEND_OFF_PEAK_EFFECTIVE_AT };
