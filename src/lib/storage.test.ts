/**
 * Kalicilik semasi testleri.
 *
 * v2'ye gecerken ders kopyalari diskten cikarildi. Bu testler iki seyi korur:
 *  - eski (v1) kayitlardaki notlar kaybolmaz
 *  - yedek dosyasi katalog yeniden uretilse de gecerli kalir
 */

import { describe, expect, it } from 'vitest'
import { migrateV1, parseImported } from './storage'

const v1State = {
    activeProgramId: '1210',
    programs: [
        {
            id: '1210',
            courses: [
                { id: '1210:CME 1203', grade: 'CB' as const, status: 'ALDIM' as const },
                { id: '1210:KPD 1001', grade: 'B' as const, status: 'ALDIM' as const },
                // Dokunulmamis ders: diske yazilmasina gerek yok.
                { id: '1210:CME 1206', grade: 'NA' as const, status: 'ALMADIM' as const },
                { id: '1210:CME 2401', grade: 'AA' as const, status: 'ALDIM' as const, added: true },
            ],
        },
    ],
}

describe('migrateV1', () => {
    it('notlari ders idsine gore tasir', () => {
        const state = migrateV1(v1State)
        expect(state.activeProgramId).toBe('1210')
        expect(state.progress['1210']['1210:CME 1203']).toEqual({
            grade: 'CB',
            status: 'ALDIM',
        })
        expect(state.progress['1210']['1210:KPD 1001'].grade).toBe('B')
    })

    it('secilmis secmelinin added bayragini korur', () => {
        const state = migrateV1(v1State)
        expect(state.progress['1210']['1210:CME 2401'].added).toBe(true)
    })

    it('dokunulmamis dersleri yazmaz', () => {
        const state = migrateV1(v1State)
        expect(state.progress['1210']['1210:CME 1206']).toBeUndefined()
        expect(Object.keys(state.progress['1210'])).toHaveLength(3)
    })

    it('bos program listesini bozulmadan gecer', () => {
        expect(migrateV1({ activeProgramId: null, programs: [] })).toEqual({
            activeProgramId: null,
            progress: {},
        })
    })
})

describe('parseImported', () => {
    it('v1 yedegini v2 olarak okur', () => {
        const raw = JSON.stringify({ schemaVersion: 1, savedAt: '', state: v1State })
        const state = parseImported(raw)
        expect(state.progress['1210']['1210:CME 1203'].grade).toBe('CB')
    })

    it('v2 yedegini oldugu gibi okur', () => {
        const raw = JSON.stringify({
            schemaVersion: 2,
            savedAt: '',
            state: {
                activeProgramId: '1210',
                progress: { '1210': { '1210:CME 1203': { grade: 'AA', status: 'ALDIM' } } },
            },
        })
        expect(parseImported(raw).progress['1210']['1210:CME 1203'].grade).toBe('AA')
    })

    it('bozuk JSON icin anlasilir hata verir', () => {
        expect(() => parseImported('{bozuk')).toThrow('gecerli bir JSON degil')
    })

    it('bilinmeyen surum icin anlasilir hata verir', () => {
        const raw = JSON.stringify({ schemaVersion: 99, state: {} })
        expect(() => parseImported(raw)).toThrow('surumu 99')
    })
})
