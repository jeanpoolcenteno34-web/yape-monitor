const S_URL = "https://qjekbbfskzyhjtuoepqj.supabase.co";
const S_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZWtiYmZza3p5aGp0dW9lcHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyOTQ2NjUsImV4cCI6MjA4Nzg3MDY2NX0.1srkJCZJ4ny5G52o76YNPZ2hzbuhgVFVSENNHKlADWE";

let db;
// State variables for new features
let currentStoreTab = 'All'; // 'All' or 'Benito'
let searchText = '';
let selectedIds = new Set(); 

// Load theme preference early
function loadTheme() {
    const isLight = localStorage.getItem('yapeos_theme') === 'light';
    if (isLight) document.body.classList.add('light-mode');
    
    // Set toggle state if element exists
    const toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.checked = isLight;
}
loadTheme();

function loadSoundStr() {
    const saved = localStorage.getItem('yapeos_sound');
    if(saved) {
        const audio = document.getElementById('yape-sound');
        const select = document.getElementById('sound-select');
        if(audio) audio.src = saved;
        if(select) select.value = saved;
    }
}

// --- THEME & PUSH NOTIFICATIONS ---

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('yapeos_theme', isLight ? 'light' : 'dark');
}

function openSettings() {
    document.getElementById('settings-modal').style.display = 'flex';
    loadTheme();
    loadSoundStr();
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
}

function changeSound() {
    const select = document.getElementById('sound-select');
    const audio = document.getElementById('yape-sound');
    if(select && audio) {
        audio.src = select.value;
        localStorage.setItem('yapeos_sound', select.value);
        audio.play().catch(()=>{}); // Preview
    }
}

async function requestPush() {
    if (!("Notification" in window)) {
        alert("Tu navegador no soporta notificaciones de escritorio.");
        return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
        alert("¡Notificaciones activadas!");
    } else {
        alert("Permiso denegado para notificaciones.");
    }
}

function triggerNativeNotification(title, body) {
    if (("Notification" in window) && Notification.permission === "granted") {
        try {
            new Notification(title, {
                body: body,
                icon: './icon-512.png',
                vibrate: [200, 100, 200]
            });
        } catch(e) { console.error("Native push error", e); }
    }
}

// --- UTILS ---

function formatTime(dateStr) {
    const d = new Date(dateStr);
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
}

function getDateKey(dateStr) {
    const d = dateStr ? new Date(dateStr) : new Date();
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- CORE LOGIC ---

async function initSystem() {
    // Clear cache if needed (V6 for auto-select fix)
    if (localStorage.getItem('clear_cache_v6') !== 'done') {
        localStorage.clear();
        localStorage.setItem('clear_cache_v6', 'done');
        window.location.reload(); 
        return;
    }

    if (typeof window.supabase === 'undefined') return;

    try {
        db = window.supabase.createClient(S_URL, S_KEY);

        const { data, error } = await db.from('notificaciones')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(500);

        if (error) return;

        // Limpiar datos mayores a 7 días (rolling window)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysKey = sevenDaysAgo.toISOString().split('T')[0];

        let loadedData = (data || []).filter(n => getDateKey(n.timestamp) >= sevenDaysKey);
        
        // --- Deduplicar historial inicial (por si en la BD hay duplicados) ---
        allNotifications = [];
        loadedData.forEach(notif => {
            const currentText = (notif.text || '').toLowerCase();
            const isDup = allNotifications.some(old => {
                const diff = Math.abs(new Date(notif.timestamp) - new Date(old.timestamp)) / 1000;
                if (diff > 120) return false;
                return (old.text || '').toLowerCase() === currentText;
            });
            if (!isDup) allNotifications.push(notif);
        });
        
        selectedDateKey = getDateKey(); // Usar la función que ya maneja hora local hoy
        
        renderApp();

        // Tiempo Real (Supabase)
        db.channel('monitor').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, payload => {
            handleIncomingNotification(payload.new, "Supabase");
        }).subscribe();

        // --- SOCKET.IO (MODO AL TOQUE) ---
        if (typeof io !== 'undefined') {
            const socket = io();
            socket.on('new-yape', (data) => {
                handleIncomingNotification(data, "Socket");
            });
        }

    } catch (e) {
        console.error(e);
    }
}

// Función centralizada para procesar y evitar duplicados
function handleIncomingNotification(data, source) {
    const nk = getDateKey(data.timestamp);
    const currentText = (data.text || '').toLowerCase();
    
    // Extraer monto para comparación inteligente si no viene explícito
    let currentAmount = data.amount;
    if (!currentAmount) {
        const m = currentText.match(/s\/\.?\s?(\d+(?:[,.]\d+)?)/i);
        if (m) currentAmount = m[1].replace(',', '.');
    }

    // Revisar duplicados en memoria (mismo monto y texto parecido en los últimos 2 min)
    const isDuplicate = allNotifications.some(old => {
        const diff = (new Date(data.timestamp) - new Date(old.timestamp)) / 1000;
        if (Math.abs(diff) > 120) return false;

        const oldText = (old.text || '').toLowerCase();
        
        // Match por texto exacto
        if (oldText === currentText) return true;
        
        // Match por monto (si ambos tienen monto)
        let oldAmount = old.amount;
        if (!oldAmount) {
            const m = oldText.match(/s\/\.?\s?(\d+(?:[,.]\d+)?)/i);
            if (m) oldAmount = m[1].replace(',', '.');
        }

        if (currentAmount && oldAmount && parseFloat(currentAmount) === parseFloat(oldAmount)) {
            // Si el monto es el mismo y pasó en el mismo minuto, es muy probable que sea el mismo
            return true;
        }

        return false;
    });

    if (isDuplicate) {
        console.log(`--- [DEDUPLICACIÓN] Bloqueado desde ${source} ---`);
        return;
    }

    console.log(`--- [NUEVO] Recibido desde ${source} ---`);
    allNotifications.unshift(data);
    
    if (nk === selectedDateKey) renderNotifications();
    renderDateSelector();
    updateStats();
    playNotificationSound();
    triggerNativeNotification(data.title || 'Yape Recibido', data.text || '');
    cleanOldData();
}

// --- NEW UI ACTIONS ---

function handleSearch() {
    searchText = document.getElementById('search-bar').value.toLowerCase();
    renderNotifications();
}

function switchStore(storeName) {
    currentStoreTab = storeName;
    document.getElementById('tab-all').classList.toggle('active', storeName === 'All');
    document.getElementById('tab-benito').classList.toggle('active', storeName === 'Benito');
    
    // Clear selection when switching tabs
    selectedIds.clear();
    updateBanner();
    
    renderNotifications();
    updateStats();
}

function handleSelect(id) {
    if (selectedIds.has(id)) {
        selectedIds.delete(id);
    } else {
        selectedIds.add(id);
    }
    updateBanner();
}

function updateBanner() {
    const banner = document.getElementById('multi-select-banner');
    const countSpan = document.getElementById('select-count');
    if(selectedIds.size > 0) {
        banner.style.display = 'flex';
        countSpan.innerText = `${selectedIds.size} yapeos seleccionados`;
    } else {
        banner.style.display = 'none';
    }
}

async function markSelectedAsBenito() {
    if(selectedIds.size === 0) return;
    
    // Process all selected
    for(let id of selectedIds) {
        const notif = allNotifications.find(n => n.id === id);
        if(!notif) continue;
        
        // Append [BENITO] to the text field to save it without schema changes
        if(!notif.text.includes('[BENITO]')) {
            const newText = (notif.text || '') + ' [BENITO]';
            try {
                const { error } = await db.from('notificaciones').update({ text: newText }).eq('id', id);
                if(!error) {
                    notif.text = newText;
                }
            } catch(e) { console.error(e); }
        }
    }
    
    selectedIds.clear();
    updateBanner();
    renderNotifications();
    updateStats();
}

function exportData() {
    window.print();
}

function cleanOldData() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysKey = sevenDaysAgo.toISOString().split('T')[0];
    allNotifications = allNotifications.filter(n => getDateKey(n.timestamp) >= sevenDaysKey);
}

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
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        dates.push(`${year}-${month}-${day}`);
    }
    
    selector.innerHTML = '';
    dates.forEach(dateStr => {
        // Parsear para mostrar nombre con hora local a mediodía para evitar errores de zona
        const [y, m, dNum] = dateStr.split('-');
        const d = new Date(y, m - 1, dNum, 12, 0, 0);
        
        const dayName = d.toLocaleDateString('es-PE', { weekday: 'short' }).substring(0, 3).toUpperCase();
        const dayNum = d.getDate();
        
        const item = document.createElement('div');
        item.className = `date-item ${dateStr === selectedDateKey ? 'active' : ''}`;
        item.onclick = () => {
            selectedDateKey = dateStr;
            renderDateSelector();
            renderNotifications();
            updateStats();
        };
        
        item.innerHTML = `
            <span class="day-name">${dayName}</span>
            <span class="day-num">${dayNum}</span>
        `;
        selector.appendChild(item);
    });
}

function renderNotifications() {
    const list = document.getElementById('notifications-list');
    if (!list) return;

    // Filter by Date, Prueba Nube, Search Text, and Active Store Tab
    const filtered = allNotifications.filter(n => {
        // Only filter by Date if we are in 'All' tab
        if (currentStoreTab === 'All' && getDateKey(n.timestamp) !== selectedDateKey) return false;
        
        if (n.title === 'Prueba Nube') return false;
        
        // Strict Error Filtering
        const textLow = (n.text || '').toLowerCase();
        const titleLow = (n.title || '').toLowerCase();
        if (textLow.includes('fallo') || textLow.includes('falló') || textLow.includes('rechazado') || textLow.includes('insuficiente')) return false;
        if (titleLow.includes('fallo') || titleLow.includes('falló') || titleLow.includes('rechazado') || titleLow.includes('insuficiente')) return false;
        
        const isBenito = textLow.includes('[benito]');
        if (currentStoreTab === 'Benito' && !isBenito) return false;
        
        if (searchText) {
            if (!textLow.includes(searchText) && !titleLow.includes(searchText)) return false;
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
        
        // Check amount for "Gran Venta" badge
        let amount = 0;
        const m = (n.text || "").match(/S\/ ?(\d+(\.\d+)?)/i);
        if (m) amount = parseFloat(m[1]);
        
        const isLarge = amount >= 50;
        const isBenito = (n.text || '').toLowerCase().includes('[benito]');
        const isChecked = selectedIds.has(n.id);
        
        // Remove [BENITO] from display text to keep it clean
        const displayText = (n.text || '').replace(' [BENITO]', '');
        
        // Add date to time string in Benito view
        let timeStr = formatTime(n.timestamp);
        if (currentStoreTab === 'Benito') {
            const d = new Date(n.timestamp);
            const dayName = d.toLocaleDateString('es-PE', { weekday: 'short' }).substring(0, 3).toUpperCase();
            timeStr = `<b style="color:var(--text-primary);">${dayName} ${d.getDate()}</b><br>${timeStr}`;
        }

        const actionsHTML = (!isBenito) 
            ? `<input type="checkbox" class="notif-checkbox" onchange="handleSelect(${n.id || `'${n.timestamp}'`})" ${isChecked ? 'checked' : ''}>`
            : `<div style="text-align:right; margin-top:5px;"><span class="badge">✅ Benito</span></div>`;

        item.innerHTML = `
            ${(!isBenito) ? actionsHTML : ''}
            <div class="notif-body" style="flex:1;">
                <p>${n.title || 'Yape Recibido'}</p>
                <p>${displayText}</p>
                <div class="badge-row">
                    ${isLarge ? '<span class="badge large">🌟 Gran Venta</span>' : '<span class="badge">Venta</span>'}
                </div>
            </div>
            <div class="notif-time" style="text-align:right; display:flex; flex-direction:column; justify-content:space-between; min-width:60px;">
                <span>${timeStr}</span>
                ${isBenito ? actionsHTML : ''}
            </div>
        `;
        list.appendChild(item);
    });
}

function updateStats() {
    const tAmount = document.getElementById('t-amount');
    const tCount = document.getElementById('t-count');
    const tLabel = document.getElementById('total-label');
    const cLabel = document.getElementById('count-label');
    
    const isToday = getDateKey(new Date()) === selectedDateKey;
    
    if (currentStoreTab === 'Benito') {
        if (tLabel) tLabel.innerText = "Histórico Benito";
        if (cLabel) cLabel.innerText = "Ventas Benito";
    } else {
        if (tLabel) tLabel.innerText = isToday ? "Total Recibido Hoy" : "Total del Día";
        if (cLabel) cLabel.innerText = isToday ? "Ventas Hoy" : "Ventas del Día";
    }

    let dayTotal = 0;
    let dayCount = 0;

    allNotifications.forEach(n => {
        const isBenito = (n.text || '').toLowerCase().includes('[benito]');
        if (currentStoreTab === 'All' && getDateKey(n.timestamp) !== selectedDateKey) return;
        if (currentStoreTab === 'Benito' && !isBenito) return;
            
        const text = (n.text || "").toLowerCase();
        const title = (n.title || "").toLowerCase();
            
            // Strict check
            const isRecibido = text.includes('recibiste') || title.includes('confirmación') || text.includes('yapeaste');
            const isError = text.includes('fallo') || text.includes('falló') || text.includes('rechazado') || text.includes('insuficiente') || title.includes('fallo') || title.includes('falló') || title.includes('rechazado');

            if (isRecibido && !isError) {
                let amount = 0;
                const m = (n.text || "").match(/S\/ ?(\d+(\.\d+)?)/i);
                if (m) amount = parseFloat(m[1]);
                dayTotal += amount;
                dayCount++;
            }
    });

    animateValue(tAmount, parseFloat(tAmount.innerText.replace('S/ ', '')) || 0, dayTotal, 500, true);
    animateValue(tCount, parseInt(tCount.innerText) || 0, dayCount, 500, false);
}

// Function to animate numbers counting up
function animateValue(obj, start, end, duration, isCurrency) {
    if (!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const current = progress * (end - start) + start;
        
        if (isCurrency) {
            obj.innerText = `S/ ${current.toFixed(2)}`;
        } else {
            obj.innerText = Math.floor(current);
        }
        
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            if (isCurrency) obj.innerText = `S/ ${end.toFixed(2)}`;
            else obj.innerText = end;
        }
    };
    window.requestAnimationFrame(step);
}

function playNotificationSound() {
    const audio = document.getElementById('yape-sound');
    if (audio && audio.play) audio.play().catch(() => {});
}

// Init
window.addEventListener('load', () => {
    loadTheme();
    loadSoundStr();
    setTimeout(initSystem, 300);
});
