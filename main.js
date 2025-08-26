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
// --- Pestañas ---
function showArmado() {
    $('#section-armado').classList.remove('hidden');
    $('#section-registro').classList.add('hidden');
    $('#section-cerradas').classList.add('hidden'); // 🔹 ocultar giras cerradas

    $('#tab-armado').classList.add('btn');
    $('#tab-armado').classList.remove('btn-ghost');
    $('#tab-registro').classList.remove('btn');
    $('#tab-registro').classList.add('btn-ghost');
    $('#tab-cerradas').classList.remove('btn');
    $('#tab-cerradas').classList.add('btn-ghost');
}

function showRegistro() {
    $('#section-armado').classList.add('hidden');
    $('#section-registro').classList.remove('hidden');
    $('#section-cerradas').classList.add('hidden'); // 🔹 ocultar giras cerradas

    $('#tab-registro').classList.add('btn');
    $('#tab-registro').classList.remove('btn-ghost');
    $('#tab-armado').classList.remove('btn');
    $('#tab-armado').classList.add('btn-ghost');
    $('#tab-cerradas').classList.remove('btn');
    $('#tab-cerradas').classList.add('btn-ghost');

    cargarGirasDelVendedor();
}

function showCerradas() {
    $('#section-armado').classList.add('hidden');
    $('#section-registro').classList.add('hidden');
    $('#section-cerradas').classList.remove('hidden');

    $('#tab-cerradas').classList.add('btn');
    $('#tab-cerradas').classList.remove('btn-ghost');
    $('#tab-armado').classList.remove('btn');
    $('#tab-armado').classList.add('btn-ghost');
    $('#tab-registro').classList.remove('btn');
    $('#tab-registro').classList.add('btn-ghost');

    cargarGirasCerradas();
}

$('#tab-armado').onclick = showArmado;
$('#tab-registro').onclick = showRegistro;
$('#tab-cerradas').onclick = showCerradas;

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
        .eq('estado', 'activa')
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
        tarjeta.className = 'card';
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
async function cargarGirasCerradas() {
    const { data, error } = await supabase
        .from('giras')
        .select(`
            id,
            nombre,
            fecha_desde,
            fecha_hasta,
            gira_visitas(
                clientes(nombre)
            )
        `)
        .eq('vendedor_id', currentVendedorId)
        .eq('estado', 'cerrada')
        .order('fecha_desde', { ascending: false });

    const contenedor = $('#girasCerradasList');
    contenedor.innerHTML = '';

    if (error) {
        contenedor.innerHTML = `<p class="msg err">Error: ${error.message}</p>`;
        return;
    }

    if (!data || !data.length) {
        contenedor.innerHTML = '<p class="muted">No hay giras cerradas.</p>';
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
            <button class="btn" onclick="verGiraCerrada('${gira.id}')">Ver detalles</button>
        `;
        contenedor.appendChild(tarjeta);
    });
}


function mapTipoGira(valor) {
    switch (valor) {
        case "0": return "Sin gira";
        case "1": return "Gira corta";
        case "2": return "Gira larga";
        default: return null;
    }
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
    } else {
        data.forEach(v => {
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
                    <input type="text" name="motivo_otro" class="hidden motivo-extra" placeholder="Describa el motivo" />

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

            // Mostrar/ocultar campo motivo otro
            const motivoSelect = card.querySelector('.motivo-contacto');
            const motivoExtra = card.querySelector('.motivo-extra');
            motivoSelect.addEventListener('change', () => {
                if (motivoSelect.value === 'Otro') {
                    motivoExtra.classList.remove('hidden');
                } else {
                    motivoExtra.classList.add('hidden');
                    motivoExtra.value = '';
                }
            });

            // Guardar y cerrar registro
            card.querySelector('.cerrarBtn').addEventListener('click', async () => {
                const f = card.querySelector('.visitaForm');

                const insert = {
                    gira_visita_id: f.dataset.id,
                    tipo_gira: mapTipoGira(f.querySelector('[name="tipo_gira"]').value),
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
    }

    // Botón para agregar nueva visita/cliente
    const btnAgregar = document.createElement('button');
    btnAgregar.className = 'btn';
    btnAgregar.textContent = '➕ Agregar cliente';
    btnAgregar.onclick = () => {
        const nuevaCard = crearVisitaCard(giraId);
        contenedor.insertBefore(nuevaCard, btnAgregar);
    };
    contenedor.appendChild(btnAgregar);
     // 🔹 Botón cerrar gira
    const btnCerrarGira = document.createElement('button');
    btnCerrarGira.className = 'btn btn-danger';
    btnCerrarGira.style.marginTop = '8px';
    btnCerrarGira.textContent = '🚫 Cerrar gira';
    btnCerrarGira.onclick = async () => {
        if (!confirm('¿Seguro que querés cerrar esta gira?')) return;

        const { error } = await supabase
            .from('giras')
            .update({ estado: 'cerrada' })
            .eq('id', giraId);

        if (error) {
            showToast('❌ Error al cerrar la gira: ' + error.message, 'err');
            return;
        }

        showToast('✅ Gira cerrada', 'ok');
        await cargarGirasDelVendedor();
    };
    contenedor.appendChild(btnCerrarGira);

    // Botón volver
    const btnVolver = document.createElement('button');
    btnVolver.className = 'btn-ghost';
    btnVolver.textContent = '⬅ Volver a giras';
    btnVolver.onclick = cargarGirasDelVendedor;
    contenedor.appendChild(btnVolver);
}
async function verGiraCerrada(giraId) {
    const { data, error } = await supabase
        .from('gira_visitas')
        .select(`
            id,
            clientes(nombre),
            gira_respuestas(
                tipo_gira,
                medio_contacto,
                tiempo_visita,
                motivo_contacto,
                nota_pedido,
                monto_vendido,
                cliente_tenia_deuda,
                deuda_cobrada,
                monto_cobrado,
                comentario,
                alerta
            )
        `)
        .eq('gira_id', giraId);

    const contenedor = $('#girasCerradasList');
    contenedor.innerHTML = `<button class="btn-ghost" onclick="cargarGirasCerradas()">⬅ Volver</button>`;

    if (error) {
        contenedor.innerHTML += `<p class="msg err">Error: ${error.message}</p>`;
        return;
    }

    if (!data || !data.length) {
        contenedor.innerHTML += '<p class="muted">No hay visitas registradas para esta gira.</p>';
        return;
    }

    data.forEach(visita => {
        const r = visita.gira_respuestas?.[0] || {};
        const card = document.createElement('div');
        card.className = 'rowCard';
        card.innerHTML = `
            <h4>${visita.clientes?.nombre || 'Sin cliente'}</h4>
            <p><strong>Tipo de gira:</strong> ${r.tipo_gira || '-'}</p>
            <p><strong>Medio de contacto:</strong> ${r.medio_contacto || '-'}</p>
            <p><strong>Tiempo visita:</strong> ${r.tiempo_visita || '-'} min</p>
            <p><strong>Motivo:</strong> ${r.motivo_contacto || '-'}</p>
            <p><strong>Nota de pedido:</strong> ${r.nota_pedido ? 'Sí' : 'No'}</p>
            <p><strong>Monto vendido:</strong> ${r.monto_vendido ?? '-'}</p>
            <p><strong>Cliente tenía deuda:</strong> ${r.cliente_tenia_deuda ? 'Sí' : 'No'}</p>
            <p><strong>Deuda cobrada:</strong> ${r.deuda_cobrada ? 'Sí' : 'No'}</p>
            <p><strong>Monto cobrado:</strong> ${r.monto_cobrado ?? '-'}</p>
            <p><strong>Comentario:</strong> ${r.comentario || '-'}</p>
            <p><strong>Alerta:</strong> ${r.alerta || '-'}</p>
        `;
        contenedor.appendChild(card);
    });
}



// ===============================
// Card para nueva visita
// ===============================
function crearVisitaCard(giraId) {
    const opcionesClientes = clientesLista
        .map(c => `<option value="${c.id}">${c.nombre}</option>`)
        .join('');

    const card = document.createElement('div');
    card.className = 'rowCard';
    card.innerHTML = `
        <h2>Nueva visita</h2>
        <form class="form-grid visitaForm">
            
            <!-- Selector cliente -->
            <label class="full-width">
                <select name="cliente_id" class="cliente-select">
                    <option value="">-- Seleccionar cliente --</option>
                    ${opcionesClientes}
                </select>
            </label>

            <!-- Checkbox cliente nuevo -->
            <label>Cliente nuevo</label>
            <label class="switch">
                <input type="checkbox" name="es_cliente_nuevo">
                <span class="slider"></span>
            </label>

            <!-- Campos formulario cliente existente -->
            <div class="campos-existente">
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
                <input type="text" name="motivo_otro" class="hidden motivo-extra" placeholder="Describa el motivo" />

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
            </div>

            <!-- Campos formulario cliente nuevo -->
            <div class="campos-nuevo hidden">
                <label>Razón social del local</label>
                <input type="text" name="razon_social" />

                <label>Localidad del cliente potencial</label>
                <input type="text" name="localidad" />

                <label>¿Cómo fue el contacto con este cliente?</label>
                <input type="text" name="contacto" />

                <label>Nombre y apellido del cliente potencial</label>
                <input type="text" name="nombre_apellido" />

                <label>Teléfono del cliente potencial</label>
                <input type="text" name="telefono" />

                <label>Ubicación</label>
                <input type="text" name="ubicacion" />

                <label>Vidriera</label>
                <input type="text" name="vidriera" />

                <label>Manejo de marcas de la competencia</label>
                <input type="text" name="marcas_competencia" />

                <label>¿Le presentaste propuesta de negocio?</label>
                <select name="propuesta">
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                </select>

                <label>Monto potencial estimado</label>
                <input type="number" name="monto_potencial" placeholder="Sólo el número, sin puntos ni $" />

                <label>Comentario</label>
                <textarea name="comentario"></textarea>

                <label>Alerta</label>
                <textarea name="alerta"></textarea>
            </div>
        </form>

        <button type="button" class="btn cerrarBtn" style="margin-top:8px">Cerrar registro</button>
    `;

    const chkNuevo = card.querySelector('[name="es_cliente_nuevo"]');
    const selCliente = card.querySelector('[name="cliente_id"]');
    const camposExistente = card.querySelector('.campos-existente');
    const camposNuevo = card.querySelector('.campos-nuevo');

    chkNuevo.addEventListener('change', () => {
        if (chkNuevo.checked) {
            selCliente.disabled = true;
            camposExistente.classList.add('hidden');
            camposNuevo.classList.remove('hidden');
        } else {
            selCliente.disabled = false;
            camposExistente.classList.remove('hidden');
            camposNuevo.classList.add('hidden');
        }
    });

    // Mostrar campo "otro motivo" (solo para existente)
    const motivoSelect = card.querySelector('.motivo-contacto');
    const motivoExtra = card.querySelector('.motivo-extra');
    if (motivoSelect) {
        motivoSelect.addEventListener('change', () => {
            if (motivoSelect.value === 'Otro') {
                motivoExtra.classList.remove('hidden');
            } else {
                motivoExtra.classList.add('hidden');
                motivoExtra.value = '';
            }
        });
    }

    // Guardar visita (igual que antes)
   // Dentro del evento cerrarBtn
// Guardar visita
// Guardar visita
card.querySelector('.cerrarBtn').addEventListener('click', async () => {
    const f = card.querySelector('.visitaForm'); // 🔹 Mover aquí arriba

    let clienteIdFinal = selCliente.value;

    if (chkNuevo.checked) {
        const nombreNuevo = f.querySelector('[name="razon_social"]').value.trim();
        if (!nombreNuevo) {
            showToast('⚠ Ingresá razón social del cliente', 'err');
            return;
        }
        const { data: nuevoCliente, error: clienteErr } = await supabase
            .from('clientes')
            .insert({ nombre: nombreNuevo, vendedor_id: currentVendedorId, activo: true })
            .select('id, nombre')
            .single();
        if (clienteErr) {
            showToast('❌ Error creando cliente: ' + clienteErr.message, 'err');
            return;
        }
        clientesLista.push(nuevoCliente);
        clienteIdFinal = nuevoCliente.id;
    }

    // Inserto en gira_visitas
    const { data: visitaInsert, error: visErr } = await supabase
        .from('gira_visitas')
        .insert({
            gira_id: giraId,
            cliente_id: clienteIdFinal,
            motivo: "Vincular",
            cerrado: true
        })
        .select('id')
        .single();

    if (visErr) {
        showToast('❌ Error guardando visita: ' + visErr.message, 'err');
        return;
    }

        // Armar objeto para gira_respuestas
    let comentarioValor = null;
    let alertaValor = null;

    if (chkNuevo.checked) {
        comentarioValor = camposNuevo.querySelector('[name="comentario"]').value || null;
        alertaValor = camposNuevo.querySelector('[name="alerta"]').value || null;
    } else {
        comentarioValor = camposExistente.querySelector('[name="comentario"]').value || null;
        alertaValor = camposExistente.querySelector('[name="alerta"]').value || null;
    }

    let respuestasObj = { gira_visita_id: visitaInsert.id };

    if (chkNuevo.checked) {
        // Cliente nuevo → leer de campos-nuevo
        respuestasObj = {
            ...respuestasObj,
            razon_social: camposNuevo.querySelector('[name="razon_social"]').value || null,
            localidad: camposNuevo.querySelector('[name="localidad"]').value || null,
            contacto_cliente: camposNuevo.querySelector('[name="contacto"]').value || null,
            nombre_apellido: camposNuevo.querySelector('[name="nombre_apellido"]').value || null,
            telefono: camposNuevo.querySelector('[name="telefono"]').value || null,
            ubicacion: camposNuevo.querySelector('[name="ubicacion"]').value || null,
            vidriera: camposNuevo.querySelector('[name="vidriera"]').value || null,
            marcas_competencia: camposNuevo.querySelector('[name="marcas_competencia"]').value || null,
            propuesta_negocio: camposNuevo.querySelector('[name="propuesta"]').value === "true",
            monto_potencial: camposNuevo.querySelector('[name="monto_potencial"]').value || null,
            comentario: camposNuevo.querySelector('[name="comentario"]').value || null,
            alerta: camposNuevo.querySelector('[name="alerta"]').value || null
        };
    } else {
        // Cliente existente → leer de campos-existente
        respuestasObj = {
            ...respuestasObj,
            tipo_gira: mapTipoGira(camposExistente.querySelector('[name="tipo_gira"]').value),
            medio_contacto: Array.from(camposExistente.querySelectorAll('input[name="medio_contacto"]:checked'))
                .map(cb => cb.value)
                .join(', ') || null,
            tiempo_visita: parseInt(camposExistente.querySelector('[name="tiempo_visita"]').value) || null,
            motivo_contacto: (() => {
                const motivo = camposExistente.querySelector('[name="motivo_contacto"]').value;
                if (motivo === 'Otro') {
                    return `Otro: ${camposExistente.querySelector('[name="motivo_otro"]').value}`;
                }
                return motivo || null;
            })(),
            nota_pedido: camposExistente.querySelector('[name="nota_pedido"]').value === 'true',
            monto_vendido: camposExistente.querySelector('[name="monto_vendido"]').value
                ? parseFloat(camposExistente.querySelector('[name="monto_vendido"]').value)
                : null,
            cliente_tenia_deuda: camposExistente.querySelector('[name="cliente_tenia_deuda"]').value === 'true',
            deuda_cobrada: camposExistente.querySelector('[name="deuda_cobrada"]').value === 'true',
            monto_cobrado: camposExistente.querySelector('[name="monto_cobrado"]').value
                ? parseFloat(camposExistente.querySelector('[name="monto_cobrado"]').value)
                : null,
            comentario: camposExistente.querySelector('[name="comentario"]').value || null,
            alerta: camposExistente.querySelector('[name="alerta"]').value || null
        };
    }


    // Insertar en gira_respuestas
    const { error: respErr } = await supabase
        .from('gira_respuestas')
        .insert([respuestasObj]);

    if (respErr) {
        showToast('⚠ Error guardando respuestas: ' + respErr.message, 'err');
    } else {
        // 🔹 También lo enviamos a Google Sheets
        try {
            console.log("🔄 Enviando datos a Google Sheets...", respuestasObj);

            await fetch("https://script.google.com/macros/s/AKfycbx8wnoroPhJl6bdQnz_mJwOnYe7Zn3qFAu1P26wsLHIcm-MhRoifqxKlMh_JXW64JU/exec", {
                method: "POST",
                headers: {
                "Content-Type": "application/x-www-form-urlencoded"
                },
                body: toFormData(respuestasObj)
            });

            console.log("✅ Solicitud enviada");
        } catch (e) {
            console.error("Error enviando a Google Sheets", e);
        }
    }

    showToast('✅ Visita agregada', 'ok');
    card.remove();
    await cargarVisitasDeGira(giraId);

});


    return card;
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
