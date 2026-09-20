/**
 * localStorage kalicilik katmani.
 *
 * Giris/backend yok, kullanicinin tek verisi burada. Bu yuzden:
 *  - yazma hatalari sessizce yutulmaz, cagrian tarafa bildirilir
 *  - semaya surum damgasi konur ki katalog degisince guvenle tasinabilsin
 *  - disari/iceri aktarma tek guvence, ayni modulden servis edilir
 *
 * v2'de diskte artik dersin tam kopyasi tutulmuyor, yalnizca kullanicinin
 * girdigi not/durum tutuluyor. v1 ders nesnesini de sakliyordu ve katalog
 * yeniden uretilince kullanicidaki kredi/AKTS/tur/donem degerleri bayat
 * kaliyordu. Ders id'leri "<programId>:<kod>" biciminde kalici oldugu icin
 * notlar id ile yeni katalog verisine eslenebiliyor.
 */

import type { CourseProgress, Grade, CourseStatus } from '../types'

const STORAGE_KEY = 'deu-ders-analiz'
const SCHEMA_VERSION = 2

/** programId -> courseId -> kullanici girdisi */
export type ProgressMap = Record<string, Record<string, CourseProgress>>

export interface PersistedState {
    activeProgramId: string | null
    progress: ProgressMap
}

interface PersistedV2 {
    schemaVersion: 2
    savedAt: string
    state: PersistedState
}

/** v1 diskte tum Course nesnesini sakliyordu. */
interface PersistedV1 {
    schemaVersion: 1
    savedAt: string
    state: {
        activeProgramId: string | null
        programs: Array<{
            id: string
            courses: Array<{
                id: string
                grade: Grade
                status: CourseStatus
                added?: boolean
            }>
        }>
    }
}

/** v1 kaydini v2'ye tasir. Test verisi kaybolmasin diye yaziliyor. */
export function migrateV1(v1: PersistedV1['state']): PersistedState {
    const progress: ProgressMap = {}

    for (const program of v1.programs ?? []) {
        if (!program?.id || !Array.isArray(program.courses)) continue
        const entries: Record<string, CourseProgress> = {}
        for (const course of program.courses) {
            if (!course?.id) continue
            // Varsayilan degerleri saklamaya gerek yok, dosyayi sisirir.
            if (course.grade === 'NA' && course.status === 'ALMADIM' && !course.added) {
                continue
            }
            entries[course.id] = {
                grade: course.grade,
                status: course.status,
                ...(course.added ? { added: true } : {}),
            }
        }
        if (Object.keys(entries).length > 0) progress[program.id] = entries
        else progress[program.id] = {}
    }

    return { activeProgramId: v1.activeProgramId ?? null, progress }
}

function parsePayload(raw: string): PersistedState {
    const parsed = JSON.parse(raw) as PersistedV1 | PersistedV2

    if (parsed.schemaVersion === 1) {
        return migrateV1((parsed as PersistedV1).state)
    }

    if (parsed.schemaVersion === SCHEMA_VERSION) {
        const state = (parsed as PersistedV2).state
        if (!state || typeof state.progress !== 'object' || state.progress === null) {
            throw new Error('Dosya beklenen yapıyı taşımıyor.')
        }
        return { activeProgramId: state.activeProgramId ?? null, progress: state.progress }
    }

    throw new Error(
        `Dosya surumu ${(parsed as { schemaVersion?: number }).schemaVersion}, ` +
        `bu surum ${SCHEMA_VERSION} bekliyor.`,
    )
}

export function loadState(): PersistedState | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        return parsePayload(raw)
    } catch (err) {
        console.error('Kayıtlı veri okunamadı:', err)
        return null
    }
}

export function saveState(state: PersistedState): void {
    const payload: PersistedV2 = {
        schemaVersion: SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        state,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

/** Kullanicinin verisini dosyaya indirir. Giris olmadigi icin tek yedek yolu. */
export function exportState(state: PersistedState): void {
    const payload: PersistedV2 = {
        schemaVersion: SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        state,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `deu-ders-analiz-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
}

/** Disaridan alinan yedegi dogrular. Hatali dosyada anlasilir mesaj firlatir. */
export function parseImported(raw: string): PersistedState {
    try {
        return parsePayload(raw)
    } catch (err) {
        if (err instanceof SyntaxError) {
            throw new Error('Dosya geçerli bir JSON değil.')
        }
        throw err
    }
}
