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

/**
 * Iki kelime ayni sayilir mi: birebir esit, ya da TEK harf farkli.
 *
 * Gerekce: DEU katalogu "Makina Muhendisligi" yazar, transkript "Makine
 * Muhendisligi" yazabilir. Tek harf farki tolere edilmezse sorgu, adinin
 * tamami sorguda gecen kisa bir programa kayiyordu ("Makine", Izmir MYO
 * onlisans) ve ogrenci bambaska bir mufredat goruyordu.
 *
 * Esik uzunlugu 5: kisa kelimelerde tek harf anlami degistirir (bkz. "dil"/"din").
 */
const FUZZY_MIN_LENGTH = 5

export function tokensAlike(a: string, b: string): boolean {
    if (a === b) return true
    if (a.length < FUZZY_MIN_LENGTH || b.length < FUZZY_MIN_LENGTH) return false
    if (Math.abs(a.length - b.length) > 1) return false

    // Tek ekleme/silme/degistirme var mi (Levenshtein <= 1).
    const [short, long] = a.length <= b.length ? [a, b] : [b, a]
    let i = 0
    let j = 0
    let edits = 0
    while (i < short.length && j < long.length) {
        if (short[i] === long[j]) {
            i += 1
            j += 1
            continue
        }
        edits += 1
        if (edits > 1) return false
        if (short.length === long.length) i += 1
        j += 1
    }
    return edits + (long.length - j) + (short.length - i) <= 1
}

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
    const queryTokens = nameTokens(programName)
    const query = [...new Set(queryTokens)]
    if (query.length === 0) return []

    // Kelime KUMESI ayni ama sirasi farkli programlar var ("Uluslararasi Ticaret
    // ve Isletmecilik" / "Uluslararasi Isletmecilik ve Ticaret"). Kume puani
    // ikisini ayirt edemiyor; birebir ayni ad varsa o kazanmali.
    const exactKey = queryTokens.join(' ')

    const scored: ProgramMatch[] = []
    for (const program of programs) {
        const candidateTokens = nameTokens(program.name)
        const candidate = new Set(candidateTokens)
        if (candidate.size === 0) continue

        let intersection = 0
        for (const token of query) {
            if (candidate.has(token)) intersection += 1
            else if (candidateTokens.some((c) => tokensAlike(c, token))) intersection += 1
        }
        if (intersection === 0) continue

        const union = query.length + candidate.size - intersection
        const jaccard = union > 0 ? intersection / union : 0
        const coverage = intersection / query.length
        const exact = candidateTokens.join(' ') === exactKey ? 1 : 0
        // Tam ad her zaman onde: kume puani en fazla 1.0 olabilir.
        const score = coverage * 0.7 + jaccard * 0.3 + exact

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
