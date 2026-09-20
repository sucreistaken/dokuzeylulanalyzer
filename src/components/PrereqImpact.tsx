/**
 * "Bu dersten kalirsam ne olur" ve "su an neyi alamiyorum".
 *
 * Mantik src/lib/prereq.ts'te; bu bilesen yalnizca gosterir.
 */

import React, { useMemo, useState } from 'react'
import { Alert, Empty, Select, Space, Statistic, Table, Tag } from 'antd'
import { useSelector } from 'react-redux'
import { LockOutlined, WarningOutlined } from '@ant-design/icons'
import { isPassed } from '../lib/grades'
import {
    blockerMap,
    buildGraph,
    impactOf,
    type Blocker,
    type GradeByCode,
} from '../lib/prereq'
import type { Course, RootState } from '../types'

const BLOCKER_LABEL: Record<Blocker['kind'], string> = {
    PREREQ_FAILED: 'Ön koşuldan kaldın',
    PREREQ_MISSING: 'Ön koşulu almadın',
    GPA_FLOOR: 'GNO barajı',
}

/**
 * Ders kodu -> not. Ayni kod havuzda birden fazla satirda olabilir; gecilmis
 * olan kayit onceliklidir, yoksa ilk kayit kullanilir.
 */
function gradesByCode(courses: Course[]): GradeByCode {
    const out: GradeByCode = {}
    for (const c of courses) {
        if (out[c.code] && !isPassed(c.grade)) continue
        if (out[c.code] && isPassed(out[c.code])) continue
        out[c.code] = c.grade
    }
    return out
}

const BlockerTags: React.FC<{ items: Blocker[] }> = ({ items }) => (
    <Space size={[4, 4]} wrap>
        {items.map((b, i) => (
            <Tag
                key={i}
                color={b.severity === 'blocked' ? 'red' : 'orange'}
                icon={b.severity === 'blocked' ? <LockOutlined /> : <WarningOutlined />}
            >
                {BLOCKER_LABEL[b.kind]}
                {b.code ? `: ${b.code} ${b.name}` : ` (${b.name})`}
            </Tag>
        ))}
    </Space>
)

const PrereqImpact: React.FC = () => {
    const { programs, activeProgramId, stats } = useSelector((s: RootState) => s.course)
    const active = programs.find((p) => p.id === activeProgramId)
    const [selected, setSelected] = useState<string | null>(null)

    const courses = active?.courses ?? []

    const graph = useMemo(() => buildGraph(courses), [courses])

    const blocked = useMemo(() => {
        if (!active) return new Map<string, Blocker[]>()
        return blockerMap(courses, {
            grades: gradesByCode(courses),
            // Hic notlu ders yoksa GANO 0 gorunur; bunu "baraj altinda"
            // saymak herkese yanlis uyari verir.
            gpa: stats.gpaCredits > 0 ? stats.gpa : null,
            faculty: active.faculty,
        })
    }, [active, courses, stats.gpaCredits, stats.gpa])

    // Yalnizca bir seye onkosul olan dersler simulasyona girer.
    const options = useMemo(
        () =>
            [...graph.dependents.keys()]
                .map((code) => ({
                    value: code,
                    label: `${code} - ${graph.byCode.get(code)?.name ?? code}`,
                    term: graph.byCode.get(code)?.term ?? 99,
                }))
                .sort((a, b) => a.term - b.term || a.value.localeCompare(b.value)),
        [graph],
    )

    const impact = useMemo(
        () => (selected ? impactOf(graph, selected) : null),
        [graph, selected],
    )

    if (!active) {
        return (
            <Empty description="Önce transkriptini yükle ya da programını seç." />
        )
    }

    if (!options.length) {
        return (
            <Alert
                type="info"
                showIcon
                message="Bu programda katalogda tanımlı ön koşul yok"
                description={
                    'DEÜ Ders Kataloğu bu programın hiçbir dersinde "Dersin Ön Koşulu" ' +
                    'alanını doldurmamış. Bu, fakültenin kendi öğretim ve sınav ' +
                    'uygulama esaslarında bir koşul olmadığı anlamına gelmez; ' +
                    'emin olmak için danışmanına sor.'
                }
            />
        )
    }

    const blockedRows = courses
        .filter((c) => blocked.has(c.id))
        .map((c) => ({ key: c.id, course: c, items: blocked.get(c.id) as Blocker[] }))

    return (
        <Space direction="vertical" size="large" className="w-full">
            <div>
                <div className="mb-2 text-sm text-gray-500">
                    Bir dersten kalirsan, o derse bagli olan dersleri de alamazsin.
                    Zincir birkac yariyil ileri gidebilir.
                </div>
                <Select
                    showSearch
                    allowClear
                    optionFilterProp="label"
                    className="w-full md:w-[420px]"
                    placeholder="Kalmayı merak ettiğin dersi seç"
                    options={options}
                    value={selected}
                    onChange={(v) => setSelected(v ?? null)}
                />
            </div>

            {impact && (
                <Alert
                    type={impact.locked.length > 3 ? 'error' : 'warning'}
                    showIcon
                    message={`${impact.code} ${impact.name} dersinden kalirsan ${impact.locked.length} ders kilitlenir`}
                    description={
                        <Space direction="vertical" size="middle" className="w-full">
                            <Space size="large" wrap>
                                <Statistic
                                    title="Kilitlenen ders"
                                    value={impact.locked.length}
                                />
                                <Statistic title="Zincir derinliği" value={impact.depth} />
                                {impact.lastTerm !== null && (
                                    <Statistic
                                        title="En geç etkilenen yarıyıl"
                                        value={impact.lastTerm}
                                    />
                                )}
                            </Space>
                            <Space size={[4, 4]} wrap>
                                {impact.locked.map((c) => (
                                    <Tag key={c.code} color="volcano">
                                        {c.code} {c.name}
                                        {c.term !== null ? ` (${c.term}. yariyil)` : ''}
                                    </Tag>
                                ))}
                            </Space>
                        </Space>
                    }
                />
            )}

            <div>
                <div className="mb-2 font-medium">
                    Notlarina gore su an alamadigin dersler ({blockedRows.length})
                </div>
                {blockedRows.length === 0 ? (
                    <Alert
                        type="success"
                        showIcon
                        message="Ön koşul tarafında bilinen bir engel yok."
                        description={
                            'Kontenjan, ders cakismasi ve danisman onayi burada ' +
                            'hesaplanmaz; kesin bilgi için kayıt ekranını esas al.'
                        }
                    />
                ) : (
                    <Table
                        size="small"
                        pagination={false}
                        dataSource={blockedRows}
                        columns={[
                            {
                                title: 'Ders',
                                dataIndex: 'course',
                                render: (c: Course) => (
                                    <span>
                                        <b>{c.code}</b> {c.name}
                                    </span>
                                ),
                            },
                            {
                                title: 'Yariyil',
                                dataIndex: 'course',
                                width: 90,
                                render: (c: Course) => c.term ?? '-',
                            },
                            {
                                title: 'Neden',
                                dataIndex: 'items',
                                render: (items: Blocker[]) => <BlockerTags items={items} />,
                            },
                        ]}
                    />
                )}
            </div>
        </Space>
    )
}

export default PrereqImpact
