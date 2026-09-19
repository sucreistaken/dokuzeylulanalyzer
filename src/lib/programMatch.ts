/**
 * Transkriptteki program adini katalog programlariyla eslestirir.
 *
 * Saf fonksiyon: yalnizca metin karsilastirir, DOM/fetch bilmez; boylece
 * dogrudan test edilebilir. Transkript basligindaki ad ("Bilgisayar
 * Muhendisligi") katalogdaki resmi adla ("Bilgisayar Muhendisligi (Ingilizce)")
 * birebir ortusmeyebilir; bu yuzden birebir esitlik degil, kelime ortusmesi
 * kullanilir. Fazla kelime (Yuksek Lisans, Doktora, Ingilizce...) puani
 * dusurur, boylece en yalin/en yakin karsilik one cikar.
 */

import type { ProgramMeta } from '../types'

/** Ad karsilastirmada anlam tasimayan baglac/edatlar. */
const STOP_WORDS = new Set(['ve', 'ile', 'of', 'the', 'for', 'and'])

/** Kucuk harfe indir, parantez ve noktalama at, kelimelere ayir. */
export const nameTokens = (value: string): string[] =>
    value
        .toLocaleLowerCase('tr')
        .replace(/[^a-zçğıöşü0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 0 && !STOP_WORDS.has(token))

export interface ProgramMatch {
    program: ProgramMeta
    score: number
}

/**
 * Program adini katalogla eslestirip en olasi adaylari puanina gore siralar.
 *
 * Puan iki bilesenden gelir:
 *  - kapsam: transkriptteki kelimelerin ne kadari adayin adinda geciyor,
 *  - jaccard: iki adin kelime kumelerinin ortusmesi (fazla kelimeyi cezalandirir).
 * Kapsam agirlikli, jaccard esitlik bozucu; boylece hem "en olasi program",
 * hem birden fazla ayni-adli program arasinda en yalin olani secilir.
 */
export function matchPrograms(
    programName: string,
    programs: ProgramMeta[],
    limit = 5,
): ProgramMatch[] {
    const query = [...new Set(nameTokens(programName))]
    if (query.length === 0) return []

    const scored: ProgramMatch[] = []
    for (const program of programs) {
        const candidate = new Set(nameTokens(program.name))
        if (candidate.size === 0) continue

        let intersection = 0
        for (const token of query) {
            if (candidate.has(token)) intersection += 1
        }
        if (intersection === 0) continue

        const union = query.length + candidate.size - intersection
        const jaccard = union > 0 ? intersection / union : 0
        const coverage = intersection / query.length
        const score = coverage * 0.7 + jaccard * 0.3

        scored.push({ program, score })
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}

/** En iyi tek eslesme; ad yoksa veya hicbir kelime tutmazsa null. */
export function bestProgramMatch(
    programName: string | null,
    programs: ProgramMeta[],
): ProgramMatch | null {
    if (!programName) return null
    const [top] = matchPrograms(programName, programs, 1)
    return top ?? null
}
