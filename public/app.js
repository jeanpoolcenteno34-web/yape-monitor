// Estado Global
let token = localStorage.getItem('yape_token') || null;
let user = JSON.parse(localStorage.getItem('yape_user')) || null;
let socket = null;

// Variables de UI
let currentStoreTab = 'All';
let searchText = '';
let selectedIds = new Set(); 
let allNotifications = [];
let selectedDateKey = '';

// Al cargar el documento
document.addEventListener('DOMContentLoaded', () => {
    loadPreferences();
    checkAuth();
    initAudioUnlocker();
});

// --- AUTENTICACIÓN ---

function checkAuth() {
    if (token && user) {
        showApp();
    } else {
        showAuth();
    }
}

function showAuth() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app-screen').style.display = 'none';
}

function showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'flex';
    initSystem();
}

function toggleAuth(mode) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    if (mode === 'register') {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    } else {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    }
}

async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (!email || !password) return alert("Por favor, completa todos los campos.");

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (res.ok) {
            token = data.token;
            user = data.user;
            localStorage.setItem('yape_token', token);
            localStorage.setItem('yape_user', JSON.stringify(user));
            showApp();
        } else {
            alert(data.error || "Error al iniciar sesión");
        }
    } catch (e) {
        console.error(e);
        alert("Error de conexión con el servidor.");
    }
}

async function handleRegister() {
    const full_name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const yape_number = document.getElementById('reg-yape').value;

    if (!full_name || !email || !password) {
        return alert("Completa los campos obligatorios (*)");
    }

    if (password.length < 8) {
        return alert("La contraseña debe tener al menos 8 caracteres.");
    }

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, full_name, yape_number })
        });
        const data = await res.json();

        if (res.ok) {
            alert("¡Registro exitoso! Ahora puedes iniciar sesión.");
            toggleAuth('login');
        } else {
            alert(data.error || "Error en el registro");
        }
    } catch (e) {
        console.error(e);
        alert("Error de conexión.");
    }
}

function handleLogout() {
    localStorage.removeItem('yape_token');
    localStorage.removeItem('yape_user');
    window.location.reload();
}

// --- NÚCLEO DEL DASHBOARD ---

async function initSystem() {
    console.log("--- [SISTEMA] Iniciando Monitor Pro ---");
    
    selectedDateKey = localStorage.getItem('yapeos_last_date') || getDateKey();
    currentStoreTab = localStorage.getItem('yapeos_last_tab') || 'All';
    
    // UI Pestañas
    const tabAll = document.getElementById('tab-all');
    const tabBenito = document.getElementById('tab-benito');
    if (tabAll) tabAll.classList.toggle('active', currentStoreTab === 'All');
    if (tabBenito) tabBenito.classList.toggle('active', currentStoreTab === 'Benito');

    renderApp();
    
    // Cargar Historial desde API (Protegida)
    await loadHistory();

    // Conectar Socket.io
    if (typeof io !== 'undefined') {
        socket = io();
        socket.on('connect', () => {
            console.log("[SOCKET] Conectado - Uniendo a sala privada");
            socket.emit('join', user.id);
            document.getElementById('status-text').innerText = "CONECTADO";
        });
        socket.on('disconnect', () => {
            document.getElementById('status-text').innerText = "RECONECTANDO...";
        });
        socket.on('new-yape', (data) => {
            handleIncomingNotification(data, "Socket");
        });
    }
}

async function loadHistory() {
    try {
        const res = await fetch('/api/notifications/history', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401 || res.status === 403) return handleLogout();
        
        const data = await res.json();
        allNotifications = data || [];
        renderApp();
    } catch (e) {
        console.error("Error al cargar historial:", e);
    }
}

function handleIncomingNotification(data, source) {
    // Normalizar timestamp
    const nk = getDateKey(data.timestamp_phone || data.created_at);
    
    // De-duplicación local básica
    const isDup = allNotifications.some(old => old.id === data.id);
    if (isDup) return;

    console.log(`--- [NUEVO] Recibido desde ${source} ---`);
    allNotifications.unshift(data);
    
    if (nk === selectedDateKey) renderNotifications();
    renderApp();
    playNotificationSound();
    triggerNativeNotification(data.title || 'Yape Recibido', data.text || '');
}

// --- UI RENDERING ---

function renderApp() {
    renderDateSelector();
    renderNotifications();
    updateStats();
}

function renderDateSelector() {
    const selector = document.getElementById('date-selector');
    if (!selector) return;

    const dates = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        dates.push(getDateKey(d));
    }
    
    selector.innerHTML = '';
    dates.forEach(dateStr => {
        const [y, m, dNum] = dateStr.split('-');
        const d = new Date(y, m - 1, dNum, 12, 0, 0);
        const dayName = d.toLocaleDateString('es-PE', { weekday: 'short' }).substring(0, 3).toUpperCase();
        
        const item = document.createElement('div');
        item.className = `date-item ${dateStr === selectedDateKey ? 'active' : ''}`;
        item.onclick = () => {
            selectedDateKey = dateStr;
            localStorage.setItem('yapeos_last_date', dateStr);
            renderApp();
        };
        
        item.innerHTML = `<span class="day-name">${dayName}</span><span class="day-num">${d.getDate()}</span>`;
        selector.appendChild(item);
    });
}

function renderNotifications() {
    const list = document.getElementById('notifications-list');
    if (!list) return;

    const filtered = allNotifications.filter(n => {
        const nDate = getDateKey(n.timestamp_phone || n.created_at);
        if (currentStoreTab === 'All' && nDate !== selectedDateKey) return false;
        
        const textLow = (n.text || '').toLowerCase();
        const isBenito = textLow.includes('[benito]');
        if (currentStoreTab === 'Benito' && (!isBenito || nDate !== selectedDateKey)) return false;

        if (searchText) {
            if (!textLow.includes(searchText) && !(n.sender_name || '').toLowerCase().includes(searchText)) return false;
        }
        return true;
    });
    
    list.innerHTML = '';
    if (filtered.length === 0) {
        list.innerHTML = '<p style="text-align:center; opacity:0.3; padding:40px 0;">No hay yapeos que mostrar</p>';
        return;
    }

    filtered.forEach(n => {
        const item = document.createElement('div');
        item.className = "notification-item";
        
        let amount = parseFloat(n.amount) || 0;
        const isLarge = amount >= 50;
        const isBenito = (n.text || '').toLowerCase().includes('[benito]');
        const isChecked = selectedIds.has(n.id);
        const timeStr = formatTime(n.timestamp_phone || n.created_at);
        
        let formattedText = n.text || '';
        formattedText = formattedText.replace(/(S\/\.?\s*\d+(?:[,.]\d+)?)/gi, '<span style="color:#ffffff; font-weight:800; font-size:1.15rem; background:rgba(255,255,255,0.12); padding:2px 6px; border-radius:6px; margin:0 2px;">$1</span>');
        
        const checkboxHTML = `<input type="checkbox" class="notif-checkbox" onchange="handleSelect(${n.id})" ${isChecked ? 'checked' : ''}>`;
        const benitoBadgeHTML = isBenito 
            ? `<div style="text-align:right; margin-top:5px;"><span class="badge" onclick="event.stopPropagation(); patchNotification(${n.id}, false)" style="cursor:pointer; background:rgba(255,255,255,0.1); border:1px solid var(--accent); color:var(--accent);">✅ Benito ✕</span></div>`
            : '';

        item.innerHTML = `
            ${checkboxHTML}
            <div class="notif-body">
                <p style="color:var(--accent); font-weight:800;">${n.title || 'Yape Recibido'}</p>
                <p style="margin-top:4px; line-height:1.5;">${formattedText}</p>
                <div class="badge-row">
                    ${isLarge ? '<span class="badge large">🌟 Gran Venta</span>' : '<span class="badge">✅ Venta</span>'}
                </div>
            </div>
            <div class="notif-time" style="text-align:right;">
                <span>${timeStr}</span>
                ${benitoBadgeHTML}
            </div>
        `;
        list.appendChild(item);
    });
}

function updateStats() {
    let dayTotal = 0;
    let dayCount = 0;

    allNotifications.forEach(n => {
        const nDate = getDateKey(n.timestamp_phone || n.created_at);
        if (nDate !== selectedDateKey) return;
        
        const textLow = (n.text || '').toLowerCase();
        if (currentStoreTab === 'Benito' && !textLow.includes('[benito]')) return;

        dayTotal += parseFloat(n.amount) || 0;
        dayCount++;
    });

    document.getElementById('t-amount').innerText = `S/ ${dayTotal.toFixed(2)}`;
    document.getElementById('t-count').innerText = dayCount;
}

async function patchNotification(id, isMarking) {
    const notif = allNotifications.find(n => n.id === id);
    if (!notif) return;

    const newText = isMarking ? (notif.text + ' [BENITO]') : notif.text.replace(' [BENITO]', '').replace('[BENITO]', '');

    try {
        const res = await fetch(`/api/notifications/${id}`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ text: newText })
        });
        if (res.ok) {
            notif.text = newText;
            renderApp();
        }
    } catch (e) { console.error(e); }
}

// --- PREFERENCIAS & UTILS ---

function loadPreferences() {
    const isLight = localStorage.getItem('yapeos_theme') === 'light';
    if (isLight) document.body.classList.add('light-mode');
    if (document.getElementById('theme-toggle')) document.getElementById('theme-toggle').checked = isLight;
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('yapeos_theme', isLight ? 'light' : 'dark');
}

function getDateKey(dateInput) {
    const d = new Date(dateInput);
    return d.toISOString().split('T')[0];
}

function formatTime(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

function switchStore(tab) {
    currentStoreTab = tab;
    renderApp();
}

function handleSearch() {
    searchText = document.getElementById('search-bar').value.toLowerCase();
    renderNotifications();
}

function showSettings() { document.getElementById('settings-modal').style.display = 'flex'; }
function closeSettings() { document.getElementById('settings-modal').style.display = 'none'; }

function playNotificationSound() {
    const audio = document.getElementById('yape-sound');
    if (audio) audio.play().catch(() => {});
}

function triggerNativeNotification(title, body) {
    if (Notification.permission === "granted") new Notification(title, { body, icon: 'icon-512.png' });
}

function initAudioUnlocker() {
    const unlock = () => {
        const audio = document.getElementById('yape-sound');
        if (audio) { audio.play().then(() => { audio.pause(); audio.currentTime = 0; }); }
        document.removeEventListener('click', unlock);
    };
    document.addEventListener('click', unlock);
}
