'use strict';

// ===========================
// CONSTANTS
// ===========================
const PAGE_SIZE = 24;
const CURRENT_YEAR = new Date().getFullYear();
const SECTIONS = ['cars', 'drivers', 'champions', 'records'];
const DATA_SECTIONS = ['cars', 'drivers', 'champions'];

const ERAS = [
    { id: '1950-1960', label: '1950–60 · Front-engine pioneers', from: 1950, to: 1960 },
    { id: '1961-1976', label: '1961–76 · Rear-engine & Cosworth', from: 1961, to: 1976 },
    { id: '1977-1988', label: '1977–88 · Ground effect & turbo', from: 1977, to: 1988 },
    { id: '1989-2005', label: '1989–2005 · V10 & electronics', from: 1989, to: 2005 },
    { id: '2006-2013', label: '2006–13 · V8 era', from: 2006, to: 2013 },
    { id: '2014-9999', label: '2014 – present · Hybrid era', from: 2014, to: 9999 }
];

const TEAM_COLORS = [
    ['ferrari', '#e10600'], ['mercedes', '#00b3a4'], ['red bull', '#3671c6'],
    ['mclaren', '#ff8000'], ['williams', '#2f6bff'], ['lotus', '#c9a400'],
    ['brabham', '#2e7d32'], ['benetton', '#00a3e0'], ['renault', '#ffd800'],
    ['alpine', '#0093cc'], ['alfa', '#9b0000'], ['cooper', '#00734a'],
    ['brawn', '#b6d900'], ['tyrrell', '#0057b8'], ['brm', '#3a7d44'],
    ['matra', '#0050a0'], ['maserati', '#3b5fb4'], ['aston', '#00665e']
];

// ===========================
// GLOBAL STATE
// ===========================
const state = {
    section: 'cars',
    data: { cars: [], drivers: [], champions: [] },
    status: { cars: 'loading', drivers: 'loading', champions: 'loading' },
    filters: { q: '', year: '', team: '', era: '', sort: '' },
    shown: PAGE_SIZE,
    compare: []
};

// ===========================
// DOM ELEMENTS
// ===========================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const navButtons = $$('.nav-btn');
const searchInput = $('#searchInput');
const filterYear = $('#filterYear');
const filterTeam = $('#filterTeam');
const filterEra = $('#filterEra');
const sortSelect = $('#sortSelect');
const clearBtn = $('#clearFilters');
const controlsEl = $('#controls');
const statusRow = $('#statusRow');
const resultCount = $('#resultCount');
const loadMoreBtn = $('#loadMore');
const compareBar = $('#compareBar');
const compareText = $('#compareText');
const compareOpen = $('#compareOpen');
const modal = $('#modal');
const modalBody = $('#modalBody');

// ===========================
// HELPERS
// ===========================
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Own-property read: avoids the inherited Object.prototype.constructor trap
const own = (obj, key) => (Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined);

const hasValue = (v) => v !== null && v !== undefined && v !== '';
const toNum = (v) => (hasValue(v) && !Number.isNaN(Number(v)) ? Number(v) : null);
const hay = (vals) => vals.filter(hasValue).join(' ').toLowerCase();

function debounce(fn, ms) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

function teamColor(team) {
    const t = String(team || '').toLowerCase();
    const hit = TEAM_COLORS.find(([k]) => t.includes(k));
    return hit ? hit[1] : '#e10600';
}

function parseSpan(str) {
    const s = String(str ?? '');
    const m = s.match(/\d{4}/g) || [];
    if (!m.length) return null;
    const start = Number(m[0]);
    let end = Number(m[m.length - 1]);
    if (/present|now|current/i.test(s)) end = CURRENT_YEAR;
    return [start, Math.max(start, end)];
}

function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2)
        .map((w) => w[0].toUpperCase()).join('');
}

// Inline SVG fallback (no external placeholder service needed)
function fallbackImg(label, team) {
    const c = teamColor(team);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">` +
        `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="#1f1f2e"/><stop offset="1" stop-color="#0a0a0a"/></linearGradient></defs>` +
        `<rect width="400" height="200" fill="url(#g)"/>` +
        `<rect y="184" width="400" height="16" fill="${c}"/>` +
        `<text x="200" y="118" text-anchor="middle" font-family="Arial,sans-serif" font-size="56" font-weight="800" fill="${c}">${esc(label)}</text>` +
        `</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function imgTag(item, d, cls) {
    const fb = fallbackImg(d.label, d.team);
    const src = item.image ? item.image : fb;
    return `<img class="${cls}" src="${esc(src)}" data-fallback="${esc(fb)}" alt="" loading="lazy" width="400" height="200">`;
}

// Swap broken images for the inline fallback (error events don't bubble, so capture)
document.addEventListener('error', (e) => {
    const el = e.target;
    if (el && el.tagName === 'IMG' && el.dataset.fallback && !el.dataset.failed) {
        el.dataset.failed = '1';
        el.src = el.dataset.fallback;
    }
}, true);

// ===========================
// SECTION CONFIG
// ===========================
const byName = (a, b) => a.name.localeCompare(b.name);

const CONFIG = {
    cars: {
        file: 'data/cars.json',
        noun: 'cars',
        normalize(i) {
            i.name = String(i.name ?? 'Unnamed car');
            i.year = Number(i.year) || 0;
            i._constructor = [own(i, 'constructor'), own(i, 'constructorName')].find((v) => typeof v === 'string' && v);
            i._span = i.year ? [i.year, i.year] : null;
            i._teams = [i.team].filter(Boolean);
            i._hay = hay([i.name, i.team, i.year, i.engine, i._constructor]);
            return i;
        },
        sorts: [
            { id: 'year-desc', label: 'Year (newest first)', fn: (a, b) => b.year - a.year || byName(a, b) },
            { id: 'year-asc', label: 'Year (oldest first)', fn: (a, b) => a.year - b.year || byName(a, b) },
            { id: 'name-asc', label: 'Name (A–Z)', fn: byName }
        ],
        card: (i) => ({
            title: i.name, subtitle: i.year || '', label: 'F1', team: i.team,
            rows: [['Team', i.team], ['Engine', i.engine], ['Constructor', i._constructor]]
        }),
        detail: (i) => ({
            rows: [['Year', i.year || ''], ['Team', i.team], ['Engine', i.engine], ['Constructor', i._constructor],
                ['Power', i.power], ['Weight', i.weight], ['Notable', i.notable]],
            text: i.notes,
            links: []
        })
    },

    drivers: {
        file: 'data/drivers.json',
        noun: 'drivers',
        normalize(i) {
            i.name = String(i.name ?? 'Unnamed driver');
            i.teams = Array.isArray(i.teams) ? i.teams : (i.teams ? [i.teams] : []);
            i.titles = toNum(i.championships);
            i.wins = toNum(i.wins);
            i.poles = toNum(i.poles);
            i.podiums = toNum(i.podiums);
            i._span = parseSpan(i.years);
            i._teams = i.teams;
            i._hay = hay([i.name, i.nationality, i.teams.join(' '), i.years]);
            return i;
        },
        sorts: [
            { id: 'name-asc', label: 'Name (A–Z)', fn: byName },
            { id: 'titles-desc', label: 'Most titles', fn: (a, b) => (b.titles ?? 0) - (a.titles ?? 0) || byName(a, b) },
            { id: 'wins-desc', label: 'Most wins', fn: (a, b) => (b.wins ?? -1) - (a.wins ?? -1) || byName(a, b) },
            { id: 'debut-asc', label: 'Earliest debut', fn: (a, b) => (a._span?.[0] ?? 9999) - (b._span?.[0] ?? 9999) || byName(a, b) }
        ],
        card: (i) => ({
            title: i.name, subtitle: i.nationality || '', label: initials(i.name),
            team: i.primaryTeam || i.teams[i.teams.length - 1],
            rows: [['Active', i.years], ['Teams', i.teams.join(', ')], ['Titles', i.titles]]
        }),
        detail(i) {
            const titleYears = state.data.champions
                .filter((c) => c.driver.toLowerCase() === i.name.toLowerCase())
                .map((c) => c.year).sort((a, b) => a - b);
            return {
                rows: [['Nationality', i.nationality], ['Active', i.years], ['Teams', i.teams.join(', ')],
                    ['Titles', i.titles], ['Title years', titleYears.join(', ')],
                    ['Wins', i.wins], ['Pole positions', i.poles], ['Podiums', i.podiums]],
                text: i.bio,
                links: []
            };
        }
    },

    champions: {
        file: 'data/champions.json',
        noun: 'champions',
        normalize(i) {
            i.year = Number(i.year) || 0;
            i.driver = String(i.driver ?? 'Unknown');
            i.team = String(i.team ?? '');
            i.points = hasValue(i.points) ? i.points : null;
            i._span = i.year ? [i.year, i.year] : null;
            i._teams = [i.team].filter(Boolean);
            i._hay = hay([i.year, i.driver, i.team, i.car]);
            return i;
        },
        sorts: [
            { id: 'year-desc', label: 'Year (newest first)', fn: (a, b) => b.year - a.year },
            { id: 'year-asc', label: 'Year (oldest first)', fn: (a, b) => a.year - b.year },
            { id: 'points-desc', label: 'Most points', fn: (a, b) => (toNum(b.points) ?? -1) - (toNum(a.points) ?? -1) },
            { id: 'driver-asc', label: 'Driver (A–Z)', fn: (a, b) => a.driver.localeCompare(b.driver) || a.year - b.year }
        ],
        card: (i) => ({
            title: `${i.year} Champion`, subtitle: i.driver, label: String(i.year), team: i.team,
            rows: [['Team', i.team], ['Car', i.car], ['Points', i.points]]
        }),
        detail(i) {
            const links = [];
            const drv = state.data.drivers.find((d) => d.name.toLowerCase() === i.driver.toLowerCase());
            const car = state.data.cars.find((c) => String(i.car || '').toLowerCase() === c.name.toLowerCase());
            if (drv) links.push({ label: `Driver profile: ${drv.name}`, id: drv._id });
            if (car) links.push({ label: `Car: ${car.name}`, id: car._id });
            return {
                rows: [['Season', i.year], ['Driver', i.driver], ['Team', i.team], ['Car', i.car], ['Points', i.points]],
                text: i.notes,
                links
            };
        }
    }
};

// ===========================
// LOAD DATA (each file independently)
// ===========================
async function loadOne(key) {
    state.status[key] = 'loading';
    try {
        const res = await fetch(CONFIG[key].file);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!Array.isArray(json)) throw new Error('Expected a JSON array');
        state.data[key] = json.map((item, idx) => {
            const obj = (item && typeof item === 'object') ? item : {};
            const n = CONFIG[key].normalize(obj);
            n._id = `${key}-${idx}`;
            return n;
        });
        state.status[key] = 'ok';
    } catch (err) {
        console.error(`Error loading ${CONFIG[key].file}:`, err);
        state.data[key] = [];
        state.status[key] = 'error';
    }
}

async function loadData() {
    render();
    await Promise.all(DATA_SECTIONS.map(loadOne));
    populateControls();
    render();
}

// ===========================
// FILTERING & SORTING
// ===========================
function getResults() {
    const cfg = CONFIG[state.section];
    const f = state.filters;
    const q = f.q.trim().toLowerCase();
    const y = f.year ? Number(f.year) : null;
    const era = ERAS.find((e) => e.id === f.era);

    const list = state.data[state.section].filter((i) => {
        if (q && !i._hay.includes(q)) return false;
        const sp = i._span;
        if (y !== null && !(sp && sp[0] <= y && y <= sp[1])) return false;
        if (era && !(sp && sp[0] <= era.to && sp[1] >= era.from)) return false;
        if (f.team && !i._teams.includes(f.team)) return false;
        return true;
    });

    const sorter = cfg.sorts.find((s) => s.id === f.sort) || cfg.sorts[0];
    return list.sort(sorter.fn);
}

function hasActiveFilters() {
    const f = state.filters;
    return Boolean(f.q || f.year || f.team || f.era || f.sort);
}

// ===========================
// CONTROLS (selects depend on current section)
// ===========================
function fillSelect(el, firstLabel, options, current) {
    el.innerHTML = '';
    if (firstLabel !== null) el.add(new Option(firstLabel, ''));
    options.forEach(([value, label]) => el.add(new Option(label, value)));
    const exists = Array.from(el.options).some((o) => o.value === current);
    el.value = exists ? current : (firstLabel !== null ? '' : (options[0]?.[0] ?? ''));
    return el.value;
}

function populateControls() {
    const s = state.section;
    if (s === 'records') return;
    const cfg = CONFIG[s];
    const items = state.data[s];

    const years = new Set();
    items.forEach((i) => {
        if (i._span) for (let y = i._span[0]; y <= i._span[1]; y++) years.add(y);
    });
    const yearOpts = [...years].sort((a, b) => b - a).map((y) => [String(y), String(y)]);
    const teams = [...new Set(items.flatMap((i) => i._teams))].sort((a, b) => a.localeCompare(b));

    state.filters.year = fillSelect(filterYear, s === 'drivers' ? 'Any Year Active' : 'All Years', yearOpts, state.filters.year);
    state.filters.team = fillSelect(filterTeam, 'All Teams', teams.map((t) => [t, t]), state.filters.team);
    state.filters.era = fillSelect(filterEra, 'All Eras', ERAS.map((e) => [e.id, e.label]), state.filters.era);

    const sortVal = fillSelect(sortSelect, null, cfg.sorts.map((x) => [x.id, x.label]), state.filters.sort || cfg.sorts[0].id);
    state.filters.sort = sortVal === cfg.sorts[0].id ? '' : sortVal;

    searchInput.value = state.filters.q;
    searchInput.placeholder = {
        cars: 'Search by car, team, engine or year...',
        drivers: 'Search by name, nationality or team...',
        champions: 'Search by driver, team, car or year...'
    }[s];
}

// ===========================
// URL SYNC
// ===========================
function writeURL(push) {
    const p = new URLSearchParams();
    if (state.section !== 'cars') p.set('section', state.section);
    Object.entries(state.filters).forEach(([k, v]) => { if (v) p.set(k, v); });
    const qs = p.toString();
    const url = location.pathname + (qs ? `?${qs}` : '');
    try {
        history[push ? 'pushState' : 'replaceState'](null, '', url);
    } catch (e) { /* e.g. file:// */ }
}

function readURL() {
    const p = new URLSearchParams(location.search);
    const sec = p.get('section');
    state.section = SECTIONS.includes(sec) ? sec : 'cars';
    state.filters = {
        q: p.get('q') || '', year: p.get('year') || '', team: p.get('team') || '',
        era: p.get('era') || '', sort: p.get('sort') || ''
    };
    state.shown = PAGE_SIZE;
}

// ===========================
// SECTION SWITCHING
// ===========================
function switchSection(section, push = true, focusTab = false) {
    state.section = section;
    state.filters = { q: '', year: '', team: '', era: '', sort: '' };
    state.shown = PAGE_SIZE;
    populateControls();
    writeURL(push);
    render();
    if (focusTab) $(`#tab-${section}`).focus();
}

// ===========================
// RENDERING
// ===========================
function render() {
    const s = state.section;

    // Tabs + panels
    navButtons.forEach((btn) => {
        const active = btn.dataset.section === s;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', String(active));
        btn.tabIndex = active ? 0 : -1;
    });
    $$('.content-section').forEach((sec) => sec.classList.toggle('active', sec.id === `${s}-section`));

    const isRecords = s === 'records';
    controlsEl.hidden = isRecords;
    resultCount.hidden = isRecords;
    clearBtn.hidden = isRecords || !hasActiveFilters();
    filterYear.setAttribute('aria-label', s === 'drivers' ? 'Filter by year active' : 'Filter by year');

    if (isRecords) {
        loadMoreBtn.hidden = true;
        renderRecords();
    } else {
        renderGrid();
    }
    updateCompareBar();
}

function skeletons(n) {
    return Array.from({ length: n }, () => '<li class="skeleton" aria-hidden="true"></li>').join('');
}

function cardHTML(item) {
    const s = state.section;
    const d = CONFIG[s].card(item);
    const rows = d.rows.filter(([, v]) => hasValue(v))
        .map(([l, v]) => `<span class="card-detail"><strong>${esc(l)}:</strong> <span>${esc(v)}</span></span>`).join('');
    const toggle = s === 'drivers'
        ? `<label class="compare-toggle"><input type="checkbox" data-compare="${esc(item._id)}"${state.compare.includes(item._id) ? ' checked' : ''}> Compare<span class="sr-only"> ${esc(item.name)}</span></label>`
        : '';
    return `<li class="card-wrap" style="--team:${teamColor(d.team)}">
        <button type="button" class="card" data-open="${esc(item._id)}" aria-haspopup="dialog">
            ${imgTag(item, d, 'card-image')}
            <span class="card-content">
                <span class="card-title">${esc(d.title)}</span>
                <span class="card-subtitle">${esc(d.subtitle)}</span>
                <span class="card-info">${rows}</span>
            </span>
        </button>
        ${toggle}
    </li>`;
}

function renderGrid() {
    const s = state.section;
    const grid = $(`#${s}-grid`);
    const status = state.status[s];

    if (status === 'loading') {
        grid.innerHTML = skeletons(8);
        resultCount.textContent = 'Loading…';
        loadMoreBtn.hidden = true;
        return;
    }
    if (status === 'error') {
        grid.innerHTML = `<li class="error-box">Couldn't load <code>${esc(CONFIG[s].file)}</code>.
            Check the file exists and is valid JSON, and that you're running the site from a web server.<br>
            <button type="button" class="btn" data-retry="${s}">Try again</button></li>`;
        resultCount.textContent = '';
        loadMoreBtn.hidden = true;
        return;
    }

    const results = getResults();
    const total = state.data[s].length;
    const visible = results.slice(0, state.shown);

    if (!results.length) {
        grid.innerHTML = `<li class="no-results">No ${CONFIG[s].noun} found.
            ${hasActiveFilters() ? '<br><button type="button" class="btn btn-ghost" data-clear>Clear filters</button>' : ''}</li>`;
    } else {
        grid.innerHTML = visible.map(cardHTML).join('');
    }

    resultCount.textContent = `Showing ${visible.length} of ${results.length} ${CONFIG[s].noun}` +
        (results.length !== total ? ` (filtered from ${total})` : '');
    loadMoreBtn.hidden = visible.length >= results.length;
}

// ===========================
// RECORDS / STATS
// ===========================
function tally(list, keyFn) {
    const m = new Map();
    list.forEach((x) => m.set(keyFn(x), (m.get(keyFn(x)) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function leaders(entries) {
    if (!entries.length) return { count: 0, names: [] };
    const max = entries[0][1];
    return { count: max, names: entries.filter(([, c]) => c === max).map(([n]) => n) };
}

function barList(entries, limit = 10) {
    const top = entries.slice(0, limit);
    const max = top[0]?.[1] || 1;
    return top.map(([name, count]) => `
        <div class="bar-row">
            <span class="bar-name" title="${esc(name)}">${esc(name)}</span>
            <span class="bar-track" aria-hidden="true"><span class="bar-fill" style="display:block;width:${(count / max) * 100}%;background:${teamColor(name)}"></span></span>
            <span class="bar-count">${count}</span>
        </div>`).join('');
}

function renderRecords() {
    const root = $('#records-root');
    const st = state.status.champions;
    if (st === 'loading') { root.innerHTML = '<div class="no-results">Loading records…</div>'; return; }
    if (st === 'error') {
        root.innerHTML = `<div class="error-box">Records are built from <code>${esc(CONFIG.champions.file)}</code>, which couldn't be loaded.<br>
            <button type="button" class="btn" data-retry="champions">Try again</button></div>`;
        return;
    }
    const champs = [...state.data.champions].filter((c) => c.year).sort((a, b) => a.year - b.year);
    if (!champs.length) { root.innerHTML = '<div class="no-results">No champion data available.</div>'; return; }

    const byDriver = tally(champs, (c) => c.driver);
    const byTeam = tally(champs, (c) => c.team);
    const topDriver = leaders(byDriver);
    const topTeam = leaders(byTeam);

    let best = { len: 0, driver: '', from: 0, to: 0 };
    let cur = null;
    champs.forEach((c) => {
        if (cur && cur.driver === c.driver && c.year === cur.to + 1) { cur.len++; cur.to = c.year; }
        else cur = { driver: c.driver, len: 1, from: c.year, to: c.year };
        if (cur.len > best.len) best = { ...cur };
    });

    const first = champs[0].year;
    const last = champs[champs.length - 1].year;

    const eraCards = ERAS.map((e) => {
        const inEra = champs.filter((c) => c.year >= e.from && c.year <= e.to);
        if (!inEra.length) return '';
        const l = leaders(tally(inEra, (c) => c.driver));
        const tl = leaders(tally(inEra, (c) => c.team));
        return `<div class="era-item" style="border-left-color:${teamColor(tl.names[0])}">
            <h4>${esc(e.label)}</h4>
            <p>${inEra.length} seasons · most titles: ${esc(l.names.join(', '))} (${l.count})<br>Top team: ${esc(tl.names.join(', '))} (${tl.count})</p>
        </div>`;
    }).join('');

    root.innerHTML = `
        <div class="stat-grid">
            <div class="stat-card"><div class="stat-label">Seasons covered</div><div class="stat-value">${champs.length}</div><div class="stat-note">${first} – ${last}</div></div>
            <div class="stat-card"><div class="stat-label">Different champions</div><div class="stat-value">${byDriver.length}</div><div class="stat-note">${byTeam.length} different teams</div></div>
            <div class="stat-card"><div class="stat-label">Most titles (driver)</div><div class="stat-value">${topDriver.count}</div><div class="stat-note">${esc(topDriver.names.join(', '))}</div></div>
            <div class="stat-card"><div class="stat-label">Most titles (team)</div><div class="stat-value">${topTeam.count}</div><div class="stat-note">${esc(topTeam.names.join(', '))}</div></div>
            <div class="stat-card"><div class="stat-label">Longest title streak</div><div class="stat-value">${best.len}</div><div class="stat-note">${esc(best.driver)} (${best.from}–${best.to})</div></div>
        </div>
        <div class="records-cols">
            <div class="panel"><h3>Drivers' titles</h3>${barList(byDriver)}</div>
            <div class="panel"><h3>Teams' titles</h3>${barList(byTeam)}</div>
        </div>
        <div class="panel"><h3>Dominance by era</h3><div class="era-list">${eraCards}</div></div>`;
}

// ===========================
// MODAL: DETAILS
// ===========================
function findById(id) {
    const section = String(id).split('-')[0];
    const item = state.data[section]?.find((i) => i._id === id);
    return item ? { section, item } : null;
}

function showModal() {
    if (!modal.open) {
        if (typeof modal.showModal === 'function') modal.showModal();
        else modal.setAttribute('open', '');
    }
    modal.scrollTop = 0;
}

function openItem(id) {
    const found = findById(id);
    if (!found) return;
    const { section, item } = found;
    const cfg = CONFIG[section];
    const d = cfg.card(item);
    const det = cfg.detail(item);
    const rows = det.rows.filter(([, v]) => hasValue(v))
        .map(([l, v]) => `<dt>${esc(l)}</dt><dd>${esc(v)}</dd>`).join('');
    const links = det.links.map((l) => `<button type="button" class="btn btn-ghost" data-open="${esc(l.id)}">${esc(l.label)}</button>`).join('');

    modalBody.innerHTML = `
        ${imgTag(item, d, 'modal-img')}
        <div class="modal-text">
            <h2 id="modalTitle">${esc(d.title)}</h2>
            <span class="card-subtitle">${esc(d.subtitle)}</span>
            <dl class="detail-list">${rows}</dl>
            ${det.text ? `<p>${esc(det.text)}</p>` : ''}
            ${links ? `<div class="modal-links">${links}</div>` : ''}
            ${item.credit ? `<p class="credit">Image: ${esc(item.credit)}</p>` : ''}
        </div>`;
    showModal();
}

// ===========================
// COMPARE DRIVERS
// ===========================
function updateCompareBar() {
    const n = state.compare.length;
    compareBar.hidden = n === 0;
    compareText.textContent = n === 1 ? '1 of 2 drivers selected' : `${n} of 2 drivers selected`;
    compareOpen.disabled = n !== 2;
}

function toggleCompare(id, checked) {
    state.compare = state.compare.filter((x) => x !== id);
    if (checked) {
        state.compare.push(id);
        if (state.compare.length > 2) state.compare.shift(); // keep the two most recent picks
    }
    $$('input[data-compare]').forEach((cb) => { cb.checked = state.compare.includes(cb.dataset.compare); });
    updateCompareBar();
}

function openCompare() {
    const [a, b] = state.compare.map((id) => findById(id)?.item);
    if (!a || !b) return;
    const num = (label, key) => {
        const av = a[key], bv = b[key];
        const best = (hasValue(av) && hasValue(bv) && av !== bv) ? (av > bv ? 'a' : 'b') : '';
        return `<tr><th scope="row">${label}</th><td class="${best === 'a' ? 'best' : ''}">${esc(hasValue(av) ? av : '–')}</td><td class="${best === 'b' ? 'best' : ''}">${esc(hasValue(bv) ? bv : '–')}</td></tr>`;
    };
    const txt = (label, fa, fb) => `<tr><th scope="row">${label}</th><td>${esc(fa || '–')}</td><td>${esc(fb || '–')}</td></tr>`;
    modalBody.innerHTML = `
        <div class="modal-text">
            <h2 id="modalTitle">Driver comparison</h2>
            <table class="compare-table">
                <thead><tr><th scope="col"><span class="sr-only">Stat</span></th><th scope="col">${esc(a.name)}</th><th scope="col">${esc(b.name)}</th></tr></thead>
                <tbody>
                    ${txt('Nationality', a.nationality, b.nationality)}
                    ${txt('Active', a.years, b.years)}
                    ${num('Titles', 'titles')}
                    ${num('Wins', 'wins')}
                    ${num('Pole positions', 'poles')}
                    ${num('Podiums', 'podiums')}
                    ${txt('Teams', a.teams.join(', '), b.teams.join(', '))}
                </tbody>
            </table>
            <p class="credit">Highlighted values are the higher of the two. Missing stats show as –.</p>
        </div>`;
    showModal();
}

// ===========================
// THEME
// ===========================
function applyTheme(theme, save) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = $('#themeToggle');
    btn.textContent = theme === 'dark' ? '☀' : '☾';
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    if (save) { try { localStorage.setItem('f1-theme', theme); } catch (e) { /* ignore */ } }
}

// ===========================
// EVENT LISTENERS
// ===========================
function resetFilters() {
    state.filters = { q: '', year: '', team: '', era: '', sort: '' };
    state.shown = PAGE_SIZE;
    populateControls();
    writeURL(false);
    render();
}

function onFilterChange() {
    state.filters.year = filterYear.value;
    state.filters.team = filterTeam.value;
    state.filters.era = filterEra.value;
    const first = CONFIG[state.section].sorts[0].id;
    state.filters.sort = sortSelect.value === first ? '' : sortSelect.value;
    state.shown = PAGE_SIZE;
    writeURL(false);
    render();
}

function setupEventListeners() {
    // Tabs (click + arrow-key navigation)
    navButtons.forEach((btn) => btn.addEventListener('click', () => switchSection(btn.dataset.section)));
    $('#tablist').addEventListener('keydown', (e) => {
        const idx = SECTIONS.indexOf(state.section);
        let next = null;
        if (e.key === 'ArrowRight') next = (idx + 1) % SECTIONS.length;
        else if (e.key === 'ArrowLeft') next = (idx - 1 + SECTIONS.length) % SECTIONS.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = SECTIONS.length - 1;
        if (next === null) return;
        e.preventDefault();
        switchSection(SECTIONS[next], true, true);
    });

    // Search (debounced) and filters
    searchInput.addEventListener('input', debounce(() => {
        state.filters.q = searchInput.value;
        state.shown = PAGE_SIZE;
        writeURL(false);
        render();
    }, 200));
    [filterYear, filterTeam, filterEra, sortSelect].forEach((el) => el.addEventListener('change', onFilterChange));
    clearBtn.addEventListener('click', resetFilters);
    loadMoreBtn.addEventListener('click', () => { state.shown += PAGE_SIZE; renderGrid(); });

    // Delegated clicks: open details, retry, clear
    document.addEventListener('click', (e) => {
        const openEl = e.target.closest('[data-open]');
        if (openEl) { openItem(openEl.dataset.open); return; }
        const retry = e.target.closest('[data-retry]');
        if (retry) {
            const key = retry.dataset.retry;
            state.status[key] = 'loading';
            render();
            loadOne(key).then(() => { populateControls(); render(); });
            return;
        }
        if (e.target.closest('[data-clear]')) resetFilters();
    });

    // Compare
    document.addEventListener('change', (e) => {
        if (e.target.matches('input[data-compare]')) toggleCompare(e.target.dataset.compare, e.target.checked);
    });
    compareOpen.addEventListener('click', openCompare);
    $('#compareClear').addEventListener('click', () => {
        state.compare = [];
        $$('input[data-compare]').forEach((cb) => { cb.checked = false; });
        updateCompareBar();
    });

    // Modal
    $('#modalClose').addEventListener('click', () => modal.close());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); }); // backdrop click

    // Theme
    $('#themeToggle').addEventListener('click', () => {
        applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
    });

    // Back/forward buttons
    window.addEventListener('popstate', () => {
        readURL();
        populateControls();
        render();
    });
}

// ===========================
// INITIALIZE APP
// ===========================
document.addEventListener('DOMContentLoaded', () => {
    $('#year').textContent = CURRENT_YEAR;
    applyTheme(document.documentElement.getAttribute('data-theme') || 'dark', false);
    readURL();
    setupEventListeners();
    loadData();
});
