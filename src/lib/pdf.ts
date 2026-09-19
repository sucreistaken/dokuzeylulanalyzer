/**
 * pdfjs sarmalayicisi.
 *
 * pdfjs DINAMIK import ediliyor: ana paket zaten ~1.1 MB, pdfjs yalnizca
 * transkript yukleyen kullaniciya insin. Bu dosyayi statik import etmeyin.
 *
 * PDF hicbir yere gonderilmez; tamamen tarayicida, ArrayBuffer uzerinde islenir.
 */

import type { TranscriptPage, TranscriptWord } from './transcript'

/**
 * PDF'ten kelime + koordinat akisi cikarir.
 *
 * pdfjs `getTextContent()` item'lari kelime degil "text run" dondurur ve y
 * eksenini asagidan yukari verir. Transkript ayristiricisi yukaridan asagi
 * ve kelime bazli calistigi icin ikisi de burada cevriliyor.
 */
export async function extractWords(file: File): Promise<TranscriptPage[]> {
    const pdfjs = await import('pdfjs-dist')

    // Worker'i ayri chunk olarak yukle. Vite `?url` ile dosya yolunu verir.
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

    const data = await file.arrayBuffer()
    const doc = await pdfjs.getDocument({ data }).promise

    const pages: TranscriptPage[] = []
    try {
        for (let index = 1; index <= doc.numPages; index += 1) {
            const page = await doc.getPage(index)
            const viewport = page.getViewport({ scale: 1 })
            const content = await page.getTextContent()

            const words: TranscriptWord[] = []
            for (const item of content.items) {
                if (!('str' in item)) continue
                const text = item.str.trim()
                if (!text) continue

                // transform = [a, b, c, d, e, f]; e/f konum, d yazi yuksekligi.
                const [, , , scaleY, x, yFromBottom] = item.transform as number[]
                const height = Math.abs(scaleY) || item.height

                // Bir text run birden fazla kelime icerebilir. Ayristirici
                // kelime bazli oldugu icin genisligi orantili bolusturuyoruz.
                const parts = item.str.split(/(\s+)/)
                const totalLength = item.str.length || 1
                let cursor = 0

                for (const part of parts) {
                    const partWidth = (item.width * part.length) / totalLength
                    const trimmed = part.trim()
                    if (trimmed) {
                        words.push({
                            x: x + cursor,
                            // pdfjs y'yi asagidan olcer, ayristirici yukaridan bekler.
                            y: viewport.height - yFromBottom - height,
                            w: partWidth,
                            h: height,
                            text: trimmed,
                        })
                    }
                    cursor += partWidth
                }
            }

            pages.push({ width: viewport.width, height: viewport.height, words })
            page.cleanup()
        }
    } finally {
        await doc.destroy()
    }

    return pages
}
