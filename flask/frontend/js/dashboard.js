const API = '/api';
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || 'null');

if (!token || !user) { window.location.href = 'login.html'; }

let allEntries = [];
let editingId = null;
let generatedPw = '';
let showFavoritesOnly = false;

// ─── Init ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('nav-username').textContent = user.username;
  if (user.role === 'admin') {
    document.getElementById('admin-link').classList.remove('d-none');
  }
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('search-input').addEventListener('input', renderCards);
  document.getElementById('category-filter').addEventListener('change', renderCards);

  applyStoredTheme();
  loadPasswords();
});

// ─── API Helpers ─────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  });
  if (res.status === 401) { logout(); return null; }
  return res;
}

// ─── Load Passwords ──────────────────────────────────────────────────
async function loadPasswords() {
  const res = await apiFetch('/passwords/');
  if (!res) return;
  allEntries = await res.json();
  updateStats();
  loadCategories();
  renderCards();
}

function updateStats() {
  document.getElementById('stat-total').textContent = allEntries.length;
  const now = new Date();
  const thisMonth = allEntries.filter(e => {
    const d = new Date(e.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  document.getElementById('stat-recent').textContent = thisMonth.length;
}

async function loadCategories() {
  const res = await apiFetch('/passwords/categories');
  if (!res) return;
  const cats = await res.json();
  const sel = document.getElementById('category-filter');
  const current = sel.value;
  sel.innerHTML = '<option value="">All Categories</option>';
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
  document.getElementById('stat-categories').textContent = cats.length;
  sel.value = current;
}

// ─── Render Cards ────────────────────────────────────────────────────
function renderCards() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const catFilter = document.getElementById('category-filter').value;

  const filtered = allEntries.filter(e => {
    // Search by title, username, AND URL
    const matchSearch = !search ||
      e.title.toLowerCase().includes(search) ||
      (e.username || '').toLowerCase().includes(search) ||
      (e.url || '').toLowerCase().includes(search);
    const matchCat = !catFilter || e.category === catFilter;
    const matchFav = !showFavoritesOnly || e.is_favorite;
    return matchSearch && matchCat && matchFav;
  });

  const grid = document.getElementById('password-grid');
  const empty = document.getElementById('empty-state');

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = filtered.map(e => `
    <div class="col-md-6 col-lg-4 col-xl-3">
      <div class="pw-card" onclick="viewEntry(${e.id})">
        <div class="d-flex align-items-start gap-3">
          <div class="pw-card-icon">
            <i class="bi bi-${getCategoryIcon(e.category)}"></i>
          </div>
          <div class="flex-grow-1 min-w-0">
            <div class="pw-card-title">${escHtml(e.title)}</div>
            <div class="pw-card-sub">${escHtml(e.username || '—')}</div>
            <span class="pw-card-badge mt-1 d-inline-block">${escHtml(e.category || 'General')}</span>
          </div>
          <button class="btn btn-sm border-0 p-0 fav-star${e.is_favorite ? ' active' : ''}"
                  onclick="toggleFavorite(event, ${e.id})" title="${e.is_favorite ? 'Unstar' : 'Star'}">
            <i class="bi bi-star${e.is_favorite ? '-fill text-warning' : ''}"></i>
          </button>
        </div>
        <div class="pw-card-actions mt-3 d-flex justify-content-end">
          <button class="btn btn-sm btn-outline-primary" onclick="copyPasswordById(event, ${e.id})">
            <i class="bi bi-clipboard"></i>
          </button>
          <button class="btn btn-sm btn-outline-secondary" onclick="openEditModal(event, ${e.id})">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteEntry(event, ${e.id})">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function getCategoryIcon(cat) {
  const icons = { Banking: 'bank', Social: 'chat-dots', Email: 'envelope', Work: 'briefcase',
                  Shopping: 'bag', Gaming: 'controller', General: 'key' };
  return icons[cat] || 'key';
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Favorites ───────────────────────────────────────────────────────
function toggleFavoritesFilter() {
  showFavoritesOnly = !showFavoritesOnly;
  const btn = document.getElementById('favorites-btn');
  btn.classList.toggle('btn-warning', showFavoritesOnly);
  btn.classList.toggle('btn-outline-warning', !showFavoritesOnly);
  renderCards();
}

async function toggleFavorite(e, id) {
  e.stopPropagation();
  const entry = allEntries.find(en => en.id === id);
  if (!entry) return;
  const newVal = !entry.is_favorite;
  const res = await apiFetch(`/passwords/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ is_favorite: newVal })
  });
  if (res && res.ok) {
    entry.is_favorite = newVal;
    renderCards();
  }
}

// ─── View Entry ──────────────────────────────────────────────────────
async function viewEntry(id) {
  const entry = allEntries.find(e => e.id === id);
  if (!entry) return;

  document.getElementById('view-title').textContent = entry.title;
  document.getElementById('view-body').innerHTML = `
    <div class="view-field">
      <label>Username / Email</label>
      <div class="value">${escHtml(entry.username || '—')}</div>
    </div>
    <div class="view-field">
      <label>Password</label>
      <div class="input-group">
        <input type="password" class="form-control form-control-sm font-monospace" id="view-pw-field" value="••••••••" readonly />
        <button class="btn btn-sm btn-outline-secondary" onclick="revealPassword(${id})"><i class="bi bi-eye"></i></button>
        <button class="btn btn-sm btn-outline-primary" onclick="copyPasswordById(event, ${id})"><i class="bi bi-clipboard"></i></button>
      </div>
    </div>
    ${entry.url ? `<div class="view-field"><label>URL</label><div class="value"><a href="${escHtml(entry.url)}" target="_blank" rel="noopener">${escHtml(entry.url)}</a></div></div>` : ''}
    ${entry.notes ? `<div class="view-field"><label>Notes</label><div class="value">${escHtml(entry.notes)}</div></div>` : ''}
    <div class="view-field">
      <label>Category</label>
      <div class="value"><span class="pw-card-badge">${escHtml(entry.category)}</span></div>
    </div>
    <div class="view-field">
      <label>Last Updated</label>
      <div class="value text-muted small">${new Date(entry.updated_at).toLocaleString()}</div>
    </div>
  `;
  document.getElementById('view-edit-btn').onclick = () => {
    bootstrap.Modal.getInstance(document.getElementById('viewModal')).hide();
    openEditModal(new Event('click'), id);
  };
  new bootstrap.Modal(document.getElementById('viewModal')).show();
}

async function revealPassword(id) {
  const res = await apiFetch(`/passwords/${id}/decrypt`);
  if (!res || !res.ok) return;
  const data = await res.json();
  const field = document.getElementById('view-pw-field');
  field.type = 'text';
  field.value = data.password;
}

async function copyPasswordById(e, id) {
  e.stopPropagation();
  const res = await apiFetch(`/passwords/${id}/decrypt`);
  if (!res || !res.ok) return;
  const data = await res.json();
  await navigator.clipboard.writeText(data.password);
  showToast('Password copied!');
}

// ─── Add / Edit Modal ────────────────────────────────────────────────
function openAddModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'Add Password';
  document.getElementById('entry-id').value = '';
  ['entry-title','entry-username','entry-url','entry-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('entry-password').value = '';
  document.getElementById('entry-category').value = 'General';
  document.getElementById('modal-alert').className = 'alert d-none';
}

function openEditModal(e, id) {
  e.stopPropagation();
  const entry = allEntries.find(en => en.id === id);
  if (!entry) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'Edit Password';
  document.getElementById('entry-title').value = entry.title;
  document.getElementById('entry-username').value = entry.username || '';
  document.getElementById('entry-url').value = entry.url || '';
  document.getElementById('entry-notes').value = entry.notes || '';
  document.getElementById('entry-category').value = entry.category || 'General';
  document.getElementById('entry-password').value = '';
  document.getElementById('modal-alert').className = 'alert d-none';
  new bootstrap.Modal(document.getElementById('passwordModal')).show();
}

function toggleEntryPw() {
  const field = document.getElementById('entry-password');
  const icon = document.getElementById('entry-pw-icon');
  field.type = field.type === 'password' ? 'text' : 'password';
  icon.className = field.type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
}

async function savePassword() {
  const title = document.getElementById('entry-title').value.trim();
  const password = document.getElementById('entry-password').value;
  const alertEl = document.getElementById('modal-alert');

  if (!title) { showModalAlert(alertEl, 'danger', 'Title is required.'); return; }
  if (!editingId && !password) { showModalAlert(alertEl, 'danger', 'Password is required.'); return; }

  const body = {
    title,
    username: document.getElementById('entry-username').value.trim(),
    url: document.getElementById('entry-url').value.trim(),
    notes: document.getElementById('entry-notes').value.trim(),
    category: document.getElementById('entry-category').value.trim() || 'General'
  };
  if (password) body.password = password;

  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const res = editingId
    ? await apiFetch(`/passwords/${editingId}`, { method: 'PUT', body: JSON.stringify(body) })
    : await apiFetch('/passwords/', { method: 'POST', body: JSON.stringify(body) });

  btn.disabled = false;
  btn.textContent = 'Save';

  if (!res || !res.ok) {
    let msg = `Save failed (HTTP ${res ? res.status : 'error'}).`;
    try {
      const err = res ? await res.json() : {};
      msg = err.message || err.msg || msg;
    } catch (_) {}
    showModalAlert(alertEl, 'danger', msg);
    return;
  }

  bootstrap.Modal.getInstance(document.getElementById('passwordModal')).hide();
  await loadPasswords();
  showToast(editingId ? 'Password updated!' : 'Password added!');
}

// ─── Delete ──────────────────────────────────────────────────────────
async function deleteEntry(e, id) {
  e.stopPropagation();
  if (!confirm('Delete this password entry?')) return;
  const res = await apiFetch(`/passwords/${id}`, { method: 'DELETE' });
  if (res && res.ok) {
    await loadPasswords();
    showToast('Deleted.');
  }
}

// ─── Export CSV ──────────────────────────────────────────────────────
async function exportPasswords() {
  const res = await fetch(`${API}/passwords/export`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res || !res.ok) { showToast('Export failed.'); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'corpvault_export.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Exported!');
}

// ─── Import CSV ──────────────────────────────────────────────────────
async function importPasswords() {
  const alertEl = document.getElementById('import-alert');
  const fileInput = document.getElementById('import-file');
  const btn = document.getElementById('import-btn');
  const file = fileInput.files[0];

  if (!file) {
    alertEl.className = 'alert alert-danger';
    alertEl.textContent = 'Please choose a CSV file.';
    return;
  }

  btn.disabled = true; btn.textContent = 'Importing...';

  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API}/passwords/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });

  btn.disabled = false; btn.innerHTML = '<i class="bi bi-upload me-1"></i>Import';

  if (!res || !res.ok) {
    let msg = 'Import failed.';
    try { const e = await res.json(); msg = e.message || msg; } catch (_) {}
    alertEl.className = 'alert alert-danger';
    alertEl.textContent = msg;
    return;
  }

  const data = await res.json();
  alertEl.className = 'alert alert-success';
  alertEl.textContent = `✓ Imported ${data.imported} entries. Skipped ${data.skipped}.`;
  fileInput.value = '';
  await loadPasswords();
  setTimeout(() => {
    bootstrap.Modal.getInstance(document.getElementById('importModal')).hide();
  }, 1500);
}

// ─── Generator ──────────────────────────────────────────────────────
async function generatePassword() {
  const length = document.getElementById('gen-length').value;
  const uppercase = document.getElementById('gen-uppercase').checked;
  const digits = document.getElementById('gen-digits').checked;
  const symbols = document.getElementById('gen-symbols').checked;
  const params = new URLSearchParams({ length, uppercase, digits, symbols });
  const res = await apiFetch(`/passwords/generate?${params}`);
  if (!res) return;
  const data = await res.json();
  generatedPw = data.password;
  document.getElementById('gen-result').value = generatedPw;
}

async function copyGenerated() {
  if (!generatedPw) return;
  await navigator.clipboard.writeText(generatedPw);
  const el = document.getElementById('gen-alert');
  el.classList.remove('d-none');
  setTimeout(() => el.classList.add('d-none'), 1500);
}

function useGenerated() {
  if (generatedPw) {
    document.getElementById('entry-password').value = generatedPw;
    bootstrap.Modal.getInstance(document.getElementById('generatorModal')).hide();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('passwordModal')).show();
  }
}

function fillGeneratedPassword() {
  if (generatedPw) document.getElementById('entry-password').value = generatedPw;
}

// ─── Change My Password ──────────────────────────────────────────────
async function changeMyPassword() {
  const current = document.getElementById('cp-current').value;
  const newPw = document.getElementById('cp-new').value;
  const alertEl = document.getElementById('cp-alert');

  if (!current || !newPw) { showModalAlert(alertEl, 'danger', 'All fields required.'); return; }

  const res = await apiFetch('/auth/change-password', {
    method: 'PUT',
    body: JSON.stringify({ current_password: current, new_password: newPw })
  });
  const data = res ? await res.json() : {};
  if (!res || !res.ok) { showModalAlert(alertEl, 'danger', data.message || 'Failed.'); return; }
  showModalAlert(alertEl, 'success', 'Password updated successfully!');
  setTimeout(() => bootstrap.Modal.getInstance(document.getElementById('changePasswordModal')).hide(), 1200);
}

// ─── Dark Mode ───────────────────────────────────────────────────────
function applyStoredTheme() {
  const dark = localStorage.getItem('darkMode') === '1';
  if (dark) {
    document.body.classList.add('dark-mode');
    document.getElementById('dark-mode-icon').className = 'bi bi-sun-fill';
  }
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', isDark ? '1' : '0');
  document.getElementById('dark-mode-icon').className = isDark ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
}

// ─── Helpers ─────────────────────────────────────────────────────────
function showModalAlert(el, type, msg) {
  el.className = `alert alert-${type}`;
  el.textContent = msg;
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', bottom: '1.5rem', right: '1.5rem',
    background: '#1e293b', color: '#fff', padding: '0.6rem 1.2rem',
    borderRadius: '0.5rem', zIndex: 9999, fontSize: '0.875rem',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

// ─── Auto-generate on generator modal open ───────────────────────────
document.getElementById('generatorModal').addEventListener('show.bs.modal', generatePassword);
