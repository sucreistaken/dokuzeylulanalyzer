/**
 * Not motorunun DEU transkriptiyle birebir ayni sonucu urettigini dogrular.
 *
 * Fixture'lar gercek bir DEU Bilgisayar Muhendisligi transkriptinden alindi.
 * Beklenen degerler transkriptin kendi "Toplam Kredi / Kredi*Bas.Notu / Ortalama"
 * satirlarindan okundu, hesaplanmadi.
 */

import { describe, expect, it } from 'vitest'
import { calculateGpa, localCredit, round2 } from './grades'
import type { Course, Grade } from '../types'

type Row = [code: string, t: number, u: number, ects: number, grade: Grade]

const course = ([code, t, u, ects, grade]: Row, term: number): Course => ({
    id: `test:${code}`,
    code,
    name: code,
    type: 'ZORUNLU',
    rawType: 'ZORUNLU',
    offered: 'G',
    t,
    u,
    l: 0,
    credit: localCredit(t, u, 0),
    ects,
    term,
    termUnit: 'Donem',
    termLabel: `${term}. Donem`,
    elective: false,
    poolScope: null,
    detail: '',
    grade,
    status: 'ALDIM',
})

// BIRINCI YARIYIL: AKTS 30, Toplam Kredi 20, Kredi*Bas.Notu 65, Ortalama 3.25
const term1: Row[] = [
    ['CME 1203', 2, 2, 4, 'CB'],
    ['CME 1205', 3, 0, 5, 'CB'],
    ['CME 1211', 2, 2, 5, 'AA'],
    ['CME 1251', 2, 2, 4, 'AA'],
    ['KPD 1001', 1, 0, 2, 'B'], // Basarili: AKTS'ye sayilir, ortalamaya girmez
    ['MAT 1001', 4, 0, 5, 'BA'],
    ['PHY 1101', 3, 2, 5, 'BB'],
]

// DORDUNCU YARIYIL: AKTS 33, Toplam Kredi 21, Kredi*Bas.Notu 71, Ortalama 3.38
const term4: Row[] = [
    ['CME 2202', 3, 2, 6, 'BB'],
    ['CME 2204', 2, 2, 6, 'AA'],
    ['CME 2206', 3, 2, 6, 'AA'],
    ['CME 2208', 3, 0, 4, 'BA'],
    ['CME 2210', 2, 2, 6, 'CB'],
    ['TDL 1002', 2, 0, 2, 'CB'],
    ['ESE 2037', 2, 0, 3, 'AA'],
]

describe('localCredit (yonetmelik MADDE 33)', () => {
    it('transkriptteki her dersin Toplam Kredi degerini uretir', () => {
        // [T, U, transkriptteki TK]
        const cases: Array<[number, number, number]> = [
            [2, 2, 3], [3, 0, 3], [2, 2, 3], [2, 2, 3], [1, 0, 1], [4, 0, 4], [3, 2, 4],
            [3, 2, 4], [2, 2, 3], [3, 2, 4], [3, 0, 3], [2, 2, 3], [2, 0, 2], [2, 0, 2],
        ]
        for (const [t, u, expected] of cases) {
            expect(localCredit(t, u, 0)).toBe(expected)
        }
    })
})

describe('calculateGpa (transkript dogrulamasi)', () => {
    it('1. yariyil: 20 kredi, 65 puan, 3.25 ortalama', () => {
        const result = calculateGpa(term1.map((r) => course(r, 1)))
        expect(result.credits).toBe(20)
        expect(result.points).toBe(65)
        expect(result.gpa).toBe(3.25)
    })

    it('4. yariyil: 21 kredi, 71 puan, 3.38 ortalama', () => {
        const result = calculateGpa(term4.map((r) => course(r, 4)))
        expect(result.credits).toBe(21)
        expect(result.points).toBe(71)
        expect(result.gpa).toBe(3.38)
    })

    it('B (Basarili) notu ortalamaya girmez ama ders sayilir', () => {
        const withB = calculateGpa(term1.map((r) => course(r, 1)))
        const withoutB = calculateGpa(
            term1.filter((r) => r[0] !== 'KPD 1001').map((r) => course(r, 1)),
        )
        // KPD 1001'in 1 kredisi paydaya eklenmemeli.
        expect(withB.credits).toBe(withoutB.credits)
        expect(withB.gpa).toBe(withoutB.gpa)
    })

    it('kumulatif: 79 kredi, 260.5 puan, 3.30 ortalama', () => {
        // Transkriptin 1-4. yariyil kumulatif satiri.
        const credits = 20 + 19 + 19 + 21
        const points = 65 + 58 + 66.5 + 71
        expect(credits).toBe(79)
        expect(points).toBe(260.5)
        expect(round2(points / credits)).toBe(3.3)
    })

    it('ders yokken NaN degil 0 doner', () => {
        expect(calculateGpa([]).gpa).toBe(0)
    })

    it('hicbir ders notlanmamissa NaN degil 0 doner', () => {
        const untaken = term1.map((r) => ({ ...course(r, 1), grade: 'NA' as Grade }))
        expect(calculateGpa(untaken).gpa).toBe(0)
        expect(calculateGpa(untaken).credits).toBe(0)
    })
})
