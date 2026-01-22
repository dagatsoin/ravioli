/**
 * Counter Repository - Database Abstraction
 *
 * Simulates a database for counter persistence.
 * In production, this would be PostgreSQL, MongoDB, etc.
 *
 * Each counter has an ID (multi-tenant support).
 */

export interface CounterRecord {
  id: string;
  count: number;
  stepId: number;  // Track step ID for hydration
  updatedAt: Date;
}

// In-memory database (simulates real DB)
const database = new Map<string, CounterRecord>();

// Track save operations for testing/logging
export const saveLog: Array<{ id: string; count: number; stepId: number; timestamp: Date }> = [];

// Configurable latency for testing race conditions
let nextSaveLatency: number | null = null;
export function setNextSaveLatency(ms: number): void {
  nextSaveLatency = ms;
  console.log(`[Repository] Next save will take ${ms}ms`);
}

export class CounterRepository {
  /**
   * Load counter from database
   * Returns null if not found (new counter)
   */
  async findById(id: string): Promise<CounterRecord | null> {
    // Simulate async DB call
    await this.simulateLatency();

    const record = database.get(id);
    console.log(`[Repository] findById("${id}") -> ${record ? `count: ${record.count}` : 'null'}`);
    return record ?? null;
  }

  /**
   * Save counter to database
   * Called by NAP (Step Reaction) after state changes
   * Stores both count and stepId for full hydration
   */
  async save(id: string, count: number, stepId: number): Promise<void> {
    // Use configured latency or default
    const latency = nextSaveLatency ?? 5;
    nextSaveLatency = null; // Reset after use

    console.log(`[Repository] save("${id}", ${count}, step=${stepId}) STARTED (will take ${latency}ms)`);

    // Simulate async DB call
    await new Promise((resolve) => setTimeout(resolve, latency));

    const record: CounterRecord = {
      id,
      count,
      stepId,
      updatedAt: new Date(),
    };

    database.set(id, record);
    saveLog.push({ id, count, stepId, timestamp: new Date() });

    console.log(`[Repository] save("${id}", ${count}, step=${stepId}) COMPLETED`);
  }

  /**
   * Get all counters (for debugging)
   */
  async findAll(): Promise<CounterRecord[]> {
    return Array.from(database.values());
  }

  /**
   * Clear database (for testing)
   */
  async clear(): Promise<void> {
    database.clear();
    saveLog.length = 0;
  }

  /**
   * Simulate database latency
   */
  private async simulateLatency(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 5));
  }
}

// Singleton repository instance
export const counterRepository = new CounterRepository();
