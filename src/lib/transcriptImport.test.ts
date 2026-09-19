/**
 * Transkript -> katalog eslestirme testleri.
 *
 * Gercek transkript fixture'i, gercek 1210 katalog verisiyle eslestirilir.
 * Beklenen sayilar canli olculdu: 44 dersin 44'u bulunuyor (38 zorunlu,
 * 6 secmeli havuzunda, 0 eksik).
 */

import { describe, expect, it } from 'vitest'
import { GRADE_POINTS } from './grades'
import { parseTranscript, type TranscriptPage } from './transcript'
import {
    buildImportPlan,
    normalizeCode,
    summarize,
    toGrade,
    toStatus,
} from './transcriptImport'
import type { CatalogCourse, Course, ProgramData } from '../types'
import fixture from './__fixtures__/transcript-words.json'
import program from '../../public/data/programs/1210.json'

const rows = parseTranscript(fixture as TranscriptPage[]).rows

/** Katalog dersini, hicbir not girilmemis baslangic durumuna getirir. */
const courses: Course[] = (program as ProgramData).courses.map(
    (c: CatalogCourse) => ({
        ...c,
        grade: 'NA' as const,
        status: 'ALMADIM' as const,
        added: false,
    }),
)

const plan = buildImportPlan(rows, courses)

describe('normalizeCode', () => {
    it('bosluk farkini yok sayar', () => {
        expect(normalizeCode('CME1203')).toBe('CME 1203')
        expect(normalizeCode('CME 1203')).toBe('CME 1203')
        expect(normalizeCode('cme  1203')).toBe('CME 1203')
    })

    it('Turkce harfli kodlari bozmaz', () => {
        expect(normalizeCode('İSG 4001')).toBe('İSG 4001')
    })
})

describe('toGrade / toStatus', () => {
    it('harf notlarini dogrudan gecirir', () => {
        expect(toGrade('AA')).toBe('AA')
        expect(toGrade('CB')).toBe('CB')
        expect(toGrade('B')).toBe('B')
    })

    it('"-" notunu alinmadi olarak isaretler', () => {
        expect(toGrade('-')).toBe('NA')
        expect(toStatus('Almadı', 'NA')).toBe('ALMADIM')
    })

    it('taninmayan notu null dondurur (sessizce yutmaz)', () => {
        expect(toGrade('XYZ')).toBeNull()
    })

    it('devam eden dersi ALINIYOR yapar', () => {
        expect(toStatus('Devam Ediyor', 'NA')).toBe('ALINIYOR')
        expect(toStatus('Alıyor', 'NA')).toBe('ALINIYOR')
    })

    it('"Devamsiz" ile "Devam ediyor"u karistirmaz', () => {
        // Ikisi de "devam" ile basliyor ama anlamlari zit.
        expect(toStatus('Devamsız', 'D')).toBe('ALDIM')
        expect(toStatus('Devam', 'NA')).toBe('ALINIYOR')
    })

    it('gecilen ve kalinan dersi ALDIM yapar', () => {
        expect(toStatus('Geçti', 'AA')).toBe('ALDIM')
        expect(toStatus('Kaldı', 'FF')).toBe('ALDIM')
        expect(toStatus('Muaf', 'M')).toBe('ALDIM')
    })

    it('nota eklenmis isaretleri temizler', () => {
        expect(toGrade('AA*')).toBe('AA')
        expect(toGrade(' BB ')).toBe('BB')
    })
})

describe('buildImportPlan (gercek transkript + gercek katalog)', () => {
    it('44 dersin tamami katalogda bulunur', () => {
        expect(rows).toHaveLength(44)
        expect(plan.matched).toHaveLength(44)
        expect(plan.unmatched).toHaveLength(0)
    })

    it('38 zorunlu / 6 secmeli havuzu ayrimini dogru yapar', () => {
        const fromPool = plan.matched.filter((m) => m.fromPool)
        expect(fromPool).toHaveLength(6)
        expect(plan.matched.length - fromPool.length).toBe(38)
    })

    it('uyari uretmez', () => {
        expect(plan.warnings).toEqual([])
    })

    it('notlari dogru tasir', () => {
        const entry = plan.matched.find((m) => m.course.code === 'CME 1203')!
        expect(entry.grade).toBe('CB')
        expect(entry.status).toBe('ALDIM')
    })

    it('alinmamis dersleri NA/ALMADIM birakir', () => {
        const notTaken = plan.matched.filter((m) => m.grade === 'NA')
        expect(notTaken).toHaveLength(4)
        expect(notTaken.every((m) => m.status === 'ALMADIM')).toBe(true)
    })
})

describe('summarize (katalog kredisiyle beklenen sonuc)', () => {
    it('transkriptin kendi GANO ve AKTS degerini uretir', () => {
        // Transkriptin kumulatif satiri: kredi 114.5, puan 391.75, GANO 3.42, AKTS 184
        const result = summarize(plan, GRADE_POINTS)
        expect(result.credits).toBe(114.5)
        expect(result.points).toBe(391.75)
        expect(result.gpa).toBe(3.42)
        expect(result.ects).toBe(184)
    })
})
