/**
 * Aracı barındıran sayfada (dokuzeylul.net/ders-analizi) çalışan betik.
 *
 * Neden ayrı bir dosya: düzenin bir yarısı iframe'in dışında olmak zorunda.
 * iframe içindeki `position: sticky` ya da `fixed`, iframe'in kendi görüş
 * alanına göre konumlanır; üst sayfa kaydırıldığında takip edemez. Özet rayı
 * bu yüzden üst sayfada çizilir. Kod yine de bu repoda durur ve araçla
 * birlikte dağıtılır; forum tarafında yalnızca tek satırlık bir <script>
 * etiketi kalır, bir daha değişmesi gerekmez.
 *
 * Forum widget'ına konulacak tek şey:
 *
 *   <div id="deu-arac-duzen">
 *     <aside id="deu-ozet-ray" hidden></aside>
 *     <div id="deu-dersanalizi-wrapper">
 *       <iframe id="deu-dersanalizi-frame"
 *               src="https://deu.kadiray.com/?embed=1"></iframe>
 *     </div>
 *   </div>
 *   <script src="https://deu.kadiray.com/embed-host.js"></script>
 */
(function () {
    'use strict'

    var ARAC = 'https://deu.kadiray.com'
    var KAYNAK = 'deu-ders-analiz'
    var RAY_MESAJI = 'deu-forum:summary-rail'

    var STIL = [
        /* Bu sayfada sağ menü boş duruyor, yeri araca bırak. */
        'body.page-ders-analizi .sidebar-right { display: none !important; }',
        'body.page-ders-analizi #content.container-lg {',
        '  max-width: none !important;',
        '  padding-left: 16px !important;',
        '  padding-right: 16px !important;',
        '}',

        /* Ray ile araç yan yana. Ray sticky: gerçekten yer kaplar, hiçbir
           şeyin üstüne binmez, ama sayfa kayarken ekranda kalır. */
        '#deu-arac-duzen { display: flex; align-items: flex-start; gap: 16px; }',

        '#deu-ozet-ray {',
        '  position: sticky;',
        '  top: 16px;',
        '  flex: 0 0 168px;',
        '  width: 168px;',
        '  max-height: calc(100vh - 32px);',
        '  overflow-y: auto;',
        '  display: flex;',
        '  flex-direction: column;',
        '  gap: 18px;',
        '  padding: 16px;',
        '  border: 1px solid #e5e7eb;',
        '  border-radius: 12px;',
        '  background: #fff;',
        '  font-size: 14px;',
        '}',
        '#deu-ozet-ray[hidden] { display: none; }',

        '#deu-dersanalizi-wrapper {',
        '  flex: 1 1 auto;',
        '  min-width: 0;',
        '  border: 1px solid #e5e7eb;',
        '  border-radius: 12px;',
        '  overflow: hidden;',
        '  background: #fff;',
        '}',

        /* Yükseklik araçtan postMessage ile gelir; bu yalnızca ilk açılış değeri. */
        '#deu-dersanalizi-frame { display: block; width: 100%; height: 1600px; border: 0; }',

        'html[data-bs-theme="dark"] #deu-dersanalizi-wrapper,',
        'html[data-bs-theme="dark"] #deu-ozet-ray { background: #18181b; border-color: #3f3f46; }',

        '#deu-ozet-ray .ray-program {',
        '  font-weight: 500; color: #374151;',
        '  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;',
        '}',
        'html[data-bs-theme="dark"] #deu-ozet-ray .ray-program { color: #d4d4d8; }',
        '#deu-ozet-ray .ray-etiket {',
        '  font-size: 11px; text-transform: uppercase; letter-spacing: .04em;',
        '  color: #9ca3af; line-height: 1.2;',
        '}',
        '#deu-ozet-ray .ray-deger { font-size: 18px; font-weight: 600; line-height: 1.25; }',
        '#deu-ozet-ray .ray-ek { font-size: 13px; font-weight: 400; color: #9ca3af; }',
        '#deu-ozet-ray .ray-onur {',
        '  align-self: flex-start; border: 1px solid #b7eb8f; background: #f6ffed;',
        '  color: #389e0d; border-radius: 4px; padding: 2px 8px; font-size: 12px;',
        '}',

        /* Dar ekranda yan yana sığmıyor; ray üstte yatay şeride dönüşür. */
        '@media (max-width: 991px) {',
        '  #deu-arac-duzen { flex-direction: column; }',
        '  #deu-ozet-ray {',
        '    position: static; flex: none; width: 100%; max-height: none;',
        '    flex-direction: row; flex-wrap: wrap; gap: 20px; align-items: center;',
        '  }',
        '  #deu-ozet-ray .ray-program { flex: 1 0 100%; }',
        '  #deu-dersanalizi-frame { height: 2200px; }',
        '}',
    ].join('\n')

    function stiliEkle() {
        if (document.getElementById('deu-embed-host-stil')) return
        var s = document.createElement('style')
        s.id = 'deu-embed-host-stil'
        s.textContent = STIL
        document.head.appendChild(s)
    }

    /** Metni HTML'e gömmeden önce kaçır: program adı araçtan gelen veridir. */
    function kacir(deger) {
        return String(deger == null ? '' : deger)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    }

    function metrik(etiket, deger, renk, ek) {
        return '<div>'
            + '<div class="ray-etiket">' + kacir(etiket) + '</div>'
            + '<div class="ray-deger"' + (renk ? ' style="color:' + kacir(renk) + '"' : '') + '>'
            + kacir(deger)
            + (ek ? '<span class="ray-ek"> ' + kacir(ek) + '</span>' : '')
            + '</div></div>'
    }

    function baslat() {
        var frame = document.getElementById('deu-dersanalizi-frame')
        var ray = document.getElementById('deu-ozet-ray')
        if (!frame || !ray) return

        stiliEkle()

        // Araca "özeti ben çizerim" de; o da kendi iç çubuğunu gizlesin.
        function bildir() {
            try {
                frame.contentWindow.postMessage({ type: RAY_MESAJI }, ARAC)
            } catch (e) {
                // Araç henüz yüklenmemiş olabilir; tekrar denenecek.
            }
        }
        frame.addEventListener('load', bildir)
        var tekrar = setInterval(bildir, 800)
        setTimeout(function () { clearInterval(tekrar) }, 12000)

        function ciz(o) {
            if (!o) { ray.hidden = true; return }
            var html = '<div class="ray-program" title="' + kacir(o.programName) + '">'
                + kacir(o.programName) + '</div>'
                + metrik('GANO', o.gpa, '#3f8600')
                + metrik('Kazanılan AKTS', o.earnedEcts, '#096dd9',
                         '/ ' + o.totalEcts + ' (' + o.ectsPercent + '%)')
                + metrik('Geçilen Ders', o.passedCourses, '#3f8600')
                + metrik('Kalan Ders', o.remainingCourses, '#eb2f96')
            if (o.honor) {
                html += '<div class="ray-onur">' + kacir(o.honor) + ' öğrencisi</div>'
            }
            ray.innerHTML = html
            ray.hidden = false
        }

        window.addEventListener('message', function (ev) {
            if (ev.origin !== ARAC) return
            var d = ev.data
            if (!d || d.source !== KAYNAK) return

            if (typeof d.height === 'number' && d.height > 400 && d.height < 20000) {
                frame.style.height = d.height + 'px'
            }
            if (d.ready) bildir()
            if ('summary' in d) ciz(d.summary)
        })
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', baslat)
    } else {
        baslat()
    }
})();
