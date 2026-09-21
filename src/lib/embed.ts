/**
 * Embed (iframe) modu.
 *
 * Arac dokuzeylul.net/ders-analizi altinda bir iframe icinde de calisiyor.
 * Orada iki sey farkli:
 *  - arac kendi yuksekligini ust pencereye bildirir, ust taraf iframe'i buna
 *    gore boyutlandirir;
 *  - ozet metrikleri de ust pencereye gonderilir. Ust pencere "ben cizerim"
 *    derse ozet cubugunu biz gizleriz: iframe icindeki position:fixed
 *    iframe'in kendi gorus alanina gore konumlandigi icin, uzun bir iframe'de
 *    kullanici sayfayi kaydirinca cubuk yukarida kalip kayboluyor. Ust
 *    penceredeki fixed ise gercek ekrana yapisir.
 */

export const TOOL_ORIGIN_TAG = 'deu-ders-analiz'

/** Ust pencerenin ozet cubugunu kendisi cizdigini bildiren mesaj. */
export const HOST_RAIL_MESSAGE = 'deu-forum:summary-rail'

/** URL'de ?embed=1 varsa ya da gercekten bir iframe icindeysek embed moddayiz. */
export const isEmbedded = (): boolean => {
    try {
        const flag = new URLSearchParams(window.location.search).get('embed')
        if (flag === '1' || flag === 'true') return true
        return window.self !== window.top
    } catch {
        // Cross-origin erisim hatasi zaten iframe icinde oldugumuz anlamina gelir.
        return true
    }
}

/** Ust pencereye gonderilen ozet. Alanlar SummaryBar'daki ile birebir. */
export interface EmbedSummary {
    programName: string
    gpa: string
    earnedEcts: number
    totalEcts: number
    ectsPercent: number
    passedCourses: number
    remainingCourses: number
    honor: string | null
}

const post = (payload: Record<string, unknown>) => {
    try {
        window.parent.postMessage({ source: TOOL_ORIGIN_TAG, ...payload }, '*')
    } catch {
        // Ust pencere yoksa ya da engelliyorsa sessizce gec.
    }
}

/** Ozet metrikleri ust pencereye gonderir. */
export const sendSummaryToParent = (summary: EmbedSummary | null): void => {
    if (!isEmbedded()) return
    post({ summary })
}

/**
 * Ust pencerenin ozet cubugunu cizip cizmedigini dinler.
 *
 * @param onHostRail ust pencere "ben cizerim" dediginde cagrilir
 * @returns dinleyiciyi sokup temizleyen fonksiyon
 */
export const listenForHostRail = (onHostRail: () => void): (() => void) => {
    if (!isEmbedded()) return () => {}
    const handler = (ev: MessageEvent) => {
        if (ev.data && ev.data.type === HOST_RAIL_MESSAGE) onHostRail()
    }
    window.addEventListener('message', handler)
    // Ust taraf bizden once hazir olabilir; varligimizi duyuralim.
    post({ ready: true })
    return () => window.removeEventListener('message', handler)
}

/**
 * Ust pencereden iframe'i gorunum alanina kaydirmasini ister.
 *
 * Neden gerekli: bir modal/onay penceresi acildiginda maskesi ve icerigi
 * position:fixed kullanir; bu da (dosya basindaki notta anlatildigi gibi)
 * iframe'in kendi gorus alanina gore konumlanir, gercek ekrana degil.
 * Kullanici sayfayi kaydirmisken bir modal acarsa, modal iframe'in
 * tepesinde -yani ekranin disinda- belirir ve fark edilmez. Bu fonksiyon
 * ust pencereden iframe'i yukari kaydirmasini istenerek modali tekrar
 * gorunur kilar.
 */
export const requestScrollIntoView = (): void => {
    if (!isEmbedded()) return
    post({ scrollIntoView: true })
}

/**
 * Icerik yuksekligini ust pencereye bildirir; ust taraf iframe'i buna gore
 * boyutlandirabilir. Ust pencere dinlemiyorsa mesaj sessizce kaybolur.
 *
 * @returns dinleyiciyi sokup temizleyen fonksiyon
 */
export const reportHeightToParent = (): (() => void) => {
    if (!isEmbedded()) return () => {}

    let last = 0
    const send = () => {
        const h = Math.ceil(document.documentElement.scrollHeight)
        // Piksel gurultusunde surekli mesaj atmayalim.
        if (Math.abs(h - last) < 24) return
        last = h
        post({ height: h })
    }

    const ro = new ResizeObserver(send)
    ro.observe(document.documentElement)
    window.addEventListener('load', send)
    const timer = window.setInterval(send, 1000)

    return () => {
        ro.disconnect()
        window.removeEventListener('load', send)
        window.clearInterval(timer)
    }
}
