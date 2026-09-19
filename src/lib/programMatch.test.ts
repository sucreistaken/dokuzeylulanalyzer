import { describe, expect, it } from 'vitest'
import { bestProgramMatch, matchPrograms, nameTokens } from './programMatch'
import type { ProgramMeta } from '../types'

const meta = (id: string, name: string, over: Partial<ProgramMeta> = {}): ProgramMeta => ({
    id,
    name,
    faculty: 'Muhendislik Fakultesi',
    department: 'Bilgisayar Muhendisligi',
    level: 'lisans',
    levelLabel: 'Lisans',
    courseCount: 100,
    ...over,
})

// Gercek katalogdaki gibi: duz "Bilgisayar Muhendisligi" yok, ekli varyantlari var.
const programs: ProgramMeta[] = [
    meta('1', 'Bilgisayar Muhendisligi (Ingilizce)'),
    meta('2', 'Bilgisayar Muhendisligi Doktora (Ingilizce)'),
    meta('3', 'Bilgisayar Muhendisligi Yuksek Lisans (Ingilizce)'),
    meta('4', 'Elektrik Elektronik Muhendisligi'),
    meta('5', 'Endustri Muhendisligi'),
]

describe('nameTokens', () => {
    it('kucuk harfe indirir, parantez ve baglaci atar', () => {
        // Katalogdaki gibi noktali "İ": tr locale'de "ingilizce"ye iner.
        expect(nameTokens('Bilgisayar ve Muhendislik (İngilizce)')).toEqual([
            'bilgisayar',
            'muhendislik',
            'ingilizce',
        ])
    })
})

describe('matchPrograms', () => {
    it('transkriptteki yalin adi en yakin katalog adiyla eslestirir', () => {
        const [top] = matchPrograms('Bilgisayar Muhendisligi', programs)
        // Fazla kelime (Doktora / Yuksek Lisans) ceza aldigi icin yalin varyant kazanir.
        expect(top.program.id).toBe('1')
    })

    it('hicbir kelime tutmazsa aday donmez', () => {
        expect(matchPrograms('Tip', programs)).toEqual([])
    })

    it('bos ada bos liste doner', () => {
        expect(matchPrograms('', programs)).toEqual([])
    })

    it('sonuclari puana gore siralar ve limitler', () => {
        const result = matchPrograms('Bilgisayar Muhendisligi', programs, 2)
        expect(result).toHaveLength(2)
        expect(result[0].score).toBeGreaterThanOrEqual(result[1].score)
    })
})

describe('bestProgramMatch', () => {
    it('null ada null doner', () => {
        expect(bestProgramMatch(null, programs)).toBeNull()
    })

    it('en iyi tek eslesmeyi doner', () => {
        expect(bestProgramMatch('Endustri Muhendisligi', programs)?.program.id).toBe('5')
    })
})
