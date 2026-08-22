/** DeepSeek V4 peak/off-peak schedule and cost calculator. */
const PRICING_SOURCE = 'https://api-docs.deepseek.com/quick_start/pricing/';
const CHANGELOG_SOURCE = 'https://api-docs.deepseek.com/updates/';
const PRICING_EFFECTIVE_AT = '2026-08-16T16:00:00Z';
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
  getCurrentUtcWindow(now) { now = now || new Date(); const minute = now.getUTCHours() * 60 + now.getUTCMinutes(); let index = 0; TRANSITIONS.forEach((transition, i) => { if (transition.minute <= minute) index = i; }); const next = TRANSITIONS[index + 1]; const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()); return { kind: TRANSITIONS[index].kind, isPeak: TRANSITIONS[index].kind === 'peak', nextKind: next ? next.kind : 'peak', end: new Date(day + (next ? next.minute : 1500) * 60000), minuteOfDay: minute }; }
  getNextSwitches(now, count) { now = now || new Date(); count = count || 5; const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()); const current = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60; const result = []; for (let offset = 0; result.length < count; offset += 1) SWITCHES.forEach((sw) => { const absolute = offset * 1440 + sw.minute; if (absolute > current && result.length < count) result.push({ date: new Date(day + absolute * 60000), kind: sw.kind }); }); return result; }
  getWindowList(now, count) { now = now || new Date(); count = count || 4; const current = this.getCurrentUtcWindow(now); const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()); const starts = current.kind === 'peak' ? (current.minuteOfDay < 240 ? 60 : 360) : (current.minuteOfDay < 60 ? 0 : (current.minuteOfDay < 360 ? 240 : 600)); let start = new Date(day + starts * 60000); let kind = current.kind; const endings = this.getNextSwitches(now, count); return endings.map((item, index) => { const window = { start, end: item.date, kind, current: index === 0 }; start = item.date; kind = item.kind; return window; }); }
  getDisplaySegments(now) { const offset = this.getDisplayOffset(now); const points = TRANSITIONS.map((item) => ({ minute: (item.minute + offset + 1440) % 1440, kind: item.kind })).sort((a, b) => a.minute - b.minute); const raw = []; if (points[0].minute) raw.push({ start: 0, end: points[0].minute, kind: points[points.length - 1].kind }); points.forEach((point, i) => { const end = i + 1 < points.length ? points[i + 1].minute : 1440; if (end > point.minute) raw.push({ start: point.minute, end, kind: point.kind }); }); return raw.reduce((segments, segment) => { const previous = segments[segments.length - 1]; if (previous && previous.kind === segment.kind) previous.end = segment.end; else segments.push(segment); return segments; }, []); }
  estimate(modelId, usage, kind) { const model = PRICING_CATALOGUE.models.find((item) => item.id === modelId) || PRICING_CATALOGUE.models[0]; const rateKind = kind || this.getCurrentUtcWindow().kind; const values = usage || {}; return (Number(values.cacheHit || 0) * model.cacheHit[rateKind] + Number(values.cacheMiss || 0) * model.cacheMiss[rateKind] + Number(values.output || 0) * model.output[rateKind]) / 1000000; }
}
if (typeof module !== 'undefined' && module.exports) module.exports = { DeepSeekCalculator, PRICING_CATALOGUE, PRICING_SOURCE, CHANGELOG_SOURCE, PRICING_EFFECTIVE_AT };
