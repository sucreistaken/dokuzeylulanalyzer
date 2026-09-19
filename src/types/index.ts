/** Ortalamaya giren harf notlari. */
export type LetterGrade =
    | 'AA' | 'BA' | 'BB' | 'CB' | 'CC' | 'DC' | 'DD' | 'FD' | 'FF'

/** Ortalamaya girmeyen notlar + alinmadi. */
export type SpecialGrade = 'B' | 'M' | 'Y' | 'D' | 'E' | 'NA'

export type Grade = LetterGrade | SpecialGrade

export type CourseStatus = 'ALMADIM' | 'ALINIYOR' | 'ALDIM'

export type CourseType = 'ZORUNLU' | 'SECMELI'

/** Secmeli havuzunun kapsami: o donemin havuzu mu, her donem alinabilir mi. */
export type PoolScope = 'term' | 'any'

/** Katalogdan gelen, kullanici verisi icermeyen ders kaydi. */
export interface CatalogCourse {
    /** "<programId>:<ders kodu>". Kalici, uuid degil. */
    id: string
    code: string
    name: string
    /** Mantik icin normalize edilmis tur. */
    type: CourseType
    /** Katalogdaki birebir tur metni: "TEKNIK SECMELI", "ERASMUS", "STAJ"... */
    rawType: string
    /** G / B / H / Z (Guz, Bahar, Her ikisi, doktora bloklari) */
    offered: string
    /** Teorik saat */
    t: number
    /** Uygulama saati */
    u: number
    /** Laboratuvar saati */
    l: number
    /** t + (u + l) / 2, yonetmelik MADDE 33 */
    credit: number
    /** AKTS */
    ects: number
    /** Donem veya yil numarasi. Doktora programlarinda null. */
    term: number | null
    termUnit: 'Donem' | 'Yil' | null
    termLabel: string
    /** Secmeli havuzundan mi geliyor */
    elective: boolean
    /** Havuz dersiyse kapsami; degilse null. */
    poolScope: PoolScope | null
    detail: string
}

/**
 * Katalogun bir donem icin verdigi hedefler.
 *
 * `electiveEcts` ham secmeli AKTS'si DEGIL, isaretli bir duzeltmedir:
 *   requiredEcts + electiveEcts = totalEcts
 * Negatif olabilir, cunku bazi programlar zorunlu blokta alternatif dersleri
 * (orn. Almanca/Fransizca/Ingilizce dil dersinin ucunu birden) listeler ama
 * ogrenci yalnizca birini alir.
 */
export interface TermRequirement {
    term: number
    unit: 'Donem' | 'Yil'
    requiredEcts: number
    electiveEcts: number
    totalEcts: number | null
}

/** Kullanici verisi eklenmis ders. */
export interface Course extends CatalogCourse {
    grade: Grade
    status: CourseStatus
    /** Secmeli havuzundan mufredata eklendiyse true. */
    added?: boolean
}

export interface ProgramMeta {
    id: string
    name: string
    faculty: string
    department: string
    level: string
    levelLabel: string
    courseCount: number
}

export interface ProgramData {
    id: string
    name: string
    faculty: string
    department: string
    level: string
    levelLabel: string
    catalogYear: string
    /** Katalogun donem hedefleri. */
    terms: TermRequirement[]
    /** Programin resmi toplam AKTS'si (lisansta genelde 240). */
    totalEcts: number
    courses: CatalogCourse[]
}

export interface CatalogIndex {
    catalogYear: string
    source: string
    programs: ProgramMeta[]
}

export interface Stats {
    gpa: number
    gpaCredits: number
    gpaPoints: number
    totalCredits: number
    completedCredits: number
    /** Programin resmi hedefi (katalogdan); yoksa plandaki derslerin toplami. */
    totalEcts: number
    /** Ogrencinin planina aldigi derslerin AKTS toplami. */
    plannedEcts: number
    earnedEcts: number
    /** Henuz secilmemis secmeli AKTS. */
    missingElectiveEcts: number
    passedCourses: number
    failedCourses: number
    activeCourses: number
    remainingCourses: number
    successRate: number
}

/** Kullanicinin bir derse girdigi veri. Katalog alanlari burada tutulmaz. */
export interface CourseProgress {
    grade: Grade
    status: CourseStatus
    /** Secmeli havuzundan mufredata eklendi mi. */
    added?: boolean
}

/** Katalog verisi + kullanici girdisi birlestirilmis program. */
export interface SavedProgram {
    id: string
    name: string
    faculty: string
    department: string
    levelLabel: string
    terms: TermRequirement[]
    totalEcts: number
    courses: Course[]
}

export interface CourseState {
    activeProgramId: string | null
    programs: SavedProgram[]
    stats: Stats
    /** Katalogdan tazeleme suruyor mu. */
    loading: boolean
}

export interface RootState {
    course: CourseState
}
