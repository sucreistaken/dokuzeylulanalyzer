/**
 * Embed (iframe) modu.
 *
 * Arac dokuzeylul.net/ders-analizi altinda bir iframe icinde de calisiyor.
 * Orada sayfa duzeni farkli olmali: ozet cubugu alta degil sola gelir ve
 * arac kendi yuksekligini ust pencereye bildirir.
 */

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
        window.parent.postMessage({ source: 'deu-ders-analiz', height: h }, '*')
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
