/**
 * Herkese acik on kosul haritasi: /program/:id
 *
 * Giris gerektirmez, transkript gerektirmez. Amac "DEU <bolum> on kosul"
 * aramasinda cikip ogrencinin zinciri tek bakista gormesi.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, Card, Empty, Spin, Table, Tag, Typography } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import { loadProgram } from '../lib/catalog'
import { buildGraph, cascade, chainLevels, depth } from '../lib/prereq'
import type { ProgramData } from '../types'

const { Title, Paragraph } = Typography

const ProgramPrereq: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const [program, setProgram] = useState<ProgramData | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!id) return
        let cancelled = false
        setProgram(null)
        setError(null)

        loadProgram(id)
            .then((data) => {
                if (!cancelled) setProgram(data)
            })
            .catch((err: Error) => {
                if (!cancelled) setError(err.message)
            })

        return () => {
            cancelled = true
        }
    }, [id])

    const graph = useMemo(
        () => buildGraph(program?.courses ?? []),
        [program],
    )
    const levels = useMemo(() => chainLevels(graph), [graph])

    /** En cok ders kilitleyen dersler. Sayfanin asil degeri burada. */
    const risky = useMemo(
        () =>
            [...graph.dependents.keys()]
                .map((code) => ({
                    key: code,
                    code,
                    name: graph.byCode.get(code)?.name ?? code,
                    term: graph.byCode.get(code)?.term ?? null,
                    locked: cascade(graph, code).length,
                    depth: depth(graph, code),
                }))
                .sort((a, b) => b.locked - a.locked || a.code.localeCompare(b.code)),
        [graph],
    )

    if (error) {
        return (
            <Alert
                type="error"
                showIcon
                message="Program bulunamadi"
                description={error}
            />
        )
    }

    if (!program) {
        return (
            <div className="flex justify-center py-16">
                <Spin size="large" />
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-5">
            <div>
                <Title level={2} className="!mb-1">
                    {program.name} on kosullu dersler
                </Title>
                <Paragraph type="secondary" className="!mb-0">
                    {program.faculty} &middot; {program.levelLabel} &middot; DEU Ders
                    Katalogu {program.catalogYear}
                </Paragraph>
            </div>

            {risky.length === 0 ? (
                <Empty
                    description={
                        <span>
                            DEU Ders Katalogu bu programin hicbir dersinde on kosul
                            tanimlamamis. Bu, fakultenin kendi ogretim ve sinav uygulama
                            esaslarinda bir kosul olmadigi anlamina gelmez; emin olmak
                            icin danismanina sor.
                        </span>
                    }
                />
            ) : (
                <>
                    <Alert
                        type="warning"
                        showIcon
                        message={`${risky[0].code} ${risky[0].name} dersinden kalmak ${risky[0].locked} dersi kilitler`}
                        description={
                            'On kosulunu gecmediginiz dersi alamazsiniz (Ogretim ve Sinav ' +
                            'Uygulama Esaslari MADDE 6/5). FD notu basarisiz sayilir.'
                        }
                    />

                    <Card title="Kalinca en cok ders kilitleyenler" className="shadow">
                        <Table
                            size="small"
                            pagination={false}
                            dataSource={risky}
                            columns={[
                                {
                                    title: 'Ders',
                                    render: (_, r) => (
                                        <span>
                                            <b>{r.code}</b> {r.name}
                                        </span>
                                    ),
                                },
                                { title: 'Yariyil', dataIndex: 'term', width: 90 },
                                {
                                    title: 'Kilitlenen ders',
                                    dataIndex: 'locked',
                                    width: 130,
                                    render: (v: number) => (
                                        <Tag color={v >= 5 ? 'red' : v >= 2 ? 'orange' : 'blue'}>
                                            {v}
                                        </Tag>
                                    ),
                                },
                                { title: 'Zincir derinligi', dataIndex: 'depth', width: 130 },
                            ]}
                        />
                    </Card>

                    <Card title="On kosul zinciri" className="shadow">
                        <div className="mb-3 text-sm text-gray-500">
                            Soldaki dersi gecmeden sagindakini alamazsin.
                        </div>
                        <div className="flex gap-4 overflow-x-auto pb-2">
                            {levels.map((level, i) => (
                                <div key={i} className="min-w-[230px] flex-1">
                                    <div className="mb-2 text-xs font-medium uppercase text-gray-400">
                                        {i + 1}. kademe
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        {level.map((node) => (
                                            <div
                                                key={node.code}
                                                className="rounded border border-gray-200 bg-white p-2 shadow-sm"
                                            >
                                                <div className="text-sm font-semibold">
                                                    {node.code}
                                                </div>
                                                <div className="text-xs text-gray-600">
                                                    {node.name}
                                                </div>
                                                {node.term !== null && (
                                                    <div className="mt-1 text-xs text-gray-400">
                                                        {node.term}. yariyil
                                                    </div>
                                                )}
                                                {node.requires.length > 0 && (
                                                    <div className="mt-1 text-xs text-gray-500">
                                                        <ArrowRightOutlined /> on kosul:{' '}
                                                        {node.requires.join(', ')}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </>
            )}

            <Card className="shadow">
                <Paragraph className="!mb-2">
                    Kendi transkriptine gore hangi dersleri alabilecegini gormek ister misin?
                </Paragraph>
                <Link to="/">Transkriptini yukle, kisisel analizini gor</Link>
            </Card>
        </div>
    )
}

export default ProgramPrereq
