const test = require('node:test');
const assert = require('node:assert/strict');
const { DeepSeekCalculator, PRICING_CATALOGUE } = require('../src/js/calculator.js');

function utc(hour, minute, second) { return new Date(Date.UTC(2026, 7, 22, hour, minute, second)); }

test('uses the official V4 UTC peak boundaries', () => {
  const calc = new DeepSeekCalculator();
  assert.equal(calc.getCurrentUtcWindow(utc(0, 59, 59)).kind, 'off');
  assert.equal(calc.getCurrentUtcWindow(utc(1, 0, 0)).kind, 'peak');
  assert.equal(calc.getCurrentUtcWindow(utc(3, 59, 59)).kind, 'peak');
  assert.equal(calc.getCurrentUtcWindow(utc(4, 0, 0)).kind, 'off');
  assert.equal(calc.getCurrentUtcWindow(utc(5, 59, 59)).kind, 'off');
  assert.equal(calc.getCurrentUtcWindow(utc(6, 0, 0)).kind, 'peak');
  assert.equal(calc.getCurrentUtcWindow(utc(9, 59, 59)).kind, 'peak');
  assert.equal(calc.getCurrentUtcWindow(utc(10, 0, 0)).kind, 'off');
});

test('off-peak runs through 01:00 UTC the following day', () => {
  const calc = new DeepSeekCalculator();
  const window = calc.getCurrentUtcWindow(utc(23, 0, 0));
  assert.equal(window.kind, 'off');
  assert.equal(window.end.toISOString(), '2026-08-24T01:00:00.000Z');
});

test('uses off-peak rates for the entire Beijing weekend after the effective time', () => {
  const calc = new DeepSeekCalculator();
  assert.equal(calc.getCurrentUtcWindow(new Date('2026-08-28T01:00:00.000Z')).kind, 'peak');
  assert.equal(calc.getCurrentUtcWindow(new Date('2026-08-28T16:00:00.000Z')).kind, 'off');
  assert.equal(calc.getCurrentUtcWindow(new Date('2026-08-29T01:00:00.000Z')).kind, 'off');
  assert.equal(calc.getCurrentUtcWindow(new Date('2026-08-30T06:00:00.000Z')).kind, 'off');
  assert.equal(calc.getCurrentUtcWindow(new Date('2026-08-31T01:00:00.000Z')).kind, 'peak');
});

test('shows the next Beijing weekday peak block after a weekend day ends', () => {
  const segments = new DeepSeekCalculator().getDisplaySegments(new Date('2026-08-23T06:00:00.000Z'));
  assert.deepEqual(segments, [{ start: 0, end: 1260, kind: 'off' }, { start: 1260, end: 1440, kind: 'peak' }]);
});

test('shows peak in red after 21:00 local when a Sunday crosses into Beijing Monday', () => {
  const calc = new DeepSeekCalculator();
  calc.getDisplayOffset = () => -240; // America/Toronto during daylight saving time.
  const segments = calc.getDisplaySegments(new Date('2026-08-23T12:51:48.500Z'));
  assert.deepEqual(segments, [
    { start: 0, end: 1260, kind: 'off' },
    { start: 1260, end: 1440, kind: 'peak' }
  ]);
});

test('always includes the next peak in the rolling 24-hour forecast', () => {
  const calc = new DeepSeekCalculator();
  const now = new Date('2026-08-23T12:51:48.500Z');
  const segments = calc.getForecastSegments(now);
  assert.equal(segments[0].kind, 'off');
  assert.equal(segments[1].kind, 'peak');
  assert.equal(segments[1].start, (new Date('2026-08-24T01:00:00.000Z') - now) / 60000);
});

test('places the timeline marker at the exact displayed time, including seconds', () => {
  const calc = new DeepSeekCalculator();
  calc.setZone('utc');
  const now = new Date('2026-08-24T08:51:48.500Z');
  assert.ok(Math.abs(calc.getDisplayMinute(now) - 531.8083333333333) < 1e-10);
  assert.ok(Math.abs(calc.getTimelinePosition(now) - 36.93113425925926) < 1e-10);
});

test('catalogue contains official V4 prices and half-price relationship', () => {
  PRICING_CATALOGUE.models.forEach((model) => {
    assert.equal(model.cacheHit.off * 2, model.cacheHit.peak);
    assert.equal(model.cacheMiss.off * 2, model.cacheMiss.peak);
    assert.equal(model.output.off * 2, model.output.peak);
  });
  assert.equal(calcEstimate('deepseek-v4-flash'), 0.88);
});

function calcEstimate(model) { return new DeepSeekCalculator().estimate(model, { cacheMiss: 1000000, output: 1000000 }, 'off'); }
