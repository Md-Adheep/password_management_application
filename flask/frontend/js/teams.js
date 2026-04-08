const API = '/api';
const token = localStorage.getItem('token');
const currentUser = JSON.parse(localStorage.getItem('user') || 'null');

if (!token || !currentUser) {
  window.location.href = 'login.html';
}

const isAdmin = currentUser && currentUser.role === 'admin';

let currentGroupId = null;
let currentGroupMembers = [];
let allUsers = [];

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('nav-username').textContent = currentUser.username;
  if (isAdmin) {
    document.getElementById('admin-link').classList.remove('d-none');
    document.getElementById('create-group-btn').classList.remove('d-none');
  }
  document.getElementById('logout-btn').addEventListener('click', logout);
  loadGroups();
  if (isAdmin) loadAllUsers();
});

// ─── API Helper ───────────────────────────────────────────────────────────────

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

// ─── Groups List ──────────────────────────────────────────────────────────────

async function loadGroups() {
  const res = await apiFetch('/groups/');
  if (!res || !res.ok) return;
  const groups = await res.json();
  renderGroups(groups);
}

function renderGroups(groups) {
  const grid = document.getElementById('groups-grid');
  const empty = document.getElementById('groups-empty');
  if (!groups.length) {
    empty.classList.remove('d-none');
    return;
  }
  empty.classList.add('d-none');
  grid.innerHTML = groups.map(g => `
    <div class="col-sm-6 col-lg-4">
      <div class="card border-0 shadow-sm h-100 group-card" style="cursor:pointer" onclick="openGroupDetail(${g.id}, ${JSON.stringify(g).replace(/"/g, '&quot;')})">
        <div class="card-body">
          <div class="d-flex align-items-start justify-content-between">
            <div class="d-flex align-items-center gap-2 mb-2">
              <div class="rounded-circle d-flex align-items-center justify-content-center"
                   style="width:40px;height:40px;background:var(--primary-light);color:var(--primary);font-weight:700;font-size:1.1rem">
                ${escHtml(g.name.charAt(0).toUpperCase())}
              </div>
              <div>
                <div class="fw-semibold">${escHtml(g.name)}</div>
                <div class="text-muted small">${g.member_count} member${g.member_count !== 1 ? 's' : ''}</div>
              </div>
            </div>
            ${isAdmin ? `
            <div class="dropdown" onclick="event.stopPropagation()">
              <button class="btn btn-sm btn-outline-secondary" data-bs-toggle="dropdown">
                <i class="bi bi-three-dots-vertical"></i>
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><a class="dropdown-item" href="#" onclick="openEditGroup(${g.id}, '${escHtml(g.name)}', '${escHtml(g.description || '')}')">
                  <i class="bi bi-pencil me-2"></i>Edit
                </a></li>
                <li><a class="dropdown-item text-danger" href="#" onclick="deleteGroup(${g.id}, '${escHtml(g.name)}')">
                  <i class="bi bi-trash me-2"></i>Delete
                </a></li>
              </ul>
            </div>` : ''}
          </div>
          ${g.description ? `<p class="text-muted small mb-0">${escHtml(g.description)}</p>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

// ─── Group Detail ─────────────────────────────────────────────────────────────

async function openGroupDetail(groupId, groupData) {
  currentGroupId = groupId;

  document.getElementById('detail-group-name').textContent = groupData.name;
  document.getElementById('detail-member-count').textContent = `${groupData.member_count} members`;

  // Show detail panel, hide list
  document.getElementById('groups-grid').closest('.container-fluid').classList.add('d-none');
  document.getElementById('group-detail').classList.remove('d-none');

  // Check if current user can manage (admin or manager)
  const canManage = isAdmin || await checkIsManager(groupId);
  if (canManage) {
    document.getElementById('add-member-btn').classList.remove('d-none');
    document.getElementById('members-actions-header').classList.remove('d-none');
  } else {
    document.getElementById('add-member-btn').classList.add('d-none');
    document.getElementById('members-actions-header').classList.add('d-none');
  }

  showTab('passwords');
  loadGroupPasswords(groupId);
  loadGroupMembers(groupId);
}

async function checkIsManager(groupId) {
  const res = await apiFetch(`/groups/${groupId}/members`);
  if (!res || !res.ok) return false;
  const members = await res.json();
  currentGroupMembers = members;
  const me = members.find(m => m.user_id === currentUser.id);
  return me && me.role === 'manager';
}

function closeGroupDetail() {
  currentGroupId = null;
  document.getElementById('group-detail').classList.add('d-none');
  document.querySelector('.container-fluid.px-4.py-4').classList.remove('d-none');
  loadGroups();
}

function showTab(tab) {
  document.getElementById('tab-passwords').classList.toggle('d-none', tab !== 'passwords');
  document.getElementById('tab-members').classList.toggle('d-none', tab !== 'members');
  document.querySelectorAll('#detail-tabs .nav-link').forEach((btn, i) => {
    btn.classList.toggle('active', (i === 0 && tab === 'passwords') || (i === 1 && tab === 'members'));
  });
}

// ─── Group Passwords ──────────────────────────────────────────────────────────

async function loadGroupPasswords(groupId) {
  const res = await apiFetch(`/groups/${groupId}/passwords`);
  if (!res || !res.ok) return;
  const pwds = await res.json();
  renderGroupPasswords(pwds, groupId);
}

function renderGroupPasswords(pwds, groupId) {
  const grid = document.getElementById('group-pw-grid');
  const empty = document.getElementById('group-pw-empty');
  if (!pwds.length) {
    empty.classList.remove('d-none');
    grid.innerHTML = '';
    return;
  }
  empty.classList.add('d-none');
  grid.innerHTML = pwds.map(p => `
    <div class="col-sm-6 col-lg-4">
      <div class="pw-card" onclick="viewGroupPassword(${p.id}, ${groupId})">
        <div class="d-flex align-items-start gap-2 mb-2">
          <div class="pw-card-icon"><i class="bi bi-key-fill"></i></div>
          <div class="flex-fill overflow-hidden">
            <div class="pw-card-title">${escHtml(p.title)}</div>
            <div class="pw-card-sub">${p.username ? escHtml(p.username) : '—'}</div>
          </div>
          <span class="pw-card-badge">${escHtml(p.category || 'General')}</span>
        </div>
        <div class="d-flex justify-content-between align-items-center mt-2">
          <small class="text-muted">by ${escHtml(p.added_by_username || '?')}</small>
          <div class="pw-card-actions" onclick="event.stopPropagation()">
            <button class="btn btn-sm btn-outline-primary" onclick="viewGroupPassword(${p.id}, ${groupId})" title="View">
              <i class="bi bi-eye"></i>
            </button>
            ${(isAdmin || p.added_by === currentUser.id) ? `
            <button class="btn btn-sm btn-outline-danger" onclick="deleteGroupPassword(${p.id}, ${groupId})" title="Delete">
              <i class="bi bi-trash"></i>
            </button>` : ''}
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

async function viewGroupPassword(pwdId, groupId) {
  const res = await apiFetch(`/groups/${groupId}/passwords/${pwdId}/decrypt`);
  if (!res || !res.ok) { showToast('Failed to decrypt password'); return; }
  const data = await res.json();

  // Get password metadata from grid
  const pwdRes = await apiFetch(`/groups/${groupId}/passwords`);
  if (!pwdRes || !pwdRes.ok) return;
  const pwds = await pwdRes.json();
  const p = pwds.find(x => x.id === pwdId);
  if (!p) return;

  document.getElementById('view-gp-title').textContent = p.title;
  document.getElementById('view-gp-body').innerHTML = `
    ${p.username ? viewField('Username', escHtml(p.username), true) : ''}
    ${viewField('Password', escHtml(data.password), true)}
    ${p.url ? viewField('URL', `<a href="${escHtml(p.url)}" target="_blank" rel="noopener">${escHtml(p.url)}</a>`) : ''}
    ${p.category ? viewField('Category', escHtml(p.category)) : ''}
    ${p.notes ? viewField('Notes', escHtml(p.notes)) : ''}
    <div class="text-muted small mt-3">Added by <strong>${escHtml(p.added_by_username || '?')}</strong></div>
  `;
  new bootstrap.Modal(document.getElementById('viewGpModal')).show();
}

function viewField(label, valueHtml, copyable = false) {
  const copyBtn = copyable
    ? `<span class="copy-btn ms-2" onclick="copyText('${valueHtml.replace(/'/g, "\\'")}')"><i class="bi bi-clipboard"></i></span>`
    : '';
  return `<div class="view-field"><label>${label}</label><div class="value">${valueHtml}${copyBtn}</div></div>`;
}

async function deleteGroupPassword(pwdId, groupId) {
  if (!confirm('Delete this password?')) return;
  const res = await apiFetch(`/groups/${groupId}/passwords/${pwdId}`, { method: 'DELETE' });
  if (res && res.ok) {
    showToast('Password deleted.');
    loadGroupPasswords(groupId);
  } else {
    showToast('Delete failed.');
  }
}

// ─── Add Group Password ───────────────────────────────────────────────────────

function openAddGroupPw() {
  ['gp-title', 'gp-username', 'gp-password', 'gp-url', 'gp-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('gp-category').value = 'General';
  document.getElementById('gp-modal-alert').className = 'alert d-none';
}

async function saveGroupPassword() {
  const alertEl = document.getElementById('gp-modal-alert');
  const title = document.getElementById('gp-title').value.trim();
  const password = document.getElementById('gp-password').value;
  if (!title || !password) {
    showAlert(alertEl, 'danger', 'Title and password are required.');
    return;
  }
  const btn = document.getElementById('save-gp-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  const body = {
    title,
    password,
    username: document.getElementById('gp-username').value.trim(),
    url: document.getElementById('gp-url').value.trim(),
    category: document.getElementById('gp-category').value.trim() || 'General',
    notes: document.getElementById('gp-notes').value.trim()
  };

  const res = await apiFetch(`/groups/${currentGroupId}/passwords`, {
    method: 'POST', body: JSON.stringify(body)
  });
  btn.disabled = false; btn.textContent = 'Save Password';

  if (!res || !res.ok) {
    let msg = 'Save failed.';
    try { const e = await res.json(); msg = e.message || msg; } catch (_) {}
    showAlert(alertEl, 'danger', msg);
    return;
  }
  bootstrap.Modal.getInstance(document.getElementById('groupPwModal')).hide();
  loadGroupPasswords(currentGroupId);
  showToast('Password added!');
}

function toggleGpPw() {
  const f = document.getElementById('gp-password');
  const i = document.getElementById('gp-pw-icon');
  f.type = f.type === 'password' ? 'text' : 'password';
  i.className = f.type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
}

// ─── Members ──────────────────────────────────────────────────────────────────

async function loadGroupMembers(groupId) {
  const res = await apiFetch(`/groups/${groupId}/members`);
  if (!res || !res.ok) return;
  const members = await res.json();
  currentGroupMembers = members;
  renderMembers(members, groupId);
}

function renderMembers(members, groupId) {
  const canManage = isAdmin || currentGroupMembers.some(
    m => m.user_id === currentUser.id && m.role === 'manager'
  );
  const tbody = document.getElementById('members-table');
  tbody.innerHTML = members.map(m => `
    <tr>
      <td>
        <div class="d-flex align-items-center gap-2">
          <div class="rounded-circle bg-primary bg-opacity-10 d-flex align-items-center justify-content-center"
               style="width:32px;height:32px;font-weight:700;color:var(--primary);font-size:0.85rem">
            ${(m.username || '?').charAt(0).toUpperCase()}
          </div>
          <span class="fw-semibold">${escHtml(m.username || '?')}</span>
          ${m.user_id === currentUser.id ? '<span class="badge bg-secondary ms-1">You</span>' : ''}
        </div>
      </td>
      <td class="text-muted small">${escHtml(m.email || '—')}</td>
      <td>
        <span class="badge ${m.role === 'manager' ? 'bg-warning text-dark' : 'bg-secondary bg-opacity-10 text-secondary'}">
          ${m.role}
        </span>
      </td>
      <td class="text-muted small">${new Date(m.joined_at).toLocaleDateString()}</td>
      <td class="text-end ${canManage ? '' : 'd-none'}">
        ${(canManage && m.user_id !== currentUser.id) ? `
        <button class="btn btn-sm btn-outline-danger" onclick="removeMember(${m.user_id}, '${escHtml(m.username)}')">
          <i class="bi bi-person-dash"></i>
        </button>` : ''}
      </td>
    </tr>
  `).join('');
}

// ─── Add Member ───────────────────────────────────────────────────────────────

async function loadAllUsers() {
  const res = await apiFetch('/admin/users');
  if (!res || !res.ok) return;
  allUsers = await res.json();
}

function openAddMember() {
  document.getElementById('member-modal-alert').className = 'alert d-none';
  const select = document.getElementById('m-user-id');
  const existingIds = currentGroupMembers.map(m => m.user_id);
  const available = allUsers.filter(u => !existingIds.includes(u.id));
  select.innerHTML = available.length
    ? available.map(u => `<option value="${u.id}">${escHtml(u.username)} (${escHtml(u.email)})</option>`).join('')
    : '<option value="">No users available</option>';
  document.getElementById('m-role').value = 'member';
}

async function addMember() {
  const alertEl = document.getElementById('member-modal-alert');
  const userId = parseInt(document.getElementById('m-user-id').value);
  const role = document.getElementById('m-role').value;
  if (!userId) { showAlert(alertEl, 'danger', 'Select a user.'); return; }

  const res = await apiFetch(`/groups/${currentGroupId}/members`, {
    method: 'POST', body: JSON.stringify({ user_id: userId, role })
  });
  if (!res || !res.ok) {
    let msg = 'Failed to add member.';
    try { const e = await res.json(); msg = e.message || msg; } catch (_) {}
    showAlert(alertEl, 'danger', msg);
    return;
  }
  bootstrap.Modal.getInstance(document.getElementById('memberModal')).hide();
  loadGroupMembers(currentGroupId);
  document.getElementById('detail-member-count').textContent = `${currentGroupMembers.length + 1} members`;
  showToast('Member added!');
}

async function removeMember(userId, username) {
  if (!confirm(`Remove ${username} from this team?`)) return;
  const res = await apiFetch(`/groups/${currentGroupId}/members/${userId}`, { method: 'DELETE' });
  if (res && res.ok) {
    loadGroupMembers(currentGroupId);
    showToast('Member removed.');
  } else {
    showToast('Failed to remove member.');
  }
}

// ─── Create / Edit Group ──────────────────────────────────────────────────────

function openCreateGroup() {
  document.getElementById('group-edit-id').value = '';
  document.getElementById('group-modal-title').textContent = 'New Team';
  document.getElementById('save-group-btn').textContent = 'Create Team';
  document.getElementById('g-name').value = '';
  document.getElementById('g-desc').value = '';
  document.getElementById('group-modal-alert').className = 'alert d-none';
}

function openEditGroup(id, name, desc) {
  document.getElementById('group-edit-id').value = id;
  document.getElementById('group-modal-title').textContent = 'Edit Team';
  document.getElementById('save-group-btn').textContent = 'Save Changes';
  document.getElementById('g-name').value = name;
  document.getElementById('g-desc').value = desc;
  document.getElementById('group-modal-alert').className = 'alert d-none';
  new bootstrap.Modal(document.getElementById('groupModal')).show();
}

async function saveGroup() {
  const alertEl = document.getElementById('group-modal-alert');
  const name = document.getElementById('g-name').value.trim();
  const desc = document.getElementById('g-desc').value.trim();
  const editId = document.getElementById('group-edit-id').value;

  if (!name) { showAlert(alertEl, 'danger', 'Team name is required.'); return; }

  const btn = document.getElementById('save-group-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  const res = editId
    ? await apiFetch(`/groups/${editId}`, { method: 'PUT', body: JSON.stringify({ name, description: desc }) })
    : await apiFetch('/groups/', { method: 'POST', body: JSON.stringify({ name, description: desc }) });

  btn.disabled = false;
  btn.textContent = editId ? 'Save Changes' : 'Create Team';

  if (!res || !res.ok) {
    let msg = 'Save failed.';
    try { const e = await res.json(); msg = e.message || msg; } catch (_) {}
    showAlert(alertEl, 'danger', msg);
    return;
  }
  bootstrap.Modal.getInstance(document.getElementById('groupModal')).hide();
  loadGroups();
  showToast(editId ? 'Team updated!' : 'Team created!');
}

async function deleteGroup(id, name) {
  if (!confirm(`Delete team "${name}"? All its passwords will be deleted.`)) return;
  const res = await apiFetch(`/groups/${id}`, { method: 'DELETE' });
  if (res && res.ok) { loadGroups(); showToast('Team deleted.'); }
  else showToast('Delete failed.');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showAlert(el, type, msg) {
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
  setTimeout(() => t.remove(), 2500);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); showToast('Copied!'); } catch (_) {}
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}
