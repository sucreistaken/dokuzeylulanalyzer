#!/usr/bin/env python3
"""
Bir YÖK / e-Devlet "Not Döküm Belgesi" (transkript) PDF'inden test fixture'i uretir.

Gercek PDF kisisel veri (T.C. kimlik no, ogrenci no, ad soyad, dogum tarihi,
YÖK barkodu) icerir ve repoya ASLA girmez. Bu script kelime-koordinat akisini
cikarir, kimlik alanlarini maskeler ve testlerin kullanacagi JSON'u yazar.

Kullanim:
    python3 tools/make-edevlet-fixture.py ~/Downloads/transkript.pdf

Cikti:
    src/lib/__fixtures__/edevlet-words.json

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
    os.path.dirname(__file__), "..", "src", "lib", "__fixtures__", "edevlet-words.json"
)

# Kimlik iceren satirlarin etiketleri: bu etiketten sonraki degerler maskelenir.
ID_LABELS = ("Öğrenci No", "Kimlik No", "Adı", "Soyadı", "Doğum Tarihi")

# Maskelenecek token bicimleri (etiketten bagimsiz guvenlik agi).
TCKN_RE = re.compile(r"^\d{10,11}$")          # T.C. kimlik / ogrenci no
DATE_RE = re.compile(r"^\d{2}[./]\d{2}[./]\d{4}$")  # dogum / belge tarihi
TIME_RE = re.compile(r"^\d{2}:\d{2}:\d{2}$")  # olusturma saati
BARCODE_RE = re.compile(r"^[A-Z0-9]{16,22}$")  # YÖK barkodu (YOKTRF0CKX8BSW9UG9)

# Ders kodlari da buyuk harf+rakam olabilir; barkodu onlardan ayirmak icin
# "en az 12 harf/rakam bitisik" siniri kullanilir (ders kodlari daha kisa).


def mask_token(text: str) -> str:
    if TCKN_RE.match(text):
        return "00000000000"[: len(text)]
    if DATE_RE.match(text):
        return "01/01/2000"
    if TIME_RE.match(text):
        return "00:00:00"
    if BARCODE_RE.match(text) and len(text) >= 12:
        return "X" * len(text)
    return text


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
        # Once satirlari topla (kimlik etiketi olan satirin degerini maskelemek icin).
        raw = []
        for w in page.findall(".//x:word", NS):
            text = (w.text or "").strip()
            if not text:
                continue
            raw.append({
                "x": round(float(w.get("xMin")), 2),
                "y": round(float(w.get("yMin")), 2),
                "w": round(float(w.get("xMax")) - float(w.get("xMin")), 2),
                "h": round(float(w.get("yMax")) - float(w.get("yMin")), 2),
                "text": text,
            })

        # Kimlik etiketli satirlarda ":" sonrasi tum degerleri maskele.
        by_row = {}
        for item in raw:
            by_row.setdefault(round(item["y"]), []).append(item)
        for _, items in by_row.items():
            line = " ".join(i["text"] for i in sorted(items, key=lambda z: z["x"]))
            if any(lbl in line for lbl in ID_LABELS) and ":" in line:
                after = False
                for i in sorted(items, key=lambda z: z["x"]):
                    if after and not i["text"].startswith("("):
                        i["text"] = "".join("0" if c.isdigit() else "X" for c in i["text"])
                    if i["text"] == ":":
                        after = True

        # Genel guvenlik agi: kalan kimlik bicimli token'lari maskele.
        for item in raw:
            item["text"] = mask_token(item["text"])

        pages.append({"width": round(width, 2), "height": round(height, 2), "words": raw})

    return pages


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    pages = extract(sys.argv[1])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(pages, f, ensure_ascii=False)
    words = sum(len(p["words"]) for p in pages)
    print(f"Yazildi: {OUT} ({len(pages)} sayfa, {words} kelime)")


if __name__ == "__main__":
    main()
