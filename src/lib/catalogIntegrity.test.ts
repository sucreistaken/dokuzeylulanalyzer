/**
 * KATALOG BUTUNLUGU: uygulama 647 programin hepsinde ayni varsayimlara dayanir.
 *
 * Bu testler tek bir bolumu degil, public/data altindaki TUM katalogu tarar.
 * Amac: katalog yenilendiginde (yeni akademik yil scrape edildiginde) uygulamayi
 * sessizce bozacak veri degisikliklerini derhal yakalamak. Ornegin kredi
 * form.lu degisirse GANO tum programlarda yanlis cikardi.
 *
 * Testler public/data'yi okur; scraper ciktisi degisince burasi kirmizi yanar.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { bestProgramMatch } from './programMatch'
import { localCredit } from './grades'
import { normalizeCode } from './transcriptImport'
import type { CatalogIndex, ProgramData } from '../types'

const index = JSON.parse(
    readFileSync('public/data/index.json', 'utf-8'),
) as CatalogIndex

const programFiles = readdirSync('public/data/programs').filter((f) =>
    f.endsWith('.json'),
)

const loadProgram = (file: string): ProgramData =>
    JSON.parse(readFileSync(`public/data/programs/${file}`, 'utf-8'))

const allPrograms = programFiles.map(loadProgram)
const lisans = index.programs.filter((p) => p.level === 'lisans')

/**
 * Katalogda ayni ada sahip birden fazla program var (ayni bolum iki
 * fakultede/kampuste). Ad tek basina ayirt edemez; kullanici listeden secer.
 */
const duplicateNames = new Set(
    index.programs
        .map((p) => p.name)
        .filter((name, i, list) => list.indexOf(name) !== i),
)

describe('katalog dosyalari', () => {
    it('index ile program dosyalari ortusur', () => {
        expect(programFiles.length).toBeGreaterThan(600)
        const ids = new Set(programFiles.map((f) => f.replace('.json', '')))
        for (const p of index.programs) expect(ids.has(p.id)).toBe(true)
    })

    it('her programin dersi var', () => {
        for (const p of allPrograms) expect(p.courses.length).toBeGreaterThan(0)
    })
})

describe('GANO tabani: yerel kredi', () => {
    it('her derste kredi = T + (U + L) / 2 (yonetmelik MADDE 33)', () => {
        const bad: string[] = []
        for (const program of allPrograms) {
            for (const c of program.courses) {
                if (Math.abs(localCredit(c.t, c.u, c.l) - c.credit) > 0.001) {
                    bad.push(`${program.name} | ${c.code}`)
                }
            }
        }
        expect(bad).toEqual([])
    })

    it('lisans programlarinin toplam AKTS hedefi dolu', () => {
        for (const meta of lisans) {
            const data = allPrograms.find((p) => p.id === meta.id) as ProgramData
            expect(data.totalEcts, meta.name).toBeGreaterThan(0)
            expect(data.terms.length, meta.name).toBeGreaterThan(0)
        }
    })
})

describe('ders kodu bicimi', () => {
    // Transkriptten gelen kod ile katalog kodu ayni normalizasyondan gecer;
    // gecmezse ders "eslesmeyen" kovasina duser ve mufredata ikinci kez eklenir.
    it('katalog kodlari normalize edilmis haliyle ayni kalir', () => {
        const bad: string[] = []
        for (const program of allPrograms) {
            for (const c of program.courses) {
                if (normalizeCode(c.code) !== c.code) bad.push(`${program.name} | ${c.code}`)
            }
        }
        // "0PR 6037" katalogda rakamla baslayan tek kod (DEU tarafinda yazim
        // hatasi, Opera Sanat Dali doktora). Lisansta ornegi yok.
        expect(bad).toHaveLength(1)
        expect(bad[0]).toContain('0PR 6037')
    })

    it('lisans programlarinda bozuk kod yok', () => {
        const bad: string[] = []
        for (const meta of lisans) {
            const data = allPrograms.find((p) => p.id === meta.id) as ProgramData
            for (const c of data.courses) {
                if (normalizeCode(c.code) !== c.code) bad.push(`${meta.name} | ${c.code}`)
            }
        }
        expect(bad).toEqual([])
    })
})

describe('program adi eslestirme (transkriptten program bulma)', () => {
    it('her program kendi adiyla kendini bulur', () => {
        const bad: string[] = []
        for (const program of index.programs) {
            const match = bestProgramMatch(program.name, index.programs)
            if (match?.program.name !== program.name) {
                bad.push(`${program.name} -> ${match?.program.name ?? 'eslesme yok'}`)
            }
        }
        expect(bad).toEqual([])
    })

    it('yalnizca adi birebir ayni olan programlar birbirine karisir', () => {
        const bad: string[] = []
        for (const program of index.programs) {
            const match = bestProgramMatch(program.name, index.programs)
            if (match?.program.id !== program.id && !duplicateNames.has(program.name)) {
                bad.push(`${program.id} ${program.name} -> ${match?.program.id}`)
            }
        }
        expect(bad).toEqual([])
    })

    it('muhendislik bolum adlari kendi lisans programina gider', () => {
        // e-Devlet belgesi "Jeofizik Muhendisligi Pr." yazar; ayristirici "Pr."yi
        // atar. Katalogdaki resmi ad farkli yazilabilir ("Makina", "Elektrik -
        // Elektronik ... (Ingilizce)"), bu yuzden ad birebir degil; ANAHTAR
        // KELIME + fakulte + seviye dogrulanir.
        const departments = [
            'Jeofizik', 'İnşaat', 'Makine', 'Makina', 'Elektrik', 'Endüstri',
            'Bilgisayar', 'Çevre', 'Jeoloji', 'Metalurji', 'Maden', 'Tekstil',
        ]
        for (const keyword of departments) {
            const match = bestProgramMatch(`${keyword} Mühendisliği`, index.programs)
            expect(match, keyword).not.toBeNull()
            expect(match?.program.level, keyword).toBe('lisans')
            expect(match?.program.faculty, keyword).toBe('Mühendislik Fakültesi')
        }
    })

    it('yazim farki olan ad, kisa adli baska programa kaymaz', () => {
        // "Makine Muhendisligi" -> Izmir MYO'nun "Makine" onlisans programi
        // kazaniyordu; tek harflik "Makina/Makine" farki yuzunden.
        const makine = bestProgramMatch('Makine Mühendisliği', index.programs)
        expect(makine?.program.name).toBe('Makina Mühendisliği')
        expect(makine?.program.id).toBe('1202')
    })

    it('ikinci ogretim, birinci ogretimin onune gecmez', () => {
        // "(I.O)" fazladan kelime tasir; sade ad sade programa gitmeli.
        const match = bestProgramMatch('Makina Mühendisliği', index.programs)
        expect(match?.program.name).toBe('Makina Mühendisliği')
    })
})
