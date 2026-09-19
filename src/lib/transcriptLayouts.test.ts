/**
 * Farkli transkript duzenleri icin dayaniklilik testleri.
 *
 * ONEMLI: Buradaki veriler SENTETIKTIR. Elimizde yalnizca bir gercek transkript
 * var (Bilgisayar Muhendisligi, yariyil bazli, iki sutunlu). Bu testler baska
 * bolumlerin gercek dosyalarini temsil ETMEZ; parser'in sabit koordinatlara
 * degil, belgenin KENDI baslik satirina dayandigini kanitlar.
 *
 * Gercek dosya dogrulamasi transcript.test.ts icindedir.
 */

import { describe, expect, it } from 'vitest'
import { parseTranscript, readLayout, type TranscriptPage, type TranscriptWord } from './transcript'

const LINE_HEIGHT = 6.1

/** Bir metin satirini kelime-koordinat dizisine cevirir. */
function row(y: number, items: Array<[x: number, text: string]>): TranscriptWord[] {
    return items.map(([x, text]) => ({
        x,
        y,
        w: text.length * 4,
        h: LINE_HEIGHT,
        text,
    }))
}

/** Sutun basligi satiri uretir. */
function headerRow(y: number, originX: number): TranscriptWord[] {
    return row(y, [
        [originX + 0, 'KODU'],
        [originX + 37, 'DERS'],
        [originX + 57, 'ADI'],
        [originX + 171, 'T'],
        [originX + 182, 'U'],
        [originX + 193, 'AKTS'],
        [originX + 208, 'TK'],
        [originX + 220, 'TS'],
        [originX + 235, 'Notu'],
        [originX + 258, 'Durumu'],
    ])
}

/** Ders satiri uretir. */
function courseRow(
    y: number,
    originX: number,
    [code, name, t, u, ects, tk, ts, grade, status]: [
        string, string, string, string, string, string, string, string, string,
    ],
): TranscriptWord[] {
    return row(y, [
        [originX + 0, code.split(' ')[0]],
        [originX + 14, code.split(' ')[1]],
        [originX + 37, name],
        [originX + 172, t],
        [originX + 183, u],
        [originX + 197, ects],
        [originX + 211, tk],
        [originX + 223, ts],
        [originX + 239, grade],
        [originX + 259, status],
    ])
}

const page = (words: TranscriptWord[], width = 595.28): TranscriptPage => ({
    width,
    height: 841.89,
    words,
})

describe('readLayout (duzeni belgenin kendisinden ogrenme)', () => {
    it('iki sutunlu duzende iki blok bulur', () => {
        const layouts = readLayout([...headerRow(144, 3), ...headerRow(144, 300)], 595.28)
        expect(layouts).toHaveLength(2)
        expect(layouts[0].map((c) => c.key)).toEqual([
            'code', 'name', 't', 'u', 'ects', 'credit', 'repeat', 'grade', 'status',
        ])
    })

    it('tek sutunlu duzende tek blok bulur', () => {
        const layouts = readLayout(headerRow(144, 3), 595.28)
        expect(layouts).toHaveLength(1)
    })

    it('ders tablosu olmayan satiri baslik sanmaz', () => {
        expect(readLayout(row(200, [[10, 'Yarıyıl'], [60, 'Ortalaması'], [120, '3.25']]), 595.28))
            .toEqual([])
    })
})

describe('farkli sablonlar', () => {
    it('TEK SUTUNLU transkripti okur', () => {
        const parsed = parseTranscript([
            page([
                ...row(130, [[115, 'BİRİNCİ'], [147, 'YARIYIL']]),
                ...headerRow(144, 3),
                ...courseRow(157, 3, ['TIP 1001', 'ANATOMİ', '3', '2', '6', '4', '1', 'AA', 'Geçti']),
                ...courseRow(170, 3, ['TIP 1002', 'FİZYOLOJİ', '2', '0', '4', '2', '1', 'BA', 'Geçti']),
            ]),
        ])
        expect(parsed.rows).toHaveLength(2)
        expect(parsed.rows[0].code).toBe('TIP 1001')
        expect(parsed.rows[0].credit).toBe(4)
        expect(parsed.rows.every((r) => r.term === 1)).toBe(true)
    })

    it('YIL bazli baslikli transkripti okur (Tip / Hukuk sablonu)', () => {
        const parsed = parseTranscript([
            page([
                ...row(130, [[115, 'BİRİNCİ'], [147, 'YIL']]),
                ...headerRow(144, 3),
                ...courseRow(157, 3, ['HUK 1001', 'MEDENİ HUKUK', '4', '0', '8', '4', '1', 'CB', 'Geçti']),
            ]),
        ])
        expect(parsed.rows[0].term).toBe(1)
    })

    it('rakamli yariyil basligini okur ("3. YARIYIL")', () => {
        const parsed = parseTranscript([
            page([
                ...row(130, [[115, '3.'], [130, 'YARIYIL']]),
                ...headerRow(144, 3),
                ...courseRow(157, 3, ['ABC 2001', 'DERS', '3', '0', '5', '3', '1', 'BB', 'Geçti']),
            ]),
        ])
        expect(parsed.rows[0].term).toBe(3)
    })

    it('SUTUNLARI KAYMIS sablonu okur (farkli fakulte duzeni)', () => {
        // Tum sutunlar 25pt saga kaymis, blok genisligi farkli.
        const parsed = parseTranscript([
            page([
                ...row(130, [[140, 'İKİNCİ'], [172, 'YARIYIL']]),
                ...headerRow(144, 28),
                ...courseRow(157, 28, ['XYZ 1002', 'DERS ADI', '2', '2', '5', '3', '1', 'AA', 'Geçti']),
            ]),
        ])
        expect(parsed.rows).toHaveLength(1)
        expect(parsed.rows[0].code).toBe('XYZ 1002')
        expect(parsed.rows[0].ects).toBe(5)
        expect(parsed.rows[0].grade).toBe('AA')
        expect(parsed.rows[0].term).toBe(2)
    })

    it('FARKLI KAGIT BOYUTUNDA calisir (genis sayfa)', () => {
        const parsed = parseTranscript([
            page(
                [
                    ...row(130, [[200, 'BİRİNCİ'], [240, 'YARIYIL']]),
                    ...headerRow(144, 10),
                    ...courseRow(157, 10, ['GEN 1001', 'DERS', '3', '0', '5', '3', '1', 'CC', 'Geçti']),
                ],
                842, // A4 yatay
            ),
        ])
        expect(parsed.rows).toHaveLength(1)
        expect(parsed.rows[0].grade).toBe('CC')
    })

    it('sutun basligi olmayan dosyada anlasilir uyari verir', () => {
        const parsed = parseTranscript([
            page(row(200, [[10, 'Bu'], [30, 'bir'], [50, 'transkript'], [110, 'degil']])),
        ])
        expect(parsed.rows).toHaveLength(0)
        expect(parsed.warnings[0]).toContain('bulunamadi')
    })

    it('bos sayfayi cokmeden gecer', () => {
        expect(() => parseTranscript([page([])])).not.toThrow()
    })
})

describe('iki sutunlu duzende yariyil ayrimi', () => {
    it('sol ve sag bloklarin yariyillari karismaz', () => {
        const parsed = parseTranscript([
            page([
                // Iki yariyil basligi yan yana
                ...row(130, [[115, 'BİRİNCİ'], [147, 'YARIYIL'], [416, 'İKİNCİ'], [442, 'YARIYIL']]),
                ...headerRow(144, 3),
                ...headerRow(144, 300),
                ...courseRow(157, 3, ['AAA 1001', 'SOL DERS', '2', '0', '4', '2', '1', 'AA', 'Geçti']),
                ...courseRow(157, 300, ['BBB 1002', 'SAG DERS', '3', '0', '5', '3', '1', 'BB', 'Geçti']),
            ]),
        ])
        expect(parsed.rows).toHaveLength(2)
        const sol = parsed.rows.find((r) => r.code === 'AAA 1001')!
        const sag = parsed.rows.find((r) => r.code === 'BBB 1002')!
        expect(sol.term).toBe(1)
        expect(sag.term).toBe(2)
        expect(sol.grade).toBe('AA')
        expect(sag.grade).toBe('BB')
    })
})
