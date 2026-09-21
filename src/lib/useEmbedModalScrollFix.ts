import { useEffect } from 'react'
import { isEmbedded, requestScrollIntoView } from './embed'

/** AntD'nin her modal/onay penceresinin kok elemanina verdigi sinif. */
const MODAL_ROOT_SELECTOR = '.ant-modal-root'

/**
 * Embed modda acilan her modal/onay penceresi icin ust pencereden iframe'i
 * gorunum alanina kaydirmasini ister (bkz. embed.ts: requestScrollIntoView).
 *
 * Neden tek tek her modal yerine burada: AntD'nin butun modal ve
 * Modal.confirm cagrilari, acilista `.ant-modal-root` sinifiyla bir kok
 * eleman ekliyor. Bu eklemeyi tek bir yerden izlemek, her yeni modal
 * cagrisinda ayri ayri kaydirma kodu yazmayi (ve unutmayi) onluyor.
 *
 * rc-component portali, modal kok elemanini icinde barindiran bos bir
 * sarmalayici div'i, icerigi zaten hazirken tek seferde document.body'ye
 * ekliyor. Yani `.ant-modal-root` body'nin eklenen dogrudan cocugu degil,
 * o cocugun icinde HAZIR gelen bir torun; eklenen dugumun kendisini degil,
 * altini da (subtree) kontrol etmek gerekiyor.
 */
export const useEmbedModalScrollFix = (): void => {
    useEffect(() => {
        if (!isEmbedded()) return

        const addsModalRoot = (node: Node): boolean => {
            if (!(node instanceof HTMLElement)) return false
            return node.matches(MODAL_ROOT_SELECTOR) || node.querySelector(MODAL_ROOT_SELECTOR) !== null
        }

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (addsModalRoot(node)) {
                        requestScrollIntoView()
                        return
                    }
                }
            }
        })
        observer.observe(document.body, { childList: true, subtree: true })
        return () => observer.disconnect()
    }, [])
}
