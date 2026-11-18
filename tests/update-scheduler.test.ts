import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateScheduler, type BackgroundCheckResult } from '../src/main/update-scheduler'

const MINUTE = 60_000
const STARTUP = 30_000

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('background update scheduling', () => {
  it('waits for startup then runs every six hours with bounded jitter', async () => {
    const check = vi.fn(async (): Promise<BackgroundCheckResult> => 'success')
    const scheduler = new UpdateScheduler(check, vi.fn(), () => 0.5)
    scheduler.setEnabled(true)
    scheduler.setEnabled(true)
    await vi.advanceTimersByTimeAsync(37_499)
    expect(check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(367.5 * MINUTE - 1)
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('backs off on repeated failures, caps the interval, and resets after recovery', async () => {
    const check = vi.fn(async (): Promise<BackgroundCheckResult> => 'failed')
    const scheduler = new UpdateScheduler(check, vi.fn(), () => 0)
    scheduler.setEnabled(true)
    await vi.advanceTimersByTimeAsync(STARTUP)
    expect(check).toHaveBeenCalledTimes(1)
    for (const [index, minutes] of [30, 60, 120, 240, 360, 360].entries()) {
      await vi.advanceTimersByTimeAsync(minutes * MINUTE - 1)
      expect(check).toHaveBeenCalledTimes(index + 1)
      await vi.advanceTimersByTimeAsync(1)
      expect(check).toHaveBeenCalledTimes(index + 2)
    }
    check.mockResolvedValueOnce('success')
    await vi.advanceTimersByTimeAsync(360 * MINUTE)
    expect(check).toHaveBeenCalledTimes(8)
    await vi.advanceTimersByTimeAsync(360 * MINUTE)
    expect(check).toHaveBeenCalledTimes(9)
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    expect(check).toHaveBeenCalledTimes(10)
  })

  it('defers while the updater is busy without counting it as a failure', async () => {
    const check = vi.fn<() => Promise<BackgroundCheckResult>>()
      .mockResolvedValueOnce('deferred').mockRejectedValueOnce(new Error('offline')).mockResolvedValue('success')
    const scheduler = new UpdateScheduler(check, vi.fn(), () => 0)
    scheduler.setEnabled(true)
    await vi.advanceTimersByTimeAsync(STARTUP + 15 * MINUTE)
    expect(check).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    expect(check).toHaveBeenCalledTimes(3)
  })

  it('does not overlap checks or reschedule a stale attempt after toggling the setting', async () => {
    let finish!: (result: BackgroundCheckResult) => void
    const check = vi.fn<() => Promise<BackgroundCheckResult>>()
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve })).mockResolvedValue('success')
    const cancel = vi.fn()
    const scheduler = new UpdateScheduler(check, cancel, () => 0)
    scheduler.setEnabled(false)
    await vi.advanceTimersByTimeAsync(STARTUP)
    expect(check).not.toHaveBeenCalled()
    scheduler.setEnabled(true)
    await vi.advanceTimersByTimeAsync(STARTUP + 8 * 60 * MINUTE)
    expect(check).toHaveBeenCalledTimes(1)
    scheduler.setEnabled(false)
    expect(cancel).toHaveBeenCalledTimes(1)
    scheduler.setEnabled(true)
    await vi.advanceTimersByTimeAsync(STARTUP)
    finish('failed')
    await vi.advanceTimersByTimeAsync(6 * 60 * MINUTE)
    expect(check).toHaveBeenCalledTimes(3)
    scheduler.setEnabled(false)
    await vi.advanceTimersByTimeAsync(8 * 60 * MINUTE)
    expect(check).toHaveBeenCalledTimes(3)
  })
})
