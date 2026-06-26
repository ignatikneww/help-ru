// =============================================
// Z-Horror Frontend — Steam Auth
// =============================================

const DA_URL = 'https://www.donationalerts.com/r/ВАШНИК';
const API = '';

// === User state ===
let currentUser = null;

// === Init ===
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initSlider();
    initNav();
});

// === Slider ===
function initSlider() {
    let i = 0;
    const s = document.querySelectorAll('.bg-slide');
    if (!s.length) return;
    setInterval(() => {
        s[i].classList.remove('active');
        i = (i + 1) % s.length;
        s[i].classList.add('active');
    }, 5000);
}

// === Nav active ===
function initNav() {
    const p = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach(a => {
        if (a.getAttribute('href') === p) a.classList.add('active');
    });
}

// === Copy IP ===
function copyIP() {
    const ip = document.getElementById('server-ip');
    if (!ip) return;
    navigator.clipboard.writeText(ip.textContent).then(() => {
        const b = document.querySelector('.hero .cta-btn');
        const t = b.textContent;
        b.textContent = '✅ IP скопирован!';
        b.style.background = 'linear-gradient(135deg, #1a5a00, #2a8000)';
        setTimeout(() => { b.textContent = t; b.style.background = ''; }, 2000);
    });
}

// === Steam Auth ===
async function checkAuth() {
    try {
        const res = await fetch(`${API}/api/me`, { credentials: 'include' });
        if (!res.ok) throw '';
        const data = await res.json();
        if (data.steamId) {
            currentUser = data;
            showLoggedIn(data);
        }
    } catch {
        currentUser = null;
        showLoggedOut();
    }
}

function showLoggedIn(user) {
    // Update all pages
    document.querySelectorAll('#loginBtn').forEach(e => e.style.display = 'none');
    document.querySelectorAll('#userInfo').forEach(e => {
        e.style.display = 'flex';
    });
    document.querySelectorAll('#userAvatar').forEach(e => e.src = user.avatar || '');
    document.querySelectorAll('#userName').forEach(e => e.textContent = user.name || user.steamId);
    document.querySelectorAll('#userBalance').forEach(e => {
        e.innerHTML = `${user.balance || 0} <img src="assets/zcoin.png" class="mini-coin">`;
    });

    // Coins page
    const authReq = document.getElementById('authRequired');
    const content = document.getElementById('coinsContent');
    if (authReq) authReq.style.display = 'none';
    if (content) content.style.display = 'block';

    const myBal = document.getElementById('myBalance');
    if (myBal) myBal.textContent = user.balance || 0;

    // Privileges page
    const privBal = document.getElementById('privBalance');
    const myPrivBal = document.getElementById('myPrivBalance');
    if (privBal) { privBal.style.display = 'flex'; }
    if (myPrivBal) myPrivBal.textContent = user.balance || 0;

    // Unban page
    const unbanAuth = document.getElementById('unbanAuth');
    const unbanReady = document.getElementById('unbanReady');
    const unbanBal = document.getElementById('unbanBal');
    if (unbanAuth) unbanAuth.style.display = 'none';
    if (unbanReady) unbanReady.style.display = 'block';
    if (unbanBal) unbanBal.textContent = user.balance || 0;
}

function showLoggedOut() {
    document.querySelectorAll('#loginBtn').forEach(e => e.style.display = 'flex');
    document.querySelectorAll('#userInfo').forEach(e => e.style.display = 'none');

    const authReq = document.getElementById('authRequired');
    const content = document.getElementById('coinsContent');
    if (authReq) authReq.style.display = 'block';
    if (content) content.style.display = 'none';

    const unbanAuth = document.getElementById('unbanAuth');
    const unbanReady = document.getElementById('unbanReady');
    if (unbanAuth) unbanAuth.style.display = 'block';
    if (unbanReady) unbanReady.style.display = 'none';
}

async function logout() {
    await fetch(`${API}/api/logout`, { credentials: 'include' });
    currentUser = null;
    showLoggedOut();
}

// === Buy Zcoin ===
function buyZcoin(amount) {
    if (!currentUser) { alert('Сначала войди через Steam'); return; }
    const url = `${DA_URL}?name=${encodeURIComponent(currentUser.steamId)}&amount=${amount}&message=${encodeURIComponent('Zcoin')}`;
    window.open(url, '_blank');
}

function buyZcoinCustom() {
    const v = parseInt(document.getElementById('customAmount')?.value) || 0;
    if (v < 100) { alert('Минимум 100 ₽'); return; }
    buyZcoin(v);
}

function calcCustom() {
    const v = parseInt(document.getElementById('customAmount')?.value) || 0;
    const el = document.getElementById('customResult');
    if (!el) return;
    let b = 0;
    if (v >= 5000) b = 1500; else if (v >= 2500) b = 500;
    else if (v >= 1000) b = 150; else if (v >= 500) b = 50;
    el.textContent = v >= 100 ? `${v + b}${b ? ' (+' + b + ')' : ''}` : '0';
}

// === Buy Privilege ===
async function buyPrivilege(name, price) {
    if (!currentUser) { alert('Сначала войди через Steam'); return; }
    if (!confirm(`Купить "${name}" за ${price} Zcoin?`)) return;

    try {
        const res = await fetch(`${API}/api/buy-privilege`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ privilege: name, price })
        });
        const d = await res.json();
        if (d.success) {
            showModal('✅', 'Куплено!', `${name} активируется автоматически.\nОстаток: ${d.balance} Zcoin`);
            currentUser.balance = d.balance;
            showLoggedIn(currentUser);
        } else {
            showModal('❌', 'Ошибка', d.error);
        }
    } catch { showModal('❌', 'Ошибка', 'Нет связи с сервером'); }
}

// === Buy Unban ===
async function buyUnban() {
    if (!currentUser) { alert('Войди через Steam'); return; }
    if (!confirm('Купить разбан за 299 Zcoin?')) return;

    try {
        const res = await fetch(`${API}/api/buy-unban`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });
        const d = await res.json();
        if (d.success) {
            showModal('🔓', 'Разбан куплен!', `Бан будет снят.\nОстаток: ${d.balance} Zcoin`);
            currentUser.balance = d.balance;
            showLoggedIn(currentUser);
        } else {
            showModal('❌', 'Ошибка', d.error);
        }
    } catch { showModal('❌', 'Ошибка', 'Нет связи с сервером'); }
}

// === Modal ===
function showModal(icon, title, text) {
    const m = document.getElementById('modal');
    if (!m) return;
    document.getElementById('mIcon').textContent = icon;
    document.getElementById('mTitle').textContent = title;
    document.getElementById('mText').textContent = text;
    m.style.display = 'flex';
}
function closeModal() {
    const m = document.getElementById('modal');
    if (m) m.style.display = 'none';
}