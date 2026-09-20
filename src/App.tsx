import React, { useEffect, useState } from 'react'
import { Card, ConfigProvider, Layout, Spin, Typography } from 'antd'
import trTR from 'antd/locale/tr_TR'
import { Provider, useDispatch } from 'react-redux'
import { BarChartOutlined } from '@ant-design/icons'
import { store } from './store'
import { hydrate } from './store/courseSlice'
import { loadState } from './lib/storage'
import { loadProgram } from './lib/catalog'
import type { ProgramData } from './types'
import ProgramSelector from './components/ProgramSelector'
import CourseStats from './components/CourseStats'
import CourseTable from './components/CourseTable'
import PrereqImpact from './components/PrereqImpact'
import TranscriptImport from './components/TranscriptImport'
import SummaryBar from './components/SummaryBar'
import { isEmbedded, reportHeightToParent } from './lib/embed'

const { Header, Content, Footer } = Layout
const { Title } = Typography

const AppContent: React.FC = () => {
    const dispatch = useDispatch()
    const [ready, setReady] = useState(false)

    useEffect(() => {
        let cancelled = false

        const restore = async () => {
            const saved = loadState()
            if (!saved || Object.keys(saved.progress).length === 0) {
                if (!cancelled) setReady(true)
                return
            }

            // Katalog tek dogruluk kaynagi: kayitli program id'leri icin taze
            // veri cekilir, kullanicinin notlari ders id'siyle uzerine oturur.
            const ids = Object.keys(saved.progress)
            const loaded = await Promise.all(
                ids.map((id) =>
                    loadProgram(id).catch((err: Error) => {
                        // Katalogdan kalkan program kullanicinin verisini
                        // engellememelidir; atlanir ve bildirilir.
                        console.warn(`Program ${id} yüklenemedi, atlandı:`, err.message)
                        return null
                    }),
                ),
            )

            if (cancelled) return

            const programs = loaded.filter((p): p is ProgramData => p !== null)
            dispatch(hydrate({ ...saved, programs }))
            setReady(true)
        }

        restore()
        return () => {
            cancelled = true
        }
    }, [dispatch])

    if (!ready) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-3">
                <Spin size="large" />
                <span className="text-sm text-gray-500">Verileriniz yükleniyor...</span>
            </div>
        )
    }

    return <Home />
}

/** Transkript + kisisel analiz ekrani. */
const Home: React.FC = () => (
    <div className="flex flex-col space-y-5">
        {/* Ana giris noktasi: transkript yukle, program ve notlar otomatik gelsin. */}
        <TranscriptImport variant="hero" />

        <Card title="Program Seçimi" className="shadow">
            <div className="mb-3 text-sm text-gray-500">
                Transkriptin yoksa ya da programını elle seçmek istersen buradan seç.
            </div>
            <ProgramSelector />
        </Card>
        <Card title="İstatistikler" className="shadow">
            <CourseStats />
        </Card>
        <Card title="Ön Koşul Etkisi" className="shadow">
            <PrereqImpact />
        </Card>
        <Card title="Ders Planı" className="shadow">
            <CourseTable />
        </Card>
    </div>
)

/** Her rotanin paylastigi baslik, alt bilgi ve ozet cubugu. */
const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const embedded = isEmbedded()

    useEffect(() => reportHeightToParent(), [])

    return (
        <Layout className="min-h-screen">
            {/* Forum icinde kendi basligi zaten var; ikinci basligi tekrarlamiyoruz. */}
            {!embedded && (
                <Header className="flex items-center justify-between bg-gray-50 shadow">
                    <div className="flex items-center">
                        <BarChartOutlined style={{ fontSize: 24, marginRight: 10 }} />
                        <Title level={3} className="m-3 py-4">
                            DEÜ Ders Analiz
                        </Title>
                    </div>
                    <div className="hidden text-sm text-gray-500 sm:block">
                        Dokuz Eylül Üniversitesi
                    </div>
                </Header>
            )}

            <Content
                className={
                    embedded
                        ? 'bg-[#F0F2F5] p-4 pb-6 md:p-6 md:pb-8 lg:pl-[184px]'
                        : 'bg-[#F0F2F5] p-4 pb-20 md:p-6 md:pb-20'
                }
            >
                <div className="mx-auto max-w-6xl">{children}</div>
            </Content>

            <Footer
                className={
                    embedded
                        ? 'bg-[#F0F2F5] pb-4 text-center text-xs text-gray-500 lg:pl-[184px]'
                        : 'bg-[#F0F2F5] pb-16 text-center text-xs text-gray-500'
                }
            >
                Ders verileri DEÜ Ders Kataloğu / Bilgi Paketi'nden alınmıştır. Resmî bir
                DEÜ uygulaması değildir; notlarınız yalnızca bu tarayıcıda saklanır.
                Kesin bilgi için transkriptinizi esas alın.
            </Footer>

            <SummaryBar />
        </Layout>
    )
}

const App: React.FC = () => (
    <ConfigProvider locale={trTR}>
        <Provider store={store}>
            <Shell>
                <AppContent />
            </Shell>
        </Provider>
    </ConfigProvider>
)

export default App
