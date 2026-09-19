# DEÜ Ders Analiz

Dokuz Eylül Üniversitesi öğrencileri için müfredat ve not takip aracı. Programınızı seçin,
aldığınız harf notlarını girin, ANO/GANO ve AKTS ilerlemenizi görün.

Kaynak: [heudev/ieu-eduanalyzer](https://github.com/heudev/ieu-eduanalyzer) uygulamasından
esinlenilmiştir; DEÜ verisi, DEÜ not sistemi ve girişsiz çalışma için baştan yazılmıştır.

## Öne çıkanlar

- **Transkript yükleme**: DEBİS'ten indirdiğiniz PDF'i yükleyin, 40+ dersin notu tek
  seferde dolsun (elle giriş gerekmez)
- **647 program**: lisans, önlisans, yüksek lisans, doktora (2025-2026 kataloğu)
- **Giriş yok, sunucu yok**: veriniz yalnızca tarayıcınızda (`localStorage`) durur
- **DEÜ'ye doğru ortalama**: GANO yerel krediyle hesaplanır, AKTS ile değil
- **Dönem dönem seçmeli ders seçimi**: her dönemin altında "Seçmeli: 5 / 5 AKTS" sayacı ve
  o döneme ait havuzdan ders seçme
- Dönem ortalaması, AKTS ilerleme çubuğu (mezuniyet hedefine göre), onur/yüksek onur durumu
- CSV dışa aktarma, JSON yedek alma/yükleme

## Not sistemi

Yönetmelik MADDE 26 katsayıları: AA 4.00, BA 3.50, BB 3.00, CB 2.50, CC 2.00, DC 1.50,
DD 1.00, FD 0.50, FF 0.00.

**Kredi = T + (U + L) / 2** (MADDE 33). Katalogdaki teorik/uygulama/laboratuvar
saatlerinden hesaplanır.

**GANO = Toplam(kredi × katsayı) / Toplam(kredi)**, yalnızca harf notu olan dersler üzerinden.

`B` (Başarılı), `M` (Muaf), `Y` (Yetersiz), `D` (Devamsız), `E` (Eksik Not) notları
ortalamaya girmez; AKTS'leri ayrıca sayılır.

Bu model gerçek bir DEÜ transkriptiyle doğrulandı: 1. yarıyıl 20 kredi / 65 puan / 3.25,
4. yarıyıl 21 kredi / 71 puan / 3.38, kümülatif 79 kredi / 260.5 puan / 3.30. Hepsi birebir
tutuyor. Bkz. `src/lib/grades.test.ts`.

> Bu resmi bir DEÜ uygulaması değildir. Kesin bilgi için transkriptinizi esas alın.

## Transkript yükleme

"Transkript Yükle" ile DEBİS'ten indirdiğiniz **Öğrenci Not Durum Belgesi** PDF'ini seçin.
Dersler kod eşleşmesiyle müfredatınıza yazılır, seçmeli havuzundan gelenler otomatik olarak
plana alınır.

**Hiçbir şey onaysız yazılmaz.** Önce bir önizleme çıkar: kaç ders bulundu, kaçı müfredatta,
kaçı seçmeli havuzunda, kaçı eşleşmedi. İçe aktarma sonrası çıkacak GANO, transkriptin kendi
GANO'sunun yanında gösterilir; ikisi tutmuyorsa uyarı verilir.

> **Gizlilik:** PDF tamamen tarayıcınızda işlenir, hiçbir sunucuya gönderilmez. T.C. kimlik
> numarası, öğrenci numarası ve ad soyad **okunmaz ve kaydedilmez**; yalnızca ders kodu, not
> ve durum alınır. Doğrulandı: içe aktarma sonrası kayıtlı veride bu alanların hiçbiri geçmiyor.

Gerçek bir transkript üzerinde doğrulandı: 44 dersin 44'ü eşleşti (38 zorunlu, 6 seçmeli),
hesaplanan GANO **3.42** ve kazanılan AKTS **184**, transkriptin kendi kümülatif satırıyla birebir.

### Farklı bölümlerde nasıl çalışıyor

Parser sabit koordinat kullanmaz; **her PDF'in kendi başlık satırından** (`KODU / DERS ADI /
T / U / AKTS / TK / TS / Notu / Durumu`) sütun konumlarını öğrenir. Bu sayede şunlar ek kod
gerektirmeden çalışır:

- tek sütunlu ya da iki sütunlu yerleşim (kaç tane `KODU` varsa o kadar blok)
- sütunları kaymış farklı fakülte şablonları
- farklı kağıt boyutu
- **yıl bazlı** başlıklar (`BİRİNCİ YIL` — Tıp, Hukuk) ve rakamlı biçimler (`3. YARIYIL`)
- şablonda varsa fazladan `L` (laboratuvar) sütunu

Ayrıca çapraz "ÖĞRENCİ VERSİYONUDUR" **filigranı** hücrelere sızar; yazı yüksekliğine göre elenir
(filigran 16-22 pt, normal metin ~6 pt).

> **Dürüst uyarı:** Bu esneklik yalnızca **tek bir gerçek transkriptle** (Bilgisayar Mühendisliği)
> doğrulanabildi. Diğer düzenler `src/lib/transcriptLayouts.test.ts` içindeki **sentetik**
> testlerle sınandı; gerçek dosyalarla değil.
>
> Bu yüzden uygulama kendi kendini denetler: okunan derslerden hesaplanan GANO, transkriptin
> kendi "Kümülatif Ortalaması" satırıyla karşılaştırılır. Tutmazsa **kırmızı uyarı** verir,
> doğrulama satırı hiç bulunamazsa **sarı uyarı** verir. Sessizce yanlış veri yazmaz.
>
> Başka bir bölümün transkriptinde sorun yaşarsanız, ekrandaki uyarı metniyle birlikte bildirin.

## Seçmeli dersler

Katalog her dönem için kaç AKTS seçmeli alınacağını söylüyor (Bilgisayar Mühendisliği'nde
3. dönem 5, 5. dönem 10, 7. ve 8. dönem 18'er AKTS). Uygulama bunu her dönem tablosunun
altında sayaç olarak gösterir ve o döneme ait havuzdan seçim yaptırır.

Zorunlu dersler + seçmeli gereksinimi programın resmi toplamını verir: Bilgisayar
Mühendisliği'nde her dönem tam 30, toplam 240 AKTS.

Bazı programlarda "her dönem alınabilir" ortak bir havuz da var (Sosyal Seçmeli, Erasmus
gibi); bu dersler her dönemin seçim penceresinde ayrı grup olarak listelenir.

## Geliştirme

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # not motoru ve store testleri
npm run build    # dist/ altina statik cikti
```

Ders verisini yenilemek için:

```bash
npm run scrape   # public/data/ yeniden uretilir, ~7 dakika
```

Ayrıntı ve parser'ın bildiği HTML varyasyonları için `tools/scraper/README.md`.

## Mimari

```
tools/scraper/scrape.py   DEÜ katalogundan veriyi çeker
src/lib/transcript.ts     transkript PDF ayrıştırıcı (saf, test edilebilir)
src/lib/pdf.ts            pdfjs sarmalayıcı (dinamik import, ayrı chunk)
src/lib/transcriptImport.ts  transkript > katalog eşleme
public/data/index.json    program listesi (~136 KB, açılışta yüklenir)
public/data/programs/*    program başına ders planı (lazy fetch)
src/lib/grades.ts         not sisteminin tek doğruluk kaynağı
src/lib/storage.ts        localStorage + yedek al/yükle
src/lib/catalog.ts        veri yükleyici ve önbellek
src/store/                Redux Toolkit slice + debounce'lu kalıcılık
src/components/           ProgramSelector, CourseStats, CourseTable
```

Ders verisi (~12 MB) `public/` altında durur, bundle'a girmez. Yalnızca seçilen programın
dosyası indirilir.

## Yayın

Build çıktısı tamamen statiktir, backend gerektirmez. Herhangi bir statik host
(Vercel, Netlify, Cloudflare Pages) `dist/` klasörünü servis etmek için yeterlidir.

## Veri kaynağı

[DEÜ Ders Kataloğu / Bilgi Paketi](https://debis.deu.edu.tr/ders-katalog/2025-2026/tr/).
`robots.txt` yalnızca eski katalog yıllarını kapatıyor; güncel katalog serbest. Scraper tek
eşzamanlılıkla ve istekler arasında bekleyerek çalışır.
