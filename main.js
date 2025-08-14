const SUPABASE_URL = "https://glxmcbuyxgkrxstiahbk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdseG1jYnV5eGdrcnhzdGlhaGJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwODY5NTcsImV4cCI6MjA3MDY2Mjk1N30.ij95we2hunyG3BMQoF_vidQKSTMLVhMf5AHKGq846XI";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentVendedorId = null;
let clientesLista = [];

const $ = s => document.querySelector(s);
const show = el => el.classList.remove('hidden');
const hide = el => el.classList.add('hidden');
const flash = (el, msg, type = '') => { el.textContent = msg || ''; el.className = 'msg' + (type ? ' ' + type : ''); };

function setAuthMode(m) { m === 'login' ? (show($('#loginForm')), hide($('#signupForm'))) : (hide($('#loginForm')), show($('#signupForm'))); }
function go(v) { v === 'home' ? (hide($('#view-auth')), show($('#view-home'))) : (show($('#view-auth')), hide($('#view-home'))); }

// --- Pestañas ---
function showArmado() {
    $('#section-armado').classList.remove('hidden');
    $('#section-registro').classList.add('hidden');
    $('#tab-armado').classList.add('btn');
    $('#tab-armado').classList.remove('btn-ghost');
    $('#tab-registro').classList.remove('btn');
    $('#tab-registro').classList.add('btn-ghost');
}
function showRegistro() {
    $('#section-armado').classList.add('hidden');
    $('#section-registro').classList.remove('hidden');
    $('#tab-registro').classList.add('btn');
    $('#tab-registro').classList.remove('btn-ghost');
    $('#tab-armado').classList.remove('btn');
    $('#tab-armado').classList.add('btn-ghost');
    cargarGirasDelVendedor();
}
$('#tab-armado').onclick = showArmado;
$('#tab-registro').onclick = showRegistro;

// --- Lógica de negocio ---
async function ensureVendedorProfile(user) {
    if (!user) return;
    const { id, email, user_metadata } = user;
    const nombre = user_metadata?.nombre || null;
    const apellido = user_metadata?.apellido || null;
    const { data: existing } = await supabase.from('vendedores').select('id').eq('id', id).maybeSingle();
    if (!existing) {
        await supabase.from('vendedores').insert({ id, email, nombre, apellido, activo: true });
    }
}

async function cargarClientes() {
    const { data, error } = await supabase.from('clientes').select('id, nombre').eq('activo', true).order('nombre');
    if (error) { console.error(error); return; }
    clientesLista = data || [];
}

async function agregarCliente(nombreCliente) {
    if (!nombreCliente) return flash($('#clienteMsg'), 'Nombre requerido', 'err');
    const { error } = await supabase.from('clientes').insert({ vendedor_id: currentVendedorId, nombre: nombreCliente });
    if (error) return flash($('#clienteMsg'), error.message, 'err');
    flash($('#clienteMsg'), '✅ Cliente agregado', 'ok');
    await cargarClientes();
}

function setDefaultWeek() {
    const t = new Date(), d = t.getDay(), dm = (d + 6) % 7;
    const mon = new Date(t); mon.setDate(t.getDate() - dm);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const fmt = d => d.toISOString().slice(0, 10);
    $('#fecha_desde').value = fmt(mon);
    $('#fecha_hasta').value = fmt(sun);
}

function visitaRowTemplate() {
    let opciones = clientesLista.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    return `
    <div class="rowCard">
        <div class="row">
            <div>
                <label>Cliente</label>
                <select name="cliente" required>
                    <option value="">-- Seleccionar --</option>
                    ${opciones}
                </select>
            </div>
            <div>
                <label>Motivo</label>
                <select name="motivo" class="motivo-contacto">
                    <option value="">-- Seleccionar --</option>
                    <option value="Cobrar">Cobrar</option>
                    <option value="Vender">Vender</option>
                    <option value="Vincular">Vincular</option>
                    <option value="Otro">Otro</option>
                </select>
                <input type="text" name="motivo_otro" class="hidden motivo-extra" placeholder="Describa el motivo" />
            </div>
        </div>
        <button type="button" class="btn-ghost removeVisita" style="margin-top:8px">Quitar</button>
    </div>`;
}


function addVisitaRow() {
    const wrap = document.createElement('div');
    wrap.innerHTML = visitaRowTemplate();
    const el = wrap.firstElementChild;

    // Botón para quitar fila
    el.querySelector('.removeVisita').addEventListener('click', () => el.remove());

    // Lógica de mostrar/ocultar input "Otro"
    const motivoSelect = el.querySelector('.motivo-contacto');
    const motivoExtra = el.querySelector('.motivo-extra');

    motivoSelect.addEventListener('change', () => {
        if (motivoSelect.value === 'Otro') {
            motivoExtra.classList.remove('hidden');
        } else {
            motivoExtra.classList.add('hidden');
            motivoExtra.value = '';
        }
    });

    $('#visitasList').appendChild(el);
}


async function createGiraAndVisitas() {
    const nombreGira = $('#nombre_gira').value.trim();
    const desde = $('#fecha_desde').value;
    const hasta = $('#fecha_hasta').value;

    if (!nombreGira) return flash($('#giraMsg'), 'Ingresá un nombre para la gira', 'err');
    if (!desde || !hasta) return flash($('#giraMsg'), 'Completá las fechas', 'err');
    if (hasta < desde) return flash($('#giraMsg'), 'Fechas inválidas', 'err');

    const cards = Array.from($('#visitasList').children);
    if (!cards.length) return flash($('#giraMsg'), 'Agregá al menos un cliente', 'err');

    const { data: gira, error: giraErr } = await supabase.from('giras')
        .insert({ vendedor_id: currentVendedorId, nombre: nombreGira, fecha_desde: desde, fecha_hasta: hasta })
        .select('id').single();
    if (giraErr) return flash($('#giraMsg'), giraErr.message, 'err');

    const visitas = cards.map(c => {
        const motivoSel = c.querySelector('select[name="motivo"]').value;
        const motivoOtro = c.querySelector('input[name="motivo_otro"]').value.trim();
        const motivoFinal = motivoSel === 'Otro' ? `Otro: ${motivoOtro}` : motivoSel;

        return {
            gira_id: gira.id,
            cliente_id: c.querySelector('select[name="cliente"]').value,
            motivo: motivoFinal || ''
        };
    }).filter(v => v.cliente_id);


    const { error: visErr } = await supabase.from('gira_visitas').insert(visitas);
    if (visErr) return flash($('#giraMsg'), visErr.message, 'err');

    flash($('#giraMsg'), '✅ Gira guardada', 'ok');
    $('#nombre_gira').value = '';
    $('#visitasList').innerHTML = ''; addVisitaRow();
    await cargarGirasDelVendedor();
}

// ============================================
// Cargar giras del vendedor autenticado
// ============================================
async function cargarGirasDelVendedor() {
    const { data, error } = await supabase
        .from('giras')
        .select(`
            id,
            nombre,
            fecha_desde,
            fecha_hasta,
            gira_visitas(
                id,
                clientes(nombre)
            )
        `)
        .eq('vendedor_id', currentVendedorId)
        .order('fecha_desde', { ascending: false });

    const contenedor = document.getElementById('registroVisitasList');
    contenedor.innerHTML = '';

    if (error) {
        contenedor.innerHTML = `<p class="msg err">Error: ${error.message}</p>`;
        return;
    }

    if (!data || !data.length) {
        contenedor.innerHTML = '<p class="muted">No hay giras registradas.</p>';
        return;
    }

    data.forEach(gira => {
        const clientes = gira.gira_visitas
            .map(v => v.clientes?.nombre || 'Sin nombre')
            .join(', ');

        const tarjeta = document.createElement('div');
        tarjeta.className = 'rowCard';
        tarjeta.innerHTML = `
            <h3>${gira.nombre || 'Sin nombre'}</h3>
            <p><strong>Desde:</strong> ${gira.fecha_desde} &nbsp; <strong>Hasta:</strong> ${gira.fecha_hasta}</p>
            <p><strong>Clientes:</strong> ${clientes || 'Sin clientes asignados'}</p>
            <button class="btn" onclick="cargarVisitasDeGira('${gira.id}')">Ver registro</button>
        `;
        contenedor.appendChild(tarjeta);
    });
}

// Función de mensaje flotante
function showToast(message, type = 'ok') {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.padding = '10px 16px';
    toast.style.borderRadius = '8px';
    toast.style.color = '#fff';
    toast.style.fontSize = '14px';
    toast.style.zIndex = '9999';
    toast.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
    toast.style.backgroundColor = type === 'ok' ? '#16a34a' : '#dc2626';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

async function cargarVisitasDeGira(giraId) {
    const { data, error } = await supabase
        .from('gira_visitas')
        .select(`
            id,
            clientes(nombre)
        `)
        .eq('gira_id', giraId)
        .eq('cerrado', false);

    const contenedor = document.getElementById('registroVisitasList');
    contenedor.innerHTML = '';

    if (error) {
        contenedor.innerHTML = `<p class="msg err">Error: ${error.message}</p>`;
        return;
    }

    if (!data || !data.length) {
        contenedor.innerHTML = '<p class="muted">No hay visitas pendientes para esta gira.</p>';
        return;
    }

    data.forEach(v => {
        document.addEventListener('change', function (e) {
            if (e.target.classList.contains('motivo-contacto')) {
                const inputOtro = e.target.nextElementSibling;
                if (e.target.value === 'Otro') {
                    inputOtro.classList.remove('hidden');
                } else {
                    inputOtro.classList.add('hidden');
                    inputOtro.value = '';
                }
            }
        });

        const card = document.createElement('div');
        card.className = 'rowCard';
        card.dataset.visitaId = v.id;
        card.innerHTML = `
            <h2>${v.clientes?.nombre || 'Sin nombre'}</h2>
            <form class="form-grid visitaForm" data-id="${v.id}">
                <label>Tipo de gira</label>
                <select name="tipo_gira">
                    <option value="">-- Seleccionar --</option>
                    <option value="0">0 - Sin gira</option>
                    <option value="1">1 - Gira corta</option>
                    <option value="2">2 - Gira larga</option>
                </select>

                <label>Medios de contacto</label>
                <div class="medios-contacto">
                    <label><input type="checkbox" name="medio_contacto" value="WhatsApp"> WhatsApp</label>
                    <label><input type="checkbox" name="medio_contacto" value="Teléfono"> Teléfono</label>
                    <label><input type="checkbox" name="medio_contacto" value="Email"> Email</label>
                    <label><input type="checkbox" name="medio_contacto" value="Visita"> Visita</label>
                </div>

                <label>Tiempo de visita (minutos)</label>
                <input name="tiempo_visita" type="number"/>

                <label>Motivo del contacto</label>
                <select name="motivo_contacto" class="motivo-contacto">
                    <option value="">-- Seleccionar --</option>
                    <option value="Vincular">Vincular</option>
                    <option value="Vender">Vender</option>
                    <option value="Cobrar">Cobrar</option>
                    <option value="Otro">Otro</option>
                </select>

                <div id="otroMotivoWrapper" class="hidden motivo-extra">
                    <input type="text" name="motivo_otro" placeholder="Describa el motivo" />
                </div>

                <label>¿Nota de pedido?</label>
                <select name="nota_pedido">
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                </select>

                <label>Monto vendido</label>
                <input name="monto_vendido" type="number"/>

                <label>¿Cliente tenía deuda?</label>
                <select name="cliente_tenia_deuda">
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                </select>

                <label>¿Se cobró deuda?</label>
                <select name="deuda_cobrada">
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                </select>

                <label>Monto cobrado</label>
                <input name="monto_cobrado" type="number"/>

                <label>Comentario</label>
                <textarea name="comentario"></textarea>

                <label>Alerta</label>
                <textarea name="alerta"></textarea>
            </form>

            <button type="button" class="btn cerrarBtn" style="margin-top:8px">Cerrar registro</button>
        `;

        card.querySelector('.cerrarBtn').addEventListener('click', async () => {
            const f = card.querySelector('.visitaForm');

            const insert = {
                gira_visita_id: f.dataset.id,
                tipo_gira: parseInt(f.querySelector('[name="tipo_gira"]').value) || null,
                medio_contacto: Array.from(f.querySelectorAll('input[name="medio_contacto"]:checked'))
                            .map(cb => cb.value)
                            .join(', ') || null,
                tiempo_visita: parseInt(f.querySelector('[name="tiempo_visita"]').value) || null,
                motivo_contacto: (() => {
                    const motivo = f.querySelector('[name="motivo_contacto"]').value;
                    if (motivo === 'Otro') {
                        return `Otro: ${f.querySelector('[name="motivo_otro"]').value}`;
                    }
                    return motivo || null;
                })(),
                nota_pedido: f.querySelector('[name="nota_pedido"]').value === 'true',
                monto_vendido: f.querySelector('[name="monto_vendido"]').value
                    ? parseFloat(f.querySelector('[name="monto_vendido"]').value)
                    : null,
                cliente_tenia_deuda: f.querySelector('[name="cliente_tenia_deuda"]').value === 'true',
                deuda_cobrada: f.querySelector('[name="deuda_cobrada"]').value === 'true',
                monto_cobrado: f.querySelector('[name="monto_cobrado"]').value
                    ? parseFloat(f.querySelector('[name="monto_cobrado"]').value)
                    : null,
                comentario: f.querySelector('[name="comentario"]').value || null,
                alerta: f.querySelector('[name="alerta"]').value || null
            };

            const { error: insertErr } = await supabase.from('gira_respuestas').insert(insert);
            if (insertErr) {
                showToast('❌ Error guardando registro: ' + insertErr.message, 'err');
                return;
            }

            const { error: cerrarErr } = await supabase
                .from('gira_visitas')
                .update({ cerrado: true })
                .eq('id', f.dataset.id);

            if (cerrarErr) {
                showToast('❌ Error al cerrar registro: ' + cerrarErr.message, 'err');
                return;
            }

            showToast('✅ Registro guardado y cerrado', 'ok');
            card.remove();
        });

        contenedor.appendChild(card);
    });

    const btnVolver = document.createElement('button');
    btnVolver.className = 'btn-ghost';
    btnVolver.textContent = '⬅ Volver a giras';
    btnVolver.onclick = cargarGirasDelVendedor;
    contenedor.appendChild(btnVolver);
}

async function guardarRegistroVisitas() {
    const formularios = document.querySelectorAll('.visitaForm');
    const inserts = [];

    formularios.forEach(f => {
        inserts.push({
            gira_visita_id: f.dataset.id,
            tipo_gira: parseInt(f.querySelector('[name="tipo_gira"]').value) || null,
            medio_contacto: Array.from(f.querySelectorAll('input[name="medio_contacto"]:checked'))
                     .map(cb => cb.value)
                     .join(', ') || null,
            tiempo_visita: parseInt(f.querySelector('[name="tiempo_visita"]').value) || null,
            motivo_contacto: (() => {
                const motivo = f.querySelector('[name="motivo_contacto"]').value;
                if (motivo === 'Otro') {
                    return `Otro: ${f.querySelector('[name="motivo_otro"]').value}`;
                }
                return motivo || null;
            })(),
            nota_pedido: f.querySelector('[name="nota_pedido"]').value === 'true',
            monto_vendido: f.querySelector('[name="monto_vendido"]').value
                ? parseFloat(f.querySelector('[name="monto_vendido"]').value)
                : null,
            cliente_tenia_deuda: f.querySelector('[name="cliente_tenia_deuda"]').value === 'true',
            deuda_cobrada: f.querySelector('[name="deuda_cobrada"]').value === 'true',
            monto_cobrado: f.querySelector('[name="monto_cobrado"]').value
                ? parseFloat(f.querySelector('[name="monto_cobrado"]').value)
                : null,
            comentario: f.querySelector('[name="comentario"]').value || null,
            alerta: f.querySelector('[name="alerta"]').value || null
        });
    });

    const { error } = await supabase.from('gira_respuestas').insert(inserts);

    if (error) {
        flash($('#registroMsg'), error.message, 'err');
    } else {
        flash($('#registroMsg'), '✅ Registro guardado', 'ok');
    }
}

// Eventos login/registro
$('#goToSignup').onclick = () => setAuthMode('signup');
$('#backToLogin').onclick = () => setAuthMode('login');
$('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const { data, error } = await supabase.auth.signInWithPassword({
        email: $('#log_email').value.trim(),
        password: $('#log_pass').value
    });
    if (error) return flash($('#loginMsg'), error.message, 'err');
    currentUser = data.user; currentVendedorId = data.user.id;
    await ensureVendedorProfile(currentUser);
    await cargarClientes();
    const { nombre, apellido } = currentUser.user_metadata || {};
    $('#userEmail').textContent = `Bienvenido ${nombre ?? ''} ${apellido ?? ''}`;
    setDefaultWeek(); $('#visitasList').innerHTML = ''; addVisitaRow();
    await cargarGirasDelVendedor();
    showArmado();
    go('home');
};
$('#signupForm').onsubmit = async e => {
    e.preventDefault();
    const nombre = $('#reg_name').value.trim(), apellido = $('#reg_last').value.trim();
    const { data, error } = await supabase.auth.signUp({
        email: $('#reg_email').value.trim(),
        password: $('#reg_pass').value,
        options: { data: { nombre, apellido } }
    });
    if (error) return flash($('#signupMsg'), error.message, 'err');
    if (data.session?.user) await ensureVendedorProfile(data.session.user);
    setAuthMode('login'); flash($('#loginMsg'), 'Cuenta creada', 'ok');
};
$('#logoutBtn').onclick = async () => { await supabase.auth.signOut(); go('auth'); setAuthMode('login'); };
$('#addVisitaBtn').onclick = () => addVisitaRow();
$('#guardarGiraBtn').onclick = () => createGiraAndVisitas();
$('#btnAgregarCliente').onclick = async () => { await agregarCliente($('#nuevoClienteNombre').value.trim()); $('#nuevoClienteNombre').value = ''; };

// Sesión persistente
(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
        currentUser = session.user; currentVendedorId = session.user.id;
        await ensureVendedorProfile(currentUser);
        await cargarClientes();
        const { nombre, apellido } = currentUser.user_metadata || {};
        $('#userEmail').textContent = `Bienvenido ${nombre ?? ''} ${apellido ?? ''}`;
        setDefaultWeek(); $('#visitasList').innerHTML = ''; addVisitaRow();
        await cargarGirasDelVendedor();
        showArmado();
        go('home');
    }
})();
