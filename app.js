const S_URL = "https://qjekbbfskzyhjtuoepqj.supabase.co";
const S_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZWtiYmZza3p5aGp0dW9lcHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyOTQ2NjUsImV4cCI6MjA4Nzg3MDY2NX0.1srkJCZJ4ny5G52o76YNPZ2hzbuhgVFVSENNHKlADWE";

let db;
// State variables for new features
let currentStoreTab = 'All'; // 'All' or 'Benito'
let searchText = '';
let selectedIds = new Set(); 
let allNotifications = [];
let selectedDateKey = '';

// Load theme preference early
function loadPreferences() {
    const isLight = localStorage.getItem('yapeos_theme') === 'light';
    if (isLight) document.body.classList.add('light-mode');
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) themeToggle.checked = isLight;

    const notifEnabled = localStorage.getItem('yapeos_notif_enabled') !== 'false';
    const notifToggle = document.getElementById('notif-toggle');
    if (notifToggle) notifToggle.checked = notifEnabled;

    const pushEnabled = localStorage.getItem('yapeos_push_enabled') !== 'false';
    const pushToggle = document.getElementById('push-toggle');
    if (pushToggle) pushToggle.checked = pushEnabled;

    const savedSound = localStorage.getItem('yapeos_sound');
    if(savedSound) {
        const audio = document.getElementById('yape-sound');
        const select = document.getElementById('sound-select');
        if(audio) audio.src = savedSound;
        if(select) select.value = savedSound;
    }

    const animEnabled = localStorage.getItem('yapeos_anim_enabled') !== 'false';
    const animToggle = document.getElementById('anim-toggle');
    if (animToggle) animToggle.checked = animEnabled;

    const listAnimsEnabled = localStorage.getItem('yapeos_list_anim_enabled') !== 'false';
    const listAnimToggle = document.getElementById('list-anim-toggle');
    if (listAnimToggle) listAnimToggle.checked = listAnimsEnabled;
    if (!listAnimsEnabled) document.getElementById('notifications-list').classList.add('no-list-animations');
    
    updatePushUI();
}

function updatePushUI() {
    const label = document.getElementById('push-status-label');
    const btn = document.getElementById('btn-request-push');
    const toggleLayer = document.getElementById('push-auth-switch');
    const toggleInput = document.getElementById('push-toggle');
    if (!label) return;

    if (!("Notification" in window)) {
        label.innerText = "No soportado en este dispositivo";
        if (btn) btn.style.display = "none";
        if (toggleLayer) toggleLayer.style.display = "none";
        return;
    }

    if (Notification.permission === "granted") {
        label.innerText = "✅ YA PERMITIDO";
        label.style.color = "var(--accent)";
        if (btn) btn.style.display = "none";
        if (toggleLayer) toggleLayer.style.display = "inline-block";
        
        const pushEnabled = localStorage.getItem('yapeos_push_enabled') !== 'false';
        if (toggleInput) toggleInput.checked = pushEnabled;
        
    } else if (Notification.permission === "denied") {
        label.innerText = "🚫 BLOQUEADO";
        label.style.color = "#ff4d4d";
        if (btn) {
            btn.style.display = "inline-block";
            btn.onclick = () => alert('⚠️ Para activar las notificaciones, haz clic en el ícono de Opciones (tres puntitos o candadito) junto a la dirección web y cambia "Notificaciones" a Permitir.');
        }
        if (toggleLayer) toggleLayer.style.display = "none";
    } else {
        label.innerText = "Aún no permitido";
        label.style.color = "var(--text-secondary)";
        if (btn) btn.style.display = "none";
        if (toggleLayer) toggleLayer.style.display = "inline-block";
        if (toggleInput) toggleInput.checked = false;
    }
}

// --- THEME & PUSH NOTIFICATIONS ---

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('yapeos_theme', isLight ? 'light' : 'dark');
}

function showSettings() {
    document.getElementById('settings-modal').style.display = 'flex';
    loadPreferences();
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
}

function showInstallGuide() {
    document.getElementById('install-modal').style.display = 'flex';
}

function closeInstallGuide() {
    document.getElementById('install-modal').style.display = 'none';
}

function toggleNotifications() {
    const nToggle = document.getElementById('notif-toggle');
    if(nToggle) localStorage.setItem('yapeos_notif_enabled', nToggle.checked);
}


function toggleAnimations() {
    const aToggle = document.getElementById('anim-toggle');
    if(aToggle) localStorage.setItem('yapeos_anim_enabled', aToggle.checked);
}

function toggleListAnimations() {
    const lToggle = document.getElementById('list-anim-toggle');
    if(lToggle) {
        localStorage.setItem('yapeos_list_anim_enabled', lToggle.checked);
        const list = document.getElementById('notifications-list');
        if (list) {
            if (lToggle.checked) list.classList.remove('no-list-animations');
            else list.classList.add('no-list-animations');
        }
    }
}



async function toggleAndRequestPush() {
    const toggleInput = document.getElementById('push-toggle');
    if (!toggleInput) return;
    const isChecked = toggleInput.checked;
    
    if (!("Notification" in window)) return;

    if (Notification.permission === "default" && isChecked) {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
            // Optional: alert success
            localStorage.setItem('yapeos_push_enabled', 'true');
        } else {
            toggleInput.checked = false;
        }
    } else if (Notification.permission === "granted") {
        localStorage.setItem('yapeos_push_enabled', isChecked);
    } else {
        toggleInput.checked = false;
    }
    updatePushUI();
}

function triggerNativeNotification(title, body) {
    const enabled = localStorage.getItem('yapeos_push_enabled') !== 'false';
    if (!enabled) return;

    if (!("Notification" in window)) return;
    
    if (Notification.permission === "granted") {
        try {
            new Notification(title, {
                body: body,
                icon: './icon-512.png',
                vibrate: [200, 100, 200],
                badge: './icon-512.png'
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

    console.log("--- [SISTEMA] Iniciando Monitor ---");
    
    // Cargar persistencia de pestaña y fecha
    selectedDateKey = localStorage.getItem('yapeos_last_date') || getDateKey();
    currentStoreTab = localStorage.getItem('yapeos_last_tab') || 'All';
    console.log("[SISTEMA] Render inicial con fecha:", selectedDateKey, "y pestaña:", currentStoreTab);
    
    // Sincronizar UI de pestañas
    const tabAll = document.getElementById('tab-all');
    const tabBenito = document.getElementById('tab-benito');
    if (tabAll) tabAll.classList.toggle('active', currentStoreTab === 'All');
    if (tabBenito) tabBenito.classList.toggle('active', currentStoreTab === 'Benito');

    renderApp();

    if (typeof window.supabase === 'undefined') {
        console.error("CRÍTICO: Supabase v2 no está cargado en el navegador.");
        document.getElementById('status-text').innerText = "ERROR CARGA";
        return;
    }

    try {
        db = window.supabase.createClient(S_URL, S_KEY);

        const { data, error } = await db.from('notificaciones')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(500);

        if (error) {
            console.error("Error Supabase:", error);
            return;
        }

        console.log(`--- [DATOS] ${data?.length || 0} registros recibidos ---`);

        // Limpiar datos mayores a 7 días (rolling window)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysKey = sevenDaysAgo.toISOString().split('T')[0];

        let loadedData = (data || []).filter(n => getDateKey(n.timestamp) >= sevenDaysKey);
        
        // --- Deduplicar historial inicial ---
        let finalHistory = [];
        loadedData.forEach(notif => {
            const currentText = (notif.text || '').toLowerCase();
            const isDup = finalHistory.some(old => {
                const diff = Math.abs(new Date(notif.timestamp) - new Date(old.timestamp)) / 1000;
                if (diff > 120) return false;
                return (old.text || '').toLowerCase() === currentText;
            });
            if (!isDup) finalHistory.push(notif);
        });
        
        // --- Deduplicar historial inicial (por si en la BD hay duplicados) ---
        allNotifications = finalHistory;
        
        // Renderizar con datos frescos
        renderApp();

        // Tiempo Real (Supabase)
        db.channel('monitor').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, payload => {
            handleIncomingNotification(payload.new, "Supabase");
        }).subscribe();

        // --- SOCKET.IO (MODO AL TOQUE) ---
        if (typeof io !== 'undefined') {
            const socket = io();
            socket.on('connect', () => {
                console.log("[SOCKET] Conectado - Recibiendo al toque");
                document.getElementById('status-text').innerText = "CONECTADO";
            });
            socket.on('disconnect', () => {
                console.warn("[SOCKET] Desconectado - Reconectando...");
                document.getElementById('status-text').innerText = "RECONECTANDO...";
            });
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

    // Revisar duplicados en memoria (mismo monto y texto parecido en los últimos 10 min)
    const isDuplicate = allNotifications.some(old => {
        const diff = (new Date(data.timestamp) - new Date(old.timestamp)) / 1000;
        if (Math.abs(diff) > 600) return false;

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
            // Comparación de nombres para evitar duplicados entre Email y App
            const cleanName = (str) => (str || '').toLowerCase().replace(/[^a-z]/g, '');
            const currentName = cleanName(data.sender || data.title || '');
            const oldName = cleanName(old.sender || old.title || '');
            
            if (currentName && oldName && (currentName.includes(oldName) || oldName.includes(currentName))) {
                return true;
            }

            // Si es muy reciente (< 3 min), confiamos en el monto
            if (Math.abs(diff) < 180) return true;
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
    localStorage.setItem('yapeos_last_tab', storeName);
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
    const markBtn = document.querySelector('.btn-mark-store');
    
    if(selectedIds.size > 0) {
        banner.style.display = 'flex';
        countSpan.innerText = `${selectedIds.size} yapeos seleccionados`;
        
        // Bug Fix: Check if all items are already marked
        let allBenito = true;
        for(let id of selectedIds) {
            const notif = allNotifications.find(n => n.id === id);
            if(!notif || !notif.text.includes('[BENITO]')) {
                allBenito = false;
                break;
            }
        }
        if(markBtn) {
            markBtn.disabled = allBenito;
            markBtn.style.opacity = allBenito ? '0.3' : '1';
            markBtn.style.cursor = allBenito ? 'not-allowed' : 'pointer';
        }
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

async function unmarkSelectedFromBenito() {
    if(selectedIds.size === 0) return;
    
    for(let id of selectedIds) {
        await unmarkFromTiendaBenito(id, false);
    }
    
    selectedIds.clear();
    updateBanner();
    renderNotifications();
    updateStats();
}

async function unmarkFromTiendaBenito(id, shouldRefresh = true) {
    if(!id) return;
    const notif = allNotifications.find(n => n.id === id);
    if(!notif) return;
    
    if(notif.text.includes('[BENITO]')) {
        const newText = notif.text.replace(' [BENITO]', '').replace('[BENITO]', '');
        try {
            const { error } = await db.from('notificaciones').update({ text: newText }).eq('id', id);
            if(!error) {
                notif.text = newText;
                if(shouldRefresh) {
                    renderNotifications();
                    updateStats();
                }
            }
        } catch(e) { console.error(e); }
    }
}

function exportData() {
    const isBenito = currentStoreTab === 'Benito';
    const storeLabel = isBenito ? 'TIENDA BENITO' : 'TODOS LOS PAGOS';
    
    if(!confirm(`¿Deseas descargar el reporte de Cierre Diario (${storeLabel})?`)) return;

    // Populate Print Header
    const printDate = document.getElementById('print-date');
    const printTotal = document.getElementById('print-total');
    const printCount = document.getElementById('print-count');
    
    if(printDate) {
        const d = new Date();
        printDate.innerText = d.toLocaleDateString('es-PE', { day:'2-digit', month:'long', year:'numeric' }) + ' - ' + d.toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' });
    }
    if(printTotal) printTotal.innerText = document.getElementById('t-amount').innerText;
    if(printCount) printCount.innerText = document.getElementById('t-count').innerText;

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
            localStorage.setItem('yapeos_last_date', dateStr);
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
        
        // Filter out fake Yape notifications (e.g., S/ 0.01) and surveys
        let amount = 0;
        const m = (n.text || "").match(/S\/ ?(\d+(\.\d+)?)/i);
        if (m) amount = parseFloat(m[1]);
        
        const isMicro = amount > 0 && amount < 0.10;
        const isSurvey = textLow.includes('encuesta') || textLow.includes('participa por un') || textLow.includes('prueba');
        const isFakeLink = textLow.includes('app.yape.com.pe') || textLow.includes('email_home_yape');
        const isYapero = textLow.includes('de yapero'); // Fake S/ 7 de yapero
        
        if (isMicro || isSurvey || isFakeLink || isYapero) return false;

        const isBenito = textLow.includes('[benito]');
        // Benito tab must ALSO respect the selected date
        if (currentStoreTab === 'Benito' && (!isBenito || getDateKey(n.timestamp) !== selectedDateKey)) return false;

        // Additional local filtering for Desconocido and own transfers
        if (textLow.includes('yapeaste') || textLow.includes('enviaste') || textLow.includes('cuenta de ahorro') || 
            (n.sender && n.sender.toLowerCase().includes('desconocido'))) return false;
        
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
        
        const timeStr = formatTime(n.timestamp);
        
        // Extract and style parts of the text (name, amount, security code)
        let formattedText = n.text || '';
        
        // 1. Amount styling (Must be done first to avoid breaking other tags if they overlap)
        formattedText = formattedText.replace(/(S\/\.?\s*\d+(?:[,.]\d+)?)/gi, '<span style="color:#ffffff; font-weight:800; font-size:1.15rem; background:rgba(255,255,255,0.12); padding:2px 6px; border-radius:6px; margin:0 2px;">$1</span>');
        
        // 2. Name styling (Soportando puntos como en 'S.', guiones y caracteres latinos)
        formattedText = formattedText.replace(/(de\s+)([a-zA-ZÑÁÉÍÓÚáéíóú\s.*-]+)(?=$|<)/gi, '$1<span style="color:#00e5ff; font-weight:800; font-size:1.05rem;">$2</span>');
        formattedText = formattedText.replace(/(Yape\s?\()([^)]+)(\))/gi, '$1<span style="color:#00e5ff; font-weight:800; font-size:1.05rem;">$2</span>$3');
        formattedText = formattedText.replace(/(Yape!\s*)([a-zA-ZÑÁÉÍÓÚáéíóú\s.*-]+)(\s+te envi[oó])/gi, '$1<span style="color:#00e5ff; font-weight:800; font-size:1.05rem;">$2</span>$3');
        formattedText = formattedText.replace(/^([a-zA-ZÑÁÉÍÓÚáéíóú\s.*-]+)(\s+te envi[oó])/gi, '<span style="color:#00e5ff; font-weight:800; font-size:1.05rem;">$1</span>$2');
        
        // 3. Extract and inline style security code (3 to 6 digits)
        formattedText = formattedText.replace(/(el\s+)?(c[oó]d\.?\s?de\s?seguridad es:?|c[oó]digo:?)\s*(\d{3,6})/gi, 
            '$1<span style="color:#00e5ff; font-weight:600;">$2</span> <span style="color:#ffffff; font-weight:800; font-family:monospace; font-size:1.1rem; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; margin-left:2px;">$3</span>'
        );
        
        // Fix trailing dots
        formattedText = formattedText.replace(/\.\s*$/, '');

        const checkboxHTML = `<input type="checkbox" class="notif-checkbox" onchange="handleSelect(${n.id || `'${n.timestamp}'`})" ${isChecked ? 'checked' : ''}>`;
        
        const benitoBadgeHTML = isBenito 
            ? `<div style="text-align:right; margin-top:5px;"><span class="badge" onclick="event.stopPropagation(); unmarkFromTiendaBenito(${n.id || `'${n.timestamp}'`})" style="cursor:pointer; background:rgba(255,255,255,0.1); border:1px solid var(--accent); color:var(--accent);">✅ Benito ✕</span></div>`
            : '';

        // Determine Title color
        const isConfirmacion = (n.title || '').toLowerCase().includes('confirmación');
        const titleStyle = isConfirmacion ? 'color:var(--accent); font-weight:800;' : '';

        item.innerHTML = `
            ${checkboxHTML}
            <div class="notif-body" style="flex:1;">
                <p style="${titleStyle}">${n.title || 'Yape Recibido'}</p>
                <p style="margin-top:4px; line-height:1.5;">${formattedText}</p>
                <div class="badge-row">
                    ${isLarge ? '<span class="badge large">🌟 Gran Venta</span>' : '<span class="badge" style="background:var(--accent); color:var(--bg-dark);">✅ Venta</span>'}
                </div>
            </div>
            <div class="notif-time" style="text-align:right; display:flex; flex-direction:column; justify-content:space-between; min-width:60px;">
                <span>${timeStr}</span>
                ${benitoBadgeHTML}
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
        
        // AMBOS deben respetar la fecha seleccionada ahora para ventas del día
        if (getDateKey(n.timestamp) !== selectedDateKey) return;
        
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
const activeAnimations = new Map();

function animateValue(obj, start, end, duration, isCurrency) {
    if (!obj) return;
    
    // Check if animations are enabled
    const animEnabled = localStorage.getItem('yapeos_anim_enabled') !== 'false';
    if (!animEnabled) {
        if (isCurrency) obj.innerText = `S/ ${end.toFixed(2)}`;
        else obj.innerText = end;
        return;
    }

    // Cancel previous animation if exists for this specific object
    if (activeAnimations.has(obj)) {
        cancelAnimationFrame(activeAnimations.get(obj));
    }

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
            const animId = window.requestAnimationFrame(step);
            activeAnimations.set(obj, animId);
        } else {
            if (isCurrency) obj.innerText = `S/ ${end.toFixed(2)}`;
            else obj.innerText = end;
            activeAnimations.delete(obj);
        }
    };
    const animId = window.requestAnimationFrame(step);
    activeAnimations.set(obj, animId);
}

// --- AUDIO UNLOCKER FOR MOBILE ---
function initAudioUnlocker() {
    console.log("[AUDIO] Iniciando desbloqueador de audio...");
    const unlock = () => {
        const audio = document.getElementById('yape-sound');
        if (audio) {
            audio.play().then(() => {
                audio.pause();
                audio.currentTime = 0;
                console.log("[AUDIO] Desbloqueado con éxito");
            }).catch(e => console.log("[AUDIO] Esperando interacción..."));
        }
        document.removeEventListener('click', unlock);
        document.removeEventListener('touchstart', unlock);
    };
    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
}

function playNotificationSound(force = false) {
    const enabled = localStorage.getItem('yapeos_notif_enabled') !== 'false';
    if (!enabled && !force) return;

    const audio = document.getElementById('yape-sound');
    if (!audio) return;
    
    // Ensure volume is up
    audio.volume = 1.0;

    // Reset and Load
    audio.pause();
    if (!audio.src) {
        const select = document.getElementById('sound-select');
        if (select) audio.src = select.value;
    }
    
    audio.currentTime = 0;
    
    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            console.log("Audio started successfully");
        }).catch(error => {
            console.error("Audio playback error:", error);
            if (force) {
                alert("El navegador bloqueó el sonido. Por favor, asegúrate de haber interactuado con la página o revisa el volumen de tu dispositivo.");
            }
        });
    }
}

// --- SYSTEM INITIALIZATION ---

// Sync when coming back to app
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        console.log("[SYNC] App visible, refrescando datos...");
        initSystem();
    }
});

// Background Sync cada 5 segundos (Super Velocidad)
setInterval(() => {
    if (document.visibilityState === 'visible' && db) {
        initSystem();
    }
}, 5000);

// Init
window.addEventListener('load', () => {
    loadPreferences();
    initAudioUnlocker();
    setTimeout(initSystem, 300);
});
