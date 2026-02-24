const SHEET_ID = '1D6MzGtBFOPTx6zjtFingE1CHmmVhGfl1OAmQoedXXMg';

let allFamilies = [];
let familyGroups = {};
let activeGrades = new Set();
let currentView = 'cards';
let searchTerm = '';

const directoryEl = document.getElementById('directory');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const searchInput = document.getElementById('search-input');
const clearBtn = document.getElementById('clear-search');
const gradeFilters = document.getElementById('grade-filters');
const resultsInfo = document.getElementById('results-info');
const resetBtn = document.getElementById('reset-btn');
const copyEmailsBtn = document.getElementById('copy-emails-btn');
const modal = document.getElementById('family-modal');
const modalBackdrop = document.getElementById('modal-backdrop');

async function fetchSheet() {
  const urls = [
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`,
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.text();
    } catch (_) { /* try next */ }
  }
  throw new Error('Could not fetch sheet — is it shared publicly?');
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
  const findExcluding = (exclude, ...keywords) =>
    h.findIndex(col => keywords.some(k => col.includes(k)) && !exclude.some(e => col.includes(e)));

  const firstIdx = h.findIndex(col => col === 'firstname' || col === 'first');
  const lastIdx = h.findIndex(col => col === 'lastname' || col === 'last');

  return {
    familyId: find('familyid', 'family_id'),
    studentFirst: firstIdx !== -1 ? firstIdx : find('studentfirst', 'childfirst', 'kidfirst', 'firstname'),
    studentLast: lastIdx !== -1 ? lastIdx : findExcluding(['id'], 'studentlast', 'childlast', 'kidlast', 'lastname', 'last'),
    grade: find('grade', 'class'),
    parent1Name: find('parent1name', 'parent1n', 'mothername'),
    parent1Email: find('parent1email', 'parent1e'),
    parent1Phone: find('parent1phone', 'parent1p', 'parent1cell'),
    parent2Name: find('parent2name', 'parent2n', 'fathername'),
    parent2Email: find('parent2email', 'parent2e'),
    parent2Phone: find('parent2phone', 'parent2p', 'parent2cell'),
    address: find('address', 'street'),
    headers
  };
}

function buildFamilies(rows, cols) {
  const dataRows = rows.slice(1);
  return dataRows.map(row => {
    const get = (idx) => (idx >= 0 && idx < row.length) ? row[idx] : '';
    return {
      familyId: get(cols.familyId),
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
    };
  }).filter(f => f.studentFirst || f.studentLast);
}

function buildFamilyGroups(families) {
  const groups = {};
  families.forEach(f => {
    const key = f.familyId || `${f.parent1Name}_${f.studentLast}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(f);
  });
  return groups;
}

function gradeOrder(g) {
  const s = g.toUpperCase();
  if (s.startsWith('PS'))  return 0  + (s.charCodeAt(2) || 0) / 1000;
  if (s.startsWith('PK'))  return 10 + (s.charCodeAt(2) || 0) / 1000;
  if (s.startsWith('TK'))  return 20 + (s.charCodeAt(2) || 0) / 1000;
  if (s.startsWith('K'))   return 30 + (s.charCodeAt(1) || 0) / 1000;
  const num = parseInt(s);
  if (!isNaN(num))         return 40 + num + (s.charCodeAt(s.length - 1) || 0) / 1000;
  return 100;
}

function getGrades(families) {
  const grades = [...new Set(families.map(f => f.grade).filter(Boolean))];
  return grades.sort((a, b) => gradeOrder(a) - gradeOrder(b));
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

function phoneDigits(phone) {
  return phone.replace(/\D/g, '');
}

function whatsappUrl(phone) {
  const d = phoneDigits(phone);
  const intl = d.length === 10 ? '1' + d : d;
  return `https://wa.me/${intl}`;
}

function renderPhoneActions(phone, displayHtml, stopProp) {
  const d = phoneDigits(phone);
  const stop = stopProp ? ' onclick="event.stopPropagation()"' : '';
  const iconCall = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
  const iconSms = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  const iconWa = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.47 1.07 2.89 1.22 3.09.15.2 2.1 3.2 5.08 4.49.71.31 1.27.49 1.7.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zm-5.42 7.4A9.87 9.87 0 0 1 7 19.93l-.36-.21-3.73.98.99-3.63-.24-.37a9.87 9.87 0 0 1-1.51-5.26c0-5.45 4.44-9.89 9.9-9.89a9.87 9.87 0 0 1 7 2.9 9.86 9.86 0 0 1 2.9 7c0 5.46-4.44 9.9-9.9 9.9zm8.41-18.31A11.82 11.82 0 0 0 12.05.03C5.49.03.13 5.39.13 11.95c0 2.1.55 4.16 1.6 5.98L0 24l6.2-1.63a11.87 11.87 0 0 0 5.85 1.53c6.56 0 11.91-5.35 11.92-11.92a11.83 11.83 0 0 0-3.51-8.41z"/></svg>`;
  return `<div class="parent-detail phone-actions">
    <span class="phone-number">${displayHtml}</span>
    <span class="phone-icons">
      <a href="tel:${d}" title="Call"${stop}>${iconCall}</a>
      <a href="sms:${d}" title="Text"${stop}>${iconSms}</a>
      <a href="${whatsappUrl(phone)}" target="_blank" rel="noopener" title="WhatsApp"${stop}>${iconWa}</a>
    </span>
  </div>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderCard(family, term) {
  const hl = (t) => highlightText(t, term);
  const fullName = `${family.studentFirst} ${family.studentLast}`.trim();
  const familyKey = family.familyId || `${family.parent1Name}_${family.studentLast}`;
  const siblings = familyGroups[familyKey] || [];
  const siblingCount = siblings.length;

  let parentsHtml = '';
  if (family.parent1Name || family.parent1Email || family.parent1Phone) {
    parentsHtml += `<div class="parent-info">`;
    if (family.parent1Name) parentsHtml += `<div class="parent-name">${hl(family.parent1Name)}</div>`;
    if (family.parent1Email) parentsHtml += `<div class="parent-detail"><a href="mailto:${escapeHtml(family.parent1Email)}" onclick="event.stopPropagation()">${hl(family.parent1Email)}</a></div>`;
    if (family.parent1Phone) parentsHtml += renderPhoneActions(family.parent1Phone, hl(formatPhone(family.parent1Phone)), true);
    parentsHtml += `</div>`;
  }
  if (family.parent2Name || family.parent2Email || family.parent2Phone) {
    parentsHtml += `<div class="parent-info">`;
    if (family.parent2Name) parentsHtml += `<div class="parent-name">${hl(family.parent2Name)}</div>`;
    if (family.parent2Email) parentsHtml += `<div class="parent-detail"><a href="mailto:${escapeHtml(family.parent2Email)}" onclick="event.stopPropagation()">${hl(family.parent2Email)}</a></div>`;
    if (family.parent2Phone) parentsHtml += renderPhoneActions(family.parent2Phone, hl(formatPhone(family.parent2Phone)), true);
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
          <a href="${mapsUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="color:inherit;text-decoration:none">${hl(family.address)}</a>
        </div>
      </div>`;
  }

  const siblingHint = siblingCount > 1
    ? `<span class="sibling-count" title="${siblingCount} kids in family">${siblingCount} kids</span>`
    : '';

  return `
    <div class="family-card" data-family-key="${escapeHtml(familyKey)}" role="button" tabindex="0">
      <div class="card-header">
        <div class="card-header-left">
          <span class="student-name">${hl(fullName)}</span>
          ${siblingHint}
        </div>
        ${family.grade ? `<span class="grade-badge">${hl(family.grade)}</span>` : ''}
      </div>
      ${parentsHtml ? `<div class="card-section"><div class="card-section-label">Parents</div>${parentsHtml}</div>` : ''}
      ${addressHtml}
    </div>`;
}

function renderTable(filtered) {
  let html = '<table class="directory-table"><thead><tr>';
  html += '<th>Student</th><th>Grade</th><th>Parent 1</th><th>Parent 1 Email</th><th>Parent 1 Phone</th>';
  html += '<th>Parent 2</th><th>Parent 2 Email</th><th>Parent 2 Phone</th><th>Address</th>';
  html += '</tr></thead><tbody>';

  filtered.forEach(f => {
    const fullName = `${f.studentFirst} ${f.studentLast}`.trim();
    html += `<tr data-family-key="${escapeHtml(f.familyId || `${f.parent1Name}_${f.studentLast}`)}" role="button">`;
    html += `<td>${escapeHtml(fullName)}</td>`;
    html += `<td>${escapeHtml(f.grade)}</td>`;
    html += `<td>${escapeHtml(f.parent1Name)}</td>`;
    html += `<td>${escapeHtml(f.parent1Email)}</td>`;
    html += `<td>${escapeHtml(formatPhone(f.parent1Phone))}</td>`;
    html += `<td>${escapeHtml(f.parent2Name)}</td>`;
    html += `<td>${escapeHtml(f.parent2Email)}</td>`;
    html += `<td>${escapeHtml(formatPhone(f.parent2Phone))}</td>`;
    html += `<td>${escapeHtml(f.address)}</td>`;
    html += '</tr>';
  });

  html += '</tbody></table>';
  return html;
}

function getFiltered() {
  let filtered = allFamilies;
  if (activeGrades.size > 0) {
    filtered = filtered.filter(f => activeGrades.has(f.grade));
  }
  if (searchTerm) {
    filtered = filtered.filter(f => matchesSearch(f, searchTerm));
  }
  return filtered;
}

function render() {
  const filtered = getFiltered();
  const showGradeGroups = activeGrades.size === 0 && !searchTerm && currentView === 'cards';

  if (currentView === 'table') {
    filtered.sort((a, b) => gradeOrder(a.grade || 'ZZZ') - gradeOrder(b.grade || 'ZZZ') || (a.studentLast || '').localeCompare(b.studentLast || '') || (a.studentFirst || '').localeCompare(b.studentFirst || ''));
    directoryEl.innerHTML = renderTable(filtered);
    directoryEl.className = 'directory table-view';
  } else if (showGradeGroups) {
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
    directoryEl.className = 'directory cards-view';
  } else {
    filtered.sort((a, b) => (a.studentLast || '').localeCompare(b.studentLast || '') || (a.studentFirst || '').localeCompare(b.studentFirst || ''));
    directoryEl.innerHTML = filtered.map(f => renderCard(f, searchTerm)).join('');
    directoryEl.className = 'directory cards-view';
  }

  const total = allFamilies.length;
  const shown = filtered.length;
  if (searchTerm || activeGrades.size > 0) {
    resultsInfo.textContent = `Showing ${shown} of ${total} students`;
  } else {
    resultsInfo.textContent = `${total} students`;
  }

  const hasActiveFilters = searchTerm || activeGrades.size > 0;
  resetBtn.classList.toggle('hidden', !hasActiveFilters);
  copyEmailsBtn.classList.toggle('hidden', filtered.length === 0);

  if (filtered.length === 0) {
    directoryEl.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--gray-400);grid-column:1/-1">
        <p style="font-size:1.1rem;margin-bottom:4px">No results found</p>
        <p style="font-size:0.875rem">Try a different search or filter</p>
      </div>`;
  }
}

// --- Family Modal ---

function openFamilyModal(familyKey) {
  const siblings = familyGroups[familyKey];
  if (!siblings || !siblings.length) return;

  const rep = siblings[0];
  const lastName = rep.studentLast;

  let kidsHtml = siblings.map(s =>
    `<div class="modal-kid"><span class="modal-kid-name">${escapeHtml(s.studentFirst)} ${escapeHtml(s.studentLast)}</span><span class="grade-badge">${escapeHtml(s.grade)}</span></div>`
  ).join('');

  let parentsHtml = '';
  if (rep.parent1Name || rep.parent1Email || rep.parent1Phone) {
    parentsHtml += '<div class="modal-parent">';
    if (rep.parent1Name) parentsHtml += `<div class="parent-name">${escapeHtml(rep.parent1Name)}</div>`;
    if (rep.parent1Email) parentsHtml += `<div class="parent-detail"><a href="mailto:${escapeHtml(rep.parent1Email)}">${escapeHtml(rep.parent1Email)}</a></div>`;
    if (rep.parent1Phone) parentsHtml += renderPhoneActions(rep.parent1Phone, formatPhone(rep.parent1Phone), false);
    parentsHtml += '</div>';
  }
  if (rep.parent2Name || rep.parent2Email || rep.parent2Phone) {
    parentsHtml += '<div class="modal-parent">';
    if (rep.parent2Name) parentsHtml += `<div class="parent-name">${escapeHtml(rep.parent2Name)}</div>`;
    if (rep.parent2Email) parentsHtml += `<div class="parent-detail"><a href="mailto:${escapeHtml(rep.parent2Email)}">${escapeHtml(rep.parent2Email)}</a></div>`;
    if (rep.parent2Phone) parentsHtml += renderPhoneActions(rep.parent2Phone, formatPhone(rep.parent2Phone), false);
    parentsHtml += '</div>';
  }

  let addressHtml = '';
  if (rep.address) {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rep.address)}`;
    addressHtml = `
      <div class="modal-section">
        <div class="modal-section-label">Address</div>
        <div class="address">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <a href="${mapsUrl}" target="_blank" rel="noopener">${escapeHtml(rep.address)}</a>
        </div>
      </div>`;
  }

  modal.innerHTML = `
    <div class="modal-header">
      <h2>${escapeHtml(lastName)} Family</h2>
      <button class="modal-close" id="modal-close">&times;</button>
    </div>
    <div class="modal-section">
      <div class="modal-section-label">Kids</div>
      <div class="modal-kids">${kidsHtml}</div>
    </div>
    <div class="modal-section">
      <div class="modal-section-label">Parents</div>
      ${parentsHtml}
    </div>
    ${addressHtml}
  `;

  modal.classList.add('open');
  modalBackdrop.classList.add('open');
  document.getElementById('modal-close').focus();
}

function closeModal() {
  modal.classList.remove('open');
  modalBackdrop.classList.remove('open');
}

// --- Event Listeners ---

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
  const grade = btn.dataset.grade;

  if (grade === 'all') {
    activeGrades.clear();
    gradeFilters.querySelectorAll('.grade-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  } else {
    const allBtn = gradeFilters.querySelector('[data-grade="all"]');
    allBtn.classList.remove('active');

    if (activeGrades.has(grade)) {
      activeGrades.delete(grade);
      btn.classList.remove('active');
      if (activeGrades.size === 0) allBtn.classList.add('active');
    } else {
      activeGrades.add(grade);
      btn.classList.add('active');
    }
  }
  render();
});

resetBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchTerm = '';
  clearBtn.classList.remove('visible');
  activeGrades.clear();
  gradeFilters.querySelectorAll('.grade-btn').forEach(b => b.classList.remove('active'));
  gradeFilters.querySelector('[data-grade="all"]').classList.add('active');
  render();
});

copyEmailsBtn.addEventListener('click', () => {
  const filtered = getFiltered();
  const emails = new Set();
  filtered.forEach(f => {
    if (f.parent1Email) emails.add(f.parent1Email);
    if (f.parent2Email) emails.add(f.parent2Email);
  });
  const text = [...emails].sort().join(', ');
  navigator.clipboard.writeText(text).then(() => {
    const orig = copyEmailsBtn.textContent;
    copyEmailsBtn.textContent = `Copied ${emails.size} emails!`;
    copyEmailsBtn.classList.add('copied');
    setTimeout(() => {
      copyEmailsBtn.textContent = orig;
      copyEmailsBtn.classList.remove('copied');
    }, 2000);
  });
});

document.querySelector('.view-toggle').addEventListener('click', (e) => {
  const btn = e.target.closest('.view-btn');
  if (!btn) return;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentView = btn.dataset.view;
  render();
});

directoryEl.addEventListener('click', (e) => {
  const card = e.target.closest('.family-card, tr[data-family-key]');
  if (!card) return;
  if (e.target.closest('a')) return;
  const key = card.dataset.familyKey;
  if (key) openFamilyModal(key);
});

directoryEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const card = e.target.closest('.family-card');
    if (card) {
      const key = card.dataset.familyKey;
      if (key) openFamilyModal(key);
    }
  }
});

modalBackdrop.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target.closest('.modal-close')) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchInput && !modal.classList.contains('open')) {
    e.preventDefault();
    searchInput.focus();
  }
  if (e.key === 'Escape') {
    if (modal.classList.contains('open')) {
      closeModal();
    } else if (document.activeElement === searchInput) {
      searchInput.blur();
    }
  }
});

async function init() {
  try {
    const csv = await fetchSheet();
    const rows = parseCSV(csv);
    if (rows.length < 2) throw new Error('No data found');

    const cols = detectColumns(rows[0]);
    allFamilies = buildFamilies(rows, cols);
    familyGroups = buildFamilyGroups(allFamilies);

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
