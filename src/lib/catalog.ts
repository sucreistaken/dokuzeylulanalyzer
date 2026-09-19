/**
 * Katalog verisi yukleyici.
 *
 * 655 program tek dosyada ~3 MB tutuyor ve import edilirse bundle'a giriyor.
 * Bu yuzden index acilisita, program mufredati ise secildiginde fetch edilir.
 */

import type { CatalogIndex, ProgramData } from '../types'

const cache = new Map<string, ProgramData>()
let indexPromise: Promise<CatalogIndex> | null = null

export function loadIndex(): Promise<CatalogIndex> {
    if (!indexPromise) {
        indexPromise = fetch(`${import.meta.env.BASE_URL}data/index.json`)
            .then((res) => {
                if (!res.ok) throw new Error(`Katalog listesi alinamadi (${res.status})`)
                return res.json() as Promise<CatalogIndex>
            })
            .catch((err) => {
                // Basarisiz promise cache'te kalirsa tekrar denenemez.
                indexPromise = null
                throw err
            })
    }
    return indexPromise
}

export async function loadProgram(programId: string): Promise<ProgramData> {
    const cached = cache.get(programId)
    if (cached) return cached

    const res = await fetch(
        `${import.meta.env.BASE_URL}data/programs/${programId}.json`,
    )
    if (!res.ok) throw new Error(`Program mufredati alinamadi (${res.status})`)

    const data = (await res.json()) as ProgramData
    cache.set(programId, data)
    return data
}
