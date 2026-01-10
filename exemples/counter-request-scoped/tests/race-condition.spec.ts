/**
 * Race Condition Test - awaitAsync Solution
 *
 * Verifies that with awaitAsync: true, saves complete in order:
 * 1. Action 1 triggers NAP save (slow: 1000ms) - AWAITED
 * 2. Action 2 is BUFFERED until Action 1's save completes
 * 3. Action 2 triggers NAP save (fast: 5ms) - AWAITED
 *
 * Result: Saves complete in order, no stale writes!
 */

import { getCounter, clearCache } from '../server/counter-manager.js';
import { counterRepository, saveLog, setNextSaveLatency } from '../server/repository.js';

describe('Race Condition: awaitAsync Solution', () => {
  beforeEach(async () => {
    clearCache();
    await counterRepository.clear();
  });

  it('should prevent stale writes with awaitAsync: true', async () => {
    console.log('\n========================================');
    console.log('RACE CONDITION TEST: awaitAsync SOLUTION');
    console.log('========================================\n');

    // Get counter at 0
    const counter = await getCounter('race-test');
    const rep = counter.representationRef.current;

    console.log(`\n[Test] Initial state: count=${rep.getCount()}, step=${counter.stepId}`);

    // Make first save SLOW (500ms)
    setNextSaveLatency(500);

    // Action 1: increment to 1
    console.log('\n[Test] Action 1: increment (save will take 500ms)');
    rep.actions.increment();

    // Immediately trigger Action 2 (will be BUFFERED until Action 1 completes)
    console.log('[Test] Action 2: increment immediately (will be buffered)');
    rep.actions.increment();

    console.log(`\n[Test] Container state: count=${rep.getCount()}, step=${counter.stepId}`);

    // Wait for both saves to complete sequentially
    console.log('\n[Test] Waiting for saves to complete in order...\n');
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Check final DB state
    const dbRecord = await counterRepository.findById('race-test');
    console.log('\n========================================');
    console.log('RESULTS:');
    console.log('========================================');
    console.log(`Container count: ${rep.getCount()}`);
    console.log(`Database count:  ${dbRecord?.count}`);
    console.log(`Save log: ${saveLog.map((s) => `save(${s.count})`).join(' -> ')}`);

    console.log('\n✅ With awaitAsync: true, saves complete in order!');
    console.log('   Action 2 was buffered until Action 1 save completed.');

    // Saves should be in order: save(1) -> save(2)
    expect(saveLog.map((s) => s.count)).toEqual([1, 2]);

    // Container and DB should be in sync
    expect(dbRecord?.count).toBe(rep.getCount());
    expect(dbRecord?.count).toBe(2);
  });

  it('should show the sequential timeline with awaitAsync', async () => {
    console.log('\n========================================');
    console.log('TIMELINE: awaitAsync SEQUENTIAL SAVES');
    console.log('========================================\n');

    const timeline: string[] = [];
    const startTime = Date.now();
    const log = (msg: string) => {
      timeline.push(`[${Date.now() - startTime}ms] ${msg}`);
      console.log(timeline[timeline.length - 1]);
    };

    const counter = await getCounter('timeline-test');
    const rep = counter.representationRef.current;

    log('Start: count=0');

    // Slow first save
    setNextSaveLatency(200);
    log('Action 1: increment() - NAP will save count=1 (200ms delay)');
    rep.actions.increment();

    // Immediately trigger second action (will be buffered)
    log('Action 2: increment() - BUFFERED (isRunningNAP = true)');
    rep.actions.increment();

    log(`Container shows: count=${rep.getCount()} (both mutations applied)`);

    // Wait for first save to complete
    await new Promise((r) => setTimeout(r, 250));
    let dbState = await counterRepository.findById('timeline-test');
    log(`After ~250ms: DB count=${dbState?.count} (save 1 completed)`);

    // Wait for second save to complete
    await new Promise((r) => setTimeout(r, 50));
    dbState = await counterRepository.findById('timeline-test');
    log(`After ~300ms: DB count=${dbState?.count} (save 2 completed)`);

    console.log('\n========================================');
    console.log('TIMELINE SUMMARY:');
    console.log('========================================');
    timeline.forEach((t) => console.log(t));

    console.log('\n✅ With awaitAsync: true, saves executed SEQUENTIALLY');
    console.log('   save(1) completed BEFORE save(2) started!');

    // Verify order
    expect(saveLog.map((s) => s.count)).toEqual([1, 2]);
    expect(dbState?.count).toBe(2);
  });
});
