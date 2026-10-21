// Formulario por pasos: una pregunta por pantalla, con barra de progreso y flechas.
// Lo usan bonos y la reserva de talleres. Sin JavaScript, en navegadores sin `inert` o con errores del servidor
// el formulario se queda entero (así se ven todos los errores de una vez y el servidor valida igual).
//
// Marcado que espera dentro del <form>:
//   .pasos-progreso (con un <span> por paso, `hidden`) · .pasos-ventana > .pasos-pista > [data-paso]…
//   .pasos-nav (`hidden`) con .pasos-flecha--atras y .pasos-flecha--siguiente · el botón de enviar con [type=submit]

type Opciones = {
  /** Se llama antes de enseñar cada paso (por ejemplo, para mostrar solo los campos que tocan). */
  antesDeMostrar?: () => void;
};

/** Convierte el formulario en pasos si el navegador puede y no hay errores del servidor en la página. */
export function formularioPorPasos(form: HTMLFormElement, { antesDeMostrar = () => {} }: Opciones = {}) {
  if (document.querySelector('.errores') || !('inert' in HTMLElement.prototype)) return;

  const pasos = [...form.querySelectorAll<HTMLElement>('[data-paso]')];
  const ventana = form.querySelector<HTMLElement>('.pasos-ventana');
  const pista = form.querySelector<HTMLElement>('.pasos-pista');
  const nav = form.querySelector<HTMLElement>('.pasos-nav');
  const atras = form.querySelector<HTMLButtonElement>('.pasos-flecha--atras');
  const siguiente = form.querySelector<HTMLButtonElement>('.pasos-flecha--siguiente');
  const progreso = form.querySelector<HTMLElement>('.pasos-progreso');
  const enviar = form.querySelector<HTMLButtonElement>('[type=submit]');
  if (pasos.length < 2 || !ventana || !pista || !nav || !atras || !siguiente || !progreso || !enviar) return;

  const ultimo = pasos.length - 1;
  let actual = 0;

  form.classList.add('con-pasos');
  nav.hidden = false;
  progreso.hidden = false;
  progreso.setAttribute('aria-valuemax', String(pasos.length));

  // Campos que cuentan en un paso: los visibles y nunca la trampa antispam.
  const campos = (paso: HTMLElement) => [...paso.querySelectorAll<HTMLInputElement>('input, select, textarea')]
    .filter((c) => !c.closest('[hidden]') && !c.closest('.trampa') && c.type !== 'hidden');
  const esValido = (n: number) => campos(pasos[n]).every((c) => c.checkValidity());
  const avisar = (n: number) => {
    const malo = campos(pasos[n]).find((c) => !c.checkValidity());
    if (malo) malo.reportValidity();
    return !malo;
  };
  const ajustarAlto = () => { ventana.style.height = pasos[actual].offsetHeight + 'px'; };

  const ir = (n: number, conFoco = true) => {
    actual = Math.max(0, Math.min(ultimo, n));
    antesDeMostrar();
    pasos.forEach((p, i) => { p.inert = i !== actual; p.classList.toggle('paso--actual', i === actual); });
    pista.style.transform = `translateX(${-100 * actual}%)`;
    ajustarAlto();
    atras.hidden = actual === 0;
    siguiente.hidden = actual === ultimo;
    progreso.setAttribute('aria-valuenow', String(actual + 1));
    progreso.setAttribute('aria-valuetext', `Paso ${actual + 1} de ${pasos.length}`);
    [...progreso.children].forEach((s, i) => s.classList.toggle('hecho', i <= actual));
    if (!conFoco) return;
    const lista = campos(pasos[actual]);
    const destino = lista.find((c) => (c.type === 'radio' ? c.checked : true)) || lista[0];
    if (destino) destino.focus({ preventScroll: true });
    if (form.getBoundingClientRect().top < 0) form.scrollIntoView({ block: 'start' });
  };

  siguiente.addEventListener('click', () => { if (avisar(actual)) ir(actual + 1); });
  atras.addEventListener('click', () => ir(actual - 1));

  // Intro en un campo avanza de paso en lugar de intentar enviar un formulario a medias.
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && actual < ultimo && (e.target as Element).matches('input')) {
      e.preventDefault();
      siguiente.click();
    }
  });

  // Al enviar, si quedó algo pendiente en un paso anterior, se vuelve a ese paso.
  enviar.addEventListener('click', (e) => {
    const pendiente = pasos.findIndex((_, i) => !esValido(i));
    if (pendiente !== -1 && pendiente !== actual) {
      e.preventDefault();
      ir(pendiente);
      avisar(pendiente);
    }
  });

  // Tocar una tarjeta de opción (con el dedo o el ratón) pasa sola a la siguiente pregunta.
  // Con el teclado no: las flechas solo cambian la opción elegida.
  let conPuntero = false;
  form.addEventListener('pointerdown', (e) => { conPuntero = Boolean((e.target as Element).closest('.opcion')); });
  form.addEventListener('click', (e) => {
    if (!conPuntero || !(e.target as Element).matches('.opcion input[type=radio]')) return;
    conPuntero = false;
    const desde = actual;
    setTimeout(() => { if (actual === desde && desde < ultimo) ir(desde + 1); }, 260);
  });

  new ResizeObserver(ajustarAlto).observe(pista);
  window.addEventListener('resize', ajustarAlto);
  ir(0, false);
}
