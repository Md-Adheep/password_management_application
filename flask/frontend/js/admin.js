const API = '/api';
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || 'null');

if (!token || !user || user.role !== 'admin') {
  window.location.href = 'login.html';
}

let editingUserId = null;
let pendingDeleteId = null;

let pendingDeleteGroupId = null;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('logout-btn').addEventListener('click', logout);
  loadStats();
  loadUsers();
});

// ─── API Helper ──────────────────────────────────────────────────────
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

// ─── Stats ───────────────────────────────────────────────────────────
async function loadStats() {
  const res = await apiFetch('/admin/stats');
  if (!res || !res.ok) return;
  const data = await res.json();
  document.getElementById('s-total').textContent = data.total_users;
  document.getElementById('s-active').textContent = data.active_users;
  document.getElementById('s-inactive').textContent = data.inactive_users;
  document.getElementById('s-passwords').textContent = data.total_passwords;
}

// ─── Users Table ─────────────────────────────────────────────────────
async function loadUsers() {
  const res = await apiFetch('/admin/users');
  if (!res || !res.ok) return;
  const users = await res.json();
  const tbody = document.getElementById('users-table');
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <div class="d-flex align-items-center gap-2">
          <div class="rounded-circle bg-primary bg-opacity-10 d-flex align-items-center justify-content-center"
               style="width:36px;height:36px;font-weight:700;color:var(--primary)">
            ${u.username.charAt(0).toUpperCase()}
          </div>
          <span class="fw-semibold">${escHtml(u.username)}</span>
          ${u.id === user.id ? '<span class="badge bg-secondary ms-1">You</span>' : ''}
        </div>
      </td>
      <td>${escHtml(u.email)}</td>
      <td>
        <span class="badge badge-role-${u.role} text-capitalize px-2">${u.role}</span>
      </td>
      <td>
        <span class="badge ${u.is_active ? 'bg-success' : 'bg-danger'} bg-opacity-10
                      text-${u.is_active ? 'success' : 'danger'} px-2">
          ${u.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td class="text-muted small">${u.last_login ? new Date(u.last_login).toLocaleDateString() : '—'}</td>
      <td class="text-muted small">${new Date(u.created_at).toLocaleDateString()}</td>
      <td class="text-end">
        <div class="d-flex justify-content-end gap-1">
          <button class="btn btn-sm btn-outline-secondary" onclick="openEditUser(${u.id})" title="Edit">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-${u.is_active ? 'warning' : 'success'}"
                  onclick="toggleActive(${u.id}, ${!u.is_active})"
                  title="${u.is_active ? 'Deactivate' : 'Activate'}">
            <i class="bi bi-${u.is_active ? 'person-slash' : 'person-check'}"></i>
          </button>
          ${u.id !== user.id ? `
          <button class="btn btn-sm btn-outline-danger" onclick="confirmDelete(${u.id}, '${escHtml(u.username)}')" title="Delete">
            <i class="bi bi-trash"></i>
          </button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

// ─── Create User ─────────────────────────────────────────────────────
function openCreateUser() {
  editingUserId = null;
  document.getElementById('user-modal-title').textContent = 'Add New User';
  document.getElementById('save-user-btn').textContent = 'Save User';
  ['u-username', 'u-email', 'u-password', 'u-new-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('u-role').value = 'user';
  document.getElementById('u-password-group').style.display = '';
  document.getElementById('u-reset-password-group').style.display = 'none';
  document.getElementById('user-modal-alert').className = 'alert d-none';
}

function openEditUser(id) {
  // Need to get user from table data – re-fetch
  apiFetch('/admin/users').then(async res => {
    if (!res) return;
    const users = await res.json();
    const u = users.find(x => x.id === id);
    if (!u) return;
    editingUserId = id;
    document.getElementById('user-modal-title').textContent = 'Edit User';
    document.getElementById('save-user-btn').textContent = 'Update User';
    document.getElementById('u-username').value = u.username;
    document.getElementById('u-email').value = u.email;
    document.getElementById('u-role').value = u.role;
    document.getElementById('u-password').value = '';
    document.getElementById('u-new-password').value = '';
    document.getElementById('u-password-group').style.display = 'none';
    document.getElementById('u-reset-password-group').style.display = '';
    document.getElementById('user-modal-alert').className = 'alert d-none';
    new bootstrap.Modal(document.getElementById('userModal')).show();
  });
}

async function saveUser() {
  const alertEl = document.getElementById('user-modal-alert');
  const username = document.getElementById('u-username').value.trim();
  const email = document.getElementById('u-email').value.trim();
  const role = document.getElementById('u-role').value;
  const btn = document.getElementById('save-user-btn');

  if (!username || !email) { showModalAlert(alertEl, 'danger', 'Username and email are required.'); return; }

  let body = { username, email, role };

  if (!editingUserId) {
    const password = document.getElementById('u-password').value;
    if (!password) { showModalAlert(alertEl, 'danger', 'Password is required.'); return; }
    body.password = password;
  } else {
    const newPw = document.getElementById('u-new-password').value;
    if (newPw) body.password = newPw;
  }

  btn.disabled = true;
  btn.textContent = 'Saving...';

  const res = editingUserId
    ? await apiFetch(`/admin/users/${editingUserId}`, { method: 'PUT', body: JSON.stringify(body) })
    : await apiFetch('/admin/users', { method: 'POST', body: JSON.stringify(body) });

  btn.disabled = false;
  btn.textContent = editingUserId ? 'Update User' : 'Save User';

  if (!res || !res.ok) {
    let msg = `Save failed (HTTP ${res ? res.status : 'error'}).`;
    try {
      const err = res ? await res.json() : {};
      msg = err.message || err.msg || msg;
    } catch (_) {}
    showModalAlert(alertEl, 'danger', msg);
    return;
  }

  bootstrap.Modal.getInstance(document.getElementById('userModal')).hide();
  loadUsers();
  loadStats();
  showToast(editingUserId ? 'User updated!' : 'User created!');
}

// ─── Toggle Active ───────────────────────────────────────────────────
async function toggleActive(id, isActive) {
  const res = await apiFetch(`/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ is_active: isActive })
  });
  if (res && res.ok) {
    loadUsers();
    loadStats();
    showToast(isActive ? 'User activated.' : 'User deactivated.');
  }
}

// ─── Delete ──────────────────────────────────────────────────────────
function confirmDelete(id, username) {
  pendingDeleteId = id;
  document.getElementById('delete-confirm-text').textContent =
    `Delete user "${username}"? All their passwords will also be deleted.`;
  document.getElementById('confirm-delete-btn').onclick = executeDelete;
  new bootstrap.Modal(document.getElementById('deleteModal')).show();
}

async function executeDelete() {
  bootstrap.Modal.getInstance(document.getElementById('deleteModal')).hide();
  const res = await apiFetch(`/admin/users/${pendingDeleteId}`, { method: 'DELETE' });
  if (res && res.ok) {
    loadUsers();
    loadStats();
    showToast('User deleted.');
  }
}

// ─── Toggle Password Visibility ──────────────────────────────────────
function toggleUPw() {
  const f = document.getElementById('u-password');
  const i = document.getElementById('u-pw-icon');
  f.type = f.type === 'password' ? 'text' : 'password';
  i.className = f.type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
}

function toggleUNewPw() {
  const f = document.getElementById('u-new-password');
  const i = document.getElementById('u-new-pw-icon');
  f.type = f.type === 'password' ? 'text' : 'password';
  i.className = f.type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
}

// ─── Helpers ─────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

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

// ─── Admin Tab Switching ─────────────────────────────────────────────
function switchAdminTab(tab) {
  document.getElementById('admin-tab-users').classList.toggle('d-none', tab !== 'users');
  document.getElementById('admin-tab-groups').classList.toggle('d-none', tab !== 'groups');
  document.getElementById('admin-tab-passwords').classList.toggle('d-none', tab !== 'passwords');
  document.querySelectorAll('#admin-tabs .nav-link').forEach((btn, i) => {
    btn.classList.toggle('active',
      (i === 0 && tab === 'users') ||
      (i === 1 && tab === 'groups') ||
      (i === 2 && tab === 'passwords')
    );
  });
  if (tab === 'groups')    loadAdminGroups();
  if (tab === 'passwords') loadAllPasswords();
}

// ─── Admin Groups ────────────────────────────────────────────────────
async function loadAdminGroups() {
  const res = await apiFetch('/groups/');
  if (!res || !res.ok) return;
  const groups = await res.json();
  const tbody = document.getElementById('groups-table');
  if (!groups.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No teams yet.</td></tr>';
    return;
  }
  tbody.innerHTML = groups.map(g => `
    <tr>
      <td class="fw-semibold">${escHtml(g.name)}</td>
      <td class="text-muted small">${escHtml(g.description || '—')}</td>
      <td><span class="badge bg-primary bg-opacity-10 text-primary">${g.member_count}</span></td>
      <td class="text-muted small">${new Date(g.created_at).toLocaleDateString()}</td>
      <td class="text-end">
        <div class="d-flex justify-content-end gap-1">
          <button class="btn btn-sm btn-outline-secondary" onclick="openEditAdminGroup(${g.id}, '${escHtml(g.name)}', '${escHtml(g.description || '')}')">
            <i class="bi bi-pencil"></i>
          </button>
          <a href="teams.html" class="btn btn-sm btn-outline-primary" title="Manage Members">
            <i class="bi bi-people"></i>
          </a>
          <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteGroup(${g.id}, '${escHtml(g.name)}')">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openCreateAdminGroup() {
  document.getElementById('ag-edit-id').value = '';
  document.getElementById('ag-modal-title').textContent = 'New Team';
  document.getElementById('ag-save-btn').textContent = 'Create Team';
  document.getElementById('ag-name').value = '';
  document.getElementById('ag-desc').value = '';
  document.getElementById('ag-modal-alert').className = 'alert d-none';
}

function openEditAdminGroup(id, name, desc) {
  document.getElementById('ag-edit-id').value = id;
  document.getElementById('ag-modal-title').textContent = 'Edit Team';
  document.getElementById('ag-save-btn').textContent = 'Save Changes';
  document.getElementById('ag-name').value = name;
  document.getElementById('ag-desc').value = desc;
  document.getElementById('ag-modal-alert').className = 'alert d-none';
  new bootstrap.Modal(document.getElementById('adminGroupModal')).show();
}

async function saveAdminGroup() {
  const alertEl = document.getElementById('ag-modal-alert');
  const name = document.getElementById('ag-name').value.trim();
  const desc = document.getElementById('ag-desc').value.trim();
  const editId = document.getElementById('ag-edit-id').value;
  if (!name) {
    alertEl.className = 'alert alert-danger';
    alertEl.textContent = 'Team name is required.';
    return;
  }
  const btn = document.getElementById('ag-save-btn');
  btn.disabled = true; btn.textContent = 'Saving...';
  const res = editId
    ? await apiFetch(`/groups/${editId}`, { method: 'PUT', body: JSON.stringify({ name, description: desc }) })
    : await apiFetch('/groups/', { method: 'POST', body: JSON.stringify({ name, description: desc }) });
  btn.disabled = false;
  btn.textContent = editId ? 'Save Changes' : 'Create Team';
  if (!res || !res.ok) {
    let msg = 'Save failed.';
    try { const e = await res.json(); msg = e.message || msg; } catch (_) {}
    alertEl.className = 'alert alert-danger';
    alertEl.textContent = msg;
    return;
  }
  bootstrap.Modal.getInstance(document.getElementById('adminGroupModal')).hide();
  loadAdminGroups();
  showToast(editId ? 'Team updated!' : 'Team created!');
}

function confirmDeleteGroup(id, name) {
  pendingDeleteGroupId = id;
  document.getElementById('delete-group-confirm-text').textContent =
    `Delete team "${name}"? All shared passwords in this team will be deleted.`;
  document.getElementById('confirm-delete-group-btn').onclick = executeDeleteGroup;
  new bootstrap.Modal(document.getElementById('deleteGroupModal')).show();
}

async function executeDeleteGroup() {
  bootstrap.Modal.getInstance(document.getElementById('deleteGroupModal')).hide();
  const res = await apiFetch(`/groups/${pendingDeleteGroupId}`, { method: 'DELETE' });
  if (res && res.ok) { loadAdminGroups(); showToast('Team deleted.'); }
  else showToast('Delete failed.');
}

// ─── All Passwords ───────────────────────────────────────────────────
let allPasswords = [];

async function loadAllPasswords() {
  const res = await apiFetch('/admin/all-passwords');
  if (!res || !res.ok) return;
  allPasswords = await res.json();
  _populateApFilters();
  filterAllPasswords();
}

function _populateApFilters() {
  // User filter
  const userSel = document.getElementById('ap-user-filter');
  const catSel  = document.getElementById('ap-cat-filter');
  const users = {};
  const cats  = new Set();
  allPasswords.forEach(p => {
    users[p.user_id] = p.owner_username;
    if (p.category) cats.add(p.category);
  });
  userSel.innerHTML = '<option value="">All Users</option>' +
    Object.entries(users).map(([id, name]) =>
      `<option value="${id}">${escHtml(name)}</option>`
    ).join('');
  catSel.innerHTML = '<option value="">All Categories</option>' +
    [...cats].sort().map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
}

function filterAllPasswords() {
  const search  = (document.getElementById('ap-search').value || '').toLowerCase();
  const userId  = document.getElementById('ap-user-filter').value;
  const cat     = document.getElementById('ap-cat-filter').value;

  const filtered = allPasswords.filter(p => {
    const matchSearch = !search ||
      p.title.toLowerCase().includes(search) ||
      (p.username || '').toLowerCase().includes(search) ||
      (p.url || '').toLowerCase().includes(search);
    const matchUser = !userId || String(p.user_id) === userId;
    const matchCat  = !cat    || p.category === cat;
    return matchSearch && matchUser && matchCat;
  });

  document.getElementById('ap-count').textContent = filtered.length + ' entries';
  _renderApTable(filtered);
}

function _renderApTable(entries) {
  const tbody = document.getElementById('ap-table');
  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No passwords found.</td></tr>';
    return;
  }
  tbody.innerHTML = entries.map(p => `
    <tr>
      <td class="fw-semibold">${escHtml(p.title)}</td>
      <td class="text-muted small">${escHtml(p.username || '—')}</td>
      <td><span class="badge bg-primary bg-opacity-10 text-primary">${escHtml(p.category || 'General')}</span></td>
      <td>
        <div class="d-flex align-items-center gap-1">
          <div class="rounded-circle bg-warning bg-opacity-25 d-flex align-items-center justify-content-center"
               style="width:26px;height:26px;font-size:0.75rem;font-weight:700;color:#92400e">
            ${escHtml((p.owner_username || '?').charAt(0).toUpperCase())}
          </div>
          <span class="small">${escHtml(p.owner_username || '?')}</span>
        </div>
      </td>
      <td class="text-muted small">
        ${p.url ? `<a href="${escHtml(p.url)}" target="_blank" rel="noopener" class="text-truncate d-inline-block" style="max-width:120px">${escHtml(p.url)}</a>` : '—'}
      </td>
      <td class="text-muted small">${new Date(p.updated_at).toLocaleDateString()}</td>
      <td class="text-end">
        <div class="d-flex justify-content-end gap-1">
          <button class="btn btn-sm btn-outline-primary" onclick="viewApPassword(${p.id})" title="View">
            <i class="bi bi-eye"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteApPassword(${p.id}, '${escHtml(p.title)}')" title="Delete">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function viewApPassword(id) {
  const p = allPasswords.find(x => x.id === id);
  if (!p) return;

  document.getElementById('ap-view-title').textContent = p.title;
  document.getElementById('ap-view-body').innerHTML = `
    <div class="alert alert-warning py-2 small mb-3">
      <i class="bi bi-person-fill me-1"></i>
      Owner: <strong>${escHtml(p.owner_username)}</strong> (${escHtml(p.owner_email)})
    </div>
    <div class="view-field"><label>Username</label>
      <div class="value">${escHtml(p.username || '—')}</div></div>
    <div class="view-field"><label>Password</label>
      <div class="input-group">
        <input type="password" class="form-control form-control-sm font-monospace"
               id="ap-pw-field-${id}" value="••••••••" readonly />
        <button class="btn btn-sm btn-outline-secondary" onclick="revealApPassword(${id})">
          <i class="bi bi-eye"></i>
        </button>
      </div>
    </div>
    ${p.url ? `<div class="view-field"><label>URL</label>
      <div class="value"><a href="${escHtml(p.url)}" target="_blank" rel="noopener">${escHtml(p.url)}</a></div></div>` : ''}
    ${p.category ? `<div class="view-field"><label>Category</label>
      <div class="value"><span class="pw-card-badge">${escHtml(p.category)}</span></div></div>` : ''}
    ${p.notes ? `<div class="view-field"><label>Notes</label>
      <div class="value">${escHtml(p.notes)}</div></div>` : ''}
    <div class="view-field"><label>Last Updated</label>
      <div class="value text-muted small">${new Date(p.updated_at).toLocaleString()}</div></div>
  `;
  new bootstrap.Modal(document.getElementById('apViewModal')).show();
}

async function revealApPassword(id) {
  const res = await apiFetch('/admin/all-passwords/' + id + '/decrypt');
  if (!res || !res.ok) { showToast('Failed to decrypt'); return; }
  const data = await res.json();
  const field = document.getElementById('ap-pw-field-' + id);
  if (field) { field.type = 'text'; field.value = data.password; }
}

async function deleteApPassword(id, title) {
  if (!confirm('Delete password "' + title + '"?')) return;
  const res = await apiFetch('/admin/all-passwords/' + id, { method: 'DELETE' });
  if (res && res.ok) {
    allPasswords = allPasswords.filter(p => p.id !== id);
    filterAllPasswords();
    showToast('Password deleted.');
  } else {
    showToast('Delete failed.');
  }
}

// ─── Logout ──────────────────────────────────────────────────────────
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}
