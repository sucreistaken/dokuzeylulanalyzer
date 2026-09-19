import type { Middleware } from '@reduxjs/toolkit'
import { saveState } from '../../lib/storage'
import { selectProgress } from '../courseSlice'
import type { RootState } from '../../types'

const DEBOUNCE_MS = 300

/**
 * Durumu localStorage'a yazar.
 *
 * Kaynak uygulamadaki firebaseSync middleware'i her action'da tam dokumani
 * uzak veritabanina yaziyordu. Burada hedef localStorage olsa da ayni sorun
 * gecerli: her tus vurusunda JSON.stringify calistirmak buyuk mufredatlarda
 * gorunur gecikme yaratir. Bu yuzden debounce ediliyor.
 */
export const persistMiddleware: Middleware = (store) => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const flush = () => {
        const state = store.getState() as RootState
        try {
            saveState({
                activeProgramId: state.course.activeProgramId,
                progress: selectProgress(state.course),
            })
        } catch (err) {
            // Kota dolmasi en olasi hata. Sessizce yutmak veri kaybini gizler.
            console.error('Veri kaydedilemedi:', err)
        }
    }

    // Sekme kapanirken bekleyen yazma varsa kaybolmasin.
    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => {
            if (timer) {
                clearTimeout(timer)
                timer = null
                flush()
            }
        })
    }

    return (next) => (action) => {
        const result = next(action)

        if (typeof action === 'object' && action !== null && 'type' in action) {
            const type = (action as { type: string }).type
            // hydrate zaten diskten geldi, setLoading kullanici verisi degil.
            const skip = type === 'course/hydrate' || type === 'course/setLoading'
            if (type.startsWith('course/') && !skip) {
                if (timer) clearTimeout(timer)
                timer = setTimeout(() => {
                    timer = null
                    flush()
                }, DEBOUNCE_MS)
            }
        }

        return result
    }
}
