/**
 * Transkript ayristirici testleri.
 *
 * Fixture gercek bir DEU transkriptinden uretildi, ust bilgideki kisisel
 * alanlar (TCKN, ogrenci no, ad soyad, YOKSIS ID) maskelendi.
 * Uretici: tools/make-transcript-fixture.py
 *
 * Beklenen degerler transkriptin KENDI "Kumulatif Ortalamasi" satirindan
 * okundu, hesaplanmadi.
 */

import { describe, expect, it } from 'vitest'
import { GRADE_POINTS } from './grades'
import {
    isContentWord,
    parseTranscript,
    verifyAgainstTotals,
    type TranscriptPage,
} from './transcript'
import fixture from './__fixtures__/transcript-words.json'

const pages = fixture as TranscriptPage[]
const parsed = parseTranscript(pages)

describe('filigran filtresi', () => {
    it('capraz filigran parcalarini eler', () => {
        // Olculen: filigran yuksekligi 16-22pt, normal metin 6.14pt.
        expect(isContentWord({ x: 455.2, y: 127.7, w: 31.7, h: 18.9, text: 'IM' })).toBe(false)
        expect(isContentWord({ x: 422.1, y: 158.0, w: 37.3, h: 21.8, text: 'TA' })).toBe(false)
        // Alcak ama asiri genis (donuk tek harf)
        expect(isContentWord({ x: 343.5, y: 253.6, w: 26.9, h: 4.7, text: 'İ' })).toBe(false)
        // Normal ders metni korunur
        expect(isContentWord({ x: 2.8, y: 157, w: 17.5, h: 6.14, text: 'CME' })).toBe(true)
    })

    it('filigran token\'lari hicbir hucreye sizmaz', () => {
        // JS'de \b Turkce harflerle calismaz ("SİSTEMLER" icindeki "Sİ" hecesine
        // takilir), bu yuzden hucreleri kelimelere bolup tam esitlik ariyoruz.
        const tokens = parsed.rows.flatMap((r) =>
            [r.code, r.name, r.grade, r.status].join(' ').split(/\s+/),
        )
        for (const junk of ['IM', 'TA', 'Sİ', 'ŞI', 'MAZ']) {
            expect(tokens).not.toContain(junk)
        }
    })
})

describe('parseTranscript', () => {
    it('44 ders satiri ayiklar', () => {
        expect(parsed.rows).toHaveLength(44)
    })

    it('uyari uretmez', () => {
        expect(parsed.warnings).toEqual([])
    })

    it('program adini ust bilgiden okur', () => {
        expect(parsed.program).toContain('Bilgisayar Mühendisliği')
    })

    it('iki sutunlu duzeni dogru cozer', () => {
        // Sol blok 1. yariyil (7 ders), sag blok 2. yariyil (6 ders).
        // Duz metin okunsaydi bunlar birbirine karisirdi.
        const term1 = parsed.rows.filter((r) => r.term === 1)
        const term2 = parsed.rows.filter((r) => r.term === 2)
        expect(term1).toHaveLength(7)
        expect(term2).toHaveLength(6)
        expect(term1.map((r) => r.code)).toContain('CME 1203')
        expect(term2.map((r) => r.code)).toContain('CME 1206')
        // 1. yariyil dersi 2. yariyila kacmamali
        expect(term2.map((r) => r.code)).not.toContain('CME 1203')
    })

    it('ilk dersin tum alanlarini dogru okur', () => {
        const row = parsed.rows.find((r) => r.code === 'CME 1203')!
        expect(row.name).toBe('BİLGİSAYAR MÜHENDİSLİĞİNE GİRİŞ')
        expect(row.t).toBe(2)
        expect(row.u).toBe(2)
        expect(row.ects).toBe(4)
        expect(row.credit).toBe(3)
        expect(row.grade).toBe('CB')
        expect(row.status).toBe('Geçti')
        expect(row.term).toBe(1)
    })

    it('ortalamaya girmeyen B notunu korur', () => {
        const row = parsed.rows.find((r) => r.code === 'KPD 1001')!
        expect(row.grade).toBe('B')
        expect(row.credit).toBe(1)
    })

    it('henuz alinmamis dersleri "-" olarak isaretler', () => {
        const notTaken = parsed.rows.filter((r) => r.grade === '-')
        expect(notTaken).toHaveLength(4)
        expect(notTaken.every((r) => r.status === 'Almadı')).toBe(true)
        // AKTS toplami 20: bizim 204 ile transkriptin 184'u arasindaki fark.
        expect(notTaken.reduce((s, r) => s + r.ects, 0)).toBe(20)
    })

    it('tekrar sayisini (TS) okur', () => {
        expect(parsed.rows.filter((r) => r.repeat === 2)).toHaveLength(1)
    })

    it('tum yariyillari kapsar', () => {
        const terms = [...new Set(parsed.rows.map((r) => r.term))].sort(
            (a, b) => (a ?? 0) - (b ?? 0),
        )
        expect(terms).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    })
})

describe('verifyAgainstTotals (kendini dogrulama)', () => {
    it('transkriptin kendi kumulatif satirini birebir uretir', () => {
        // Transkriptin son "Kumulatif Ortalamasi" satiri: 184 / 114.5 / 391.75 / 3.42
        expect(parsed.totals).toEqual({
            ects: 184,
            credits: 114.5,
            points: 391.75,
            gpa: 3.42,
        })

        const check = verifyAgainstTotals(parsed.rows, parsed.totals, GRADE_POINTS)!
        expect(check.credits).toBe(114.5)
        expect(check.points).toBe(391.75)
        expect(check.gpa).toBe(3.42)
        expect(check.ok).toBe(true)
    })
})

describe('gizlilik', () => {
    it('fixture kimlik verisi icermez', () => {
        const blob = JSON.stringify(pages)
        // TCKN / ogrenci no / YOKSIS ID gibi uzun sayi dizileri
        expect(blob).not.toMatch(/\b\d{5,}\b/)
    })
})
