/**
 * courseSlice degismezleri.
 *
 * Buradaki ilk test bir hata ayiklama seansindan kaldi: tarayicida program
 * eklendikten sonra iki derste kendiliginden AA notu gorunmustu. Arastirma
 * sonucu bunun tarayici otomasyonunun kazara actigi bir dropdown etkilesimi
 * oldugu, addProgram'in temiz oldugu bulundu. Degismez yine de kilitleniyor:
 * katalogdan gelen hicbir ders notlu baslamamalidir.
 */

import { describe, expect, it } from 'vitest'
import reducer, {
    importTranscript,
    addProgram,
    hydrate,
    selectProgress,
    setGrade,
    setStatus,
    toggleElective,
} from './courseSlice'
import type { CatalogCourse, ProgramData } from '../types'

const catalogCourse = (
    code: string,
    over: Partial<CatalogCourse> = {},
): CatalogCourse => ({
    id: `p1:${code}`,
    code,
    name: code,
    type: 'ZORUNLU',
    rawType: 'ZORUNLU',
    offered: 'G',
    t: 2,
    u: 2,
    l: 0,
    credit: 3,
    ects: 5,
    term: 1,
    termUnit: 'Donem',
    termLabel: '1 .Donem:',
    elective: false,
    poolScope: null,
    detail: '',
    ...over,
})

const program: ProgramData = {
    id: 'p1',
    name: 'Test Programi',
    faculty: 'Test Fakultesi',
    department: 'Test Fakultesi',
    level: 'lisans',
    levelLabel: 'Lisans',
    catalogYear: '2025-2026',
    terms: [
        { term: 1, unit: 'Donem', requiredEcts: 10, electiveEcts: 5, totalEcts: 15 },
    ],
    totalEcts: 15,
    courses: [
        catalogCourse('AAA 101'),
        catalogCourse('AAA 102'),
        catalogCourse('SEC 201', {
            elective: true,
            type: 'SECMELI',
            rawType: 'TEKNİK SEÇMELİ',
            poolScope: 'term',
        }),
    ],
}

const withProgram = () => reducer(undefined, addProgram(program))

describe('addProgram', () => {
    it('hicbir ders notlu baslamaz', () => {
        const state = withProgram()
        const graded = state.programs[0].courses.filter((c) => c.grade !== 'NA')
        expect(graded).toEqual([])
    })

    it('istatistikler sifirdan baslar', () => {
        const state = withProgram()
        expect(state.stats.gpa).toBe(0)
        expect(state.stats.gpaCredits).toBe(0)
        expect(state.stats.passedCourses).toBe(0)
        expect(state.stats.earnedEcts).toBe(0)
    })

    it('secmeli havuzu plan toplamlarina girmez', () => {
        const state = withProgram()
        // 2 zorunlu x 3 kredi = 6; havuzdaki SEC 201 secilmedigi icin sayilmaz.
        expect(state.stats.totalCredits).toBe(6)
        expect(state.stats.plannedEcts).toBe(10)
    })

    it('totalEcts katalogun resmi hedefidir, planin toplami degil', () => {
        const state = withProgram()
        // Katalog 15 AKTS diyor; ogrenci henuz 10 AKTS'lik ders planlamis.
        expect(state.stats.totalEcts).toBe(15)
        expect(state.stats.missingElectiveEcts).toBe(5)
    })

    it('secmeli secilince eksik AKTS kapanir', () => {
        const state = reducer(withProgram(), toggleElective('p1:SEC 201'))
        expect(state.stats.plannedEcts).toBe(15)
        expect(state.stats.missingElectiveEcts).toBe(0)
    })

    it('ayni program iki kez eklenince kopyalanmaz', () => {
        const state = reducer(withProgram(), addProgram(program))
        expect(state.programs).toHaveLength(1)
    })

    it('ders idleri kalicidir, her eklemede degismez', () => {
        const first = withProgram().programs[0].courses.map((c) => c.id)
        const second = withProgram().programs[0].courses.map((c) => c.id)
        expect(first).toEqual(second)
        expect(first[0]).toBe('p1:AAA 101')
    })
})

describe('setGrade / setStatus', () => {
    it('not girilince istatistik guncellenir', () => {
        const state = reducer(
            withProgram(),
            setGrade({ courseId: 'p1:AAA 101', grade: 'AA' }),
        )
        expect(state.stats.gpa).toBe(4)
        expect(state.stats.gpaCredits).toBe(3)
        expect(state.stats.passedCourses).toBe(1)
    })

    it('not girilen dersin durumu "aldim" olur, celismez', () => {
        const state = reducer(
            withProgram(),
            setGrade({ courseId: 'p1:AAA 101', grade: 'CB' }),
        )
        expect(state.programs[0].courses[0].status).toBe('ALDIM')
    })

    it('notu silinen ders "almadim"a doner', () => {
        let state = reducer(withProgram(), setGrade({ courseId: 'p1:AAA 101', grade: 'CB' }))
        state = reducer(state, setGrade({ courseId: 'p1:AAA 101', grade: 'NA' }))
        expect(state.programs[0].courses[0].status).toBe('ALMADIM')
        expect(state.stats.remainingCourses).toBe(2)
    })

    it('"aliniyor" isaretlenen dersin notu temizlenir ve ortalamaya girmez', () => {
        let state = reducer(withProgram(), setGrade({ courseId: 'p1:AAA 101', grade: 'AA' }))
        state = reducer(state, setStatus({ courseId: 'p1:AAA 101', status: 'ALINIYOR' }))
        expect(state.programs[0].courses[0].grade).toBe('NA')
        expect(state.stats.gpa).toBe(0)
        expect(state.stats.activeCourses).toBe(1)
    })

    it('bilinmeyen ders idsi durumu bozmaz', () => {
        const before = withProgram()
        const after = reducer(before, setGrade({ courseId: 'yok', grade: 'FF' }))
        expect(after.stats).toEqual(before.stats)
    })
})

describe('hydrate (katalogdan tazeleme)', () => {
    it('notlari ders idsine gore taze katalog verisine esler', () => {
        const state = reducer(
            undefined,
            hydrate({
                activeProgramId: 'p1',
                programs: [program],
                progress: {
                    p1: {
                        'p1:AAA 101': { grade: 'AA', status: 'ALDIM' },
                        'p1:SEC 201': { grade: 'BB', status: 'ALDIM', added: true },
                    },
                },
            }),
        )
        const byId = Object.fromEntries(state.programs[0].courses.map((c) => [c.id, c]))
        expect(byId['p1:AAA 101'].grade).toBe('AA')
        expect(byId['p1:SEC 201'].added).toBe(true)
        expect(byId['p1:AAA 102'].grade).toBe('NA')
    })

    it('ders verisi katalogdan gelir, kayitli kopyadan degil', () => {
        // Kullanicinin diskinde eski AKTS olsa bile katalog kazanir.
        const state = reducer(
            undefined,
            hydrate({
                activeProgramId: 'p1',
                programs: [program],
                progress: { p1: { 'p1:AAA 101': { grade: 'AA', status: 'ALDIM' } } },
            }),
        )
        const course = state.programs[0].courses.find((c) => c.id === 'p1:AAA 101')!
        expect(course.ects).toBe(5)
        expect(course.credit).toBe(3)
    })

    it('katalogdan kalkan program icin kayit atlanir', () => {
        const state = reducer(
            undefined,
            hydrate({
                activeProgramId: 'yok',
                programs: [program],
                progress: { p1: {}, yok: { 'yok:X 1': { grade: 'AA', status: 'ALDIM' } } },
            }),
        )
        expect(state.programs).toHaveLength(1)
        // Aktif program artik mevcut olmadigi icin ilk programa duser.
        expect(state.activeProgramId).toBe('p1')
    })
})

describe('importTranscript', () => {
    it('notlari toplu yazar ve havuz dersini plana alir', () => {
        const state = reducer(
            withProgram(),
            importTranscript({
                entries: [
                    { courseId: 'p1:AAA 101', grade: 'AA', status: 'ALDIM' },
                    { courseId: 'p1:SEC 201', grade: 'BB', status: 'ALDIM' },
                ],
                custom: [],
            }),
        )
        const byId = Object.fromEntries(state.programs[0].courses.map((c) => [c.id, c]))
        expect(byId['p1:AAA 101'].grade).toBe('AA')
        // Havuz dersi otomatik mufredata dahil edilmeli, yoksa notu sayilmaz.
        expect(byId['p1:SEC 201'].added).toBe(true)
        expect(state.stats.gpaCredits).toBe(6)
    })

    it('donemsiz havuz dersini transkriptteki yariyila yerlestirir', () => {
        // "HER DONEM AKTS'YE GORE SECILEBILIR DERSLER" havuzunda term null gelir.
        const base = reducer(
            undefined,
            addProgram({
                ...program,
                courses: [
                    ...program.courses,
                    catalogCourse('ANY 301', {
                        elective: true,
                        type: 'SECMELI',
                        poolScope: 'any',
                        term: null,
                        termUnit: null,
                    }),
                ],
            }),
        )
        const state = reducer(
            base,
            importTranscript({
                entries: [{ courseId: 'p1:ANY 301', grade: 'AA', status: 'ALDIM', term: 1 }],
                custom: [],
            }),
        )
        const course = state.programs[0].courses.find((c) => c.id === 'p1:ANY 301')!
        expect(course.term).toBe(1)
        expect(course.added).toBe(true)
    })

    it('eslesmeyen dersi mufredata ekler', () => {
        const state = reducer(
            withProgram(),
            importTranscript({
                entries: [],
                custom: [{
                    code: 'XYZ 101', name: 'Transkriptten', t: 2, u: 2, l: 0,
                    ects: 5, term: 1, grade: 'CC', status: 'ALDIM',
                }],
            }),
        )
        const added = state.programs[0].courses.find((c) => c.code === 'XYZ 101')!
        expect(added.credit).toBe(3)
        expect(added.grade).toBe('CC')
        expect(added.added).toBe(true)
    })

    it('temiz yukle (replace) onceki transkript izini birakmaz', () => {
        // Birinci transkript: bir katalog dersi notlanir, bir de ozel ders eklenir.
        let state = reducer(
            withProgram(),
            importTranscript({
                entries: [{ courseId: 'p1:AAA 101', grade: 'AA', status: 'ALDIM' }],
                custom: [{
                    code: 'ESKI 101', name: 'Ilk transkriptten', t: 2, u: 2, l: 0,
                    ects: 5, term: 1, grade: 'CC', status: 'ALDIM',
                }],
                replace: true,
            }),
        )
        // Ikinci (farkli) transkript temiz yuklenir: farkli katalog dersi + farkli ozel ders.
        state = reducer(
            state,
            importTranscript({
                entries: [{ courseId: 'p1:AAA 102', grade: 'BB', status: 'ALDIM' }],
                custom: [{
                    code: 'YENI 201', name: 'Ikinci transkriptten', t: 2, u: 2, l: 0,
                    ects: 5, term: 1, grade: 'BA', status: 'ALDIM',
                }],
                replace: true,
            }),
        )

        const byId = Object.fromEntries(state.programs[0].courses.map((c) => [c.code, c]))
        // Onceki transkriptin izi kalmamali.
        expect(byId['ESKI 101']).toBeUndefined()
        expect(byId['AAA 101'].grade).toBe('NA')
        // Yeni transkript uygulanmis olmali.
        expect(byId['AAA 102'].grade).toBe('BB')
        expect(byId['YENI 201'].grade).toBe('BA')
    })

    it('birlestir (replace kapali) mevcut notlari korur', () => {
        let state = reducer(
            withProgram(),
            importTranscript({
                entries: [{ courseId: 'p1:AAA 101', grade: 'AA', status: 'ALDIM' }],
                custom: [],
            }),
        )
        state = reducer(
            state,
            importTranscript({
                entries: [{ courseId: 'p1:AAA 102', grade: 'BB', status: 'ALDIM' }],
                custom: [],
                replace: false,
            }),
        )
        const byId = Object.fromEntries(state.programs[0].courses.map((c) => [c.id, c]))
        // Ilk transkriptin notu korunur, ikincisi uzerine eklenir.
        expect(byId['p1:AAA 101'].grade).toBe('AA')
        expect(byId['p1:AAA 102'].grade).toBe('BB')
    })
})

describe('selectProgress', () => {
    it('yalnizca dokunulmus dersleri diske yazar', () => {
        const state = reducer(withProgram(), setGrade({ courseId: 'p1:AAA 101', grade: 'CC' }))
        const progress = selectProgress(state)
        expect(Object.keys(progress.p1)).toEqual(['p1:AAA 101'])
        expect(progress.p1['p1:AAA 101']).toEqual({ grade: 'CC', status: 'ALDIM' })
    })
})

describe('toggleElective', () => {
    it('havuzdan eklenen secmeli toplamlara dahil olur', () => {
        const state = reducer(withProgram(), toggleElective('p1:SEC 201'))
        expect(state.stats.totalCredits).toBe(9)
        expect(state.stats.totalEcts).toBe(15)
    })

    it('havuzdan cikarilan secmelinin notu sifirlanir', () => {
        let state = reducer(withProgram(), toggleElective('p1:SEC 201'))
        state = reducer(state, setGrade({ courseId: 'p1:SEC 201', grade: 'AA' }))
        state = reducer(state, toggleElective('p1:SEC 201'))
        expect(state.programs[0].courses[2].grade).toBe('NA')
        expect(state.stats.totalCredits).toBe(6)
    })
})
