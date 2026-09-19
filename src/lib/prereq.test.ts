/**
 * Onkosul grafigi ve engel kurallari.
 *
 * Gercek veri testleri Insaat Muhendisligi (1198) katalogundan besleniyor.
 * Beklenen sayilar katalogun kendi ders sayfalari tek tek okunarak dogrulandi,
 * kod cikti vermedi diye yazilmadi.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
    blockers,
    buildGraph,
    cascade,
    chainLevels,
    depth,
    impactOf,
    type BlockerContext,
} from './prereq'
import type { CatalogCourse, Prerequisite } from '../types'

// public/data tsconfig "include" disinda; import yerine diskten okunur ki
// production build'i etkilemesin.
const programPath = (id: string) =>
    fileURLToPath(new URL(`../../public/data/programs/${id}.json`, import.meta.url))

const loadCourses = (id: string): CatalogCourse[] =>
    JSON.parse(readFileSync(programPath(id), 'utf-8')).courses

// --------------------------------------------------------------------------
// Sentetik ders uretici
// --------------------------------------------------------------------------

const make = (
    code: string,
    opts: Partial<CatalogCourse> & { prerequisites?: Prerequisite[] } = {},
): CatalogCourse => ({
    id: `test:${code}`,
    code,
    name: code,
    type: 'ZORUNLU',
    rawType: 'ZORUNLU',
    offered: 'G',
    t: 3,
    u: 0,
    l: 0,
    credit: 3,
    ects: 5,
    term: 5,
    termUnit: 'Donem',
    termLabel: '5. Donem',
    elective: false,
    poolScope: null,
    detail: `tr_0_0_${code}.html`,
    prerequisites: [],
    ...opts,
})

const ctx = (over: Partial<BlockerContext> = {}): BlockerContext => ({
    grades: {},
    gpa: 3.0,
    faculty: 'Mühendislik Fakültesi',
    ...over,
})

// --------------------------------------------------------------------------

describe('buildGraph / cascade, gercek katalog verisi', () => {
    const courses = loadCourses('1198')
    const graph = buildGraph(courses)

    it('Statik zincirinde tam olarak 10 ders kilitlenir', () => {
        // Katalogdaki 16 onkosullu dersten Statik'e bagli olanlarin
        // gecisli kapanisi. Elle sayildi.
        expect(cascade(graph, 'İNŞ 1012')).toHaveLength(10)
    })

    it('zincir 4. sinif derslerine kadar iner', () => {
        expect(cascade(graph, 'İNŞ 1012')).toContain('İNŞ 4109')
    })

    it('zincir derinligi 4 kademedir', () => {
        // Statik > Mukavemet I > Yapi Statigi I > Yapi Statigi II > Yapi Dinamigi
        expect(depth(graph, 'İNŞ 1012')).toBe(4)
    })

    it('onkosulsuz ders hicbir sey kilitlemez', () => {
        expect(cascade(graph, 'ATA 1001')).toEqual([])
        expect(depth(graph, 'ATA 1001')).toBe(0)
    })

    it('etki ozeti son yariyili 8 olarak verir', () => {
        const impact = impactOf(graph, 'İNŞ 1012')
        expect(impact.locked).toHaveLength(10)
        expect(impact.lastTerm).toBe(8)
        // Yariyila gore sirali olmali: ilk kilitlenen 3. donemdeki Mukavemet I.
        expect(impact.locked[0].code).toBe('İNŞ 2001')
    })
})

describe('chainLevels', () => {
    it('Insaat zinciri 5 kademeye ayrilir', () => {
        const levels = chainLevels(buildGraph(loadCourses('1198')))
        // Statik(0) > Mukavemet I(1) > Yapi Statigi I(2) > Yapi Statigi II(3)
        // > Yapi Dinamigi(4)
        expect(levels).toHaveLength(5)
        expect(levels[0].map((n) => n.code)).toContain('İNŞ 1012')
        expect(levels[4].map((n) => n.code)).toContain('İNŞ 4109')
    })

    it('zincire katilmayan dersler disarida kalir', () => {
        const levels = chainLevels(buildGraph(loadCourses('1198')))
        const codes = levels.flat().map((n) => n.code)
        expect(codes).not.toContain('ATA 1001')
    })

    it('her dersin dogrudan onkosullari tasinir', () => {
        const levels = chainLevels(buildGraph(loadCourses('1198')))
        const mukavemet = levels.flat().find((n) => n.code === 'İNŞ 2001')
        expect(mukavemet?.requires).toEqual(['İNŞ 1012'])
    })

    it('onkosulsuz programda bos dizi doner', () => {
        expect(chainLevels(buildGraph([make('AAA 1001')]))).toEqual([])
    })

    it('dongudeki dersler kaybolmaz', () => {
        const levels = chainLevels(
            buildGraph([
                make('AAA 1001', { prerequisites: [{ code: 'BBB 2001', name: 'B' }] }),
                make('BBB 2001', { prerequisites: [{ code: 'AAA 1001', name: 'A' }] }),
            ]),
        )
        expect(levels.flat().map((n) => n.code).sort()).toEqual(['AAA 1001', 'BBB 2001'])
    })
})

describe('buildGraph, kenar durumlar', () => {
    it('kodu bos onkosul grafige girmez', () => {
        const graph = buildGraph([
            make('AAA 1001'),
            make('BBB 2001', {
                prerequisites: [{ code: '', name: 'Bolum onayi gerekir' }],
            }),
        ])
        expect(graph.requires.has('BBB 2001')).toBe(false)
    })

    it('dongu sonsuz donguye girmez', () => {
        const graph = buildGraph([
            make('AAA 1001', { prerequisites: [{ code: 'BBB 2001', name: 'B' }] }),
            make('BBB 2001', { prerequisites: [{ code: 'AAA 1001', name: 'A' }] }),
        ])
        expect(cascade(graph, 'AAA 1001')).toEqual(['BBB 2001'])
        expect(depth(graph, 'AAA 1001')).toBe(1)
    })

    it('prerequisites alani hic yoksa cokmez', () => {
        const noField = make('AAA 1001')
        delete (noField as { prerequisites?: unknown }).prerequisites
        expect(() => buildGraph([noField])).not.toThrow()
    })
})

describe('blockers, onkosul kurali (ver5 MADDE 6/5)', () => {
    const course = make('İNŞ 2001', {
        prerequisites: [{ code: 'İNŞ 1012', name: 'STATİK' }],
    })

    it('onkosul gecilmisse engel yoktur', () => {
        expect(blockers(course, ctx({ grades: { 'İNŞ 1012': 'DD' } }))).toEqual([])
    })

    it('FD basarisizdir, ders kilitlenir (MADDE 26/4)', () => {
        const found = blockers(course, ctx({ grades: { 'İNŞ 1012': 'FD' } }))
        expect(found).toHaveLength(1)
        expect(found[0].kind).toBe('PREREQ_FAILED')
        expect(found[0].severity).toBe('blocked')
        expect(found[0].code).toBe('İNŞ 1012')
    })

    it('hic alinmamis onkosul PREREQ_MISSING verir', () => {
        const found = blockers(course, ctx({ grades: {} }))
        expect(found[0].kind).toBe('PREREQ_MISSING')
    })

    it('ortalamaya girmeyen gecer notlar (B, M) onkosulu saglar', () => {
        expect(blockers(course, ctx({ grades: { 'İNŞ 1012': 'B' } }))).toEqual([])
        expect(blockers(course, ctx({ grades: { 'İNŞ 1012': 'M' } }))).toEqual([])
    })

    it('birden fazla onkosul ayri ayri raporlanir', () => {
        const two = make('XXX 3001', {
            prerequisites: [
                { code: 'AAA 1001', name: 'A' },
                { code: 'BBB 1002', name: 'B' },
            ],
        })
        expect(blockers(two, ctx({ grades: { 'AAA 1001': 'CC' } }))).toHaveLength(1)
        expect(blockers(two, ctx({ grades: {} }))).toHaveLength(2)
    })
})

describe('blockers, 1.80 GNO baraji (ver5 MADDE 9/3)', () => {
    const plain = make('İNŞ 3099', { term: 5 })

    it('baraj altinda yeni ders uyari verir', () => {
        const found = blockers(plain, ctx({ gpa: 1.79 }))
        expect(found).toHaveLength(1)
        expect(found[0].kind).toBe('GPA_FLOOR')
    })

    it('baraj kesin engel degil, uyaridir', () => {
        // Istisna listesindeki "universite secmeli" kalemi ders koduna guvenle
        // eslenemedi; yanlis "alamazsin" demektense uyari gosterilir.
        expect(blockers(plain, ctx({ gpa: 1.0 }))[0].severity).toBe('warning')
    })

    it('tam 1.80 barajI gecer', () => {
        expect(blockers(plain, ctx({ gpa: 1.8 }))).toEqual([])
    })

    it('daha once alinmis derse baraj uygulanmaz', () => {
        expect(
            blockers(plain, ctx({ gpa: 1.0, grades: { 'İNŞ 3099': 'FF' } })),
        ).toEqual([])
    })

    it('1. ve 2. yariyil dersleri muaftir', () => {
        expect(blockers(make('İNŞ 1012', { term: 1 }), ctx({ gpa: 1.0 }))).toEqual([])
        expect(blockers(make('İNŞ 1013', { term: 2 }), ctx({ gpa: 1.0 }))).toEqual([])
    })

    it('ortak zorunlu dersler muaftir', () => {
        for (const code of ['ATA 3001', 'TDL 3001', 'YDİ 3001', 'İSG 4001', 'ERA 3001']) {
            expect(blockers(make(code, { term: 5 }), ctx({ gpa: 1.0 }))).toEqual([])
        }
    })

    it('sosyal secmeli muaftir', () => {
        const social = make('MSİ 3001', { term: 5, rawType: 'SOSYAL SEÇMELİ' })
        expect(blockers(social, ctx({ gpa: 1.0 }))).toEqual([])
    })

    it('uygulama esaslari okunmamis fakultede baraj uygulanmaz', () => {
        expect(
            blockers(plain, ctx({ gpa: 1.0, faculty: 'Hukuk Fakültesi' })),
        ).toEqual([])
    })

    it('GNO bilinmiyorsa baraj uygulanmaz', () => {
        expect(blockers(plain, ctx({ gpa: null }))).toEqual([])
    })
})
