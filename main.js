/* ========= SUPABASE ========= */
const SUPABASE_URL = "https://glxmcbuyxgkrxstiahbk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdseG1jYnV5eGdrcnhzdGlhaGJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwODY5NTcsImV4cCI6MjA3MDY2Mjk1N30.ij95we2hunyG3BMQoF_vidQKSTMLVhMf5AHKGq846XI";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ========= STATE ========= */
let currentUser = null;
let currentRol = null;
let currentVendedorId = null;
let clientesLista = [];

/* ========= DOM helpers ========= */
const $ = s => document.querySelector(s);
const show = el => el && el.classList.remove('hidden');
const hide = el => el && el.classList.add('hidden');
const flash = (el, msg, type = '') => {
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'msg' + (type ? ' ' + type : '');
};

/* ========= NAV / VISTAS ========= */
function setAuthMode(m) {
  const login = $('#loginForm'), signup = $('#signupForm');
  if (m === 'login') { show(login); hide(signup); }
  else { hide(login); show(signup); }
}
function go(v) {
  const auth = $('#view-auth');
  const home = $('#view-home');
  const dash = $('#section-dashboard');
  const topbar = $('#topbar');
  const panelPrioris = $('#panel-prioritarios');

  if (v === 'home') {
    hide(auth);
    show(home);
    show(topbar);
    hide(dash);
    // El panel de prioritarios lo controla cargarPrioritarios() tras login
  } else {
    // Vista auth (login/signup)
    show(auth);
    hide(home);
    hide(dash);
    hide(topbar);
    hide(panelPrioris); // nunca visibles antes de login
  }
}


/* ============ Sheets helpers ============ */
async function enviarFilaAGoogleSheets(payload) {
  try {
    const { data: s } = await supabase.auth.getSession();
    const jwt = s?.session?.access_token || SUPABASE_ANON_KEY;
    const { data, error } = await supabase.functions.invoke("sheets-forwarder", {
      body: payload,
      headers: { Authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY }
    });
    if (error) console.error("Error sheets-forwarder:", error);
    else console.log("Sheets OK:", data);
  } catch (e) { console.error("Excepción sheets-forwarder:", e); }
}
function mapRespuestasAPlanilla(r) {
  return {
    id: null,
    gira_visita_id: r.gira_visita_id ?? null,
    tipo_gira: typeof r.tipo_gira === 'number' ? r.tipo_gira : null,
    medio_contacto: r.medio_contacto ?? null,
    tiempo_visita: r.tiempo_visita ?? null,
    motivo_contacto: r.motivo_contacto ?? null,
    nota_pedido: r.nota_pedido ?? null,
    monto_vendido: r.monto_vendido ?? null,
    cliente_tenia_deuda: r.cliente_tenia_deuda ?? null,
    deuda_cobrada: r.deuda_cobrada ?? null,
    monto_cobrado: r.monto_cobrado ?? null,
    comentario: r.comentario ?? null,
    alerta: r.alerta ?? null,
    razon_social: r.razon_social ?? null,
    localidad: r.localidad ?? null,
    contacto_cliente: r.contacto_cliente ?? null,
    nombre_apellido: r.nombre_apellido ?? null,
    telefono: r.telefono ?? null,
    ubicacion: r.ubicacion ?? null,
    vidriera: r.vidriera ?? null,
    marcas_competencia: r.marcas_competencia ?? null,
    propuesta_negocio: r.propuesta_negocio ?? null,
    monto_potencial: r.monto_potencial ?? null
  };
}

/* ============ Tabs ============ */
function selectTab(activeId) {
  const tabs = [
    { btn:'#tab-armado', sec:'#section-armado' },
    { btn:'#tab-registro', sec:'#section-registro' },
    { btn:'#tab-cerradas', sec:'#section-cerradas' },
  ];
  for (const t of tabs) {
    const b = $(t.btn), s = $(t.sec);
    if (!b || !s) continue;
    if (t.sec === activeId) { show(s); b.classList.add('btn'); b.classList.remove('btn-ghost'); }
    else { hide(s); b.classList.remove('btn'); b.classList.add('btn-ghost'); }
  }
}
function showArmado(){ selectTab('#section-armado'); }
function showRegistro() {
  const a=$('#section-armado'), r=$('#section-registro'), c=$('#section-cerradas');
  hide(a); show(r); hide(c);

  $('#tab-registro')?.classList.add('btn');
  $('#tab-registro')?.classList.remove('btn-ghost');
  $('#tab-armado')?.classList.remove('btn');
  $('#tab-armado')?.classList.add('btn-ghost');
  $('#tab-cerradas')?.classList.remove('btn');
  $('#tab-cerradas')?.classList.add('btn-ghost');

  if (currentRol === 'admin') {
    loadVendedoresForFilter();
    cargarGirasDelVendedor(null);
  } else {
    cargarGirasDelVendedor();
  }
}
function showCerradas() {
  const a=$('#section-armado'), r=$('#section-registro'), c=$('#section-cerradas');
  hide(a); hide(r); show(c);

  $('#tab-cerradas')?.classList.add('btn');
  $('#tab-cerradas')?.classList.remove('btn-ghost');
  $('#tab-armado')?.classList.remove('btn');
  $('#tab-armado')?.classList.add('btn-ghost');
  $('#tab-registro')?.classList.remove('btn');
  $('#tab-registro')?.classList.add('btn-ghost');

  loadFiltroCerradas();                // ← ahora SIEMPRE mostramos el filtro (con o sin vendedor)
  cargarGirasCerradas(null, null, null);
}

$('#tab-armado')?.addEventListener('click', showArmado);
$('#tab-registro')?.addEventListener('click', showRegistro);
$('#tab-cerradas')?.addEventListener('click', showCerradas);

/* ============ Lógica base ============ */
async function ensureVendedorProfile(user) {
  if (!user) return null;
  const { id, email, user_metadata } = user;
  const nombre = user_metadata?.nombre || null;
  const apellido = user_metadata?.apellido || null;

  const { data: existing, error: selErr } = await supabase
    .from('vendedores').select('id, rol, nombre, apellido').eq('id', id).maybeSingle();

  if (!selErr && existing) return existing;

  const { data: inserted, error: insErr } = await supabase
    .from('vendedores')
    .insert({ id, email, nombre, apellido, activo: true, rol: 'vendedor' })
    .select('id, rol, nombre, apellido')
    .single();

  if (insErr) { console.error(insErr); return null; }
  return inserted;
}

async function cargarClientes() {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre');
  if (error) { console.error(error); clientesLista = []; return; }
  clientesLista = data || [];
}

async function agregarCliente(nombreCliente) {
  if (!nombreCliente) return flash($('#clienteMsg'), 'Nombre requerido', 'err');
  const { error } = await supabase
    .from('clientes')
    .insert({ vendedor_id: currentVendedorId, nombre: nombreCliente, activo: true });
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
  const opciones = clientesLista.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
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
  el.querySelector('.removeVisita').addEventListener('click', () => el.remove());
  const motivoSelect = el.querySelector('.motivo-contacto');
  const motivoExtra = el.querySelector('.motivo-extra');
  motivoSelect.addEventListener('change', () => {
    if (motivoSelect.value === 'Otro') motivoExtra.classList.remove('hidden');
    else { motivoExtra.classList.add('hidden'); motivoExtra.value = ''; }
  });
  $('#visitasList').appendChild(el);
}

/* Crear gira + visitas */
async function createGiraAndVisitas() {
  try {
    const nombreGira = $('#nombre_gira').value.trim();
    const desde = $('#fecha_desde').value;
    const hasta = $('#fecha_hasta').value;

    if (!nombreGira) return flash($('#giraMsg'), 'Ingresá un nombre para la gira', 'err');
    if (!desde || !hasta) return flash($('#giraMsg'), 'Completá las fechas', 'err');
    if (hasta < desde) return flash($('#giraMsg'), 'Fechas inválidas', 'err');

    const cards = Array.from($('#visitasList').children);
    if (!cards.length) return flash($('#giraMsg'), 'Agregá al menos un cliente', 'err');

    const { data: gira, error: giraErr } = await supabase
      .from('giras')
      .insert({ vendedor_id: currentVendedorId, nombre: nombreGira, fecha_desde: desde, fecha_hasta: hasta, estado: 'activa' })
      .select('id')
      .single();
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
  } catch (e) {
    flash($('#giraMsg'), e.message, 'err');
  }
}

/* ============ Listado giras activas ============ */
async function cargarGirasDelVendedor(filtroVendedorId = null) {
  const contenedor = document.getElementById('registroVisitasList');
  if (!contenedor) return;
  contenedor.innerHTML = '';

  let query = supabase
    .from('giras')
    .select(`
      id,
      nombre,
      fecha_desde,
      fecha_hasta,
      vendedor_id,
      vendedores!inner ( nombre, apellido, email ),
      gira_visitas ( id, clientes ( nombre ) )
    `)
    .eq('estado', 'activa')
    .order('fecha_desde', { ascending: false });

  if (currentRol === 'admin') {
    if (filtroVendedorId) query = query.eq('vendedor_id', filtroVendedorId);
  } else {
    query = query.eq('vendedor_id', currentVendedorId);
  }

  const { data, error } = await query;

  if (error) {
    contenedor.innerHTML = `<p class="msg err">Error: ${error.message}</p>`;
    return;
  }
  if (!data?.length) {
    contenedor.innerHTML = '<p class="muted">No hay giras registradas.</p>';
    return;
  }

  data.forEach(gira => {
    const clientes = (gira.gira_visitas || []).map(v => v.clientes?.nombre || 'Sin nombre').join(', ');
    const tarjeta = document.createElement('div');
    tarjeta.className = 'card';
    const viajante = (gira.vendedores?.apellido || gira.vendedores?.nombre)
      ? `${gira.vendedores?.apellido ?? ''} ${gira.vendedores?.nombre ?? ''}`.trim()
      : (gira.vendedores?.email || '—');

    tarjeta.innerHTML = `
      <h3>${gira.nombre || 'Sin nombre'}</h3>
      <p><strong>Viajante:</strong> ${viajante}</p>
      <p><strong>Desde:</strong> ${gira.fecha_desde} &nbsp; <strong>Hasta:</strong> ${gira.fecha_hasta}</p>
      <p><strong>Clientes:</strong> ${clientes || 'Sin clientes asignados'}</p>
      <button class="btn" onclick="cargarVisitasDeGira('${gira.id}')">Ver registro</button>
    `;
    contenedor.appendChild(tarjeta);
  });
}

/* ============ Toast ============ */
function showToast(message, type = 'ok') {
  const toast = document.createElement('div');
  toast.textContent = message;
  Object.assign(toast.style, {
    position:'fixed', bottom:'20px', right:'20px', padding:'10px 16px',
    borderRadius:'8px', color:'#fff', fontSize:'14px', zIndex:'9999',
    boxShadow:'0 2px 6px rgba(0,0,0,0.3)',
    backgroundColor: type === 'ok' ? '#16a34a' : '#dc2626',
    opacity:'0', transition:'opacity 0.3s ease'
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2000);
}

/* ============ Giras cerradas ============ */
// ⬇ REEMPLAZÁ tu función por esta
async function cargarGirasCerradas(filtroVendedorId = null, filtroDesde = null, filtroHasta = null) {
  const contenedor = document.getElementById('girasCerradasList');
  if (!contenedor) return;
  contenedor.innerHTML = '';

  let query = supabase
    .from('giras')
    .select(`
      id,
      nombre,
      fecha_desde,
      fecha_hasta,
      vendedor_id,
      vendedores!inner ( nombre, apellido, email ),
      gira_visitas ( clientes ( nombre ) )
    `)
    .eq('estado', 'cerrada')
    .order('fecha_desde', { ascending: false });

  // Filtro por vendedor
  if (currentRol === 'admin') {
    if (filtroVendedorId) query = query.eq('vendedor_id', filtroVendedorId);
  } else {
    query = query.eq('vendedor_id', currentVendedorId);
  }

  // Filtro por fechas (intersección de rango)
  if (filtroDesde && filtroHasta) {
    query = query.gte('fecha_hasta', filtroDesde).lte('fecha_desde', filtroHasta);
  } else if (filtroDesde && !filtroHasta) {
    query = query.gte('fecha_hasta', filtroDesde);
  } else if (!filtroDesde && filtroHasta) {
    query = query.lte('fecha_desde', filtroHasta);
  }

  const { data, error } = await query;

  if (error) {
    contenedor.innerHTML = `<p class="msg err">Error: ${error.message}</p>`;
    return;
  }
  if (!data?.length) {
    contenedor.innerHTML = '<p class="muted">No hay giras cerradas.</p>';
    return;
  }

  data.forEach(gira => {
    const clientes = (gira.gira_visitas || []).map(v => v.clientes?.nombre || 'Sin nombre').join(', ');
    const viajante = (gira.vendedores?.apellido || gira.vendedores?.nombre)
      ? `${gira.vendedores?.apellido ?? ''} ${gira.vendedores?.nombre ?? ''}`.trim()
      : (gira.vendedores?.email || '—');

    const tarjeta = document.createElement('div');
    tarjeta.className = 'rowCard';
    tarjeta.innerHTML = `
      <h3>${gira.nombre || 'Sin nombre'}</h3>
      <p><strong>Viajante:</strong> ${viajante}</p>
      <p><strong>Desde:</strong> ${gira.fecha_desde} &nbsp; <strong>Hasta:</strong> ${gira.fecha_hasta}</p>
      <p><strong>Clientes:</strong> ${clientes || 'Sin clientes asignados'}</p>
      <button class="btn" onclick="verGiraCerrada('${gira.id}')">Ver detalles</button>
    `;
    contenedor.appendChild(tarjeta);
  });
}


/* ============ Helpers tipo gira ============ */
function mapTipoGiraLabel(n) {
  if (n === 0) return "0 - Sin gira";
  if (n === 1) return "1 - Gira corta";
  if (n === 2) return "2 - Gira larga";
  return "-";
}

/* ============ Visitas de una gira activa ============ */
async function cargarVisitasDeGira(giraId) {
  const contenedor = $('#registroVisitasList');
  if (!contenedor) return;
  contenedor.innerHTML = '';

  const { data, error } = await supabase
    .from('gira_visitas')
    .select(`id, clientes ( nombre )`)
    .eq('gira_id', giraId)
    .eq('cerrado', false);

  if (error) {
    contenedor.innerHTML = `<p class="msg err">Error: ${error.message}</p>`;
    return;
  }

  if (!data?.length) {
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

      const motivoSelect = card.querySelector('.motivo-contacto');
      const motivoExtra = card.querySelector('.motivo-extra');
      motivoSelect.addEventListener('change', () => {
        if (motivoSelect.value === 'Otro') motivoExtra.classList.remove('hidden');
        else { motivoExtra.classList.add('hidden'); motivoExtra.value = ''; }
      });

      card.querySelector('.cerrarBtn').addEventListener('click', async () => {
        try {
          const f = card.querySelector('.visitaForm');
          const insert = {
            gira_visita_id: f.dataset.id,
            tipo_gira: (() => {
              const raw = f.querySelector('[name="tipo_gira"]').value;
              return raw === '' ? null : parseInt(raw, 10);
            })(),
            medio_contacto: Array.from(f.querySelectorAll('input[name="medio_contacto"]:checked')).map(cb => cb.value).join(', ') || null,
            tiempo_visita: (() => {
              const n = parseInt(f.querySelector('[name="tiempo_visita"]').value, 10);
              return Number.isFinite(n) ? n : null;
            })(),
            motivo_contacto: (() => {
              const motivo = f.querySelector('[name="motivo_contacto"]').value;
              if (motivo === 'Otro') return `Otro: ${f.querySelector('[name="motivo_otro"]').value || ''}`.trim();
              return motivo || null;
            })(),
            nota_pedido: f.querySelector('[name="nota_pedido"]').value === 'true',
            monto_vendido: f.querySelector('[name="monto_vendido"]').value ? parseFloat(f.querySelector('[name="monto_vendido"]').value) : null,
            cliente_tenia_deuda: f.querySelector('[name="cliente_tenia_deuda"]').value === 'true',
            deuda_cobrada: f.querySelector('[name="deuda_cobrada"]').value === 'true',
            monto_cobrado: f.querySelector('[name="monto_cobrado"]').value ? parseFloat(f.querySelector('[name="monto_cobrado"]').value) : null,
            comentario: f.querySelector('[name="comentario"]').value || null,
            alerta: f.querySelector('[name="alerta"]').value || null
          };

          const { error: insertErr } = await supabase.from('gira_respuestas').insert(insert);
          if (insertErr) { showToast('❌ Error guardando registro: ' + insertErr.message, 'err'); return; }

          enviarFilaAGoogleSheets(mapRespuestasAPlanilla(insert));

          const { error: cerrarErr } = await supabase
            .from('gira_visitas').update({ cerrado: true }).eq('id', f.dataset.id);
          if (cerrarErr) { showToast('❌ Error al cerrar registro: ' + cerrarErr.message, 'err'); return; }

          showToast('✅ Registro guardado y cerrado', 'ok');
          card.remove();
        } catch (e) { showToast('❌ Error inesperado: ' + e.message, 'err'); }
      });

      contenedor.appendChild(card);
    });
  }

  // Agregar cliente/visita
  const btnAgregar = document.createElement('button');
  btnAgregar.className = 'btn';
  btnAgregar.textContent = '➕ Agregar cliente';
  btnAgregar.onclick = () => {
    const nuevaCard = crearVisitaCard(giraId);
    contenedor.insertBefore(nuevaCard, btnAgregar);
  };
  contenedor.appendChild(btnAgregar);

  // Cerrar gira
  const btnCerrarGira = document.createElement('button');
  btnCerrarGira.className = 'btn btn-danger';
  btnCerrarGira.style.marginTop = '8px';
  btnCerrarGira.textContent = '🚫 Cerrar gira';
  btnCerrarGira.onclick = async () => {
    if (!confirm('¿Seguro que querés cerrar esta gira?')) return;
    const { error } = await supabase.from('giras').update({ estado: 'cerrada' }).eq('id', giraId);
    if (error) { showToast('❌ Error al cerrar la gira: ' + error.message, 'err'); return; }
    showToast('✅ Gira cerrada', 'ok');
    await cargarGirasDelVendedor();
  };
  contenedor.appendChild(btnCerrarGira);

  // Volver
  const btnVolver = document.createElement('button');
  btnVolver.className = 'btn-ghost';
  btnVolver.textContent = '⬅ Volver a giras';
  btnVolver.onclick = cargarGirasDelVendedor;
  contenedor.appendChild(btnVolver);
}

function renderRespuestaHTML(r) {
  const esClienteNuevo =
    r.razon_social || r.localidad || r.nombre_apellido || r.telefono || r.ubicacion ||
    r.vidriera || r.marcas_competencia || typeof r.propuesta_negocio === 'boolean' || r.monto_potencial;

  if (esClienteNuevo) {
    return `
      <p><strong>Tipo de registro:</strong> Cliente nuevo</p>
      <p><strong>Razón social:</strong> ${r.razon_social ?? '-'}</p>
      <p><strong>Localidad:</strong> ${r.localidad ?? '-'}</p>
      <p><strong>¿Cómo fue el contacto?</strong> ${r.contacto_cliente ?? '-'}</p>
      <p><strong>Nombre y apellido:</strong> ${r.nombre_apellido ?? '-'}</p>
      <p><strong>Teléfono:</strong> ${r.telefono ?? '-'}</p>
      <p><strong>Ubicación:</strong> ${r.ubicacion ?? '-'}</p>
      <p><strong>Vidriera:</strong> ${r.vidriera ?? '-'}</p>
      <p><strong>Marcas competencia:</strong> ${r.marcas_competencia ?? '-'}</p>
      <p><strong>¿Propuesta de negocio?</strong> ${typeof r.propuesta_negocio === 'boolean' ? (r.propuesta_negocio ? 'Sí' : 'No') : '-'}</p>
      <p><strong>Monto potencial:</strong> ${r.monto_potencial ?? '-'}</p>
      <p><strong>Comentario:</strong> ${r.comentario || '-'}</p>
      <p><strong>Alerta:</strong> ${r.alerta || '-'}</p>
    `;
  }

  return `
    <p><strong>Tipo de registro:</strong> Cliente existente</p>
    <p><strong>Tipo de gira:</strong> ${Number.isFinite(r.tipo_gira) ? mapTipoGiraLabel(r.tipo_gira) : '-'}</p>
    <p><strong>Medio de contacto:</strong> ${r.medio_contacto || '-'}</p>
    <p><strong>Tiempo visita:</strong> ${r.tiempo_visita ?? '-'} min</p>
    <p><strong>Motivo:</strong> ${r.motivo_contacto || '-'}</p>
    <p><strong>Nota de pedido:</strong> ${r.nota_pedido ? 'Sí' : 'No'}</p>
    <p><strong>Monto vendido:</strong> ${r.monto_vendido ?? '-'}</p>
    <p><strong>Cliente tenía deuda:</strong> ${r.cliente_tenia_deuda ? 'Sí' : 'No'}</p>
    <p><strong>Deuda cobrada:</strong> ${r.deuda_cobrada ? 'Sí' : 'No'}</p>
    <p><strong>Monto cobrado:</strong> ${r.monto_cobrado ?? '-'}</p>
    <p><strong>Comentario:</strong> ${r.comentario || '-'}</p>
    <p><strong>Alerta:</strong> ${r.alerta || '-'}</p>
  `;
}

async function loadVendedoresForFilter() {
  if (currentRol !== 'admin') return;

  const { data, error } = await supabase
    .from('vendedores')
    .select('id, nombre, apellido, email')
    .eq('activo', true)
    .order('apellido', { ascending: true });

  if (error) { console.error(error); return; }

  const contListado = document.getElementById('registroVisitasList');
  if (!contListado) return;

  let filtros = document.getElementById('filtroVendedorBar');
  if (!filtros) {
    filtros = document.createElement('div');
    filtros.id = 'filtroVendedorBar';
    filtros.style.cssText = 'display:flex; gap:8px; align-items:center; margin-bottom:12px;';
    filtros.innerHTML = `
      <label><strong>Viajante:</strong></label>
      <select id="filtroVendedor" class="filtro-select"></select>
      <button id="btnFiltrarVendedor" class="btn">Aplicar</button>
    `;
    contListado.parentElement.insertBefore(filtros, contListado);
  }

  const sel = document.getElementById('filtroVendedor');
  sel.innerHTML = `<option value="">(Todos)</option>` + (data || []).map(v => {
    const label = (v.apellido || v.nombre) ? `${v.apellido ?? ''} ${v.nombre ?? ''}`.trim() : v.email;
    return `<option value="${v.id}">${label}</option>`;
  }).join('');

  document.getElementById('btnFiltrarVendedor').onclick = async () => {
    const vendId = sel.value || null;
    await cargarGirasDelVendedor(vendId);
  };
}

// ⬇ REEMPLAZÁ tu función por esta
async function loadFiltroCerradas() {
  const contListado = document.getElementById('girasCerradasList');
  if (!contListado || !contListado.parentElement) return;

  const isAdmin = currentRol === 'admin';

  // Crear barra si no existe
  let barra = document.getElementById('filtroCerradasBar');
  if (!barra) {
    barra = document.createElement('div');
    barra.id = 'filtroCerradasBar';
    barra.style.cssText = 'display:flex; gap:6px; align-items:center; margin-bottom:10px; flex-wrap:wrap;';

    // Estructura compacta (labels fuera para ahorrar espacio)
    barra.innerHTML = `
      ${isAdmin ? `
<select id="filtroVendedorCerradas"
      style="padding:5px 6px; font-size:13px; min-width:110px;
             width:auto!important; flex:0 0 auto;">
    </select>
      ` : ``}
      <input id="filtroDesdeCerradas" type="date"
        style="padding:5px 6px; font-size:13px; width:auto;">
      <input id="filtroHastaCerradas" type="date"
        style="padding:5px 6px; font-size:13px; width:auto;">
      <button id="btnFiltrarCerradas" class="btn"
        style="padding:5px 10px; font-size:13px;">✔</button>
      <button id="btnLimpiarCerradas" class="btn-ghost"
        style="padding:5px 10px; font-size:13px;">✖</button>
    `;
    contListado.parentElement.insertBefore(barra, contListado);

    // Handlers (una sola vez)
    const selVend    = barra.querySelector('#filtroVendedorCerradas'); // puede ser null si no-admin
    const inputDesde = barra.querySelector('#filtroDesdeCerradas');
    const inputHasta = barra.querySelector('#filtroHastaCerradas');
    const btnAplicar = barra.querySelector('#btnFiltrarCerradas');
    const btnLimpiar = barra.querySelector('#btnLimpiarCerradas');

    btnAplicar.addEventListener('click', async () => {
      const vendId = selVend ? (selVend.value || null) : null;
      const desde  = inputDesde.value || null;
      const hasta  = inputHasta.value || null;
      if (desde && hasta && hasta < desde) { alert('Rango de fechas inválido'); return; }
      await cargarGirasCerradas(vendId, desde, hasta);
    });

    btnLimpiar.addEventListener('click', async () => {
      if (selVend) selVend.value = '';
      inputDesde.value = '';
      inputHasta.value = '';
      await cargarGirasCerradas(null, null, null);
    });
  }

  // Si es admin, cargar/actualizar vendedores
  if (isAdmin) {
    const sel = document.getElementById('filtroVendedorCerradas');
    const prev = sel?.value || '';
    const { data, error } = await supabase
      .from('vendedores')
      .select('id, nombre, apellido, email')
      .eq('activo', true)
      .order('apellido', { ascending: true });
    if (error) { console.error(error); return; }
    if (!sel) return;

    sel.innerHTML = `<option value="">(Todos)</option>` + (data || []).map(v => {
      const label = (v.apellido || v.nombre)
        ? `${v.apellido ?? ''} ${v.nombre ?? ''}`.trim()
        : (v.email || '—');
      return `<option value="${v.id}">${label}</option>`;
    }).join('');
    if (prev) sel.value = prev; // restaura selección
  }
}


/* ============ Ver gira cerrada ============ */
async function verGiraCerrada(giraId) {
  const contenedor = document.querySelector('#girasCerradasList');
  if (!contenedor) return;
  contenedor.innerHTML = `<button class="btn-ghost" onclick="cargarGirasCerradas()">⬅ Volver</button>`;

  const { data, error } = await supabase
    .from('gira_visitas')
    .select(`
      id,
      clientes ( nombre ),
      gira_respuestas (
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
        alerta,
        razon_social,
        localidad,
        contacto_cliente,
        nombre_apellido,
        telefono,
        ubicacion,
        vidriera,
        marcas_competencia,
        propuesta_negocio,
        monto_potencial
      )
    `)
    .eq('gira_id', giraId);

  if (error) { contenedor.innerHTML += `<p class="msg err">Error: ${error.message}</p>`; return; }
  if (!data || !data.length) { contenedor.innerHTML += '<p class="muted">No hay visitas registradas para esta gira.</p>'; return; }

  data.forEach(visita => {
    const r = visita.gira_respuestas?.[0] || {};
    const card = document.createElement('div');
    card.className = 'rowCard';
    card.innerHTML = `
      <h4>${visita.clientes?.nombre || 'Sin cliente'}</h4>
      ${renderRespuestaHTML(r)}
    `;
    contenedor.appendChild(card);
  });
}

/* ============ Card nueva visita ============ */
function crearVisitaCard(giraId) {
  const opcionesClientes = clientesLista.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
  const card = document.createElement('div');
  card.className = 'rowCard';
  card.innerHTML = `
    <h2>Nueva visita</h2>
    <form class="form-grid visitaForm">
      <label class="full-width">
        <select name="cliente_id" class="cliente-select">
          <option value="">-- Seleccionar cliente --</option>
          ${opcionesClientes}
        </select>
      </label>

      <label>Cliente nuevo</label>
      <label class="switch"><input type="checkbox" name="es_cliente_nuevo"><span class="slider"></span></label>

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
        <select name="propuesta"><option value="true">Sí</option><option value="false">No</option></select>
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
      selCliente.disabled = true; camposExistente.classList.add('hidden'); camposNuevo.classList.remove('hidden');
    } else {
      selCliente.disabled = false; camposExistente.classList.remove('hidden'); camposNuevo.classList.add('hidden');
    }
  });

  const motivoSelect = card.querySelector('.motivo-contacto');
  const motivoExtra = card.querySelector('.motivo-extra');
  if (motivoSelect) {
    motivoSelect.addEventListener('change', () => {
      if (motivoSelect.value === 'Otro') motivoExtra.classList.remove('hidden');
      else { motivoExtra.classList.add('hidden'); motivoExtra.value = ''; }
    });
  }

  card.querySelector('.cerrarBtn').addEventListener('click', async () => {
    try {
      const f = card.querySelector('.visitaForm');
      let clienteIdFinal = selCliente.value;

      if (chkNuevo.checked) {
        const nombreNuevo = f.querySelector('[name="razon_social"]').value.trim();
        if (!nombreNuevo) { showToast('⚠ Ingresá razón social del cliente', 'err'); return; }
        const { data: nuevoCliente, error: clienteErr } = await supabase
          .from('clientes')
          .insert({ nombre: nombreNuevo, vendedor_id: currentVendedorId, activo: true })
          .select('id, nombre')
          .single();
        if (clienteErr) { showToast('❌ Error creando cliente: ' + clienteErr.message, 'err'); return; }
        clientesLista.push(nuevoCliente);
        clienteIdFinal = nuevoCliente.id;
      } else {
        if (!clienteIdFinal) { showToast('⚠ Seleccioná un cliente', 'err'); return; }
      }

      const { data: visitaInsert, error: visErr } = await supabase
        .from('gira_visitas')
        .insert({ gira_id: giraId, cliente_id: clienteIdFinal, motivo: "Vincular", cerrado: true, programada: false })

        .select('id')
        .single();
      if (visErr) { showToast('❌ Error guardando visita: ' + visErr.message, 'err'); return; }

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
          comentario: comentarioValor,
          alerta: alertaValor
        };
      } else {
        respuestasObj = {
          ...respuestasObj,
          tipo_gira: (() => {
            const raw = camposExistente.querySelector('[name="tipo_gira"]').value;
            return raw === '' ? null : parseInt(raw, 10);
          })(),
          medio_contacto: Array.from(camposExistente.querySelectorAll('input[name="medio_contacto"]:checked')).map(cb => cb.value).join(', ') || null,
          tiempo_visita: (() => {
            const n = parseInt(camposExistente.querySelector('[name="tiempo_visita"]').value, 10);
            return Number.isFinite(n) ? n : null;
          })(),
          motivo_contacto: (() => {
            const motivo = camposExistente.querySelector('[name="motivo_contacto"]').value;
            if (motivo === 'Otro') return `Otro: ${camposExistente.querySelector('[name="motivo_otro"]').value || ''}`.trim();
            return motivo || null;
          })(),
          nota_pedido: camposExistente.querySelector('[name="nota_pedido"]').value === 'true',
          monto_vendido: camposExistente.querySelector('[name="monto_vendido"]').value ? parseFloat(camposExistente.querySelector('[name="monto_vendido"]').value) : null,
          cliente_tenia_deuda: camposExistente.querySelector('[name="cliente_tenia_deuda"]').value === 'true',
          deuda_cobrada: camposExistente.querySelector('[name="deuda_cobrada"]').value === 'true',
          monto_cobrado: camposExistente.querySelector('[name="monto_cobrado"]').value ? parseFloat(camposExistente.querySelector('[name="monto_cobrado"]').value) : null,
          comentario: comentarioValor,
          alerta: alertaValor
        };
      }

      const { error: respErr } = await supabase.from('gira_respuestas').insert([respuestasObj]);
      if (respErr) { showToast('⚠ Error guardando respuestas: ' + respErr.message, 'err'); return; }

      enviarFilaAGoogleSheets(mapRespuestasAPlanilla(respuestasObj));
      showToast('✅ Visita agregada', 'ok');
      card.remove();
      await cargarVisitasDeGira(giraId);
    } catch (e) { showToast('❌ Error inesperado: ' + e.message, 'err'); }
  });

  return card;
}

/* ============ (Opcional) Guardar en lote ============ */
async function guardarRegistroVisitas() {
  const elMsg = $('#registroMsg');
  const formularios = document.querySelectorAll('.visitaForm');
  const inserts = [];
  formularios.forEach(f => {
    inserts.push({
      gira_visita_id: f.dataset.id,
      tipo_gira: (() => {
        const raw = f.querySelector('[name="tipo_gira"]').value;
        return raw === '' ? null : parseInt(raw, 10);
      })(),
      medio_contacto: Array.from(f.querySelectorAll('input[name="medio_contacto"]:checked')).map(cb => cb.value).join(', ') || null,
      tiempo_visita: (() => {
        const n = parseInt(f.querySelector('[name="tiempo_visita"]').value, 10);
        return Number.isFinite(n) ? n : null;
      })(),
      motivo_contacto: (() => {
        const motivo = f.querySelector('[name="motivo_contacto"]').value;
        if (motivo === 'Otro') return `Otro: ${f.querySelector('[name="motivo_otro"]').value || ''}`.trim();
        return motivo || null;
      })(),
      nota_pedido: f.querySelector('[name="nota_pedido"]').value === 'true',
      monto_vendido: f.querySelector('[name="monto_vendido"]').value ? parseFloat(f.querySelector('[name="monto_vendido"]').value) : null,
      cliente_tenia_deuda: f.querySelector('[name="cliente_tenia_deuda"]').value === 'true',
      deuda_cobrada: f.querySelector('[name="deuda_cobrada"]').value === 'true',
      monto_cobrado: f.querySelector('[name="monto_cobrado"]').value ? parseFloat(f.querySelector('[name="monto_cobrado"]').value) : null,
      comentario: f.querySelector('[name="comentario"]').value || null,
      alerta: f.querySelector('[name="alerta"]').value || null
    });
  });

  const { error } = await supabase.from('gira_respuestas').insert(inserts);
  if (error) flash(elMsg, error.message, 'err');
  else {
    flash(elMsg, '✅ Registro guardado', 'ok');
    for (const r of inserts) enviarFilaAGoogleSheets(mapRespuestasAPlanilla(r));
  }
}

/* ============ AUTH ============ */
$('#goToSignup')?.addEventListener('click', () => setAuthMode('signup'));
$('#backToLogin')?.addEventListener('click', () => setAuthMode('login'));

$('#loginForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: $('#log_email').value.trim(),
    password: $('#log_pass').value
  });
  if (error) return flash($('#loginMsg'), error.message, 'err');

  currentUser = data.user;
  currentVendedorId = data.user.id;

  const profile = await ensureVendedorProfile(currentUser);
  currentRol = profile?.rol || 'vendedor';
  
  toggleNuevoPrioritarioPorRol(); 

  await cargarClientes();
  await cargarPrioritarios(); // << Panel derecho

  const { nombre, apellido } = currentUser.user_metadata || {};
  $('#userEmail').textContent = `Bienvenido ${nombre ?? ''} ${apellido ?? ''}${currentRol === 'admin' ? ' (Administrador)' : ''}`.trim();

  setDefaultWeek();
  $('#visitasList').innerHTML = '';
  addVisitaRow();
  await cargarGirasDelVendedor();
  showArmado();
  go('home');

  // Mostrar admin panel de prioritarios si corresponde
  if (currentRol === 'admin') show($('#prioritariosAdmin')); else hide($('#prioritariosAdmin'));
});

$('#signupForm')?.addEventListener('submit', async e => {
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
});

$('#logoutBtn')?.addEventListener('click', async () => {
  await supabase.auth.signOut();

  // Reset de estado en memoria
  currentUser = null;
  currentRol = null;
  currentVendedorId = null;

  // Reset UI
  hide($('#topbar'));
  hide($('#panel-prioritarios'));
  hide($('#section-dashboard'));
  hide($('#view-home'));
  show($('#view-auth'));
  setAuthMode('login');
});


$('#addVisitaBtn')?.addEventListener('click', () => addVisitaRow());
$('#guardarGiraBtn')?.addEventListener('click', () => createGiraAndVisitas());
$('#btnAgregarCliente')?.addEventListener('click', async () => {
  await agregarCliente($('#nuevoClienteNombre').value.trim());
  $('#nuevoClienteNombre').value = '';
});

function toggleNuevoPrioritarioPorRol() {
  const btn = document.getElementById('btnNuevoPrioritario');
  if (!btn) return;
  // si NO es admin, ocultamos
  btn.classList.toggle('hidden', currentRol !== 'admin');
}

/* ============ SESIÓN PERSISTENTE ============ */
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    currentVendedorId = session.user.id;

    const profile = await ensureVendedorProfile(currentUser);
    currentRol = profile?.rol || 'vendedor';
    
    toggleNuevoPrioritarioPorRol(); 

    await cargarClientes();
    await cargarPrioritarios(); // << Panel derecho

    const { nombre, apellido } = currentUser.user_metadata || {};
    $('#userEmail').textContent = `Bienvenido ${nombre ?? ''} ${apellido ?? ''}${currentRol === 'admin' ? ' (Administrador)' : ''}`.trim();

    setDefaultWeek();
    $('#visitasList').innerHTML = '';
    addVisitaRow();
    await cargarGirasDelVendedor();
    showArmado();
    go('home');

    if (currentRol === 'admin') show($('#prioritariosAdmin')); else hide($('#prioritariosAdmin'));
  }
})();


async function cargarPrioritarios() {
  const panel = document.getElementById('panel-prioritarios');
  if (panel) panel.classList.remove('hidden');

  const list = document.getElementById('prioritariosList');
  if (!list) return;
  list.innerHTML = '<p class="muted">Cargando…</p>';

  const { data, error } = await supabase
    .from('articulos_prioritarios')
    .select('id, sku, orden')
    .order('orden', { ascending: true });

  if (error) {
    list.innerHTML = `<p class="msg err">${error.message}</p>`;
    return;
  }

  renderPrioritarios(data || []);
}

// Render mínimo
function renderPrioritarios(items) {
  const list = document.getElementById('prioritariosList');
  if (!list) return;
  list.innerHTML = '';

  if (!items.length) {
    list.innerHTML = '<p class="muted">No hay artículos prioritarios.</p>';
    return;
  }

  items.forEach(it => {
    const row = document.createElement('div');
    row.className = 'priori-item';
    row.innerHTML = `
      <div class="priori-sku">${it.sku}</div>
      <div class="priori-orden">#${it.orden}</div>
      ${currentRol === 'admin' ? `
        <div class="priori-actions">
          <button class="btn-ghost" onclick="editarPrioritario('${it.id}', '${it.sku}', ${it.orden})">✎</button>
          <button class="btn-danger" onclick="eliminarPrioritario('${it.id}')">🗑</button>
        </div>
      ` : ''}
    `;
    list.appendChild(row);
  });
}

// Mostrar form vacío
document.getElementById('btnNuevoPrioritario')?.addEventListener('click', () => {
  limpiarFormPrioritario();
  document.getElementById('prioritariosAdmin').classList.remove('hidden');
});

function limpiarFormPrioritario() {
  const f = document.getElementById('formPrioritario');
  if (!f) return;
  f.reset();
  f.id.value = '';
  document.getElementById('prioriMsg').textContent = '';
}

// Cargar datos en form para editar
function editarPrioritario(id, sku, orden) {
  const panel = document.getElementById('prioritariosAdmin');
  if (panel) panel.classList.remove('hidden');
  const f = document.getElementById('formPrioritario');
  f.id.value = id;
  f.sku.value = sku;
  f.orden.value = orden;
}

// Cancelar form
document.getElementById('btnCancelarPrioritario')?.addEventListener('click', () => {
  limpiarFormPrioritario();
  document.getElementById('prioritariosAdmin').classList.add('hidden');
});

// Guardar/editar
document.getElementById('formPrioritario')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const msg = document.getElementById('prioriMsg');

  const payload = {
    sku: f.sku.value.trim(),
    orden: parseInt(f.orden.value.trim())
  };

  if (!payload.sku || !payload.orden) {
    msg.textContent = 'SKU y Orden son obligatorios';
    msg.className = 'msg err';
    return;
  }

  const id = f.id.value;
  try {
    if (id) {
      await supabase.from('articulos_prioritarios').update(payload).eq('id', id);
      msg.textContent = '✅ Actualizado';
    } else {
      await supabase.from('articulos_prioritarios').insert(payload);
      msg.textContent = '✅ Creado';
    }
    msg.className = 'msg ok';
    await cargarPrioritarios();
    limpiarFormPrioritario();
    document.getElementById('prioritariosAdmin').classList.add('hidden');
  } catch (error) {
    msg.textContent = error.message;
    msg.className = 'msg err';
  }
});

// Eliminar
async function eliminarPrioritario(id) {
  if (!confirm('¿Eliminar artículo prioritario?')) return;
  await supabase.from('articulos_prioritarios').delete().eq('id', id);
  cargarPrioritarios();
}

/* =========================================================
   DASHBOARD — por vendedor + oculta Prioritarios
   ========================================================= */

async function renderDashboard(){
  const grid = $('#dashGrid');
  grid.innerHTML = '<div class="dash-card">Cargando…</div>';

  const desde = $('#dashDesde').value || null;
  const hasta = $('#dashHasta').value || null;

  // 1) Giras filtradas por rol/vendedor
  let q = supabase.from('giras').select('id, vendedor_id, estado, fecha_desde, fecha_hasta');
  let vendId = null;
  if (currentRol === 'admin') {
    vendId = document.getElementById('dashVendSel')?.value || null;
    if (vendId) q = q.eq('vendedor_id', vendId);
  } else {
    q = q.eq('vendedor_id', currentVendedorId);
  }
  const { data: girasRaw, error: gErr } = await q;
  if (gErr) { grid.innerHTML = `<div class="dash-card">Error: ${gErr.message}</div>`; return; }

  const giras = (girasRaw || []).filter(g => intersectaRango(g, desde, hasta));
  if (!giras.length) { grid.innerHTML = `<div class="dash-card">Sin datos para el filtro</div>`; return; }

  // 2) Nombres de vendedores
  const vendedorIds = Array.from(new Set(giras.map(g=>g.vendedor_id)));
  let vendedoresMap = {};
  {
    const { data: vends, error: vErr } = await supabase
      .from('vendedores').select('id, nombre, apellido, email').in('id', vendedorIds);
    if (vErr) { grid.innerHTML = `<div class="dash-card">Error vendedores: ${vErr.message}</div>`; return; }
    (vends||[]).forEach(v=>{
      const label = (v.apellido||v.nombre) ? `${v.apellido??''} ${v.nombre??''}`.trim() : (v.email||'—');
      vendedoresMap[v.id] = label;
    });
  }

  // 3) Visitas (traemos programada/cerrado para KPIs)
  const giraIds = giras.map(g=>g.id);
  const { data: visitasRaw, error: visErr } = await supabase
    .from('gira_visitas')
    .select('id, gira_id, programada, cerrado');
  if (visErr) { grid.innerHTML = `<div class="dash-card">Error visitas: ${visErr.message}</div>`; return; }
  const visitas = (visitasRaw||[]).filter(v => giraIds.includes(v.gira_id));
  const visitaIds = visitas.map(v=>v.id);

  // 4) Respuestas (para "realizadas" y demás métricas)
  let respFiltradas = [];
  if (visitaIds.length){
    const { data: respRaw, error: rErr } = await supabase
  .from('gira_respuestas')
  .select('gira_visita_id,nota_pedido,monto_vendido,monto_cobrado,tiempo_visita,razon_social,localidad,contacto_cliente,nombre_apellido,telefono,propuesta_negocio,monto_potencial');
    if (rErr) { grid.innerHTML = `<div class="dash-card">Error respuestas: ${rErr.message}</div>`; return; }
    respFiltradas = (respRaw||[]).filter(r => visitaIds.includes(r.gira_visita_id));
  }

  // Índices de ayuda
  const visitasPorGira = new Map();  // gira_id -> [visitas]
  visitas.forEach(v=>{
    if (!visitasPorGira.has(v.gira_id)) visitasPorGira.set(v.gira_id, []);
    visitasPorGira.get(v.gira_id).push(v);
  });

  const respuestasPorVisita = new Map(); // visita_id -> [respuestas]
  respFiltradas.forEach(r=>{
    if (!respuestasPorVisita.has(r.gira_visita_id)) respuestasPorVisita.set(r.gira_visita_id, []);
    respuestasPorVisita.get(r.gira_visita_id).push(r);
  });

  // Estructura por vendedor
  const perVend = {};
  vendedorIds.forEach(id=>{
    perVend[id] = {
      label: vendedoresMap[id] || id,
      activas: 0,
      cerradas: 0,
      planificadas: 0,           // clientes planificados (visitas programadas creadas en armado)
      realizadas: 0,             // visitas realizadas (visitas con al menos una respuesta)
      progRealizadas: 0,         // visitas programadas realizadas
      noProgRealizadas: 0,       // visitas no programadas realizadas
      visitasTotalesRealizadas: 0, // mismas que "realizadas" (alias para claridad)
      notasSi: 0,                // cant notas de pedido
      tiempoSum: 0,
      tiempoCount: 0,
      vendido: 0,
      cobrado: 0,
      contactosNuevos: 0,        // cantidad de contactos nuevos
      propuestas: 0,             // cantidad de presentaciones de negocio
      clientesNuevos: 0,         // clientes nuevos
      clientesPotenciales: 0     // clientes nuevos potenciales (con monto_potencial)
    };
  });

  // Acumular por vendedor
  const giraById = Object.fromEntries(giras.map(g=>[g.id,g]));
  // Planificadas = visitas programadas de sus giras (independiente de si se realizaron)
  visitas.forEach(v=>{
    const g = giraById[v.gira_id]; if (!g) return;
    const pv = perVend[g.vendedor_id];
    if (!pv) return;
    if (g.estado==='activa') pv.activas++;
    if (g.estado==='cerrada') pv.cerradas++;
    if (v.programada === true) pv.planificadas++;
  });

  // Realizadas / no programadas / KPIs de respuesta
  visitas.forEach(v=>{
    const g = giraById[v.gira_id]; if (!g) return;
    const pv = perVend[g.vendedor_id];
    if (!pv) return;

    const resps = respuestasPorVisita.get(v.id) || [];
    if (!resps.length) return; // no realizada

    pv.realizadas++;
    pv.visitasTotalesRealizadas++;

    // ¿era programada?
    if (v.programada === true) pv.progRealizadas++;
    else pv.noProgRealizadas++;

    // sumar KPIs de respuestas
    resps.forEach(r=>{
      if (r.nota_pedido === true) pv.notasSi++;
      if (typeof r.monto_vendido === 'number') pv.vendido += r.monto_vendido;
      if (typeof r.monto_cobrado === 'number') pv.cobrado += r.monto_cobrado;
      if (Number.isFinite(r.tiempo_visita)) { pv.tiempoSum += r.tiempo_visita; pv.tiempoCount++; }

      // Contactos nuevos: si aportó datos de contacto (nombre/telefono) o "contacto_cliente"
      if ((r.nombre_apellido && r.nombre_apellido.trim()) ||
          (r.telefono && r.telefono.trim()) ||
          (r.contacto_cliente && r.contacto_cliente.trim())) {
        pv.contactosNuevos++;
      }

      // Clientes nuevos: si tiene "razon_social" (registro cliente nuevo)
      if (r.razon_social && r.razon_social.trim()) {
        pv.clientesNuevos++;
      }

      // Clientes potenciales: si informó monto_potencial
      if (r.monto_potencial !== null && r.monto_potencial !== '' && r.monto_potencial !== undefined) {
        pv.clientesPotenciales++;
      }

      // Propuestas de negocio
      if (r.propuesta_negocio === true) {
        pv.propuestas++;
      }
    });
  });

  // Render tarjetas por vendedor
  const pct = (num, den) => den ? Math.round((num/den)*100) : 0;
  const fmtMoney = n => new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 }).format(n||0);

  grid.innerHTML = '';
  const idsParaMostrar = vendId ? [vendId] : vendedorIds;

  idsParaMostrar.forEach(vId=>{
    const v = perVend[vId];
    if (!v) return;
    const promTiempo = v.tiempoCount ? Math.round(v.tiempoSum / v.tiempoCount) : 0;

    // KPIs pedidos:
    const porcentajeRutaCumplida = pct(v.realizadas, v.planificadas);                  // (visitas realizadas / clientes planificados) x100
    const porcentajeVisitasProgramadas = pct(v.progRealizadas, v.visitasTotalesRealizadas); // (visitas programadas realizadas / total realizadas) x100
    const visitasNoProgramadas = v.noProgRealizadas;                                   // cantidad
    const contactos = v.contactosNuevos;                                               // cantidad
    const cantidadPropuestas = v.propuestas;                                           // cantidad
    const clientesNuevos = v.clientesNuevos;                                           // cantidad
    const clientesPotenciales = v.clientesPotenciales;                                 // cantidad
    const cantNotasPedido = v.notasSi;                                                 // cantidad
    const visitasPedidoPct = pct(v.notasSi, v.visitasTotalesRealizadas);               // (notas / realizadas) x100

    const card = document.createElement('div');
    card.className = 'dash-card';
card.innerHTML = `
  <h3>${v.label}</h3>
  <p class="muted">Rango: <strong>${desde || '—'}</strong> a <strong>${hasta || '—'}</strong></p>

  <div class="kpi-category">
    <h4>Ruta</h4>
    <div class="kpi-list">
      <div class="kpi-row"><span>Planificados</span><strong>${v.planificadas}</strong></div>
      <div class="kpi-row"><span>Realizadas</span><strong>${v.realizadas}</strong></div>
      <div class="kpi-row"><span>% Ruta cumplida</span><strong>${porcentajeRutaCumplida}%</strong></div>
    </div>
  </div>

  <div class="kpi-category">
    <h4>Programación</h4>
    <div class="kpi-list">
      <div class="kpi-row"><span>Programadas realizadas</span><strong>${v.progRealizadas}</strong></div>
      <div class="kpi-row"><span>No programadas</span><strong>${visitasNoProgramadas}</strong></div>
      <div class="kpi-row"><span>% Visitas programadas</span><strong>${porcentajeVisitasProgramadas}%</strong></div>
    </div>
  </div>

  <div class="kpi-category">
    <h4>Contactos / Clientes</h4>
    <div class="kpi-list">
      <div class="kpi-row"><span>Contactos nuevos</span><strong>${contactos}</strong></div>
      <div class="kpi-row"><span>Clientes nuevos</span><strong>${clientesNuevos}</strong></div>
      <div class="kpi-row"><span>Potenciales</span><strong>${clientesPotenciales}</strong></div>
    </div>
  </div>

  <div class="kpi-category">
    <h4>Pedidos</h4>
    <div class="kpi-list">
      <div class="kpi-row"><span>Notas de pedido</span><strong>${cantNotasPedido}</strong></div>
      <div class="kpi-row"><span>Visitas/pedido</span><strong>${visitasPedidoPct}%</strong></div>
    </div>
  </div>

  <div class="kpi-category">
    <h4>Montos</h4>
    <div class="kpi-list">
      <div class="kpi-row"><span>Vendido</span><strong>${fmtMoney(v.vendido)}</strong></div>
      <div class="kpi-row"><span>Cobrado</span><strong>${fmtMoney(v.cobrado)}</strong></div>
    </div>
  </div>

  <div class="kpi-category">
    <h4>Tiempos</h4>
    <div class="kpi-list">
      <div class="kpi-row"><span>Prom. visita</span><strong>${promTiempo} min</strong></div>
    </div>
  </div>
`;


    grid.appendChild(card);
  });
}

/* === Utilidad: intersección de rangos de fecha === */
function intersectaRango(g, desde, hasta) {
  if (!desde && !hasta) return true;
  const gDesde = g.fecha_desde;
  const gHasta = g.fecha_hasta;
  if (desde && !hasta) return gHasta >= desde;
  if (!desde && hasta) return gDesde <= hasta;
  return (gHasta >= desde && gDesde <= hasta);
}

/* === Inyectar select de vendedor (solo admin, una sola vez) === */
async function ensureDashVendSelect() {
  if (currentRol !== 'admin') return;
  if (document.getElementById('dashVendSel')) return;

  const vendSel = document.createElement('select');
  vendSel.id = 'dashVendSel';
  vendSel.style.cssText = 'padding:6px 8px; font-size:13px; width:auto;';
  const anchor = document.getElementById('btnDashAplicar') || document.getElementById('dashFilterBar').lastChild;
  document.getElementById('dashFilterBar').insertBefore(vendSel, anchor);

  const { data: vends, error } = await supabase
    .from('vendedores')
    .select('id, nombre, apellido, email')
    .eq('activo', true)
    .order('apellido', { ascending: true });

  if (error) { console.error('Error cargando vendedores para dashboard:', error); return; }

  vendSel.innerHTML = `<option value="">(Todos)</option>` + (vends || []).map(v => {
    const label = (v.apellido || v.nombre) ? `${v.apellido ?? ''} ${v.nombre ?? ''}`.trim() : v.email;
    return `<option value="${v.id}">${label}</option>`;
  }).join('');

  // Re-render al cambiar
  vendSel.addEventListener('change', renderDashboard);
}

/* === Mostrar / Ocultar Dashboard === */
function showDashboard() {
  if (!currentUser) {
    alert('Iniciá sesión para ver el dashboard');
    return;
  }
  const home = document.getElementById('view-home');
  const dash = document.getElementById('section-dashboard');
  document.body.classList.add('dashboard-mode');
  if (home) home.classList.add('hidden');
  dash.classList.remove('hidden');

  // Ocultar panel de prioritarios mientras se ve el dashboard
  document.getElementById('panel-prioritarios')?.classList.add('hidden');

  // setear semana por defecto si no hay fechas
  const t = new Date(), d = (t.getDay() + 6) % 7;
  const mon = new Date(t); mon.setDate(t.getDate() - d);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = (x) => x.toISOString().slice(0, 10);
  const inpDesde = document.getElementById('dashDesde');
  const inpHasta = document.getElementById('dashHasta');
  if (inpDesde && !inpDesde.value) inpDesde.value = fmt(mon);
  if (inpHasta && !inpHasta.value) inpHasta.value = fmt(sun);

  ensureDashVendSelect().then(renderDashboard).catch(() => renderDashboard());
}


function hideDashboard() {
  // muestro home, oculto dashboard
  const home = document.getElementById('view-home');
  const dash = document.getElementById('section-dashboard');
  document.body.classList.remove('dashboard-mode');
  if (dash) dash.classList.add('hidden');
  if (home) home.classList.remove('hidden');

  // vuelvo a mostrar prioritarios
  document.getElementById('panel-prioritarios')?.classList.remove('hidden');
}

/* === Listeners de botones del Dashboard === */
document.getElementById('btnDashboard')?.addEventListener('click', showDashboard);
document.getElementById('btnVolverHome')?.addEventListener('click', hideDashboard);
document.getElementById('btnDashAplicar')?.addEventListener('click', renderDashboard);
document.getElementById('btnDashLimpiar')?.addEventListener('click', () => {
  const d = document.getElementById('dashDesde');
  const h = document.getElementById('dashHasta');
  if (d) d.value = '';
  if (h) h.value = '';
  const sel = document.getElementById('dashVendSel');
  if (sel) sel.value = '';
  renderDashboard();
});

document.addEventListener('DOMContentLoaded', () => {
  // Estado por defecto: solo auth
  go('auth');
});
