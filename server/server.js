require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DOMAIN = process.env.DOMAIN || `http://localhost:${PORT}`;

// === Middleware ===
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'z-horror-secret-key-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 дней
}));

app.use(passport.initialize());
app.use(passport.session());

// Статика
app.use(express.static(path.join(__dirname, '..')));

// === Database ===
const DB_PATH = path.join(__dirname, 'database.json');

function load() {
    try { if (fs.existsSync(DB_PATH)) return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
    catch (e) { console.error('DB:', e); }
    return { users: {}, transactions: [], pending: [] };
}
function save(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

let db = load();

function getBonus(a) {
    if (a >= 5000) return 1500; if (a >= 2500) return 500;
    if (a >= 1000) return 150; if (a >= 500) return 50; return 0;
}

function ensureUser(steamId, profile) {
    if (!db.users[steamId]) {
        db.users[steamId] = {
            steamId, name: profile?.displayName || '',
            avatar: profile?.photos?.[1]?.value || profile?.photos?.[0]?.value || '',
            balance: 0, total: 0, history: [], created: new Date().toISOString()
        };
        save(db);
    } else if (profile) {
        db.users[steamId].name = profile.displayName || db.users[steamId].name;
        db.users[steamId].avatar = profile.photos?.[1]?.value || profile.photos?.[0]?.value || db.users[steamId].avatar;
        save(db);
    }
    return db.users[steamId];
}

function addCoins(steamId, amount, source) {
    const user = ensureUser(steamId);
    const b = getBonus(amount);
    const total = amount + b;
    user.balance += total;
    user.total += amount;
    user.history.push({ id: crypto.randomUUID(), amount, bonus: b, total, source, time: new Date().toISOString() });
    db.transactions.push({ steamId, amount, bonus: b, total, source, time: new Date().toISOString() });
    save(db);
    console.log(`✅ ${steamId}: +${total} Zcoin [${source}]`);
    return { balance: user.balance, added: total };
}

// === Steam Auth ===
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    const user = db.users[id];
    done(null, user ? { steamId: id, ...user } : null);
});

passport.use(new SteamStrategy({
    returnURL: `${DOMAIN}/auth/steam/callback`,
    realm: DOMAIN,
    apiKey: process.env.STEAM_API_KEY
}, (identifier, profile, done) => {
    const steamId = identifier.split('/').pop();
    ensureUser(steamId, profile);
    done(null, { id: steamId });
}));

app.get('/auth/steam', passport.authenticate('steam'));

app.get('/auth/steam/callback',
    passport.authenticate('steam', { failureRedirect: '/' }),
    (req, res) => res.redirect('/')
);

// === API ===
// Текущий пользователь
app.get('/api/me', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'not_auth' });
    const u = db.users[req.user.steamId];
    res.json({
        steamId: req.user.steamId,
        name: u?.name || '',
        avatar: u?.avatar || '',
        balance: u?.balance || 0
    });
});

app.get('/api/logout', (req, res) => {
    req.logout(() => {});
    req.session.destroy();
    res.json({ ok: true });
});

// Покупка привилегии
app.post('/api/buy-privilege', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Войди через Steam' });
    const { privilege, price } = req.body;
    const u = db.users[req.user.steamId];
    if (!u) return res.json({ success: false, error: 'Аккаунт не найден' });
    if (u.balance < price) return res.json({ success: false, error: `Не хватает. Нужно: ${price}, есть: ${u.balance}` });

    u.balance -= price;
    u.history.push({ type: 'buy_priv', privilege, price, time: new Date().toISOString() });
    db.pending.push({ type: 'privilege', steamId: req.user.steamId, privilege, price, time: new Date().toISOString() });
    save(db);
    console.log(`🎮 ${req.user.steamId}: купил "${privilege}" за ${price}`);
    res.json({ success: true, balance: u.balance });
});

// Разбан
app.post('/api/buy-unban', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Войди через Steam' });
    const u = db.users[req.user.steamId];
    if (!u) return res.json({ success: false, error: 'Аккаунт не найден' });
    if (u.balance < 299) return res.json({ success: false, error: `Не хватает. Нужно: 299, есть: ${u.balance}` });

    u.balance -= 299;
    u.history.push({ type: 'unban', price: 299, time: new Date().toISOString() });
    db.pending.push({ type: 'unban', steamId: req.user.steamId, time: new Date().toISOString() });
    save(db);
    console.log(`🔓 ${req.user.steamId}: разбан`);
    res.json({ success: true, balance: u.balance });
});

// Webhook DonationAlerts
app.post('/api/webhook/donationalerts', (req, res) => {
    try {
        const d = req.body;
        const amount = Math.floor(parseFloat(d.amount) || 0);
        if (amount < 100) return res.json({ status: 'ignored' });

        let rubles = amount;
        if (d.currency === 'USD') rubles *= 90;
        if (d.currency === 'EUR') rubles *= 100;

        const text = (d.username || d.name || '') + ' ' + (d.message || '');
        let steamId = null;
        let m = text.match(/STEAM_\d:\d:\d+/i);
        if (m) steamId = m[0].toUpperCase();
        if (!steamId) { m = text.match(/7656119\d{10}/); if (m) steamId = m[0]; }

        if (!steamId) {
            db.pending.push({ type: 'unmatched', amount: rubles, sender: d.username, message: d.message, time: new Date().toISOString() });
            save(db);
            return res.json({ status: 'no_steamid' });
        }

        const donId = d.id || crypto.randomUUID();
        if (db.transactions.some(t => t.source === `da_${donId}`)) return res.json({ status: 'dup' });

        addCoins(steamId, rubles, `da_${donId}`);
        res.json({ status: 'ok' });
    } catch (e) {
        console.error('Webhook error:', e);
        res.json({ status: 'error' });
    }
});

// Баланс (публичный)
app.get('/api/balance/:id', (req, res) => {
    const u = db.users[req.params.id.trim().toUpperCase()];
    res.json(u ? { found: true, balance: u.balance } : { found: false, balance: 0 });
});

// Админ
app.post('/api/admin/add', (req, res) => {
    if (req.headers['x-key'] !== process.env.ADMIN_KEY) return res.status(403).json({});
    const { steamId, amount } = req.body;
    res.json(addCoins(steamId, parseInt(amount), 'admin'));
});

app.listen(PORT, () => console.log(`\n  Z-Horror → http://localhost:${PORT}\n`));