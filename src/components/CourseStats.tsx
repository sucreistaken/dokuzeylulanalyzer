import React, { useMemo } from 'react'
import { Card, Col, Progress, Row, Statistic, Tag, Tooltip } from 'antd'
import { useSelector } from 'react-redux'
import {
    BookOutlined,
    CheckCircleOutlined,
    CheckSquareOutlined,
    CloseCircleOutlined,
    ExceptionOutlined,
    HourglassOutlined,
    PercentageOutlined,
    TrophyOutlined,
} from '@ant-design/icons'
import { honorLabel } from '../lib/grades'
import type { RootState } from '../types'

const CourseStats: React.FC = () => {
    const { stats, programs, activeProgramId } = useSelector(
        (s: RootState) => s.course,
    )
    const active = programs.find((p) => p.id === activeProgramId)

    const items = useMemo(
        () => [
            {
                title: 'GANO',
                value: stats.gpa,
                precision: 2,
                icon: <TrophyOutlined />,
                color: '#3f8600',
                tooltip:
                    'Genel not ortalamasi. Yerel kredi ile agirliklandirilir: ' +
                    'Toplam(kredi x katsayi) / Toplam(kredi). ' +
                    'B, M, Y, D, E notlari ortalamaya girmez.',
            },
            {
                title: 'Ortalamaya Giren Kredi',
                value: stats.gpaCredits,
                icon: <CheckSquareOutlined />,
                color: '#3f8600',
                tooltip:
                    'Harf notu alinmis derslerin kredi toplami. Transkriptteki "Toplam Kredi".',
            },
            {
                title: 'Mufredat Kredisi',
                value: stats.totalCredits,
                icon: <BookOutlined />,
                tooltip:
                    'Programdaki tum derslerin kredi toplami. Kredi = T + (U + L) / 2.',
            },
            {
                title: 'Kazanilan AKTS',
                value: stats.earnedEcts,
                suffix: `/ ${stats.totalEcts}`,
                icon: <CheckCircleOutlined />,
                color: '#096dd9',
                tooltip:
                    'Basariyla tamamlanan derslerin AKTS toplami. Payda katalogun ' +
                    'resmi mezuniyet hedefidir (lisansta genelde 240).',
            },
            {
                title: 'Secilmemis AKTS',
                value: stats.missingElectiveEcts,
                icon: <ExceptionOutlined />,
                color: stats.missingElectiveEcts > 0 ? '#d46b08' : '#3f8600',
                tooltip:
                    'Mezuniyet hedefi ile planiniza aldiginiz dersler arasindaki fark. ' +
                    'Eksikse ilgili donemlerden secmeli ders secmelisiniz.',
            },
            {
                title: 'Gecilen Ders',
                value: stats.passedCourses,
                icon: <CheckCircleOutlined />,
                color: '#3f8600',
                tooltip: 'Basariyla tamamlanan ders sayisi (B ve M dahil).',
            },
            {
                title: 'Kalinan Ders',
                value: stats.failedCourses,
                icon: <CloseCircleOutlined />,
                color: '#cf1322',
                tooltip: 'FD, FF, Y veya D notu alinan ders sayisi.',
            },
            {
                title: 'Alinan Ders',
                value: stats.activeCourses,
                icon: <HourglassOutlined />,
                color: '#d46b08',
                tooltip: 'Su anda devam edilen ders sayisi.',
            },
            {
                title: 'Kalan Ders',
                value: stats.remainingCourses,
                icon: <ExceptionOutlined />,
                color: '#eb2f96',
                tooltip: 'Henuz alinmamis ders sayisi.',
            },
            {
                title: 'Basari Orani',
                value: stats.successRate,
                precision: 1,
                suffix: '%',
                icon: <PercentageOutlined />,
                color: '#1890ff',
                tooltip:
                    'Gecilen / (gecilen + kalinan). Hic ders tamamlanmadiysa 0 gosterilir.',
            },
        ],
        [stats],
    )

    const honor = honorLabel(stats.gpa)
    const ectsPercent =
        stats.totalEcts > 0
            ? Math.round((stats.earnedEcts / stats.totalEcts) * 100)
            : 0

    return (
        <div className="space-y-4">
            {active && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-base font-semibold text-gray-800">
                            {active.name}
                        </div>
                        <div className="text-xs text-gray-500">
                            {active.faculty}
                            {active.department !== active.faculty && ` / ${active.department}`}
                        </div>
                    </div>
                    {honor && stats.gpaCredits > 0 && (
                        <Tag color={stats.gpa >= 3.5 ? 'gold' : 'green'}>
                            {honor} ogrencisi
                        </Tag>
                    )}
                </div>
            )}

            <div>
                <div className="mb-1 flex justify-between text-xs text-gray-500">
                    <span>AKTS ilerlemesi</span>
                    <span>
                        {stats.earnedEcts} / {stats.totalEcts} AKTS
                    </span>
                </div>
                <Progress
                    percent={ectsPercent}
                    status={ectsPercent >= 100 ? 'success' : 'active'}
                    strokeColor={{ from: '#1890ff', to: '#52c41a' }}
                />
            </div>

            <Row gutter={[16, 16]}>
                {items.map((item) => (
                    <Col xs={12} sm={12} md={8} lg={6} key={item.title}>
                        <Tooltip title={item.tooltip}>
                            <Card className="text-center shadow transition-shadow duration-300 hover:shadow-xl">
                                <div className="mb-2 flex items-center justify-center">
                                    <span className="text-xl" style={{ color: item.color }}>
                                        {item.icon}
                                    </span>
                                </div>
                                <Statistic
                                    title={item.title}
                                    value={item.value}
                                    precision={item.precision}
                                    suffix={item.suffix}
                                    valueStyle={{ color: item.color, fontSize: 22 }}
                                />
                            </Card>
                        </Tooltip>
                    </Col>
                ))}
            </Row>
        </div>
    )
}

export default React.memo(CourseStats)
