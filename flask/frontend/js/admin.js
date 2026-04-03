const API = '/api';
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || 'null');

if (!token || !user || user.role !== 'admin') {
  window.location.href = 'login.html';
}

let editingUserId = null;
let pendingDeleteId = null;

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

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}
