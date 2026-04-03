const API = '/api';

// If already logged in, redirect
const token = localStorage.getItem('token');
if (token) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  window.location.href = user.role === 'admin' ? 'dashboard.html' : 'dashboard.html';
}

document.getElementById('toggle-pw').addEventListener('click', () => {
  const pw = document.getElementById('password');
  const icon = document.querySelector('#toggle-pw i');
  if (pw.type === 'password') {
    pw.type = 'text';
    icon.className = 'bi bi-eye-slash';
  } else {
    pw.type = 'password';
    icon.className = 'bi bi-eye';
  }
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const spinner = document.getElementById('login-spinner');
  const alertBox = document.getElementById('alert-box');

  btn.disabled = true;
  spinner.classList.remove('d-none');
  alertBox.className = 'alert d-none';

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      alertBox.className = 'alert alert-danger';
      alertBox.textContent = data.message || 'Login failed';
      return;
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.location.href = 'dashboard.html';
  } catch {
    alertBox.className = 'alert alert-danger';
    alertBox.textContent = 'Cannot connect to server. Please try again.';
  } finally {
    btn.disabled = false;
    spinner.classList.add('d-none');
  }
});
