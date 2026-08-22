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
  assert.equal(window.end.toISOString(), '2026-08-23T01:00:00.000Z');
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
