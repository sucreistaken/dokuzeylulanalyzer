import React, { useMemo, useState } from 'react'
import { Empty, Input, Modal, Table, Tag, Tooltip } from 'antd'
import type { Course } from '../types'

interface Props {
    open: boolean
    /** Modalin basligindaki donem adi, orn "3. Donem". */
    termLabel: string
    /** O donemin havuzundaki, henuz eklenmemis dersler. */
    termPool: Course[]
    /** Her donem alinabilen ("SECILEBILIR DERSLER") havuz. */
    anyTermPool: Course[]
    /** Bu donemde kac AKTS secmeli gerektigi; bilinmiyorsa null. */
    targetEcts: number | null
    /** Halihazirda secilmis AKTS. */
    selectedEcts: number
    onCancel: () => void
    onConfirm: (courseIds: string[]) => void
}

const TYPE_COLORS: Record<string, string> = {
    ZORUNLU: 'blue',
    ERASMUS: 'magenta',
    STAJ: 'orange',
}

/** "TEKNIK SECMELI" -> "Teknik Seçmeli" */
export const prettyType = (rawType: string): string => {
    if (!rawType) return 'Belirtilmemis'
    return rawType
        .toLocaleLowerCase('tr')
        .split(/\s+/)
        .map((w) => w.charAt(0).toLocaleUpperCase('tr') + w.slice(1))
        .join(' ')
}

/**
 * Bir donemin secmeli havuzundan ders sectirir.
 *
 * Kaynak katalogda havuz dersleri donem bazli listeleniyor; ayrica bazi
 * programlarda "HER DONEM AKTS'YE GORE SECILEBILIR DERSLER" basligi altinda
 * donemi olmayan bir havuz var. Ikisi ayri grup olarak gosteriliyor.
 */
const ElectivePicker: React.FC<Props> = ({
    open,
    termLabel,
    termPool,
    anyTermPool,
    targetEcts,
    selectedEcts,
    onCancel,
    onConfirm,
}) => {
    const [search, setSearch] = useState('')
    const [checked, setChecked] = useState<string[]>([])

    const rows = useMemo(() => {
        const q = search.trim().toLocaleLowerCase('tr')
        const match = (c: Course) =>
            !q ||
            c.code.toLocaleLowerCase('tr').includes(q) ||
            c.name.toLocaleLowerCase('tr').includes(q)

        return [
            ...termPool.filter(match).map((c) => ({ ...c, group: termLabel })),
            ...anyTermPool.filter(match).map((c) => ({ ...c, group: 'Her donem alinabilir' })),
        ]
    }, [termPool, anyTermPool, search, termLabel])

    const pendingEcts = useMemo(() => {
        const all = [...termPool, ...anyTermPool]
        return checked.reduce(
            (sum, id) => sum + (all.find((c) => c.id === id)?.ects ?? 0),
            0,
        )
    }, [checked, termPool, anyTermPool])

    const close = () => {
        setChecked([])
        setSearch('')
    }

    const columns = [
        { title: 'Kod', dataIndex: 'code', key: 'code', width: 110 },
        {
            title: 'Ders Adi',
            dataIndex: 'name',
            key: 'name',
            render: (name: string) => (
                <Tooltip title={name} placement="topLeft">
                    <span>{name.length > 55 ? `${name.slice(0, 55)}...` : name}</span>
                </Tooltip>
            ),
        },
        { title: 'T', dataIndex: 't', key: 't', width: 40 },
        { title: 'U', dataIndex: 'u', key: 'u', width: 40 },
        { title: 'L', dataIndex: 'l', key: 'l', width: 40 },
        { title: 'Kredi', dataIndex: 'credit', key: 'credit', width: 62 },
        { title: 'AKTS', dataIndex: 'ects', key: 'ects', width: 58 },
        {
            title: 'Tur',
            dataIndex: 'rawType',
            key: 'rawType',
            width: 130,
            render: (rawType: string) => (
                <Tag color={TYPE_COLORS[rawType?.toUpperCase()] ?? 'purple'}>
                    {prettyType(rawType)}
                </Tag>
            ),
        },
        {
            title: 'Havuz',
            dataIndex: 'group',
            key: 'group',
            width: 150,
        },
    ]

    const total = selectedEcts + pendingEcts

    return (
        <Modal
            title={`${termLabel} - Secmeli Ders Sec`}
            open={open}
            width={980}
            onCancel={() => {
                close()
                onCancel()
            }}
            onOk={() => {
                onConfirm(checked)
                close()
            }}
            okText={checked.length > 0 ? `${checked.length} dersi ekle` : 'Ekle'}
            cancelText="Vazgec"
            okButtonProps={{ disabled: checked.length === 0 }}
        >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <Input.Search
                    allowClear
                    placeholder="Ders kodu veya adi ara"
                    className="max-w-sm"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                {targetEcts !== null && (
                    <Tag color={total >= targetEcts ? 'success' : 'warning'}>
                        Secili: {total} / {targetEcts} AKTS
                    </Tag>
                )}
            </div>

            {rows.length === 0 ? (
                <Empty
                    description={
                        search
                            ? 'Aramayla eslesen ders yok'
                            : 'Bu donemde secilebilecek ders kalmadi'
                    }
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
            ) : (
                <Table
                    rowKey="id"
                    size="small"
                    columns={columns}
                    dataSource={rows}
                    scroll={{ x: 900, y: 380 }}
                    pagination={false}
                    rowSelection={{
                        selectedRowKeys: checked,
                        onChange: (keys) => setChecked(keys as string[]),
                    }}
                />
            )}
        </Modal>
    )
}

export default ElectivePicker
