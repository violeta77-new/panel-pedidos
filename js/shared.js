const API_URL = 'https://script.google.com/macros/s/AKfycby56eHdQIjfgQ9BRUbzoq238xSVD56Bl19popJmN4K2jl1eeHO0WRlp2h6GtFYPox9diA/exec';

async function apiGet(action) {
  var r = await fetch(API_URL + '?action=' + action);
  return r.json();
}

async function apiPost(body) {
  var r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body)
  });
  return r.json();
}

function fmtMoney(v) {
  var n = Number(v); if (!n && n !== 0) return '—';
  return '$' + n.toLocaleString('es-CO');
}

function fmtDate(v) {
  if (!v) return '—';
  var d = v instanceof Date ? v : new Date(v);
  return isNaN(d) ? String(v) : d.toLocaleDateString('es-CO', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function today() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function toDateInput(v) {
  if (!v) return '';
  var d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return '';
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function norm(s) { return (s||'').toLowerCase().trim(); }

function showToast(msg, color) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.style.background = color || '#1a5276';
  t.classList.add('show'); setTimeout(function() { t.classList.remove('show'); }, 3500);
}

function isBackdropClick(e) {
  return e.target === e.currentTarget && e.offsetX <= e.currentTarget.clientWidth && e.offsetY <= e.currentTarget.clientHeight;
}

function setSyncStatus(state, msg) {
  var el = document.getElementById('sync-status');
  var ico = document.getElementById('sync-icon');
  var msgEl = document.getElementById('sync-msg');
  if (!el) return;
  el.className = state === 'ok' ? '' : state === 'syncing' ? 'syncing' : 'error';
  ico.textContent = state === 'ok' ? '☁️' : state === 'syncing' ? '🔄' : '⚠️';
  msgEl.textContent = msg;
}
