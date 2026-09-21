/**
 * YÖK / e-Devlet transkripti: DEVAM EDEN donem senaryosu.
 *
 * Fixture gercek bir transkriptten uretildi (kimlik alanlari maskeli,
 * uretici: tools/make-edevlet-fixture.py). Onceki fixture'da olmayan uc durum
 * var ve ucu de yanlis okunuyordu:
 *
 *  1. Ogrenci basarisiz dersi TEKRAR ALIYOR ama notu henuz girilmemis. Belge
 *     iki satir gosterir: eski FF + notsuz yeni kayit.
 *  2. "Yaz Okulu" basligi "... Donemi" ile bitmiyor.
 *  3. "D" (Devamsiz) notu var; yonetmelige gore FF islemi gorur.
 *
 * Beklenen degerler transkriptin KENDI ust bilgisinden okundu, hesaplanmadi:
 *   Genel Not Ortalamasi (GNO) = 1.41, Basarilan Kredi = 55.5
 */

import { describe, expect, it } from 'vitest'
import { GRADE_POINTS } from './grades'
import {
    parseYokTranscript,
    verifyAgainstTotals,
    type TranscriptPage,
} from './transcript'
import { buildImportPlan } from './transcriptImport'
import fixture from './__fixtures__/edevlet-aktif-donem-words.json'

const pages = fixture as TranscriptPage[]
const parsed = parseYokTranscript(pages)
const row = (code: string) => parsed.rows.find((r) => r.code === code)

describe('devam eden donem', () => {
    it('notu girilmemis tekrar, eski notu silmez', () => {
        // FİZ 1103: 2024-2025 Guz FF, 2025-2026 Guz FF, yaz okulunda notsuz tekrar.
        expect(row('FİZ 1103')?.grade).toBe('FF')
    })

    it('gecilmis dersin notu, devam eden tekrarina ragmen korunur', () => {
        // YDİ 1007: 2024-2025 Guz DC; 2026-2027 Guz'de yeniden aliniyor (notsuz).
        expect(row('YDİ 1007')?.grade).toBe('DC')
    })

    it('ilk kez alinan notsuz dersi listeler', () => {
        // FİZ 1105 yalnizca 2026-2027 Guz'de var ve notu yok.
        expect(row('FİZ 1105')?.grade).toBe('-')
    })

    it('yaz okulunu ayri donem sayar', () => {
        // Belgedeki donem bloklari: 2024-25 Guz(1)/Bahar(2), 2025-26 Guz(3)/
        // Bahar(4), yaz okulu(5), 2026-27 Guz(6). Yaz okulu sayilmazsa son
        // donem 5 cikar ve dersler bir onceki yariyila kayardi.
        expect(row('FİZ 1105')?.term).toBe(6)
    })
})

describe('hesap transkriptle tutar', () => {
    it('GNO belgenin kendi degerini verir', () => {
        expect(parsed.totals?.gpa).toBeCloseTo(1.41, 2)
    })

    it('ortalamaya giren kredi belgedeki Basarilan Kredi ile ayni', () => {
        expect(parsed.totals?.credits).toBeCloseTo(55.5, 2)
    })

    it('kendi kendini dogrulama gecer', () => {
        const check = verifyAgainstTotals(parsed.rows, parsed.totals, GRADE_POINTS)
        expect(check?.ok).toBe(true)
        expect(check?.gpa).toBeCloseTo(1.41, 2)
    })
})

describe('ice aktarim', () => {
    const plan = buildImportPlan(parsed.rows, [])

    it('devam eden dersi "aliniyor" isaretler', () => {
        const fiz1105 = plan.unmatched.find((u) => u.row.code === 'FİZ 1105')
        expect(fiz1105?.status).toBe('ALINIYOR')
    })

    it('tekrar alinan dersi de "aliniyor" isaretler, notunu korur', () => {
        const fiz1103 = plan.unmatched.find((u) => u.row.code === 'FİZ 1103')
        expect(fiz1103?.status).toBe('ALINIYOR')
        expect(fiz1103?.grade).toBe('FF')
    })

    it('bitmis dersi "aldim" birakir', () => {
        const kim = plan.unmatched.find((u) => u.row.code === 'KİM 1115')
        expect(kim?.status).toBe('ALDIM')
    })
})
