/**
 * Her program icin statik bir HTML uretir: dist/program/<id>/index.html
 *
 * Neden: uygulama bir Vite SPA, uretilen index.html'in govdesi bos. Google
 * "deu insaat on kosul" aramasinda bu sayfalari bulamaz. Burada uretilen
 * dosyalar #root icine duz metin olarak ders zincirini koyar; JavaScript
 * calisinca React ayni yere interaktif surumu basar.
 *
 * Calistirma: npx tsx tools/prerender.ts   (npm run build zincirinde)
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildGraph, cascade, chainLevels, depth } from '../src/lib/prereq'
import type { CatalogIndex, ProgramData } from '../src/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const DATA = join(ROOT, 'public', 'data')

/** HTML'e gomulen her kullanici/katalog metni bundan gecer. */
const esc = (s: string): string =>
    s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')

/**
 * Sablonun <title>, description ve #root icerigini degistirir.
 *
 * Tek bir kaynak sablon kullanilir (dist/index.html), boylece Vite'in urettigi
 * hash'li asset yollari otomatik olarak dogru kalir.
 */
function render(
    template: string,
    opts: { title: string; description: string; body: string },
): string {
    return template
        .replace(/<title>.*?<\/title>/s, `<title>${esc(opts.title)}</title>`)
        .replace(
            /<meta name="description"[\s\S]*?\/>/,
            `<meta name="description" content="${esc(opts.description)}" />`,
        )
        .replace('<div id="root"></div>', `<div id="root">${opts.body}</div>`)
}

function programBody(program: ProgramData): string {
    const graph = buildGraph(program.courses)
    const roots = [...graph.dependents.keys()]
        .map((code) => ({
            code,
            name: graph.byCode.get(code)?.name ?? code,
            term: graph.byCode.get(code)?.term ?? null,
            locked: cascade(graph, code).length,
            depth: depth(graph, code),
        }))
        .sort((a, b) => b.locked - a.locked || a.code.localeCompare(b.code))

    const head = [
        `<h1>${esc(program.name)} on kosullu dersler</h1>`,
        `<p>${esc(program.faculty)} &middot; ${esc(program.levelLabel)} &middot; `
        + `DEU Ders Katalogu ${esc(program.catalogYear)}</p>`,
    ]

    if (roots.length === 0) {
        // Onkosulsuz programda da anlamli bir sayfa cikmali; bos govde
        // hem kullaniciya hem arama motoruna hicbir sey soylemez.
        head.push(
            '<p>DEU Ders Katalogu bu programin hicbir dersinde on kosul tanimlamamis. '
            + 'Bu, fakultenin kendi ogretim ve sinav uygulama esaslarinda bir kosul '
            + 'olmadigi anlamina gelmez; emin olmak icin danismaniniza sorun.</p>',
        )
        return head.join('\n')
    }

    head.push(
        `<p>${esc(roots[0].code)} ${esc(roots[0].name)} dersinden kalmak `
        + `${roots[0].locked} dersi kilitler.</p>`,
    )

    head.push('<h2>Kalinca en cok ders kilitleyenler</h2>')
    head.push('<ul>')
    for (const r of roots) {
        head.push(
            `<li>${esc(r.code)} ${esc(r.name)}`
            + (r.term !== null ? ` (${r.term}. yariyil)` : '')
            + ` &ndash; ${r.locked} ders kilitler, zincir derinligi ${r.depth}</li>`,
        )
    }
    head.push('</ul>')

    head.push('<h2>On kosul zinciri</h2>')
    const levels = chainLevels(graph)
    levels.forEach((level, i) => {
        head.push(`<h3>${i + 1}. kademe</h3>`)
        head.push('<ul>')
        for (const node of level) {
            const req = node.requires.length
                ? ` &ndash; on kosul: ${esc(node.requires.join(', '))}`
                : ''
            head.push(
                `<li>${esc(node.code)} ${esc(node.name)}`
                + (node.term !== null ? ` (${node.term}. yariyil)` : '')
                + `${req}</li>`,
            )
        }
        head.push('</ul>')
    })

    return head.join('\n')
}

function main(): number {
    let template: string
    try {
        template = readFileSync(join(DIST, 'index.html'), 'utf-8')
    } catch {
        console.error('dist/index.html yok. Once "vite build" calistirin.')
        return 1
    }

    const index: CatalogIndex = JSON.parse(
        readFileSync(join(DATA, 'index.json'), 'utf-8'),
    )

    // index.json'da olmayan program dosyasi kalmis olabilir; yalnizca
    // index'tekiler yayinlanir, kullaniciya gosterilen liste odur.
    const available = new Set(
        readdirSync(join(DATA, 'programs')).map((f) => f.replace(/\.json$/, '')),
    )

    let written = 0
    let skipped = 0
    let withPrereq = 0
    const links: string[] = []

    for (const meta of index.programs) {
        if (!available.has(meta.id)) {
            skipped += 1
            continue
        }

        const program: ProgramData = JSON.parse(
            readFileSync(join(DATA, 'programs', `${meta.id}.json`), 'utf-8'),
        )
        const graph = buildGraph(program.courses)
        if (graph.dependents.size > 0) withPrereq += 1

        const dir = join(DIST, 'program', meta.id)
        mkdirSync(dir, { recursive: true })
        writeFileSync(
            join(dir, 'index.html'),
            render(template, {
                title: `${program.name} on kosullu dersler | DEU Ders Analiz`,
                description:
                    `${program.name} (${program.faculty}) on kosullu dersleri ve `
                    + 'hangi dersten kalinca hangi derslerin kilitlendigi. '
                    + `DEU Ders Katalogu ${program.catalogYear}.`,
                body: programBody(program),
            }),
            'utf-8',
        )
        written += 1
        links.push(
            `<li><a href="/program/${meta.id}">${esc(program.name)}</a> `
            + `&ndash; ${esc(program.faculty)}</li>`,
        )
    }

    // Tarama icin giris sayfasi: bu olmadan arama motoru tekil program
    // sayfalarina giden bir baglanti bulamaz.
    mkdirSync(join(DIST, 'program'), { recursive: true })
    writeFileSync(
        join(DIST, 'program', 'index.html'),
        render(template, {
            title: 'Bolumlere gore on kosullu dersler | DEU Ders Analiz',
            description:
                'Dokuz Eylul Universitesi programlarinin on kosullu ders zincirleri. '
                + 'Hangi dersten kalinca hangi dersler kilitlenir.',
            body:
                '<h1>Bolumlere gore on kosullu dersler</h1>\n<ul>\n'
                + links.join('\n')
                + '\n</ul>',
        }),
        'utf-8',
    )

    console.log(`Prerender: ${written} program sayfasi yazildi`)
    console.log(`  on kosulu olan program : ${withPrereq}`)
    if (skipped) console.log(`  program dosyasi eksik  : ${skipped}`)
    return 0
}

process.exit(main())
