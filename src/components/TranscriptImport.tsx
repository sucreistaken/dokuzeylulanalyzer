import React, { useCallback, useMemo, useState } from 'react'
import {
    Alert,
    Button,
    Checkbox,
    Modal,
    Radio,
    Select,
    Spin,
    Statistic,
    Table,
    Tabs,
    Tag,
    Upload,
    message,
} from 'antd'
import { FilePdfOutlined } from '@ant-design/icons'
import { useDispatch, useSelector } from 'react-redux'
import { GRADE_POINTS } from '../lib/grades'
import {
    parseTranscriptAuto,
    verifyAgainstTotals,
    type ParsedTranscript,
    type TranscriptRow,
} from '../lib/transcript'
import {
    buildImportPlan,
    summarize,
    toCustomCourse,
    type ImportPlan,
} from '../lib/transcriptImport'
import { bestProgramMatch, type ProgramMatch } from '../lib/programMatch'
import { loadIndex, loadProgram } from '../lib/catalog'
import { addProgram, importTranscript } from '../store/courseSlice'
import type { ProgramData, ProgramMeta, RootState } from '../types'

interface Props {
    /** 'hero': ust bilgide belirgin giris blogu; 'button': sade buton (arac cubugu). */
    variant?: 'hero' | 'button'
}

const TranscriptImport: React.FC<Props> = ({ variant = 'button' }) => {
    const dispatch = useDispatch()
    const { programs, activeProgramId } = useSelector((s: RootState) => s.course)
    const active = programs.find((p) => p.id === activeProgramId)

    const [busy, setBusy] = useState(false)
    const [parsed, setParsed] = useState<ParsedTranscript | null>(null)

    // Program secimi: transkriptten algilanir, kullanici onaylar/degistirir.
    const [indexPrograms, setIndexPrograms] = useState<ProgramMeta[]>([])
    const [detected, setDetected] = useState<ProgramMatch | null>(null)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [selectedData, setSelectedData] = useState<ProgramData | null>(null)
    const [loadingProgram, setLoadingProgram] = useState(false)

    const [plan, setPlan] = useState<ImportPlan | null>(null)
    const [addUnmatched, setAddUnmatched] = useState(true)
    // Varsayilan: temiz yukle. Ard arda iki transkript karismasin.
    const [replaceMode, setReplaceMode] = useState(true)

    const expected = useMemo(
        () => (plan ? summarize(plan, GRADE_POINTS, addUnmatched) : null),
        [plan, addUnmatched],
    )

    const selfCheck = useMemo(
        () => (parsed ? verifyAgainstTotals(parsed.rows, parsed.totals, GRADE_POINTS) : null),
        [parsed],
    )

    // 647 program tek aranabilir listede; fakulte bilgisi ayirt etmeye yardim eder.
    const programOptions = useMemo(
        () =>
            [...indexPrograms]
                .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
                .map((p) => ({
                    value: p.id,
                    label: `${p.name} · ${p.faculty} (${p.levelLabel})`,
                })),
        [indexPrograms],
    )

    // Bir programi yukleyip transkript satirlariyla plani kurar.
    const choose = useCallback((id: string, rows: TranscriptRow[]) => {
        setSelectedId(id)
        setLoadingProgram(true)
        loadProgram(id)
            .then((data) => {
                setSelectedData(data)
                setPlan(buildImportPlan(rows, data.courses))
            })
            .catch((err: Error) => {
                message.error(`Program mufredati yuklenemedi: ${err.message}`)
                setSelectedData(null)
                setPlan(null)
            })
            .finally(() => setLoadingProgram(false))
    }, [])

    const handleFile = useCallback(
        (file: File) => {
            setBusy(true)
            // pdfjs yalnizca burada, dinamik olarak yuklenir.
            import('../lib/pdf')
                .then(({ extractWords }) => extractWords(file))
                .then(async (pages) => {
                    // Belge formatini otomatik alg: DEU DEBIS veya YÖK/e-Devlet.
                    const result = parseTranscriptAuto(pages)
                    if (result.rows.length === 0) {
                        message.error(
                            'PDF icinde ders satiri bulunamadi. DEBIS "Ogrenci Not Durum ' +
                            'Belgesi" ya da e-Devlet "Not Dokum Belgesi" PDF\'ini ' +
                            'yuklediginizden emin olun.',
                        )
                        return
                    }
                    setParsed(result)

                    // Transkriptteki program adini katalogla eslestir.
                    const index = await loadIndex()
                    setIndexPrograms(index.programs)
                    const match = bestProgramMatch(result.program, index.programs)
                    setDetected(match)

                    // Algilanan program, yoksa halihazirda secili program.
                    const initialId = match?.program.id ?? active?.id ?? null
                    if (initialId) choose(initialId, result.rows)
                })
                .catch((err: Error) => {
                    console.error('Transkript okunamadi:', err)
                    // pdfjs teknik ve Ingilizce hata verir ("Invalid PDF structure.");
                    // ogrenciye anlasilir Turkce karsiligini goster.
                    const name = (err as Error & { name?: string }).name ?? ''
                    let friendly = 'Dosya okunamadi. Gecerli bir PDF sectiginizden emin olun.'
                    if (name === 'PasswordException') {
                        friendly = 'PDF parola korumali. Parolasiz bir kopya ile deneyin.'
                    } else if (name === 'InvalidPDFException') {
                        friendly = 'Dosya bozuk veya PDF degil. DEBIS\'ten yeniden indirip deneyin.'
                    }
                    message.error(friendly)
                })
                .finally(() => setBusy(false))

            // false: antd kendi yuklemesini yapmasin, dosya sunucuya gitmesin.
            return false
        },
        [active, choose],
    )

    const close = () => {
        setParsed(null)
        setPlan(null)
        setDetected(null)
        setSelectedId(null)
        setSelectedData(null)
        setAddUnmatched(true)
        setReplaceMode(true)
    }

    const confirm = () => {
        if (!plan || !selectedData) return

        // Program henuz ekli degilse ekle ve aktif yap; ekliyse dokunma
        // (birlestir modunda mevcut notlar korunmali).
        dispatch(addProgram(selectedData))
        dispatch(
            importTranscript({
                entries: plan.matched.map((m) => ({
                    courseId: m.course.id,
                    grade: m.grade,
                    status: m.status,
                    term: m.row.term,
                })),
                custom: addUnmatched
                    ? plan.unmatched.map((u) => ({
                        ...toCustomCourse(u, selectedData.terms),
                        grade: u.grade,
                        status: u.status,
                    }))
                    : [],
                replace: replaceMode,
            }),
        )

        const extra = addUnmatched ? plan.unmatched.length : 0
        message.success(
            `${selectedData.name}: ${plan.matched.length} ders ice aktarildi` +
            (extra > 0 ? `, ${extra} ders mufredata eklendi` : ''),
        )
        close()
    }

    const columns = [
        { title: 'Kod', dataIndex: 'code', key: 'code', width: 110 },
        { title: 'Ders Adi', dataIndex: 'name', key: 'name', ellipsis: true },
        { title: 'AKTS', dataIndex: 'ects', key: 'ects', width: 70 },
        {
            title: 'Not',
            dataIndex: 'grade',
            key: 'grade',
            width: 80,
            render: (grade: string) => (
                <Tag color={grade === 'NA' ? 'default' : 'blue'}>
                    {grade === 'NA' ? '-' : grade}
                </Tag>
            ),
        },
        { title: 'Donem', dataIndex: 'term', key: 'term', width: 80 },
    ]

    const rowsOf = (entries: Array<{ row: { code: string; name: string; ects: number; term: number | null }; grade: string }>) =>
        entries.map((e, i) => ({
            key: i,
            code: e.row.code,
            name: e.row.name,
            ects: e.row.ects,
            grade: e.grade,
            term: e.row.term ?? '-',
        }))

    const fromPool = plan?.matched.filter((m) => m.fromPool) ?? []
    const direct = plan?.matched.filter((m) => !m.fromPool) ?? []

    const trigger =
        variant === 'hero' ? (
            <div className="flex flex-col items-start gap-3 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 p-5 shadow sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <FilePdfOutlined className="mt-1 text-2xl text-blue-600" />
                    <div>
                        <div className="text-base font-semibold text-gray-800">
                            Transkriptinle basla
                        </div>
                        <div className="text-sm text-gray-600">
                            DEBIS "Ogrenci Not Durum Belgesi" PDF'ini yukle; programin ve
                            tum notlarin otomatik gelsin. Dosya yalnizca tarayicinda islenir.
                        </div>
                    </div>
                </div>
                <Upload accept=".pdf" showUploadList={false} beforeUpload={handleFile}>
                    <Button type="primary" size="large" icon={<FilePdfOutlined />} loading={busy}>
                        Transkript Yukle
                    </Button>
                </Upload>
            </div>
        ) : (
            <Upload accept=".pdf" showUploadList={false} beforeUpload={handleFile}>
                <Button icon={<FilePdfOutlined />} loading={busy}>
                    Transkript Yukle
                </Button>
            </Upload>
        )

    return (
        <>
            {trigger}

            <Modal
                title="Transkript Onizleme"
                open={parsed !== null}
                onCancel={close}
                onOk={confirm}
                okText="Ice Aktar"
                cancelText="Vazgec"
                okButtonProps={{ disabled: !plan || !selectedData || loadingProgram }}
                width={860}
            >
                {parsed && (
                    <div className="space-y-4">
                        {/* Program onayi: algilanani goster, degistirmeye izin ver. */}
                        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                            <div className="mb-1 text-sm font-medium text-gray-700">
                                Program
                            </div>
                            <Select
                                className="w-full"
                                showSearch
                                optionFilterProp="label"
                                placeholder="Program secin"
                                value={selectedId}
                                options={programOptions}
                                loading={loadingProgram}
                                onChange={(id) => parsed && choose(id, parsed.rows)}
                                notFoundContent="Eslesen program yok"
                            />
                            <div className="mt-1 text-xs text-gray-500">
                                {detected
                                    ? `Transkriptten algilandi: "${parsed.program ?? '-'}". Yanlissa yukaridan degistirin.`
                                    : parsed.program
                                        ? `Transkriptteki program ("${parsed.program}") katalogla eslestirilemedi, lutfen elle secin.`
                                        : 'Transkriptte program adi okunamadi, lutfen elle secin.'}
                            </div>
                        </div>

                        {/* Ice aktarim modu: temiz yukle mi, birlestir mi. */}
                        <div className="rounded-lg border border-gray-200 p-3">
                            <Radio.Group
                                value={replaceMode}
                                onChange={(e) => setReplaceMode(e.target.value)}
                            >
                                <Radio value={true}>Mevcut notlarin uzerine yaz (temiz)</Radio>
                                <Radio value={false}>Mevcut notlarla birlestir</Radio>
                            </Radio.Group>
                            <div className="mt-1 text-xs text-gray-500">
                                {replaceMode
                                    ? 'Bu programdaki eski notlar ve onceki transkriptten eklenen dersler once temizlenir, sonra bu transkript yazilir. Iki transkript karismaz.'
                                    : 'Bu transkript mevcut notlarin uzerine eklenir; dokunulmayan dersler oldugu gibi kalir.'}
                            </div>
                        </div>

                        {loadingProgram && (
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                <Spin size="small" /> Program mufredati yukleniyor...
                            </div>
                        )}

                        {plan && selectedData && !loadingProgram && (
                            <>
                                <div className="flex flex-wrap gap-6">
                                    <Statistic title="Bulunan Ders" value={parsed.rows.length} />
                                    <Statistic title="Mufredatta" value={direct.length} />
                                    <Statistic title="Secmeli Havuzunda" value={fromPool.length} />
                                    <Statistic
                                        title="Eslesmeyen"
                                        value={plan.unmatched.length}
                                        valueStyle={{
                                            color: plan.unmatched.length > 0 ? '#d46b08' : '#3f8600',
                                        }}
                                    />
                                </div>

                                {expected && (
                                    <div className="flex flex-wrap gap-6 rounded-lg bg-gray-50 p-3">
                                        <Statistic
                                            title="Ice aktarim sonrasi GANO"
                                            value={expected.gpa}
                                            precision={2}
                                            valueStyle={{ color: '#3f8600' }}
                                        />
                                        {parsed.totals && (
                                            <Statistic
                                                title="Transkriptteki GANO"
                                                value={parsed.totals.gpa}
                                                precision={2}
                                            />
                                        )}
                                        <Statistic title="Kazanilan AKTS" value={expected.ects} />
                                    </div>
                                )}

                                {/*
                                  * Guvenlik agi: parser'i yalnizca tek bir bolumun gercek
                                  * transkriptiyle dogrulayabildik. Baska sablonlarda yanlis
                                  * okuma ihtimaline karsi, sonuc transkriptin KENDI kumulatif
                                  * satiriyla karsilastirilir ve tutmazsa kullanici uyarilir.
                                  */}
                                {selfCheck && !selfCheck.ok && (
                                    <Alert
                                        type="error"
                                        showIcon
                                        message="Hesap transkriptle ortusmedi, dikkatli olun"
                                        description={
                                            `Okunan derslerden GANO ${selfCheck.gpa} (${selfCheck.credits} kredi) ` +
                                            `cikti, transkriptiniz ${parsed.totals?.gpa} (${parsed.totals?.credits} kredi) diyor. ` +
                                            'Transkript bicimi beklenenden farkli olabilir; ice aktardiktan sonra ' +
                                            'notlarinizi mutlaka kontrol edin.'
                                        }
                                    />
                                )}

                                {selfCheck === null && (
                                    <Alert
                                        type="warning"
                                        showIcon
                                        message="Otomatik dogrulama yapilamadi"
                                        description={
                                            'Transkriptte "Kumulatif Ortalamasi" satiri bulunamadigi icin ' +
                                            'okunan degerler kendi icinde dogrulanamadi. Ice aktardiktan sonra ' +
                                            'birkac dersin notunu gozden gecirin.'
                                        }
                                    />
                                )}

                                {plan.unmatched.length > plan.matched.length && (
                                    <Alert
                                        type="warning"
                                        showIcon
                                        message="Derslerin cogu mufredatla eslesmedi"
                                        description={
                                            'Yanlis program secili olabilir ya da transkript bicimi farkli ' +
                                            'okunmus olabilir. Devam etmeden once yukaridan programi ve listeyi kontrol edin.'
                                        }
                                    />
                                )}

                                {plan.warnings.map((w) => (
                                    <Alert key={w} type="info" showIcon message={w} />
                                ))}

                                <Tabs
                                    size="small"
                                    items={[
                                        {
                                            key: 'matched',
                                            label: `Mufredatta (${direct.length})`,
                                            children: (
                                                <Table
                                                    size="small"
                                                    columns={columns}
                                                    dataSource={rowsOf(direct)}
                                                    pagination={{ pageSize: 8, size: 'small' }}
                                                />
                                            ),
                                        },
                                        {
                                            key: 'pool',
                                            label: `Secmeli (${fromPool.length})`,
                                            children: (
                                                <>
                                                    <div className="mb-2 text-xs text-gray-500">
                                                        Bu dersler secmeli havuzunuzda bulundu ve
                                                        mufredatiniza otomatik eklenecek.
                                                    </div>
                                                    <Table
                                                        size="small"
                                                        columns={columns}
                                                        dataSource={rowsOf(fromPool)}
                                                        pagination={{ pageSize: 8, size: 'small' }}
                                                    />
                                                </>
                                            ),
                                        },
                                        {
                                            key: 'unmatched',
                                            label: `Eslesmeyen (${plan.unmatched.length})`,
                                            children: (
                                                <>
                                                    <Checkbox
                                                        checked={addUnmatched}
                                                        onChange={(e) => setAddUnmatched(e.target.checked)}
                                                        disabled={plan.unmatched.length === 0}
                                                    >
                                                        Bu dersleri mufredatima ekle
                                                    </Checkbox>
                                                    <Table
                                                        className="mt-2"
                                                        size="small"
                                                        columns={columns}
                                                        dataSource={rowsOf(plan.unmatched)}
                                                        pagination={{ pageSize: 8, size: 'small' }}
                                                    />
                                                </>
                                            ),
                                        },
                                    ]}
                                />
                            </>
                        )}

                        <Alert
                            type="success"
                            showIcon
                            message="PDF'iniz yalnizca tarayicinizda islenir"
                            description={
                                'Dosya hicbir sunucuya gonderilmez. Kimlik numaraniz, ogrenci ' +
                                'numaraniz ve adiniz okunmaz ve kaydedilmez; yalnizca ders ' +
                                'kodlari ve notlar alinir.'
                            }
                        />
                    </div>
                )}
            </Modal>
        </>
    )
}

export default TranscriptImport
