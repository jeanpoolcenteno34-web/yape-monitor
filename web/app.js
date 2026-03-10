const S_URL = "https://qjekbbfskzyhjtuoepqj.supabase.co";
const S_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZWtiYmZza3p5aGp0dW9lcHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyOTQ2NjUsImV4cCI6MjA4Nzg3MDY2NX0.1srkJCZJ4ny5G52o76YNPZ2hzbuhgVFVSENNHKlADWE";

let db;
let allNotifications = [];
let selectedDateKey = "";
let dailyTotals = {};

// --- UTILS ---

function formatTime(dateStr) {
    const d = new Date(dateStr);
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 becomes 12
    return `${hours}:${minutes} ${ampm}`;
}

function getDateKey(dateStr) {
    const d = new Date(dateStr);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

function setUIStatus(text, dotClass) {
    const label = document.getElementById('st-label');
    const dot = document.getElementById('st-dot');
    if (label) label.innerText = text;
    if (dot) dot.className = "status-dot " + dotClass;
}

// --- CORE LOGIC ---

async function initSystem() {
    // Clear cache if needed (requested by user)
    if (localStorage.getItem('clear_cache_v2') !== 'done') {
        localStorage.clear();
        localStorage.setItem('clear_cache_v2', 'done');
        console.log("Caché limpiado");
    }

    if (typeof window.supabase === 'undefined') {
        setUIStatus("ERR: SUPABASE", "error");
        return;
    }

    try {
        db = window.supabase.createClient(S_URL, S_KEY);

        // Load History
        const { data, error } = await db.from('notificaciones')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(300);

        if (error) {
            setUIStatus("ERR DB", "error");
            return;
        }

        allNotifications = data || [];
        
        // Initial render
        const todayKey = new Date().toISOString().split('T')[0];
        selectedDateKey = todayKey;
        
        renderApp();

        // Subscribe to New Transitions
        db.channel('monitor').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, payload => {
            const newNotif = payload.new;
            allNotifications.unshift(newNotif);
            
            // Si es del día seleccionado, renderizar inmediatamente
            if (getDateKey(newNotif.timestamp) === selectedDateKey) {
                renderNotifications();
            }
            // Actualizar selector si es un día nuevo
            renderDateSelector();
            updateStats();
            playNotificationSound();
        }).subscribe(st => {
            if (st === 'SUBSCRIBED') setUIStatus("CONECTADO", "online");
        });

    } catch (e) {
        console.error(e);
        setUIStatus("ERR CRIT", "error");
    }
}

function renderApp() {
    updateWelcome();
    renderDateSelector();
    renderNotifications();
    updateStats();
}

function updateWelcome() {
    const dateLabel = document.getElementById('current-date-label');
    if (dateLabel) {
        const options = { weekday: 'long', day: 'numeric', month: 'long' };
        dateLabel.innerText = new Date().toLocaleDateString('es-PE', options);
    }
}

function renderDateSelector() {
    const selector = document.getElementById('date-selector');
    if (!selector) return;

    // Obtener días únicos
    const daysSet = new Set();
    // Asegurarnos que hoy siempre esté
    daysSet.add(new Date().toISOString().split('T')[0]);
    
    allNotifications.forEach(n => {
        daysSet.add(getDateKey(n.timestamp));
    });

    const sortedDays = Array.from(daysSet).sort().reverse();
    
    selector.innerHTML = '';
    sortedDays.forEach(dateStr => {
        const d = new Date(dateStr + "T12:00:00"); // Avoid timezone shift
        const dayName = d.toLocaleDateString('es-PE', { weekday: 'short' }).substring(0, 3).toUpperCase();
        const dayNum = d.getDate();
        
        const item = document.createElement('div');
        item.className = `date-item ${dateStr === selectedDateKey ? 'active' : ''}`;
        item.onclick = () => {
            selectedDateKey = dateStr;
            renderDateSelector();
            renderNotifications();
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

    const filtered = allNotifications.filter(n => getDateKey(n.timestamp) === selectedDateKey);
    
    list.innerHTML = '';
    if (filtered.length === 0) {
        list.innerHTML = '<p style="text-align:center; opacity:0.3; padding:40px 0;">No hay yapes este día</p>';
        return;
    }

    filtered.forEach(n => {
        const item = document.createElement('div');
        item.className = "notification-item";
        
        const timeStr = formatTime(n.timestamp);
        
        item.innerHTML = `
            <div class="notif-body">
                <p>${n.title || 'Yape Recibido'}</p>
                <p>${n.text || ''}</p>
            </div>
            <div class="notif-time">${timeStr}</div>
        `;
        list.appendChild(item);
    });
}

function updateStats() {
    const tAmount = document.getElementById('t-amount');
    const tCount = document.getElementById('t-count');
    
    let dayTotal = 0;
    let monthTotal = 0;
    let monthCount = 0;
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    allNotifications.forEach(n => {
        const d = new Date(n.timestamp);
        let amount = 0;
        const m = (n.text || "").match(/S\/ ?(\d+(\.\d+)?)/);
        if (m) amount = parseFloat(m[1]);

        // Total del día seleccionado (o hoy si preferimos)
        if (getDateKey(n.timestamp) === selectedDateKey) {
            dayTotal += amount;
        }

        // Total del mes
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
            monthTotal += amount;
            monthCount++;
        }
    });

    if (tAmount) tAmount.innerText = `S/ ${dayTotal.toFixed(2)}`;
    if (tCount) tCount.innerText = monthCount; // Mostramos total de ventas del mes
}

function playNotificationSound() {
    const audio = document.getElementById('yape-sound');
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
    }
}

// Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}

// Init
window.addEventListener('load', () => {
    setTimeout(initSystem, 300);
});
