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
                message.error(`Program müfredatı yüklenemedi: ${err.message}`)
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
                            'PDF içinde ders satırı bulunamadı. DEBİS "Öğrenci Not Durum ' +
                            'Belgesi" ya da e-Devlet "Not Döküm Belgesi" PDF\'ini ' +
                            'yüklediğinden emin ol.',
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
                    console.error('Transkript okunamadı:', err)
                    // pdfjs teknik ve Ingilizce hata verir ("Invalid PDF structure.");
                    // ogrenciye anlasilir Turkce karsiligini goster.
                    const name = (err as Error & { name?: string }).name ?? ''
                    let friendly = 'Dosya okunamadı. Geçerli bir PDF seçtiğinden emin ol.'
                    if (name === 'PasswordException') {
                        friendly = 'PDF parola korumalı. Parolasız bir kopya ile dene.'
                    } else if (name === 'InvalidPDFException') {
                        friendly = 'Dosya bozuk veya PDF değil. DEBİS\'ten yeniden indirip dene.'
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
            `${selectedData.name}: ${plan.matched.length} ders içe aktarıldı` +
            (extra > 0 ? `, ${extra} ders müfredata eklendi` : ''),
        )
        close()
    }

    const columns = [
        { title: 'Kod', dataIndex: 'code', key: 'code', width: 110 },
        { title: 'Ders Adı', dataIndex: 'name', key: 'name', ellipsis: true },
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
                            DEBİS "Öğrenci Not Durum Belgesi" PDF'ini yükle; programın ve
                            tüm notların otomatik gelsin. Dosya yalnızca tarayıcında işlenir.
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
                okText="İçe Aktar"
                cancelText="Vazgeç"
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
                                placeholder="Program seç"
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
                                        ? `Transkriptteki program ("${parsed.program}") katalogla eşleştirilemedi, lütfen elle seç.`
                                        : 'Transkriptte program adı okunamadı, lütfen elle seç.'}
                            </div>
                        </div>

                        {/* Ice aktarim modu: temiz yukle mi, birlestir mi. */}
                        <div className="rounded-lg border border-gray-200 p-3">
                            <Radio.Group
                                value={replaceMode}
                                onChange={(e) => setReplaceMode(e.target.value)}
                            >
                                <Radio value={true}>Mevcut notların üzerine yaz (temiz)</Radio>
                                <Radio value={false}>Mevcut notlarla birlestir</Radio>
                            </Radio.Group>
                            <div className="mt-1 text-xs text-gray-500">
                                {replaceMode
                                    ? 'Bu programdaki eski notlar ve önceki transkriptten eklenen dersler önce temizlenir, sonra bu transkript yazilir. Iki transkript karismaz.'
                                    : 'Bu transkript mevcut notların üzerine eklenir; dokunulmayan dersler olduğu gibi kalır.'}
                            </div>
                        </div>

                        {loadingProgram && (
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                <Spin size="small" /> Program müfredatı yükleniyor...
                            </div>
                        )}

                        {plan && selectedData && !loadingProgram && (
                            <>
                                <div className="flex flex-wrap gap-6">
                                    <Statistic title="Bulunan Ders" value={parsed.rows.length} />
                                    <Statistic title="Müfredatta" value={direct.length} />
                                    <Statistic title="Seçmeli Havuzunda" value={fromPool.length} />
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
                                            title="İçe aktarım sonrası GANO"
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
                                        <Statistic title="Kazanılan AKTS" value={expected.ects} />
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
                                            'Transkript biçimi beklenenden farklı olabilir; içe aktardıktan sonra ' +
                                            'notlarını mutlaka kontrol et.'
                                        }
                                    />
                                )}

                                {selfCheck === null && (
                                    <Alert
                                        type="warning"
                                        showIcon
                                        message="Otomatik doğrulama yapılamadı"
                                        description={
                                            'Transkriptte "Kümülatif Ortalaması" satırı bulunamadığı için ' +
                                            'okunan değerler kendi içinde doğrulanamadı. İçe aktardıktan sonra ' +
                                            'birkac dersin notunu gozden gecirin.'
                                        }
                                    />
                                )}

                                {plan.unmatched.length > plan.matched.length && (
                                    <Alert
                                        type="warning"
                                        showIcon
                                        message="Derslerin çoğu müfredatla eşleşmedi"
                                        description={
                                            'Yanlış program seçili olabilir ya da transkript biçimi farklı ' +
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
                                            label: `Müfredatta (${direct.length})`,
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
                                            label: `Seçmeli (${fromPool.length})`,
                                            children: (
                                                <>
                                                    <div className="mb-2 text-xs text-gray-500">
                                                        Bu dersler seçmeli havuzunda bulundu ve
                                                        müfredatına otomatik eklenecek.
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
                                                        Bu dersleri müfredatıma ekle
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
                            message="PDF'iniz yalnızca tarayıcında işlenir"
                            description={
                                'Dosya hiçbir sunucuya gönderilmez. Kimlik numaran, öğrenci ' +
                                'numaran ve adın okunmaz ve kaydedilmez; yalnızca ders ' +
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
