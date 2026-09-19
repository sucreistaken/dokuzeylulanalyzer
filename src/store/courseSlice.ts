import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { calculateStats } from '../lib/grades'
import type { ProgressMap } from '../lib/storage'
import type {
    Course,
    CourseProgress,
    CourseState,
    Grade,
    CourseStatus,
    ProgramData,
    SavedProgram,
} from '../types'

const emptyStats = calculateStats([])

const initialState: CourseState = {
    activeProgramId: null,
    programs: [],
    stats: emptyStats,
    loading: false,
}

const activeProgram = (state: CourseState): SavedProgram | undefined =>
    state.programs.find((p) => p.id === state.activeProgramId)

/** Aktif programin derslerinden istatistigi yeniden hesaplar. */
const recompute = (state: CourseState): void => {
    const program = activeProgram(state)
    // Secmeli havuzundaki dersler mufredata eklenmedikce sayilmaz.
    const counted = program
        ? program.courses.filter((c) => !c.elective || c.added)
        : []
    state.stats = calculateStats(counted, program?.totalEcts)
}

/**
 * Katalog dersini kullanici girdisiyle birlestirir.
 *
 * Katalog tek dogruluk kaynagi: kredi/AKTS/tur/donem her zaman taze veriden
 * gelir. Kullanicidan yalnizca not/durum/secim tasinir.
 */
const toCourses = (program: ProgramData, progress?: Record<string, CourseProgress>): Course[] =>
    program.courses.map((c) => {
        const saved = progress?.[c.id]
        return {
            ...c,
            grade: saved?.grade ?? ('NA' as Grade),
            status: saved?.status ?? ('ALMADIM' as CourseStatus),
            added: saved?.added ?? false,
        }
    })

const toSavedProgram = (
    program: ProgramData,
    progress?: Record<string, CourseProgress>,
): SavedProgram => ({
    id: program.id,
    name: program.name,
    faculty: program.faculty,
    department: program.department,
    levelLabel: program.levelLabel,
    terms: program.terms ?? [],
    totalEcts: program.totalEcts ?? 0,
    courses: toCourses(program, progress),
})

const courseSlice = createSlice({
    name: 'course',
    initialState,
    reducers: {
        setLoading: (state, action: PayloadAction<boolean>) => {
            state.loading = action.payload
        },

        /**
         * Taze katalog verisi + kayitli kullanici girdisiyle durumu kurar.
         * Katalog yeniden uretildiginde ders id'leri ("<programId>:<kod>")
         * degismedigi icin notlar yerine oturur.
         */
        hydrate: (
            state,
            action: PayloadAction<{
                activeProgramId: string | null
                programs: ProgramData[]
                progress: ProgressMap
            }>,
        ) => {
            const { activeProgramId, programs, progress } = action.payload
            state.programs = programs.map((p) => toSavedProgram(p, progress[p.id]))
            state.activeProgramId =
                activeProgramId && state.programs.some((p) => p.id === activeProgramId)
                    ? activeProgramId
                    : (state.programs[0]?.id ?? null)
            state.loading = false
            recompute(state)
        },

        /** Katalogdan program ekler. Zaten ekliyse sadece aktif yapar. */
        addProgram: (state, action: PayloadAction<ProgramData>) => {
            const existing = state.programs.find((p) => p.id === action.payload.id)
            if (!existing) {
                state.programs.push(toSavedProgram(action.payload))
            }
            state.activeProgramId = action.payload.id
            recompute(state)
        },

        setActiveProgram: (state, action: PayloadAction<string>) => {
            if (state.programs.some((p) => p.id === action.payload)) {
                state.activeProgramId = action.payload
                recompute(state)
            }
        },

        removeProgram: (state, action: PayloadAction<string>) => {
            state.programs = state.programs.filter((p) => p.id !== action.payload)
            if (state.activeProgramId === action.payload) {
                state.activeProgramId = state.programs[0]?.id ?? null
            }
            recompute(state)
        },

        setGrade: (
            state,
            action: PayloadAction<{ courseId: string; grade: Grade }>,
        ) => {
            const program = activeProgram(state)
            const course = program?.courses.find((c) => c.id === action.payload.courseId)
            if (!course) return

            course.grade = action.payload.grade
            // Durum ile not celismesin: notu olan ders alinmistir, notu
            // silinen ders alinmamis sayilir.
            course.status = action.payload.grade === 'NA' ? 'ALMADIM' : 'ALDIM'
            recompute(state)
        },

        setStatus: (
            state,
            action: PayloadAction<{ courseId: string; status: CourseStatus }>,
        ) => {
            const program = activeProgram(state)
            const course = program?.courses.find((c) => c.id === action.payload.courseId)
            if (!course) return

            course.status = action.payload.status
            // "Aliniyor" isaretlenen dersin notu henuz belli degildir.
            if (action.payload.status === 'ALINIYOR') {
                course.grade = 'NA'
            }
            recompute(state)
        },

        /** Secmeli havuzundaki dersi mufredata dahil eder / cikarir. */
        toggleElective: (state, action: PayloadAction<string>) => {
            const program = activeProgram(state)
            const course = program?.courses.find((c) => c.id === action.payload)
            if (!course) return

            course.added = !course.added
            if (!course.added) {
                course.grade = 'NA'
                course.status = 'ALMADIM'
            }
            recompute(state)
        },

        addCustomCourse: (
            state,
            action: PayloadAction<{
                code: string
                name: string
                t: number
                u: number
                l: number
                ects: number
                term: number | null
            }>,
        ) => {
            const program = activeProgram(state)
            if (!program) return

            const { code, name, t, u, l, ects, term } = action.payload
            const id = `${program.id}:custom:${code}`
            if (program.courses.some((c) => c.id === id)) return

            const reference = program.courses.find((c) => c.term === term)
            program.courses.push({
                id,
                code,
                name,
                type: 'SECMELI',
                rawType: 'KULLANICI',
                offered: 'H',
                t,
                u,
                l,
                credit: t + (u + l) / 2,
                ects,
                term,
                termUnit: reference?.termUnit ?? 'Donem',
                termLabel: reference?.termLabel ?? `${term}. Donem`,
                elective: false,
                poolScope: null,
                detail: '',
                grade: 'NA',
                status: 'ALMADIM',
                added: true,
            })
            recompute(state)
        },

        /**
         * Transkriptten toplu ice aktarim.
         *
         * Tek action olarak uygulanir: ara durumlar diske yazilmasin ve
         * istatistik bir kez hesaplansin. Havuzdan gelen dersler otomatik
         * olarak plana alinir (added), boylece notlari sayilir.
         *
         * `replace` (temiz yukle): once bu programdaki tum not/durumlar sifirlanir
         * ve onceki transkriptten eklenmis ozel dersler kaldirilir, sonra yeni
         * transkript yazilir. Boylece ard arda iki farkli transkript yuklendiginde
         * eski derslerin kalintisi karismaz. Kapaliyken (birlestir) mevcut davranis:
         * eslesenlerin uzerine yazilir, dokunulmayanlar korunur.
         */
        importTranscript: (
            state,
            action: PayloadAction<{
                entries: Array<{
                    courseId: string
                    grade: Grade
                    status: CourseStatus
                    /** Transkriptteki yariyil; donemsiz havuz derslerini yerlestirmek icin. */
                    term?: number | null
                }>
                custom: Array<{
                    code: string
                    name: string
                    t: number
                    u: number
                    l: number
                    ects: number
                    term: number | null
                    grade: Grade
                    status: CourseStatus
                }>
                /** true: once mevcut transkript izini temizle (temiz yukle). */
                replace?: boolean
            }>,
        ) => {
            const program = activeProgram(state)
            if (!program) return

            if (action.payload.replace) {
                // Onceki transkriptten eklenen ozel dersleri kaldir (kullanicinin
                // elle ekledigi 'KULLANICI' dersleri korunur).
                program.courses = program.courses.filter(
                    (c) => c.rawType !== 'TRANSKRIPT',
                )
                // Kalan tum derslerin notunu/durumunu sifirla; havuz secimlerini geri al.
                for (const course of program.courses) {
                    course.grade = 'NA'
                    course.status = 'ALMADIM'
                    if (course.elective) course.added = false
                }
            }

            const byId = new Map(program.courses.map((c) => [c.id, c]))

            for (const entry of action.payload.entries) {
                const course = byId.get(entry.courseId)
                if (!course) continue
                course.grade = entry.grade
                course.status = entry.status
                // Havuz dersine not girildiyse mufredata dahil edilmelidir.
                if (course.elective) course.added = true
                // "Her donem alinabilir" havuzundan gelen derslerin katalogda
                // donemi yoktur; transkript hangi yariyilda alindigini soyluyorsa
                // dersi o donemin altina yerlestir.
                if (course.term === null && entry.term != null) {
                    const reference = program.courses.find(
                        (c) => c.term === entry.term && !c.elective,
                    )
                    course.term = entry.term
                    course.termUnit = reference?.termUnit ?? course.termUnit ?? 'Donem'
                }
            }

            for (const item of action.payload.custom) {
                const id = `${program.id}:custom:${item.code}`
                if (byId.has(id)) continue
                const reference = program.courses.find((c) => c.term === item.term)
                program.courses.push({
                    id,
                    code: item.code,
                    name: item.name,
                    type: 'SECMELI',
                    rawType: 'TRANSKRIPT',
                    offered: 'H',
                    t: item.t,
                    u: item.u,
                    l: item.l,
                    credit: item.t + (item.u + item.l) / 2,
                    ects: item.ects,
                    term: item.term,
                    termUnit: reference?.termUnit ?? 'Donem',
                    termLabel: reference?.termLabel ?? `${item.term}. Donem`,
                    elective: false,
                    poolScope: null,
                    detail: '',
                    grade: item.grade,
                    status: item.status,
                    added: true,
                })
            }

            recompute(state)
        },

        removeCourse: (state, action: PayloadAction<string>) => {
            const program = activeProgram(state)
            if (!program) return
            program.courses = program.courses.filter((c) => c.id !== action.payload)
            recompute(state)
        },

        /** Aktif programdaki tum not ve durumlari sifirlar. */
        resetProgress: (state) => {
            const program = activeProgram(state)
            if (!program) return
            for (const course of program.courses) {
                course.grade = 'NA'
                course.status = 'ALMADIM'
            }
            recompute(state)
        },
    },
})

/** Redux durumundan diske yazilacak sade ilerleme haritasini cikarir. */
export const selectProgress = (state: CourseState): ProgressMap => {
    const progress: ProgressMap = {}
    for (const program of state.programs) {
        const entries: Record<string, CourseProgress> = {}
        for (const course of program.courses) {
            if (course.grade === 'NA' && course.status === 'ALMADIM' && !course.added) {
                continue
            }
            entries[course.id] = {
                grade: course.grade,
                status: course.status,
                ...(course.added ? { added: true } : {}),
            }
        }
        progress[program.id] = entries
    }
    return progress
}

export const {
    setLoading,
    hydrate,
    addProgram,
    setActiveProgram,
    removeProgram,
    setGrade,
    setStatus,
    toggleElective,
    addCustomCourse,
    importTranscript,
    removeCourse,
    resetProgress,
} = courseSlice.actions

export default courseSlice.reducer
