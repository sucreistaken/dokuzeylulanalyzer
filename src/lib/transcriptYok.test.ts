/**
 * YÖK / e-Devlet "Not Döküm Belgesi" ayristirici testleri.
 *
 * Fixture gercek bir e-Devlet transkriptinden uretildi; kimlik alanlari
 * (TCKN, ogrenci no, ad soyad, dogum tarihi, YÖK barkodu) maskelendi.
 * Uretici: tools/make-edevlet-fixture.py
 *
 * Beklenen degerler transkriptin KENDI "GNO" (Genel Not Ortalamasi) satirindan
 * okundu, hesaplanmadi.
 */

import { describe, expect, it } from 'vitest'
import { GRADE_POINTS } from './grades'
import {
    isYokTranscript,
    parseYokTranscript,
    parseTranscriptAuto,
    verifyAgainstTotals,
    type TranscriptPage,
} from './transcript'
import { buildImportPlan, summarize } from './transcriptImport'
import fixture from './__fixtures__/edevlet-words.json'

const pages = fixture as TranscriptPage[]
const parsed = parseYokTranscript(pages)

describe('isYokTranscript', () => {
    it('e-Devlet belgesini taniyor', () => {
        expect(isYokTranscript(pages)).toBe(true)
    })
})

describe('parseYokTranscript', () => {
    it('program adini ust bilgiden okur', () => {
        expect(parsed.program).toBe('Bilgisayar Mühendisliği')
    })

    it('ders satirlarini ayiklar', () => {
        expect(parsed.rows.length).toBeGreaterThan(40)
    })

    it('uyari uretmez', () => {
        expect(parsed.warnings).toEqual([])
    })

    it('iki dilli addan yalnizca Turkce adi alir', () => {
        const eng = parsed.rows.find((r) => r.code === 'ENG 101')
        expect(eng?.name).toBe('İngilizce de Akademik Beceriler I')
    })

    it('yerel krediyi (UK) ve AKTS\'yi ayri okur', () => {
        // MATH 153: T2 U2 UK3 AKTS6
        const math = parsed.rows.find((r) => r.code === 'MATH 153')
        expect(math?.credit).toBe(3)
        expect(math?.ects).toBe(6)
    })

    it('tekrar edilen dersi en guncel donemdeki notla tekiller', () => {
        const codes = parsed.rows.map((r) => r.code)
        // Ayni kod birden fazla gelmemeli.
        expect(codes.length).toBe(new Set(codes).size)
        // CE 315 once FF (kaldi), sonra DD ile gecildi; guncel DD kalmali.
        const ce315 = parsed.rows.filter((r) => r.code === 'CE 315')
        expect(ce315).toHaveLength(1)
        expect(ce315[0].grade).toBe('DD')
    })

    it('hesap transkriptin GNO satiriyla tutar', () => {
        expect(parsed.totals?.gpa).toBeCloseTo(2.32, 2)
        const check = verifyAgainstTotals(parsed.rows, parsed.totals, GRADE_POINTS)
        expect(check?.ok).toBe(true)
    })
})

describe('parseTranscriptAuto', () => {
    it('e-Devlet belgesini YÖK ayristiricisina yonlendirir', () => {
        const auto = parseTranscriptAuto(pages)
        expect(auto.program).toBe('Bilgisayar Mühendisliği')
        expect(auto.rows.length).toBe(parsed.rows.length)
    })
})

describe('summarize eslesmeyenleri sayar (baska universite senaryosu)', () => {
    // DEU katalogunda olmayan bir programa (bos katalog) karsi: tum dersler
    // eslesmez. Ekleme secili ise onizleme yine dogru GANO'yu gostermeli.
    const plan = buildImportPlan(parsed.rows, [])

    it('eslesmeyenler haric tutulunca GANO 0', () => {
        expect(summarize(plan, GRADE_POINTS, false).gpa).toBe(0)
    })

    it('eslesmeyenler dahil edilince transkriptin GANO degeri cikar', () => {
        // Onizleme GANO'su transkriptin resmi GNO'su ile tutmali (2.32).
        const result = summarize(plan, GRADE_POINTS, true)
        expect(result.gpa).toBeCloseTo(2.32, 2)
        // summarize.ects notu olan tum dersleri sayar (basarisizlar dahil);
        // "kazanilan" AKTS'den (calculateStats) fazladir, en az onun kadardir.
        expect(result.ects).toBeGreaterThanOrEqual(232)
    })
})
