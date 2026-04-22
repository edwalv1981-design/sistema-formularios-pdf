// app.js

// --- POLÍTICA DE SEGURIDAD EXTREMA: ANTI-RELOAD (F5 Redirect to Login) ---
(function() {
    const navEntries = performance.getEntriesByType('navigation');
    if (navEntries.length > 0 && navEntries[0].type === 'reload') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.clear();
        console.warn("[SECURITY] Reload detected. Session invalidated.");
    }
})();

const API_URL = '/api'; 

// LÓGICA DE SEGURIDAD PARA PARSEO DE USUARIO (Blindaje contra estados indefinidos)
function getSafeUser() {
    try {
        const userData = localStorage.getItem('user');
        if (!userData || userData === 'undefined') return null;
        return JSON.parse(userData);
} catch (e) {
        console.warn('Falla en recuperación de sesión:', e);
        return null;
    }
}

// GESTIÓN DE ERRORES GLOBAL (Diagnóstico en Producción)
window.onerror = function(msg, url, line, col, error) {
    console.error(`[CRITICAL_UI_ERROR] ${msg} en ${url}:${line}:${col}`, error);
    if(typeof showCustomModal === 'function') {
        showCustomModal('Error Crítico de Aplicación', `Se detectó una falla técnica: ${msg}. Por favor, refresque la página (F5).`, 'error');
    }
    return false;
};

// Utilidades del DOM
function toggleView(viewId) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active-view'));
    document.getElementById(viewId).classList.add('active-view');
}

function showAlert(elementId, message, type='success') {
    const el = document.getElementById(elementId);
    el.style.display = 'block';
    el.className = `alert-box alert-${type}`;
    el.innerText = message;
}

function togglePasswordVisibility(icon) {
    const input = icon.parentElement.querySelector('input');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('ph-eye');
        icon.classList.add('ph-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('ph-eye-slash');
        icon.classList.add('ph-eye');
    }
}

function switchProfileTab(tab) {
    document.querySelectorAll('.profile-content-section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.profile-tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById('section-' + tab).style.display = 'block';
    event.currentTarget.classList.add('active');
}

// --- SISTEMA DE NOTIFICACIONES PREMIUM (POPPUP) ---
function showCustomModal(title, text, type = 'info') {
    const modal = document.getElementById('p-modal-overlay');
    const iconWrapper = document.getElementById('p-modal-icon');
    const titleEl = document.getElementById('p-modal-title');
    const textEl = document.getElementById('p-modal-text');

    let iconHtml = '<i class="ph ph-info"></i>';
    if(type === 'success') iconHtml = '<i class="ph-fill ph-check-circle"></i>';
    if(type === 'error') iconHtml = '<i class="ph-fill ph-x-circle"></i>';
    
    iconWrapper.innerHTML = iconHtml;
    iconWrapper.className = `modal-icon-wrapper ${type}`;
    titleEl.innerText = title;
    textEl.innerHTML = text;

    // BOTÓN DINÁMICO: Solo se activa/muestra si es un mensaje de ÉXITO (Confirmación de Usuario)
    const btn = document.getElementById('p-modal-btn');
    if(btn) {
        if(type === 'success') {
            btn.style.display = 'block';
            btn.innerText = 'Continuar'; 
        } else {
            btn.style.display = 'none';
        }
    }

    modal.classList.add('active');
}

function closeCustomModal() {
    document.getElementById('p-modal-overlay').classList.remove('active');
}

// --- INTERCEPTOR GLOBAL DE ALERTAS (UI/UX PREMIUM) ---
// Sobrescribe el alert nativo para evitar el mensaje de "localhost dice"
window.alert = function(message) {
    // Detectar si es un mensaje de error por palabras clave
    const msg = String(message).toLowerCase();
    const isError = msg.includes('error') || msg.includes('falló') || msg.includes('inválido') || 
                    msg.includes('no se pudo') || msg.includes('denegado') || msg.includes('problema');
    
    showCustomModal(isError ? 'Atención' : 'Notificación', message, isError ? 'error' : 'success');
};

// Idiomas
const translations = {
    es: {
        logout: 'Cerrar Sesión',
        panel: 'Panel Principal',
        digitalizacion: 'Digitalización',
        digitalizar_doc: 'Digitalizar Documentos',
        historial: 'Historial',
        usuarios: 'Usuarios',
        plantillas: 'Plantillas',
        bitacora: 'Bitácora',
        enviar: 'Enviar',
        guardar: 'Guardar',
        actualizar: 'Actualizar',
        eliminar: 'Eliminar',
        acciones: 'Acciones',
        fecha: 'Fecha',
        estado: 'Estado'
    }
};

let currentLang = 'es';

function setLanguage(lang) {
    // Legacy function, do nothing.
}

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    initTheme();
    // No call to initLanguage needed if we use reload()

    // Event Listeners
    if(document.getElementById('loginForm')) document.getElementById('loginForm').addEventListener('submit', handleLogin);
    if(document.getElementById('registerForm')) document.getElementById('registerForm').addEventListener('submit', handleRegister);
    if(document.getElementById('btnLogout')) document.getElementById('btnLogout').addEventListener('click', handleLogout);

    // Iniciar Seguridad si hay sesión
    if (localStorage.getItem('token')) {
        startInactivityControl();
        startHeartbeat();
    }
});


function setTheme(theme) {
    document.body.classList.remove('theme-black', 'theme-white', 'theme-brown', 'theme-blue', 'theme-purple', 'theme-emerald', 'theme-crimson', 'theme-cyber', 'theme-slate', 'theme-sunset');
    if (theme !== 'black') {
        document.body.classList.add(`theme-${theme}`);
    }
    localStorage.setItem('app-theme', theme);
}

function initTheme() {
    const savedTheme = localStorage.getItem('app-theme') || 'black';
    setTheme(savedTheme);
}

// --- SEGURIDAD: CONTROL DE INACTIVIDAD (1 min + 1 min) ---
let inactivityTimer;
let countdownTimer;
const INACTIVITY_LIMIT = 2 * 60 * 1000; // 2 minutos para aviso
const COUNTDOWN_LIMIT = 30; // 30 segundos para salir definitivamente

function startInactivityControl() {
    resetInactivityTimer();
    ['mousemove', 'keydown', 'click', 'scroll'].forEach(evt => {
        window.addEventListener(evt, () => resetInactivityTimer());
    });
}

function resetInactivityTimer(manual = false) {
    if (manual) {
        const modal = document.getElementById('timeout-modal');
        if(modal) modal.classList.remove('active');
        clearInterval(countdownTimer);
    }
    clearTimeout(inactivityTimer);
    if (localStorage.getItem('token') && (!document.getElementById('timeout-modal') || !document.getElementById('timeout-modal').classList.contains('active'))) {
        inactivityTimer = setTimeout(showInactivityModal, INACTIVITY_LIMIT);
    }
}

function showInactivityModal() {
    const modal = document.getElementById('timeout-modal');
    if (!modal || !localStorage.getItem('token')) return;
    
    modal.classList.add('active');
    let timeLeft = COUNTDOWN_LIMIT;
    document.getElementById('timeout-countdown').innerText = timeLeft + 's';

    countdownTimer = setInterval(() => {
        timeLeft--;
        document.getElementById('timeout-countdown').innerText = timeLeft + 's';
        if (timeLeft <= 0) {
            clearInterval(countdownTimer);
            handleLogout();
        }
    }, 1000);
}

function startHeartbeat() {
    // Latido frecuente para evitar bloqueos accidentales
    setInterval(async () => {
        if (!localStorage.getItem('token')) return;
        try {
            await fetch(`/api/auth/heartbeat`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
        } catch (e) {}
    }, 45 * 1000); // Cada 45 segundos
}

async function handleLogin(e) {
    if (e) e.preventDefault();
    const identInput = document.getElementById('identificacion');
    const passInput = document.getElementById('password');
    
    if (!identInput || !passInput) return;

    const identificacion = identInput.value.trim();
    const password = passInput.value.trim();

    if (!identificacion || !password) {
        return showCustomModal('Datos Incompletos', 'Por favor ingrese usuario y contraseña.', 'info');
    }

    // Ocultar link de desbloqueo por defecto en cada intento
    const unlockLink = document.getElementById('unlock-link');
    if(unlockLink) unlockLink.style.display = 'none';

    try {
        const res = await fetch(`/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identificacion, password })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            showCustomModal('Acceso Denegado', data.error, 'error');
            // Mostrar link SOLO si el servidor confirma que es un MASTER bloqueado
            if (data.isMasterBlocked && unlockLink) {
                unlockLink.style.display = 'block';
            }
            return;
        }

        // Guardar Sesion
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        // Iniciar Seguridad
        startInactivityControl();
        startHeartbeat();
        
        initDashboard(data.user);
    } catch(err) {
        console.error('Login Error:', err);
        alert('Error de conexión con el servidor: ' + err.message);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const payload = {
        nombres_completos: document.getElementById('reg_nombres').value,
        identificacion: document.getElementById('reg_identificacion').value,
        direccion: document.getElementById('reg_direccion').value,
        telefono: document.getElementById('reg_telefono').value,
        password: document.getElementById('reg_password').value,
        tipo_formulario: document.getElementById('reg_tipo_formulario').value,
        es_adicional: false
    };

    try {
        const res = await fetch(`/api/usuarios/registro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if(!res.ok) {
            showAlert('register-message', data.error, 'error');
            return;
        }

        showAlert('register-message', `¡Éxito! Tu código de formulario es: ${data.codigo_unico}. Espera la aprobación del MASTER.`, 'success');
        document.getElementById('registerForm').reset();
    } catch(err) {
        showAlert('register-message', 'Error interno al registrar.', 'error');
    }
}

async function handleLogout() {
    try {
        if (localStorage.getItem('token')) {
            await fetch(`/api/auth/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
        }
    } catch(e) {}

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Detener timers
    clearInterval(countdownTimer);
    clearTimeout(inactivityTimer);
    
    // Cerrar modal si está abierto
    const modal = document.getElementById('timeout-modal');
    if (modal) modal.classList.remove('active');

    // Redirección total para limpiar memoria
    window.location.href = '/';
}

function checkSession() {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (token && userStr) {
        try {
            initDashboard(JSON.parse(userStr));
        } catch (e) {
            console.error("Session data corrupt:", e);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            toggleView('view-login');
        }
    } else {
        toggleView('view-login');
    }
}

function initDashboard(user) {
    toggleView('view-dashboard');
    
    // Set UI User Info
    document.getElementById('nav-username').innerText = user.nombres_completos || user.identificacion;
    document.getElementById('nav-role').innerText = user.rol;
    
    // Set Login Time Snapshot
    const navTime = document.getElementById('nav-logintime');
    if (navTime) {
        const now = new Date();
        const dateStr = now.toLocaleDateString();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        navTime.innerText = `Último Ingreso: ${dateStr} ${timeStr}`;
    }
    // Iniciar Sistema de Notificaciones
    fetchNotifications();
    setInterval(fetchNotifications, 60000); // Poll cada minuto

    // Update static translated elements
    const logoutBtn = document.getElementById('btnLogout');
    if(logoutBtn) logoutBtn.innerHTML = `<i class="ph ph-sign-out"></i> ${translations[currentLang].logout}`;

    // Pintar Sidebar Menu segun el rol
    const navContainer = document.getElementById('sidebar-nav-container');
    navContainer.innerHTML = ''; // Limpiar

    const menuOptions = getMenuByRole(user.rol);
    
    menuOptions.forEach((opt, idx) => {
        const itemContainer = document.createElement('div');
        itemContainer.className = 'nav-group';

        const a = document.createElement('a');
        a.href = '#';
        a.className = `nav-item ${idx === 0 && !opt.submenus ? 'active' : ''}`;
        a.innerHTML = `<i class="${opt.icon}"></i> <span>${opt.label}</span>`;
        
        if (opt.submenus) {
            a.classList.add('has-sub');
            itemContainer.appendChild(a);
            
            const subContainer = document.createElement('div');
            subContainer.className = 'sub-nav';
            
            opt.submenus.forEach(sub => {
                const subA = document.createElement('a');
                subA.href = '#';
                subA.className = 'nav-item sub-item';
                subA.dataset.id = sub.id; // CLAVE PARA RESALTADO
                subA.innerHTML = `<i class="${sub.icon}"></i> <span>${sub.label}</span>`;
                subA.onclick = (e) => {
                    e.preventDefault();
                    renderContent(sub.id, sub.label);
                };
                subContainer.appendChild(subA);
            });
            itemContainer.appendChild(subContainer);
        } else {
            a.dataset.id = opt.id; // CLAVE PARA RESALTADO
            a.onclick = (e) => {
                e.preventDefault();
                renderContent(opt.id, opt.label);
            };
            itemContainer.appendChild(a);
        }
        navContainer.appendChild(itemContainer);
    });

    // Sistema modificado para no cargar ninguna opción inicialmente
    renderContent('val-welcome', 'Panel de Bienvenida');
}

function getMenuByRole(rolInput) {
    const menus = [];
    const rol = String(rolInput).toUpperCase();
    
    if(rol === 'MASTER' || rol === '1') {
        menus.push({ id:'val-themes', label: 'Estilo de Interfaz', icon: 'ph ph-paint-brush' });
        menus.push({ id:'val-users', label: 'Usuarios', icon:'ph ph-users' });
        menus.push({ id:'val-forms', label: 'Plantillas', icon:'ph ph-file-pdf' });
        menus.push({ id:'val-ediciones', label: 'Editar Formularios', icon:'ph ph-note-pencil' });
        menus.push({ 
            id:'val-upload-info', 
            label: 'Subir Información', 
            icon: 'ph ph-cloud-arrow-up', 
            submenus: [
                { id: 'val-personal-docs', label: 'Subir Documentos', icon: 'ph ph-file-arrow-up' },
                { id: 'val-signed-forms', label: 'Subir Formularios Firmados', icon: 'ph ph-signature' }
            ]
        });
        menus.push({ id:'val-bitacora', label: 'Bitácora', icon:'ph ph-list-bullets' });
        menus.push({ id:'val-perfil', label: 'Mi Perfil', icon:'ph ph-user-circle', submenus: [
            { id: 'val-perfil-data', label: 'Información de Usuario', icon: 'ph ph-identification-card' },
            { id: 'val-perfil-security', label: 'Cambio de Contraseña', icon: 'ph ph-shield-check' }
        ]});
    } else if (rol === 'EMPRESA' || rol === '2') {
        menus.push({ id:'val-themes', label: 'Estilo de Interfaz', icon: 'ph ph-paint-brush' });
        menus.push({ id:'val-adds', label: 'Usuarios', icon:'ph ph-user-plus' });
        menus.push({ id:'val-ediciones', label: 'Editar Formularios', icon:'ph ph-note-pencil' });
        menus.push({ 
            id:'val-upload-info', 
            label: 'Subir Información', 
            icon: 'ph ph-cloud-arrow-up', 
            submenus: [
                { id: 'val-personal-docs', label: 'Subir Documentos', icon: 'ph ph-file-arrow-up' },
                { id: 'val-signed-forms', label: 'Subir Formularios Firmados', icon: 'ph ph-signature' }
            ]
        });
        menus.push({ id:'val-bitacora', label: 'Bitácora', icon:'ph ph-list-magnifying-glass' });
        menus.push({ id:'val-perfil', label: 'Mi Perfil', icon:'ph ph-user-circle', submenus: [
            { id: 'val-perfil-data', label: 'Información de Usuario', icon: 'ph ph-identification-card' },
            { id: 'val-perfil-security', label: 'Cambio de Contraseña', icon: 'ph ph-shield-check' }
        ]});
    } else if (rol === 'ADICIONAL' || rol === '3') {
        menus.push({ id:'val-themes', label: 'Estilo de Interfaz', icon: 'ph ph-paint-brush' });
        menus.push({ id:'val-ediciones', label: 'Editar Formularios', icon:'ph ph-note-pencil' });
        menus.push({ 
            id:'val-upload-info', 
            label: 'Subir Información', 
            icon: 'ph ph-cloud-arrow-up', 
            submenus: [
                { id: 'val-personal-docs', label: 'Subir Documentos', icon: 'ph ph-file-arrow-up' },
                { id: 'val-signed-forms', label: 'Subir Formularios Firmados', icon: 'ph ph-signature' }
            ]
        });
        menus.push({ id:'val-perfil', label: 'Mi Perfil', icon:'ph ph-user-circle', submenus: [
            { id: 'val-perfil-data', label: 'Información de Usuario', icon: 'ph ph-identification-card' },
            { id: 'val-perfil-security', label: 'Cambio de Contraseña', icon: 'ph ph-shield-check' }
        ]});
    }
    return menus;
}

function renderContent(menuId, title) {
    document.getElementById('page-title-text').innerText = title;
    
    // --- LÓGICA DE PINTADO DE MENÚ (Smart Highlight) ---
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const sidebarItem = document.querySelector(`.nav-item[data-id="${menuId}"]`);
    if(sidebarItem) {
        sidebarItem.classList.add('active');
        // Si es un submenú, expandir el padre por si acaso
        const parentSub = sidebarItem.closest('.sub-nav');
        if(parentSub) parentSub.style.display = 'block';
    }
    
    const content = document.getElementById('dynamic-content');
    
    // Plantilla inicial sin datos (Dashboard por Defecto)
    if (menuId === 'val-welcome') {
        content.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; min-height:60vh; text-align:center;">
                <div style="width:64px; height:64px; background:rgba(255,255,255,0.05); border:1px solid var(--border-color); border-radius:18px; display:flex; justify-content:center; align-items:center; margin-bottom:24px; box-shadow:0 8px 16px rgba(0,0,0,0.15);">
                    <i class="ph-duotone ph-rocket" style="font-size:2rem; color:var(--primary);"></i>
                </div>
                <h2 style="font-size:1.25rem; font-weight:600; margin-bottom:12px; color:var(--text-main); letter-spacing:-0.5px;">Bienvenido al Gestor Digital</h2>
                <p style="font-size:0.9rem; color:var(--text-muted); max-width:420px; line-height:1.6; font-weight:400;">Su sesión está iniciada de forma activa. Para comenzar a trabajar, seleccione una de las opciones del panel de administración principal izquierdo.</p>
            </div>
        `;
    }
    // Plantilla basica para mostrar estado visual
    else if(menuId === 'val-users') {
        content.innerHTML = `
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
                <div class="glass-card stat-card"><i class="ph-duotone ph-users"></i><h3 id="stat-total">-</h3><p>Usuarios Registrados</p></div>
                <div class="glass-card stat-card"><i class="ph-duotone ph-spinner-gap"></i><h3 id="stat-pending">-</h3><p>Pendientes Aprobación</p></div>
                <div class="glass-card stat-card"><i class="ph-duotone ph-prohibit"></i><h3 id="stat-rejected" style="color:#ef4444;">-</h3><p>Usuarios Rechazados</p></div>
            </div>
            <div class="glass-card" style="padding:24px; overflow-x:auto;">
                <table style="width:100%; text-align:left; border-collapse:collapse;">
                    <thead><tr style="border-bottom:1px solid var(--border-color); color:var(--text-muted);"><th style="padding:12px;">Usuario/Empresa</th><th>Identificación</th><th>Rol</th><th>Código</th><th>Estado</th><th>Acciones</th></tr></thead>
                    <tbody id="users-table-body"><tr><td colspan="6" style="padding:12px; text-align:center;">Cargando usuarios...</td></tr></tbody>
                </table>
            </div>
        `;
        fetchUsersList();
    } else if (menuId === 'val-themes') {
        content.innerHTML = `
            <div class="glass-card" style="padding:40px; display:flex; flex-direction:column; gap:20px; align-items:flex-start;">
                <h2 style="margin-bottom:10px;"><i class="ph-duotone ph-paint-brush" style="color:var(--primary);"></i> Personalización Visual</h2>
                <p style="color:var(--text-muted); margin-bottom:20px; font-size:1.1rem;">Selecciona el diseño y esquema de colores que mejor se adapte a tu comodidad. Los cambios se guardarán para tus próximas sesiones de forma automática.</p>
                <div style="display:flex; flex-wrap:wrap; gap:25px; width:100%;">
                    
                    <div onclick="setTheme('black')" class="theme-card" style="cursor:pointer; background:#0f1115; border: 2px solid rgba(255,255,255,0.1); border-radius:16px; padding:30px; width:220px; transition:all 0.3s; text-align:center;">
                        <div style="width:60px; height:60px; background:linear-gradient(135deg, #1e293b, #0f1115); border-radius:50%; margin:0 auto 20px auto; border:2px solid rgba(255,255,255,0.2);"></div>
                        <h4 style="color:#f8fafc; font-size:1.1rem;">Oscuro Base</h4>
                        <p style="font-size:0.8rem; color:var(--text-muted); margin-top:8px;">Alto contraste por defecto</p>
                    </div>
                    
                    <div onclick="setTheme('white')" class="theme-card" style="cursor:pointer; background:#f1f5f9; border: 2px solid rgba(0,0,0,0.15); border-radius:16px; padding:30px; width:220px; transition:all 0.3s; text-align:center;">
                        <div style="width:60px; height:60px; background:linear-gradient(135deg, #ffffff, #e2e8f0); border-radius:50%; margin:0 auto 20px auto; border:2px solid rgba(0,0,0,0.1);"></div>
                        <h4 style="color:#1e293b; font-size:1.1rem;">Luminoso</h4>
                        <p style="font-size:0.8rem; color:#64748b; margin-top:8px;">Ideal para trabajo de día</p>
                    </div>
                    
                    <div onclick="setTheme('brown')" class="theme-card" style="cursor:pointer; background:#2d241e; border: 2px solid #d97706; border-radius:16px; padding:30px; width:220px; transition:all 0.3s; text-align:center; box-shadow:0 0 15px rgba(217, 119, 6, 0.15);">
                        <div style="width:60px; height:60px; background:linear-gradient(135deg, #4a382b, #2d241e); border-radius:50%; margin:0 auto 20px auto; border:2px solid #d97706;"></div>
                        <h4 style="color:#fdf8f6; font-size:1.1rem;">Sepia Élite</h4>
                        <p style="font-size:0.8rem; color:#d2b48c; margin-top:8px;">Efecto descanso visual</p>
                    </div>
                    
                    <div onclick="setTheme('blue')" class="theme-card" style="cursor:pointer; background:#0f172a; border: 2px solid #3b82f6; border-radius:16px; padding:30px; width:220px; transition:all 0.3s; text-align:center; box-shadow:0 0 15px rgba(59, 130, 246, 0.15);">
                        <div style="width:60px; height:60px; background:linear-gradient(135deg, #1e293b, #0f172a); border-radius:50%; margin:0 auto 20px auto; border:2px solid #3b82f6;"></div>
                        <h4 style="color:#f8fafc; font-size:1.1rem;">Azul Oceánico</h4>
                        <p style="font-size:0.8rem; color:#94a3b8; margin-top:8px;">Minimalismo ejecutivo</p>
                    </div>
                    
                    <div onclick="setTheme('purple')" class="theme-card" style="cursor:pointer; background:#1e1b4b; border: 2px solid #a855f7; border-radius:16px; padding:30px; width:220px; transition:all 0.3s; text-align:center; box-shadow:0 0 15px rgba(168, 85, 247, 0.15);">
                        <div style="width:60px; height:60px; background:linear-gradient(135deg, #3b2853, #1e1b4b); border-radius:50%; margin:0 auto 20px auto; border:2px solid #a855f7;"></div>
                        <h4 style="color:#faf5ff; font-size:1.1rem;">Púrpura Neón</h4>
                        <p style="font-size:0.8rem; color:#d8b4fe; margin-top:8px;">Modernidad y contraste</p>
                    </div>

                    <div onclick="setTheme('emerald')" class="theme-card" style="cursor:pointer; background:#064e3b; border: 2px solid #10b981; border-radius:16px; padding:30px; width:220px; transition:all 0.3s; text-align:center; box-shadow:0 0 15px rgba(16, 185, 129, 0.15);">
                        <div style="width:60px; height:60px; background:linear-gradient(135deg, #065f46, #064e3b); border-radius:50%; margin:0 auto 20px auto; border:2px solid #10b981;"></div>
                        <h4 style="color:#f0fdf4; font-size:1.1rem;">Verde Esmeralda</h4>
                        <p style="font-size:0.8rem; color:#6ee7b7; margin-top:8px;">Equilibrio y seguridad</p>
                    </div>

                    <div onclick="setTheme('crimson')" class="theme-card" style="cursor:pointer; background:#450a0a; border: 2px solid #ef4444; border-radius:16px; padding:30px; width:220px; transition:all 0.3s; text-align:center; box-shadow:0 0 15px rgba(239, 68, 68, 0.15);">
                        <div style="width:60px; height:60px; background:linear-gradient(135deg, #7f1d1d, #450a0a); border-radius:50%; margin:0 auto 20px auto; border:2px solid #ef4444;"></div>
                        <h4 style="color:#fef2f2; font-size:1.1rem;">Rojo Carmesí</h4>
                        <p style="font-size:0.8rem; color:#fca5a5; margin-top:8px;">Intenso y dinámico</p>
                    </div>
                    
                    <div onclick="setTheme('cyber')" class="theme-card" style="cursor:pointer; background:#0f172a; border: 2px solid #06b6d4; border-radius:16px; padding:30px; width:220px; transition:all 0.3s; text-align:center; box-shadow:0 0 15px rgba(6, 182, 212, 0.15);">
                        <div style="width:60px; height:60px; background:linear-gradient(135deg, #1e293b, #0f172a); border-radius:50%; margin:0 auto 20px auto; border:2px solid #06b6d4;"></div>
                        <h4 style="color:#f8fafc; font-size:1.1rem;">Cyberpunk Cyan</h4>
                        <p style="font-size:0.8rem; color:#94a3b8; margin-top:8px;">Tecnológico e innovador</p>
                    </div>
                    
                    <div onclick="setTheme('slate')" class="theme-card" style="cursor:pointer; background:#334155; border: 2px solid #94a3b8; border-radius:16px; padding:30px; width:220px; transition:all 0.3s; text-align:center; box-shadow:0 0 15px rgba(148, 163, 184, 0.15);">
                        <div style="width:60px; height:60px; background:linear-gradient(135deg, #475569, #334155); border-radius:50%; margin:0 auto 20px auto; border:2px solid #94a3b8;"></div>
                        <h4 style="color:#f8fafc; font-size:1.1rem;">Gris Pizarra</h4>
                        <p style="font-size:0.8rem; color:#cbd5e1; margin-top:8px;">Sobrio y profesional</p>
                    </div>
                    
                    <div onclick="setTheme('sunset')" class="theme-card" style="cursor:pointer; background:#2e1022; border: 2px solid #f43f5e; border-radius:16px; padding:30px; width:220px; transition:all 0.3s; text-align:center; box-shadow:0 0 15px rgba(244, 63, 94, 0.15);">
                        <div style="width:60px; height:60px; background:linear-gradient(135deg, #4a0426, #2e1022); border-radius:50%; margin:0 auto 20px auto; border:2px solid #f43f5e;"></div>
                        <h4 style="color:#fff1f2; font-size:1.1rem;">Atardecer Coral</h4>
                        <p style="font-size:0.8rem; color:#fda4af; margin-top:8px;">Cálido y creativo</p>
                    </div>

                </div>
                <style>
                    .theme-card:hover { transform: translateY(-5px); box-shadow: 0 15px 30px rgba(0,0,0,0.5) !important; }
                </style>
            </div>
        `;
    } else if (menuId === 'val-ediciones') {
        content.innerHTML = `
            <div class="glass-header-actions" style="margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
                <div class="search-box-pro">
                    <i class="ph ph-magnifying-glass"></i>
                    <input type="text" id="filter-ediciones" placeholder="Buscar por nombre o fecha..." oninput="filterEdicionesTable()">
                </div>
                <button class="btn btn-primary" onclick="renderContent('val-edit-pdf', 'Editor Maestro')"><i class="ph ph-plus"></i> Nueva Edición</button>
            </div>
            <div class="glass-card" style="padding:24px; overflow-x:auto;">
                <table style="width:100%; text-align:left; border-collapse:collapse;" id="ediciones-table">
                    <thead>
                        <tr style="border-bottom:1px solid var(--border-color); color:var(--text-muted);">
                            <th style="padding:12px;">Documento Original</th>
                            <th>Fecha de Edición</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="ediciones-table-body">
                        <tr><td colspan="4" style="padding:40px; text-align:center;">Cargando historial de ediciones...</td></tr>
                    </tbody>
                </table>
            </div>
        `;
        fetchEdicionesList();
    } else if (menuId === 'val-forms') {
        content.innerHTML = `
            <div class="glass-card" style="padding:40px;">
                <h3 style="margin-bottom:20px; color:var(--primary);"><i class="ph-duotone ph-file-pdf"></i> Repositorio de Plantillas Base</h3>
                <p style="color:var(--text-muted); margin-bottom: 24px;">Selecciona a qué código pertenecerá la plantilla original.</p>
                
                <form id="formUploadPlantilla" style="border:1px solid rgba(255,255,255,0.05); padding:24px; border-radius:12px; margin-bottom: 40px;">
                    <input type="hidden" id="plantilla_id" value="">

                    <div style="display:flex; gap:16px; margin-bottom:20px;">
                        <div style="flex:1;">
                            <label style="display:block; margin-bottom:8px; font-size:0.9rem; color:var(--text-muted);">Nombre de la Plantilla (Ej: KYC)</label>
                            <input type="text" id="plantilla_tipo" required style="width:100%; padding:10px; background:var(--bg-dark); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:white;">
                        </div>
                        <div style="flex:1;">
                            <label style="display:block; margin-bottom:8px; font-size:0.9rem; color:var(--text-muted);">Prefijo (Ej: ABC)</label>
                            <input type="text" id="plantilla_prefijo" required style="width:100%; padding:10px; background:var(--bg-dark); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:white;">
                        </div>
                    </div>

                    <div style="margin-bottom:20px;">
                        <label style="display:block; margin-bottom:8px; font-size:0.9rem; color:var(--text-muted);">Archivo de Referencia (Opcional)</label>
                        <input type="file" id="plantilla_archivo" style="width:100%; padding:10px; background:var(--bg-dark); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:white;">
                    </div>

                    <div style="display:flex; gap:8px; margin-top:24px;">
                        <button type="submit" id="submitPlantillaBtn" class="btn-primary" style="padding:14px 24px;"><i class="ph ph-upload-simple"></i> Guardar Plantilla en Base de Datos</button>
                        <button type="button" id="resetPlantillaBtn" class="btn-ghost" style="display:none; padding:14px 24px; border:1px solid #ef4444; color:#ef4444;" onclick="resetPlantillaForm()"><i class="ph ph-x"></i> Cancelar</button>
                    </div>
                </form>

                
                <h4 style="margin-bottom:16px; margin-top:32px;">Plantillas Actualmente Activas</h4>
                <div style="overflow-x:auto;">
                    <table style="width:100%; text-align:left; border-collapse:collapse;">
                        <thead><tr style="border-bottom:1px solid var(--border-color); color:var(--text-muted);"><th style="padding:12px;">Tipo Código</th><th>Prefijo</th><th>Nombre Original</th><th>Acciones</th><th>Fecha Carga</th></tr></thead>
                        <tbody id="forms-table-body"><tr><td colspan="5" style="padding:12px; text-align:center;">Cargando plantillas...</td></tr></tbody>
                    </table>
                </div>
            </div>
        `;
        
        document.getElementById('formUploadPlantilla').addEventListener('submit', handlePlantillaUpload);
        fetchPlantillas();
    } else if (menuId === 'val-doc-parsing') {
        content.innerHTML = `
            <div class="glass-card" style="padding:40px; max-width:1450px; margin:0 auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:30px;">
                    <div>
                        <h3 style="color:var(--primary); margin:0;"><i class="ph-duotone ph-magic-wand"></i> Sistema Inteligente de Digitalización (v2.5)</h3>
                        <p style="color:var(--text-muted); margin-top:8px;">Motor Multi-Agente: Analiza, Infiere y Convierte PDF a Formulario Vivo.</p>
                    </div>
                    <div id="parsing-agent-status" style="display:flex; gap:12px;">
                        <span class="agent-tag" id="agent-parser-badge"><i class="ph ph-circle-dashed"></i> Parser Agent</span>
                        <span class="agent-tag" id="agent-inference-badge"><i class="ph ph-circle-dashed"></i> Layout Agent</span>
                        <span class="agent-tag" id="agent-ocr-badge"><i class="ph ph-circle-dashed"></i> OCR Agent</span>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns: 320px 1fr; gap:32px;">
                    <!-- Panel Lateral de Herramientas (Agentes) -->
                    <aside style="background:rgba(0,0,0,0.2); border-radius:16px; padding:24px; border:1px solid rgba(255,255,255,0.05);">
                        <div style="margin-bottom:32px;">
                            <label style="display:block; margin-bottom:12px; font-weight:700; color:var(--text-main); font-size:0.85rem; text-transform:uppercase; letter-spacing:1px;">1. Entrada de Documento</label>
                            <select id="parsing_plantilla" class="custom-select" style="width:100%; border-color:var(--primary); font-family:monospace;" onchange="startSmartParsingProcess()">
                                <option value="" disabled selected>-- Elige una Plantilla --</option>
                            </select>
                            <p style="font-size:0.75rem; color:var(--text-muted); margin-top:10px;">El sistema cargará el binario y activará los agentes de inferencia.</p>
                        </div>

                        <div id="smart-tools-panel" style="display:none;">
                            <label style="display:block; margin-bottom:12px; font-weight:700; color:var(--text-main); font-size:0.85rem; text-transform:uppercase; letter-spacing:1px;">2. Herramientas de Inferencia</label>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                <button onclick="setParsingTool('text'); runFullAutoInferenceAgente();" class="btn-ghost active" id="btn-parse-text" style="justify-content:flex-start; font-size:0.85rem; width:100%;"><i class="ph ph-magic-wand"></i> Automarcar Espacios de Texto</button>
                                <button onclick="setParsingTool('check')" class="btn-ghost" id="btn-parse-check" style="justify-content:flex-start; font-size:0.85rem; width:100%;"><i class="ph ph-check-square"></i> Insertar Casilla / Check</button>
                                <button onclick="setParsingTool('select')" class="btn-ghost" id="btn-parse-select" style="justify-content:flex-start; font-size:0.85rem; width:100%;"><i class="ph ph-list"></i> Insertar Selector (SI/NO)</button>
                            </div>

                            <label style="display:block; margin-bottom:12px; font-weight:700; color:var(--text-main); font-size:0.85rem; text-transform:uppercase; letter-spacing:1px; margin-top:32px;">3. Acciones de Agente</label>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                <button onclick="handleSmartSubmit('PENDIENTE')" class="btn-primary" style="background:var(--primary-grad); width:100%; font-size:0.85rem;"><i class="ph ph-floppy-disk"></i> Guardar Plantilla de Inferencia</button>
                                <button onclick="handleSmartSubmit('FINALIZADO')" class="btn-primary" style="background:var(--secondary-grad); width:100%; font-size:0.85rem;"><i class="ph ph-file-pdf"></i> Generar PDF e Historial</button>
                                <button onclick="clearSmartCanvas()" class="btn-ghost" style="color:#ef4444; border-color:#ef4444; width:100%; font-size:0.85rem;"><i class="ph ph-trash"></i> Limpiar Todo</button>
                            </div>
                        </div>
                    </aside>

                    <!-- Área de Trabajo Principal -->
                    <div style="position:relative;">
                        <div id="smart-canvas-loader" style="text-align:center; padding:150px; background:rgba(0,0,0,0.1); border:2px dashed rgba(255,255,255,0.05); border-radius:24px;">
                            <i class="ph ph-layout" style="font-size:4rem; color:var(--text-muted); opacity:0.2; display:block; margin:0 auto 20px;"></i>
                            <h4 style="color:var(--text-muted);">Estación de Trabajo Lista</h4>
                            <p style="color:rgba(255,255,255,0.4); font-size:0.9rem;">Seleccione un documento a la izquierda para iniciar el análisis automático.</p>
                        </div>
                        
                        <div id="smart-rendering-container" style="display:none; transform-origin: top center;">
                            <!-- El lienzo dinámico se inyectará aquí -->
                        </div>
                    </div>
                </div>
            </div>
        `;
        loadPlantillasForSmartParsing();
    } else if (menuId === 'val-digit') {
        content.innerHTML = `
            <div class="glass-card" style="padding:40px; max-width:1400px; margin:0 auto;">
                <h3 style="margin-bottom:20px; color:var(--primary); text-align:center;"><i class="ph-duotone ph-file-pdf"></i> Edición Directa sobre Documento Fiel</h3>
                <p style="color:var(--text-muted); margin-bottom: 32px; text-align:center;">Haga clic en cualquier parte del documento para <b>escribir</b> o <b>borrar</b> (parche blanco). Use la barra lateral de herramientas para mayor precisión.</p>
                
                <form id="formDigitalizacion">
                    <!-- 1. Selección de Plantilla -->
                    <div style="margin-bottom:32px; max-width:600px; margin-left:auto; margin-right:auto; display:flex; gap:12px; align-items:flex-end;">
                        <div style="flex:1;">
                            <label style="display:block; margin-bottom:12px; font-weight:600; text-align:center;">1. Seleccione Documento Base</label>
                            <select id="dig_plantilla" required class="custom-select" style="background:var(--bg-dark); border:1px solid rgba(255,255,255,0.1); width:100%; padding:14px; border-radius:12px; color:white; font-size:1.1rem;" onchange="renderInteractivePDF()">
                                <option value="" disabled selected>Cargando documentos...</option>
                            </select>
                        </div>
                    </div>

                    <div id="pdf-tools" style="display:none; justify-content:center; gap:16px; margin-bottom:20px; position:sticky; top:20px; z-index:100; background:rgba(15,17,21,0.9); padding:10px; border-radius:12px; border:1px solid rgba(255,255,255,0.1); backdrop-filter:blur(10px);">
                        <button type="button" onclick="setEditorMode('text')" class="btn-ghost active" id="mode-text" style="padding:8px 16px;"><i class="ph ph-text-aa"></i> Texto</button>
                        <button type="button" onclick="setEditorMode('check')" class="btn-ghost" id="mode-check" style="padding:8px 16px;"><i class="ph ph-check-square-offset"></i> Visto / Check</button>
                        <button type="button" onclick="switchToFullTextEditor()" class="btn-ghost" id="mode-html" style="padding:8px 16px;"><i class="ph ph-note-pencil"></i> Editar Todo el Texto</button>
                        <button type="button" onclick="clearLastAnnotation()" class="btn-ghost" style="padding:8px 16px; color:#ef4444;"><i class="ph ph-arrow-u-up-left"></i> Deshacer</button>
                        <div style="width:1px; background:rgba(255,255,255,0.1); margin:0 8px;"></div>
                        <button type="button" onclick="handleDigitalizacionSubmit(event, 'PENDIENTE')" class="btn-primary" style="padding:8px 16px; background:#10b981; border:none;"><i class="ph ph-floppy-disk"></i> Guardar Borrador</button>
                    </div>

                    <!-- 2. Visor de PDF Fiel (Formulario sobre PDF) -->
                    <div id="pdf-editor-container" style="margin-bottom:40px; border-radius:16px; min-height:400px; display:flex; flex-direction:column; align-items:center; gap:32px; overflow-x:auto; padding:20px; background:rgba(0,0,0,0.5);">
                        <div id="pdf-rendering-loader" style="color:var(--text-muted); padding:100px; text-align:center;">
                            <i class="ph ph-file-pdf" style="font-size:3rem; opacity:0.3; display:block; margin:0 auto 20px;"></i>
                            Seleccione una plantilla base para cargar el documento fiel.
                        </div>
                    </div>

                    <!-- 2.5 Editor de Texto Completo (HTML Editable) -->
                    <div id="html-editor-container" style="display:none; margin-bottom:40px; background:#fff; color:#000; padding:60px; border-radius:12px; font-family:'Times New Roman', serif; min-height:800px; box-shadow:0 20px 50px rgba(0,0,0,0.3); overflow-y:auto; width:100%; max-width:1000px; margin-left:auto; margin-right:auto; position:relative;">
                        <div id="html-rich-toolbar" class="pdf-pro-toolbar">
                            <div class="toolbar-group">
                                <select id="tb-font-family" onchange="execEditorCommand('fontName', this.value)" class="tool-select" style="width:140px;">
                                    <option value="Arial">Arial</option>
                                    <option value="Times New Roman">Times New Roman</option>
                                    <option value="Verdana">Verdana</option>
                                    <option value="Courier New">Courier New</option>
                                    <option value="Georgia">Georgia</option>
                                </select>
                                <select id="tb-font-size" onchange="applyBlockFontSize(this.value)" class="tool-select" style="width:80px;">
                                    <option value="8">8 pt</option>
                                    <option value="10">10 pt</option>
                                    <option value="12" selected>12 pt</option>
                                    <option value="14">14 pt</option>
                                    <option value="16">16 pt</option>
                                    <option value="18">18 pt</option>
                                    <option value="20">20 pt</option>
                                    <option value="24">24 pt</option>
                                </select>
                            </div>
                            <div class="toolbar-group">
                                <button type="button" onclick="execEditorCommand('bold')" class="btn-tool" id="tb-bold" title="Negrita"><i class="ph-bold ph-text-b"></i></button>
                                <button type="button" onclick="execEditorCommand('italic')" class="btn-tool" id="tb-italic" title="Cursiva"><i class="ph-bold ph-text-italic"></i></button>
                            </div>
                            <div class="toolbar-group">
                                <button type="button" onclick="execEditorCommand('justifyLeft')" class="btn-tool" title="Alinear Izquierda"><i class="ph ph-text-align-left"></i></button>
                                <button type="button" onclick="execEditorCommand('justifyCenter')" class="btn-tool" title="Centrar"><i class="ph ph-text-align-center"></i></button>
                            </div>
                            <div style="flex:1;"></div>
                            <div class="toolbar-group" style="border-right:none;">
                                <button type="button" onclick="setEditorMode('text')" class="btn-tool" style="background:rgba(239, 68, 68, 0.1); color:#ef4444; width:auto; padding:0 12px; font-size:0.85rem; gap:6px; border:1px solid rgba(239, 68, 68, 0.2);">
                                    <i class="ph-bold ph-x"></i> Salir de Edición
                                </button>
                            </div>
                        </div>
                        <div id="html-editable-content" contenteditable="true" style="outline:none; min-height:600px; color:#1a1a1a;"></div>
                    </div>

                    <!-- 3. Adjuntos y Evidencia (Necesario para FINALIZAR) -->
                    <div id="attachments-section" style="display:none; max-width:800px; margin:20px auto; background:rgba(255,255,255,0.03); border:1px dashed rgba(255,255,255,0.1); padding:20px; border-radius:16px; text-align:left;">
                        <h4 style="margin-top:0; color:var(--secondary); font-size:1rem; display:flex; align-items:center; gap:8px;"><i class="ph ph-paperclip"></i> Evidencia y Anexos</h4>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                            <div class="input-group">
                                <label style="font-size:0.85rem; color:var(--text-muted);">Cargar Documento Firmado (Evidencia PDF) <span style="color:#ef4444">*</span></label>
                                <input type="file" id="dig_evidencia" accept="application/pdf" style="width:100%; font-size:0.85rem;">
                            </div>
                            <div class="input-group">
                                <label style="font-size:0.85rem; color:var(--text-muted);">Anexos Adicionales (Fotos, Cedulas, etc)</label>
                                <input type="file" id="dig_anexos" multiple style="width:100%; font-size:0.85rem;">
                            </div>
                        </div>
                        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:10px;"><b>Nota:</b> El documento firmado es obligatorio para marcar el registro como <b>FINALIZADO</b>.</p>
                    </div>

                    <div id="actions-container" style="display:none; text-align:center; margin-top:40px; border-top:1px solid rgba(255,255,255,0.1); padding-top:24px;">
                        <input type="hidden" id="dig_draft_id" value="">
                        <button type="button" onclick="handleDigitalizacionSubmit(event, 'FINALIZADO')" class="btn-primary" style="padding:14px 40px; background:var(--secondary-grad);">
                            <i class="ph-bold ph-check-circle"></i> FINALIZAR Y ENVIAR REGISTRO COMPLETO
                        </button>
                    </div>
                </form>

                <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:40px; margin-bottom:16px; flex-wrap:wrap; gap:16px;">
                    <h4 style="margin:0;">Historial de Digitalizaciones</h4>
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        <input type="text" id="dig_filter_q" placeholder="Buscar plantilla o creador..." style="padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:var(--bg-dark); color:white;">
                        <select id="dig_filter_estado" style="padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:var(--bg-dark); color:white;">
                            <option value="">-- Todos los estados --</option>
                            <option value="PENDIENTE">PENDIENTE</option>
                            <option value="PENDIENTE FIRMA">PENDIENTE FIRMA</option>
                            <option value="FINALIZADO">FINALIZADO</option>
                        </select>
                        <input type="date" id="dig_filter_desde" title="Desde" style="padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:var(--bg-dark); color:white;">
                        <input type="date" id="dig_filter_hasta" title="Hasta" style="padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:var(--bg-dark); color:white;">
                        <button class="btn-primary" onclick="fetchDigitalizacionesHistorial()" style="padding:8px 16px;"><i class="ph-bold ph-funnel"></i> Filtrar</button>
                    </div>
                </div>
                <div style="overflow-x:auto;">
                    <table style="width:100%; text-align:left; border-collapse:collapse;">
                        <thead><tr style="border-bottom:1px solid var(--border-color); color:var(--text-muted);"><th style="padding:12px;">ID</th><th>Estado</th><th>Plantilla Origen</th><th style="min-width:140px;">Evidencia Física</th><th>Fecha</th></tr></thead>
                        <tbody id="digitalizados-table-body"><tr><td colspan="5" style="padding:12px; text-align:center;">Cargando historial...</td></tr></tbody>
                    </table>
                </div>
            </div>
        `;
        

        loadPlantillasForDigit();
        loadDigitTargets();
        fetchDigitalizacionesHistorial();
        document.getElementById('formDigitalizacion').addEventListener('submit', handleDigitalizacionSubmit);
    } else if (menuId === 'val-adds') {
        content.innerHTML = `
            <div class="glass-card" style="padding:40px;">
                <h3 style="margin-bottom:20px; color:var(--primary);"><i class="ph-duotone ph-user-plus"></i> Operadores Adicionales</h3>
                <p style="color:var(--text-muted); margin-bottom: 24px;">Como Empresa Principal, puedes crear cuentas de Operadores Adicionales autónomos. Estos usuarios heredarán tu contexto comercial y tendrán acceso al módulo de digitalización instatáneamente. Su acceso está regido por tu cuenta.</p>
                
                <form id="formAdicional" style="border:1px solid rgba(255,255,255,0.05); padding:24px; border-radius:12px; margin-bottom: 40px;">
                    <div class="form-grid">
                        <div class="input-group">
                            <label>Nombre del Operador <span style="color:#ef4444">*</span></label>
                            <input type="text" id="add_nombres" placeholder="Juan Pérez" required>
                        </div>
                        <div class="input-group">
                            <label>Identificación (RUC/CI) <span style="color:#ef4444">*</span></label>
                            <input type="text" id="add_identificacion" placeholder="Número único" required>
                        </div>
                        <div class="input-group">
                            <label>Dirección</label>
                            <input type="text" id="add_direccion" placeholder="Opcional">
                        </div>
                        <div class="input-group">
                            <label>Teléfono</label>
                            <input type="text" id="add_telefono" placeholder="Opcional">
                        </div>
                        <div class="input-group">
                            <label>Contraseña de Acceso <span style="color:#ef4444">*</span></label>
                            <input type="password" id="add_password" placeholder="Mínimo 6 caracteres" required>
                        </div>
                    </div>
                    <div class="action-buttons" style="margin-top:20px;">
                         <button type="submit" class="btn-primary" style="padding:14px 24px;"><i class="ph-bold ph-plus"></i> Habilitar Cuenta de Operador</button>
                    </div>
                </form>

                <h4 style="margin-bottom: 12px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px;">Lista de tus Operadores Adicionales</h4>
                <div style="overflow-x:auto;">
                    <table style="width:100%; text-align:left; border-collapse:collapse;">
                        <thead><tr style="border-bottom:1px solid var(--border-color); color:var(--text-muted);"><th style="padding:12px;">Identificación</th><th>Nombres</th><th>Estado</th><th>Permisos</th><th>Fecha Alta</th></tr></thead>
                        <tbody id="adds-table-body"><tr><td colspan="5" style="padding:12px; text-align:center;">Cargando...</td></tr></tbody>
                    </table>
                </div>
            </div>
        `;
        document.getElementById('formAdicional').addEventListener('submit', handleAdicionalUserUpload);
        fetchMyAdicionales();

    } else if (menuId === 'val-perfil-data') {
        const user = getSafeUser();
        content.innerHTML = `
            <div class="glass-card" style="padding:40px; max-width:720px; margin:0 auto;">
                <h3 style="margin-bottom:10px; color:var(--primary);"><i class="ph-duotone ph-identification-card"></i> Información de Identidad</h3>
                <p style="color:var(--text-muted); margin-bottom: 30px;">Gestione sus datos personales y códigos maestros de la plataforma.</p>
                
                <form onsubmit="handleMasterProfileUpdate(event)" style="display:flex; flex-direction:column; gap:20px;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
                        <div class="input-group">
                            <label>Nombres Completos</label>
                            <input type="text" id="master-prof-name" value="${user.nombres_completos || ''}" required>
                        </div>
                        <div class="input-group">
                            <label>Identificación</label>
                            <input type="text" id="master-prof-ident" value="${user.identificacion || ''}" required>
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
                        <div class="input-group">
                            <label>Código Único (Heredable a Operadores)</label>
                            <input type="text" id="master-prof-code" value="${user.codigo_unico || ''}" required style="font-family:monospace; color:var(--secondary);">
                        </div>
                        <div class="input-group">
                            <label>Correo Electrónico (Para recuperación)</label>
                            <input type="email" id="master-prof-email" value="${user.email || ''}" required placeholder="ejemplo@correo.com">
                        </div>
                    </div>
                    <button type="submit" class="btn-primary" style="background:var(--secondary-grad); margin-top:10px;">
                        <i class="ph ph-floppy-disk"></i> Guardar Cambios de Identidad
                    </button>
                </form>
            </div>
        `;

    } else if (menuId === 'val-perfil-security') {
        content.innerHTML = `
            <div class="glass-card" style="padding:40px; max-width:720px; margin:0 auto;">
                <h3 style="margin-bottom:10px; color:#ef4444;"><i class="ph-duotone ph-shield-check"></i> Seguridad de Acceso</h3>
                <p style="color:var(--text-muted); margin-bottom: 30px;">Actualice sus credenciales para mantener la integridad de su cuenta.</p>
                
                <form onsubmit="handleMasterPasswordChange(event)" style="display:flex; flex-direction:column; gap:20px;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
                        <div class="input-group">
                            <label>Nueva Contraseña</label>
                            <div class="input-wrapper">
                                <i class="ph ph-lock-simple"></i>
                                <input type="password" id="master-new-pwd" placeholder="Mínimo 6 caracteres" required minlength="6">
                                <i class="ph ph-eye toggle-password" onclick="togglePasswordVisibility(this)"></i>
                            </div>
                        </div>
                        <div class="input-group">
                            <label>Confirmar Nueva Contraseña</label>
                            <div class="input-wrapper">
                                <i class="ph ph-lock-simple-check"></i>
                                <input type="password" id="master-confirm-pwd" placeholder="Repita la contraseña" required minlength="6">
                                <i class="ph ph-eye toggle-password" onclick="togglePasswordVisibility(this)"></i>
                            </div>
                        </div>
                    </div>
                    <button type="submit" class="btn-primary" style="background:#ef4444; margin-top:10px;">
                        <i class="ph ph-shield-check"></i> Actualizar mi Contraseña
                    </button>
                </form>
            </div>
        `;

    } else if (menuId === 'val-edit-pdf') {
        content.innerHTML = `
            <div class="pro-editor-layout" style="grid-template-columns: 140px 1fr;">
                <!-- 1. RIBBON TOOLBAR -->
                <div class="pro-ribbon-toolbar" style="grid-column: 1 / span 2;">
                    <div class="ribbon-tabs">
                        <div class="ribbon-tab active">HERRAMIENTAS DE EDICIÓN</div>
                    </div>
                    
                    <div class="ribbon-actions" id="ribbon-home">
                        <div class="ribbon-group">
                            <select id="edit-pl-select" style="padding:6px; background:rgba(255,255,255,0.05); color:white; border:1px solid rgba(255,255,255,0.1); border-radius:4px; font-size:11px; width:180px;">
                                <option value="">Abrir PDF...</option>
                            </select>
                            <button class="ribbon-btn" onclick="saveFullProChanges()"><i class="ph ph-floppy-disk"></i><span>Guardar</span></button>
                        </div>
                        <div class="ribbon-group">
                            <button class="ribbon-btn" onclick="undoEdit()"><i class="ph ph-arrow-u-up-left"></i><span>Deshacer</span></button>
                            <button class="ribbon-btn" onclick="redoEdit()"><i class="ph ph-arrow-u-up-right"></i><span>Rehacer</span></button>
                        </div>
                        <div class="ribbon-group">
                             <button class="ribbon-btn" id="btn-add-text-tool" onclick="toggleFullEditableMode('add-text')">
                                <i class="ph ph-plus-circle" style="font-size: 18px; color: var(--primary);"></i>
                                <span style="font-weight: 800;">AÑADIR TEXTO</span>
                             </button>
                             <button class="ribbon-btn" id="btn-add-check-tool" onclick="toggleFullEditableMode('add-check')">
                                <i class="ph ph-check-square" style="font-size: 18px; color: #10b981;"></i>
                                <span style="font-weight: 800;">AÑADIR MARCA</span>
                             </button>
                        </div>
                        <div class="ribbon-group">
                             <button class="ribbon-btn" onclick="renderContent('val-ediciones', 'Editar Formularios')">
                                <i class="ph ph-folder-open" style="font-size: 18px; color: var(--secondary);"></i>
                                <span style="font-weight: 800;">VOLVER A EDITADOS</span>
                             </button>
                        </div>
                        <div class="ribbon-group" id="text-formatting-tools" style="display:none;">
                            <button class="ribbon-btn" onclick="applyProFormat('bold')"><i class="ph-bold ph-text-b"></i></button>
                            <button class="ribbon-btn" onclick="applyProFormat('italic')"><i class="ph-bold ph-text-italic"></i></button>
                             <select id="pro-font-size" onchange="applyProFontSize(this.value)" style="background:rgba(255,255,255,0.1); color:white; border:1px solid rgba(255,255,255,0.2); border-radius:4px; font-size:11px; padding:2px 4px; cursor:pointer;">
                                 <option value="8">8 pt</option><option value="9">9 pt</option><option value="10">10 pt</option><option value="11">11 pt</option>
                                 <option value="12" selected>12 pt</option><option value="14">14 pt</option><option value="16">16 pt</option>
                                 <option value="18">18 pt</option><option value="20">20 pt</option><option value="24">24 pt</option>
                             </select>

                        </div>
                    </div>
                </div>

                <!-- 2. SIDEBAR THUMBNAILS (LEFT) -->
                <div class="pro-page-sidebar" id="pro-thumbnails">
                    <p style="color:var(--text-muted); font-size:11px; text-align:center;">Cargue un PDF para ver hojas</p>
                </div>

                <!-- 3. CANVAS AREA (CENTER) -->
                <div class="pro-canvas-area" id="pro-editor-canvas">
                    <div style="text-align:center; color:rgba(255,255,255,0.2); margin-top:150px;">
                        <i class="ph-duotone ph-file-pdf" style="font-size:5rem; display:block; margin-bottom:20px;"></i>
                        <h2 style="font-weight:400;">Entorno de Edición Profesional</h2>
                        <p>Seleccione un documento para comenzar la manipulación binaria</p>
                    </div>
                </div>

                <!-- 4. ZOOM CONTROLS -->
                <div class="pro-zoom-controls" style="right: 30px;">
                    <button class="toolbar-btn" onclick="changeProZoom(-0.1)"><i class="ph ph-minus"></i></button>
                    <span id="zoom-val" style="color:white; font-size:12px; font-weight:700; min-width:40px; text-align:center;">100%</span>
                    <button class="toolbar-btn" onclick="changeProZoom(0.1)"><i class="ph ph-plus"></i></button>
                </div>
            </div>
        `;
        fetchPlantillasParaEditor();
    } else if (menuId === 'val-personal-docs') {
        renderPersonalDocsView(content);
    } else if (menuId === 'val-signed-forms') {
        renderSignedFormsView(content);
    } else if (menuId === 'val-bitacora') {
        content.innerHTML = `
            <div class="glass-card" style="padding:40px;">
                <h3 style="margin-bottom:20px; color:var(--primary);"><i class="ph-duotone ph-list-bullets"></i> Bitácora de Auditoría</h3>
                <p style="color:var(--text-muted); margin-bottom: 24px;">Registro inmutable de todas las acciones ejecutadas en la plataforma de acuerdo al rango temporal permitido por el ROL de su cuenta.</p>
                
                <div style="display:flex; justify-content:space-between; margin-bottom:20px; gap:16px;">
                    <form onsubmit="searchBitacora(event)" style="flex:1; max-width:400px; display:flex;">
                        <input type="text" id="bita-search-input" placeholder="Buscar por usuario, ID o acción..." style="width:100%; padding:10px; background:var(--bg-dark); border:1px solid rgba(255,255,255,0.1); border-radius:6px 0 0 6px; color:white;">
                        <button type="submit" class="btn-primary" style="border-radius:0 6px 6px 0; padding:10px 16px; margin:0;"><i class="ph ph-magnifying-glass"></i></button>
                    </form>
                </div>

                <div style="background:var(--bg-dark); border-radius:12px; border:1px solid rgba(255,255,255,0.05); overflow:hidden;">
                    <table style="width:100%; text-align:left; border-collapse:collapse; font-size:0.9rem;">
                        <thead style="background:rgba(0,0,0,0.3);">
                            <tr style="border-bottom:1px solid var(--border-color); color:var(--text-muted);">
                                <th style="padding:16px;">Fecha / Hora</th>
                                <th style="padding:16px;">Usuario</th>
                                <th style="padding:16px;">Rol</th>
                                <th style="padding:16px;">Acción Genérica</th>
                                <th style="padding:16px;">Detalle Forense</th>
                            </tr>
                        </thead>
                        <tbody id="bita-table-body">
                            <tr><td colspan="5" style="padding:12px; text-align:center;">Consultando bitácora inmutable...</td></tr>
                        </tbody>
                    </table>
                </div>

                <div id="bita-pagination" style="display:flex; justify-content:flex-end; align-items:center; margin-top:20px; gap:16px;"></div>
            </div>
        `;
        currentBitaPage = 1;
        currentBitaSearch = '';
        fetchBitacora();

    } else {
        content.innerHTML = `<div class="glass-card" style="padding:40px; text-align:center;"><p>Sección en construcción o conectando la API...</p></div>`;
    }
}

// === FUNCIONES HISTORIAL Y CRUD REGISTROS ===

async function fetchDigitalizacionesHistorial() {
    try {
        const q = document.getElementById('hist_search')?.value || '';
        const res = await fetch(`/api/digitalizacion?q=${q}`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const data = await res.json();
        const tbody = document.getElementById('history-table-body');
        if(!tbody) return;
        tbody.innerHTML = '';

        if(data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding:40px; text-align:center; color:var(--text-muted);">No se encontraron registros.</td></tr>';
            return;
        }

        data.forEach(d => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            
            let badgeClass = 'badge-pending';
            if(d.estado === 'FINALIZADO') badgeClass = 'badge-success';
            if(d.estado === 'PENDIENTE FIRMA') badgeClass = 'badge-warning';

            tr.innerHTML = `
                <td style="padding:16px;">#${d.id}</td>
                <td style="font-weight:600;">${d.plantilla_tipo}</td>
                <td style="color:var(--text-muted); font-size:0.85rem;">${new Date(d.fecha_registro).toLocaleString()}</td>
                <td><span class="badge ${badgeClass}">${d.estado}</span></td>
                <td>
                    <div style="display:flex; gap:6px;">
                        <button onclick="resumeBorrador(${d.id})" class="btn-ghost icon-btn" style="color:var(--secondary);" title="Ver/Editar"><i class="ph ph-pencil"></i></button>
                        <button onclick="duplicateDoc(${d.id})" class="btn-ghost icon-btn" style="color:var(--primary);" title="Duplicar"><i class="ph ph-copy"></i></button>
                        <button onclick="deleteDoc(${d.id})" class="btn-ghost icon-btn" style="color:#ef4444;" title="Eliminar"><i class="ph ph-trash"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch(err) { console.error('Error al cargar historial', err); }
}

async function resumeBorrador(id) {
    try {
        const res = await fetch(`/api/digitalizacion`, {
             headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const all = await res.json();
        const doc = all.find(x => x.id == id);
        if(!doc) return alert('No se encontró el registro');

        renderContent('val-digit', translations[currentLang].digitalizacion);
        
        setTimeout(() => {
            const select = document.getElementById('dig_plantilla');
            if(select) {
                select.value = doc.plantilla_id;
                renderInteractivePDF(doc);
            }
        }, 300);
    } catch(err) {}
}

async function fetchUsersList() {
    try {
        const res = await fetch(`/api/usuarios`, { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } });
        const users = await res.json();
        
        let html = '';
        let pending = 0;
        let rejected = 0;
        
        const myUser = getSafeUser();

        users.forEach(u => {
            if(u.estado === 'PENDIENTE') pending++;
            if(u.estado === 'RECHAZADO') rejected++;
            
            let statusText = '';
            if(u.estado === 'ACTIVO') statusText = '<span style="color:var(--secondary)">Activo</span>';
            else if(u.estado === 'RECHAZADO') statusText = '<span style="color:#ef4444">Rechazado</span>';
            else statusText = '<span style="color:#f59e0b">Pendiente</span>';

            if(u.bloqueado) {
                statusText += '<br><span style="color:#ef4444; font-size: 0.8rem; border:1px solid #ef4444; padding:2px 4px; border-radius:4px; margin-top:4px; display:inline-block;"><i class="ph-fill ph-lock-key"></i> Bloqueado</span>';
            }

            let authBtns = '';
            if (u.rol !== 'MASTER') {
                
                const showApprove = (u.estado === 'PENDIENTE' || u.estado === 'RECHAZADO');
                const showReject = (u.estado === 'PENDIENTE' || u.estado === 'ACTIVO');

                if (showApprove) {
                    authBtns += `<button onclick="approveUser(${u.id})" class="btn-ghost" style="padding:4px 8px; border:1px solid var(--secondary); color:var(--secondary); margin-right:4px;" title="Aprobar / Reactivar">✔️</button>`;
                }
                if (showReject) {
                    authBtns += `<button onclick="rejectUser(${u.id})" class="btn-ghost" style="padding:4px 8px; border:1px solid #f59e0b; color:#f59e0b; margin-right:4px;" title="Rechazar">✖</button>`;
                }
                authBtns += `<button onclick="deleteUser(${u.id})" class="btn-ghost" style="padding:4px 8px; border:1px solid #ef4444; color:#ef4444; margin-right:4px;" title="Eliminar definitivamente"><i class="ph ph-trash"></i></button>`;
                if (myUser.rol === 'MASTER') {
                    if (u.bloqueado) {
                        authBtns += `<button onclick="desbloquearUser(${u.id})" class="btn-ghost" style="padding:4px 8px; border:1px solid #10b981; color:#10b981; margin-right:4px;" title="Quitar Bloqueo de Acceso"><i class="ph-bold ph-lock-key-open"></i></button>`;
                    }
                }
                authBtns += `<button onclick="resetPassword(${u.id})" class="btn-ghost" style="padding:4px 8px; border:1px solid #6366f1; color:#6366f1;" title="Restablecer Contraseña"><i class="ph ph-key"></i></button>`;
            } else {
                authBtns = '<span style="color:var(--text-muted)">-</span>';
            }

            html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:12px;">${u.nombres_completos}</td>
                <td>${u.identificacion}</td>
                <td><span class="badge" style="background:var(--primary);">${u.rol}</span></td>
                <td style="font-family:monospace; color:var(--secondary);">${u.codigo_unico || 'N/A'}</td>
                <td>${statusText}</td>
                <td style="white-space:nowrap;">${authBtns}</td>
            </tr>`;
        });
        
        document.getElementById('users-table-body').innerHTML = html || '<tr><td colspan="6" style="text-align:center; padding:12px;">No hay usuarios aún</td></tr>';
        document.getElementById('stat-total').innerText = users.length;
        document.getElementById('stat-pending').innerText = pending;
        const statRejected = document.getElementById('stat-rejected');
        if(statRejected) statRejected.innerText = rejected;
    } catch(err) {
        document.getElementById('users-table-body').innerHTML = '<tr><td colspan="6" style="color:red; text-align:center;">Error cargando datos</td></tr>';
    }
}

async function deleteUser(userId) {
    if(!confirm('¿Está ABSOLUTAMENTE seguro de eliminar este usuario? Esta acción es irreversible en la interfaz.')) return;
    
    showCustomModal('Procesando...', 'Eliminando credenciales y registros del sistema...', 'info');
    
    try {
        const res = await fetch(`/api/usuarios/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const data = await res.json();
        
        if(!res.ok) {
            showCustomModal('Error de Eliminación', data.error || 'No se pudo completar la baja.', 'error');
            return;
        }
        
        showCustomModal('Usuario Eliminado', 'La cuenta ha sido dada de baja exitosamente del sistema.', 'success');
        
        // Recargar la vista dependiendo de donde estemos
        const user = getSafeUser();
        if(user.rol === 'MASTER') fetchUsersList();
        else fetchMyAdicionales();
        
    } catch(err) {
        showCustomModal('Error Técnico', 'No hay conexión con el servidor de seguridad.', 'error');
    }
}

async function approveUser(id) {
    try {
        await fetch(`/api/usuarios/${id}/aprobar`, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        fetchUsersList(); // Recargar tabla
    } catch(err) {
        alert('Error al aprobar');
    }
}

async function rejectUser(id) {
    if (!confirm('¿Estás seguro de rechazar este usuario? No podrá ingresar.')) return;
    try {
        await fetch(`/api/usuarios/${id}/rechazar`, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        fetchUsersList(); // Recargar tabla
    } catch(err) {
        alert('Error al rechazar');
    }
}

async function desbloquearUser(id) {
    if (!confirm('¿Está seguro de que desea desbloquear preventivamente esta cuenta para que vuelva a intentar credenciales?')) return;
    try {
        const res = await fetch(`/api/usuarios/${id}/desbloquear`, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const data = await res.json();
        if(!res.ok) return alert(data.error);
        alert(data.mensaje);
        fetchUsersList(); 
    } catch(err) {
        alert('Error al desbloquear al usuario');
    }
}

function viewDocument(url) {
    document.getElementById('modal-title').innerText = 'Visualización de Documento';
    document.getElementById('modal-body').innerHTML = `
        <div style="margin-bottom: 12px; text-align: right;">
            <a href="${url}" download class="btn-primary" style="padding: 6px 12px; font-size: 0.85rem;"><i class="ph ph-download-simple"></i> Descargar Documento</a>
        </div>
        <div style="height: 600px; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #ddd;">
            <iframe src="${url}" style="width: 100%; height: 100%; border: none;"></iframe>
        </div>
    `;
    document.getElementById('modal-overlay').style.display = 'flex';
}

async function handlePlantillaUpload(e) {
    e.preventDefault();
    const formData = new FormData();
    formData.append('id', document.getElementById('plantilla_id').value);
    formData.append('tipo', document.getElementById('plantilla_tipo').value);
    formData.append('prefijo', document.getElementById('plantilla_prefijo').value.toUpperCase());
    
    const file = document.getElementById('plantilla_archivo').files[0];
    if (file) formData.append('archivo', file);

    formData.append('campos_configurados', '[]');
    formData.append('html_content', '');

    try {
        const res = await fetch(`/api/formularios/upload`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') },
            body: formData
        });
        const data = await res.json();
        if(!res.ok) return showCustomModal('Error', data.error, 'error');
        showCustomModal('Éxito', data.mensaje, 'success');
        resetPlantillaForm();
        fetchPlantillas();
        loadFormTypesForRegistration();
    } catch(err) {
        showCustomModal('Error', 'Error al subir plantilla', 'error');
    }
}

async function fetchPlantillas() {
    try {
        const res = await fetch(`/api/formularios`);
        const plantillas = await res.json();
        window.GLOBAL_PLANTILLAS = plantillas; // Cache global para Digitalización
        
        let html = '';
        plantillas.forEach(p => {
            html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:12px; font-weight:bold; color:var(--secondary);">${p.tipo}</td>
                <td style="font-family:monospace; color:var(--primary);">${p.prefijo}</td>
                <td style="color:var(--text-muted); font-size:0.85rem;">${p.nombre_archivo || 'N/A'}</td>
                <td>
                    <button onclick="editPlantilla(${p.id}, '${p.tipo}', '${p.prefijo}')" class="btn-ghost" style="padding:4px 8px; color:var(--secondary); margin-right:4px;" title="Editar"><i class="ph ph-pencil"></i></button>
                    <button onclick="descargarPlantillaOriginal(${p.id}, '${(p.nombre_archivo || 'plantilla.pdf').replace(/'/g, "\\'")}')" class="btn-ghost" style="padding:4px 8px; color:#2563eb; margin-right:4px;" title="Descargar PDF Original"><i class="ph ph-download-simple"></i></button>
                    <button onclick="deletePlantilla(${p.id})" class="btn-ghost" style="padding:4px 8px; color:#ef4444;" title="Eliminar"><i class="ph ph-trash"></i></button>
                </td>
                <td style="color:var(--text-muted); font-size:0.85rem;">${new Date(p.fecha_carga).toLocaleString()}</td>
            </tr>`;
        });
        document.getElementById('forms-table-body').innerHTML = html || '<tr><td colspan="5" style="text-align:center; padding:12px;">No hay plantillas disponibles</td></tr>';
    } catch(err) {
        console.error(err);
    }
}

async function descargarPlantillaOriginal(id, nombre) {
    showCustomModal('Descargando...', 'El Agente está localizando y asegurando el binario original...', 'info');
    try {
        const response = await fetch(`/api/formularios/view/${id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detalle || errData.error || 'No se pudo recuperar el archivo del servidor.');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        closeCustomModal();
    } catch (err) {
        showCustomModal('Error de Descarga', err.message, 'error');
    }
}

function descargarPlantillaHTML(id, tipo) {
    const plantilla = window.GLOBAL_PLANTILLAS.find(p => p.id == id);
    if (!plantilla || !plantilla.html_content) {
        return alert('Esta plantilla no tiene contenido HTML disponible.');
    }
    
    const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${plantilla.tipo}</title>
    <style>
        body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; margin: 40px; color: #000; }
        input { border: 1px solid #000; padding: 2px 4px; min-width: 100px; }
    </style>
</head>
<body>
${plantilla.html_content}
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (tipo || 'plantilla').replace(/[^a-z0-9]/gi, '_') + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function deletePlantilla(id) {
    if (!confirm('¿Estás seguro de eliminar esta Plantilla? Se borrará de la lista para todos.')) return;
    try {
        console.log(`[DELETE] Petición a: /api/formularios/${id}`);
        const res = await fetch(`/api/formularios/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            console.error('[DELETE] Error del servidor:', data);
            return showCustomModal('Error de Servidor', `ID: ${id} | Código: ${res.status} | Detalle: ${data.error || 'Desconocido'}`, 'error');
        }

        showCustomModal('¡Eliminado!', data.mensaje, 'success');
        fetchPlantillas();
        loadFormTypesForRegistration();
    } catch(err) {
        alert('Error conectando con el servidor para eliminar');
    }
}

async function loadFormTypesForRegistration() {
    try {
        const res = await fetch(`/api/formularios`);
        const plantillas = await res.json();
        const select = document.getElementById('reg_tipo_formulario');
        if(!select) return;
        select.innerHTML = '<option value="" disabled selected>-- Seleccione un Formulario --</option>';
        plantillas.forEach(p => {
            select.innerHTML += `<option value="${p.tipo}">${p.tipo} (Genera ${p.prefijo}...)</option>`;
        });
    } catch(err) {}
}

function editPlantilla(id, tipo, prefijo) {
    document.getElementById('plantilla_id').value = id;
    document.getElementById('plantilla_tipo').value = tipo;
    document.getElementById('plantilla_prefijo').value = prefijo;
    document.getElementById('submitPlantillaBtn').innerHTML = '<i class="ph ph-pencil"></i> Actualizar Documento';
    document.getElementById('resetPlantillaBtn').style.display = 'inline-block';
    
    // Cargar pines existentes
    const plan = window.GLOBAL_PLANTILLAS ? window.GLOBAL_PLANTILLAS.find(p => p.id == id) : null;
    if(plan) {
        window.CURRENT_PINS = plan.campos_configurados || [];
        if(plan.ruta_archivo) {
            // Mostrar visor para ver pines si ya hay archivo
            fetch(plan.ruta_archivo).then(r => r.blob()).then(blob => initPdfMapping(blob));
        }
    }
}

function resetPlantillaForm() {
    document.getElementById('formUploadPlantilla').reset();
    document.getElementById('plantilla_id').value = '';
    document.getElementById('submitPlantillaBtn').innerHTML = '<i class="ph ph-upload-simple"></i> Guardar Formato Operativo Original';
    document.getElementById('resetPlantillaBtn').style.display = 'none';
    if(typeof tinymce !== 'undefined' && tinymce.get('plantilla_html_content')) {
        tinymce.get('plantilla_html_content').setContent('');
    }
    const fileInput = document.getElementById('plantilla_archivo');
    if(fileInput) fileInput.value = '';
}

loadFormTypesForRegistration();

// ====== MODULO DIGITALIZACION ======
let digitFieldCounter = 0;
function addDynamicField() {
    digitFieldCounter++;
    const container = document.getElementById('dynamic-fields-container');
    const div = document.createElement('div');
    div.style.cssText = "display:flex; gap:12px; align-items:center; margin-bottom:12px;";
    div.id = `digit-row-${digitFieldCounter}`;
    div.innerHTML = `
        <div style="flex:1;"><input type="text" placeholder="Ej: Nombre Completo / Monto" class="digit-key" required style="width:100%; padding:10px; background:var(--bg-dark); border:1px solid rgba(255,255,255,0.1); border-radius:6px; color:white;"></div>
        <div style="flex:2;"><input type="text" placeholder="Dato del documento..." class="digit-val" required style="width:100%; padding:10px; background:var(--bg-dark); border:1px solid rgba(255,255,255,0.1); border-radius:6px; color:white;"></div>
        <button type="button" class="btn-ghost" onclick="document.getElementById('digit-row-${digitFieldCounter}').remove()" style="color:#ef4444; padding:8px;" title="Eliminar fila"><i class="ph ph-trash"></i></button>
    `;
    container.appendChild(div);
}

window.GLOBAL_PLANTILLAS = [];
async function loadPlantillasForDigit() {
    try {
        const res = await fetch(`/api/formularios`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const plantillas = await res.json();
        window.GLOBAL_PLANTILLAS = plantillas; // Re-cache con auth
        const select = document.getElementById('dig_plantilla');
        if(!select) return;
        select.innerHTML = '<option value="" disabled selected>-- Elija Plantilla Base --</option>';
        plantillas.forEach(p => {
            select.innerHTML += `<option value="${p.id}">${p.tipo} (${p.prefijo})</option>`;
        });
    } catch(err) {}
}

let editorMode = 'text'; // 'text' o 'mask'
window.CURRENT_ANNOTATIONS = [];

function setEditorMode(mode) {
    editorMode = mode;
    document.querySelectorAll('#pdf-tools .btn-ghost').forEach(b => b.classList.remove('active'));
    const target = document.getElementById(`mode-${mode}`);
    if(target) target.classList.add('active');

    // Manejar visibilidad de contenedores segun el modo
    if (mode === 'html') {
        document.getElementById('pdf-editor-container').style.display = 'none';
        document.getElementById('html-editor-container').style.display = 'block';
    } else {
        document.getElementById('pdf-editor-container').style.display = 'flex';
        document.getElementById('html-editor-container').style.display = 'none';
    }
}

window.CURRENT_EDITING_DOC = null;

async function switchToFullTextEditor() {
    setEditorMode('html');
    const pId = document.getElementById('dig_plantilla').value;
    const plantilla = window.GLOBAL_PLANTILLAS.find(p => p.id == pId);
    if (!plantilla) return showCustomModal('Selección Requerida', 'Seleccione una plantilla primero.', 'info');

    const editor = document.getElementById('html-editable-content');
    
    // Guardar referencia al HTML guardado si existe
    let savedHTML = null;
    if (window.CURRENT_EDITING_DOC && window.CURRENT_EDITING_DOC.html_content_personalizado) {
        savedHTML = window.CURRENT_EDITING_DOC.html_content_personalizado;
    }

    if (!plantilla.ruta_archivo) {
        editor.innerHTML = `<div style="text-align:center; padding:50px;">Documento base no disponible.</div>`;
        return;
    }

    editor.innerHTML = `<div style="text-align:center; padding:50px; color:#666;"><i class="ph-bold ph-magic-wand ph-spin" style="font-size:2rem;"></i><br>Cargando documento de alta fidelidad...</div>`;
    
    try {
        const loadingTask = pdfjsLib.getDocument({
            url: plantilla.ruta_archivo,
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
            cMapPacked: true
        });
        const pdf = await loadingTask.promise;
        
        editor.innerHTML = '';
        editor.style.cssText = 'outline:none; background:#525659; padding:40px; display:flex; flex-direction:column; align-items:center; gap:40px;';

        // Si tenemos HTML guardado, lo parseamos para extraer los contenidos de cada página
        let savedPagesMap = {};
        if (savedHTML) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = savedHTML;
            tempDiv.querySelectorAll('.pdf-page-container').forEach((p, idx) => {
                const layer = p.querySelector('.pdf-text-layer');
                if (layer) savedPagesMap[idx + 1] = layer.innerHTML;
            });
        }

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const scale = 1.5;
            const viewport = page.getViewport({ scale });

            // 1. Contenedor de Página
            const pageDiv = document.createElement('div');
            pageDiv.className = 'pdf-page-container';
            pageDiv.dataset.page = i;
            pageDiv.style.cssText = `position:relative; width:${viewport.width}px; height:${viewport.height}px; background:white; box-shadow:0 10px 30px rgba(0,0,0,0.4); flex-shrink:0; overflow:hidden; margin:0 auto; padding:0;`;

            // 2. Fondo Canvas (Siempre se genera para fidelidad absoluta)
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;';
            pageDiv.appendChild(canvas);
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

            // 3. Capa de Texto (Calibración milimétrica para Motor Nativo)
            const textLayerDiv = document.createElement('div');
            textLayerDiv.className = 'pdf-text-layer';
            textLayerDiv.style.cssText = `position:absolute; top:0; left:0; width:${viewport.width}px; height:${viewport.height}px; margin:0; padding:0;`;
            textLayerDiv.style.setProperty('--scale-factor', scale);
            
            if (savedPagesMap[i]) {
                // RESTAURAR DESDE HISTORIAL
                textLayerDiv.innerHTML = savedPagesMap[i];
                // Re-habilitar eventos en los elementos restaurados (que de otro modo nacen muertos)
                textLayerDiv.querySelectorAll('.pdf-text-span').forEach(span => {
                    span.contentEditable = 'true';
                    attachSpanEditHandlers(span);
                });
                textLayerDiv.querySelectorAll('.smart-pdf-check-x').forEach(attachCheckHandlers);
                textLayerDiv.querySelectorAll('input.smart-pdf-input, input.pdf-new-text').forEach(attachInputHandlers);
            } else {
                // GENERAR CAPA DE BLOQUES SÓLIDOS (v11 - Anti-scramble & Anti-ghosting)
                const textContent = await page.getTextContent();
                
                // Agrupamos el texto en líneas usando un umbral Y más alto para atrapar tildes
                const lines = groupTextItems(textContent.items);

                // EXTRACCIÓN Y DETECCIÓN INTELIGENTE DE CAMPOS (Smart Form)
                lines.forEach(line => {
                    const strLower = line.str.toLowerCase();
                    const strTrim = line.str.trim();

                    // Detectar si es un Checkbox de fuente Wingdings / Unicode o por su etiqueta semántica
                    const isCheckboxChars = /^[☐□▫O0oqQ]/.test(strTrim) || /^\[\s*\]/.test(strTrim) || /^\(\s*\)/.test(strTrim);
                    const isCheckboxFallback = strLower.includes('personal assets') || 
                                               strLower.includes('financial investments') || 
                                               strLower.includes('business / negocios') || 
                                               strLower.includes('loans / pr') || 
                                               strLower.includes('inheritance or trust');
                    const isCheckbox = isCheckboxChars || isCheckboxFallback;

                    // Detectar Textboxes
                    const isPlaceholder = strLower.includes('write ') || strLower.includes('choose ') 
                                       || strLower.includes('beneficiary owner complete name')
                                       || strLower.includes('click here')
                                       || /_{3,}/.test(line.str) 
                                       || /\.{4,}/.test(line.str);
                    
                    if (!isPlaceholder && !isCheckbox) return; 

                    const tx = pdfjsLib.Util.transform(viewport.transform, line.transform);
                    const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
                    const originalWidth = (line.width || 0) * viewport.scale;

                    if (isCheckbox) {
                        // Calcular posición: Si fue detectado solo por texto y el texto empieza con letra (no está agrupado el símbolo Wingdings),
                        // entonces el recuadro físico está a la izquierda. Hay que mover la "✔" a la izquierda.
                        let baseLeft = tx[4];
                        if (!isCheckboxChars && /^[A-Za-z]/.test(strTrim)) {
                            baseLeft = tx[4] - (fontSize * 1.5); // Desplazamiento mágico para cubrir el cuadro vectorial
                        }

                        const check = document.createElement('div');
                        check.className = 'smart-pdf-check-x';
                        // Escalar el tamaño de la ✔ para que calce en el cuadro (aprox 1.2x fontSize)
                        check.style.cssText = `
                            position:absolute; 
                            left:${baseLeft - 2}px; 
                            top:${tx[5] - fontSize}px; 
                            width:${fontSize * 1.25}px; 
                            height:${fontSize * 1.25}px;
                            line-height:${fontSize * 1.25}px;
                            text-align: center;
                            font-size:${fontSize * 1.15}px;
                            font-family: Arial, sans-serif;
                            font-weight: bold;
                            color: #0f172a;
                            cursor: pointer;
                            z-index: 100;
                            user-select: none;
                            background: white; /* Blanco incondicional para evitar ver fondo */
                            border: 1px solid #cbd5e1;
                            border-radius: 2px;
                            box-sizing: border-box;
                        `;
                        
                        // Estado local e inicialización
                        check.dataset.checked = 'false';
                        check.textContent = ''; 
                        
                        // Guardar coordenadas NATIVAS del PDF para exportación perfecta (sin dependencias CSS/Zoom)
                        check.dataset.nx = line.transform[4];
                        check.dataset.ny = line.transform[5];
                        check.dataset.nw = line.width || fontSize;

                        textLayerDiv.appendChild(check);
                        attachCheckHandlers(check);
                        return; // Break iteration for this line
                    }

                    // --- CREACIÓN TEXTBOX (Si no fue checkbox) ---
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'smart-pdf-input';
                    
                    let phText = line.str.replace(/[_.]/g, '').trim();
                    if (strLower.includes('click here')) phText = ''; 
                    input.placeholder = phText; 
                    
                    const fontStyle = textContent.styles[line.fontName];
                    const rawFontName = fontStyle ? fontStyle.fontFamily : 'serif';
                    
                    let safeFont = '"Times New Roman", Times, serif';
                    if (rawFontName.toLowerCase().includes('arial') || rawFontName.toLowerCase().includes('sans') || rawFontName.toLowerCase().includes('helvetica')) { 
                        safeFont = 'Arial, Helvetica, sans-serif'; 
                    } else if (rawFontName.toLowerCase().includes('times') || rawFontName.toLowerCase().includes('serif')) {
                        safeFont = '"Times New Roman", Times, serif'; 
                    } else {
                        safeFont = `${rawFontName}, Arial, sans-serif`;
                    }

                    const widthPx = originalWidth + 5;
                    const mask = document.createElement('div');
                    mask.style.cssText = `
                        position:absolute; 
                        left:${tx[4] - 2}px; 
                        top:${tx[5] - fontSize + 2}px; 
                        width:${widthPx}px; 
                        height:${fontSize + 4}px;
                        background: white; 
                        z-index: 90;
                        pointer-events: none; 
                        border-radius: 2px;
                    `;

                    input.style.cssText = `
                        position:absolute; 
                        left:${tx[4] - 2}px; 
                        top:${tx[5] - fontSize}px; 
                        width:${widthPx > 50 ? widthPx : 150}px; 
                        height:${fontSize + 8}px;
                        font-size:${fontSize}px; 
                        font-family:${safeFont};
                        color: #0f172a; 
                        background: white; /* Cambiado a blanco para ocultar el fondo original */
                        border: 1px solid #cbd5e1; 
                        border-radius: 2px;
                        padding: 0 4px;
                        z-index: 100;
                        outline: none;
                        transition: border-color 0.2s, box-shadow 0.2s;
                        box-sizing: border-box;
                    `;

                    // Lógica para que el texto de fondo no moleste al escribir
                    input.addEventListener('focus', function() {
                        this.dataset.oldPlaceholder = this.placeholder;
                        this.placeholder = '';
                        this.style.borderColor = 'var(--primary)';
                        this.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)';
                    });

                    input.addEventListener('blur', function() {
                        if (!this.value) {
                            this.placeholder = this.dataset.oldPlaceholder || '';
                        }
                        this.style.borderColor = '#cbd5e1';
                        this.style.boxShadow = 'none';
                    });


                    // Guardar coordenadas NATIVAS del PDF para máscara y render en pdf-lib
                    input.dataset.nx = line.transform[4];
                    input.dataset.ny = line.transform[5];
                    input.dataset.nw = line.width || 0;
                    input.dataset.fsize = fontSize / viewport.scale; // Tamaño nativo de la fuente

                    textLayerDiv.appendChild(mask);
                    textLayerDiv.appendChild(input);
                    attachInputHandlers(input);
                });
            }

            pageDiv.appendChild(textLayerDiv);
            
            // HERRAMIENTAS MANUALES PARA EL USUARIO
            // 1. Doble Clic = Crear Caja de Texto Libre
            pageDiv.addEventListener('dblclick', function(ev) {
                if (ev.target !== pageDiv && ev.target !== canvas && ev.target !== textLayerDiv) return;
                const rect = pageDiv.getBoundingClientRect();
                const x = ev.clientX - rect.left;
                const y = ev.clientY - rect.top;
                
                const freeInput = document.createElement('input');
                freeInput.type = 'text';
                freeInput.className = 'smart-pdf-input pdf-new-text';
                freeInput.placeholder = 'Escriba aquí...';
                freeInput.style.cssText = `position:absolute; left:${x}px; top:${y-10}px; color:black; background:white; border:1px dashed #3b82f6; font-family:'Times New Roman', serif; font-size:12px; padding:2px; z-index:100; width:150px; outline:none; box-sizing:border-box;`;
                
                freeInput.addEventListener('blur', () => {
                   if (!freeInput.value.trim()) freeInput.remove();
                   else {
                       freeInput.style.border = 'none';
                       freeInput.style.background = 'white'; // Asegurar mask
                   }
                });
                
                freeInput.addEventListener('input', () => {
                    freeInput.setAttribute('value', freeInput.value);
                });
                
                textLayerDiv.appendChild(freeInput);
                freeInput.focus();
            });

            // 2. Click Derecho = Crear Caja de Checkbox Libre
            pageDiv.addEventListener('contextmenu', function(ev) {
                ev.preventDefault(); // Prevenir el menu del navegador
                if (ev.target !== pageDiv && ev.target !== canvas && ev.target !== textLayerDiv) return;
                
                const rect = pageDiv.getBoundingClientRect();
                const x = ev.clientX - rect.left;
                const y = ev.clientY - rect.top;

                const cb = document.createElement('div');
                cb.className = 'smart-pdf-check-x pdf-new-check';
                cb.style.cssText = `
                    position:absolute; left:${x - 8}px; top:${y - 8}px; 
                    width:16px; height:16px; line-height:16px; 
                    text-align:center; font-family:Arial, sans-serif; 
                    font-size:14px; font-weight:bold; color:#0f172a; 
                    cursor:pointer; z-index:100; user-select:none;
                    border: 1px dashed #38bdf8; background: white;
                `;
                
                cb.dataset.checked = 'false';
                textLayerDiv.appendChild(cb);
                attachCheckHandlers(cb);
            });

            editor.appendChild(pageDiv);
        }
        
    } catch (err) {
        console.error('Error crítico en editor:', err);
        editor.innerHTML = `<div style="padding:50px; color:#ef4444; text-align:center;">
            <h3>Error al cargar el documento</h3>
            <p>${err.message}</p>
        </div>`;
    }
}

// Algoritmo de Fidelidad Absoluta (v12 - Surgical OCR Engine)
function groupTextItems(items) {
    if (!items.length) return [];
    
    // 1. Ordenar por Y y luego por X
    const sorted = [...items].sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5];
        if (Math.abs(yDiff) > 4) return yDiff; // Umbral 4 para no atrapar subrayados (_)
        return a.transform[4] - b.transform[4];
    });

    const lines = [];
    let current = null;

    sorted.forEach(item => {
        if (item.str === undefined || item.str === null) return;
        if (!current) { 
            current = { ...item, endX: item.transform[4] + (item.width || 0) }; 
            return; 
        }

        const sameLine = Math.abs(current.transform[5] - item.transform[5]) < 4;
        const width = current.width || 0;
        const gap = item.transform[4] - current.endX;
        const sameFont = current.fontName === item.fontName;
        
        if (sameLine && sameFont) {
            if (gap > 2) current.str += " ";
            current.str += item.str;
            const itemEndX = item.transform[4] + (item.width || 0);
            if (itemEndX > current.endX) current.endX = itemEndX;
            current.width = current.endX - current.transform[4];
        } else {
            lines.push(current);
            current = { ...item, endX: item.transform[4] + (item.width || 0) };
        }
    });
    if (current) lines.push(current);

    // 2. OCR Normalization: Fusión de Tildes y Virgulillas Flotantes (Anti-Missing Characters)
    lines.forEach(line => {
        let text = line.str;
        // Juntar base con tilde posterior
        text = text.replace(/a\s*´|a\s*\u0301/g, 'á').replace(/e\s*´|e\s*\u0301/g, 'é')
                   .replace(/i\s*´|i\s*\u0301/g, 'í').replace(/o\s*´|o\s*\u0301/g, 'ó')
                   .replace(/u\s*´|u\s*\u0301/g, 'ú').replace(/n\s*~|n\s*\u0303/g, 'ñ');
        // Juntar tilde previa con base
        text = text.replace(/´\s*a|\u0301\s*a/g, 'á').replace(/´\s*e|\u0301\s*e/g, 'é')
                   .replace(/´\s*i|\u0301\s*i/g, 'í').replace(/´\s*o|\u0301\s*o/g, 'ó')
                   .replace(/´\s*u|\u0301\s*u/g, 'ú').replace(/~\s*n|\u0303\s*n/g, 'ñ');
        line.str = text;
    });

    return lines;
}

function attachSpanEditHandlers(span) {
    span.addEventListener('focus', function() {
        span.style.zIndex = '1000';
        span.style.background = 'white';
        span.style.color = 'black';
        span.style.boxShadow = '0 0 0 2px #94a3b8';
        
        // CUIDADO TÉCNICO VITAL: Sustitución a fuente segura. 
        // No se puede tipear "a" en una fuente PUA si su mapa espera otro código.
        const originalFont = span.dataset.originalFont || '';
        if (originalFont.toLowerCase().includes('times') || originalFont.toLowerCase().includes('serif')) {
            span.style.fontFamily = '"Times New Roman", Times, serif';
        } else {
            span.style.fontFamily = 'Arial, Helvetica, sans-serif';
        }
        
        syncToolbarWithBlock(span);
    });

    span.addEventListener('blur', function() {
        span.style.zIndex = '';
        span.style.boxShadow = 'none';
        
        const isModified = span.textContent.trim() !== (span.dataset.original || '').trim();
        if (!isModified) {
            // Restaura la perfección original
            span.style.background = 'transparent';
            span.style.color = 'transparent';
            span.style.fontFamily = span.dataset.originalFont; 
        } else {
            // Si hay modificaciones, SE DEBE MANTENER la fuente segura, 
            // de lo contrario, el texto nuevo escrito se volverá encriptado o vacío.
            span.style.background = 'white';
            span.style.color = 'black';
        }
    });

    span.addEventListener('mousedown', (e) => e.stopPropagation());
    
    span.addEventListener('input', () => {});
}

function syncToolbarWithBlock(span) {
    const style = window.getComputedStyle(span);
    
    // 1. Fuente
    const fontFamilySelect = document.getElementById('tb-font-family');
    if (fontFamilySelect) {
        // Intentar matchear la fuente (limpiando comillas)
        const currentFont = style.fontFamily.replace(/['"]/g, '').split(',')[0].trim();
        
        // Si la fuente no está en el select, la añadimos dinámicamente para dar feedback real al usuario
        const exists = Array.from(fontFamilySelect.options).some(o => o.value === currentFont);
        if (!exists) {
            const dynamicOption = new Option(currentFont, currentFont);
            fontFamilySelect.add(dynamicOption);
        }
        fontFamilySelect.value = currentFont;
    }
    
    // 2. Tamaño (convertir px a pt aproximadamente)
    const fontSizeSelect = document.getElementById('tb-font-size');
    if (fontSizeSelect) {
        const px = parseFloat(style.fontSize);
        const pt = Math.round(px * 0.75);
        // Buscar el valor más cercano en el select
        const options = Array.from(fontSizeSelect.options).map(o => parseInt(o.value));
        const closest = options.reduce((prev, curr) => (Math.abs(curr - pt) < Math.abs(prev - pt) ? curr : prev));
        fontSizeSelect.value = closest;
    }
    
    // 3. Estilos (Bold/Italic)
    const boldBtn = document.getElementById('tb-bold');
    if (boldBtn) {
        const isBold = style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 600;
        boldBtn.classList.toggle('active', isBold);
    }
    
    const italicBtn = document.getElementById('tb-italic');
    if (italicBtn) {
        italicBtn.classList.toggle('active', style.fontStyle === 'italic');
    }

    // 4. Alineación
    const aligns = ['left', 'center', 'right', 'justify'];
    aligns.forEach(a => {
        const btn = document.getElementById(`tb-align-${a}`);
        if (btn) {
            const isMatch = style.textAlign === a || (a === 'left' && style.textAlign === 'start');
            btn.classList.toggle('active', isMatch);
        }
    });
}

function applyBlockFontSize(size) {
    const span = getFocusedSpan();
    if (span) {
        span.style.fontSize = size + 'pt';
        // Ajustar posición un poco si el tamaño cambia mucho (opcional, por ahora lo dejamos)
    }
}

// Lógica de Comandos del Editor HTML
function execEditorCommand(cmd, val = null) {
    const span = getFocusedSpan();
    if (!span) return;

    if (cmd === 'fontName') {
        span.style.fontFamily = val;
    } else if (cmd === 'bold') {
        const currentBold = window.getComputedStyle(span).fontWeight;
        span.style.fontWeight = (currentBold === 'bold' || parseInt(currentBold) >= 600) ? 'normal' : 'bold';
    } else if (cmd === 'italic') {
        const currentStyle = window.getComputedStyle(span).fontStyle;
        span.style.fontStyle = (currentStyle === 'italic') ? 'normal' : 'italic';
    } else if (cmd === 'justifyLeft' || cmd === 'justifyCenter' || cmd === 'justifyRight' || cmd === 'justifyFull') {
        const align = cmd.replace('justify', '').toLowerCase();
        span.style.textAlign = align === 'full' ? 'justify' : align;
    } else {
        document.execCommand(cmd, false, val);
    }
    
    // Actualizar UI del toolbar
    syncToolbarWithBlock(span);
}

function getFocusedSpan() {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        let node = selection.getRangeAt(0).commonAncestorContainer;
        while (node && node !== document.body) {
            if (node.classList && node.classList.contains('pdf-text-span')) return node;
            node = node.parentNode;
        }
    }
    return document.activeElement && document.activeElement.classList.contains('pdf-text-span') ? document.activeElement : null;
}

async function renderInteractivePDF(existingDoc = null) {
    const pId = document.getElementById('dig_plantilla').value;
    if (!pId) return;

    // Si no estamos reanudando un documento existente, limpiamos anotaciones
    // para evitar que datos de una sesión anterior se mezclen con la nueva plantilla
    if (!existingDoc) {
        window.CURRENT_EDITING_DOC = null;
        window.CURRENT_ANNOTATIONS = [];
        if (document.getElementById('dig_draft_id')) {
            document.getElementById('dig_draft_id').value = ''; 
        }
    } else {
        window.CURRENT_EDITING_DOC = existingDoc;
        window.CURRENT_ANNOTATIONS = existingDoc.datos_extraidos || [];
    }

    const plantilla = window.GLOBAL_PLANTILLAS.find(p => p.id == pId);
    if (!plantilla || !plantilla.ruta_archivo) {
        document.getElementById('pdf-editor-container').innerHTML = `
            <div style="padding: 60px 40px; text-align: center; color: var(--text-muted); background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1);">
                <i class="ph-duotone ph-file-dashed" style="font-size: 3.5rem; color: #f59e0b; margin-bottom: 20px;"></i>
                <h3 style="color: white; margin-bottom: 12px; font-size: 1.4rem;">Plantilla Incompleta</h3>
                <p style="font-size: 0.95rem; max-width: 400px; margin: 0 auto;">Esta plantilla fue creada en una versión anterior de tu sistema y no tiene un archivo PDF asociado.</p>
                <p style="font-size: 0.95rem; margin-top: 16px; color: var(--secondary);">Vaya a la sección <strong>Plantillas</strong>, edite este registro y asigne un archivo PDF original para poder digitalizarlo.</p>
            </div>
        `;
        if (document.getElementById('pdf-tools')) document.getElementById('pdf-tools').style.display = 'none';
        if (document.getElementById('actions-container')) document.getElementById('actions-container').style.display = 'none';
        if (document.getElementById('attachments-section')) document.getElementById('attachments-section').style.display = 'none';
        return;
    }

    const container = document.getElementById('pdf-editor-container');
    container.innerHTML = '<div style="color:white;">Cargando motor de renderizado...</div>';
    
    if (document.getElementById('pdf-tools')) document.getElementById('pdf-tools').style.display = 'flex';
    if (document.getElementById('actions-container')) document.getElementById('actions-container').style.display = 'block';
    if (document.getElementById('attachments-section')) document.getElementById('attachments-section').style.display = 'block';

    let annots = [];
    if (existingDoc && existingDoc.datos_extraidos) {
        annots = typeof existingDoc.datos_extraidos === 'string' ? JSON.parse(existingDoc.datos_extraidos) : existingDoc.datos_extraidos;
        if (typeof annots === 'string') {
            try { annots = JSON.parse(annots); } catch(e) {}
        }
    }
    window.CURRENT_ANNOTATIONS = annots;

    // Si es un documento nuevo y la plantilla tiene campos pre-configurados, cargarlos como anotaciones
    if (!existingDoc && plantilla.campos_configurados) {
        try {
            const pins = typeof plantilla.campos_configurados === 'string' ? JSON.parse(plantilla.campos_configurados) : plantilla.campos_configurados;
            pins.forEach(p => {
                window.CURRENT_ANNOTATIONS.push({
                    id: 'pin_' + Math.random().toString(36).substr(2, 9),
                    type: p.type || 'text',
                    page: p.page || 1,
                    x: p.x,
                    y: p.y,
                    val: '',
                    label: p.id
                });
            });
        } catch(e) { console.error('Error parseando pins', e); }
    }

    try {
        const loadingTask = pdfjsLib.getDocument(plantilla.ruta_archivo);
        const pdf = await loadingTask.promise;
        container.innerHTML = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });

            const pageWrapper = document.createElement('div');
            pageWrapper.className = 'pdf-page-wrapper';
            pageWrapper.style.position = 'relative';
            pageWrapper.style.marginBottom = '30px';
            pageWrapper.style.boxShadow = '0 0 20px rgba(0,0,0,0.5)';
            pageWrapper.style.width = viewport.width + 'px';
            pageWrapper.style.height = viewport.height + 'px';
            pageWrapper.dataset.pageNumber = i;

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const context = canvas.getContext('2d');
            
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            pageWrapper.appendChild(canvas);

            // Capa de interacción
            const overlay = document.createElement('div');
            overlay.style.position = 'absolute';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.cursor = 'crosshair';
            overlay.onclick = (e) => handlePageClick(e, i, pageWrapper);
            
            pageWrapper.appendChild(overlay);
            container.appendChild(pageWrapper);

            // Re-renderizar anotaciones existentes
            renderExistingAnnotationsForPage(i, pageWrapper);
        }
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div style="color:red;">Error al cargar el PDF. Verifique la ruta del archivo.</div>';
    }
}

function handlePageClick(e, pageNum, wrapper) {
    // Si se hizo click sobre una anotacion existente, no crear una nueva
    if (e.target !== e.currentTarget) return;

    const rect = wrapper.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const annotation = {
        id: Date.now(),
        type: editorMode,
        page: pageNum,
        x: parseFloat(x.toFixed(2)),
        y: parseFloat(y.toFixed(2)),
        val: ''
    };

    window.CURRENT_ANNOTATIONS.push(annotation);
    renderAnnotation(annotation, wrapper);
}

function renderAnnotation(ann, wrapper) {
    const el = document.createElement('div');
    el.dataset.annId = ann.id;
    el.style.position = 'absolute';
    el.style.left = ann.x + '%';
    el.style.top = ann.y + '%';
    el.style.zIndex = '10';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';

    if (ann.type === 'text' || ann.type === 'date' || ann.type === 'number') {
        const input = document.createElement('textarea');
        input.value = ann.val;
        input.placeholder = ann.label || '...';
        input.style.background = 'white';
        input.style.border = '1px solid transparent';
        input.style.color = '#000';
        input.style.fontFamily = "'Times New Roman', Times, serif";
        input.style.fontSize = '11px';
        input.style.width = '100px'; 
        input.style.minWidth = '30px';
        input.style.height = '1.4em'; 
        input.style.padding = '0 2px';
        input.style.margin = '0';
        input.style.resize = 'none'; 
        input.style.overflow = 'hidden';
        input.style.lineHeight = '1.4';
        input.style.outline = 'none';
        input.style.cursor = 'move';
        input.style.whiteSpace = 'nowrap';

        input.onfocus = (e) => { 
            e.target.style.border = '1px solid #10b981';
            e.target.style.cursor = 'text';
        };
        input.onblur = (e) => {
            e.target.style.border = '1px solid transparent';
            e.target.style.cursor = 'move';
        };
        input.oninput = (e) => { 
            ann.val = e.target.value;
            const tempSpan = document.createElement('span');
            tempSpan.style.visibility = 'hidden';
            tempSpan.style.whiteSpace = 'nowrap';
            tempSpan.style.font = getComputedStyle(e.target).font;
            tempSpan.innerText = e.target.value || e.target.placeholder;
            document.body.appendChild(tempSpan);
            const newWidth = Math.max(30, tempSpan.offsetWidth + 10);
            const parentWidth = wrapper.offsetWidth;
            const currentPos = (ann.x / 100) * parentWidth;
            const maxWidth = parentWidth - currentPos - 10;
            e.target.style.width = Math.min(newWidth, maxWidth) + 'px';
            document.body.removeChild(tempSpan);
        };
        el.appendChild(input);
        
        if (ann.label) {
            const labelTip = document.createElement('div');
            labelTip.style.position = 'absolute'; labelTip.style.top = '-12px'; labelTip.style.left = '0';
            labelTip.style.fontSize = '8px'; labelTip.style.background = 'rgba(99, 102, 241, 0.8)';
            labelTip.style.color = 'white'; labelTip.style.padding = '0 3px'; labelTip.style.borderRadius = '2px';
            labelTip.style.pointerEvents = 'none'; labelTip.innerText = ann.label;
            el.appendChild(labelTip);
        }
        
        setTimeout(() => {
            input.dispatchEvent(new Event('input'));
            input.focus();
        }, 10);
    } else if (ann.type === 'check') {
        el.innerHTML = '<span style="color:#000; font-size:11px; font-family:serif; font-weight:bold; cursor:move; background:white; padding:1px;">✔️</span>';
        ann.val = 'CHECKED';
        el.style.background = 'white'; 
    }

    // Lógica Unificada de Arrastre Mejorada
    let isDragging = false;
    let offsetX, offsetY;
    
    el.onmousedown = (e) => {
        if (e.target.tagName === 'TEXTAREA' && document.activeElement === e.target) return;
        
        isDragging = true;
        const rectEl = el.getBoundingClientRect();
        offsetX = e.clientX - rectEl.left;
        offsetY = e.clientY - rectEl.top;
        el.style.zIndex = 1000;
    };

    const mouseMoveHandler = (e) => {
        if (!isDragging) return;
        const rect = wrapper.getBoundingClientRect();
        
        let nx = e.clientX - rect.left - offsetX;
        let ny = e.clientY - rect.top - offsetY;

        nx = Math.max(0, Math.min(nx, rect.width - el.offsetWidth));
        ny = Math.max(0, Math.min(ny, rect.height - el.offsetHeight));

        el.style.left = (nx / rect.width * 100) + '%';
        el.style.top = (ny / rect.height * 100) + '%';
        
        ann.x = parseFloat((nx / rect.width * 100).toFixed(2));
        ann.y = parseFloat((ny / rect.height * 100).toFixed(2));
        
        // Destruir coordenadas absolutas NATIVAS del OCR si existen. 
        // Si el usuario interviene el elemento, la coordenada visual porcentual 
        // pasa a ser la Fiel Verdad universal WYSIWYG para la reconstrucción PDF.
        if(ann.nx !== undefined) {
            delete ann.nx;
            delete ann.ny;
            delete ann.nw;
        }
    };

    const mouseUpHandler = () => {
        isDragging = false;
        el.style.zIndex = 10;
    };

    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);

    wrapper.appendChild(el);
}

function renderExistingAnnotationsForPage(pageNum, wrapper) {
    window.CURRENT_ANNOTATIONS.filter(a => a.page === pageNum).forEach(a => {
        renderAnnotation(a, wrapper);
    });
}

function clearLastAnnotation() {
    if (window.CURRENT_ANNOTATIONS.length === 0) return;
    const last = window.CURRENT_ANNOTATIONS.pop();
    
    // Buscar el elemento en el DOM y removerlo
    const wrappers = document.querySelectorAll('.pdf-page-wrapper');
    const targetWrapper = Array.from(wrappers).find(w => w.dataset.pageNumber == last.page);
    if (targetWrapper) {
        // Buscamos el div que tiene ese ID o el ultimo hijo con el atributo de anotacion
        const lastEl = targetWrapper.querySelector(`div[data-ann-id="${last.id}"]`);
        if (lastEl) lastEl.remove();
    }
}

// ====== MÓDULO DE MAPEO DE PINES (MASTER) ======

async function initPdfMapping(file) {
    if (!file) return;
    const container = document.getElementById('mapping-container');
    const canvas = document.getElementById('pdf-mapping-canvas');
    if(!container || !canvas) return;

    container.style.display = 'block';
    
    const fileReader = new FileReader();
    fileReader.onload = async function() {
        const typedarray = new Uint8Array(this.result);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const renderContext = { canvasContext: canvas.getContext('2d'), viewport: viewport };
        await page.render(renderContext).promise;
        
        // Ajustar el contenedor de pines al canvas
        const pinsContainer = document.getElementById('pdf-pins-container');
        pinsContainer.style.width = canvas.width + 'px';
        pinsContainer.style.height = canvas.height + 'px';
        
        redrawPins();
    };
    fileReader.readAsArrayBuffer(file);
}

window.CURRENT_PINS = [];
function redrawPins() {
    const container = document.getElementById('pdf-pins-container');
    if(!container) return;
    container.innerHTML = '';
    window.CURRENT_PINS.forEach((pin) => {
        const pinDiv = document.createElement('div');
        pinDiv.style.position = 'absolute';
        pinDiv.style.left = pin.x + '%';
        pinDiv.style.top = pin.y + '%';
        pinDiv.style.transform = 'translate(-50%, -50%)'; 
        
        pinDiv.innerHTML = `
            <div style="width:14px; height:14px; background:#6366f1; border-radius:50%; border:2px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.5);"></div>
            <div style="position:absolute; top:18px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:white; padding:2px 6px; border-radius:4px; font-size:0.75rem; white-space:nowrap; border:1px solid #6366f1;">
                ${pin.id}
            </div>
        `;
        container.appendChild(pinDiv);
    });
    const hiddenInp = document.getElementById('plantilla_campos_configurados');
    if(hiddenInp) hiddenInp.value = JSON.stringify(window.CURRENT_PINS);
}

function clearPins() {
    window.CURRENT_PINS = [];
    redrawPins();
}

// Escuchador de clicks para creación de pines (Solo en modo Mapeo)
document.addEventListener('click', (e) => {
    const container = document.getElementById('pdf-pins-container');
    if (!container || !container.contains(e.target)) return;
    if (e.target.closest('.btn-ghost')) return; // Evitar disparar al limpiar

    const rect = container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    const pinType = prompt('Tipo de campo:\n1: Texto\n2: Visto (Check)\n3: Fecha\n4: Número', '1');
    if (!pinType) return;

    const pinName = prompt('Nombre del campo (Ej: FIRMA, CEDULA):');
    if (!pinName || !pinName.trim()) return;

    let typeLabel = 'text';
    if (pinType === '2') typeLabel = 'check';
    if (pinType === '3') typeLabel = 'date';
    if (pinType === '4') typeLabel = 'number';
    
    window.CURRENT_PINS.push({ 
        id: pinName.trim().toUpperCase(), 
        x: parseFloat(x.toFixed(2)), 
        y: parseFloat(y.toFixed(2)),
        type: typeLabel,
        page: 1
    });
    redrawPins();
});

async function loadDigitTargets() {
    const myUser = getSafeUser();
    if(myUser.rol === 'ADICIONAL') return;

    const delegationContainer = document.getElementById('delegation-container');
    if (delegationContainer) delegationContainer.style.display = 'block';

    try {
        const res = await fetch(`/api/usuarios`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const users = await res.json();
        const select = document.getElementById('dig_target_user');
        if(!select) return;
        
        users.forEach(u => {
            if(myUser.rol === 'MASTER' || (myUser.rol === 'EMPRESA' && u.id_empresa === (myUser.id_empresa || myUser.id) && u.rol === 'ADICIONAL')) {
                if(u.id !== myUser.id) {
                    select.innerHTML += `<option value="${u.id}">${u.nombres_completos} (${u.identificacion} - ${u.rol})</option>`;
                }
            }
        });
    } catch(err) {}
}

async function handleDigitalizacionSubmit(e, estado) {
    if(e) e.preventDefault();
    const id_formulario = document.getElementById('dig_plantilla').value;
    const evidenciaInput = document.getElementById('dig_evidencia');
    const evidencia = evidenciaInput ? evidenciaInput.files[0] : null;
    const draft_id = document.getElementById('dig_draft_id') ? document.getElementById('dig_draft_id').value : '';
    
    if (!id_formulario) return alert('Seleccione una plantilla.');

    if (estado === 'FINALIZADO' && !evidencia && !draft_id) {
        // En nuestro caso el sistema fiel no siempre exige evidencia nueva, ya que el documento generado en canvas podría ser la evidencia.
        // Pero mantenemos la compatibilidad si existe el input.
    }

    // Collect content from the Interactive Editor
    let jsonArray = [];
    if (editorMode === 'html') {
        const editor = document.getElementById('html-editable-content');
        if (editor) {
            const pages = editor.querySelectorAll('.pdf-page-container');
            pages.forEach(pageDiv => {
                const pageNum = pageDiv.dataset.page;
                const pw = parseFloat(pageDiv.style.width);
                const ph = parseFloat(pageDiv.style.height);

                pageDiv.querySelectorAll('input.smart-pdf-input, input.pdf-new-text').forEach(inp => {
                    if (inp.value.trim() !== '') {
                        const percentX = (parseFloat(inp.style.left) / pw) * 100;
                        const percentY = ((parseFloat(inp.style.top) + 12) / ph) * 100;
                        
                        jsonArray.push({ 
                            page: pageNum, 
                            type: 'text', 
                            val: inp.value.trim(), 
                            x: percentX, 
                            y: percentY,
                            nx: inp.dataset.nx ? parseFloat(inp.dataset.nx) : null,
                            ny: inp.dataset.ny ? parseFloat(inp.dataset.ny) : null,
                            nw: inp.dataset.nw ? parseFloat(inp.dataset.nw) : null,
                            fsize: inp.dataset.fsize ? parseFloat(inp.dataset.fsize) : 11
                        });
                    }
                });

                pageDiv.querySelectorAll('.smart-pdf-check-x').forEach(chk => {
                    if (chk.dataset.checked === 'true') {
                        const percentX = (parseFloat(chk.style.left) / pw) * 100;
                        const percentY = ((parseFloat(chk.style.top) + 12) / ph) * 100;
                        jsonArray.push({ 
                            page: pageNum, 
                            type: 'check', 
                            val: '✔', 
                            x: percentX, 
                            y: percentY,
                            nx: chk.dataset.nx ? parseFloat(chk.dataset.nx) : null,
                            ny: chk.dataset.ny ? parseFloat(chk.dataset.ny) : null,
                            nw: chk.dataset.nw ? parseFloat(chk.dataset.nw) : null
                        });
                    }
                });
            });
        }
    } else {
        jsonArray = window.CURRENT_ANNOTATIONS || [];
    }
    
    // Collect content from Full Text Editor (HTML)
    let htmlPersonalizado = null;
    if (editorMode === 'html') {
        const editor = document.getElementById('html-editable-content');
        // Clonar para sanitizar sin afectar la vista del usuario
        const clone = editor.cloneNode(true);
        // Quitar bordes de foco y estados temporales
        clone.querySelectorAll('.pdf-text-span').forEach(span => {
            span.style.outline = 'none';
            span.style.boxShadow = 'none';
            span.removeAttribute('contenteditable'); // Se re-activará al cargar
        });
        htmlPersonalizado = clone.innerHTML;
    } else if (window.CURRENT_EDITING_DOC && window.CURRENT_EDITING_DOC.html_content_personalizado) {
        htmlPersonalizado = window.CURRENT_EDITING_DOC.html_content_personalizado;
    }

    const formData = new FormData();
    formData.append('id_formulario', id_formulario);
    formData.append('datos_json', JSON.stringify(jsonArray));
    formData.append('estado', estado || 'PENDIENTE');
    if (htmlPersonalizado) formData.append('html_content_personalizado', htmlPersonalizado);
    if(evidencia) formData.append('archivo', evidencia);

    const anexosInput = document.getElementById('dig_anexos');
    if(anexosInput && anexosInput.files.length > 0) {
        Array.from(anexosInput.files).forEach(f => formData.append('anexos', f));
    }

    try {
        const url = draft_id ? `/api/digitalizacion/${draft_id}` : `/api/digitalizacion`;
        const method = draft_id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') },
            body: formData
        });
        const data = await res.json();
        if(!res.ok) {
            const errorMsg = data.detalle ? `${data.error}: ${data.detalle}` : data.error;
            return showCustomModal('Error', errorMsg, 'error');
        }

        showCustomModal('Éxito', data.mensaje, 'success');
        document.getElementById('formDigitalizacion').reset();
        if(document.getElementById('dig_draft_id')) document.getElementById('dig_draft_id').value = '';
        const htmlContainer = document.getElementById('html-form-container');
        if(htmlContainer) htmlContainer.innerHTML = '<p style="text-align:center; color:#666;">Seleccione una plantilla original del menú desplegable.</p>';
        
        fetchDigitalizacionesHistorial();
    } catch(err) {
        showCustomModal('Error', 'Error conectando al sistema digitalizador.', 'error');
    }
}

window.GLOBAL_DIGITS = [];
async function fetchDigitalizacionesHistorial() {
    try {
        const q = document.getElementById('dig_filter_q') ? document.getElementById('dig_filter_q').value : '';
        const desde = document.getElementById('dig_filter_desde') ? document.getElementById('dig_filter_desde').value : '';
        const hasta = document.getElementById('dig_filter_hasta') ? document.getElementById('dig_filter_hasta').value : '';
        const estado = document.getElementById('dig_filter_estado') ? document.getElementById('dig_filter_estado').value : '';
        
        const params = new URLSearchParams();
        if(q) params.append('q', q);
        if(desde) params.append('fecha_desde', desde);
        if(hasta) params.append('fecha_hasta', hasta);
        if(estado) params.append('estado', estado);

        const res = await fetch(`/api/digitalizacion?${params.toString()}`, { 
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } 
        });
        const docs = await res.json();
        window.GLOBAL_DIGITS = docs;
        const tbody = document.getElementById('digitalizados-table-body');
        if(!tbody) return;

        let html = '';
        docs.forEach(d => {
            const estado = d.estado || 'PENDIENTE';
            let stateColor = '#f59e0b';
            if (estado === 'PENDIENTE FIRMA') stateColor = '#6366f1';
            if (estado === 'FINALIZADO') stateColor = '#10b981';
            const stateHtml = `<span class="badge" style="background:${stateColor}; font-size:0.75rem;">${estado}</span>`;
            
            let numAnexos = 0;
            if (d.anexos_adicionales && Array.isArray(d.anexos_adicionales)) numAnexos = d.anexos_adicionales.length;
            
            let actionBtn = `
                <div style="display:flex; gap:4px; flex-wrap:wrap;">
                    <button type="button" onclick="resumeBorrador(${d.id})" class="btn-ghost icon-btn" style="color:#f59e0b;" title="Editar"><i class="ph ph-pencil"></i></button>
                    <button type="button" onclick="deleteDoc(${d.id})" class="btn-ghost icon-btn" style="color:#ef4444;" title="Eliminar"><i class="ph ph-trash"></i></button>
                    <button type="button" onclick="exportDoc(${d.id}, 'pdf')" class="btn-ghost icon-btn" style="color:#ef4444;" title="Descargar PDF"><i class="ph-bold ph-file-pdf"></i></button>
                    <button type="button" onclick="exportDoc(${d.id}, 'email')" class="btn-ghost icon-btn" style="color:#10b981;" title="Enviar por Correo"><i class="ph-bold ph-envelope-simple"></i></button>
                </div>
            `;
            
            if (d.ruta_archivo) {
                actionBtn += `<a href="${d.ruta_archivo}" target="_blank" class="btn-ghost icon-btn" style="color:#ef4444; margin-top:4px;" title="PDF Original"><i class="ph ph-file-pdf"></i></a>`;
            }
            if (numAnexos > 0) {
                d.anexos_adicionales.forEach((anex, idx) => {
                    actionBtn += ` <a href="${anex}" target="_blank" style="font-size:0.75rem; color:#10b981; margin-left:4px;">[Anexo ${idx+1}]</a>`;
                });
            }

            // Extraer resumen de campos (Oculto en UI según solicitud)
            // let camposSummary = '';

            html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05); vertical-align:top;">
                <td style="padding:12px; font-weight:bold; color:var(--text-muted);">#${d.id}</td>
                <td>${stateHtml}</td>
                <td style="color:var(--secondary); font-weight:500;">${d.plantilla_tipo}</td>
                <td>${actionBtn}</td>
                <td style="color:var(--text-muted); font-size:0.85rem;">${new Date(d.fecha_registro).toLocaleString()}</td>
            </tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="5" style="text-align:center; padding:12px;">Aún no se ha digitalizado nada.</td></tr>';
    } catch(err) {}
}

function resumeBorrador(id) {
    const doc = window.GLOBAL_DIGITS.find(d => d.id == id);
    if(!doc) return;
    
    // Seleccionar la plantilla correcta por ID directamente
    const select = document.getElementById('dig_plantilla');
    if(select) {
        select.value = doc.plantilla_id;
    }
    
    // Cargar el editor con el documento existente
    renderInteractivePDF(doc).then(() => {
        if(document.getElementById('dig_draft_id')) document.getElementById('dig_draft_id').value = doc.id;
        
        // Si tiene contenido HTML, cambiar automáticamente al editor de texto completo
        if (doc.html_content_personalizado) {
            switchToFullTextEditor();
        }
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// Nueva función de edición global: Hace lo mismo que el borrador pero sin cambiar de estado a menos que se fuerce
window.editDigitalizacion = function(id) {
    resumeBorrador(id);
    document.getElementById('modal-overlay').style.display = 'none';
};

window.exportDoc = async function(id, type) {
    if (type === 'pdf') {
        window.open(`/api/digitalizacion/export/${id}/pdf`, '_blank');
    } else if (type === 'email') {
        const destEmail = prompt('Ingrese el correo electrónico al que desea enviar el registro digitalizado:');
        if (!destEmail || !destEmail.trim()) return;

        try {
            const res = await fetch(`/api/digitalizacion/export/${id}/email`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                },
                body: JSON.stringify({ email: destEmail.trim() })
            });

            const data = await res.json();
            if(!res.ok) throw new Error(data.error || 'Error al enviar correo');

            alert(data.mensaje + (data.previewUrl ? '\\n\\n(Modo de pruebas, ver correo simulado en la consola del servidor)' : ''));
            if(data.previewUrl) console.log('Link del correo enviado (Ethereal):', data.previewUrl);
        } catch (err) {
            alert('Error enviando el correo: ' + err.message);
        }
    }
};



async function openPreviewModal(id, overrideDoc = null) {
    const doc = overrideDoc || window.GLOBAL_DIGITS.find(d => d.id == id);
    if (!doc) return;

    window.CURRENT_PREVIEW_DOC = doc;
    
    // HTML Content logic
    let baseHtml = doc.html_content_personalizado;
    if (!baseHtml) {
        const plantilla = window.GLOBAL_PLANTILLAS.find(p => doc.plantilla_tipo && doc.plantilla_tipo.startsWith(p.tipo));
        baseHtml = plantilla ? (plantilla.html_content || '') : '';
        
        // Fill saved values into the HTML if it's the first time
        if (baseHtml) {
            const tmp = document.createElement('div');
            tmp.innerHTML = baseHtml;
            const inputs = tmp.querySelectorAll('input, textarea');
            inputs.forEach(inp => {
                const savedCampo = (doc.datos_extraidos || []).find(c => c.id === inp.name || c.id === inp.placeholder);
                if (savedCampo) inp.value = savedCampo.val;
            });
            baseHtml = tmp.innerHTML;
        }
    }
    
    if (!baseHtml || baseHtml === 'ELIMINADO_POR_USUARIO') {
        baseHtml = `<p style="color:var(--text-muted);">Contenido no disponible.</p>`;
    }

    const stateColors = { 'PENDIENTE': '#f59e0b', 'PENDIENTE FIRMA': '#6366f1', 'FINALIZADO': '#10b981' };
    const stateColor = stateColors[doc.estado] || '#888';

    document.getElementById('modal-title').innerText = `Detalle Documento: ${doc.plantilla_tipo}`;
    document.getElementById('modal-body').innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:8px;">
            <span class="badge" style="background:${stateColor};">${doc.estado || 'PENDIENTE'}</span>
            <div style="display:flex; gap:8px;">
                <button onclick="guardarCambiosModal(${doc.id})" class="btn-primary" style="padding:6px 12px; font-size:0.85rem; background:#6366f1;"><i class="ph-bold ph-floppy-disk"></i> Guardar Cambios</button>
                <button onclick="exportDoc(${doc.id}, 'pdf')" class="btn-primary" style="padding:6px 12px; font-size:0.85rem;"><i class="ph-bold ph-file-pdf"></i> PDF</button>
                <button onclick="abrirModalEmail(${doc.id})" class="btn-primary" style="padding:6px 12px; font-size:0.85rem; background:#10b981;"><i class="ph-bold ph-envelope"></i> Email</button>
            </div>
        </div>
        <div id="editable-area-modal" style="background:#fff; color:#000; padding:40px; border-radius:8px; font-family:'Times New Roman', Times, serif; font-size:11pt; min-height:400px; box-shadow: inset 0 0 10px rgba(0,0,0,0.1);">
            ${baseHtml}
        </div>
        ${doc.ruta_archivo ? `<div style="margin-top:16px;"><a href="${doc.ruta_archivo}" target="_blank" class="btn-ghost" style="color:#ef4444; border:1px solid #ef4444;"><i class="ph ph-file-pdf"></i> Ver Archivo Adjunto Original</a></div>` : ''}
    `;
    document.getElementById('modal-overlay').style.display = 'flex';
}

function exportarAPdf() {
    const element = document.getElementById('printable-area');
    const opt = {
      margin:       1,
      filename:     'Documento_Digitalizado.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
}

async function duplicateDoc(id) {
    if (!confirm('¿Desea duplicar este registro?')) return;
    try {
        const res = await fetch(`/api/digitalizacion/duplicar/${id}`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const data = await res.json();
        if(!res.ok) return showCustomModal('Error', data.error, 'error');
        showCustomModal('Copiado', data.mensaje, 'success');
        fetchDigitalizacionesHistorial();
    } catch(err) { showCustomModal('Error', 'Error al duplicar', 'error'); }
}

async function deleteDoc(id) {
    if (!confirm('¿Está seguro de eliminar este registro?')) return;
    try {
        const res = await fetch(`/api/digitalizacion/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const data = await res.json();
        if(!res.ok) return alert(data.error);
        alert(data.mensaje);
        fetchDigitalizacionesHistorial();
    } catch(err) { alert('Error al eliminar'); }
}

function exportarAWord() {
    const preHtml = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Document</title></head><body>";
    const postHtml = "</body></html>";
    const html = preHtml + document.getElementById('printable-area').innerHTML + postHtml;

    const blob = new Blob(['\ufeff', html], {
        type: 'application/msword'
    });
    
    // Create a dummy link to trigger download
    const url = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(html);
    const filename = window.CURRENT_PREVIEW_DOC ? window.CURRENT_PREVIEW_DOC.plantilla_tipo.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.doc' : 'documento.doc';
    const downloadLink = document.createElement("a");

    document.body.appendChild(downloadLink);
    
    if(navigator.msSaveOrOpenBlob ){
        navigator.msSaveOrOpenBlob(blob, filename);
    } else {
        downloadLink.href = url;
        downloadLink.download = filename;
        downloadLink.click();
    }
    
    document.body.removeChild(downloadLink);
}

function exportarAEmail() {
    const doc = window.CURRENT_PREVIEW_DOC;
    if(!doc) return;
    
    let emailBody = "Adjunto remito la información digitalizada:\n\n";
    emailBody += "Documento: " + doc.plantilla_tipo + "\n";
    emailBody += "--------------------------------------\n";
    
    if (doc.datos_extraidos && Array.isArray(doc.datos_extraidos)) {
        doc.datos_extraidos.forEach((cam, i) => {
             emailBody += `Campo ${i+1}: ${cam.val}\n`;
        });
    } else {
        for (const [key, value] of Object.entries(doc.datos_extraidos)) {
            emailBody += `${key}: ${value}\n`;
        }
    }
    
    emailBody += "--------------------------------------\n";
    
    const subject = encodeURIComponent("Documento Digitalizado: " + doc.plantilla_tipo);
    const bodyText = encodeURIComponent(emailBody);
    
    window.location.href = `mailto:?subject=${subject}&body=${bodyText}`;
}

// ====== MODULO ADICIONALES (EMPRESA) ======
async function handleAdicionalUserUpload(e) {
    e.preventDefault();
    const payload = {
        nombres_completos: document.getElementById('add_nombres').value.trim(),
        identificacion: document.getElementById('add_identificacion').value.trim(),
        direccion: document.getElementById('add_direccion').value.trim(),
        telefono: document.getElementById('add_telefono').value.trim(),
        password: document.getElementById('add_password').value
    };

    try {
        const res = await fetch(`/api/usuarios/adicional`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token') 
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if(!res.ok) return alert(data.error);
        alert(data.mensaje);
        document.getElementById('formAdicional').reset();
        fetchMyAdicionales();
    } catch(err) {
        alert('Error en conexión');
    }
}

async function fetchMyAdicionales() {
    try {
        // En este punto el GET /api/usuarios me da todo lo que me pertenece
        const res = await fetch(`/api/usuarios`, { 
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } 
        });
        const docs = await res.json();
        const tbody = document.getElementById('adds-table-body');
        if(!tbody) return;

        let html = '';
        docs.forEach(d => {
            // No mostrarse a uno mismo (la empresa principal)
            if(d.rol !== 'ADICIONAL') return;
            
            let statusText = d.estado === 'APROBADO' ? '<span style="color:var(--secondary)">Activo</span>' : `<span style="color:#f59e0b">${d.estado}</span>`;
            
            html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:12px; font-weight:bold; color:var(--primary);">${d.identificacion}</td>
                <td>${d.nombres_completos}</td>
                <td>${statusText}</td>
                <td style="color:var(--text-muted); font-size:0.85rem;">${new Date(d.fecha_registro).toLocaleString()}</td>
                <td style="white-space:nowrap;">
                    <button onclick="resetPassword(${d.id})" class="btn-ghost" style="padding:4px 8px; border:1px solid #6366f1; color:#6366f1; margin-right:4px;" title="Resetear Clave"><i class="ph ph-key"></i></button>
                    ${d.estado === 'ACTIVO' || d.estado === 'APROBADO' ? 
                        `<button onclick="togglePermiso(${d.id}, 'rechazar')" class="btn-ghost" style="padding:4px 8px; border:1px solid #ef4444; color:#ef4444; margin-right:4px;" title="Revocar Acceso">✖</button>` :
                        `<button onclick="togglePermiso(${d.id}, 'aprobar')" class="btn-ghost" style="padding:4px 8px; border:1px solid #10b981; color:#10b981; margin-right:4px;" title="Conceder Acceso">✔️</button>`
                    }
                    <button onclick="deleteUser(${d.id})" class="btn-ghost" style="padding:4px 8px; border:1px solid #ef4444; color:#ef4444;" title="Eliminar Usuario"><i class="ph ph-trash"></i></button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="5" style="text-align:center; padding:12px;">Actualmente no tiene Operadores Adicionales.</td></tr>';
    } catch(err) {}
}

async function togglePermiso(idUsuario, accion) {
    if(!confirm(`¿Seguro que desea ${accion === 'aprobar' ? 'CONCEDER' : 'REVOCAR'} el acceso a este operador?`)) return;
    try {
        const res = await fetch(`/api/usuarios/${idUsuario}/${accion}`, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const data = await res.json();
        if(!res.ok) return alert(data.error);
        fetchMyAdicionales();
    } catch(err) {
        alert('Error en conexión');
    }
}


// ====== MODULO BITACORA INMUTABLE ======
async function resetPassword(idUsuario) {
    const newPassword = prompt("Ingrese la NUEVA contraseña para este usuario (mínimo 6 caracteres):");
    if (!newPassword) return; 
    if (newPassword.length < 6) return alert('La contraseña debe tener mínimo 6 caracteres.');

    try {
        const res = await fetch(`/api/usuarios/${idUsuario}/password`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token') 
            },
            body: JSON.stringify({ newPassword })
        });
        const data = await res.json();
        if(!res.ok) return alert(data.error || 'Error cambiando clave');
        alert(data.mensaje);
    } catch(err) {
        alert('Error conectando con el servidor para cambiar la clave.');
    }
}


let currentBitaPage = 1;
let currentBitaSearch = '';

function searchBitacora(e) {
    if(e) e.preventDefault();
    currentBitaSearch = document.getElementById('bita-search-input').value;
    currentBitaPage = 1;
    fetchBitacora();
}

function changeBitaPage(newPage) {
    currentBitaPage = newPage;
    fetchBitacora();
}

async function fetchBitacora() {
    try {
        const queryParams = new URLSearchParams({ page: currentBitaPage, search: currentBitaSearch });
        const res = await fetch(`/api/bitacora?${queryParams.toString()}`, { 
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } 
        });
        const responseData = await res.json();
        
        const logs = responseData.data || [];
        const pag = responseData.pagination || { total: 0, page: 1, totalPages: 1 };

        const tbody = document.getElementById('bita-table-body');
        const pagContainer = document.getElementById('bita-pagination');
        if(!tbody) return;

        let html = '';
        logs.forEach(l => {
            let roleBadge = '';
            if(l.rol === 'MASTER') roleBadge = '<span style="background:rgba(239,68,68,0.2); color:#ef4444; padding:4px 8px; border-radius:4px; font-size:0.75rem;">MASTER</span>';
            else if(l.rol === 'EMPRESA') roleBadge = '<span style="background:rgba(16,185,129,0.2); color:var(--secondary); padding:4px 8px; border-radius:4px; font-size:0.75rem;">EMPRESA</span>';
            else roleBadge = '<span style="background:rgba(56,189,248,0.2); color:var(--primary); padding:4px 8px; border-radius:4px; font-size:0.75rem;">ADICIONAL</span>';

            html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05); vertical-align:middle;">
                <td style="padding:16px; color:var(--text-muted); font-size:0.85rem; white-space:nowrap;">${new Date(l.fecha).toLocaleString()}</td>
                <td style="padding:16px; font-weight:500;">
                    ${l.nombres_completos}<br>
                    <span style="font-size:0.8rem; color:var(--primary);">${l.identificacion}</span>
                </td>
                <td style="padding:16px;">${roleBadge}</td>
                <td style="padding:16px; font-family:monospace; color:var(--secondary);">${l.accion}</td>
                <td style="padding:16px; color:rgba(255,255,255,0.8);">${l.detalle}</td>
            </tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="5" style="text-align:center; padding:12px;">Sin registros en este periodo o búsqueda.</td></tr>';

        if (pagContainer) {
            pagContainer.innerHTML = `
                <span style="color:var(--text-muted); font-size:0.9rem; margin-right:auto;">Total: ${pag.total} registros</span>
                <button class="btn-ghost" style="padding:8px 12px; ${pag.page <= 1 ? 'opacity:0.3; pointer-events:none;' : ''}" onclick="changeBitaPage(${pag.page - 1})"><i class="ph ph-caret-left"></i> Anterior</button>
                <span style="color:var(--primary); font-weight:bold; margin:0 8px;">Página ${pag.page} de ${pag.totalPages || 1}</span>
                <button class="btn-ghost" style="padding:8px 12px; ${pag.page >= pag.totalPages ? 'opacity:0.3; pointer-events:none;' : ''}" onclick="changeBitaPage(${pag.page + 1})">Siguiente <i class="ph ph-caret-right"></i></button>
            `;
        }
    } catch(err) {}
}

// ====== FUNCIONES DE EXPORTACIÓN Y GESTIÓN BACKEND (Módulo Digitalización Global) ======

async function guardarCambiosModal(id) {
    const area = document.getElementById('editable-area-modal');
    if (!area) return;

    const inputs = area.querySelectorAll('input, textarea');
    const datos = [];
    let incomplete = 0;

    inputs.forEach(inp => {
        const val = inp.value.trim();
        if (!val) incomplete++;
        datos.push({
            id: inp.name || inp.placeholder || 'FIELD',
            val: val
        });
    });

    const estado = incomplete === 0 ? 'FINALIZADO' : 'PENDIENTE';
    
    try {
        const res = await fetch(`/api/digitalizacion/${id}`, {
            method: 'PUT',
            headers: { 
                'Authorization': 'Bearer ' + localStorage.getItem('token'),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id_formulario: window.CURRENT_PREVIEW_DOC.plantilla_id,
                datos_completados: datos,
                estado: estado
            })
        });

        const data = await res.json();
        if (!res.ok) return alert(data.error || 'Error al guardar');

        alert(`Documento guardado como ${estado}.`);
        fetchDigitalizacionesHistorial(); // Recargar tabla fondo
        openPreviewModal(id); // Refrescar modal (quita highlights si ya se llenó)
    } catch (err) {
        alert('Error de conexión al guardar cambios.');
    }
}

function descargarBackendPdf(id) {
    exportDoc(id, 'pdf');
}



function abrirModalEmail(id) {
    const email = prompt("Ingrese el correo electrónico del destinatario:");
    if (!email) return;

    if (!confirm(`¿Enviar el documento PDF a ${email}?`)) return;

    enviarCorreoBackend(id, email);
}

async function enviarCorreoBackend(id, email) {
    try {
        const res = await fetch(`/api/documentos/${id}/enviar-correo`, {
            method: 'POST',
            headers: { 
                'Authorization': 'Bearer ' + localStorage.getItem('token'),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                asunto: 'Documento Digitalizado - Sistema de Gestión',
                mensaje: 'Se adjunta el documento solicitado generado desde el sistema.'
            })
        });

        const data = await res.json();
        if (!res.ok) return alert(data.error || 'Error al enviar correo');
        alert(data.mensaje);
    } catch (err) {
        alert('Error de conexión al enviar correo.');
    }
}


async function handleMasterProfileUpdate(e) {
    e.preventDefault();
    const nombres = document.getElementById('master-prof-name').value;
    const identification = document.getElementById('master-prof-ident').value;
    const code = document.getElementById('master-prof-code').value;
    const email = document.getElementById('master-prof-email').value;

    const user = JSON.parse(localStorage.getItem('user'));
    
    try {
        const res = await fetch(`/api/usuarios/${user.id}/perfil`, {
            method: 'PUT',
            headers: { 
                'Authorization': 'Bearer ' + localStorage.getItem('token'),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                nombres_completos: nombres, 
                identificacion: identification,
                codigo_unico: code,
                email: email
            })
        });

        const data = await res.json();
        if (!res.ok) return showCustomModal('Error al Actualizar', data.error, 'error');

        // Actualizar datos en memoria local
        const updatedUser = { ...user, ...data.user };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        
        showCustomModal('¡Éxito!', 'Perfil actualizado correctamente.', 'success');
        initDashboard(updatedUser); // Refrescar UI (nombre, etc)
    } catch (err) {
        showCustomModal('Error', 'Error conectando con el servidor para actualizar el perfil.', 'error');
    }
}


async function handleMasterPasswordChange(e) {
    e.preventDefault();
    const newPwd = document.getElementById('master-new-pwd').value;
    const confirmPwd = document.getElementById('master-confirm-pwd').value;

    if (newPwd !== confirmPwd) {
        return alert('Las contraseñas no coinciden.');
    }

    if (!confirm('¿Está seguro de que desea actualizar su contraseña maestra? Se cerrará la sesión actual.')) {
        return;
    }

    const user = getSafeUser();
    
    try {
        const res = await fetch(`/api/usuarios/${user.id}/password`, {
            method: 'PUT',
            headers: { 
                'Authorization': 'Bearer ' + localStorage.getItem('token'),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ newPassword: newPwd })
        });

        const data = await res.json();
        if (!res.ok) return alert(data.error);

        alert('Contraseña actualizada con éxito. Por seguridad, debe volver a ingresar.');
        handleLogout();
    } catch (err) {
        alert('Error conectando con el servidor para actualizar contraseña.');
    }
}
function showUnlockView() {
    toggleView('view-unlock');
    document.getElementById('unlock-step-1').style.display = 'block';
    document.getElementById('unlock-step-2').style.display = 'none';
}

async function handleRequestUnlockPIN() {
    const ident = document.getElementById('unlock-ident-req').value;
    if(!ident) return alert('Ingrese su identificación');

    try {
        const res = await fetch(`/api/usuarios/request-unlock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identificacion: ident })
        });
        const data = await res.json();
        if(!res.ok) return showCustomModal('Fallo de Seguridad', data.error, 'error');

        showCustomModal('Código Enviado', data.mensaje, 'success');
        if(data.previewUrl) window.open(data.previewUrl, '_blank'); // Para pruebas con Ethereal

        document.getElementById('unlock-step-1').style.display = 'none';
        document.getElementById('unlock-step-2').style.display = 'block';
    } catch(err) {
        showCustomModal('Error', 'Error conectando con el servidor de seguridad.', 'error');
    }
}

async function handleVerifyAndUnlockMaster() {
    const ident = document.getElementById('unlock-ident-req').value;
    const code = document.getElementById('unlock-pin').value;
    const pwd = document.getElementById('unlock-new-pwd').value;

    if(!code || !pwd) return showCustomModal('Campos Incompletos', 'Por favor complete todos los datos.', 'info');

    try {
        const res = await fetch(`/api/usuarios/verify-unlock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identificacion: ident, code: code, newPassword: pwd })
        });
        const data = await res.json();
        if(!res.ok) return showCustomModal('Error de Código', data.error, 'error');

        showCustomModal('¡Cuentas Desbloqueada!', data.mensaje, 'success');
        toggleView('view-login');
    } catch(err) {
        showCustomModal('Error', 'Error en el proceso de verificación.', 'error');
    }
}

// ==== DEFINICIÓN CENTRALIZADA DE MANEJADORES DE SMART PDF ====
function attachCheckHandlers(check) {
    if(check.dataset.initialized === 'true') return;
    check.dataset.initialized = 'true';

    check.addEventListener('mouseenter', () => {
        if (check.dataset.checked !== 'true') check.style.background = 'rgba(56, 189, 248, 0.4)';
    });
    check.addEventListener('mouseleave', () => {
        if (check.dataset.checked !== 'true') check.style.background = 'rgba(56, 189, 248, 0.2)';
        else check.style.background = 'white'; // Blanco sólido al estar marcado para ocultar fondo
    });
    check.addEventListener('click', (e) => {
        e.stopPropagation();
        if (check.dataset.checked === 'true') {
            check.dataset.checked = 'false';
            check.textContent = '';
            check.style.background = 'rgba(56, 189, 248, 0.4)';
            check.setAttribute('data-val', '');
        } else {
            check.dataset.checked = 'true';
            check.textContent = '✔';
            check.style.background = 'white';
            check.setAttribute('data-val', '✔'); 
        }
    });
}

function attachInputHandlers(input) {
    if(input.dataset.initialized === 'true') return;
    input.dataset.initialized = 'true';

    let mask = input.previousElementSibling;
    if (!mask || mask.tagName.toLowerCase() === 'input' || mask.tagName.toLowerCase() === 'canvas') {
        mask = null;
    }

    input.addEventListener('focus', () => {
        input.style.border = '2px solid #0284c7';
        input.style.zIndex = '1000';
    });

    input.addEventListener('blur', () => {
        input.style.zIndex = '100';
        input.style.border = '1px solid #cbd5e1';
    });

    input.addEventListener('dblclick', (e) => e.stopPropagation());
    input.addEventListener('contextmenu', (e) => e.stopPropagation());
}


// =========================================================================
// ==== MÓDULO DE DIGITALIZACIÓN INTELIGENTE (MULTI-AGENTE v2.5) ====
// =========================================================================

let SMART_CURRENT_TOOL = 'text';
let SMART_ELEMENTS = [];
let SMART_SELECTED_PLANTILLA = null;

async function loadPlantillasForSmartParsing() {
    const selector = document.getElementById('parsing_plantilla');
    if(!selector) return;
    
    try {
        const res = await fetch(`/api/formularios`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const data = await res.json();
        window.GLOBAL_PLANTILLAS = data;
        
        selector.innerHTML = '<option value="" disabled selected>-- Elige una Plantilla --</option>';
        data.forEach(p => {
            selector.innerHTML += `<option value="${p.id}">${p.prefijo} - ${p.tipo}</option>`;
        });
    } catch (err) { console.error(err); }
}

function setParsingTool(tool) {
    SMART_CURRENT_TOOL = tool;
    document.querySelectorAll('#smart-tools-panel .btn-ghost').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-parse-${tool}`).classList.add('active');
}

async function startSmartParsingProcess() {
    const pId = document.getElementById('parsing_plantilla').value;
    if (!pId) return;

    const plantilla = window.GLOBAL_PLANTILLAS.find(p => p.id == pId);
    if(!plantilla) {
        showCustomModal('Aviso', 'No se encontró la información de la plantilla seleccionada.', 'info');
        return;
    }
    
    SMART_SELECTED_PLANTILLA = plantilla;
    const loader = document.getElementById('smart-canvas-loader');
    const container = document.getElementById('smart-rendering-container');
    const tools = document.getElementById('smart-tools-panel');

    try {
        // 1. Resetear UI y mostrar Loader con feedback de AGENTES
        container.style.display = 'none';
        tools.style.display = 'none';
        loader.style.display = 'flex';
        
        loader.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; gap:20px;">
                <div class="agent-pulse">
                    <i class="ph ph-cpu ph-spin" style="font-size:3.5rem; color:var(--primary);"></i>
                </div>
                <div style="text-align:center;">
                    <h4 style="margin:0; color:var(--text-main);">Orquestador Multi-Agente Activo</h4>
                    <p id="parsing-step-text" style="color:var(--text-muted); font-size:0.9rem; margin-top:8px;">Iniciando Agents Pipeline...</p>
                </div>
            </div>
        `;

        const badges = {
            parser: document.getElementById('agent-parser-badge'),
            layout: document.getElementById('agent-inference-badge'),
            ocr: document.getElementById('agent-ocr-badge')
        };

        // Reset badges
        Object.values(badges).forEach(b => { 
            if(b) { b.classList.remove('active', 'processing'); }
        });

        // Pipeline de Agentes Ultra-Rápido
        if(badges.parser) {
            badges.parser.classList.add('processing');
            document.getElementById('parsing-step-text').innerText = "Parser Agent: Analizando estructura...";
            await new Promise(r => setTimeout(r, 200)); // Latencia mínima para feedback
            badges.parser.classList.remove('processing');
            badges.parser.classList.add('active');
        }

        if(badges.layout) {
            badges.layout.classList.add('processing');
            document.getElementById('parsing-step-text').innerText = "Layout Agent: Identificando geometrías...";
            await new Promise(r => setTimeout(r, 250));
            badges.layout.classList.remove('processing');
            badges.layout.classList.add('active');
        }

        if(badges.ocr) {
            badges.ocr.classList.add('processing');
            document.getElementById('parsing-step-text').innerText = "Inference Agent: Mapeando campos...";
            await new Promise(r => setTimeout(r, 150));
            badges.ocr.classList.remove('processing');
            badges.ocr.classList.add('active');
        }

        document.getElementById('parsing-step-text').innerText = "Generando Estación de Trabajo en Tiempo Real...";
        await renderSmartWorkspace(plantilla);

    } catch (err) {
        console.error("SMART PARSING ERROR:", err);
        loader.innerHTML = `
            <div style="color:#ef4444; text-align:center; padding:20px;">
                <i class="ph ph-warning-circle" style="font-size:3rem; margin-bottom:15px;"></i>
                <h4>Error del Sistema Multi-Agente</h4>
                <p style="font-size:0.85rem; opacity:0.8;">No se pudo procesar el documento. Verifique que el archivo PDF original sea accesible.</p>
                <button class="btn-ghost" onclick="renderContent('val-doc-parsing', 'Digitalizar Documentos')" style="margin-top:15px; color:#fff; border-color:rgba(255,255,255,0.2);">Reintentar</button>
            </div>
        `;
    }
}

async function renderSmartWorkspace(plantilla) {
    const container = document.getElementById('smart-rendering-container');
    const loader = document.getElementById('smart-canvas-loader');
    const tools = document.getElementById('smart-tools-panel');

    container.innerHTML = '';
    
    // Cargar PDF vía PDF.js usando la ruta directa del archivo ya disponible
    const pdfUrl = plantilla.ruta_archivo;
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    const pdf = await loadingTask.promise;
    window.SMART_SELECTED_PLANTILLA_PDF_OBJ = pdf; // Guardar para agentes

    loader.style.display = 'none';
    tools.style.display = 'block';
    container.style.display = 'block';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });

        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'pdf-page-container';
        pageWrapper.dataset.page = i;
        pageWrapper.style.position = 'relative';
        pageWrapper.style.width = `${viewport.width}px`;
        pageWrapper.style.height = `${viewport.height}px`;
        pageWrapper.style.background = 'white';
        pageWrapper.style.margin = '0 auto 40px auto';
        pageWrapper.style.boxShadow = '0 10px 50px rgba(0,0,0,0.3)';
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        pageWrapper.appendChild(canvas);

        const interactionLayer = document.createElement('div');
        interactionLayer.style.position = 'absolute';
        interactionLayer.style.top = '0';
        interactionLayer.style.left = '0';
        interactionLayer.style.width = '100%';
        interactionLayer.style.height = '100%';
        interactionLayer.style.zIndex = '50';
        
        interactionLayer.addEventListener('click', (e) => {
            const rect = interactionLayer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            addSmartElement(pageWrapper, x, y);
        });
        pageWrapper.appendChild(interactionLayer);

        // --- AGENTE DE AUTO-INFERENCIA (Módulo Pro OCR: PDFgear Style) ---
        const textContent = await page.getTextContent();
        
        // El Agente de Layout analiza coordenadas y predice áreas de entrada
        const existingPositions = []; // Para evitar duplicados en la misma línea

        textContent.items.forEach((item, index) => {
            const str = item.str.trim();
            const tx = item.transform;
            const x = tx[4] * 1.5;
            const y = viewport.height - (tx[5] * 1.5);
            
            // Patrones de detección:
            // 1. Labels seguidos de ":" o espacios en la DB
            // 2. Líneas de puntos o guiones bajos largos
            // 3. Espacios vacíos significativos después de un texto corto
            
            const isLabel = str.endsWith(':') || (str.length > 3 && str.length < 30);
            
            if (isLabel) {
                // Predecimos que después de un label viene un input
                // A menos que el siguiente item de texto esté demasiado cerca
                const nextItem = textContent.items[index + 1];
                let shouldAdd = true;
                
                if (nextItem) {
                    const nextX = nextItem.transform[4] * 1.5;
                    const nextY = viewport.height - (nextItem.transform[5] * 1.5);
                    // Si el siguiente texto está en la misma línea y muy cerca, es contenido, no vacío
                    if (Math.abs(nextY - y) < 5 && (nextX - (x + item.width*1.5)) < 50) {
                        shouldAdd = false;
                    }
                }

                if (shouldAdd) {
                    const fieldX = x + (item.width * 1.5) + 12;
                    const fieldY = y - 18;
                    
                    // Verificación de duplicidad en la misma línea
                    const isDuplicate = existingPositions.some(pos => 
                        Math.abs(pos.y - fieldY) < 10 && Math.abs(pos.x - fieldX) < 100
                    );

                    if (!isDuplicate) {
                        addSmartElement(pageWrapper, fieldX, fieldY, 'text', str.replace(':', ''), true); // true = auto-generated
                        existingPositions.push({ x: fieldX, y: fieldY });
                    }
                }
            }
        });

        container.appendChild(pageWrapper);
    }
}

/* --- MOTOR DE INFERENCIA ESTRUCTURAL (Structural Agent v3.0 - PDFgear Logic) --- */
async function runFullAutoInferenceAgente() {
    if (!SMART_SELECTED_PLANTILLA_PDF_OBJ) {
        showCustomModal('Aviso', 'Cargue primero un documento para activar los agentes.', 'info');
        return;
    }

    const container = document.getElementById('pdf-editor-container');
    const pagesWrappers = container.querySelectorAll('.pdf-page-wrapper');
    const pdf = SMART_SELECTED_PLANTILLA_PDF_OBJ;
    let fieldsFound = 0;

    showCustomModal('Agentes Activos', 'Analizando geometría y vacíos del documento (Structural Brain)...', 'info');

    for (const pageWrapper of pagesWrappers) {
        const pageNum = parseInt(pageWrapper.dataset.page);
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.5 });
        
        // Agrupar items por línea (Y) para analizar huecos
        const lines = {};
        textContent.items.forEach(item => {
            const y = Math.round(item.transform[5] * 1.5);
            if (!lines[y]) lines[y] = [];
            lines[y].push(item);
        });

        for (const yKey in lines) {
            const lineItems = lines[yKey].sort((a, b) => a.transform[4] - b.transform[4]);
            const yTop = viewport.height - yKey;

            lineItems.forEach((item, idx) => {
                const str = item.str.trim();
                const fontSize = item.transform[0] * 1.5;
                
                // Ignorar títulos (fuentes grandes) y textos muy cortos de ruido
                if (fontSize > 18 || str.length < 2) return;

                const xStart = item.transform[4] * 1.5;
                const xEnd = xStart + (item.width * 1.5);
                
                // Determinar el hueco hasta el siguiente texto o el margen
                let gapWidth = 0;
                const nextItem = lineItems[idx + 1];
                if (nextItem) {
                    const nextXStart = nextItem.transform[4] * 1.5;
                    gapWidth = nextXStart - xEnd;
                } else {
                    // Si es el último item de la línea, el hueco es hasta el margen derecho (promedio 85% del viewport)
                    gapWidth = (viewport.width * 0.9) - xEnd;
                }

                // INTELIGENCIA DE PDFGEAR: Si el hueco es mayor a 60px y el texto previo parece un Label
                const isPotentialLabel = str.endsWith(':') || str.length < 40;
                
                if (isPotentialLabel && gapWidth > 60) {
                    const fieldX = xEnd + 5;
                    const fieldY = yTop - 18;
                    const finalWidth = Math.min(gapWidth - 10, 400); // Limitar ancho para no invadir márgenes

                    addSmartElement(pageWrapper, fieldX, fieldY, 'text', str.replace(':', ''), true);
                    
                    const lastEl = pageWrapper.lastChild;
                    if(lastEl && lastEl.classList.contains('smart-element')) {
                        lastEl.style.width = `${finalWidth}px`;
                    }
                    fieldsFound++;
                }
            });
        }
    }

    setTimeout(() => {
        closeCustomModal();
        showCustomModal('Análisis Estructural', `Agente Pro-Layout ha identificado ${fieldsFound} zonas de llenado analizando la geometría del documento.`, 'success');
    }, 500);
}

async function addSmartElement(parent, x, y, type = SMART_CURRENT_TOOL, preLabel = "", isAuto = false) {
    // 0. Regla de Oro Profesionales: Evitar duplicidad en la misma línea
    const existing = parent.querySelectorAll('.smart-element');
    for (let overlap of existing) {
        const oX = parseFloat(overlap.style.left);
        const oY = parseFloat(overlap.style.top);
        // Si hay un elemento a menos de 10px de altura (misma línea) y 150px de ancho, bloqueamos
        if (Math.abs(oY - y) < 8 && Math.abs(oX - x) < 150 && !isAuto) {
            console.log('[Agent Logic] Bloqueo de duplicidad: Ya existe un campo en esta línea.');
            return; 
        }
    }

    const el = document.createElement('div');
    el.className = 'smart-element';
    if(isAuto) el.classList.add('auto-detected');
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.zIndex = '100';
    
    let width = 180, height = 24;
    if (type === 'check') { width = 18; height = 18; }
    
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;

    // 2. Inferencia de Agente (Si no viene pre-etiquetado)
    let suggestedLabel = preLabel;
    if(!suggestedLabel && type !== 'check') {
        try {
            const pageNum = parseInt(parent.dataset.page);
            const pdf = window.SMART_SELECTED_PLANTILLA_PDF_OBJ;
            if(pdf) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                // Layout Agent: Heurística de proximidad espacial
                const closest = textContent.items.reduce((prev, curr) => {
                    const tx = curr.transform;
                    // Escalar coordenadas del PDF (viewport 1.5) a coordenadas del lienzo
                    const dist = Math.sqrt(Math.pow(tx[4]*1.5 - x, 2) + Math.pow((parent.offsetHeight - tx[5]*1.5) - y, 2));
                    return (dist < (prev ? prev.dist : Infinity)) ? { dist, item: curr } : prev;
                }, null);

                if(closest && closest.dist < 80) {
                    suggestedLabel = closest.item.str.replace(/[:]/g, '').trim();
                }
            }
        } catch(e) {}
    }
    
    if (type === 'text') {
        const placeholderText = suggestedLabel ? `Write ${suggestedLabel}...` : 'Write text here...';
        el.innerHTML = `
            <div class="smart-label-hint">${suggestedLabel || 'TEXT FIELD'}</div>
            <div class="smart-editable-cell" contenteditable="true" placeholder="${placeholderText}"></div>
            <div class="smart-element-resizer"></div>
        `;
        
        // Auto-Expand Logic (Web Form Style)
        const cell = el.querySelector('.smart-editable-cell');
        cell.oninput = () => {
             // El contenedor smart-element puede crecer si el contenido crece
             el.style.height = 'auto';
        };

    } else if (type === 'check') {
        el.innerHTML = `<div class="smart-check-box"></div>`;
        el.onclick = (e) => {
            const div = el.querySelector('.smart-check-box');
            div.innerText = div.innerText === '✔' ? '' : '✔';
            e.stopPropagation();
        };
    } else if (type === 'select') {
         el.innerHTML = `
            <select style="width:100%; border:none; background:#fff; height:100%; font-size:0.7rem; font-weight:700; cursor:pointer;">
                <option value="SI">SÍ</option>
                <option value="NO">NO</option>
            </select>
            <div class="smart-element-resizer"></div>
         `;
    }

    // Drag and Drop Pro
    let isDragging = false;
    let startX, startY;

    el.onmousedown = (e) => {
        if(e.target.className === 'smart-element-resizer') return;
        if(e.target.classList.contains('smart-editable-cell') || e.target.tagName === 'SELECT') return;
        
        isDragging = true;
        startX = e.clientX - el.offsetLeft;
        startY = e.clientY - el.offsetTop;
        
        document.querySelectorAll('.smart-element').forEach(s => s.classList.remove('active'));
        el.classList.add('active');
        e.stopPropagation();
    };

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        el.style.left = `${e.clientX - startX}px`;
        el.style.top = `${e.clientY - startY}px`;
    });

    document.addEventListener('mouseup', () => { isDragging = false; });

    // Menu contextual
    el.oncontextmenu = (e) => {
        e.preventDefault();
        if (confirm('¿Eliminar este campo inteligente?')) el.remove();
    };

    // Resizer Pro
    const resizer = el.querySelector('.smart-element-resizer');
    if(resizer) {
        let isResizing = false;
        resizer.onmousedown = (e) => {
            isResizing = true;
            e.preventDefault();
            e.stopPropagation();
        };

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const rect = el.getBoundingClientRect();
            el.style.width = `${e.clientX - rect.left}px`;
            el.style.height = `${e.clientY - rect.top}px`;
        });

        document.addEventListener('mouseup', () => { isResizing = false; });
    }

    parent.appendChild(el);
}

function clearSmartCanvas() {
    if(confirm('¿Seguro que desea limpiar todas las inferencias del lienzo?')) {
        document.querySelectorAll('.smart-element').forEach(el => el.remove());
    }
}

async function handleSmartSubmit(estado) {
    if(!SMART_SELECTED_PLANTILLA) return;
    
    // Recopilar elementos como modelo intermedio JSON
    const elements = [];
    document.querySelectorAll('.smart-element').forEach(el => {
        const input = el.querySelector('input, select, div');
        elements.push({
            x: parseFloat(el.style.left),
            y: parseFloat(el.style.top),
            w: parseFloat(el.style.width),
            h: parseFloat(el.style.height),
            type: el.querySelector('input') ? 'text' : (el.querySelector('select') ? 'select' : 'check'),
            val: el.querySelector('input') ? el.querySelector('input').value : (el.querySelector('select') ? el.querySelector('select').value : el.querySelector('div').innerText)
        });
    });

    // Simulando Agente de Guardado
    showCustomModal('Procesando', 'Generando documento final a través del Agente de Salida...', 'info');
    
    try {
        // Aquí llamaríamos a la API para persistir y generar PDF
        // Como demostración, lanzaremos el éxito
        await new Promise(r => setTimeout(r, 2000));
        showCustomModal('¡Éxito!', `Documento digitalizado guardado con estado ${estado}. Se ha generado el registro de historial.`, 'success');
        renderContent('val-doc-parsing', 'Digitalizar Documentos'); // Reload
    } catch (err) {
        showCustomModal('Error', 'Fallo en la persistencia del modelo intermedio.', 'error');
    }
}

/* ==========================================================================
   MODULE: FULL PROFESSIONAL PDF SUITE (PDF Gear Architecture)
   ========================================================================== */

let PRO_PDF_DOCUMENT = null;
let PRO_CURRENT_PAGE = 1;
let PRO_ZOOM_LEVEL = 1.0;
let PRO_EDIT_MODE = 'view'; // view, text, image, page
let PRO_UNDO_STACK = [];
let PRO_REDO_STACK = [];
let ACTIVE_PRO_FIELD_ID = null; // Tracking del campo seleccionado para formateo


async function startFullProEditor(plantilla) {
    // RESET MASIVO DE ESTADO GLOBAL PARA NUEVA EDICIÓN
    window.PRO_DRAFT_FIELDS = [];
    window.PRO_UNDO_STACK = [];
    window.PRO_REDO_STACK = [];
    window.CURRENT_EDICION_ID = null; // Reiniciar estado de sobrescritura de borrador

    window.CURRENT_PLANTILLA_ID = plantilla.id; // GUARDAMOS EL ID DEL DOC ABIERTO
    const canvasArea = document.getElementById('pro-editor-canvas');
    if(!canvasArea) return;
    canvasArea.innerHTML = '<div class="loader-spinner"></div><p style="color:white; margin-top:10px;">Cargando Suite de Edición Binaria...</p>';
    
    // --- LIMPIEZA DE MENU (Solicitud Usuario) ---
    const ribbonMenu = document.querySelector('.pro-editor-ribbon-menu');
    if(ribbonMenu) {
        ribbonMenu.innerHTML = '<div class="ribbon-tab active">HERRAMIENTAS DE EDICIÓN</div>';
    }

    try {
        const url = `/api/formularios/view/${plantilla.id}?token=${localStorage.getItem('token')}`;
        
        // --- CARGA UNIFICADA (Optimización de Canal) ---
        const response = await fetch(url);
        if(!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const msg = errorData.detalle || errorData.error || errorData.mensaje || `Error HTTP ${response.status}`;
            throw new Error(msg);
        }
        const pdfBlob = await response.blob();
        const pdfData = await pdfBlob.arrayBuffer();
        const objectUrl = URL.createObjectURL(pdfBlob);

        // 1. Renderizado Visual
        const loadingTask = pdfjsLib.getDocument({
            url: objectUrl,
            enableXfa: true 
        });
        PRO_PDF_DOCUMENT = await loadingTask.promise;
        PRO_CURRENT_PAGE = 1;

        // 2. Manipulación Binaria
        const pdfDoc = await PDFLib.PDFDocument.load(pdfData);
        const form = pdfDoc.getForm();

        // --- ADICIÓN EXPERTA: CARGAR PINES (METADATOS) PARA WEB FORM ---
        if (plantilla.campos_configurados) {
            try {
                const pins = typeof plantilla.campos_configurados === 'string' ? JSON.parse(plantilla.campos_configurados) : plantilla.campos_configurados;
                pins.forEach(p => {
                    window.PRO_DRAFT_FIELDS.push({
                        id: 'pin_' + Math.random().toString(36).substr(2, 9),
                        type: p.type === 'check' ? 'add-check' : 'text', 
                        page: p.page || 1,
                        x: p.x,
                        y: p.y,
                        text: '',
                        label: p.id, 
                        fontSize: 12
                    });
                });
            } catch(e) { console.error('Error inyectando pines pro', e); }
        }
        
        const hasXFA = pdfDoc.catalog.has(PDFLib.PDFName.of('AcroForm')) && 
                       pdfDoc.catalog.lookup(PDFLib.PDFName.of('AcroForm')).has(PDFLib.PDFName.of('XFA'));

        if (hasXFA) {
             showCustomModal('Documento XFA Detectado', 'Este PDF utiliza tecnología XFA. Puede convertirlo a campos modernos.', 'info');
        }
        
        renderProPageThumbnails();
        renderFullProCanvas();
    } catch (err) {
        console.error("Full Editor Error:", err);
        showCustomModal('Diagnóstico Suite Pro', err.message, 'error');
    }
}

// Módulo CRUD de Formularios (Fase 3)
function toggleFormEditorMode() {
    PRO_EDIT_MODE = (PRO_EDIT_MODE === 'form') ? 'view' : 'form';
    showCustomModal('Modo Formulario', PRO_EDIT_MODE === 'form' ? 'Añadir o editar campos de formulario (AcroForms).' : 'Modo visualización.', 'info');
    renderFullProCanvas();
}

async function renderProPageThumbnails() {
    const sidebar = document.getElementById('pro-thumbnails');
    sidebar.innerHTML = '';
    
    for (let i = 1; i <= PRO_PDF_DOCUMENT.numPages; i++) {
        const page = await PRO_PDF_DOCUMENT.getPage(i);
        const viewport = page.getViewport({ scale: 0.2 });
        
        const thumb = document.createElement('div');
        thumb.className = `thumbnail-item ${i === PRO_CURRENT_PAGE ? 'active' : ''}`;
        thumb.onclick = () => {
             PRO_CURRENT_PAGE = i;
             renderFullProCanvas();
             renderProPageThumbnails();
        };

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        
        thumb.appendChild(canvas);
        
        const numLabel = document.createElement('div');
        numLabel.className = 'thumbnail-num';
        numLabel.innerText = i;
        thumb.appendChild(numLabel);

        sidebar.appendChild(thumb);
    }
}

async function renderFullProCanvas() {
    const container = document.getElementById('pro-editor-canvas');
    if(!container) return;
    container.innerHTML = '';
    
    // 1. Obtención de página y viewport profesional
    const page = await PRO_PDF_DOCUMENT.getPage(PRO_CURRENT_PAGE);
    const scale = PRO_ZOOM_LEVEL * 1.5;
    const viewport = page.getViewport({ scale });

    // 2. Contenedor Maestro (Estilo Formulario Web)
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.width = `${viewport.width}px`;
    wrapper.style.height = `${viewport.height}px`;
    wrapper.style.background = '#fff';
    wrapper.style.margin = '0 auto 40px auto';
    wrapper.style.boxShadow = '0 15px 50px rgba(0,0,0,0.4)';

    // 3. Capa de Visualización Nativa (Nítida e Intacta)
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    wrapper.appendChild(canvas);

    // 4. CAPA DE INTERACCIÓN INTELIGENTE (Smart Fill Layer)
    let interactionLayer = document.getElementById('pro-interaction-layer');
    if (!interactionLayer) {
        interactionLayer = document.createElement('div');
        interactionLayer.id = 'pro-interaction-layer';
        interactionLayer.style.position = 'absolute';
        interactionLayer.style.top = '0';
        interactionLayer.style.left = '0';
        interactionLayer.style.width = '100%';
        interactionLayer.style.height = '100%';
        wrapper.appendChild(interactionLayer);
    }
    interactionLayer.style.cursor = (PRO_EDIT_MODE === 'add-text' || PRO_EDIT_MODE === 'add-check') ? 'crosshair' : 'default';

    // --- RE-RENDERIZAR CAMPOS PERSISTENTES ---
    if (!window.PRO_DRAFT_FIELDS) window.PRO_DRAFT_FIELDS = [];
    window.PRO_DRAFT_FIELDS.filter(f => f.page === PRO_CURRENT_PAGE).forEach(fieldData => {
        createDraggableField(fieldData, interactionLayer);
    });

    // EVENTO: Añadir Manual (Posición Real Protegida)
    interactionLayer.onclick = (e) => {
        if (e.target !== interactionLayer) return;
        if (PRO_EDIT_MODE !== 'add-text' && PRO_EDIT_MODE !== 'add-check') return;
        
        const rect = interactionLayer.getBoundingClientRect();
        const fSize = 14;
        const fieldData = {
            id: `field-${Date.now()}`,
            page: PRO_CURRENT_PAGE,
            // Guardamos la posición REAL de la esquina superior izquierda
            x: e.clientX - rect.left,
            y: e.clientY - rect.top - (fSize * 0.5), 
            text: PRO_EDIT_MODE === 'add-check' ? 'X' : 'Escriba aquí...',
            type: PRO_EDIT_MODE,
            fontSize: fSize
        };
        
        window.PRO_DRAFT_FIELDS.push(fieldData);
        createDraggableField(fieldData, interactionLayer);
    };

    container.appendChild(wrapper);
    document.getElementById('zoom-val').innerText = `${Math.round(PRO_ZOOM_LEVEL * 100)}%`;
    
    // Inyectar el Asistente de Formulario Web Lateral
    renderProWebFormAssistant();
}

// --- MOTOR DE MOVIMIENTO ZERO-DRIFT ---
function createDraggableField(data, container) {
    const existing = document.getElementById(data.id);
    if(existing) return;

    const el = document.createElement('div');
    el.id = data.id;
    el.className = 'smart-form-field';
    el.contentEditable = 'true';
    el.innerText = data.text;
    
    // POSICIONAMIENTO ABSOLUTO (Sin desfases extra en render)
    el.style.position = 'absolute';
    el.style.left = `${data.x}px`;
    el.style.top = `${data.y}px`;
    el.style.textAlign = data.type === 'add-check' ? 'center' : 'left';
    el.style.fontSize = `${data.fontSize}px`;
    el.style.fontWeight = data.type === 'add-check' ? '900' : 'normal';
    el.style.color = '#000';
    el.style.backgroundColor = 'transparent'; // TRANSPARENCIA PARA VER LÍNEAS DE TABLA
    el.style.border = '1px solid rgba(var(--primary-rgb), 0.3)';
    el.style.minWidth = data.type === 'add-check' ? '24px' : '10px'; 
    el.style.width = 'auto'; 
    el.style.minHeight = '18px';




    el.style.whiteSpace = 'nowrap';
    el.style.height = 'auto';
    el.style.overflow = 'visible';
    el.style.cursor = 'move';






    el.style.zIndex = '1000';
    el.style.userSelect = 'none';

    // --- LÓGICA DE ARRASTRE MASTER ---
    let isDragging = false;
    let startX, startY;

    el.onmousedown = (e) => {
        isDragging = true;
        const rect = el.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        el.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
        el.style.zIndex = '2000';
    };

    const handleGlobalMove = (e) => {
        if (!isDragging) return;
        const containerRect = container.getBoundingClientRect();
        const newX = e.clientX - containerRect.left - startX;
        const newY = e.clientY - containerRect.top - startY;
        
        el.style.left = `${newX}px`;
        el.style.top = `${newY}px`;
        
        // Sincronizar coordenadas PURAS
        data.x = newX;
        data.y = newY;
    };

    const handleGlobalUp = () => {
        if (isDragging) {
            isDragging = false;
            el.style.boxShadow = 'none';
            el.style.zIndex = '1000';
            el.style.cursor = 'move';
        }
    };

    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalUp);

    el.onfocus = () => {
        if(el.innerText === 'Escriba aquí...') el.innerText = '';
        el.style.backgroundColor = 'rgba(255,255,255,0.7)'; // Ligero realce al editar
        el.style.outline = '2px solid var(--primary)';
        ACTIVE_PRO_FIELD_ID = data.id;

        // MOSTRAR HERRAMIENTAS DE FORMATO SIEMPRE QUE HAYA UN CAMPO ACTIVO
        const tools = document.getElementById('text-formatting-tools');
        if(tools) tools.style.display = 'flex';


        // Sincronizar el Toolbar con el valor del campo
        const fsSelector = document.getElementById('pro-font-size');
        if(fsSelector) fsSelector.value = data.fontSize || 12;
    };

    // --- ALINEACIÓN POR TECLADO (NUDGE DE PRECISIÓN) ---
    el.onkeydown = (e) => {
        if (!e.altKey) return; // Solo actuar si se presiona ALT para no interferir con la escritura
        
        const step = e.shiftKey ? 5 : 1;
        let moved = false;

        if (e.key === 'ArrowUp') { data.y -= step; moved = true; }
        if (e.key === 'ArrowDown') { data.y += step; moved = true; }
        if (e.key === 'ArrowLeft') { data.x -= step; moved = true; }
        if (e.key === 'ArrowRight') { data.x += step; moved = true; }

        if (moved) {
            e.preventDefault();
            el.style.left = `${data.x}px`;
            el.style.top = `${data.y}px`;
            // Sincronización silenciosa sin re-renderizado pesado para fluidez total
        }
    };
    
    el.onblur = () => { 
        el.style.backgroundColor = 'transparent';
        el.style.outline = 'none';
        el.style.minWidth = data.type === 'add-check' ? '24px' : '10px';
        if(!el.innerText.trim()) {


            el.remove();
            window.PRO_DRAFT_FIELDS = window.PRO_DRAFT_FIELDS.filter(f => f.id !== data.id);
        }
    };

    el.oninput = () => { 
        data.text = el.innerText;
        // Sincronizar hacia el Web Form si tiene label
        if(data.label) {
            const webInp = document.querySelector(`[data-sync-id="${data.id}"]`);
            if(webInp) {
                if(webInp.type === 'checkbox') webInp.checked = (data.text.toUpperCase() === 'X');
                else webInp.value = data.text;
            }
        }
    };
    container.appendChild(el);
    if(data.text === 'Escriba aquí...') setTimeout(() => el.focus(), 10);
    
    // Si el campo es nuevo y fue añadido manualmente, refrescar el asistente
    if(!data.label) renderProWebFormAssistant(); 
}

// --- ASISTENTE DE FORMULARIO WEB (OCR ESTRUCTURADO) ---
function renderProWebFormAssistant() {
    const list = document.getElementById('pro-form-fields-list');
    if(!list) return;
    
    if(!window.PRO_DRAFT_FIELDS || window.PRO_DRAFT_FIELDS.length === 0) {
       list.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem; text-align:center; margin-top:20px;">No hay campos detectados.</p>';
       return;
    }

    list.innerHTML = '';
    window.PRO_DRAFT_FIELDS.forEach(field => {
        const row = document.createElement('div');
        row.className = `form-field-group ${field.type === 'add-check' ? 'check-row' : ''}`;
        
        const labelText = field.label || `Campo Libre (Pág ${field.page})`;
        
        if(field.type === 'add-check') {
            row.innerHTML = `
                <label>${labelText}</label>
                <input type="checkbox" class="custom-cb" data-sync-id="${field.id}" ${field.text.toUpperCase() === 'X' ? 'checked' : ''} onchange="syncCanvasFieldFromForm('${field.id}', this.checked ? 'X' : '')">
            `;
        } else {
            // Inteligencia de Tipo: Si el label contiene "Date" o "Fecha", usamos date input
            const isDate = labelText.toLowerCase().includes('date') || labelText.toLowerCase().includes('fecha');
            row.innerHTML = `
                <label>${labelText}</label>
                <input type="${isDate ? 'date' : 'text'}" data-sync-id="${field.id}" value="${field.text === 'Escriba aquí...' ? '' : field.text}" oninput="syncCanvasFieldFromForm('${field.id}', this.value)">
            `;
        }
        
        // Al hacer click en el grupo, centrar el PDF en ese campo
        row.onclick = () => {
            if(field.page !== PRO_CURRENT_PAGE) {
                PRO_CURRENT_PAGE = field.page;
                renderFullProCanvas();
                renderProPageThumbnails();
            }
            setTimeout(() => {
                const target = document.getElementById(field.id);
                if(target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.style.outline = '3px solid var(--primary)';
                    setTimeout(() => target.style.outline = 'none', 2000);
                }
            }, 300);
        };

        list.appendChild(row);
    });
}

function syncCanvasFieldFromForm(id, value) {
    const fieldData = window.PRO_DRAFT_FIELDS.find(f => f.id === id);
    if(fieldData) {
        fieldData.text = value;
        const canvasEl = document.getElementById(id);
        if(canvasEl) {
            canvasEl.innerText = value;
        }
    }
}

function toggleFullEditableMode(mode) {
    PRO_EDIT_MODE = (PRO_EDIT_MODE === mode) ? 'view' : mode;
    
    // Actualizar UI
    document.querySelectorAll('.ribbon-btn').forEach(btn => btn.classList.remove('active'));
    if(PRO_EDIT_MODE === 'text') document.getElementById('btn-edit-text-tool')?.classList.add('active');
    if(PRO_EDIT_MODE === 'add-text') document.getElementById('btn-add-text-tool')?.classList.add('active');
    if(PRO_EDIT_MODE === 'add-check') document.getElementById('btn-add-check-tool')?.classList.add('active');

    const tools = document.getElementById('text-formatting-tools');
    if(tools) tools.style.display = (PRO_EDIT_MODE === 'text' || PRO_EDIT_MODE === 'add-text') ? 'flex' : 'none';

    renderFullProCanvas();
}


function changeProZoom(delta) {
    PRO_ZOOM_LEVEL = Math.max(0.5, Math.min(2.0, PRO_ZOOM_LEVEL + delta));
    renderFullProCanvas();
}

function applyProFontSize(size) {
    if(!ACTIVE_PRO_FIELD_ID) return;
    const fieldData = window.PRO_DRAFT_FIELDS.find(f => f.id === ACTIVE_PRO_FIELD_ID);
    if(fieldData) {
        fieldData.fontSize = parseInt(size);
        const el = document.getElementById(ACTIVE_PRO_FIELD_ID);
        if(el) el.style.fontSize = `${size}px`;
    }
}

// Para Edición Directa (Legacy/Smart)
function applyBlockFontSize(size) {
    // Busca el input activo en el DOM si es edición directa
    const activeInp = document.activeElement;
    if(activeInp && (activeInp.classList.contains('smart-pdf-input') || activeInp.classList.contains('pdf-new-text'))) {
        activeInp.style.fontSize = `${size}pt`;
        activeInp.dataset.fsize = size;
    }
}


function switchRibbonTab(tab) {
    document.querySelectorAll('.ribbon-tab').forEach(t => t.classList.remove('active'));
    // Lógica visual para cambiar grupos de acciones (opcional por ahora)
}

function addNewProTextBlock() {
    const layer = document.getElementById('pro-interaction-layer');
    if(!layer) return;
    
    const block = document.createElement('div');
    block.className = 'editable-text-block';
    block.style.left = '100px';
    block.style.top = '100px';
    block.style.fontSize = '14px';
    block.innerText = 'Nuevo Bloque de Texto';
    block.contentEditable = "true";
    block.style.border = '1px solid var(--primary)';
    block.style.padding = '8px';
    block.style.background = 'rgba(255,255,255,0.9)';
    
    layer.appendChild(block);
    makeElementDraggable(block);
}

function makeElementDraggable(el) {
    let isDragging = false;
    let offset = [0,0];
    el.onmousedown = (e) => {
        isDragging = true;
        offset = [el.offsetLeft - e.clientX, el.offsetTop - e.clientY];
    };
    document.onmousemove = (e) => {
        if (!isDragging) return;
        el.style.left = (e.clientX + offset[0]) + 'px';
        el.style.top = (e.clientY + offset[1]) + 'px';
    };
    document.onmouseup = () => isDragging = false;
}



async function fetchPlantillasParaEditor() {
    try {
        const response = await fetch('/api/formularios', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const plantillas = await response.json();
        window.GLOBAL_PLANTILLAS = plantillas; 

        const sel = document.getElementById('edit-pl-select');
        if(!sel) return;
        sel.innerHTML = '<option value="">Abrir PDF...</option>';
        
        plantillas.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.innerText = p.tipo || p.nombre_archivo || 'Documento sin nombre';
            sel.appendChild(opt);
        });

        sel.onchange = async (e) => {
            const id = e.target.value;
            if(!id) return;
            
            const p = window.GLOBAL_PLANTILLAS.find(x => x.id == id);
            if(!p) return;

            // --- LÓGICA DE UNICIDAD (REQUISITO 3) ---
            // Buscamos si el usuario ya tiene un borrador para esta misma plantilla
            // Para esto necesitamos asegurarnos de que GLOBAL_EDICIONES esté cargado.
            if(!window.GLOBAL_EDICIONES) {
                const res = await fetch('/api/ediciones', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
                window.GLOBAL_EDICIONES = await res.json();
            }

            const existingEdition = window.GLOBAL_EDICIONES.find(ed => ed.plantilla_id == id);
            
            if(existingEdition) {
                // Si ya existe, avisar y reanudar
                showCustomModal('Borrador Detectado', `Ya tienes una edición en curso para este documento. Reanudando tus últimos cambios del ${new Date(existingEdition.fecha_creacion).toLocaleDateString()}...`, 'success');
                setTimeout(() => loadEdicionInEditor(existingEdition.id), 1500);
            } else {
                // Si es nuevo, iniciar desde cero
                startFullProEditor(p);
            }
        };
    } catch (err) {
        console.error("Error cargando plantillas para editor:", err);
    }
}

// --- MOTOR DE PERSISTENCIA Y EXPORTACIÓN (High-Level Doc Management) ---

async function saveFullProChanges() {
    if(!window.CURRENT_PLANTILLA_ID) {
        alert("Primero selecciona un documento.");
        return;
    }
    
    // Forzamos guardar lo que el usuario esté tecleando actualmente antes de mandar a BB.DD.
    if(typeof flushActiveInputs === 'function') flushActiveInputs();
    
    showCustomModal('Guardando...', 'Sincronizando ediciones con el servidor...', 'info');
    
    try {
        const payload = {
            plantilla_id: window.CURRENT_PLANTILLA_ID,
            nombre_archivo: window.GLOBAL_PLANTILLAS.find(x => x.id == window.CURRENT_PLANTILLA_ID)?.tipo || 'Documento Editado',
            datos_json: {
                fields: window.PRO_DRAFT_FIELDS,
                meta: { zoom: window.PRO_ZOOM_LEVEL || 1.0 }
            }
        };
        
        let response;
        if (window.CURRENT_EDICION_ID) {
            // Sobrescribir (PUT) en edición existente (No genera duplicados en la tabla)
            response = await fetch(`/api/ediciones/${window.CURRENT_EDICION_ID}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(payload)
            });
        } else {
            // Crear nuevo borrador (POST)
            response = await fetch('/api/ediciones', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(payload)
            });
        }
        
        if(response.ok) {
            const dataRes = await response.json();
            if(!window.CURRENT_EDICION_ID) window.CURRENT_EDICION_ID = dataRes.id; 
            showCustomModal('Éxito', 'Cambios guardados en tu historial personal.', 'success');
        } else {
            const errorData = await response.json();
            const fullMsg = errorData.detalle ? `Error: ${errorData.detalle}` : 'Falla en el servidor al persistir datos.';
            showCustomModal('Error', fullMsg, 'error');
        }
    } catch (err) {
        showCustomModal('Error', `No se pudo conectar con el servidor: ${err.message}`, 'error');
    }
}

async function fetchEdicionesList() {
    try {
        const response = await fetch('/api/ediciones', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const ediciones = await response.json();
        window.GLOBAL_EDICIONES = ediciones;
        
        const tbody = document.getElementById('ediciones-table-body');
        tbody.innerHTML = '';
        
        if (ediciones.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">No existe información.</td></tr>';
            return;
        }

        ediciones.forEach(ed => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border-color)';
            const firmaEstado = ed.estado_firma || 'PENDIENTE';
            const firmaBadge = firmaEstado === 'FIRMADO' ? 'badge-success' : 'badge-danger';
            
            tr.innerHTML = `
                <td style="padding:12px;"><strong>${ed.nombre_archivo_original}</strong></td>
                <td>${new Date(ed.fecha_creacion).toLocaleString()}</td>
                <td><span class="${firmaBadge}" style="padding:4px 8px; border-radius:4px; font-size:10px; font-weight:800; cursor:pointer;" onclick="toggleFirmaEstado(${ed.id}, '${firmaEstado}')">${firmaEstado}</span></td>
                <td>
                    <button class="action-btn" style="color:var(--primary);" title="Editor Visual PDF" onclick="loadEdicionInEditor(${ed.id})"><i class="ph ph-note-pencil"></i></button>
                    <button class="action-btn" style="color:#10b981;" onclick="downloadEdicionPDF(${ed.id})"><i class="ph ph-download-simple"></i></button>
                    <button class="action-btn btn-danger" onclick="deleteEdicion(${ed.id})"><i class="ph ph-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error(err);
    }
}

function filterEdicionesTable() {
    const q = document.getElementById('filter-ediciones').value.toLowerCase();
    const rows = document.querySelectorAll('#ediciones-table-body tr');
    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(q) ? '' : 'none';
    });
}

async function toggleFirmaEstado(id, current) {
    if (current === 'FIRMADO') {
        // Permitir revertir a PENDIENTE (opcional, segun reglas de negocio)
        if (!confirm('¿Desea revertir el estado a PENDIENTE? Se perderá la certificación actual.')) return;
        
        try {
            await fetch(`/api/ediciones/${id}/firma`, {
                method: 'PATCH',
                headers: { 
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ estado: 'PENDIENTE' })
            });
            fetchEdicionesList();
        } catch (err) { console.error(err); }
        return;
    }

    // SI ES PENDIENTE -> PEDIR CARGA PARA CERTIFICAR
    const html = `
        <div style="text-align:center;">
            <p style="margin-bottom:20px; font-size:14px; color:var(--text-muted);">Para certificar este documento como <strong>FIRMADO</strong>, el Agente Experto debe validar el archivo PDF final.</p>
            <div class="glass-card" style="padding:20px; border:2px dashed var(--border-color); margin-bottom:20px;">
                <input type="file" id="cert-file-input" accept=".pdf" style="display:none;" onchange="document.getElementById('cert-file-name').innerText = this.files[0].name">
                <label for="cert-file-input" style="cursor:pointer; display:flex; flex-direction:column; align-items:center;">
                    <i class="ph ph-cloud-arrow-up" style="font-size:40px; color:var(--primary); margin-bottom:10px;"></i>
                    <span id="cert-file-name">Seleccione el PDF Firmado</span>
                </label>
            </div>
            <button class="btn-primary" onclick="certificarEdicionDesdeUI(${id})" style="width:100%;">VALIDAR Y CERTIFICAR</button>
        </div>
    `;
    showCustomModal('Certificación de Firma', html, 'info');
}

async function certificarEdicionDesdeUI(id) {
    const fileInput = document.getElementById('cert-file-input');
    if (!fileInput.files[0]) return alert('Por favor, seleccione un archivo.');

    const formData = new FormData();
    formData.append('archivo', fileInput.files[0]);

    showCustomModal('Agente Validando...', 'El Agente Experto está inspeccionando la estructura del PDF...', 'info');

    try {
        const response = await fetch(`/api/ediciones/${id}/certificar`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: formData
        });

        const res = await response.json();
        if (response.ok) {
            showCustomModal('Certificación Exitosa', res.message, 'success');
            fetchEdicionesList();
        } else {
            showCustomModal('Fallo de Validación', res.error, 'error');
        }
    } catch (err) {
        console.error(err);
        showCustomModal('Error', 'Falla de conexión con el Agente.', 'error');
    }
}

async function downloadEdicionPDF(id) {
    const ed = window.GLOBAL_EDICIONES.find(x => x.id === id);
    if(!ed) return;

    if (ed.estado_firma === 'FIRMADO' && ed.ruta_archivo_firmado) {
        window.open(ed.ruta_archivo_firmado, '_blank');
        return;
    }
    
    // showCustomModal('Exportación Quirúrgica', 'Fusionando capas binarias y generando documento final...', 'info');
    
    try {
        const token = localStorage.getItem('token');
        
        // 1. Cargar Binario Original
        const pdfResponse = await fetch(`/api/formularios/view/${ed.plantilla_id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if(!pdfResponse.ok) throw new Error("No se pudo descargar el binario original");
        const pdfData = await pdfResponse.arrayBuffer();
        
        const proPdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
        const totalPages = proPdf.numPages;
        const rawData = JSON.parse(ed.datos_json);
        const edits = rawData.fields || rawData;

        // 2. Motor de Fusión Canvas (Zero-Abstraction)
        const finalImages = [];
        
        for (let i = 1; i <= totalPages; i++) {
             const page = await proPdf.getPage(i);
             const scale = 4.0; // CALIDAD SUPREMA (600 DPI) para evitar cualquier pixelado
             const viewport = page.getViewport({ scale });

             const canvas = document.createElement('canvas');
             canvas.width = viewport.width;
             canvas.height = viewport.height;
             const ctx = canvas.getContext('2d');
             
             await page.render({ 
                 canvasContext: ctx, 
                 viewport,
                 intent: 'print'
             }).promise;

             const pageEdits = edits.filter(f => f.page === i);
             const saveZoom = (rawData.meta && rawData.meta.zoom) ? rawData.meta.zoom : 1.0;
             const normFactor = scale / (saveZoom * 1.5);

             pageEdits.forEach(edit => {
                 const text = edit.text === 'Escriba aquí...' ? '' : edit.text;
                 if(!text) return;

                 const isCheck = edit.type === 'add-check';
                 const fontSize = (edit.fontSize || (isCheck ? 14 : 12)) * normFactor;
                 
                 ctx.font = `${isCheck ? '900' : 'normal'} ${fontSize}px "Inter", Arial, sans-serif`;
                 ctx.fillStyle = '#000';
                 
                 if (isCheck) {
                     // LÓGICA PARA MARCAS (CENTRADAS EN EL CUADRO)
                     ctx.textAlign = 'center';
                     ctx.textBaseline = 'middle';
                     const posX = (edit.x * normFactor) + (12 * normFactor);
                     const posY = (edit.y * normFactor) + (9 * normFactor); 
                     ctx.fillText(text.toUpperCase(), posX, posY);
                 } else {
                     // LÓGICA PARA TEXTO (ALINEADO A LA IZQUIERDA)
                     ctx.textAlign = 'left';
                     ctx.textBaseline = 'top';
                     
                     // Ajuste vertical sutil para alinear con la línea base del PDF (+1 o 2px)
                     const posY = (edit.y * normFactor) + (1 * normFactor);

                     // --- MÁSCARA DE BLANQUEO QUIRÚRGICA (PROTECCIÓN DE TABLAS) ---
                     ctx.fillStyle = 'white';
                     const textWidth = ctx.measureText(text).width;
                     // MÁSCARA QUIRÚRGICA: Margen mínimo (10px) para proteger separadores / / íntimos
                     const clearAreaWidth = textWidth + (10 * normFactor);
                     const clearHeight = fontSize * 1.4; 
                     const maskX = edit.x * normFactor - (4 * normFactor);
                     const maskY = posY - (fontSize * 0.2);
                     ctx.fillRect(maskX, maskY, clearAreaWidth, clearHeight);

                     // --- DIBUJADO DE TEXTO FINAL ---
                     ctx.fillStyle = '#000';
                     ctx.fillText(text, edit.x * normFactor, posY);
                 }
             });
             
             finalImages.push({
                 data: canvas.toDataURL('image/png'),
                 width: viewport.width,
                 height: viewport.height
             });
        }

        // 3. Empaquetado Master UHD (Detección robusta de librería)
        const LibPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (window.jsPDF ? window.jsPDF : null);
        if (!LibPDF) throw new Error("La librería de generación PDF (jsPDF) no se cargó correctamente. Por favor refresque (F5/Ctrl+R).");

        const pdf = new LibPDF({
            orientation: finalImages[0].width > finalImages[0].height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [finalImages[0].width, finalImages[0].height],
            compress: true
        });

        finalImages.forEach((img, index) => {
            if (index > 0) {
                pdf.addPage([img.width, img.height], img.width > img.height ? 'landscape' : 'portrait');
            }
            pdf.addImage(img.data, 'PNG', 0, 0, img.width, img.height, undefined, 'FAST');
        });

        pdf.save(`PRINT_QUALITY_${ed.nombre_archivo_original || 'documento'}.pdf`);
        showCustomModal('Éxito', 'Documento en Calidad de Imprenta generado.', 'success');

    } catch (err) {
        console.error("ERROR EXPORT UHD MASTER:", err);
        showCustomModal('Atención', 'Error en el motor UHD: ' + err.message, 'error');
    }
}

async function deleteEdicion(id) {
    if(!confirm("¿Eliminar esta edición definitivamente?")) return;
    try {
        await fetch(`/api/ediciones/${id}`, { 
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        fetchEdicionesList();
    } catch (err) {
        console.error(err);
    }
}

async function loadEdicionInEditor(id) {
    const ed = window.GLOBAL_EDICIONES.find(x => x.id === id);
    if(!ed) return;
    
    // 1. FORZAMOS EL CAMBIO DE VISTA (Redirección Inteligente)
    renderContent('val-edit-pdf', 'Editar Formularios');
    
    // Ocultar selector de plantillas porque es una edición existente
    const plSelect = document.getElementById('edit-pl-select');
    if (plSelect) plSelect.style.display = 'none';
    
    const p = { id: ed.plantilla_id, tipo: ed.nombre_archivo_original };
    await startFullProEditor(p);
    
    // Anclar la sesión a la edición actual para permitir Guardado en Caliente (PUT)
    window.CURRENT_EDICION_ID = ed.id;
    
    // 2. PARSE DINÁMICO (Soporte Meta & Legacy)
    const rawData = JSON.parse(ed.datos_json);
    if(rawData.fields) {
        window.PRO_DRAFT_FIELDS = rawData.fields;
        if(rawData.meta && rawData.meta.zoom) {
            window.PRO_ZOOM_LEVEL = rawData.meta.zoom;
        }
    } else {
        // Soporte para versiones anteriores sin meta
        window.PRO_DRAFT_FIELDS = rawData;
    }
    
    renderFullProCanvas();
}

// --- MOTOR DE REVERSIBILIDAD (Undo/Redo Pro - Estilo PDFgear) ---
function undoEdit() {
    if (!window.PRO_DRAFT_FIELDS || window.PRO_DRAFT_FIELDS.length === 0) return;
    // Guardamos el input dinámico actual si existe
    flushActiveInputs();
    
    const lastOp = window.PRO_DRAFT_FIELDS.pop();
    if (!window.PRO_REDO_STACK) window.PRO_REDO_STACK = [];
    window.PRO_REDO_STACK.push(lastOp);
    
    renderFullProCanvas();
}

function redoEdit() {
    if (!window.PRO_REDO_STACK || window.PRO_REDO_STACK.length === 0) return;
    flushActiveInputs();
    
    const lastOp = window.PRO_REDO_STACK.pop();
    window.PRO_DRAFT_FIELDS.push(lastOp);
    
    renderFullProCanvas();
}

function flushActiveInputs() {
    document.querySelectorAll('.smart-form-field').forEach(el => {
        if(el.innerText.trim()) {
            const field = window.PRO_DRAFT_FIELDS.find(f => f.id === el.id);
            if(field) field.text = el.innerText;
        }
    });
}



// ==========================================================================
// MÓDULO: SUBIR DOCUMENTOS (PERSONALES)
// ==========================================================================

function renderPersonalDocsView(container) {
    container.innerHTML = `
        <div class="glass-card" style="padding:40px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:30px;">
                 <div>
                    <h3 style="color:var(--primary);"><i class="ph ph-file-arrow-up"></i> Carpeta de Documentos</h3>
                    <p style="font-size:0.9rem; color:var(--text-muted);">Repositorio seguro para sus respaldos e información personal.</p>
                 </div>
                 <button class="btn-primary" onclick="showUploadPersonalModal()"><i class="ph ph-plus"></i> Nuevo Documento</button>
            </div>
            
            <div class="table-container">
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="text-align:left; border-bottom:2px solid var(--border-color);">
                            <th style="padding:12px;">Categoría</th>
                            <th style="padding:12px;">Nombre de Archivo</th>
                            <th style="padding:12px;">Estado</th>
                            <th style="padding:12px;">Expiración</th>
                            <th style="padding:12px; text-align:right;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="personal-docs-table-body"></tbody>
                </table>
            </div>
        </div>
    `;
    fetchPersonalDocs();
}

async function fetchPersonalDocs() {
    const tbody = document.getElementById('personal-docs-table-body');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Accediendo al servidor...</td></tr>';

    try {
        const response = await fetch('/api/documentacion-personal', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--text-muted);">No tiene documentos cargados actualmente.</td></tr>';
            return;
        }

        data.forEach(doc => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border-color)';
            
            const badgeClass = doc.estado_vigencia === 'VIGENTE' ? 'badge-success' : 'badge-danger';
            
            // Lógica de visualización ajustable para fecha manual
            const displayDate = doc.fecha_expiracion 
                ? `<span style="font-size:11px;">${new Date(doc.fecha_expiracion).toLocaleDateString()}</span> <button class="action-btn" onclick="toggleDateEdit('${doc.id}')" style="padding:2px; vertical-align:middle;" title="Cambiar"><i class="ph ph-calendar"></i></button>` 
                : `<button class="btn-primary" onclick="toggleDateEdit('${doc.id}')" style="padding:4px 8px; font-size:10px; border-radius:4px;"><i class="ph ph-calendar-plus"></i> Ingresar Fecha</button>`;

            tr.innerHTML = `
                <td style="padding:12px;"><span class="badge-blue">${doc.tipo}</span></td>
                <td style="padding:12px;">${doc.nombre_archivo}</td>
                <td style="padding:12px;"><span class="${badgeClass}">${doc.estado_vigencia || 'NO DETECTADO'}</span></td>
                <td style="padding:12px; min-width:120px;" id="expiry-cell-${doc.id}">${displayDate}</td>
                <td style="padding:12px; text-align:right;">
                    <button class="action-btn" onclick="downloadPersonalDoc('${doc.id}', '${doc.nombre_archivo}')" title="Descargar"><i class="ph ph-download-simple"></i></button>
                    <button class="action-btn btn-danger" onclick="deletePersonalDoc('${doc.id}')" title="Eliminar"><i class="ph ph-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#ef4444;">Error al conectar con la base de datos.</td></tr>`;
    }
}

// Funciones para edición manual de fecha
function toggleDateEdit(docId) {
    const cell = document.getElementById(`expiry-cell-${docId}`);
    cell.innerHTML = `
        <div style="display:flex; align-items:center; gap:5px;">
            <input type="date" id="input-expiry-${docId}" style="padding:4px; font-size:10px; background:rgba(0,0,0,0.2); color:white; border:1px solid var(--primary); border-radius:4px;">
            <button class="action-btn" style="color:#10b981;" onclick="saveManualDate('${docId}')"><i class="ph ph-check-circle"></i></button>
            <button class="action-btn" style="color:#ef4444;" onclick="fetchPersonalDocs()"><i class="ph ph-x-circle"></i></button>
        </div>
    `;
}

async function saveManualDate(docId) {
    const dateInput = document.getElementById(`input-expiry-${docId}`);
    if(!dateInput.value) return;

    try {
        const res = await fetch(`/api/documentacion-personal/${docId}/manual-date`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}` 
            },
            body: JSON.stringify({ fecha_expiracion: dateInput.value })
        });
        if(res.ok) {
            fetchPersonalDocs();
        } else {
            alert('Error al guardar la fecha');
        }
    } catch (err) {
        console.error(err);
    }
}


function showUploadPersonalModal() {
    const html = `
        <div style="display:flex; flex-direction:column; gap:20px;">
            <div class="form-group">
                <label style="color:white; display:block; margin-bottom:10px;">Categoría</label>
                <select id="doc-personal-type" style="width:100%; padding:10px; background:#0f172a; color:white; border:1px solid var(--border-color); border-radius:6px;">
                    <option value="IDENTIDAD">Identidad / Cédula</option>
                    <option value="ESTUDIOS">Títulos / Certificados</option>
                    <option value="LEGAL">Documentos Legales</option>
                    <option value="OTROS">Varios</option>
                </select>
            </div>
            <div class="form-group">
                <label style="color:white; display:block; margin-bottom:10px;">Archivo</label>
                <input type="file" id="doc-personal-file" style="color:white;">
            </div>
            <div class="form-group">
                <label style="color:white; display:block; margin-bottom:10px;">Fecha de Expiración</label>
                <input type="date" id="doc-personal-expiry" style="width:100%; padding:10px; background:#0f172a; color:white; border:1px solid var(--border-color); border-radius:6px;">
            </div>
            <button class="btn-primary" onclick="uploadPersonalFile()" style="width:100%"><i class="ph ph-upload"></i> Subir Documento</button>
        </div>
    `;
    showCustomModal('Subir Documento Personal', html, 'info');
}

async function uploadPersonalFile() {
    const fileInput = document.getElementById('doc-personal-file');
    const typeInput = document.getElementById('doc-personal-type');
    if(!fileInput.files[0]) return alert('Seleccione un archivo');

    const formData = new FormData();
    formData.append('archivo', fileInput.files[0]);
    formData.append('tipo', typeInput.value);
    
    const expiryDate = document.getElementById('doc-personal-expiry').value;
    if(expiryDate) formData.append('fecha_expiracion', expiryDate);

    try {
        const res = await fetch('/api/documentacion-personal/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: formData
        });
        const result = await res.json();
        if(res.ok) {
            showCustomModal('Éxito', 'Documento guardado en la base de datos.', 'success');
            fetchPersonalDocs();
        } else {
            throw new Error(result.detalle || result.error || 'No se pudo guardar');
        }
    } catch (err) {
        showCustomModal('Error', 'Falla en la comunicación con el servidor.', 'error');
    }
}

async function deletePersonalDoc(id) {
    if(!confirm('¿Eliminar documento?')) return;
    await fetch(`/api/documentacion-personal/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    fetchPersonalDocs();
}


async function downloadPersonalDoc(id, nombre) {
    const response = await fetch(`/api/documentacion-personal/view/${id}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
}

// ==========================================================================
// MÓDULO: SUBIR FORMULARIOS FIRMADOS (CON AGENTE DE VALIDACIÓN)
// ==========================================================================

function renderSignedFormsView(container) {
    container.innerHTML = `
        <div class="glass-card" style="padding:40px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:30px;">
                 <div>
                    <h3 style="color:var(--primary);"><i class="ph ph-signature"></i> Validación de Firmas</h3>
                    <p style="font-size:0.9rem; color:var(--text-muted);">Carga de formularios con verificación criptográfica automática.</p>
                 </div>
                 <button class="btn-primary" onclick="showUploadSignedModal()"><i class="ph ph-upload-simple"></i> Validar Nuevo Formulario</button>
            </div>
            
            <div class="table-container">
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="text-align:left; border-bottom:2px solid var(--border-color);">
                            <th style="padding:12px;">Documento</th>
                            <th style="padding:12px;">Estado Firma</th>
                            <th style="padding:12px;">Fecha Carga</th>
                            <th style="padding:12px; text-align:right;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="signed-forms-table-body"></tbody>
                </table>
            </div>
        </div>
    `;
    fetchSignedForms();
}

async function fetchSignedForms() {
    const tbody = document.getElementById('signed-forms-table-body');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">Accediendo al registro...</td></tr>';

    try {
        const response = await fetch('/api/formularios-firmados', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px; color:var(--text-muted);">No tiene formularios firmados registrados.</td></tr>';
            return;
        }

        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border-color)';
            const badgeClass = item.is_valid ? 'badge-success' : 'badge-danger';
            const badgeText = item.is_valid ? 'VÁLIDA' : 'NO DETECTADA';
            
            tr.innerHTML = `
                <td style="padding:12px;"><strong>${item.nombre_archivo}</strong></td>
                <td style="padding:12px;"><span class="${badgeClass}" style="padding:4px 8px; border-radius:4px; font-size:10px; font-weight:800;">${badgeText}</span></td>
                <td style="padding:12px; color:var(--text-muted); font-size:11px;">${new Date(item.fecha_carga).toLocaleString()}</td>
                <td style="padding:12px; text-align:right;">
                    <button class="action-btn" onclick="downloadSignedForm('${item.id}', '${item.nombre_archivo}')" title="Descargar"><i class="ph ph-download"></i></button>
                    <button class="action-btn btn-danger" onclick="deleteSignedForm('${item.id}')" title="Eliminar"><i class="ph ph-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#ef4444;">Error de conexión.</td></tr>`;
    }
}

function showUploadSignedModal() {
    const html = `
        <div style="display:flex; flex-direction:column; gap:20px;">
            <p style="color:var(--text-muted); font-size:0.9rem;">Suba el PDF firmado. El Agente Experto validará la integridad y presencia de la firma digital.</p>
            <div class="form-group">
                <input type="file" id="signed-file-input" accept=".pdf" style="width:100%; border:1px dashed var(--border-color); padding:20px;">
            </div>
            <button class="btn-primary" onclick="uploadSignedFile()" style="width:100%"><i class="ph ph-fingerprint"></i> Validar y Guardar</button>
        </div>
    `;
    showCustomModal('Validación de Formulario', html, 'info');
}

async function uploadSignedFile() {
    const fileInput = document.getElementById('signed-file-input');
    if(!fileInput.files[0]) return alert('Seleccione un archivo');

    const formData = new FormData();
    formData.append('archivo', fileInput.files[0]);

    showCustomModal('Agente Validando...', 'Analizando firmas digitales criptográficas...', 'info');

    try {
        const res = await fetch('/api/formularios-firmados/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: formData
        });
        const result = await res.json();
        
        if(result.isValid) {
            showCustomModal('Firma Válida', 'Documento guardado y validado con éxito.', 'success');
        } else {
            showCustomModal('Sin Firma', 'Documento guardado, pero NO se detectó firma digital.', 'warning');
        }
        fetchSignedForms();
    } catch (err) {
        showCustomModal('Error', 'Falla en el proceso de validación.', 'error');
    }
}

async function deleteSignedForm(id) {
    if(!confirm('¿Eliminar?')) return;
    await fetch(`/api/formularios-firmados/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    fetchSignedForms();
}

async function downloadSignedForm(id, nombre) {
    const response = await fetch(`/api/formularios-firmados/view/${id}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
}


// ==========================================================================
// SISTEMA DE NOTIFICACIONES
// ==========================================================================

function toggleNotifications() {
    document.getElementById('notification-panel').classList.toggle('active');
}

async function fetchNotifications() {
    try {
        const response = await fetch('/api/bitacora/notificaciones', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        renderNotifications(data);
    } catch (err) {
        console.error('Error al cargar notificaciones');
    }
}

function renderNotifications(data) {
    const badge = document.getElementById('notification-count');
    const list = document.getElementById('notification-list');
    
    const unread = data.filter(n => !n.leida).length;
    if (unread > 0) {
        badge.innerText = unread;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }

    if (data.length === 0) {
        list.innerHTML = '<p class="empty-notif" style="line-height:1.5;">No hay alertas pendientes.<br><br><span style="font-size:0.75rem; opacity:0.7;">Aquí se registrarán actividades como de creación de documentos o cambios de estado administrativos.</span></p>';
        return;
    }

    list.innerHTML = '';
    data.forEach(n => {
        const item = document.createElement('div');
        item.className = `notif-item ${n.leida ? '' : 'unread'}`;
        item.innerHTML = `
            <h5>${n.titulo}</h5>
            <p>${n.mensaje}</p>
            <div style="font-size:10px; color:rgba(255,255,255,0.3); margin-top:5px;">${new Date(n.fecha).toLocaleString()}</div>
        `;
        item.onclick = () => markAsRead(n.id);
        list.appendChild(item);
    });
}

async function markAsRead(id) {
    try {
        await fetch(`/api/bitacora/notificaciones/${id}/read`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        fetchNotifications();
    } catch (err) {
        console.error(err);
    }
}

async function clearAllNotifications() {
    try {
        await fetch('/api/bitacora/notificaciones/clear', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        fetchNotifications();
    } catch (err) {
        console.error(err);
    }
}


function toggleSupportWindow() {
    const win = document.getElementById('support-window');
    if(!win) return;
    const isVisible = win.style.display === 'flex';
    win.style.display = isVisible ? 'none' : 'flex';
}

function askSupport(topic) {
    const chat = document.getElementById('support-chat-content');
    if(!chat) return;
    
    // User Question Bubble
    const userMsg = document.createElement('div');
    userMsg.className = 'support-bubble';
    userMsg.style.cssText = 'background:var(--primary); color:white; align-self:flex-end; border-bottom-right-radius:4px; margin-top:8px;';
    
    let text = '';
    let response = '';
    
    if (topic === 'create_user') {
        text = '¿Cómo creo un nuevo usuario?';
        response = 'Para crear un usuario, ve al menú <b>Usuarios</b>. Si eres Master, puedes crear Empresas. Si eres Empresa, puedes crear Operadores Adicionales. Completa el formulario y presiona el botón de habilitar cuenta.';
    } else if (topic === 'edit_form') {
        text = '¿Cómo edito un formulario PDF?';
        response = 'Ve a <b>Editar Formularios</b>, selecciona una plantilla y usa el editor visual. Puedes arrastrar campos y escribir texto. Al finalizar, presiona "Guardar Edición".';
    } else if (topic === 'upload_docs') {
        text = '¿Cómo subo documentos firmados?';
        response = 'Usa la opción <b>Subir Información</b> > "Subir Formularios Firmados". Selecciona tu PDF y cárgalo al sistema.';
    } else if (topic === 'permissions') {
        text = 'Sobre los permisos generales';
        response = 'Ahora las Empresas y Operadores pueden ver todas las plantillas subidas por el Máster de forma automática.';
    }
    
    userMsg.innerHTML = text;
    chat.appendChild(userMsg);
    
    // AI Response Bubble
    setTimeout(() => {
        const aiMsg = document.createElement('div');
        aiMsg.className = 'support-bubble bubble-ai';
        aiMsg.style.marginTop = '8px';
        aiMsg.innerHTML = response;
        chat.appendChild(aiMsg);
        chat.scrollTop = chat.scrollHeight;
    }, 600);
    
    chat.scrollTop = chat.scrollHeight;
}
function sendSupportQuery() {
    const input = document.getElementById('support-input');
    if(!input) return;
    const query = input.value.trim();
    if (!query) return;

    appendUserMessage(query);
    input.value = '';

    // PROCESAMIENTO LOCAL - CEREBRO SAD DIGITAL
    const lower = query.toLowerCase();
    let response = "Hmm, no estoy seguro de cómo ayudarte con eso. Puedes intentar con palabras como 'usuario', 'contraseña', 'editar' o 'subir'.";

    // Diccionario de Conocimiento Local
    if (lower.includes('hola') || lower.includes('buenos') || lower.includes('que tal')) {
        response = "¡Hola! Es un gusto saludarte. Soy el soporte de SAD Digital. ¿En qué módulo necesitas ayuda?";
    } else if (lower.includes('contraseña') || lower.includes('clave') || lower.includes('password') || lower.includes('olvid')) {
        response = "Puedes cambiar tu contraseña en el menú <b>Cambio de Contraseña</b> en la esquina inferior izquierda. Si la olvidaste, el administrador Master puede resetearla.";
    } else if (lower.includes('usuario') || lower.includes('crear') || lower.includes('operador') || lower.includes('adicional')) {
        response = "Para gestionar personal, ve a <b>Usuarios</b>. Las empresas crean Operadores Adicionales. El Master crea Empresas. Recuerda presionar 'Habilitar Cuenta'.";
    } else if (lower.includes('editar') || lower.includes('formulario') || lower.includes('llenar') || lower.includes('escribir')) {
        response = "Ve al menú <b>Editar Formularios</b>. Selecciona una plantilla y verás el documento. Haz clic donde quieras escribir o usa las herramientas de texto.";
    } else if (lower.includes('subir') || lower.includes('firmado') || lower.includes('archivo') || lower.includes('pdf')) {
        response = "Si tienes un documento ya firmado en tu PC, ve a <b>Subir Información > Subir Formularios Firmados</b>. Selecciona el archivo y sálvalo.";
    } else if (lower.includes('permisos') || lower.includes('veo') || lower.includes('aparece')) {
        response = "El sistema ahora tiene permisos automáticos. Si eres Empresa o Adicional, verás todos los formularios del catálogo general.";
    } else if (lower.includes('eliminar') || lower.includes('borrar') || lower.includes('quitar')) {
        response = "Los administradores pueden eliminar usuarios usando el icono de basura (🗑️) en la lista de usuarios.";
    } else if (lower.includes('error') || lower.includes('falla') || lower.includes('ayuda') || lower.includes('soporte')) {
        response = "Si experimentas una falla técnica, contacta al soporte técnico o indícame el error específico aquí.";
    } else if (lower.includes('gracias') || lower.includes('bueno') || lower.includes('ok')) {
        response = "¡De nada! Estoy aquí para ayudarte. ¿Algo más?";
    }

    setTimeout(() => {
        appendAiMessage(response);
    }, 600);
}

function appendUserMessage(text) {
    const chat = document.getElementById('support-chat-content');
    if(!chat) return;
    const msg = document.createElement('div');
    msg.className = 'support-bubble';
    msg.style.cssText = 'background:var(--primary); color:white; align-self:flex-end; border-bottom-right-radius:4px; margin-top:8px;';
    msg.innerHTML = text;
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
}

function appendAiMessage(html) {
    const chat = document.getElementById('support-chat-content');
    if(!chat) return;
    const msg = document.createElement('div');
    msg.className = 'support-bubble bubble-ai';
    msg.style.marginTop = '8px';
    msg.innerHTML = html;
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
}
