const SHEET_ID = '1D6MzGtBFOPTx6zjtFingE1CHmmVhGfl1OAmQoedXXMg';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

let allFamilies = [];
let activeGrade = 'all';
let currentView = 'cards';
let searchTerm = '';

const directoryEl = document.getElementById('directory');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const searchInput = document.getElementById('search-input');
const clearBtn = document.getElementById('clear-search');
const gradeFilters = document.getElementById('grade-filters');
const resultsInfo = document.getElementById('results-info');

async function fetchSheet() {
  const response = await fetch(CSV_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function parseCSV(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  const chars = text.split('');

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === '"') {
      if (inQuotes && chars[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      if (!rows.length || rows[rows.length - 1] === undefined) rows.push([]);
      rows[rows.length - 1].push(current.trim());
      current = '';
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && chars[i + 1] === '\n') i++;
      if (!rows.length || rows[rows.length - 1] === undefined) rows.push([]);
      rows[rows.length - 1].push(current.trim());
      current = '';
      rows.push(undefined);
    } else {
      current += c;
    }
  }

  if (current || (rows.length && rows[rows.length - 1] === undefined)) {
    if (!rows.length || rows[rows.length - 1] === undefined) rows.push([]);
    rows[rows.length - 1].push(current.trim());
  }

  return rows.filter(r => r !== undefined && r.some(cell => cell !== ''));
}

function detectColumns(headers) {
  const h = headers.map(s => s.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const find = (...keywords) => h.findIndex(col => keywords.some(k => col.includes(k)));

  return {
    studentFirst: find('studentfirst', 'childfirst', 'kidfirst', 'firstname', 'first'),
    studentLast: find('studentlast', 'childlast', 'kidlast', 'lastname', 'last', 'family'),
    grade: find('grade', 'class', 'year'),
    parent1Name: find('parent1', 'mother', 'mom', 'guardian1'),
    parent1Email: (() => { const idx = h.findIndex((col, i) => (col.includes('email') || col.includes('mail')) && i < h.length / 2); return idx; })(),
    parent1Phone: (() => { const idx = h.findIndex((col, i) => (col.includes('phone') || col.includes('cell') || col.includes('mobile')) && i < h.length / 2); return idx; })(),
    parent2Name: (() => { const idx = h.findIndex((col, i) => col.includes('parent2') || col.includes('father') || col.includes('dad') || col.includes('guardian2')); return idx; })(),
    parent2Email: (() => { const idxes = h.reduce((acc, col, i) => { if (col.includes('email') || col.includes('mail')) acc.push(i); return acc; }, []); return idxes.length > 1 ? idxes[1] : -1; })(),
    parent2Phone: (() => { const idxes = h.reduce((acc, col, i) => { if (col.includes('phone') || col.includes('cell') || col.includes('mobile')) acc.push(i); return acc; }, []); return idxes.length > 1 ? idxes[1] : -1; })(),
    address: find('address', 'street', 'home'),
    headers
  };
}

function buildFamilies(rows, cols) {
  const dataRows = rows.slice(1);
  return dataRows.map(row => {
    const get = (idx) => (idx >= 0 && idx < row.length) ? row[idx] : '';
    return {
      studentFirst: get(cols.studentFirst),
      studentLast: get(cols.studentLast),
      grade: get(cols.grade),
      parent1Name: get(cols.parent1Name),
      parent1Email: get(cols.parent1Email),
      parent1Phone: get(cols.parent1Phone),
      parent2Name: get(cols.parent2Name),
      parent2Email: get(cols.parent2Email),
      parent2Phone: get(cols.parent2Phone),
      address: get(cols.address),
      _raw: row,
      _headers: cols.headers
    };
  }).filter(f => f.studentFirst || f.studentLast);
}

function getGrades(families) {
  const grades = [...new Set(families.map(f => f.grade).filter(Boolean))];
  return grades.sort((a, b) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    const isNumA = !isNaN(numA);
    const isNumB = !isNaN(numB);
    if (a.toLowerCase().includes('k') && !b.toLowerCase().includes('k')) return -1;
    if (!a.toLowerCase().includes('k') && b.toLowerCase().includes('k')) return 1;
    if (a.toLowerCase().includes('pre') && !b.toLowerCase().includes('pre')) return -1;
    if (!a.toLowerCase().includes('pre') && b.toLowerCase().includes('pre')) return 1;
    if (isNumA && isNumB) return numA - numB;
    return a.localeCompare(b);
  });
}

function renderGradeButtons(grades) {
  gradeFilters.innerHTML = '<button class="grade-btn active" data-grade="all">All</button>';
  grades.forEach(grade => {
    const btn = document.createElement('button');
    btn.className = 'grade-btn';
    btn.dataset.grade = grade;
    btn.textContent = grade;
    gradeFilters.appendChild(btn);
  });
}

function highlightText(text, term) {
  if (!term || !text) return text || '';
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

function matchesSearch(family, term) {
  if (!term) return true;
  const lower = term.toLowerCase();
  const searchable = [
    family.studentFirst, family.studentLast,
    `${family.studentFirst} ${family.studentLast}`,
    family.parent1Name, family.parent2Name,
    family.parent1Email, family.parent2Email,
    family.parent1Phone, family.parent2Phone,
    family.address,
    ...family._raw
  ].filter(Boolean).join(' ').toLowerCase();
  return lower.split(/\s+/).every(word => searchable.includes(word));
}

function formatPhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  return phone;
}

function renderCard(family, term) {
  const hl = (t) => highlightText(t, term);
  const fullName = `${family.studentFirst} ${family.studentLast}`.trim();

  let parentsHtml = '';
  if (family.parent1Name || family.parent1Email || family.parent1Phone) {
    parentsHtml += `<div class="parent-info">`;
    if (family.parent1Name) parentsHtml += `<div class="parent-name">${hl(family.parent1Name)}</div>`;
    if (family.parent1Email) parentsHtml += `<div class="parent-detail"><a href="mailto:${family.parent1Email}">${hl(family.parent1Email)}</a></div>`;
    if (family.parent1Phone) parentsHtml += `<div class="parent-detail"><a href="tel:${family.parent1Phone.replace(/\D/g,'')}">${hl(formatPhone(family.parent1Phone))}</a></div>`;
    parentsHtml += `</div>`;
  }
  if (family.parent2Name || family.parent2Email || family.parent2Phone) {
    parentsHtml += `<div class="parent-info">`;
    if (family.parent2Name) parentsHtml += `<div class="parent-name">${hl(family.parent2Name)}</div>`;
    if (family.parent2Email) parentsHtml += `<div class="parent-detail"><a href="mailto:${family.parent2Email}">${hl(family.parent2Email)}</a></div>`;
    if (family.parent2Phone) parentsHtml += `<div class="parent-detail"><a href="tel:${family.parent2Phone.replace(/\D/g,'')}">${hl(formatPhone(family.parent2Phone))}</a></div>`;
    parentsHtml += `</div>`;
  }

  let addressHtml = '';
  if (family.address) {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(family.address)}`;
    addressHtml = `
      <div class="card-section">
        <div class="card-section-label">Address</div>
        <div class="address">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <a href="${mapsUrl}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${hl(family.address)}</a>
        </div>
      </div>`;
  }

  return `
    <div class="family-card">
      <div class="card-header">
        <span class="student-name">${hl(fullName)}</span>
        ${family.grade ? `<span class="grade-badge">${hl(family.grade)}</span>` : ''}
      </div>
      ${parentsHtml ? `<div class="card-section"><div class="card-section-label">Parents</div>${parentsHtml}</div>` : ''}
      ${addressHtml}
    </div>`;
}

function render() {
  let filtered = allFamilies;

  if (activeGrade !== 'all') {
    filtered = filtered.filter(f => f.grade === activeGrade);
  }

  if (searchTerm) {
    filtered = filtered.filter(f => matchesSearch(f, searchTerm));
  }

  const gradeGrouping = activeGrade === 'all' && !searchTerm;

  if (gradeGrouping) {
    const grades = getGrades(filtered);
    let html = '';
    grades.forEach(grade => {
      const inGrade = filtered.filter(f => f.grade === grade);
      inGrade.sort((a, b) => (a.studentLast || '').localeCompare(b.studentLast || '') || (a.studentFirst || '').localeCompare(b.studentFirst || ''));
      html += `<div class="grade-group-header">${grade} <span class="count">${inGrade.length} student${inGrade.length !== 1 ? 's' : ''}</span></div>`;
      html += inGrade.map(f => renderCard(f, searchTerm)).join('');
    });

    const noGrade = filtered.filter(f => !f.grade);
    if (noGrade.length) {
      noGrade.sort((a, b) => (a.studentLast || '').localeCompare(b.studentLast || ''));
      html += `<div class="grade-group-header">No Grade Listed <span class="count">${noGrade.length}</span></div>`;
      html += noGrade.map(f => renderCard(f, searchTerm)).join('');
    }

    directoryEl.innerHTML = html;
  } else {
    filtered.sort((a, b) => (a.studentLast || '').localeCompare(b.studentLast || '') || (a.studentFirst || '').localeCompare(b.studentFirst || ''));
    directoryEl.innerHTML = filtered.map(f => renderCard(f, searchTerm)).join('');
  }

  const total = allFamilies.length;
  const shown = filtered.length;
  if (searchTerm || activeGrade !== 'all') {
    resultsInfo.textContent = `Showing ${shown} of ${total} students`;
  } else {
    resultsInfo.textContent = `${total} students`;
  }

  if (filtered.length === 0) {
    directoryEl.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--gray-400);grid-column:1/-1">
        <p style="font-size:1.1rem;margin-bottom:4px">No results found</p>
        <p style="font-size:0.875rem">Try a different search or filter</p>
      </div>`;
  }
}

searchInput.addEventListener('input', () => {
  searchTerm = searchInput.value.trim();
  clearBtn.classList.toggle('visible', searchTerm.length > 0);
  render();
});

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchTerm = '';
  clearBtn.classList.remove('visible');
  searchInput.focus();
  render();
});

gradeFilters.addEventListener('click', (e) => {
  const btn = e.target.closest('.grade-btn');
  if (!btn) return;
  gradeFilters.querySelectorAll('.grade-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeGrade = btn.dataset.grade;
  render();
});

document.querySelector('.view-toggle').addEventListener('click', (e) => {
  const btn = e.target.closest('.view-btn');
  if (!btn) return;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentView = btn.dataset.view;
  directoryEl.className = `directory ${currentView === 'cards' ? 'cards-view' : 'list-view'}`;
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
  }
  if (e.key === 'Escape' && document.activeElement === searchInput) {
    searchInput.blur();
  }
});

async function init() {
  try {
    const csv = await fetchSheet();
    const rows = parseCSV(csv);
    if (rows.length < 2) throw new Error('No data found');

    const cols = detectColumns(rows[0]);
    allFamilies = buildFamilies(rows, cols);

    const grades = getGrades(allFamilies);
    renderGradeButtons(grades);

    loadingEl.classList.add('hidden');
    render();
  } catch (err) {
    console.error('Failed to load directory:', err);
    loadingEl.classList.add('hidden');
    errorEl.classList.remove('hidden');
  }
}

init();
