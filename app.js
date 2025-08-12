/* ========= Estado ========= */
let CLIENT_DATA = [];      // [{ vendedor, clientes: [...] }, ...]
let CLIENT_EXTRAS = [];    // extras en localStorage con mismo formato
let CLIENT_OPTS = [];      // clientes del vendedor seleccionado (base + extras)
let ADD_BTN = null;        // botón único que “se muda” debajo del último card

/* ========= Utils ========= */
const $ = s => document.querySelector(s);
const byId = id => document.getElementById(id);

function setToday(){
  const f = byId('fecha');
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  f.value = `${yyyy}-${mm}-${dd}`;
}

function descargar(nombre, contenido, type='application/json;charset=utf-8'){
  const blob = new Blob([contenido], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  URL.revokeObjectURL(url);
}

function mensaje(tipo, txt){
  const msg = byId('msg');
  msg.className = tipo; msg.textContent = txt;
}

/* ========= LocalStorage (extras) ========= */
function loadExtras(){
  try { CLIENT_EXTRAS = JSON.parse(localStorage.getItem('clientesExtra') || '[]'); }
  catch { CLIENT_EXTRAS = []; }
}
function saveExtras(){
  localStorage.setItem('clientesExtra', JSON.stringify(CLIENT_EXTRAS));
}

/* Fusiona arrays de clientes por vendedor sin duplicados */
function mergeByVendedor(baseArr, extrasArr){
  const out = JSON.parse(JSON.stringify(baseArr || []));
  (extrasArr || []).forEach(extra => {
    let vend = out.find(v => v.vendedor === extra.vendedor);
    if (!vend){
      out.push({ vendedor: extra.vendedor, clientes: [...new Set(extra.clientes || [])] });
    } else {
      const set = new Set([...(vend.clientes || []), ...(extra.clientes || [])]);
      vend.clientes = [...set];
    }
  });
  return out;
}

/* Guarda un cliente nuevo en extras (para el vendedor activo) */
function guardarClienteNuevo(vendedor, cliente){
  if (!vendedor || !cliente) return;
  let vend = CLIENT_EXTRAS.find(v => v.vendedor === vendedor);
  if (!vend){ vend = { vendedor, clientes: [] }; CLIENT_EXTRAS.push(vend); }
  if (!vend.clientes.includes(cliente)){ vend.clientes.push(cliente); saveExtras(); }
}

/* ========= UI helpers ========= */
function buildClientSelect(options){
  const sel = document.createElement('select');
  const ph = document.createElement('option');
  ph.value = ''; ph.textContent = options.length ? 'Seleccioná cliente' : 'Elegí vendedor';
  sel.appendChild(ph);
  options.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c; sel.appendChild(o);
  });
  sel.disabled = options.length === 0;
  return sel;
}

function yesNo(){
  const s = document.createElement('select');
  [['','Seleccioná'], ['true','Sí'], ['false','No']].forEach(([v,t])=>{
    const o=document.createElement('option'); o.value=v; o.textContent=t; s.appendChild(o);
  });
  return s;
}

function mediosCheckboxes(){
  const wrap = document.createElement('div');
  wrap.className = 'medios-opciones';
  ['WhatsApp','Teléfono','Email','Visita'].forEach(name=>{
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = name;
    label.appendChild(cb);
    label.append(name);
    wrap.appendChild(label);
  });
  const otros = document.createElement('input');
  otros.placeholder = 'Otros (separar por comas)';
  otros.className = 'medios-otros';
  wrap.appendChild(otros);
  return { wrap, otros };
}

function inputL(labelTxt, type='text', placeholder=''){
  const d = document.createElement('div');
  const l = document.createElement('label'); l.textContent = labelTxt;
  const i = document.createElement('input'); i.type = type; i.placeholder = placeholder;
  d.appendChild(l); d.appendChild(i);
  return {wrap:d, input:i};
}

function textareaL(labelTxt, placeholder=''){
  const d = document.createElement('div');
  const l = document.createElement('label'); l.textContent = labelTxt;
  const t = document.createElement('textarea'); t.rows = 2; t.placeholder = placeholder;
  d.appendChild(l); d.appendChild(t);
  return {wrap:d, textarea:t};
}

/* ========= Add button (único) ========= */
function ensureAddButton(){
  if (ADD_BTN) return ADD_BTN;
  ADD_BTN = document.createElement('button');
  ADD_BTN.className = 'btn-ghost';
  ADD_BTN.textContent = '+ Agregar cliente';
  ADD_BTN.addEventListener('click', (e) => {
    e.preventDefault();
    addRow();
  });
  return ADD_BTN;
}
function placeAddButton(afterEl){
  const btn = ensureAddButton();
  btn.disabled = CLIENT_OPTS.length === 0;
  // si ya existe en el DOM, moverlo; si no, insertarlo
  afterEl.insertAdjacentElement('afterend', btn);
}

/* ========= Filtrar clientes por vendedor ========= */
function setPersona(vendedor){
  const all = mergeByVendedor(CLIENT_DATA, CLIENT_EXTRAS);
  const found = all.find(v => v.vendedor === vendedor);
  CLIENT_OPTS = found ? (found.clientes || []) : [];
  refreshClientSelects();

  // deshabilitar/mover botón según haya clientes o no
  const lastCard = [...document.querySelectorAll('.rowCard')].pop();
  if (lastCard){
    placeAddButton(lastCard);
  }else if (ADD_BTN && ADD_BTN.parentNode){
    ADD_BTN.parentNode.removeChild(ADD_BTN);
  }
}

/* ========= Construcción de filas ========= */
function refreshClientSelects(){
  document.querySelectorAll('.rowCard').forEach(card=>{
    const sel = card._refs.clienteSel;
    const current = sel.value;
    sel.innerHTML = '';
    const rebuilt = buildClientSelect(CLIENT_OPTS);
    Array.from(rebuilt.options).forEach(opt => sel.appendChild(opt.cloneNode(true)));
    if (CLIENT_OPTS.includes(current)) sel.value = current;
    sel.disabled = CLIENT_OPTS.length === 0 || card._refs.chkNuevo.checked;
  });
}

function addRow(){
  const idx = document.querySelectorAll('.rowCard').length + 1;
  const card = document.createElement('div'); card.className = 'rowCard';

  const header = document.createElement('div'); header.className = 'rowHeader';
  const title = document.createElement('div'); title.className = 'rowTitle'; title.textContent = `Cliente #${idx}`;
  const del = document.createElement('button'); del.className = 'btn-ghost'; del.textContent = 'Quitar';
  del.onclick = () => {
    card.remove();
    // reubicar el botón después del último card (si queda alguno)
    const last = [...document.querySelectorAll('.rowCard')].pop();
    if (last){ placeAddButton(last); }
    else if (ADD_BTN && ADD_BTN.parentNode){ ADD_BTN.parentNode.removeChild(ADD_BTN); }
  };
  header.appendChild(title); header.appendChild(del);

  // Cliente existente / nuevo
  const tipoWrap = document.createElement('div'); tipoWrap.className = 'flex';
  const tipoLbl = document.createElement('label'); tipoLbl.className = 'inline-check';
  const chkNuevo = document.createElement('input'); chkNuevo.type = 'checkbox';
  tipoLbl.appendChild(chkNuevo); tipoLbl.append(' Cliente nuevo (no está en listado)');
  tipoWrap.appendChild(tipoLbl);

  // Cliente existente
  const clienteDiv = document.createElement('div');
  const clienteLbl = document.createElement('label'); clienteLbl.textContent = 'Cliente (según vendedor)';
  const clienteSel = buildClientSelect(CLIENT_OPTS);
  clienteDiv.appendChild(clienteLbl); clienteDiv.appendChild(clienteSel);

  // Datos mínimos
  const sharedDiv = document.createElement('div'); sharedDiv.className = 'section';
  const g1 = document.createElement('div'); g1.className = 'cols-3';

  const tipoGira = document.createElement('div');
  const tgLbl = document.createElement('label'); tgLbl.textContent = 'Tipo de gira (0/2/3)';
  const tgSel = document.createElement('select');
  [['','Seleccioná'],['0','0 - sin gira'],['2','2 - corta'],['3','3 - larga']].forEach(([v,t])=>{
    const o=document.createElement('option'); o.value=v; o.textContent=t; tgSel.appendChild(o);
  });
  tipoGira.appendChild(tgLbl); tipoGira.appendChild(tgSel);

  const tiempo = inputL('Tiempo (min)', 'number', 'Ej: 90');
  const nota = document.createElement('div');
  const notaLbl = document.createElement('label'); notaLbl.textContent = '¿Nota de pedido?';
  const notaSel = yesNo(); nota.appendChild(notaLbl); nota.appendChild(notaSel);

  g1.appendChild(tipoGira); g1.appendChild(tiempo.wrap); g1.appendChild(nota);

  const g2 = document.createElement('div'); g2.className = 'cols-3';
  const montoV = inputL('Monto vendido (solo números)', 'number', 'Ej: 1000000');
  const tenia = document.createElement('div');
  const teniaLbl = document.createElement('label'); teniaLbl.textContent = '¿Tenía deuda?';
  const teniaSel = yesNo(); tenia.appendChild(teniaLbl); tenia.appendChild(teniaSel);
  const cobro = document.createElement('div');
  const cobroLbl = document.createElement('label'); cobroLbl.textContent = '¿Se cobró deuda?';
  const cobroSel = yesNo(); cobro.appendChild(cobroLbl); cobro.appendChild(cobroSel);
  const montoCob = inputL('Monto cobrado (solo números)', 'number', 'Ej: 250000');

  g2.appendChild(montoV.wrap); g2.appendChild(tenia); g2.appendChild(cobro); g2.appendChild(montoCob.wrap);

  const mediosLbl = document.createElement('label'); mediosLbl.textContent = 'Medios de contacto';
  const {wrap: mediosWrap, otros: mediosOtros} = mediosCheckboxes();
  const motivo = textareaL('Motivo del contacto', 'Detalle breve');
  const dest = textareaL('¿Algo para destacar?', 'Positivo o negativo');
  const alert = textareaL('¿Alguna alerta o dificultad?', 'Bloqueos, riesgos, etc.');

  sharedDiv.appendChild(g1); sharedDiv.appendChild(g2);
  sharedDiv.appendChild(mediosLbl); sharedDiv.appendChild(mediosWrap);
  sharedDiv.appendChild(motivo.wrap); sharedDiv.appendChild(dest.wrap); sharedDiv.appendChild(alert.wrap);

  // Cliente nuevo (mínimo)
  const nuevoDiv = document.createElement('div'); nuevoDiv.className = 'section hide';
  const nuevoTitle = document.createElement('div'); nuevoTitle.style.fontWeight = '800'; nuevoTitle.textContent = 'Cliente nuevo';
  const nuevoGrid = document.createElement('div'); nuevoGrid.className = 'cols-3';
  const in_razon = inputL('Razón social');
  const in_loc = inputL('Localidad');
  const in_medioNuevo = (function(){
    const d = document.createElement('div');
    const l = document.createElement('label'); l.textContent = '¿Cómo fue el contacto?';
    const s = document.createElement('select');
    ['','Presencial','Teléfono','WhatsApp','Email','Redes sociales'].forEach(t=>{
      const o=document.createElement('option'); o.value=t; o.textContent = t ? t : 'Seleccioná';
      s.appendChild(o);
    });
    d.appendChild(l); d.appendChild(s);
    return {wrap:d, select:s};
  })();
  nuevoGrid.appendChild(in_razon.wrap); nuevoGrid.appendChild(in_loc.wrap); nuevoGrid.appendChild(in_medioNuevo.wrap);
  nuevoDiv.appendChild(nuevoTitle); nuevoDiv.appendChild(nuevoGrid);

  // Toggle nuevo/existente
  function updateNuevoUI(){
    const isNuevo = chkNuevo.checked;
    clienteSel.disabled = isNuevo || CLIENT_OPTS.length === 0;
    clienteSel.required = !isNuevo;
    nuevoDiv.classList.toggle('hide', !isNuevo);
  }
  chkNuevo.addEventListener('change', updateNuevoUI);
  updateNuevoUI();

  // Armar card + colocar botón
  card.append(header, tipoWrap, clienteDiv, sharedDiv, nuevoDiv);
  byId('rows').appendChild(card);
  placeAddButton(card);

  // Guardar refs
  card._refs = {
    chkNuevo,
    clienteSel,
    tipoGiraSel: tgSel,
    tiempo: tiempo.input,
    notaSel,
    montoV: montoV.input,
    teniaDeudaSel: teniaSel,
    cobroSel: cobroSel,
    montoCob: montoCob.input,
    mediosWrap, mediosOtros,
    motivo: motivo.textarea,
    dest: dest.textarea,
    alert: alert.textarea,
    nuevo_razon: in_razon.input,
    nuevo_loc: in_loc.input,
    nuevo_medioSel: in_medioNuevo.select,
  };
}

/* ========= Inicialización ========= */
document.addEventListener('DOMContentLoaded', async () => {
  setToday();
  loadExtras();

  // Cargar vendedores/clients desde clientes.json con fallback
  try{
    const res = await fetch('./clientes.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} al leer clientes.json`);
    CLIENT_DATA = await res.json();
  }catch(e){
    console.warn('No se pudo cargar clientes.json. Usando datos embebidos.', e);
    mensaje('err', 'No se pudo leer clientes.json. Usando datos de ejemplo.');
    CLIENT_DATA = [
      { vendedor: "Juan Pérez",  clientes: ["Distribuidora El Sol SRL", "Panadería El Trigal", "Supermercado La Plaza"] },
      { vendedor: "Ana Gómez",   clientes: ["Comercial Los Andes SA", "Librería Punto y Coma", "Boutique La Rosa"] },
      { vendedor: "Carlos Martínez", clientes: ["Ferretería San José", "Corralón El Molino"] }
    ];
  }

  // Llenar select vendedor (únicos)
  const personaSel = byId('persona');
  const vendedores = [...new Set([
    ...CLIENT_DATA.map(v=>v.vendedor),
    ...CLIENT_EXTRAS.map(v=>v.vendedor)
  ])].filter(Boolean).sort();

  vendedores.forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    personaSel.appendChild(o);
  });

  personaSel.addEventListener('change', () => {
    byId('rows').innerHTML = '';
    setPersona(personaSel.value);
    if (CLIENT_OPTS.length) addRow();
    mensaje('muted','Cada cliente se guarda como un renglón con el mismo ID de gira.');
  });

  byId('refreshClients').addEventListener('click', () => {
    if (!personaSel.value) return;
    setPersona(personaSel.value);
  });

  byId('sendBtn').addEventListener('click', () => {
    const vendedor = personaSel.value;
    const fechaISO = byId('fecha').value;
    if (!vendedor){ mensaje('err','Elegí el Vendedor.'); return; }

    const cards = document.querySelectorAll('.rowCard');
    if (!cards.length){ mensaje('err','Agregá al menos un cliente.'); return; }

    const items = [];
    const idGira = `G-${Date.now()}`;

    for (const card of cards){
      const r = card._refs;
      const isNuevo = r.chkNuevo.checked;

      if (!isNuevo){
        if (!r.clienteSel.value){ mensaje('err','Seleccioná el Cliente.'); return; }
      } else {
        if (!r.nuevo_razon.value){ mensaje('err','Ingresá Razón social para el cliente nuevo.'); return; }
        guardarClienteNuevo(vendedor, r.nuevo_razon.value.trim());
      }

      const medios = Array.from(r.mediosWrap.querySelectorAll('input[type=checkbox]:checked')).map(x=>x.value);
      const otros = (r.mediosOtros.value || '').trim();
      if (otros) medios.push(...otros.split(',').map(s=>s.trim()).filter(Boolean));

      const item = {
        clienteTipo: isNuevo ? 'Nuevo' : 'Existente',
        cliente: isNuevo ? r.nuevo_razon.value.trim() : r.clienteSel.value,
        localidadNuevo: isNuevo ? (r.nuevo_loc.value || '').trim() : null,
        medioNuevo: isNuevo ? (r.nuevo_medioSel.value || '') : null,
        tipoGira: r.tipoGiraSel.value ? Number(r.tipoGiraSel.value) : null,
        tiempoMin: r.tiempo.value ? Number(r.tiempo.value) : null,
        notaPedido: r.notaSel.value === 'true',
        montoVendido: r.montoV.value ? Number(r.montoV.value) : 0,
        teniaDeuda: r.teniaDeudaSel.value === 'true',
        cobroDeuda: r.cobroSel.value === 'true',
        montoCobrado: r.montoCob.value ? Number(r.montoCob.value) : 0,
        medios,
        motivo: (r.motivo.value || '').trim(),
        destacado: (r.dest.value || '').trim(),
        alerta: (r.alert.value || '').trim()
      };
      items.push(item);
    }

    // Refrescar selects con nuevos clientes agregados
    if (personaSel.value){ setPersona(personaSel.value); }

    // Descargar JSON de la gira
    const payload = { idGira, vendedor, fechaISO, items };
    descargar(`gira_${idGira}.json`, JSON.stringify(payload, null, 2));
    mensaje('ok', `¡Guardado! ${items.length} renglones. ID: ${idGira}`);
  });
});
