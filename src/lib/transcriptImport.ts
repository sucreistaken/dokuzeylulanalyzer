/**
 * Transkript satirlarini aktif programin dersleriyle eslestirir.
 *
 * Hicbir sey sessizce yazilmaz: sonuc uc kovaya ayrilir ve kullaniciya
 * onizlemede gosterilir. Taninmayan not/durum uyari uretir.
 */

import { GRADE_OPTIONS } from './grades'
import type { CatalogCourse, CourseStatus, Grade, TermRequirement } from '../types'
import type { TranscriptRow } from './transcript'

/**
 * Plan yalnizca katalog alanlarini + (varsa) havuz secim durumunu okur; not/durum
 * gerektirmez. Boylece hem magazadaki Course, hem henuz eklenmemis taze
 * ProgramData.courses (CatalogCourse) dogrudan verilebilir.
 */
export type PlanCourse = CatalogCourse & { added?: boolean }

export interface MatchedEntry {
    row: TranscriptRow
    course: PlanCourse
    grade: Grade
    status: CourseStatus
    /** Secmeli havuzundan geliyor ve henuz plana eklenmemis. */
    fromPool: boolean
}

export interface UnmatchedEntry {
    row: TranscriptRow
    grade: Grade
    status: CourseStatus
}

export interface ImportPlan {
    matched: MatchedEntry[]
    unmatched: UnmatchedEntry[]
    warnings: string[]
}

/** "CME1203", "cme 1203" -> "CME 1203" */
export const normalizeCode = (code: string): string =>
    code
        .toLocaleUpperCase('tr')
        .replace(/\s+/g, '')
        .replace(/^([A-ZÇĞİÖŞÜ]+)(\d)/, '$1 $2')

/**
 * Transkript notunu uygulama notuna cevirir.
 * "-" ve bos = henuz alinmadi. Taninmayan deger null doner (uyari uretilir).
 */
export function toGrade(raw: string): Grade | null {
    // Yildiz/parantez gibi isaretler bazi sablonlarda nota ekleniyor.
    const value = raw.trim().replace(/[^A-Za-zÇĞİÖŞÜçğıöşü-]/g, '').toLocaleUpperCase('tr')
    if (!value || value === '-') return 'NA'
    const found = GRADE_OPTIONS.find((g) => g === value)
    return found ?? null
}

/**
 * Transkript durumunu uygulama durumuna cevirir.
 *
 * Gozlemlenen degerler: "Gecti", "Almadi". Diger sablonlarda "Devam Ediyor",
 * "Kaldi", "Muaf", "Devamsiz" gecebilir.
 *
 * DIKKAT: "Devamsiz" da "devam" ile basliyor ama dersin ALINDIGINI ve
 * devamsizliktan kalindigini gosterir; "devam ediyor" ile karistirilmamali.
 */
export function toStatus(rawStatus: string, grade: Grade): CourseStatus {
    const value = rawStatus.trim().toLocaleLowerCase('tr')

    if (/devams[iı]z/.test(value)) return 'ALDIM'
    if (/devam|al[iı]yor|s[uü]r[uü]yor/.test(value)) return 'ALINIYOR'
    if (/almad/.test(value)) return 'ALMADIM'

    // Durum bilinmiyorsa nota bak: notu olan ders alinmistir.
    if (grade === 'NA') return 'ALMADIM'
    return 'ALDIM'
}

/**
 * Ayni ders birden fazla kez alinmissa (tekrar) en guncel kayit kazanir:
 * once tekrar sayisi (TS) yuksek olan, esitse notu olan.
 */
function pickLatest(rows: TranscriptRow[]): TranscriptRow {
    return rows.reduce((best, row) => {
        if (row.repeat !== best.repeat) return row.repeat > best.repeat ? row : best
        const bestHasGrade = best.grade !== '-' && best.grade !== ''
        const rowHasGrade = row.grade !== '-' && row.grade !== ''
        return !bestHasGrade && rowHasGrade ? row : best
    })
}

export function buildImportPlan(
    rows: TranscriptRow[],
    courses: PlanCourse[],
): ImportPlan {
    const byCode = new Map<string, PlanCourse>()
    for (const course of courses) {
        byCode.set(normalizeCode(course.code), course)
    }

    // Ayni kodun birden fazla satirini birlestir.
    const grouped = new Map<string, TranscriptRow[]>()
    for (const row of rows) {
        const key = normalizeCode(row.code)
        const bucket = grouped.get(key)
        if (bucket) bucket.push(row)
        else grouped.set(key, [row])
    }

    const matched: MatchedEntry[] = []
    const unmatched: UnmatchedEntry[] = []
    const warnings: string[] = []
    let repeated = 0

    for (const [code, group] of grouped) {
        if (group.length > 1) repeated += 1
        const row = pickLatest(group)

        const grade = toGrade(row.grade)
        if (grade === null) {
            warnings.push(
                `${row.code}: "${row.grade}" notu taninmadi, bu ders atlandi.`,
            )
            continue
        }
        const status = toStatus(row.status, grade)
        const course = byCode.get(code)

        if (course) {
            matched.push({
                row,
                course,
                grade,
                status,
                fromPool: course.elective && !course.added,
            })
        } else {
            unmatched.push({ row, grade, status })
        }
    }

    if (repeated > 0) {
        warnings.push(
            `${repeated} ders transkriptte birden fazla kez geçti; en güncel kayıt alındı.`,
        )
    }

    return { matched, unmatched, warnings }
}

/**
 * Onizlemede gosterilecek ozet. Ice aktarim sonrasi beklenen GANO'yu hesaplar;
 * transkriptin kendi GANO'suyla karsilastirmak kullaniciya dogruluk guvencesi verir.
 *
 * Eslesen dersler KATALOG kredisiyle, eslesmeyen (mufredata eklenecek) dersler
 * transkriptten gelen kredisiyle (T + U/2) sayilir. `includeUnmatched` false ise
 * eslesmeyenler haric tutulur (kullanici "ekleme" secenegini kapatmissa).
 */
export function summarize(
    plan: ImportPlan,
    gradePoints: Record<string, number>,
    includeUnmatched = false,
): { credits: number; points: number; gpa: number; ects: number } {
    let credits = 0
    let points = 0
    let ects = 0

    const add = (credit: number, courseEcts: number, grade: Grade, status: CourseStatus) => {
        const point = gradePoints[grade]
        if (point !== undefined) {
            credits += credit
            points += credit * point
        }
        if (grade !== 'NA' && status !== 'ALINIYOR') ects += courseEcts
    }

    for (const entry of plan.matched) {
        add(entry.course.credit, entry.course.ects, entry.grade, entry.status)
    }

    if (includeUnmatched) {
        for (const entry of plan.unmatched) {
            // Transkriptte lab ayri sutun degil; kredi = T + U/2 (toCustomCourse ile ayni).
            const credit = entry.row.t + entry.row.u / 2
            add(credit, entry.row.ects, entry.grade, entry.status)
        }
    }

    return {
        credits: Math.round(credits * 100) / 100,
        points: Math.round(points * 100) / 100,
        gpa: credits > 0 ? Math.round((points / credits) * 100) / 100 : 0,
        ects,
    }
}

/** Eslesmeyen bir transkript satirindan mufredata eklenecek ders uretir. */
export function toCustomCourse(
    entry: UnmatchedEntry,
    terms: TermRequirement[],
): {
    code: string
    name: string
    t: number
    u: number
    l: number
    ects: number
    term: number | null
} {
    const { row } = entry
    const term = terms.some((t) => t.term === row.term) ? row.term : null
    return {
        code: row.code,
        name: row.name || row.code,
        t: row.t,
        u: row.u,
        // Transkriptte laboratuvar ayri sutun degil; kredi TK'dan dogrulanir.
        l: 0,
        ects: row.ects,
        term,
    }
}
