#!/usr/bin/env python3
"""
Bir DEU transkript PDF'inden test fixture'i uretir.

Gercek PDF kisisel veri (T.C. kimlik no, ogrenci no, ad soyad, YOKSIS ID) icerir
ve repoya ASLA girmez. Bu script kelime-koordinat akisini cikarir, ust bilgi
alanlarindaki kisisel verileri maskeler ve testlerin kullanacagi JSON'u yazar.

Kullanim:
    python3 tools/make-transcript-fixture.py ~/Downloads/doc-3.pdf

Cikti:
    src/lib/__fixtures__/transcript-words.json

Bagimlilik: poppler-utils (pdftotext). macOS: brew install poppler
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

NS = {"x": "http://www.w3.org/1999/xhtml"}
OUT = os.path.join(
    os.path.dirname(__file__), "..", "src", "lib", "__fixtures__", "transcript-words.json"
)

# Tablo bu y'nin altinda basliyor; ustu ust bilgi (kisisel veri) bolgesi.
HEADER_Y_LIMIT = 125.0

# Ust bilgide birakilacak tek alan: program adi (eslesme uyarisi icin gerekli).
KEEP_IN_HEADER = re.compile(
    r"^(PROGRAM|BİRİMİ|:|Mühendislik|Fakültesi|Bilgisayar|Mühendisliği|\(İngilizce\)|"
    r"ÖĞRENCİ|NOT|DURUM|BELGESİ|TÜRKİYE|CUMHURİYETİ|DOKUZ|EYLÜL|ÜNİVERSİTESİ)$"
)


def extract(pdf_path):
    with tempfile.TemporaryDirectory() as tmp:
        xml_path = os.path.join(tmp, "out.xml")
        subprocess.run(
            ["pdftotext", "-bbox-layout", pdf_path, xml_path],
            check=True, capture_output=True,
        )
        tree = ET.parse(xml_path)

    pages = []
    for page in tree.findall(".//x:page", NS):
        width = float(page.get("width"))
        height = float(page.get("height"))
        words = []
        for w in page.findall(".//x:word", NS):
            text = (w.text or "").strip()
            if not text:
                continue
            x0 = float(w.get("xMin"))
            y0 = float(w.get("yMin"))
            x1 = float(w.get("xMax"))
            y1 = float(w.get("yMax"))

            # --- Kisisel veri maskesi ---------------------------------------
            # Ust bilgi bolgesinde program/kurum adi disindaki her sey atilir.
            # Boylece TCKN, ogrenci no, ad soyad, YOKSIS ID fixture'a girmez.
            if y0 < HEADER_Y_LIMIT and not KEEP_IN_HEADER.match(text):
                continue
            # Guvenlik agi: nerede olursa olsun uzun sayi dizisi maskelenir.
            if re.fullmatch(r"\d{5,}", text):
                text = "[MASKELI]"

            words.append({
                "x": round(x0, 2),
                "y": round(y0, 2),
                "w": round(x1 - x0, 2),
                "h": round(y1 - y0, 2),
                "text": text,
            })
        pages.append({"width": width, "height": height, "words": words})
    return pages


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        return 1

    pages = extract(sys.argv[1])

    # Maskeleme dogrulamasi: fixture'da kimlik izi kalmadigini kanitla.
    blob = json.dumps(pages, ensure_ascii=False)
    leaks = re.findall(r"\b\d{5,}\b", blob)
    if leaks:
        print(f"HATA: fixture'da maskelenmemis sayi dizisi var: {set(leaks)}")
        return 1

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(pages, fh, ensure_ascii=False, indent=1)

    total = sum(len(p["words"]) for p in pages)
    print(f"{len(pages)} sayfa, {total} kelime yazildi -> {os.path.relpath(OUT)}")
    print("Kimlik verisi maskelendi (uzun sayi dizisi bulunamadi).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
