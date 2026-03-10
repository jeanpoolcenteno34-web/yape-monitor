const S_URL = "https://qjekbbfskzyhjtuoepqj.supabase.co";
const S_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZWtiYmZza3p5aGp0dW9lcHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyOTQ2NjUsImV4cCI6MjA4Nzg3MDY2NX0.1srkJCZJ4ny5G52o76YNPZ2hzbuhgVFVSENNHKlADWE";

let db;
let t_val = 0;
let c_val = 0;

function setUI(text, dotClass) {
    const label = document.getElementById('st-label');
    const dot = document.getElementById('st-dot');
    if (label) label.innerText = text;
    if (dot) dot.className = "status-dot " + dotClass;
}

async function initSystem() {
    if (typeof window.supabase === 'undefined') {
        setUI("ERROR: BLOQUEO", "error");
        const btn = document.getElementById('btn-start');
        if (btn) btn.style.display = 'inline-block';
        return;
    }

    try {
        const btn = document.getElementById('btn-start');
        if (btn) btn.style.display = 'none';

        db = window.supabase.createClient(S_URL, S_KEY);

        // Cargar Historial (Aumentado a 200 para el archivo)
        const { data, error } = await db.from('notificaciones')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(200);

        if (error) {
            setUI("ERROR DB", "error");
            if (btn) btn.style.display = 'inline-block';
            return;
        }

        const viewTitle = document.getElementById('view-title');
        if (viewTitle) viewTitle.innerText = "VENTAS";

        const list = document.getElementById('notifications-list');
        if (list) {
            list.innerHTML = '';
            t_val = 0; c_val = 0; // Reset para recalcular de historia
            [...data].reverse().forEach(n => addNotif(n, false));

            if (data.length === 0) {
                list.innerHTML = '<p style="text-align:center; color:rgba(255,255,255,0.3); padding:40px 0;">¡Listo! Esperando tu primer Yape...</p>';
            }
        }

        // Tiempo Real con reconexión automática
        db.channel('monitor').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, payload => {
            addNotif(payload.new, true);
        }).subscribe(st => {
            if (st === 'SUBSCRIBED') setUI("CONECTADO", "online");
        });

    } catch (e) {
        setUI("ERROR CRÍTICO", "error");
        const btn = document.getElementById('btn-start');
        if (btn) btn.style.display = 'inline-block';
    }
}

function formatDateHeader(dateStr) {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return "Hoy";
    if (d.toDateString() === yesterday.toDateString()) return "Ayer";

    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
}

const dailyBalances = {};

function addNotif(n, s) {
    const list = document.getElementById('notifications-list');
    if (!list) return;

    if (list.querySelector('p')) list.innerHTML = '';

    const dateKey = new Date(n.timestamp).toLocaleDateString('es-PE');
    const dateLabel = formatDateHeader(n.timestamp);

    // Buscar o crear la columna del día
    let dayCol = document.getElementById(`day-${dateKey.replace(/\//g, '-')}`);
    if (!dayCol) {
        dayCol = document.createElement('div');
        dayCol.className = "day-column";
        dayCol.id = `day-${dateKey.replace(/\//g, '-')}`;

        const dateObj = new Date(n.timestamp);
        const dayName = dateObj.toLocaleDateString('es-PE', { weekday: 'short' }).replace('.', '').toUpperCase();
        const dayNum = dateObj.getDate();
        const isToday = new Date().toLocaleDateString('es-PE') === dateKey;

        dayCol.innerHTML = `
            <div class="day-header ${isToday ? 'active' : ''}">
                <div class="day-name">${dayName}</div>
                <div class="day-number">${dayNum}</div>
                <div class="day-balance" id="balance-${dayCol.id}">S/ 0.00</div>
            </div>
            <div class="day-items" id="items-${dayCol.id}"></div>
        `;

        if (s) list.prepend(dayCol);
        else list.appendChild(dayCol);

        dailyBalances[dateKey] = 0;
    }

    const itemsContainer = document.getElementById(`items-${dayCol.id}`);
    const balanceEl = document.getElementById(`balance-${dayCol.id}`);

    // Extraer monto y actualizar balance diario
    let amount = 0;
    if (n.text) {
        const m = n.text.match(/S\/ ?(\d+(\.\d+)?)/);
        if (m) {
            amount = parseFloat(m[1]);
            dailyBalances[dateKey] = (dailyBalances[dateKey] || 0) + amount;
            if (balanceEl) balanceEl.innerText = "S/ " + dailyBalances[dateKey].toFixed(2);
        }
    }

    // Actualizar contadores globales (opcional, pero los mantenemos)
    c_val++;
    const tCount = document.getElementById('t-count');
    const tAmount = document.getElementById('t-amount');
    if (tCount) tCount.innerText = c_val;
    if (amount > 0) {
        t_val += amount;
        if (tAmount) tAmount.innerText = "S/ " + t_val.toFixed(2);
    }

    // Crear el item de notificación
    const div = document.createElement('div');
    div.className = "notification-item";
    const time = new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `<div class="notif-body">
        <p style='color:#00ffca; font-weight:700; font-size:0.95rem;'>${n.title || 'Yape Recibido'}</p>
        <p style='font-size:0.85rem; opacity:0.75; line-height:1.3;'>${n.text}</p>
    </div>
    <div class="notif-time">${time}</div>`;

    if (s) itemsContainer.prepend(div);
    else itemsContainer.appendChild(div);

    if (s) {
        const audio = document.getElementById('yape-sound');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => { });
        }
    }
}

// Registro del Service Worker para PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(reg => {
            console.log('SW registrado', reg);
        }).catch(err => {
            console.error('SW fallo', err);
        });
    });
}

// AUTO-INICIO AL CARGAR
window.addEventListener('load', () => {
    setTimeout(initSystem, 300);
});
