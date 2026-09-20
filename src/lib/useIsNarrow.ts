import { useEffect, useState } from 'react'

/**
 * Dar ekran mi? Tabloyu kart listesine cevirmek icin kullanilir.
 *
 * Kirilma noktasi 768px: olctugumuz kadariyla ders tablosu 700px istiyor,
 * 768px'te ancak 42px tasiyor, altinda ise kullanilamaz hale geliyor.
 */
export const useIsNarrow = (esik = 768): boolean => {
    const [dar, setDar] = useState(() => {
        if (typeof window === 'undefined') return false
        return window.matchMedia(`(max-width: ${esik}px)`).matches
    })

    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${esik}px)`)
        const degisti = (e: MediaQueryListEvent) => setDar(e.matches)
        mq.addEventListener('change', degisti)
        setDar(mq.matches)
        return () => mq.removeEventListener('change', degisti)
    }, [esik])

    return dar
}
