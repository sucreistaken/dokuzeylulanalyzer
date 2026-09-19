/**
 * DEU not sistemi. Tek dogruluk kaynagi.
 *
 * Kaynaklar:
 *  - Onlisans ve Lisans Ogretim ve Sinav Yonetmeligi MADDE 26 (harf notu katsayilari)
 *  - Ayni yonetmelik MADDE 33 (kredi tanimi)
 *  - Ogrenci transkripti (hesap yontemi birebir dogrulandi, bkz. grades.test.ts)
 *
 * Kritik nokta: ortalama AKTS ile degil, YEREL KREDI ile hesaplanir.
 * Kredi = teorik saat + (uygulama + laboratuvar) / 2
 */

import type { Course, CourseStatus, Grade, Stats } from '../types'

/** Ortalamaya giren harf notlari ve katsayilari. */
export const GRADE_POINTS: Record<string, number> = {
    AA: 4.0,
    BA: 3.5,
    BB: 3.0,
    CB: 2.5,
    CC: 2.0,
    DC: 1.5,
    DD: 1.0,
    FD: 0.5,
    FF: 0.0,
}

/**
 * Ortalamaya girmeyen notlar. Transkript lejantindan alindi.
 * Bunlarin kredisi ortalama paydasina yazilmaz ama AKTS'si sayilabilir.
 */
export const NON_GPA_GRADES: Record<string, string> = {
    B: 'Basarili',
    M: 'Muaf',
    Y: 'Yetersiz',
    D: 'Devamsiz',
    E: 'Eksik Not',
}

/** Not seciminde gosterilecek siralama. */
export const GRADE_OPTIONS: Grade[] = [
    'NA',
    'AA', 'BA', 'BB', 'CB', 'CC', 'DC', 'DD', 'FD', 'FF',
    'B', 'M', 'Y', 'D', 'E',
]

/** FD ve FF basarisiz sayilir (yonetmelik MADDE 26). */
export const FAILING_GRADES: Grade[] = ['FD', 'FF', 'Y', 'D']

export const isGraded = (grade: Grade): boolean =>
    Object.prototype.hasOwnProperty.call(GRADE_POINTS, grade)

export const isFailing = (grade: Grade): boolean =>
    FAILING_GRADES.includes(grade)

/**
 * Basarili sayilan ama ortalamaya girmeyen notlar (B, M) da gecmis kabul edilir.
 */
export const isPassed = (grade: Grade): boolean =>
    (isGraded(grade) && !isFailing(grade)) || grade === 'B' || grade === 'M'

/** Yonetmelik MADDE 33. Katalogdaki t/u/l degerlerinden hesaplanir. */
export const localCredit = (t: number, u: number, l: number): number =>
    t + (u + l) / 2

/** 3.14999 -> 3.15. Transkript iki basamak gosteriyor. */
export const round2 = (value: number): number =>
    Math.round((value + Number.EPSILON) * 100) / 100

export interface GpaResult {
    /** Ortalamaya giren derslerin kredi toplami (transkriptte "Toplam Kredi"). */
    credits: number
    /** Sum(kredi * katsayi) (transkriptte "Kredi*Bas.Notu"). */
    points: number
    /** points / credits, iki basamak. */
    gpa: number
}

/**
 * Agirlikli ortalama. Yalnizca harf notu olan dersler sayilir;
 * B/M/Y/D/E ve alinmamis dersler paya da paydaya da girmez.
 */
export function calculateGpa(courses: Course[]): GpaResult {
    let credits = 0
    let points = 0

    for (const course of courses) {
        if (!isGraded(course.grade)) continue
        credits += course.credit
        points += course.credit * GRADE_POINTS[course.grade]
    }

    return {
        credits: round2(credits),
        points: round2(points),
        gpa: credits > 0 ? round2(points / credits) : 0,
    }
}

/**
 * Ogrencinin aktif mufredatindaki dersler icin ozet istatistik.
 * Kaynak uygulamadaki NaN uretme hatasi burada tekrarlanmiyor: her bolme
 * paydasi kontrol ediliyor.
 *
 * `programTotalEcts` katalogun resmi hedefidir (lisansta genelde 240). Verilirse
 * ilerleme bunun uzerinden hesaplanir; verilmezse plandaki derslerin toplami
 * kullanilir. Ikisi ayri tutuluyor cunku ogrenci secmelilerini secmeden once
 * plani hedeften kucuk olur ve payda yanlis gorunurdu.
 */
export function calculateStats(
    courses: Course[],
    programTotalEcts?: number,
): Stats {
    const { credits, points, gpa } = calculateGpa(courses)

    let plannedEcts = 0
    let earnedEcts = 0
    let totalCredits = 0
    let passed = 0
    let failed = 0
    let active = 0
    let remaining = 0

    for (const course of courses) {
        plannedEcts += course.ects
        totalCredits += course.credit

        if (course.status === 'ALINIYOR') {
            active += 1
            continue
        }

        if (isPassed(course.grade)) {
            passed += 1
            earnedEcts += course.ects
        } else if (isFailing(course.grade)) {
            failed += 1
        } else {
            remaining += 1
        }
    }

    const attempted = passed + failed
    const totalEcts =
        programTotalEcts && programTotalEcts > 0 ? programTotalEcts : plannedEcts

    return {
        gpa,
        gpaCredits: credits,
        gpaPoints: points,
        totalCredits: round2(totalCredits),
        completedCredits: credits,
        totalEcts,
        plannedEcts,
        earnedEcts,
        // Ogrencinin henuz plana almadigi (secmedigi) AKTS.
        missingElectiveEcts: Math.max(0, totalEcts - plannedEcts),
        passedCourses: passed,
        failedCourses: failed,
        activeCourses: active,
        remainingCourses: remaining,
        successRate: attempted > 0 ? round2((passed / attempted) * 100) : 0,
    }
}

/**
 * Yonetmelik: GNO 3.00-3.49 onur, 3.50-4.00 yuksek onur.
 * Yalnizca bilgilendirme amacli gosterilir.
 */
export function honorLabel(gpa: number): string | null {
    if (gpa >= 3.5) return 'Yuksek Onur'
    if (gpa >= 3.0) return 'Onur'
    return null
}

export const STATUS_OPTIONS: CourseStatus[] = ['ALMADIM', 'ALINIYOR', 'ALDIM']
