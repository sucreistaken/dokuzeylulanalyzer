# DEÜ Katalog Scraper

`public/data/` altındaki ders verisini üretir. Bağımlılık yok, Python 3 yeterli.

## Çalıştırma

```bash
# Tüm katalog (655 program, yaklaşık 6-8 dakika)
python3 tools/scraper/scrape.py

# Tek veya birkaç program (hızlı test)
python3 tools/scraper/scrape.py 1210 1081

# Başka bir katalog yılı
DEU_CATALOG_YEAR=2024-2025 python3 tools/scraper/scrape.py
```

Çıkış kodu 0 ise tüm kontroller geçmiştir. 1 ise raporun sonundaki
"Bos/hatali program" listesine ve regresyon satırlarına bakın.

## Üretilen dosyalar

- `public/data/index.json` - program listesi (seviye, fakülte, bölüm, ders sayısı)
- `public/data/programs/<id>.json` - tek programın ders planı

## Kaynak ve nezaket

Kaynak: `https://debis.deu.edu.tr/ders-katalog/<yıl>/tr/`

`robots.txt` yalnızca 2013-2014 ile 2024-2025 arası eski katalogları disallow ediyor,
güncel katalog serbest. Yine de istekler tek eşzamanlılıkla ve aralarında 0.2 saniye
bekleyerek yapılıyor. Bu ayarları düşürmeyin.

## Parser'ın bildiği HTML varyasyonları

Katalog sayfaları tek tip değil. Aşağıdakilerin hepsi canlı olarak gözlemlendi:

1. **Dönem bazlı** başlıklar: `1 .Dönem:`, `2. Dönem:`, `3.Dönem:` (nokta ve boşluk tutarsız)
2. **Yıl bazlı** başlıklar: `1. Yıl:` (Tıp `1081`, Hukuk `1139`)
3. **Doktora varyantı** (`10005`): satırlar `<tr align="left">`, hücreler `<td>` yerine
   `<th>`, dönem sütunu `G/B/H` yerine `Z`, tek bir "Tüm Dersler" bloğu
4. Katalog listesinde yer alıp sayfası 404 dönen programlar (birkaç yüksek lisans programı)
5. Ağaç derinliği fakülteye göre değişiyor: bazı fakültelerde
   Fakülte > Bölüm > Program, bazılarında Fakülte > Program

### Seçmeli havuzu başlıkları (üç ayrı biçim)

`classify_section` bunların hepsini `pool` olarak tanımak zorunda:

| Başlık | Anlamı |
|---|---|
| `3 .Dönem: Seçmeli Dersler` | o dönemin havuzu |
| `1 .Dönem Seçmeli:` | aynı şey, farklı yazım (çoğunlukla lisansüstü) |
| `HER DÖNEM AKTS'YE GÖRE SEÇİLEBİLİR DERSLER` | dönemi olmayan havuz, `poolScope: "any"` |
| `SEÇMELİ DERS YOK` | işaret satırı, bölümü değiştirmez |

> Bu üç varyant başta tanınmıyordu ve **sessizce** veri bozuyordu: tanınmayan başlığın
> altındaki dersler bir önceki dönemin zorunlu dersi sayılıyordu. İşletme (İngilizce)
> programı 677 AKTS görünüyordu (gerçek 240), 106 seçmeli ders topluca "8. dönem"e
> yapışmıştı. Düzeltme sonrası havuzu olan program sayısı 188'den **558**'e çıktı.
>
> Bu yüzden scraper, altında ders satırı bulunan **her tanınmayan başlığı** raporlar ve
> çıkış kodunu 1 yapar. Bu kontrolü zayıflatmayın.

## Ders satırı nasıl ayırt ediliyor

9 hücreli her satır ders adayıdır, ama plan tablolarında `SEÇMELİ DERSLER` ve `TOPLAM`
placeholder satırları da 9 hücrelidir.

Kural: **kod hücresinde ders detay linki (`tr_<n>_<n>_<n>.html`) varsa gerçek derstir.**

Bu kural 8 farklı programda doğrulandı: linksiz satırların tamamı placeholder, linki
olmayan gerçek ders kodu yok.

> Ders adına göre filtrelemeyin. Önceki sürüm `TOPLAM` içeren isimleri eliyordu ve
> "Toplam Kalite Yönetimi" gibi **gerçek dersleri** siliyordu.

## Regresyon kontrolü

`EXPECTED_COURSE_COUNTS` sabitindeki sayılar, kod hücresindeki detay linkleri bağımsız
olarak sayılarak doğrulandı. Parser'ı değiştirirseniz bu kontrol tutmalıdır:

| Program | Ders | Neyi korur |
|---|---|---|
| 1210 Bilgisayar Müh. | 126 | dönem bazlı standart plan |
| 1081 Tıp | 52 | yıl bazlı plan |
| 1139 Hukuk | 192 | yıl bazlı + geniş seçmeli havuzu |
| 1176 İşletme | 126 | "Toplam Kalite Yönetimi" tuzağı |
| 10005 Bütünleşik Doktora | 68 | farklı HTML varyantı |
| 1099 BÖTE | 205 | en geniş seçmeli havuzu |

## Dönem hedefleri: `terms` alanı

Her dönemin sonunda katalogda iki özel satır var; ikisi de ders değildir ama bilgi taşır:

- `SEÇMELİ DERSLER` placeholder satırı (kod `-`, linksiz) → `electiveEcts`
- `TOPLAM:` satırı (2 hücreli) → `totalEcts`

**`electiveEcts` ham seçmeli AKTS'si değil, işaretli bir düzeltmedir:**

```
zorunlu blok AKTS + electiveEcts = dönemin TOPLAM'ı
```

Negatif olabilir. 1099 BÖTE 1. döneminde zorunlu blok üç alternatif dil dersini (Almanca,
Fransızca, İngilizce) birden listeliyor ama öğrenci birini alıyor; katalog bunu `-2` ile
dengeliyor: `32 + (-2) = 30`. **`abs()` almayın**, düzeltmeyi bozar.

Arayüz bu yüzden sayısal seçmeli hedefini yalnızca `electiveEcts > 0` iken gösterir.

647 programda bu denklem yalnızca 2 dönemde tutmuyor (katalogun kendi tutarsızlığı);
scraper bunları `TOPLAM satiriyla uyusmayan donem` başlığı altında raporlar.

## Ders türü

`rawType` katalogdaki birebir metni korur. Katalogda 14 farklı değer var: `ZORUNLU`,
`SEÇMELİ`, `TEKNİK SEÇMELİ`, `SOSYAL SEÇMELİ`, `ALAN SEÇMELİ`, `SERBEST SEÇMELİ`,
`ERASMUS`, `BLOK`, `STAJ`, `BİTİRME PROJESİ`, `TEZ`, `SEMİNER`, `UZMANLIK`, boş.

Normalize edilmiş `type` alanı yalnızca mantık için. Önceki sürüm `"SE" in tür and
"MEL" in tür` kontrolü yapıyordu ve `ERASMUS` dersleri **zorunlu** etiketleniyordu.

Seçmeli/zorunlu ayrımı **türe göre değil bölüme göre** yapılır (`elective` bayrağı).
Doktora programlarının tek `Tüm Dersler` bloğu bu sayede olduğu gibi kalır.

## Kredi hesabı

`credit = t + (u + l) / 2`

Yönetmelik MADDE 33. Bu değer öğrenci transkriptindeki "TK / Toplam Kredi" sütunuyla
14 ders üzerinde birebir doğrulandı. GANO bu krediyle hesaplanır, AKTS ile değil.
Ayrıntı için `src/lib/grades.test.ts`.
