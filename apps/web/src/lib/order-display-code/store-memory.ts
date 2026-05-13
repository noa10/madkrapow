import type { OrderDisplayCodeStore } from './store'

/**
 * In-memory implementation of {@link OrderDisplayCodeStore}.
 *
 * Atomicity: JavaScript runs each microtask without preemption, so `reserve` is
 * effectively atomic inside a single Node process. Not suitable for multi-process
 * deployments — use the Postgres-backed store there.
 */
export class InMemoryOrderDisplayCodeStore implements OrderDisplayCodeStore {
  /** date → set of reserved codes */
  private readonly codes = new Map<string, Set<string>>()

  async isUsed(dateString: string, code: string): Promise<boolean> {
    return this.codes.get(dateString)?.has(code) ?? false
  }

  async reserve(dateString: string, code: string): Promise<boolean> {
    let day = this.codes.get(dateString)
    if (!day) {
      day = new Set<string>()
      this.codes.set(dateString, day)
    }
    if (day.has(code)) return false
    day.add(code)
    return true
  }

  async countUsed(dateString: string, digitLength: number): Promise<number> {
    const day = this.codes.get(dateString)
    if (!day) return 0
    const targetLen = 'MK-'.length + digitLength
    let n = 0
    for (const code of day) if (code.length === targetLen) n++
    return n
  }

  /** Test helper: seed the store with N sequential codes at a given digit length. */
  seedSequential(dateString: string, digitLength: number, count: number): void {
    const day = this.codes.get(dateString) ?? new Set<string>()
    for (let i = 0; i < count; i++) {
      day.add(`MK-${i.toString().padStart(digitLength, '0')}`)
    }
    this.codes.set(dateString, day)
  }

  clear(): void {
    this.codes.clear()
  }
}
