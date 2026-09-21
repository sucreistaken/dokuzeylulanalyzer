/**
 * Transkript okuma ve ice aktarim: SINIR DURUMLARI.
 *
 * Buradaki veriler SENTETIKTIR; amac gercek bir belgeyi temsil etmek degil,
 * canliya sizarsa sessizce yanlis GANO uretecek durumlari kilitlemek.
 * Gercek belge dogrulamalari: transcript.test.ts, transcriptYok.test.ts,
 * transcriptYokActiveTerm.test.ts.
 *
 * Kural kaynaklari (transkript lejandi + yonetmelik MADDE 9 / 26):
 *  - Tekrarda "son BASARI notu" gecerlidir; notu girilmemis tekrar eski notu silmez.
 *  - D (Devamsiz) "FF islemi gorur": kredisiyle birlikte 0.00 ile ortalamaya girer.
 *  - B / M / Y kredisiz derslere verilir, ortalamaya girmezler.
 *  - Kodu "*" ile baslayan ders ortalamaya girmez.
 */

import { describe, expect, it } from 'vitest'
import { GRADE_POINTS, calculateGpa, isFailing, isPassed } from './grades'
import {
    parseYokTranscript,
    type TranscriptPage,
    type TranscriptRow,
    type TranscriptWord,
} from './transcript'
import { buildImportPlan, summarize, toGrade, toStatus } from './transcriptImport'
import type { Course, Grade } from '../types'

// ---------------------------------------------------------------------------
// e-Devlet (YÖK) sayfa ureticisi: sutunlar sayfa genisligine ORAN ile yerlesir.
// ---------------------------------------------------------------------------

const WIDTH = 595.28
const X = {
    code: 10, name: 80, status: 280, lang: 330,
    t: 370, u: 395, uk: 415, ects: 445, grade: 475, comment: 530,
}

const word = (x: number, y: number, text: string): TranscriptWord => ({
    x, y, w: text.length * 4, h: 6.1, text,
})

const line = (y: number, items: Array<[number, string]>): TranscriptWord[] =>
    items.map(([x, text]) => word(x, y, text))

const termHeader = (y: number, text: string): TranscriptWord[] =>
    line(y, [[40, text]])

interface CourseInput {
    code: string
    name?: string
    uk: number
    ects: number
    grade?: string
    comment?: string
}

const courseLine = (y: number, c: CourseInput): TranscriptWord[] => {
    const items: Array<[number, string]> = [
        [X.code, c.code],
        [X.name, c.name ?? 'DERS'],
        [X.status, 'Z'],
        [X.lang, 'Tr'],
        [X.t, '3'],
        [X.u, '0'],
        [X.uk, String(c.uk)],
        [X.ects, String(c.ects)],
    ]
    if (c.grade) items.push([X.grade, c.grade])
    if (c.comment) items.push([X.comment, c.comment])
    return line(y, items)
}

const gnoLine = (y: number, gno: number): TranscriptWord[] =>
    line(y, [[40, `DNO:0`], [140, `GNO:${gno}`], [240, 'TUK:0'], [340, 'TAKTS:0']])

/** Satirlari 13pt araliklarla tek sayfaya dizer. */
const pageOf = (blocks: Array<(y: number) => TranscriptWord[]>): TranscriptPage => ({
    width: WIDTH,
    height: 841.89,
    words: blocks.flatMap((make, i) => make(150 + i * 13)),
})

const parse = (blocks: Array<(y: number) => TranscriptWord[]>) =>
    parseYokTranscript([pageOf(blocks)])

const rowOf = (parsed: { rows: TranscriptRow[] }, code: string) =>
    parsed.rows.find((r) => r.code === code)

// ---------------------------------------------------------------------------

describe('e-Devlet ayristirici: tekrar ve devam eden ders', () => {
    it('notu girilmemis tekrar, eski notu silmez ve dersi "devam ediyor" yapar', () => {
        const parsed = parse([
            (y) => termHeader(y, '2025-2026 Güz Dönemi'),
            (y) => courseLine(y, { code: 'MAT 1009', uk: 4, ects: 5, grade: 'FF' }),
            (y) => termHeader(y, '2026-2027 Güz Dönemi'),
            (y) => courseLine(y, { code: 'MAT 1009', uk: 4, ects: 5, comment: 'TKR' }),
        ])
        expect(rowOf(parsed, 'MAT 1009')?.grade).toBe('FF')
        expect(rowOf(parsed, 'MAT 1009')?.status).toBe('Devam Ediyor')
        // Kredi paydada kalmali: FF, 4 kredi.
        expect(parsed.totals?.credits).toBe(4)
    })

    it('eski donemde notsuz kalip sonra notla kapanan ders "devam ediyor" sayilmaz', () => {
        const parsed = parse([
            (y) => termHeader(y, '2024-2025 Güz Dönemi'),
            (y) => courseLine(y, { code: 'KİM 1115', uk: 4, ects: 5 }),
            (y) => termHeader(y, '2025-2026 Güz Dönemi'),
            (y) => courseLine(y, { code: 'KİM 1115', uk: 4, ects: 5, grade: 'BB' }),
        ])
        expect(rowOf(parsed, 'KİM 1115')?.grade).toBe('BB')
        expect(rowOf(parsed, 'KİM 1115')?.status).not.toBe('Devam Ediyor')
    })

    it('ayni kodun iki notlu kaydinda son donemdeki not gecerli', () => {
        const parsed = parse([
            (y) => termHeader(y, '2024-2025 Güz Dönemi'),
            (y) => courseLine(y, { code: 'FİZ 1103', uk: 4, ects: 5, grade: 'FF' }),
            (y) => termHeader(y, '2025-2026 Güz Dönemi'),
            (y) => courseLine(y, { code: 'FİZ 1103', uk: 4, ects: 5, grade: 'DD' }),
        ])
        expect(rowOf(parsed, 'FİZ 1103')?.grade).toBe('DD')
    })

    it('son not DUSUK olsa bile gecerlidir (MADDE 9/10)', () => {
        // "Yeniden alinan veya tekrarlanan derslerden alinan en son not, gecme
        // notudur." Yuksek olan degil, SON olan. (Ogrenci yaz okulunda not
        // yukseltmeye calisip dusurebilir.)
        const parsed = parse([
            (y) => termHeader(y, '2024-2025 Güz Dönemi'),
            (y) => courseLine(y, { code: 'MAT 1009', uk: 4, ects: 5, grade: 'AA' }),
            (y) => termHeader(y, '2025-2026 Yaz Okulu'),
            (y) => courseLine(y, { code: 'MAT 1009', uk: 4, ects: 5, grade: 'DD' }),
        ])
        expect(rowOf(parsed, 'MAT 1009')?.grade).toBe('DD')
    })

    it('hic notu olmayan yeni ders listede kalir', () => {
        const parsed = parse([
            (y) => termHeader(y, '2026-2027 Güz Dönemi'),
            (y) => courseLine(y, { code: 'JEF 1109', uk: 3, ects: 4 }),
        ])
        expect(rowOf(parsed, 'JEF 1109')?.grade).toBe('-')
        expect(parsed.totals?.credits).toBe(0)
    })
})

describe('e-Devlet ayristirici: donem basliklari', () => {
    it('"Yaz Okulu" ve "Yaz Dönemi" ikisi de donem sayar', () => {
        const okulu = parse([
            (y) => termHeader(y, '2025-2026 Güz Dönemi'),
            (y) => courseLine(y, { code: 'AAA 1001', uk: 2, ects: 2, grade: 'CC' }),
            (y) => termHeader(y, '2025-2026 Yaz Okulu'),
            (y) => courseLine(y, { code: 'BBB 1002', uk: 2, ects: 2, grade: 'CC' }),
        ])
        expect(rowOf(okulu, 'BBB 1002')?.term).toBe(2)

        const donemi = parse([
            (y) => termHeader(y, '2025-2026 Güz Dönemi'),
            (y) => courseLine(y, { code: 'AAA 1001', uk: 2, ects: 2, grade: 'CC' }),
            (y) => termHeader(y, '2025-2026 Yaz Dönemi'),
            (y) => courseLine(y, { code: 'BBB 1002', uk: 2, ects: 2, grade: 'CC' }),
        ])
        expect(rowOf(donemi, 'BBB 1002')?.term).toBe(2)
    })

    it('kumulatif GNO son donemin satirindan alinir', () => {
        const parsed = parse([
            (y) => termHeader(y, '2024-2025 Güz Dönemi'),
            (y) => courseLine(y, { code: 'AAA 1001', uk: 2, ects: 2, grade: 'CC' }),
            (y) => gnoLine(y, 2.0),
            (y) => termHeader(y, '2025-2026 Güz Dönemi'),
            (y) => courseLine(y, { code: 'BBB 1002', uk: 2, ects: 2, grade: 'AA' }),
            (y) => gnoLine(y, 3.0),
        ])
        expect(parsed.totals?.gpa).toBe(3.0)
    })
})

describe('e-Devlet ayristirici: ortalamaya girmeyen kayitlar', () => {
    it('"*" ile baslayan ders ortalamaya girmez', () => {
        const parsed = parse([
            (y) => termHeader(y, '2024-2025 Güz Dönemi'),
            (y) => courseLine(y, { code: 'AAA 1001', uk: 4, ects: 4, grade: 'AA' }),
            (y) => courseLine(y, { code: '*KPD 1000', uk: 1, ects: 2, grade: 'AA' }),
        ])
        expect(parsed.totals?.credits).toBe(4)
        expect(rowOf(parsed, 'KPD 1000')).toBeDefined()
    })

    it('Muaf (M) ortalamaya girmez ama AKTS kazandirir', () => {
        const parsed = parse([
            (y) => termHeader(y, '2024-2025 Güz Dönemi'),
            (y) => courseLine(y, { code: 'YDİ 1007', uk: 2, ects: 3, grade: 'M' }),
        ])
        expect(parsed.totals?.credits).toBe(0)
        expect(parsed.totals?.ects).toBe(3)
    })

    it('AKTS\'siz ve notsuz yer tutucu satiri atlar (hazirlik)', () => {
        const parsed = parse([
            (y) => termHeader(y, '2024-2025 Güz Dönemi'),
            (y) => courseLine(y, { code: 'HAZ 1001', uk: 0, ects: 0 }),
        ])
        expect(parsed.rows).toHaveLength(0)
    })

    it('"S" (yeterli) notunu B\'ye cevirir', () => {
        const parsed = parse([
            (y) => termHeader(y, '2024-2025 Güz Dönemi'),
            (y) => courseLine(y, { code: 'STJ 3000', uk: 0, ects: 4, grade: 'S' }),
        ])
        expect(rowOf(parsed, 'STJ 3000')?.grade).toBe('B')
    })
})

// ---------------------------------------------------------------------------
// Ice aktarim katmani
// ---------------------------------------------------------------------------

const row = (over: Partial<TranscriptRow>): TranscriptRow => ({
    code: 'AAA 1001', name: 'DERS', t: 3, u: 0, ects: 5, credit: 3,
    repeat: 1, grade: 'CC', status: '', term: 1, ...over,
})

describe('ice aktarim: tekrar eden ders secimi', () => {
    it('notu olan kayit, tekrar sayisi yuksek ama notsuz kayda tercih edilir', () => {
        const plan = buildImportPlan(
            [
                row({ grade: 'FF', repeat: 1, status: 'Kaldı' }),
                row({ grade: '-', repeat: 2, status: 'Devam Ediyor' }),
            ],
            [],
        )
        expect(plan.unmatched).toHaveLength(1)
        expect(plan.unmatched[0].grade).toBe('FF')
        expect(plan.unmatched[0].status).toBe('ALINIYOR')
    })

    it('gruptaki devam eden kayit, secilen kaydin durumunu ezer', () => {
        const plan = buildImportPlan(
            [
                row({ grade: 'DC', repeat: 1, status: 'Geçti' }),
                row({ grade: '-', repeat: 2, status: 'Devam Ediyor' }),
            ],
            [],
        )
        expect(plan.unmatched[0].grade).toBe('DC')
        expect(plan.unmatched[0].status).toBe('ALINIYOR')
    })

    it('devam eden kayit yoksa durum "aldim" kalir', () => {
        const plan = buildImportPlan([row({ grade: 'DC', status: 'Geçti' })], [])
        expect(plan.unmatched[0].status).toBe('ALDIM')
    })

    it('tekrar uyarisini bir kez uretir', () => {
        const plan = buildImportPlan(
            [row({ grade: 'FF' }), row({ grade: 'DD', repeat: 2 })],
            [],
        )
        expect(plan.warnings).toHaveLength(1)
        expect(plan.unmatched[0].grade).toBe('DD')
    })
})

describe('ice aktarim: not cevirme', () => {
    it('transkript lejandindaki tum harf disi notlari tanir', () => {
        for (const grade of ['B', 'M', 'Y', 'D', 'E', 'G', 'H', 'F', 'U']) {
            expect(toGrade(grade)).toBe(grade)
        }
    })

    it('taninmayan not dersi dusurur ve uyarir', () => {
        const plan = buildImportPlan([row({ grade: 'ZZ' })], [])
        expect(plan.unmatched).toHaveLength(0)
        expect(plan.warnings[0]).toContain('atlandi')
    })

    it('bos ve "-" notu "alinmadi" sayar', () => {
        expect(toGrade('')).toBe('NA')
        expect(toGrade('-')).toBe('NA')
    })

    it('"Devamsız" durumu dersin ALINDIGINI gosterir, "devam ediyor" ile karismaz', () => {
        expect(toStatus('Devamsız', 'D')).toBe('ALDIM')
        expect(toStatus('Devam Ediyor', 'NA')).toBe('ALINIYOR')
    })
})

describe('ice aktarim: ozet hesabi', () => {
    it('D (Devamsiz) kredisiyle birlikte ortalamaya girer', () => {
        const plan = buildImportPlan(
            [row({ code: 'AAA 1001', grade: 'AA', t: 4, u: 0, credit: 4 }),
             row({ code: 'BBB 1002', grade: 'D', t: 4, u: 0, credit: 4 })],
            [],
        )
        // (4*4.0 + 4*0.0) / 8 = 2.00
        expect(summarize(plan, GRADE_POINTS, true).gpa).toBe(2)
    })

    it('B ve M ortalamaya girmez', () => {
        const plan = buildImportPlan(
            [row({ code: 'AAA 1001', grade: 'AA', t: 4, u: 0 }),
             row({ code: 'BBB 1002', grade: 'B', t: 2, u: 0 }),
             row({ code: 'CCC 1003', grade: 'M', t: 2, u: 0 })],
            [],
        )
        expect(summarize(plan, GRADE_POINTS, true).gpa).toBe(4)
    })

    it('devam eden dersin AKTS\'si kazanilmis sayilmaz', () => {
        const plan = buildImportPlan(
            [row({ grade: 'FF', ects: 6 }), row({ grade: '-', repeat: 2, status: 'Devam Ediyor', ects: 6 })],
            [],
        )
        expect(summarize(plan, GRADE_POINTS, true).ects).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// Not kurallari
// ---------------------------------------------------------------------------

const course = (grade: Grade, credit: number): Course => ({
    id: `x:${grade}${credit}`, code: 'AAA 1001', name: 'DERS', type: 'ZORUNLU',
    rawType: 'ZORUNLU', offered: 'G', t: credit, u: 0, l: 0, credit, ects: 5,
    term: 1, termUnit: 'Donem', termLabel: '1. Donem', elective: false,
    poolScope: null, detail: '', prerequisites: [], grade, status: 'ALDIM',
})

describe('not kurallari', () => {
    it('D ortalamaya girer, B/M/Y girmez', () => {
        expect(calculateGpa([course('AA', 4), course('D', 4)]).gpa).toBe(2)
        expect(calculateGpa([course('AA', 4), course('B', 4)]).gpa).toBe(4)
        expect(calculateGpa([course('AA', 4), course('M', 4)]).gpa).toBe(4)
        expect(calculateGpa([course('AA', 4), course('Y', 4)]).gpa).toBe(4)
    })

    it('gecme/kalma siniflandirmasi', () => {
        expect(isPassed('DD')).toBe(true)
        expect(isPassed('FD')).toBe(false)
        expect(isFailing('D')).toBe(true)
        expect(isFailing('Y')).toBe(true)
        // Gecici/bilgi amacli notlar ne gecti ne kaldi sayilir.
        for (const grade of ['E', 'G', 'H', 'F', 'U'] as Grade[]) {
            expect(isPassed(grade)).toBe(false)
            expect(isFailing(grade)).toBe(false)
        }
    })
})
