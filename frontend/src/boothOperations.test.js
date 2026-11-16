import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBoothOperations, createBoothClock, setBoothClockStage, advanceBoothClock, resolveBoothTimerStage } from './boothOperations.js';

test('old and corrupt settings preserve print defaults and leave extra time limits disabled', () => {
  const result = normalizeBoothOperations({ printCopies: 100, printOrientation: 'bad', printFit: 'bad', timing: { initialCountdown: -1, sessionSeconds: Infinity } });
  assert.deepEqual(result, { printCopies: 1, printOrientation: 'portrait', printFit: 'fit', timing: { initialCountdown: 3, nextCountdown: 3, sessionSeconds: 0, selectionSeconds: 0, editSeconds: 0 } });
  assert.equal(normalizeBoothOperations({ printCopies: '2', timing: { editSeconds: '60' } }).timing.editSeconds, 60);
  assert.equal(normalizeBoothOperations({ timing: null }).timing.initialCountdown, 3);
});
test('clock snapshots settings and starts session time at capture, not strip selection', () => {
  const timing = { sessionSeconds: 10, selectionSeconds: 5, editSeconds: 3 };
  let clock = setBoothClockStage(createBoothClock(timing), 'selection');
  timing.sessionSeconds = 1;
  clock = advanceBoothClock(clock, 2000, false);
  assert.equal(clock.stageRemaining, 3000);
  assert.equal(clock.sessionRemaining, 10000);
  clock = setBoothClockStage(clock, 'capture');
  assert.equal(advanceBoothClock(clock, 1000, false).sessionRemaining, 9000);
});
test('busy work and paused navigation cannot consume time or trigger expiry', () => {
  const clock = setBoothClockStage(createBoothClock({ sessionSeconds: 3 }), 'capture');
  assert.deepEqual(advanceBoothClock(clock, 10000, true), clock);
  assert.deepEqual(advanceBoothClock(clock, -100, false), clock);
  assert.deepEqual(advanceBoothClock(setBoothClockStage(clock, 'results'), 10000, false).expired, null);
});
test('stage expiry and session expiry stop at zero and cannot fire twice', () => {
  let clock = setBoothClockStage(createBoothClock({ editSeconds: 3, sessionSeconds: 10 }), 'editing');
  clock = advanceBoothClock(clock, 5000, false);
  assert.equal(clock.expired, 'editing');
  assert.equal(clock.stageRemaining, 0);
  assert.deepEqual(advanceBoothClock(clock, 5000, false), clock);
  clock = setBoothClockStage(createBoothClock({ editSeconds: 5, sessionSeconds: 2 }), 'editing');
  assert.equal(advanceBoothClock(clock, 5000, false).expired, 'session');
});
test('stage limits stay spent when leaving and returning to the same session stage', () => {
  let clock = setBoothClockStage(createBoothClock({ editSeconds: 10 }), 'editing');
  clock = advanceBoothClock(clock, 3000, false);
  clock = setBoothClockStage(clock, 'capture');
  clock = setBoothClockStage(clock, 'editing');
  assert.equal(clock.stageRemaining, 7000);
});
test('both modes map capture/edit/results accurately and start screens have no active timer', () => {
  assert.equal(resolveBoothTimerStage('oto', 1), 'idle');
  assert.equal(resolveBoothTimerStage('oto', 2), 'selection');
  assert.equal(resolveBoothTimerStage('oto', 3), 'capture');
  assert.equal(resolveBoothTimerStage('admin', 1), 'idle');
  assert.equal(resolveBoothTimerStage('admin', 2), 'capture');
  assert.equal(resolveBoothTimerStage('admin', 3), 'editing');
  assert.equal(resolveBoothTimerStage('admin', 4), 'results');
});
