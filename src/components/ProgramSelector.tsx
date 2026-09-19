import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Card, Col, Modal, Row, Select, Space, Spin, Tag, message } from 'antd'
import { useDispatch, useSelector } from 'react-redux'
import { loadIndex, loadProgram } from '../lib/catalog'
import { addProgram, removeProgram, setActiveProgram } from '../store/courseSlice'
import type { CatalogIndex, ProgramMeta, RootState } from '../types'

/**
 * Program secimi.
 *
 * Kaynak uygulamada iki kademeli (fakulte > bolum) bir secim vardi. DEU
 * katalogunda 4 seviye ve 650+ program var, ayrica agac derinligi fakulteye
 * gore degisiyor: bazi fakultelerde program dogrudan fakulte altinda, bazilarinda
 * arada bir bolum katmani var. Bu yuzden seviye ve fakulte birer filtre,
 * program ise aranabilir tek bir listedir.
 */
const ProgramSelector: React.FC = () => {
    const dispatch = useDispatch()
    const { programs, activeProgramId } = useSelector((s: RootState) => s.course)

    const [index, setIndex] = useState<CatalogIndex | null>(null)
    const [indexError, setIndexError] = useState<string | null>(null)
    const [level, setLevel] = useState<string | null>('lisans')
    const [faculty, setFaculty] = useState<string | null>(null)
    const [loadingProgram, setLoadingProgram] = useState(false)
    const [pendingRemoval, setPendingRemoval] = useState<string | null>(null)

    useEffect(() => {
        loadIndex()
            .then(setIndex)
            .catch((err: Error) => setIndexError(err.message))
    }, [])

    const levels = useMemo(() => {
        if (!index) return []
        const seen = new Map<string, string>()
        for (const p of index.programs) seen.set(p.level, p.levelLabel)
        return [...seen.entries()].map(([value, label]) => ({ value, label }))
    }, [index])

    const faculties = useMemo(() => {
        if (!index || !level) return []
        const set = new Set<string>()
        for (const p of index.programs) {
            if (p.level === level) set.add(p.faculty)
        }
        return [...set].sort((a, b) => a.localeCompare(b, 'tr'))
    }, [index, level])

    const options = useMemo(() => {
        if (!index || !level) return []

        const filtered = index.programs.filter(
            (p) => p.level === level && (!faculty || p.faculty === faculty),
        )

        // Bolum katmani fakulteden farkliysa gruplama olarak kullanilir.
        const groups = new Map<string, ProgramMeta[]>()
        for (const p of filtered) {
            const key = p.department && p.department !== p.faculty ? p.department : p.faculty
            const bucket = groups.get(key)
            if (bucket) bucket.push(p)
            else groups.set(key, [p])
        }

        return [...groups.entries()]
            .sort((a, b) => a[0].localeCompare(b[0], 'tr'))
            .map(([label, items]) => ({
                label,
                options: items
                    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
                    .map((p) => ({
                        value: p.id,
                        label: `${p.name} (${p.courseCount} ders)`,
                    })),
            }))
    }, [index, level, faculty])

    const handleSelect = async (programId: string) => {
        if (programs.some((p) => p.id === programId)) {
            dispatch(setActiveProgram(programId))
            return
        }

        setLoadingProgram(true)
        try {
            const data = await loadProgram(programId)
            dispatch(addProgram(data))
            message.success(`${data.name} eklendi`)
        } catch (err) {
            message.error((err as Error).message)
        } finally {
            setLoadingProgram(false)
        }
    }

    const confirmRemoval = () => {
        if (!pendingRemoval) return
        const removed = programs.find((p) => p.id === pendingRemoval)
        dispatch(removeProgram(pendingRemoval))
        message.success(`${removed?.name ?? 'Program'} kaldirildi`)
        setPendingRemoval(null)
    }

    if (indexError) {
        return (
            <Alert
                type="error"
                showIcon
                message="Katalog yuklenemedi"
                description={indexError}
            />
        )
    }

    if (!index) {
        return (
            <div className="flex flex-col items-center gap-3 py-8">
                <Spin />
                <span className="text-sm text-gray-500">Katalog yukleniyor...</span>
            </div>
        )
    }

    const pendingProgram = programs.find((p) => p.id === pendingRemoval)

    return (
        <div className="space-y-4">
            <Row gutter={[16, 16]}>
                <Col xs={24} md={6}>
                    <div className="mb-1 text-sm text-gray-600">Ogrenim duzeyi</div>
                    <Select
                        className="w-full"
                        placeholder="Duzey secin"
                        value={level}
                        options={levels}
                        onChange={(value) => {
                            setLevel(value)
                            setFaculty(null)
                        }}
                    />
                </Col>
                <Col xs={24} md={8}>
                    <div className="mb-1 text-sm text-gray-600">Fakulte / Yuksekokul</div>
                    <Select
                        className="w-full"
                        placeholder="Tumu"
                        value={faculty}
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        options={faculties.map((f) => ({ value: f, label: f }))}
                        onChange={(value) => setFaculty(value ?? null)}
                        disabled={!level}
                    />
                </Col>
                <Col xs={24} md={10}>
                    <div className="mb-1 text-sm text-gray-600">Program</div>
                    <Select
                        className="w-full"
                        placeholder="Program adi yazarak arayin"
                        value={null}
                        showSearch
                        optionFilterProp="label"
                        loading={loadingProgram}
                        options={options}
                        onChange={handleSelect}
                        disabled={!level}
                        notFoundContent="Eslesen program yok"
                    />
                </Col>
            </Row>

            {programs.length > 0 && (
                <div>
                    <div className="mb-2 text-sm text-gray-600">
                        Eklenen programlar (gecis yapmak icin tiklayin)
                    </div>
                    <Space size={[0, 8]} wrap>
                        {programs.map((p) => (
                            <Tag
                                key={p.id}
                                color={p.id === activeProgramId ? 'blue' : 'default'}
                                className="cursor-pointer"
                                style={{ padding: '6px 10px', margin: 4 }}
                                closable
                                onClick={() => dispatch(setActiveProgram(p.id))}
                                onClose={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setPendingRemoval(p.id)
                                }}
                            >
                                {p.name}
                                <span className="ml-2 text-xs opacity-70">{p.levelLabel}</span>
                            </Tag>
                        ))}
                    </Space>
                </div>
            )}

            <Card size="small" className="bg-gray-50">
                <div className="text-xs text-gray-500">
                    Veri kaynagi: DEU Ders Katalogu {index.catalogYear}. Notlariniz yalnizca
                    bu tarayicida saklanir, sunucuya gonderilmez.
                </div>
            </Card>

            <Modal
                title="Programi kaldir"
                open={pendingRemoval !== null}
                onOk={confirmRemoval}
                onCancel={() => setPendingRemoval(null)}
                okText="Kaldir"
                cancelText="Vazgec"
                okButtonProps={{ danger: true }}
            >
                <p>
                    {pendingProgram?.name} programini kaldirmak istediginize emin misiniz?
                    Bu programa girdiginiz tum notlar silinir ve geri alinamaz.
                </p>
            </Modal>
        </div>
    )
}

export default ProgramSelector
