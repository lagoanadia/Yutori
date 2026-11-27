// Calendario propio para los campos de fecha: el del navegador no se puede adaptar a la estética de la web.
// Cada <input type="date"> se convierte en un campo de texto (con la fecha escrita en español) que abre un calendario;
// el valor AAAA-MM-DD viaja en un campo oculto con el mismo nombre. Sin JavaScript queda el campo de fecha normal.
// Teclado: flechas (día/semana), Re Pág / Av Pág (mes), Inicio/Fin (semana), Intro elige y Esc cierra.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const aISO = (f: Date) => f.toISOString().slice(0, 10);
const deISO = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};
const sumarDias = (iso: string, n: number) => { const f = deISO(iso); f.setUTCDate(f.getUTCDate() + n); return aISO(f); };
const sumarMeses = (iso: string, n: number) => {
  const f = deISO(iso);
  const dia = f.getUTCDate();
  f.setUTCDate(1);
  f.setUTCMonth(f.getUTCMonth() + n);
  const ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
  f.setUTCDate(Math.min(dia, ultimo));
  return aISO(f);
};
const hoy = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const largo = (iso: string) =>
  deISO(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function mejorar(original: HTMLInputElement) {
  const oculto = document.createElement('input');
  oculto.type = 'hidden';
  oculto.name = original.name;
  oculto.value = original.value;
  oculto.disabled = original.disabled; // un campo desactivado no se envía, tampoco su copia

  const caja = document.createElement('div');
  caja.className = 'fecha';
  original.replaceWith(caja);
  // El campo visible conserva id, required y disabled: la etiqueta <label for> y la validación siguen funcionando.
  const visible = original;
  visible.removeAttribute('name');
  visible.type = 'text';
  // Sin teclado en el móvil y sin escribir a mano (no readOnly: un campo de solo lectura no se valida y `required` dejaría de avisar).
  visible.inputMode = 'none';
  visible.placeholder = 'Elige una fecha';
  visible.autocomplete = 'off';
  visible.setAttribute('aria-haspopup', 'dialog');
  visible.setAttribute('aria-expanded', 'false');
  visible.classList.add('fecha__campo');
  const min = original.min || '';
  const max = original.max || '';

  const panel = document.createElement('div');
  panel.className = 'fecha__panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Elegir fecha');
  panel.hidden = true;
  caja.appendChild(visible);
  caja.appendChild(oculto);
  caja.appendChild(panel);

  let viendo = oculto.value || hoy(); // mes que se enseña (cualquier día de ese mes)
  let enfocado = viendo;

  const pintarValor = () => { visible.value = oculto.value ? largo(oculto.value) : ''; };
  const fuera = (iso: string) => (min && iso < min) || (max && iso > max);

  const pintar = () => {
    const f = deISO(viendo);
    const primero = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), 1));
    const hueco = (primero.getUTCDay() + 6) % 7; // lunes = 0
    const diasMes = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
    const deHoy = hoy();
    const celdas: string[] = [];
    for (let i = 0; i < hueco; i++) celdas.push('<span></span>');
    for (let d = 1; d <= diasMes; d++) {
      const iso = aISO(new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), d)));
      const clases = ['fecha__dia', iso === deHoy ? 'fecha__dia--hoy' : '', iso === oculto.value ? 'fecha__dia--elegido' : ''].filter(Boolean).join(' ');
      celdas.push(`<button type="button" class="${clases}" data-dia="${iso}" tabindex="${iso === enfocado ? 0 : -1}"
        aria-label="${largo(iso)}" aria-pressed="${iso === oculto.value}" ${fuera(iso) ? 'disabled' : ''}>${d}</button>`);
    }
    panel.innerHTML = `
      <div class="fecha__cabecera">
        <button type="button" class="fecha__flecha" data-mes="-1" aria-label="Mes anterior">‹</button>
        <strong aria-live="polite">${MESES[f.getUTCMonth()]} ${f.getUTCFullYear()}</strong>
        <button type="button" class="fecha__flecha" data-mes="1" aria-label="Mes siguiente">›</button>
      </div>
      <div class="fecha__semana" aria-hidden="true">${DIAS.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="fecha__dias">${celdas.join('')}</div>
      <div class="fecha__pie">
        ${visible.required ? '<span></span>' : '<button type="button" class="fecha__texto" data-accion="borrar">Borrar</button>'}
        <button type="button" class="fecha__texto" data-accion="hoy" ${fuera(deHoy) ? 'disabled' : ''}>Hoy</button>
      </div>`;
  };

  const enfocar = () => panel.querySelector<HTMLButtonElement>(`[data-dia="${enfocado}"]`)?.focus();
  const abrir = () => {
    if (visible.disabled || !panel.hidden) return;
    viendo = enfocado = oculto.value || (min && hoy() < min ? min : hoy());
    pintar();
    panel.hidden = false;
    visible.setAttribute('aria-expanded', 'true');
    enfocar();
  };
  const cerrar = (devolverFoco = true) => {
    if (panel.hidden) return;
    panel.hidden = true;
    visible.setAttribute('aria-expanded', 'false');
    if (devolverFoco) visible.focus();
  };
  const elegir = (iso: string) => {
    if (fuera(iso)) return;
    oculto.value = iso;
    pintarValor();
    visible.dispatchEvent(new Event('change', { bubbles: true }));
    cerrar();
  };
  const moverA = (iso: string) => {
    enfocado = iso;
    if (iso.slice(0, 7) !== viendo.slice(0, 7)) viendo = iso;
    pintar();
    enfocar();
  };

  visible.addEventListener('click', abrir);
  visible.addEventListener('keydown', (e) => {
    if (['Enter', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); abrir(); }
    if ((e.key === 'Backspace' || e.key === 'Delete') && !visible.required) { oculto.value = ''; pintarValor(); }
  });
  visible.addEventListener('beforeinput', (e) => e.preventDefault());
  panel.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button');
    if (!b || b.disabled) return;
    if (b.dataset.dia) elegir(b.dataset.dia);
    else if (b.dataset.mes) { viendo = sumarMeses(viendo, Number(b.dataset.mes)); enfocado = viendo; pintar(); panel.querySelector<HTMLButtonElement>(`[data-mes="${b.dataset.mes}"]`)?.focus(); }
    else if (b.dataset.accion === 'hoy') elegir(hoy());
    else if (b.dataset.accion === 'borrar') { oculto.value = ''; pintarValor(); cerrar(); }
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cerrar(); return; }
    if (!(e.target as Element).matches('[data-dia]')) return;
    const saltos: Record<string, () => string> = {
      ArrowLeft: () => sumarDias(enfocado, -1), ArrowRight: () => sumarDias(enfocado, 1),
      ArrowUp: () => sumarDias(enfocado, -7), ArrowDown: () => sumarDias(enfocado, 7),
      PageUp: () => sumarMeses(enfocado, -1), PageDown: () => sumarMeses(enfocado, 1),
      Home: () => sumarDias(enfocado, -((deISO(enfocado).getUTCDay() + 6) % 7)),
      End: () => sumarDias(enfocado, 6 - ((deISO(enfocado).getUTCDay() + 6) % 7)),
    };
    if (saltos[e.key]) { e.preventDefault(); moverA(saltos[e.key]()); }
  });
  document.addEventListener('pointerdown', (e) => { if (!caja.contains(e.target as Node)) cerrar(false); });
  caja.addEventListener('focusout', (e) => { if (!caja.contains(e.relatedTarget as Node | null) && e.relatedTarget) cerrar(false); });

  pintarValor();
}

document.querySelectorAll<HTMLInputElement>('input[type="date"]:not([data-nativo])').forEach(mejorar);
