/**
 * Shared primitives for half-open time intervals [start, end) in epoch
 * milliseconds. Used by the activity stats aggregation.
 */

export interface Interval {
    start: number // epoch ms, inclusive
    end: number // epoch ms, exclusive
}

/**
 * Merges overlapping or touching intervals into a sorted, disjoint list.
 * Empty and inverted intervals are dropped.
 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
    if (intervals.length === 0) return []

    const sorted = [...intervals].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start)

    const merged: Interval[] = []
    for (const interval of sorted) {
        const last = merged[merged.length - 1]
        if (last && interval.start <= last.end) {
            last.end = Math.max(last.end, interval.end)
        } else {
            merged.push({ start: interval.start, end: interval.end })
        }
    }
    return merged
}

/**
 * Returns the overlap of [start, end) with the given intervals in
 * milliseconds. The intervals must be sorted and disjoint (see
 * mergeIntervals); overlapping input would be double-counted.
 */
export function overlapWithIntervals(merged: Interval[], start: number, end: number): number {
    let total = 0
    for (const interval of merged) {
        if (interval.start >= end) break
        const lo = Math.max(start, interval.start)
        const hi = Math.min(end, interval.end)
        if (hi > lo) total += hi - lo
    }
    return total
}
