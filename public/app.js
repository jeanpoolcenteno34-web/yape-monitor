// Estado Global
// Supabase Configuration
const supabaseUrl = 'https://qjekbbfskzyhjtuoepqj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZWtiYmZza3p5aGp0dW9lcHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyOTQ2NjUsImV4cCI6MjA4Nzg3MDY2NX0.1srkJCZJ4ny5G52o76YNPZ2hzbuhgVFVSENNHKlADWE';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Variables de UI
let currentStoreTab = 'All';
let searchText = '';
let selectedIds = new Set(); 
let allNotifications = [];
let selectedDateKey = '';
let salesChart = null;

// Al cargar el documento
document.addEventListener('DOMContentLoaded', () => {
    loadPreferences();
    initSystem();
    initAudioUnlocker();
});

// --- AUTENTICACIÓN ---

// --- FUNCIONES DE AUTH ELIMINADAS ---

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
    
    // Cargar Historial desde Supabase
    await loadHistory();

    // Conectar Realtime de Supabase
    document.getElementById('status-text').innerText = "CONECTADO";
    
    supabase
      .channel('public:notificaciones')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, payload => {
          handleIncomingNotification(payload.new, "Supabase");
      })
      .subscribe();
}

async function loadHistory() {
    try {
        document.getElementById('status-text').innerText = "CARGANDO...";
        const { data, error } = await supabase
            .from('notificaciones')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(100);
            
        if (error) throw error;
        
        allNotifications = (data || []).map(formatNotificationData);
        document.getElementById('status-text').innerText = "CONECTADO";
        renderApp();
    } catch (e) {
        console.error("Error al cargar historial:", e);
        document.getElementById('status-text').innerText = "ERROR DE CONEXIÓN";
    }
}

// Formateador para normalizar los datos que vienen de Supabase (que solo tiene text)
function formatNotificationData(data) {
    let amount = 0;
    let sender_name = "Desconocido";
    let text = data.text || "";

    const amountMatch = text.match(/S\/\.?\s*(\d+(?:[.,]\d+)?)/i);
    if (amountMatch) amount = parseFloat(amountMatch[1].replace(',', '.'));

    const nameMatch = text.match(/^(.+?)\s+te\s+envi[óo]/i);
    if (nameMatch) sender_name = nameMatch[1].trim();

    return {
        ...data,
        amount: amount,
        sender_name: sender_name,
        created_at: data.timestamp // Supabase usa 'timestamp' en lugar de 'created_at' o 'timestamp_phone'
    };
}

function handleIncomingNotification(rawData, source) {
    const data = formatNotificationData(rawData);

    // Normalizar timestamp
    const nk = getDateKey(data.created_at);
    
    // De-duplicación local básica
    const isDup = allNotifications.some(old => old.id === data.id);
    if (isDup) return;

    console.log(`--- [NUEVO] Recibido desde ${source} ---`);
    allNotifications.unshift(data);
    
    if (nk === selectedDateKey) renderNotifications();
    renderApp();
    playNotificationSound();
    triggerNativeNotification(data);
}

// --- UI RENDERING ---

function renderApp() {
    renderDateSelector();
    renderNotifications();
    updateStats();
    updateChart();
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

    // Animación de contadores
    animateValue("t-amount", document.getElementById('t-amount').innerText, `S/ ${dayTotal.toFixed(2)}`, true);
    animateValue("t-count", document.getElementById('t-count').innerText, dayCount, false);
}

function updateChart() {
    const ctx = document.getElementById('salesChart');
    if (!ctx) return;

    // Agrupar por hora
    const hourlyData = new Array(24).fill(0);
    allNotifications.forEach(n => {
        const nDate = getDateKey(n.timestamp_phone || n.created_at);
        if (nDate !== selectedDateKey) return;
        
        const date = new Date(n.timestamp_phone || n.created_at);
        const hour = date.getHours();
        hourlyData[hour] += parseFloat(n.amount) || 0;
    });

    const labels = Array.from({length: 24}, (_, i) => `${i}:00`);
    
    if (salesChart) {
        salesChart.data.datasets[0].data = hourlyData;
        salesChart.update();
    } else {
        const isLight = document.body.classList.contains('light-mode');
        const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00ffca';
        
        salesChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Ventas (S/)',
                    data: hourlyData,
                    borderColor: accentColor,
                    backgroundColor: 'rgba(0, 255, 202, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    pointRadius: 0,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { 
                            color: 'rgba(255,255,255,0.5)', 
                            font: { size: 10 },
                            maxRotation: 0,
                            callback: function(val, index) {
                                return index % 4 === 0 ? this.getLabelForValue(val) : '';
                            }
                        }
                    }
                }
            }
        });
    }
}

function animateValue(id, startText, endValue, isCurrency) {
    const obj = document.getElementById(id);
    if (!obj) return;
    
    // Si no hay cambios o las animaciones están desactivadas, actualizar directo
    const animEnabled = document.getElementById('anim-toggle') ? document.getElementById('anim-toggle').checked : true;
    if (!animEnabled) {
        obj.innerText = endValue;
        return;
    }

    // Extraer valores numéricos
    const startValue = parseFloat(startText.replace(/[^\d.]/g, '')) || 0;
    const finalValue = typeof endValue === 'string' ? parseFloat(endValue.replace(/[^\d.]/g, '')) : endValue;
    
    if (startValue === finalValue) {
        obj.innerText = endValue; // Asegurar formato exacto
        return;
    }

    const duration = 800;
    const startTime = performance.now();

    function step(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOutQuad = t => t * (2 - t);
        const current = startValue + (finalValue - startValue) * easeOutQuad(progress);

        obj.innerText = isCurrency ? `S/ ${current.toFixed(2)}` : Math.floor(current);

        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            obj.innerText = endValue;
        }
    }
    requestAnimationFrame(step);
}

async function patchNotification(id, isMarking) {
    const notif = allNotifications.find(n => n.id === id);
    if (!notif) return;

    const newText = isMarking ? (notif.text + ' [BENITO]') : notif.text.replace(' [BENITO]', '').replace('[BENITO]', '');

    try {
        const { error } = await supabase
            .from('notificaciones')
            .update({ text: newText })
            .eq('id', id);
            
        if (!error) {
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

    const savedSound = localStorage.getItem('yape_sound_url');
    if (savedSound) {
        const audio = document.getElementById('yape-sound');
        const select = document.getElementById('sound-select');
        if (audio) audio.src = savedSound;
        if (select) select.value = savedSound;
    }

    const pushEnabled = localStorage.getItem('yapeos_push_enabled') === 'true';
    if (document.getElementById('push-toggle')) document.getElementById('push-toggle').checked = pushEnabled;
    
    updatePushUI();
}

function updatePushUI() {
    const label = document.getElementById('push-status-label');
    const toggleInput = document.getElementById('push-toggle');
    if (!label) return;

    if (!("Notification" in window)) {
        label.innerText = "No soportado";
        return;
    }

    if (Notification.permission === "granted") {
        label.innerText = "✅ PERMITIDO";
        label.style.color = "var(--accent)";
    } else if (Notification.permission === "denied") {
        label.innerText = "🚫 BLOQUEADO";
        label.style.color = "#ff4757";
    } else {
        label.innerText = "Aún no permitido";
        label.style.color = "var(--text-secondary)";
    }
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('yapeos_theme', isLight ? 'light' : 'dark');
}

async function toggleAndRequestPush() {
    const toggleInput = document.getElementById('push-toggle');
    if (!toggleInput) return;

    if (!("Notification" in window)) return alert("Tu navegador no soporta notificaciones.");

    if (toggleInput.checked) {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
            localStorage.setItem('yapeos_push_enabled', 'true');
        } else {
            toggleInput.checked = false;
            localStorage.setItem('yapeos_push_enabled', 'false');
            alert("Para recibir notificaciones, debes dar permiso en el navegador.");
        }
    } else {
        localStorage.setItem('yapeos_push_enabled', 'false');
    }
    updatePushUI();
}

function changeSound(url) {
    const audio = document.getElementById('yape-sound');
    if (audio) {
        audio.src = url;
        localStorage.setItem('yape_sound_url', url);
        audio.play().catch(() => {}); // Play sample
    }
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
    localStorage.setItem('yapeos_last_tab', tab);
    
    // UI Pestañas
    const tabAll = document.getElementById('tab-all');
    const tabBenito = document.getElementById('tab-benito');
    if (tabAll) tabAll.classList.toggle('active', tab === 'All');
    if (tabBenito) tabBenito.classList.toggle('active', tab === 'Benito');
    
    renderApp();
}

function exportData() {
    console.log("--- [EXPORT] Preparando Cierre Diario PDF ---");
    window.print();
}

function handleSearch() {
    searchText = document.getElementById('search-bar').value.toLowerCase();
    renderNotifications();
}

function showSettings() { document.getElementById('settings-modal').style.display = 'flex'; loadPreferences(); }
function closeSettings() { document.getElementById('settings-modal').style.display = 'none'; }

function playNotificationSound() {
    const audio = document.getElementById('yape-sound');
    if (audio) audio.play().catch(() => {});
}

function triggerNativeNotification(data) {
    const pushEnabled = localStorage.getItem('yapeos_push_enabled') === 'true';
    if (!pushEnabled || Notification.permission !== "granted") return;

    const title = "🔔 Nuevo Yapeo Recibido";
    let amount = data.amount ? `S/ ${parseFloat(data.amount).toFixed(2)}` : "Monto desconocido";
    let sender = data.sender_name || "Remitente desconocido";
    
    // Intento de extracción si falta data explícita (fallback)
    if (!data.amount || !data.sender_name) {
        const m = (data.text || "").match(/S\/ ?(\d+(\.\d+)?)/i);
        if (m) amount = `S/ ${m[1]}`;
    }

    const body = `${sender} te envió ${amount}`;
    
    new Notification(title, { 
        body, 
        icon: 'icon-512.png',
        badge: 'icon-512.png',
        vibrate: [200, 100, 200]
    });
}

function handleSelect(id) {
    if (selectedIds.has(id)) {
        selectedIds.delete(id);
    } else {
        selectedIds.add(id);
    }
    updateSelectionUI();
}

function updateSelectionUI() {
    const banner = document.getElementById('multi-select-banner');
    const countLabel = document.getElementById('select-count');
    
    if (selectedIds.size > 0) {
        banner.style.display = 'flex';
        countLabel.innerText = `${selectedIds.size} seleccionados`;
    } else {
        banner.style.display = 'none';
    }
}

async function markSelectedAsBenito() {
    const idsToProcess = Array.from(selectedIds);
    showToast(`Procesando ${idsToProcess.length} yapeos...`, "info");
    
    for (const id of idsToProcess) {
        await patchNotification(id, true);
    }
    
    selectedIds.clear();
    updateSelectionUI();
    showToast("¡Marcado masivo completado!", "success");
    renderApp();
}

async function unmarkSelectedFromBenito() {
    const idsToProcess = Array.from(selectedIds);
    showToast(`Procesando ${idsToProcess.length} yapeos...`, "info");
    
    for (const id of idsToProcess) {
        await patchNotification(id, false);
    }
    
    selectedIds.clear();
    updateSelectionUI();
    showToast("¡Desmarcado masivo completado!", "success");
    renderApp();
}

function exportData() {
    const dateItem = document.querySelector('.date-item.active');
    const dayName = dateItem.querySelector('.day-name').innerText;
    const dayNum = dateItem.querySelector('.day-num').innerText;
    
    const now = new Date();
    const year = now.getFullYear();
    const monthName = now.toLocaleString('es-PE', { month: 'long' }).toUpperCase();
    
    document.getElementById('print-date').innerText = `REPORTE DEL ${dayName} ${dayNum} DE ${monthName} ${year}`;
    document.getElementById('print-total').innerText = document.getElementById('t-amount').innerText;
    document.getElementById('print-count').innerText = document.getElementById('t-count').innerText;
    
    window.print();
}

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.nextElementSibling;
    if (input.type === 'password') {
        input.type = 'text';
        icon.innerText = '🔒';
    } else {
        input.type = 'password';
        icon.innerText = '👁️';
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerText = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }, 100);
}

// Inicializar al final
initAudioUnlocker();
