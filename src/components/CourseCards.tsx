import React from 'react'
import { Button, Select, Tag, Tooltip } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { prettyType } from './ElectivePicker'
import type { Course, CourseStatus, Grade } from '../types'

/**
 * Ders listesinin dar ekran gorunumu.
 *
 * Tablo telefonda calismyor: yedi sutun 700px istiyor, telefon 360-390px
 * veriyor. Ogrenci yalnizca ders adini goruyor, asil isi olan not ve durum
 * ekranin 400px disinda kaliyor. Burada her ders bir kart: kimlik ustte,
 * degistirilen iki alan altta, tam genislikte, kaydirmasiz.
 */
interface Props {
    courses: Course[]
    gradeOptions: Grade[]
    gradeLabel: (g: Grade) => string
    statusOptions: CourseStatus[]
    statusLabel: Record<CourseStatus, string>
    onGrade: (id: string, grade: Grade) => void
    onStatus: (id: string, status: CourseStatus) => void
    onRemove: (course: Course) => void
    rowTone: (course: Course) => string
}

const CourseCards: React.FC<Props> = ({
    courses,
    gradeOptions,
    gradeLabel,
    statusOptions,
    statusLabel,
    onGrade,
    onStatus,
    onRemove,
    rowTone,
}) => (
    <div className="space-y-2">
        {courses.map((c) => (
            <div
                key={c.id}
                className={`rounded-lg border border-gray-200 p-3 ${rowTone(c) || 'bg-white'}`}
            >
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                            <span className="font-medium">{c.code}</span>
                            <Tag
                                color={c.type === 'ZORUNLU' ? 'blue' : 'purple'}
                                className="m-0 px-1 text-[10px] leading-4"
                            >
                                {prettyType(c.rawType)}
                            </Tag>
                        </div>
                        <div className="text-sm text-gray-600">{c.name}</div>
                    </div>
                    <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => onRemove(c)}
                    />
                </div>

                <div className="mt-1 text-xs text-gray-400">
                    <Tooltip title="Teorik + Uygulama + Laboratuvar">
                        <span>
                            {c.t}+{c.u}+{c.l}
                        </span>
                    </Tooltip>
                    {' · '}
                    {c.credit} kredi{' · '}
                    {c.ects} AKTS
                </div>

                {/* Asil is burada: iki alan da tam genislikte ve parmak boyunda. */}
                <div className="mt-2 grid grid-cols-2 gap-2">
                    <Select
                        value={c.grade}
                        className="w-full"
                        onChange={(value: Grade) => onGrade(c.id, value)}
                        options={gradeOptions.map((g) => ({ value: g, label: gradeLabel(g) }))}
                    />
                    <Select
                        value={c.status}
                        className="w-full"
                        onChange={(value: CourseStatus) => onStatus(c.id, value)}
                        options={statusOptions.map((s) => ({ value: s, label: statusLabel[s] }))}
                    />
                </div>
            </div>
        ))}
    </div>
)

export default CourseCards
