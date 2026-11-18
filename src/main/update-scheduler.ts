export type BackgroundCheckResult = 'success' | 'failed' | 'deferred'

const MINUTE = 60_000
const REGULAR_INTERVAL = 6 * 60 * MINUTE
const RETRY_INTERVALS = [30, 60, 120, 240, 360].map((minutes) => minutes * MINUTE)

export class UpdateScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null
  private enabled = false
  private generation = 0
  private failures = 0

  constructor(
    private readonly check: () => Promise<BackgroundCheckResult>,
    private readonly cancel: () => void,
    private readonly random = Math.random
  ) {}

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return
    this.enabled = enabled
    this.generation += 1
    if (enabled) {
      this.schedule(30_000 + this.random() * 15_000)
    } else {
      if (this.timer !== null) clearTimeout(this.timer)
      this.timer = null
      this.cancel()
    }
  }

  private schedule(delay: number): void {
    const generation = this.generation
    this.timer = setTimeout(() => void this.run(generation), delay)
    this.timer.unref()
  }

  private async run(generation: number): Promise<void> {
    this.timer = null
    let result: BackgroundCheckResult
    try {
      result = await this.check()
    } catch {
      result = 'failed'
    }
    // A check started before disabling/re-enabling must not create another timer.
    if (!this.enabled || generation !== this.generation) return
    if (result === 'success') this.failures = 0
    if (result === 'failed') this.failures = Math.min(this.failures + 1, RETRY_INTERVALS.length)
    const delay = result === 'deferred' ? 15 * MINUTE
      : result === 'failed' ? RETRY_INTERVALS[this.failures - 1]! : REGULAR_INTERVAL
    this.schedule(delay + this.random() * Math.min(delay / 10, 15 * MINUTE))
  }
}
