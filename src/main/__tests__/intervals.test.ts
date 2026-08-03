import { describe, expect, it } from 'vitest'
import { mergeIntervals, overlapWithIntervals } from '../intervals'

describe('mergeIntervals', () => {
    it('returns empty for no intervals', () => {
        expect(mergeIntervals([])).toEqual([])
    })

    it('merges overlapping intervals without double counting', () => {
        const merged = mergeIntervals([
            { start: 0, end: 10 },
            { start: 5, end: 20 },
            { start: 30, end: 40 },
        ])
        expect(merged).toEqual([
            { start: 0, end: 20 },
            { start: 30, end: 40 },
        ])
    })

    it('merges touching intervals and sorts input', () => {
        const merged = mergeIntervals([
            { start: 20, end: 30 },
            { start: 0, end: 10 },
            { start: 10, end: 20 },
        ])
        expect(merged).toEqual([{ start: 0, end: 30 }])
    })

    it('drops empty or inverted intervals', () => {
        expect(
            mergeIntervals([
                { start: 5, end: 5 },
                { start: 10, end: 8 },
            ])
        ).toEqual([])
    })

    it('handles a contained interval', () => {
        expect(
            mergeIntervals([
                { start: 0, end: 100 },
                { start: 10, end: 20 },
            ])
        ).toEqual([{ start: 0, end: 100 }])
    })

    it('does not mutate its input', () => {
        const input = [
            { start: 5, end: 20 },
            { start: 0, end: 10 },
        ]
        mergeIntervals(input)
        expect(input).toEqual([
            { start: 5, end: 20 },
            { start: 0, end: 10 },
        ])
    })
})

describe('overlapWithIntervals', () => {
    const merged = [
        { start: 10, end: 20 },
        { start: 40, end: 50 },
    ]

    it('sums overlap across multiple intervals', () => {
        expect(overlapWithIntervals(merged, 0, 100)).toBe(20)
    })

    it('computes partial overlap', () => {
        expect(overlapWithIntervals(merged, 15, 45)).toBe(10)
    })

    it('returns 0 when disjoint', () => {
        expect(overlapWithIntervals(merged, 20, 40)).toBe(0)
    })
})
