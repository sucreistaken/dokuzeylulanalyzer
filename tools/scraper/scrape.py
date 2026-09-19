#!/usr/bin/env python3
"""
DEU Ders Katalogu / Bilgi Paketi scraper.

Kaynak: https://debis.deu.edu.tr/ders-katalog/<yil>/tr/
robots.txt yalnizca 2013-2014 ... 2024-2025 kataloglarini disallow ediyor,
guncel katalog serbest.

Cikti:
  public/data/index.json          -> seviye > fakulte > bolum > program agaci
  public/data/programs/<id>.json  -> tek programin ders plani

Bagimlilik yok, sadece Python 3 stdlib.
"""

import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import OrderedDict

CATALOG_YEAR = os.environ.get("DEU_CATALOG_YEAR", "2025-2026")
BASE = f"https://debis.deu.edu.tr/ders-katalog/{CATALOG_YEAR}/tr/"
USER_AGENT = "Mozilla/5.0 (compatible; dokuzeylul-analyzer/0.1; +https://dokuzeylul.net)"
REQUEST_DELAY = 0.2
MAX_RETRIES = 3

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "public", "data")
PROGRAMS_DIR = os.path.join(OUT_DIR, "programs")

LEVELS = OrderedDict([
    ("lisans", ("tr-c3.html", "Lisans")),
    ("onlisans", ("tr-c4.html", "On Lisans")),
    ("yukseklisans", ("tr-c2.html", "Yuksek Lisans")),
    ("doktora", ("tr-c1.html", "Doktora")),
])

# Bilinen program ders sayilari. Bagimsiz yontemle (kod hucresindeki ders detay
# linklerini sayarak) dogrulandi; parser regresyonunu yakalamak icin.
# 10005 doktora sayfa varyantini (tr align=left + th hucreleri + donem kodu Z) korur.
EXPECTED_COURSE_COUNTS = {
    "1210": 126,   # Bilgisayar Muhendisligi (Ingilizce), donem bazli
    "1081": 52,    # Tip Doktorlugu, yil bazli
    "1139": 192,   # Hukuk, yil bazli + genis secmeli havuzu
    "1176": 126,   # Isletme, "Toplam Kalite Yonetimi" gibi tuzak isimler
    "10005": 68,   # Butunlesik Doktora, farkli HTML varyanti
    "1099": 205,   # BOTE, en genis secmeli havuzlarindan biri
}


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

def fetch(url):
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=45) as resp:
                return resp.read().decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError, OSError) as err:
            last_err = err
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"{url} alinamadi: {last_err}")


# --------------------------------------------------------------------------
# HTML yardimcilari
# --------------------------------------------------------------------------

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


def text(fragment):
    return WS_RE.sub(" ", html.unescape(TAG_RE.sub("", fragment))).strip()


# --------------------------------------------------------------------------
# Seviye sayfasi: ic ice <ul> agacindan fakulte > bolum > program cikar
# --------------------------------------------------------------------------

TREE_TOKEN_RE = re.compile(
    r'(<ul[^>]*>|</ul>|<li[^>]*>|</li>|<a\s+href="bolum_(\d+)_tr\.html"[^>]*>(.*?)</a>)',
    re.S,
)


def parse_level_tree(page):
    """
    Yapi: <ul><li> Fakulte <ul><li> Bolum <ul><li><a>Program</a></li></ul></li></ul></li></ul>
    Program adi <a> icinde; fakulte/bolum adlari <li> acilisi ile ilk alt <ul> arasindaki duz metin.
    """
    start = page.find('<div class="menu"')
    if start == -1:
        raise RuntimeError("menu blogu bulunamadi")
    block = page[start:]

    programs = []
    # labels[depth] = o derinlikteki <li> icin toplanan duz metin etiketi
    labels = []
    depth = 0
    pos = 0
    pending = []  # o an acik <li> icin biriken duz metin

    for m in TREE_TOKEN_RE.finditer(block):
        raw = m.group(1)
        plain = text(block[pos:m.start()])
        if plain:
            pending.append(plain)
        pos = m.end()

        if raw.startswith("<ul"):
            # Ust <li>'nin etiketi kesinlesti, derinlige yaz.
            labels.append(" ".join(pending).strip())
            pending = []
            depth += 1
        elif raw.startswith("</ul"):
            depth -= 1
            if labels:
                labels.pop()
            pending = []
            if depth <= 0:
                break
        elif raw.startswith("<li"):
            pending = []
        elif raw.startswith("</li"):
            pending = []
        elif raw.startswith("<a"):
            # labels[0] = kok (bos), labels[1] = fakulte, labels[2] = bolum
            faculty = labels[1] if len(labels) > 1 else ""
            department = labels[2] if len(labels) > 2 else ""
            programs.append({
                "id": m.group(2),
                "name": text(m.group(3)),
                "faculty": faculty or "Diger",
                "department": department or (faculty or "Diger"),
            })
            pending = []

    return programs


# --------------------------------------------------------------------------
# Program sayfasi: ders plani tablosu
# --------------------------------------------------------------------------

SECTION_RE = re.compile(r'<t[dh][^>]*colspan="9"[^>]*>(.*?)</t[dh]>', re.S)
ROW_RE = re.compile(r"<tr\b[^>]*>(.*?)</tr>", re.S)
CELL_RE = re.compile(r"<t[dh]\b[^>]*>(.*?)</t[dh]>", re.S)

# Donem/yil basligi. Katalogda noktanin ve bosluklarin yeri tutarsiz:
#   "1 .Donem:", "2. Donem:", "3.Donem:", "1. Yil:"
# Secmeli havuzu basligi iki ayri bicimde yaziliyor:
#   "3 .Donem: Secmeli Dersler"  ve  "1 .Donem Secmeli:"
TERM_RE = re.compile(
    r"^\s*(\d+)\s*\.?\s*(D[oö]nem|Y[iı]l)\s*:?\s*"
    r"(Se[cç]meli(?:\s+Dersler)?)?\s*:?\s*$",
    re.I | re.U,
)

# Donemi olmayan, "her donem alinabilir" havuzu:
#   "HER DONEM AKTS'YE GORE SECILEBILIR DERSLER"
ANY_TERM_POOL_RE = re.compile(r"SE[CÇ]ILEB[İI]L[İI]R\s+DERSLER", re.I | re.U)

# Ders plani olmayan programlarda gecen isaret satiri.
NO_ELECTIVE_RE = re.compile(r"SE[CÇ]MEL[İI]\s+DERS\s+YOK", re.I | re.U)

ALL_COURSES_RE = re.compile(r"T[uü]m\s+Dersler", re.I | re.U)

# Ders satirinin ilk hucresi donem kodu: G(uz) B(ahar) H(er ikisi) Z(orunlu bloklarda doktora)
TERM_CODES = {"G", "B", "H", "Z"}

# Gercek ders satirlarinin kod hucresinde ders detay sayfasina link vardir.
# "SECMELI DERSLER" / "TOPLAM" gibi placeholder satirlarda link yoktur.
# 8 farkli programda dogrulandi: linksiz satirlarin hepsi placeholder, linki olmayan
# gercek ders kodu yok. Isim veya AKTS uzerinden filtrelemek "Toplam Kalite Yonetimi"
# gibi gercek dersleri eliyordu.
COURSE_LINK_RE = re.compile(r'href="(tr_\d+_\d+_(\d+)\.html)"')


def normalize_int(value, default=0):
    value = value.replace(",", ".").strip()
    m = re.match(r"^-?\d+(\.\d+)?$", value)
    if not m:
        return default
    return float(value) if "." in value else int(value)


def classify_section(title):
    """
    Bir colspan=9 basligini siniflandirir.

    Doner: (kind, term, unit, pool_scope)
      kind: 'term'  -> o donemin zorunlu blogu
            'pool'  -> secmeli havuzu
            'all'   -> tek blok ("Tum Dersler", doktora programlari)
            'marker'-> "SECMELI DERS YOK" gibi isaret, bolum degistirmez
            'prose' -> aciklama metni, bolum degistirmez
      pool_scope: 'term' (o donemin havuzu) veya 'any' (her donem alinabilir)

    Bu fonksiyonun eksikligi sessiz veri bozulmasina yol aciyordu: taninmayan
    baslik altindaki dersler bir onceki bolumun zorunlu dersi sayiliyordu.
    Bu yuzden parse_program taninmayan her basligi raporlar.
    """
    stripped = title.strip()

    if NO_ELECTIVE_RE.search(stripped):
        return "marker", None, None, None

    if ANY_TERM_POOL_RE.search(stripped):
        return "pool", None, None, "any"

    m = TERM_RE.match(stripped)
    if m:
        unit = "Yil" if m.group(2).lower().startswith("y") else "Donem"
        term = int(m.group(1))
        if m.group(3):
            return "pool", term, unit, "term"
        return "term", term, unit, None

    if ALL_COURSES_RE.search(stripped):
        return "all", None, None, None

    return "prose", None, None, None


# Ders turu metnini normalize eder. Katalogda 14 farkli deger var; hepsini
# ZORUNLU/SECMELI ikilisine indirgemek "ERASMUS"u yanlislikla zorunlu yapiyordu.
ELECTIVE_TYPE_RE = re.compile(r"SE[CÇ]MEL[İI]|SE[CÇ][İI]ML[İI]K|ERASMUS", re.I | re.U)


def normalize_type(raw_type):
    if not raw_type:
        return "ZORUNLU"
    if ELECTIVE_TYPE_RE.search(raw_type):
        return "SECMELI"
    return "ZORUNLU"


ELECTIVE_PLACEHOLDER_RE = re.compile(r"SE[CÇ]MEL[İI]\s+DERSLER", re.I | re.U)
TOTAL_ROW_RE = re.compile(r"TOPLAM\s*:", re.I | re.U)


def parse_program(program_id):
    """
    Doner: (courses, terms, unknown_titles)

    terms: [{term, unit, electiveEcts, totalEcts}] - katalogun kendi
    "SECMELI DERSLER" ve "TOPLAM:" satirlarindan okunur. electiveEcts o donemde
    kac AKTS secmeli alinmasi gerektigini soyler.
    """
    page = fetch(f"{BASE}bolum_{program_id}_tr.html")

    anchor = page.find("Ders Yap")
    body = page[anchor:] if anchor != -1 else page

    # Basliklari ve ders satirlarini tek gecişte, belge sirasinda isle.
    events = []
    for m in SECTION_RE.finditer(body):
        events.append((m.start(), "section", text(m.group(1))))
    for m in ROW_RE.finditer(body):
        events.append((m.start(), "row", m.group(1)))
    events.sort(key=lambda e: e[0])

    courses = []
    seen = set()
    # term -> {"unit":..., "electiveEcts":..., "totalEcts":...}
    term_info = {}
    # Altinda ders satiri bulunan ama siniflandirilamayan basliklar.
    unknown_titles = {}

    current = ("prose", None, None, None, "")
    pending_unknown = None

    for _, kind, payload in events:
        if kind == "section":
            title = payload
            if not title:
                continue
            sec_kind, term, unit, scope = classify_section(title)
            if sec_kind in ("term", "pool", "all"):
                current = (sec_kind, term, unit, scope, title)
                pending_unknown = None
                if sec_kind == "term" and term is not None:
                    term_info.setdefault(term, {"unit": unit})
            elif sec_kind == "prose":
                # Aciklama metni bolumu degistirmez, ama altinda ders satiri
                # cikarsa bu bir siniflandirma bosluğudur; isaretle.
                pending_unknown = title
            continue

        cells = CELL_RE.findall(payload)

        # "TOPLAM: 30" satiri: 2 hucreli, donem hedef AKTS'sini verir.
        if len(cells) == 2 and TOTAL_ROW_RE.search(text(cells[0])):
            term = current[1]
            if current[0] == "term" and term is not None:
                total = normalize_int(text(cells[1]), default=None)
                if total is not None:
                    term_info.setdefault(term, {"unit": current[2]})["totalEcts"] = total
            continue

        if len(cells) != 9:
            continue

        values = [text(c) for c in cells]
        if values[0] not in TERM_CODES:
            continue

        link = COURSE_LINK_RE.search(cells[2])
        if not link:
            # Linksiz 9 hucreli satir = placeholder. "SECMELI DERSLER" satirinin
            # AKTS hucresi o donemin secmeli gereksinimidir.
            if ELECTIVE_PLACEHOLDER_RE.search(values[3]):
                term = current[1]
                if term is not None:
                    # Bu deger isaretli bir DUZELTME'dir, ham secmeli AKTS'si degil:
                    #   zorunlu bloktaki AKTS + bu deger = donemin TOPLAM'i
                    # Negatif olabiliyor, cunku bazi programlar zorunlu blokta
                    # alternatif dersleri (orn. Almanca/Fransizca/Ingilizce dil
                    # dersinin ucunu birden) listeliyor ama ogrenci birini aliyor.
                    # 1099'da: 32 zorunlu + (-2) = 30 TOPLAM. abs() almak bunu bozar.
                    entry = term_info.setdefault(term, {"unit": current[2]})
                    entry["electiveEcts"] = normalize_int(values[8], default=0)
            continue

        code = values[2]
        name = values[3]
        if not code or not name:
            continue

        if pending_unknown is not None:
            unknown_titles[pending_unknown] = unknown_titles.get(pending_unknown, 0) + 1

        sec_kind, term, unit, scope, section_title = current
        is_pool = sec_kind == "pool"

        t = normalize_int(values[5])
        u = normalize_int(values[6])
        lab = normalize_int(values[7])
        ects = normalize_int(values[8], default=0)

        key = (code, term, is_pool)
        if key in seen:
            continue
        seen.add(key)

        courses.append({
            "id": f"{program_id}:{code}",
            "code": code,
            "name": name,
            "type": normalize_type(values[4]),
            "rawType": values[4],
            "offered": values[0],
            "t": t,
            "u": u,
            "l": lab,
            # Yonetmelik MADDE 33: kredi = teorik + (uygulama + laboratuvar) / 2
            "credit": t + (u + lab) / 2,
            "ects": ects,
            "term": term,
            "termUnit": unit,
            "termLabel": section_title,
            "elective": is_pool,
            "poolScope": scope if is_pool else None,
            "detail": link.group(1),
        })

    # Zorunlu AKTS'yi derslerden hesapla, donem listesini duzenle.
    for c in courses:
        if c["elective"] or c["term"] is None:
            continue
        entry = term_info.setdefault(c["term"], {"unit": c["termUnit"]})
        entry["requiredEcts"] = entry.get("requiredEcts", 0) + c["ects"]

    terms = []
    for term in sorted(term_info):
        info = term_info[term]
        terms.append({
            "term": term,
            "unit": info.get("unit") or "Donem",
            "requiredEcts": info.get("requiredEcts", 0),
            "electiveEcts": info.get("electiveEcts", 0),
            "totalEcts": info.get("totalEcts"),
        })

    return courses, terms, unknown_titles


# --------------------------------------------------------------------------
# Ana akis
# --------------------------------------------------------------------------

def main():
    only = sys.argv[1:] or None

    os.makedirs(PROGRAMS_DIR, exist_ok=True)

    index = []
    all_programs = []

    for level_key, (page_name, level_label) in LEVELS.items():
        print(f"[{level_key}] {page_name} aliniyor...", flush=True)
        page = fetch(BASE + page_name)
        programs = parse_level_tree(page)
        print(f"[{level_key}] {len(programs)} program bulundu", flush=True)
        for p in programs:
            p["level"] = level_key
            p["levelLabel"] = level_label
        all_programs.extend(programs)
        time.sleep(REQUEST_DELAY)

    if only:
        all_programs = [p for p in all_programs if p["id"] in only]
        print(f"Filtre uygulandi: {len(all_programs)} program", flush=True)

    empty = []
    total_courses = 0
    written = {}
    unknown_all = {}
    term_mismatch = []

    for i, prog in enumerate(all_programs, 1):
        pid = prog["id"]
        if pid in written:
            continue
        try:
            courses, terms, unknown = parse_program(pid)
        except Exception as err:  # noqa: BLE001
            print(f"  !! {pid} {prog['name']}: {err}", flush=True)
            empty.append((pid, prog["name"], f"HATA: {err}"))
            continue

        if not courses:
            # Kaynakta ders plani gercekten bos olabiliyor (orn. 9468 Seramik'in
            # planinda yalnizca bir "SECMELI DERSLER" placeholder'i var).
            # Bu programlar index'e yazilmaz ki kullanici bos program secmesin.
            empty.append((pid, prog["name"], "kaynakta ders plani bos"))
            continue

        for title, count in unknown.items():
            entry = unknown_all.setdefault(title, {"courses": 0, "programs": set()})
            entry["courses"] += count
            entry["programs"].add(pid)

        # Katalogun kendi TOPLAM satiriyla tutarlilik kontrolu.
        for t in terms:
            if t["totalEcts"] is None:
                continue
            if t["requiredEcts"] + t["electiveEcts"] != t["totalEcts"]:
                term_mismatch.append(
                    (pid, prog["name"], t["term"], t["requiredEcts"],
                     t["electiveEcts"], t["totalEcts"])
                )

        # Programin resmi toplam AKTS'si: donem hedeflerinin toplami.
        # TOPLAM satiri olmayan donemler icin zorunlu + secmeli kullanilir.
        program_total = sum(
            t["totalEcts"] if t["totalEcts"] is not None
            else t["requiredEcts"] + t["electiveEcts"]
            for t in terms
        ) if terms else 0

        total_courses += len(courses)
        written[pid] = len(courses)

        with open(os.path.join(PROGRAMS_DIR, f"{pid}.json"), "w", encoding="utf-8") as fh:
            json.dump({
                "id": pid,
                "name": prog["name"],
                "faculty": prog["faculty"],
                "department": prog["department"],
                "level": prog["level"],
                "levelLabel": prog["levelLabel"],
                "catalogYear": CATALOG_YEAR,
                "terms": terms,
                "totalEcts": program_total,
                "courses": courses,
            }, fh, ensure_ascii=False, separators=(",", ":"))

        if i % 25 == 0 or i == len(all_programs):
            print(f"  {i}/{len(all_programs)} program islendi", flush=True)
        time.sleep(REQUEST_DELAY)

    for prog in all_programs:
        if prog["id"] in written:
            index.append({
                "id": prog["id"],
                "name": prog["name"],
                "faculty": prog["faculty"],
                "department": prog["department"],
                "level": prog["level"],
                "levelLabel": prog["levelLabel"],
                "courseCount": written[prog["id"]],
            })

    if not only:
        with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8") as fh:
            json.dump({
                "catalogYear": CATALOG_YEAR,
                "source": BASE,
                "programs": index,
            }, fh, ensure_ascii=False, separators=(",", ":"))

    # ---- Rapor ----
    print("\n" + "=" * 60)
    print(f"Katalog yili        : {CATALOG_YEAR}")
    print(f"Yazilan program     : {len(written)}")
    print(f"Toplam ders satiri  : {total_courses}")
    print()
    print(f"Kaynakta eksik      : {len(empty)}  (DEU tarafinda problem, parser degil)")
    for pid, name, why in empty:
        print(f"    - {pid} {name}: {why}")

    print()
    print(f"Siniflandirilamayan baslik : {len(unknown_all)}")
    if unknown_all:
        print("  (bu basliklarin altinda ders var, dersler yanlis bolume yaziliyor)")
        for title, info in sorted(
            unknown_all.items(), key=lambda x: -x[1]["courses"]
        )[:20]:
            print(f"    {info['courses']:>5} ders / {len(info['programs'])} program: {title!r}")

    print()
    print(f"TOPLAM satiriyla uyusmayan donem: {len(term_mismatch)}")
    for row in term_mismatch[:10]:
        pid, name, term, req, ele, tot = row
        print(f"    {pid} {name} / {term}. donem: {req} + {ele} = {req + ele}, katalog {tot}")
    if len(term_mismatch) > 10:
        print(f"    ... ve {len(term_mismatch) - 10} tane daha")

    print("\nRegresyon kontrolu (bagimsiz olarak dogrulanmis ders sayilari):")
    ok = True
    for pid, expected in EXPECTED_COURSE_COUNTS.items():
        got = written.get(pid)
        mark = "OK " if got == expected else "FARK"
        if got != expected:
            ok = False
        print(f"    {mark} {pid}: beklenen {expected}, cikan {got}")

    if unknown_all:
        ok = False

    if ok:
        print("\nSonuc: PARSER KONTROLLERI GECTI")
    else:
        print("\nSonuc: PARSER SORUNU VAR, index.json'a guvenmeyin")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
