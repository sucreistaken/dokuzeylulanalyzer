import React, { useEffect, useRef, useState } from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'

/**
 * "Sağa kaydır" ipucu.
 *
 * Kırılma noktası tahmin etmek yerine tablonun gerçekten taşıp taşmadığını
 * ölçer: aynı tablo geniş ekranda sığarken forum içindeki dar sütunda kayıyor.
 * Kullanıcı bir kez kaydırınca ipucu kaybolur, tekrar tekrar göze batmaz.
 */
const ScrollHint: React.FC<{ children: React.ReactNode; metin: string }> = ({
    children,
    metin,
}) => {
    const kutu = useRef<HTMLDivElement>(null)
    const [tasiyor, setTasiyor] = useState(false)
    const [kaydirildi, setKaydirildi] = useState(false)

    useEffect(() => {
        const kok = kutu.current
        if (!kok) return

        // antd tabloyu kendi iç kabında kaydırır.
        const alan = kok.querySelector<HTMLElement>('.ant-table-body, .ant-table-content')
        if (!alan) return

        const olc = () => setTasiyor(alan.scrollWidth - alan.clientWidth > 8)
        olc()

        const ro = new ResizeObserver(olc)
        ro.observe(alan)

        const kaydirinca = () => {
            if (alan.scrollLeft > 8) setKaydirildi(true)
        }
        alan.addEventListener('scroll', kaydirinca, { passive: true })

        return () => {
            ro.disconnect()
            alan.removeEventListener('scroll', kaydirinca)
        }
    }, [children])

    return (
        <div ref={kutu}>
            {tasiyor && !kaydirildi && (
                <div className="mb-1 flex items-center justify-end gap-1 pr-1 text-xs text-gray-400">
                    <span>{metin}</span>
                    <ArrowRightOutlined />
                </div>
            )}
            {children}
        </div>
    )
}

export default ScrollHint
