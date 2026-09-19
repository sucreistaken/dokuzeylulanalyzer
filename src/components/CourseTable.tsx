import React, { useCallback, useMemo, useState } from 'react'
import {
    Button,
    Empty,
    Form,
    Input,
    InputNumber,
    Modal,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Upload,
    message,
} from 'antd'
import {
    DeleteOutlined,
    DownloadOutlined,
    PlusOutlined,
    ReloadOutlined,
    TrophyOutlined,
    UploadOutlined,
} from '@ant-design/icons'
import { useDispatch, useSelector } from 'react-redux'
import {
    GRADE_OPTIONS,
    NON_GPA_GRADES,
    STATUS_OPTIONS,
    calculateGpa,
    isFailing,
    isPassed,
} from '../lib/grades'
import { exportState, parseImported } from '../lib/storage'
import {
    addCustomCourse,
    hydrate,
    removeCourse,
    resetProgress,
    selectProgress,
    setGrade,
    setStatus,
    toggleElective,
} from '../store/courseSlice'
import { loadProgram } from '../lib/catalog'
import ElectivePicker, { prettyType } from './ElectivePicker'
import TranscriptImport from './TranscriptImport'
import type { Course, CourseStatus, Grade, ProgramData, RootState } from '../types'

const STATUS_LABEL: Record<CourseStatus, string> = {
    ALMADIM: 'Almadim',
    ALINIYOR: 'Aliniyor',
    ALDIM: 'Aldim',
}

const gradeLabel = (grade: Grade): string => {
    if (grade === 'NA') return '-'
    const special = NON_GPA_GRADES[grade]
    return special ? `${grade} (${special})` : grade
}

const MAX_NAME_LENGTH = 60

const CourseTable: React.FC = () => {
    const dispatch = useDispatch()
    const courseState = useSelector((s: RootState) => s.course)
    const { programs, activeProgramId } = courseState
    const active = programs.find((p) => p.id === activeProgramId)

    const [isAddOpen, setAddOpen] = useState(false)
    /** Secmeli secme modali hangi donem icin acik. */
    const [pickerTerm, setPickerTerm] = useState<number | null | undefined>(undefined)
    const [form] = Form.useForm()

    const courses = active?.courses ?? []

    /** Mufredata dahil dersler: zorunlular + kullanicinin ekledigi secmeliler. */
    const included = useMemo(
        () => courses.filter((c) => !c.elective || c.added),
        [courses],
    )

    /** Henuz secilmemis havuz dersleri. */
    const electivePool = useMemo(
        () => courses.filter((c) => c.elective && !c.added),
        [courses],
    )

    /** Donemi olmayan, her donem alinabilen havuz. */
    const anyTermPool = useMemo(
        () => electivePool.filter((c) => c.poolScope === 'any'),
        [electivePool],
    )

    /** term -> katalogun o donem icin verdigi hedefler. */
    const termRequirements = useMemo(() => {
        const map = new Map<number, { electiveEcts: number; totalEcts: number | null }>()
        for (const t of active?.terms ?? []) {
            map.set(t.term, { electiveEcts: t.electiveEcts, totalEcts: t.totalEcts })
        }
        return map
    }, [active])

    /**
     * Donem/yil gruplari. Doktora programlarinda term null gelir.
     * Bos donemler de gosterilir: katalog o donem icin secmeli bekliyorsa
     * ogrenci hicbir ders eklemeden once de o satiri gormeli.
     */
    const groups = useMemo(() => {
        const map = new Map<number | null, Course[]>()
        for (const course of included) {
            const bucket = map.get(course.term)
            if (bucket) bucket.push(course)
            else map.set(course.term, [course])
        }
        // Katalogda hedefi olan ama henuz hic dersi olmayan donemler.
        for (const t of active?.terms ?? []) {
            if (!map.has(t.term)) map.set(t.term, [])
        }

        const unitFor = (term: number | null) =>
            included.find((c) => c.term === term)?.termUnit ??
            active?.terms.find((t) => t.term === term)?.unit ??
            'Donem'

        return [...map.entries()]
            .map(([term, list]) => ({
                term,
                label: term === null ? 'Tum Dersler' : `${term}. ${unitFor(term)}`,
                courses: list,
            }))
            .sort((a, b) => {
                if (a.term === null) return 1
                if (b.term === null) return -1
                return a.term - b.term
            })
    }, [included, active])

    /** Bir donemde secilmis secmelilerin AKTS toplami. */
    const selectedElectiveEcts = useCallback(
        (term: number | null) =>
            courses
                .filter((c) => c.elective && c.added && c.term === term)
                .reduce((sum, c) => sum + c.ects, 0),
        [courses],
    )

    const handleElectiveConfirm = useCallback(
        (ids: string[]) => {
            for (const id of ids) dispatch(toggleElective(id))
            setPickerTerm(undefined)
            message.success(`${ids.length} secmeli ders eklendi`)
        },
        [dispatch],
    )

    const handleGrade = useCallback(
        (courseId: string, grade: Grade) => {
            dispatch(setGrade({ courseId, grade }))
        },
        [dispatch],
    )

    const handleStatus = useCallback(
        (courseId: string, status: CourseStatus) => {
            dispatch(setStatus({ courseId, status }))
        },
        [dispatch],
    )

    const handleRemove = useCallback(
        (course: Course) => {
            Modal.confirm({
                title: 'Dersi kaldir',
                content: `${course.code} - ${course.name} mufredattan kaldirilsin mi?`,
                okText: 'Kaldir',
                cancelText: 'Vazgec',
                okButtonProps: { danger: true },
                onOk: () => {
                    if (course.elective || course.id.includes(':custom:')) {
                        dispatch(
                            course.id.includes(':custom:')
                                ? removeCourse(course.id)
                                : toggleElective(course.id),
                        )
                    } else {
                        dispatch(removeCourse(course.id))
                    }
                    message.success('Ders kaldirildi')
                },
            })
        },
        [dispatch],
    )

    const handleExportCsv = useCallback(() => {
        if (!active) return
        const header = [
            'Kod', 'Ders Adi', 'T', 'U', 'L', 'Kredi', 'AKTS', 'Tur', 'Donem', 'Not', 'Durum',
        ]
        const rows = included.map((c) => [
            c.code,
            c.name,
            c.t,
            c.u,
            c.l,
            c.credit,
            c.ects,
            prettyType(c.rawType),
            c.term === null ? '-' : `${c.term}. ${c.termUnit ?? 'Donem'}`,
            c.grade === 'NA' ? '' : c.grade,
            STATUS_LABEL[c.status],
        ])

        // Excel'in TR yerel ayarinda ayirici noktali virgul; alan icindeki
        // noktali virgul ve tirnaklar kacirilmali.
        const escape = (value: string | number) => {
            const text = String(value)
            return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
        }
        const csv = [header, ...rows]
            .map((row) => row.map(escape).join(';'))
            .join('\r\n')

        // BOM: Excel UTF-8'i dogru tanisin, Turkce karakterler bozulmasin.
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        // \w Turkce harfleri kapsamiyor; yalnizca dosya sisteminde sorun cikaran
        // karakterleri temizle ki "Bilgisayar Muhendisligi" adi bozulmasin.
        const safeName = active.name.replace(/[\\/:*?"<>|]/g, '-').trim()
        link.download = `${safeName}.csv`
        link.click()
        URL.revokeObjectURL(url)
        message.success('CSV indirildi')
    }, [active, included])

    const handleBackup = useCallback(() => {
        exportState({ activeProgramId, progress: selectProgress(courseState) })
        message.success('Yedek indirildi')
    }, [activeProgramId, courseState])

    const handleRestore = useCallback(
        (file: File) => {
            const reader = new FileReader()
            reader.onload = async () => {
                try {
                    const saved = parseImported(String(reader.result))
                    // Yedek yalnizca not/durum tasir; ders verisi katalogdan gelir.
                    const loaded = await Promise.all(
                        Object.keys(saved.progress).map((id) =>
                            loadProgram(id).catch(() => null),
                        ),
                    )
                    dispatch(
                        hydrate({
                            ...saved,
                            programs: loaded.filter((p): p is ProgramData => p !== null),
                        }),
                    )
                    message.success('Yedek geri yuklendi')
                } catch (err) {
                    message.error((err as Error).message)
                }
            }
            reader.readAsText(file)
            return false
        },
        [dispatch],
    )

    const handleAddCourse = useCallback(() => {
        form.validateFields().then((values) => {
            dispatch(
                addCustomCourse({
                    code: values.code,
                    name: values.name,
                    t: values.t ?? 0,
                    u: values.u ?? 0,
                    l: values.l ?? 0,
                    ects: values.ects ?? 0,
                    term: values.term ?? null,
                }),
            )
            setAddOpen(false)
            form.resetFields()
            message.success('Ders eklendi')
        })
    }, [dispatch, form])

    const columns = useMemo(
        () => [
            { title: 'Kod', dataIndex: 'code', key: 'code', width: 110 },
            {
                title: 'Ders Adi',
                dataIndex: 'name',
                key: 'name',
                width: 320,
                render: (name: string) => (
                    <Tooltip title={name} placement="topLeft">
                        <span>
                            {name.length > MAX_NAME_LENGTH
                                ? `${name.slice(0, MAX_NAME_LENGTH)}...`
                                : name}
                        </span>
                    </Tooltip>
                ),
            },
            { title: 'T', dataIndex: 't', key: 't', width: 44 },
            { title: 'U', dataIndex: 'u', key: 'u', width: 44 },
            { title: 'L', dataIndex: 'l', key: 'l', width: 44 },
            {
                title: 'Kredi',
                dataIndex: 'credit',
                key: 'credit',
                width: 64,
                render: (credit: number) => (
                    <Tooltip title="Kredi = T + (U + L) / 2">
                        <span className="font-medium">{credit}</span>
                    </Tooltip>
                ),
            },
            { title: 'AKTS', dataIndex: 'ects', key: 'ects', width: 60 },
            {
                title: 'Tur',
                dataIndex: 'rawType',
                key: 'rawType',
                width: 130,
                // Katalogda 14 farkli tur var; Zorunlu/Secmeli ikilisine
                // indirgemek Erasmus dersini yanlis etiketliyordu.
                render: (rawType: string, record: Course) => (
                    <Tag color={record.type === 'ZORUNLU' ? 'blue' : 'purple'}>
                        {prettyType(rawType)}
                    </Tag>
                ),
            },
            {
                title: 'Not',
                key: 'grade',
                width: 130,
                render: (_: unknown, record: Course) => (
                    <Select
                        value={record.grade}
                        className="w-full"
                        size="small"
                        onChange={(value: Grade) => handleGrade(record.id, value)}
                        options={GRADE_OPTIONS.map((g) => ({
                            value: g,
                            label: gradeLabel(g),
                        }))}
                    />
                ),
            },
            {
                title: 'Durum',
                key: 'status',
                width: 120,
                render: (_: unknown, record: Course) => (
                    <Select
                        value={record.status}
                        className="w-full"
                        size="small"
                        onChange={(value: CourseStatus) => handleStatus(record.id, value)}
                        options={STATUS_OPTIONS.map((s) => ({
                            value: s,
                            label: STATUS_LABEL[s],
                        }))}
                    />
                ),
            },
            {
                title: '',
                key: 'actions',
                width: 50,
                render: (_: unknown, record: Course) => (
                    <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => handleRemove(record)}
                    />
                ),
            },
        ],
        [handleGrade, handleStatus, handleRemove],
    )

    if (!active) {
        return (
            <Empty
                description="Once yukaridan bir program secin"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Space wrap>
                    <TranscriptImport />
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setAddOpen(true)}
                    >
                        Ders Ekle
                    </Button>
                    <Button icon={<DownloadOutlined />} onClick={handleExportCsv}>
                        CSV Indir
                    </Button>
                    <Button icon={<DownloadOutlined />} onClick={handleBackup}>
                        Yedek Al
                    </Button>
                    <Upload
                        accept=".json"
                        showUploadList={false}
                        beforeUpload={handleRestore}
                    >
                        <Button icon={<UploadOutlined />}>Yedek Yukle</Button>
                    </Upload>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={() =>
                            Modal.confirm({
                                title: 'Notlari sifirla',
                                content:
                                    'Bu programdaki tum not ve durumlar silinecek. Devam edilsin mi?',
                                okText: 'Sifirla',
                                cancelText: 'Vazgec',
                                okButtonProps: { danger: true },
                                onOk: () => {
                                    dispatch(resetProgress())
                                    message.success('Notlar sifirlandi')
                                },
                            })
                        }
                    >
                        Sifirla
                    </Button>
                </Space>
            </div>

            <div className="space-y-8 overflow-x-auto">
                {groups.map(({ term, label, courses: groupCourses }) => {
                    const { gpa, credits } = calculateGpa(groupCourses)
                    const req = term !== null ? termRequirements.get(term) : undefined
                    // Katalogun verdigi deger isaretli bir duzeltmedir; yalnizca
                    // pozitifken gercek bir secmeli hedefi anlamina gelir.
                    const target = req && req.electiveEcts > 0 ? req.electiveEcts : null
                    const poolForTerm = electivePool.filter((c) => c.term === term)
                    const hasPool = poolForTerm.length > 0 || anyTermPool.length > 0
                    const chosen = selectedElectiveEcts(term)
                    const done = target !== null && chosen >= target

                    return (
                        <div key={label}>
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <div className="text-base font-semibold text-gray-700">
                                    {label}
                                </div>
                                <Space size={4} wrap>
                                    <Tag>
                                        {groupCourses.reduce((s, c) => s + c.ects, 0)} AKTS
                                        {req?.totalEcts ? ` / ${req.totalEcts}` : ''}
                                    </Tag>
                                    <Tooltip title="Bu donemde harf notu alinmis derslerin agirlikli ortalamasi">
                                        <Tag icon={<TrophyOutlined />} color={credits > 0 ? 'success' : 'default'}>
                                            Donem Ortalamasi: {credits > 0 ? gpa.toFixed(2) : '-'}
                                        </Tag>
                                    </Tooltip>
                                </Space>
                            </div>

                            {groupCourses.length > 0 && (
                                <Table
                                    columns={columns}
                                    dataSource={groupCourses}
                                    rowKey="id"
                                    size="small"
                                    pagination={false}
                                    rowHoverable={false}
                                    scroll={{ x: 1100 }}
                                    className="rounded-lg bg-gray-100 p-1.5 shadow"
                                    rowClassName={(record: Course) => {
                                        if (record.status === 'ALINIYOR') return 'bg-orange-100'
                                        if (isFailing(record.grade)) return 'bg-red-100'
                                        if (isPassed(record.grade)) return 'bg-green-50'
                                        return ''
                                    }}
                                />
                            )}

                            {hasPool && (
                                <div
                                    className={`mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                                        target === null
                                            ? 'border-dashed border-gray-300 bg-gray-50'
                                            : done
                                                ? 'border-green-300 bg-green-50'
                                                : 'border-orange-300 bg-orange-50'
                                    }`}
                                >
                                    <div className="text-sm">
                                        {target !== null ? (
                                            <span className={done ? 'text-green-800' : 'text-orange-800'}>
                                                <strong>Secmeli: {chosen} / {target} AKTS</strong>
                                                {!done && ' - bu donemde secmeli dersinizi secmelisiniz'}
                                            </span>
                                        ) : (
                                            <span className="text-gray-600">
                                                Bu donemde secilebilecek {poolForTerm.length + anyTermPool.length} ders var
                                                {chosen > 0 && ` (${chosen} AKTS secildi)`}
                                            </span>
                                        )}
                                    </div>
                                    <Button
                                        size="small"
                                        type={done || target === null ? 'default' : 'primary'}
                                        icon={<PlusOutlined />}
                                        onClick={() => setPickerTerm(term)}
                                    >
                                        Secmeli Ders Ekle
                                    </Button>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {pickerTerm !== undefined && (
                <ElectivePicker
                    open
                    termLabel={
                        groups.find((g) => g.term === pickerTerm)?.label ?? 'Secmeli'
                    }
                    termPool={electivePool.filter(
                        (c) => c.term === pickerTerm && c.poolScope !== 'any',
                    )}
                    anyTermPool={anyTermPool}
                    targetEcts={(() => {
                        const r = pickerTerm !== null ? termRequirements.get(pickerTerm) : undefined
                        return r && r.electiveEcts > 0 ? r.electiveEcts : null
                    })()}
                    selectedEcts={selectedElectiveEcts(pickerTerm ?? null)}
                    onCancel={() => setPickerTerm(undefined)}
                    onConfirm={handleElectiveConfirm}
                />
            )}

            <Modal
                title="Ders Ekle"
                open={isAddOpen}
                onOk={handleAddCourse}
                onCancel={() => {
                    setAddOpen(false)
                    form.resetFields()
                }}
                okText="Ekle"
                cancelText="Vazgec"
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="code"
                        label="Ders Kodu"
                        rules={[{ required: true, message: 'Ders kodu zorunlu' }]}
                    >
                        <Input placeholder="ORN 1001" />
                    </Form.Item>
                    <Form.Item
                        name="name"
                        label="Ders Adi"
                        rules={[{ required: true, message: 'Ders adi zorunlu' }]}
                    >
                        <Input />
                    </Form.Item>
                    <Space>
                        <Form.Item name="t" label="Teorik (T)" initialValue={0}>
                            <InputNumber min={0} max={40} />
                        </Form.Item>
                        <Form.Item name="u" label="Uygulama (U)" initialValue={0}>
                            <InputNumber min={0} max={40} />
                        </Form.Item>
                        <Form.Item name="l" label="Lab (L)" initialValue={0}>
                            <InputNumber min={0} max={40} />
                        </Form.Item>
                        <Form.Item
                            name="ects"
                            label="AKTS"
                            initialValue={0}
                            rules={[{ required: true, message: 'AKTS zorunlu' }]}
                        >
                            <InputNumber min={0} max={60} />
                        </Form.Item>
                    </Space>
                    <Form.Item name="term" label="Donem">
                        <Select
                            allowClear
                            placeholder="Donem secin"
                            options={groups
                                .filter((g) => g.term !== null)
                                .map((g) => ({ value: g.term as number, label: g.label }))}
                        />
                    </Form.Item>
                    <div className="text-xs text-gray-500">
                        Kredi, T + (U + L) / 2 formuluyle otomatik hesaplanir.
                    </div>
                </Form>
            </Modal>
        </div>
    )
}

export default React.memo(CourseTable)
