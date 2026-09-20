import React from 'react'
import { Tag } from 'antd'
import { useSelector } from 'react-redux'
import { TrophyOutlined } from '@ant-design/icons'
import { honorLabel } from '../lib/grades'
import { isEmbedded } from '../lib/embed'
import type { RootState } from '../types'

/**
 * Ozet cubugu: GANO ve kazanilan AKTS her not degisikliginde aninda guncellenir,
 * kullanici asagi kaydirsa bile gorunur kalir. Aktif program yoksa gizlenir.
 *
 * Iki yerlesim var:
 *  - tek basina calisirken sayfanin altina yapisan yatay cubuk,
 *  - forum icinde (embed) soldaki dikey ray. Forum zaten kendi ust serididir,
 *    alttaki yatay cubuk orada icerigin uzerine binip dar gorunuyordu.
 */
const SummaryBar: React.FC = () => {
    const { stats, programs, activeProgramId } = useSelector((s: RootState) => s.course)
    const active = programs.find((p) => p.id === activeProgramId)

    if (!active) return null

    const embedded = isEmbedded()
    const honor = honorLabel(stats.gpa)
    const ectsPercent =
        stats.totalEcts > 0
            ? Math.round((stats.earnedEcts / stats.totalEcts) * 100)
            : 0

    const metric = (label: string, value: React.ReactNode, color?: string) => (
        <div className="flex flex-col leading-tight">
            <span className="text-[11px] uppercase tracking-wide text-gray-400">{label}</span>
            <span className="text-lg font-semibold" style={color ? { color } : undefined}>
                {value}
            </span>
        </div>
    )

    const honorTag = honor && stats.gpaCredits > 0 && (
        <Tag icon={<TrophyOutlined />} color={stats.gpa >= 3.5 ? 'gold' : 'green'}>
            {honor} öğrencisi
        </Tag>
    )

    const metrics = (
        <>
            {metric('GANO', stats.gpaCredits > 0 ? stats.gpa.toFixed(2) : '-', '#3f8600')}
            {metric(
                'Kazanılan AKTS',
                <>
                    {stats.earnedEcts}
                    <span className="text-sm font-normal text-gray-400"> / {stats.totalEcts}</span>
                    <span className="ml-1 text-xs font-normal text-gray-400">({ectsPercent}%)</span>
                </>,
                '#096dd9',
            )}
            {metric('Geçilen Ders', stats.passedCourses, '#3f8600')}
            {metric('Kalan Ders', stats.remainingCourses, '#eb2f96')}
        </>
    )

    if (embedded) {
        // Sol dikey ray. Dar ekranda yer kalmadigi icin alta dusurulur.
        return (
            <div
                className="fixed left-0 top-0 z-50 hidden h-full w-[168px] flex-col gap-5 overflow-y-auto border-r border-gray-200 bg-white/95 px-4 py-5 backdrop-blur lg:flex"
                data-testid="summary-rail"
            >
                <div className="truncate text-sm font-medium text-gray-700" title={active.name}>
                    {active.name}
                </div>
                {metrics}
                {honorTag}
            </div>
        )
    }

    return (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 shadow-[0_-2px_12px_rgba(0,0,0,0.08)] backdrop-blur">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-2.5 md:px-6">
                <div className="mr-2 hidden max-w-[220px] truncate text-sm font-medium text-gray-700 md:block">
                    {active.name}
                </div>
                {metrics}
                {honorTag && <div className="ml-auto">{honorTag}</div>}
            </div>
        </div>
    )
}

export default SummaryBar
