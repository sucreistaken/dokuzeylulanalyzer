/**
 * DEU "Ogrenci Not Durum Belgesi" (transkript) ayristiricisi.
 *
 * Saf fonksiyon: DOM'a ve pdfjs'e bagimli degil, yalnizca kelime + koordinat
 * alir. Boylece gercek PDF olmadan test edilebilir (bkz. transcript.test.ts).
 *
 * Gercek bir transkript uzerinde olculen yapi:
 *
 * 1. Sayfa IKI SUTUNLU. Tek bir y satirinda iki yariyilin dersi yan yana durur
 *    (BIRINCI | IKINCI, UCUNCU | DORDUNCU ...). Duz metin kopyalamak yariyillari
 *    birbirine karistirir; bu yuzden x koordinatiyla calisiyoruz.
 *
 * 2. FILIGRAN sizintisi: capraz "OGRENCI VERSIYONUDUR. RESMI NITELIK TASIMAZ"
 *    yazisinin parcalari hucrelere dusuyor ("IKINCI YARIYIL IM", "30 I 19 66.5").
 *    Filigran yazi yuksekligi 16-22px, normal metin 6.14px. Bu filtre olmadan
 *    notlar ve ortalamalar bozuluyor.
 *
 * 3. Sutun sinirlari 595.28pt genislikteki sayfadan olculdu ve orana cevrildi,
 *    boylece farkli kagit boyutunda da calisir.
 */

import { GRADE_POINTS, FAILING_GRADES } from './grades'

export interface TranscriptWord {
    x: number
    y: number
    w: number
    h: number
    text: string
}

export interface TranscriptPage {
    width: number
    height: number
    words: TranscriptWord[]
}

export interface TranscriptRow {
    code: string
    name: string
    /** Teorik saat */
    t: number
    /** Uygulama saati */
    u: number
    ects: number
    /** Transkriptteki "TK" sutunu: yerel kredi */
    credit: number
    /** "TS" sutunu: tekrar sayisi */
    repeat: number
    /** Ham harf notu ("AA", "B", "-") */
    grade: string
    /** "Gecti" / "Almadi" / "Devam" */
    status: string
    /** 1-based yariyil numarasi; cikarilamazsa null */
    term: number | null
}

export interface TranscriptTotals {
    ects: number
    credits: number
    points: number
    gpa: number
}

export interface ParsedTranscript {
    /** Ust bilgideki program adi; bulunamazsa null */
    program: string | null
    rows: TranscriptRow[]
    /** Transkriptin kendi "Kumulatif Ortalamasi" satiri (kendini dogrulama icin) */
    totals: TranscriptTotals | null
    warnings: string[]
}

type ColumnKey =
    | 'code' | 'name' | 't' | 'u' | 'l'
    | 'ects' | 'credit' | 'repeat' | 'grade' | 'status'

/**
 * Sutun basliklari. Duzen SABIT DEGIL: her PDF'in kendi baslik satirindan
 * okunur. Boylece farkli fakulte sablonlari, farkli kagit boyutu ve tek/cift
 * sutunlu yerlesimler ek kod olmadan calisir.
 *
 * "DERS ADI" iki kelimedir; "ADI" atlanir. "L" bazi sablonlarda var.
 */
const HEADER_LABELS: Array<{ key: ColumnKey; match: RegExp }> = [
    { key: 'code', match: /^KODU?$/i },
    { key: 'name', match: /^DERS$/i },
    { key: 't', match: /^T$/ },
    { key: 'u', match: /^U$/ },
    { key: 'l', match: /^L$/ },
    { key: 'ects', match: /^AKTS$/i },
    { key: 'credit', match: /^TK$/i },
    { key: 'repeat', match: /^TS$/i },
    { key: 'grade', match: /^Not[ui]?$/i },
    { key: 'status', match: /^Durum[u]?$/i },
]

/** Baslik satirini tanimak icin: bir blok en az bunlari icermeli. */
const REQUIRED_HEADERS: ColumnKey[] = ['code', 'grade']

/** Sutun sinirinda kucuk kaymalara tolerans (pt). */
const COLUMN_TOLERANCE = 2

interface ColumnRange {
    key: ColumnKey
    from: number
    to: number
}

/** Bir yariyil blogunun sutun haritasi. */
type BlockLayout = ColumnRange[]

/** Normal metin ~6.1pt. Filigran 16-22pt. */
const MAX_TEXT_HEIGHT = 10

/** Capraz filigran harfleri asiri genis kutu uretir. */
const MAX_WIDTH_PER_CHAR = 9

/** Ayni satir sayilma toleransi. round() kullanmak satirlari boluyordu. */
const ROW_TOLERANCE = 2.5

/** Tablo bu y'nin ustunde baslamaz; ustu ust bilgi bolgesi. */
const HEADER_Y_LIMIT = 125

/**
 * Yariyil/yil basliklarindaki sira sayilari.
 *
 * Tip ve Hukuk gibi programlar YIL bazli, muhendislik YARIYIL bazli.
 * Ayrica 6 yillik Tip icin 12'ye kadar yariyil mumkun; liste genis tutuldu.
 */
const TERM_WORDS: Record<string, number> = {
    'BİRİNCİ': 1, 'İKİNCİ': 2, 'ÜÇÜNCÜ': 3, 'DÖRDÜNCÜ': 4,
    'BEŞİNCİ': 5, 'ALTINCI': 6, 'YEDİNCİ': 7, 'SEKİZİNCİ': 8,
    'DOKUZUNCU': 9, 'ONUNCU': 10, 'ONBİRİNCİ': 11, 'ONİKİNCİ': 12,
    'ON BİRİNCİ': 11, 'ON İKİNCİ': 12,
}

/** "3. YARIYIL", "3.YIL", "3 . SINIF" gibi rakamli bicimler. */
const NUMERIC_TERM_RE = /(\d{1,2})\s*\.?\s*(YARIYIL|YARI\s*YIL|YIL|SINIF|D[ÖO]NEM)/i

/** Yariyil basligi olabilecek satirlari tanir. */
const TERM_HEADER_RE = /(YARIYIL|YARI\s*YIL|D[ÖO]NEM|SINIF|\bYIL\b)/i

const CODE_RE = /^[A-ZÇĞİÖŞÜ]{2,6}\s?\d{3,4}$/

/** "3,5" ve "3.5" ikisini de kabul eder; sayi degilse 0. */
const toNumber = (value: string): number => {
    const parsed = Number.parseFloat(value.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Filigran ve cizim artiklarini eler.
 * Disari acildi ki test dogrudan dogrulayabilsin.
 */
export const isContentWord = (word: TranscriptWord): boolean => {
    if (!word.text) return false
    if (word.h > MAX_TEXT_HEIGHT) return false
    if (word.w / Math.max(word.text.length, 1) > MAX_WIDTH_PER_CHAR) return false
    return true
}

/** y'ye gore toleransli kumeleme. */
function clusterRows(words: TranscriptWord[]): TranscriptWord[][] {
    const sorted = [...words].sort((a, b) => a.y - b.y)
    const rows: TranscriptWord[][] = []
    let anchor = Number.NaN

    for (const word of sorted) {
        if (rows.length > 0 && Math.abs(word.y - anchor) <= ROW_TOLERANCE) {
            rows[rows.length - 1].push(word)
        } else {
            rows.push([word])
            anchor = word.y
        }
    }
    return rows.map((row) => row.sort((a, b) => a.x - b.x))
}

/**
 * Baslik satirindan sutun haritalarini cikarir.
 *
 * Bir satirda birden fazla "KODU" varsa sayfa cok sutunludur (DEU transkripti
 * iki yariyili yan yana basiyor); her "KODU" yeni bir blok baslatir.
 * Boylece sabit koordinat yerine belgenin kendi duzeni kullanilir.
 *
 * Bulamazsa bos dizi doner (satir baslik degildir).
 */
export function readLayout(row: TranscriptWord[], pageWidth: number): BlockLayout[] {
    const sorted = [...row].sort((a, b) => a.x - b.x)

    // Her kelimeyi tanidigimiz bir basliga esle.
    const tagged: Array<{ key: ColumnKey; x: number }> = []
    for (const word of sorted) {
        const label = HEADER_LABELS.find((h) => h.match.test(word.text))
        if (label) tagged.push({ key: label.key, x: word.x })
    }

    // "KODU" gorulen her yerde yeni blok baslar.
    const blocks: Array<Array<{ key: ColumnKey; x: number }>> = []
    for (const item of tagged) {
        if (item.key === 'code' || blocks.length === 0) blocks.push([])
        blocks[blocks.length - 1].push(item)
    }

    const layouts: BlockLayout[] = []
    for (const [index, block] of blocks.entries()) {
        // Blok gecerli mi? Zorunlu basliklar bulunmali.
        if (!REQUIRED_HEADERS.every((key) => block.some((b) => b.key === key))) {
            continue
        }

        // Blok sonu: bir sonraki blogun basi, yoksa sayfa sonu.
        const nextBlock = blocks[index + 1]
        const blockEnd = nextBlock ? nextBlock[0].x : pageWidth

        const ranges: ColumnRange[] = block.map((item, i) => ({
            key: item.key,
            from: item.x - COLUMN_TOLERANCE,
            to: (block[i + 1]?.x ?? blockEnd) - COLUMN_TOLERANCE,
        }))
        // Son sutun blok sonuna kadar uzasin.
        if (ranges.length > 0) ranges[ranges.length - 1].to = blockEnd - COLUMN_TOLERANCE

        layouts.push(ranges)
    }

    return layouts
}

/** Bir satirin tek blogunu, ogrenilen sutun haritasina gore dagitir. */
function cellsOf(row: TranscriptWord[], layout: BlockLayout): Record<string, string> {
    const cells: Record<string, string[]> = {}
    for (const range of layout) cells[range.key] = []

    for (const word of row) {
        const range = layout.find((c) => word.x >= c.from && word.x < c.to)
        if (range) cells[range.key].push(word.text)
    }

    const out: Record<string, string> = {}
    for (const [key, parts] of Object.entries(cells)) out[key] = parts.join(' ').trim()
    return out
}

/** Blogun kapsadigi x araligi (yariyil basligi hangi bloga ait, onu bulmak icin). */
function blockSpan(layout: BlockLayout): { from: number; to: number } {
    return {
        from: layout[0].from,
        to: layout[layout.length - 1].to,
    }
}

export function parseTranscript(pages: TranscriptPage[]): ParsedTranscript {
    const rows: TranscriptRow[] = []
    const warnings: string[] = []
    let program: string | null = null
    let totals: TranscriptTotals | null = null

    // Duzen sayfalar arasi tasinir: bazi sayfalarda baslik tekrarlanmayabilir.
    let layouts: BlockLayout[] = []
    // Blok basina son gorulen yariyil.
    let currentTerm: Array<number | null> = []

    for (const page of pages) {
        const words = page.words.filter(isContentWord)
        const pageRows = clusterRows(words)

        // Iki gecis gerekiyor: yariyil basligi ("BIRINCI YARIYIL") sayfada
        // sutun basligindan ONCE geliyor. Tek geciste ilk yariyil basligi
        // duzen henuz bilinmedigi icin kaciriliyordu.
        for (const row of pageRows) {
            const found = readLayout(row, page.width)
            if (found.length > 0) {
                layouts = found
                if (currentTerm.length !== found.length) {
                    currentTerm = new Array(found.length).fill(null)
                }
                break
            }
        }

        for (const row of pageRows) {
            // 1) Sutun basligi satirini veri olarak isleme.
            if (readLayout(row, page.width).length > 0) continue

            // 2) Ust bilgi (program adi) - duzen gerekmez.
            if (row[0].y < HEADER_Y_LIMIT) {
                if (!program) {
                    const line = row.map((w) => w.text).join(' ')
                    const match = line.match(/PROGRAM\s*:?\s*(.+?)\s*(?:ADI SOYADI|$)/)
                    if (match) program = match[1].trim()
                }
                continue
            }

            if (layouts.length === 0) continue

            // 3) Satiri her blok icin ayri degerlendir.
            for (const [index, layout] of layouts.entries()) {
                const span = blockSpan(layout)
                const inBlock = row.filter((w) => w.x >= span.from && w.x < span.to)
                if (inBlock.length === 0) continue

                const line = inBlock.map((w) => w.text).join(' ')

                // Yariyil / yil basligi
                if (TERM_HEADER_RE.test(line) && !/Ortalama/i.test(line)) {
                    const numeric = line.match(NUMERIC_TERM_RE)
                    if (numeric) {
                        currentTerm[index] = Number.parseInt(numeric[1], 10)
                    } else {
                        for (const [word, number] of Object.entries(TERM_WORDS)) {
                            if (line.includes(word)) {
                                currentTerm[index] = number
                                break
                            }
                        }
                    }
                    continue
                }

                // Kumulatif ortalama: transkriptin kendi hesabi.
                // Son gorulen kayit en guncel kumulatiftir.
                if (/K[üu]m[üu]latif/i.test(line)) {
                    const numbers = line.match(/\d+(?:[.,]\d+)?/g) ?? []
                    if (numbers.length >= 4) {
                        const [ects, credits, points, gpa] = numbers.slice(-4).map(toNumber)
                        totals = { ects, credits, points, gpa }
                    }
                    continue
                }

                // Ders satiri
                const cells = cellsOf(inBlock, layout)
                const code = cells.code ?? ''
                if (!CODE_RE.test(code) || !cells.grade) continue

                rows.push({
                    code: code.replace(/\s+/g, ' '),
                    name: cells.name ?? '',
                    t: toNumber(cells.t ?? ''),
                    u: toNumber(cells.u ?? ''),
                    ects: toNumber(cells.ects ?? ''),
                    credit: toNumber(cells.credit ?? ''),
                    repeat: toNumber(cells.repeat ?? '') || 1,
                    grade: cells.grade,
                    status: cells.status ?? '',
                    term: currentTerm[index] ?? null,
                })
            }
        }
    }

    if (layouts.length === 0) {
        warnings.push(
            'PDF icinde ders tablosu basligi (KODU / Notu) bulunamadi. Dosyanin ' +
            'DEBIS "Ogrenci Not Durum Belgesi" oldugundan emin olun.',
        )
    } else if (rows.length === 0) {
        warnings.push(
            'Tablo bulundu ama ders satiri okunamadi. Transkript bicimi beklenenden ' +
            'farkli olabilir.',
        )
    }

    const withoutTerm = rows.filter((r) => r.term === null).length
    if (withoutTerm > 0) {
        warnings.push(`${withoutTerm} dersin yariyili belirlenemedi.`)
    }

    return { program, rows, totals, warnings }
}

/* ------------------------------------------------------------------ *
 *  YÖK / e-Devlet "Not Döküm Belgesi" (TRANSCRIPT) ayristiricisi
 *
 *  Bu, turkiye.gov.tr / YÖK üzerinden alinan STANDART ulusal transkripttir;
 *  tum universitelerde ayni sablondur. DEU DEBIS belgesinden tamamen farkli:
 *   - Tek sutunlu, iki dilli (TR ust satir, parantez icinde EN alt satir).
 *   - Sutunlar: Kod | Ad | Statu(Z/S) | Dil | T | U | UK | AKTS | Not | Puan | Aciklama.
 *     "UK" = Ulusal Kredi (yerel kredi), ortalama bununla hesaplanir.
 *   - Donem toplami tek satir: "DNO / GNO / TUK / TAKTS".
 *   - Kodu "*" ile baslayan ve "HAZ" hazirlik dersleri ortalamaya girmez.
 *   - Tekrar edilen ders her donemde ayri satir gelir; en son donemdeki gecerli.
 *
 *  Sutun sinirlari gercek belgeden olculdu ve sayfa genisligine oranlandi;
 *  boylece farkli kagit boyutunda da calisir. Sablon ulusal capta sabit oldugu
 *  icin sabit oranlar (baslik satiri okumaya gore) daha saglam.
 * ------------------------------------------------------------------ */

/** Sutun sag siniri, sayfa genisligine oran olarak (gercek belgeden olculdu). */
const YOK_COLUMNS: Array<{ key: string; to: number }> = [
    { key: 'code', to: 0.124 },
    { key: 'name', to: 0.443 },
    { key: 'status', to: 0.534 },
    { key: 'lang', to: 0.613 },
    { key: 't', to: 0.652 },
    { key: 'u', to: 0.694 },
    { key: 'uk', to: 0.739 },
    { key: 'ects', to: 0.783 },
    { key: 'grade', to: 0.827 },
    { key: 'points', to: 0.875 },
    { key: 'comment', to: Number.POSITIVE_INFINITY },
]

/** e-Devlet kodu: "ENG 101", "MATH 153", "CEST 400", "SE 115". */
const YOK_CODE_RE = /^[A-ZÇĞİÖŞÜ]{2,5}\s?\d{2,4}$/

/** "1. YARIYIL" degil; "2022-2023 Guz/Bahar/Yaz Donemi" bicimi. */
const YOK_TERM_RE = /(G[üu]z|Bahar|Yaz)\s*D[öo]nemi/i

/** Bir satiri sabit oran sutunlarina dagitir. */
function yokCells(row: TranscriptWord[], pageWidth: number): Record<string, string> {
    const parts: Record<string, string[]> = {}
    for (const col of YOK_COLUMNS) parts[col.key] = []
    for (const word of row) {
        const ratio = word.x / pageWidth
        const col = YOK_COLUMNS.find((c) => ratio < c.to) ?? YOK_COLUMNS[YOK_COLUMNS.length - 1]
        parts[col.key].push(word.text)
    }
    const out: Record<string, string> = {}
    for (const [key, list] of Object.entries(parts)) out[key] = list.join(' ').trim()
    return out
}

/**
 * e-Devlet notunu uygulama notuna cevirir.
 * "S" (Yeterli, orn. staj) ortalamaya girmez -> 'B'. Bos/"-" -> henuz notsuz.
 * Harf notlari (AA..FF) YÖK 4'luk skalasinda uygulama ile birebir aynidir.
 */
function yokGrade(raw: string): string {
    const value = raw.trim().toLocaleUpperCase('tr')
    if (!value || value === '-') return '-'
    if (value === 'S') return 'B'
    return value
}

/** Belge YÖK/e-Devlet formatinda mi? (DEU DEBIS belgesi degil.) */
export function isYokTranscript(pages: TranscriptPage[]): boolean {
    const text = (pages[0]?.words ?? [])
        .map((w) => w.text)
        .join(' ')
        .toLocaleUpperCase('tr')
    return text.includes('DÖKÜM') || (text.includes('TRANSCRIPT') && text.includes('GNO'))
}

interface YokRawRow extends TranscriptRow {
    /** Kodu "*" ile baslar: ortalamaya girmez. */
    starred: boolean
}

export function parseYokTranscript(pages: TranscriptPage[]): ParsedTranscript {
    const raw: YokRawRow[] = []
    const warnings: string[] = []
    let program: string | null = null
    let finalGpa: number | null = null
    let completedEcts: number | null = null
    let term = 0

    for (const page of pages) {
        for (const row of clusterRows(page.words)) {
            const line = row.map((w) => w.text).join(' ')

            // Program adi (yalnizca 1. sayfada). Etiket solda; ad orta sutunda,
            // sag sutundaki "Giris Turu"nden once biter.
            if (!program && line.includes('Programı/ABD/ASD')) {
                const nameWords = row.filter((w) => {
                    const r = w.x / page.width
                    return r >= 0.15 && r < 0.55
                })
                const name = nameWords
                    .map((w) => w.text)
                    .filter((t) => t !== 'Pr.')
                    .join(' ')
                    .trim()
                program = name || null
                continue
            }

            // Kumulatif GNO ve basarilan kredi (ust bilgi).
            if (completedEcts === null && line.includes('Başarılan')) {
                const m = line.match(/(\d+)\s*$/)
                if (m) completedEcts = Number.parseInt(m[1], 10)
            }

            // Donem basligi: sayaci artir, satiri ders olarak isleme.
            if (YOK_TERM_RE.test(line)) {
                term += 1
                continue
            }

            // Donem toplami: "DNO:.. GNO:2.32 TUK:.. TAKTS:..". Son GNO kumulatiftir.
            if (line.includes('GNO:')) {
                const gno = line.match(/GNO:\s*([\d.,]+)/)
                if (gno) finalGpa = toNumber(gno[1])
                continue
            }

            // Ders satiri
            const cells = yokCells(row, page.width)
            const starred = cells.code.includes('*')
            const code = cells.code.replace(/\*/g, '').replace(/\s+/g, ' ').trim()
            if (!YOK_CODE_RE.test(code)) continue

            const grade = yokGrade(cells.grade)
            const ects = toNumber(cells.ects)
            // Hazirlik / yer tutucu satirlar: notsuz ve AKTS'siz; atla.
            if (grade === '-' && ects === 0) continue

            raw.push({
                code: code.replace(/\s+/g, ' '),
                name: cells.name,
                t: toNumber(cells.t),
                u: toNumber(cells.u),
                ects,
                credit: toNumber(cells.uk),
                // Tekrar ele almasi icin donem numarasi vekil olarak kullanilir:
                // ayni kodun en yuksek donemdeki (en guncel) kaydi kazanir.
                repeat: term,
                grade,
                status: cells.comment,
                term,
                starred,
            })
        }
    }

    // Tekrarlanan dersi tekille: ayni kod icin en son donemdeki kayit gecerli.
    const byCode = new Map<string, YokRawRow>()
    for (const r of raw) {
        const existing = byCode.get(r.code)
        if (!existing || (r.term ?? 0) > (existing.term ?? 0)) byCode.set(r.code, r)
    }
    const deduped = [...byCode.values()].sort((a, b) => (a.term ?? 0) - (b.term ?? 0))

    // Kendini dogrulama icin toplamlar. GANO uygulamayla ayni yontemde (YEREL
    // KREDI agirlikli) hesaplanir; bagimsiz capa transkriptin kendi GNO satiridir
    // (asagida totals.gpa). DIKKAT: bazi universiteler (orn. Izmir Ekonomi) GANO'yu
    // AKTS ile agirliklar; bu belgede iki yontem de ayni sonuca yakinsadi, ama
    // ayrilan durumlarda self-check kullaniciyi uyarir (sessiz yanlistan iyidir).
    let credits = 0
    let points = 0
    let earnedEcts = 0
    const failing = new Set<string>(FAILING_GRADES)
    for (const r of deduped) {
        const coeff = GRADE_POINTS[r.grade]
        if (!r.starred && coeff !== undefined) {
            credits += r.credit
            points += r.credit * coeff
        }
        // Basarili sayilan dersin AKTS'si kazanilir (FD/FF/Y disinda).
        if (!failing.has(r.grade) && r.grade !== '-') earnedEcts += r.ects
    }
    points = Math.round(points * 100) / 100

    const totals: TranscriptTotals = {
        ects: completedEcts ?? earnedEcts,
        credits,
        points,
        gpa: finalGpa ?? (credits > 0 ? Math.round((points / credits) * 100) / 100 : 0),
    }

    const rows: TranscriptRow[] = deduped.map((r) => ({
        code: r.code,
        name: r.name,
        t: r.t,
        u: r.u,
        ects: r.ects,
        credit: r.credit,
        repeat: 1,
        grade: r.grade,
        status: r.status,
        term: r.term,
    }))

    if (rows.length === 0) {
        warnings.push(
            'YÖK/e-Devlet transkripti taninamadi ya da ders satiri okunamadi. ' +
            'Belgenin bozulmadan indirildiginden emin olun.',
        )
    }

    return { program, rows, totals: rows.length > 0 ? totals : null, warnings }
}

/**
 * Belge formatini otomatik algilar ve dogru ayristiriciya yonlendirir.
 * DEU DEBIS belgesi -> parseTranscript; YÖK/e-Devlet belgesi -> parseYokTranscript.
 */
export function parseTranscriptAuto(pages: TranscriptPage[]): ParsedTranscript {
    return isYokTranscript(pages) ? parseYokTranscript(pages) : parseTranscript(pages)
}

/**
 * Ayristirmayi transkriptin kendi kumulatif satiriyla karsilastirir.
 * Tutmuyorsa kullaniciya guvenmemesi soylenir; sessizce yanlis veri yazmaktan iyidir.
 */
export function verifyAgainstTotals(
    rows: TranscriptRow[],
    totals: TranscriptTotals | null,
    gradePoints: Record<string, number>,
): { ok: boolean; credits: number; points: number; gpa: number } | null {
    if (!totals) return null

    let credits = 0
    let points = 0
    for (const row of rows) {
        const point = gradePoints[row.grade]
        if (point === undefined) continue
        credits += row.credit
        points += row.credit * point
    }
    const gpa = credits > 0 ? Math.round((points / credits) * 100) / 100 : 0

    const ok =
        Math.abs(credits - totals.credits) < 0.01 &&
        Math.abs(points - totals.points) < 0.01 &&
        Math.abs(gpa - totals.gpa) < 0.015

    return { ok, credits, points, gpa }
}
