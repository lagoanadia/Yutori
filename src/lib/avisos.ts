// Qué email se envía en cada momento y a quién. Los textos usan la voz de Yutori (nunca "Iris" en tercera persona).
import { env } from 'cloudflare:workers';
import { negocio } from '../data/yutori';
import { DIAS, euros, eurosCorto, fecha, FRANJAS, uno } from './db';
import { enviar, type Email } from './email';

const url = (ruta: string) => new URL(ruta, env.SITIO_URL || 'http://localhost:4321').href;
const dia = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const mesTexto = (mes: string) =>
  new Date(`${mes}-01T00:00:00Z`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const nombrePila = (n: string) => n.split(' ')[0];
/** Aviso para la bandeja de Yutori (el panel tiene todo el detalle). */
const paraYutori = (asunto: string, titulo: string, parrafos: string[], ruta: string): Email => ({
  para: negocio.email, asunto, titulo, parrafos, boton: { texto: 'Abrir en el panel', url: url(ruta) },
});

// ——— Talleristas ———

export async function avisoPropuesta(id: number) {
  const t = await uno<{ nombre: string; marca: string | null; email: string; categoria: string | null; propuesta: string; cubierta: number }>(`
    SELECT ta.nombre, ta.marca, ta.email, c.nombre AS categoria, ta.propuesta,
           EXISTS (SELECT 1 FROM talleristas o WHERE o.categoria_id = ta.categoria_id AND o.estado = 'aceptada' AND o.id <> ta.id) AS cubierta
    FROM talleristas ta LEFT JOIN categorias c ON c.id = ta.categoria_id WHERE ta.id = ?1`, id);
  if (!t) return;
  enviar(
    {
      para: t.email, asunto: 'Hemos recibido tu propuesta · Yutori',
      titulo: `¡Gracias, ${nombrePila(t.nombre)}!`,
      parrafos: [
        'Gracias por tu interés en formar parte de la familia Yutori. Hemos recibido tu propuesta.',
        'Estamos preparando la programación de talleres y clases y queremos contar con nuevas ideas: pronto tendrás noticias nuestras.',
      ],
    },
    paraYutori(`Nueva propuesta de tallerista: ${t.marca ?? t.nombre}`, 'Nueva propuesta de tallerista', [
      `**${t.nombre}**${t.marca ? ` (${t.marca})` : ''} · ${t.categoria ?? 'sin categoría'}`,
      ...(t.cubierta ? ['Ojo: esta categoría ya está cubierta por otra tallerista.'] : []),
      t.propuesta.slice(0, 400),
    ], `/panel/talleristas/${id}`),
  );
}

export async function avisoHuecoCreado(tallerId: number) {
  const t = await uno<{ fecha: string; franja: string; fecha_limite: string | null; codigo_enlace: string; nombre: string | null; email: string | null }>(`
    SELECT t.fecha, t.franja, t.fecha_limite, t.codigo_enlace, ta.nombre, ta.email
    FROM talleres t LEFT JOIN talleristas ta ON ta.id = t.tallerista_id WHERE t.id = ?1`, tallerId);
  if (!t?.email || !t.nombre) return;
  enviar({
    para: t.email, asunto: `Tu fecha en Yutori: ${dia(t.fecha)}`,
    titulo: `¡Hola, ${nombrePila(t.nombre)}! Tienes fecha`,
    parrafos: [
      `Te confirmamos fecha para tu taller: **${dia(t.fecha)}, ${FRANJAS[t.franja].toLowerCase().replace(/^\S+ /, 'por la ')}**.`,
      `${t.fecha_limite ? `Antes del **${dia(t.fecha_limite)}**` : 'Cuando puedas'} necesitamos que rellenes los datos de tu taller: nombre, horario, una foto del producto (no cartel), texto informativo y cómo te pagan las alumnas.`,
      'Y el pago de la reserva del espacio (25 €/taller). ¡Gracias!',
    ],
    boton: { texto: 'Rellenar mi taller', url: url(`/t/${t.codigo_enlace}`) },
  });
}

export async function avisoTallerEnviado(tallerId: number) {
  const t = await uno<{ titulo: string; fecha: string; quien: string }>(`
    SELECT t.titulo, t.fecha, COALESCE(ta.marca, ta.nombre, 'Yutori') AS quien
    FROM talleres t LEFT JOIN talleristas ta ON ta.id = t.tallerista_id WHERE t.id = ?1`, tallerId);
  if (!t) return;
  enviar(paraYutori(`Taller listo para revisar: ${t.titulo}`, 'Taller listo para revisar', [
    `**${t.titulo}** · ${t.quien} · ${dia(t.fecha)}`,
    'Revísalo y publícalo desde el panel cuando esté todo bien.',
  ], `/panel/talleres/${tallerId}`));
}

// ——— Reservas ———

type DatosReserva = {
  id: number; codigo: string; tipo: string; nombre: string; email: string; telefono: string; plazas: number; estado: string;
  caduca_en: string | null; mes: string | null; nombre_menor: string | null; titulo: string; fecha: string | null;
  dia_semana: number | null; hora_inicio: string; hora_fin: string; precio_cent: number | null; datos_pago: string | null;
  imparte: string; tallerista_email: string | null; taller_id: number | null; codigo_enlace: string | null;
};
const reserva = (codigo: string) => uno<DatosReserva>(`
  SELECT r.id, r.codigo, r.tipo, r.nombre, r.email, r.telefono, r.plazas, r.estado, r.caduca_en, r.mes, r.nombre_menor,
         COALESCE(t.titulo, c.nombre) AS titulo, COALESCE(t.fecha, r.fecha_sesion) AS fecha, g.dia_semana,
         COALESCE(t.hora_inicio, g.hora_inicio) AS hora_inicio, COALESCE(t.hora_fin, g.hora_fin) AS hora_fin,
         CASE r.tipo WHEN 'taller' THEN t.precio_cent WHEN 'clase_suelta' THEN c.precio_suelta_cent ELSE g.precio_mes_cent END AS precio_cent,
         t.datos_pago, CASE WHEN r.tipo = 'taller' THEN COALESCE(ta.marca, ta.nombre, 'Yutori') ELSE 'Yutori' END AS imparte,
         ta.email AS tallerista_email, t.id AS taller_id, t.codigo_enlace
  FROM reservas r
  LEFT JOIN talleres t ON t.id = r.taller_id LEFT JOIN talleristas ta ON ta.id = t.tallerista_id
  LEFT JOIN grupos g ON g.id = r.grupo_id LEFT JOIN clases c ON c.id = g.clase_id
  WHERE r.codigo = ?1`, codigo);

const cuando = (r: DatosReserva) => r.tipo === 'clase_mensual'
  ? `los ${DIAS[r.dia_semana ?? 0].toLowerCase()} de ${r.hora_inicio} a ${r.hora_fin}, ${mesTexto(r.mes!)}`
  : `el ${dia(r.fecha!)}, de ${r.hora_inicio} a ${r.hora_fin}`;

export async function avisoReservaHecha(codigo: string) {
  const r = await reserva(codigo);
  if (!r) return;
  const comoPagar = r.datos_pago ?? (negocio.pagoYutori || null);
  const importe = r.precio_cent == null ? '' : r.tipo === 'clase_mensual' ? `${eurosCorto(r.precio_cent)}/mes` : euros(r.precio_cent * r.plazas);
  const alumna: Email = r.tipo === 'clase_mensual'
    ? {
        para: r.email, asunto: `Plaza reservada: ${r.titulo}`, titulo: `¡Hola, ${nombrePila(r.nombre)}! Tu plaza está reservada`,
        parrafos: [
          `Clase de **${r.titulo}**${r.nombre_menor ? ` para ${r.nombre_menor}` : ''}, ${cuando(r)}.`,
          `Las clases se abonan en el momento de la reserva${importe ? ` (${importe})` : ''}. ${comoPagar ? `Cómo pagar: **${comoPagar}**.` : 'Te indicaremos cómo pagar.'}`,
          r.caduca_en
            ? `Tienes hasta el **${fecha(r.caduca_en)}**. Cuando recibamos el pago, tu plaza quedará confirmada.`
            : 'Cuando recibamos el pago, tu plaza quedará confirmada.',
        ],
        boton: { texto: 'Ver mi reserva', url: url(`/reserva/${r.codigo}`) },
      }
    : {
        para: r.email, asunto: `Plaza apartada: ${r.titulo}`, titulo: `¡Hola, ${nombrePila(r.nombre)}! Tu plaza está apartada`,
        parrafos: [
          `**${r.titulo}**, ${cuando(r)}${r.tipo === 'taller' ? `, con ${r.imparte}` : ''}.`,
          `Para confirmarla, paga **${importe}**. ${comoPagar ? `Cómo pagar: **${comoPagar}**.` : 'Te indicaremos cómo pagar.'}`,
          `Tienes hasta el **${fecha(r.caduca_en)}**. Si no, la plaza se liberará para otra persona.`,
        ],
        boton: { texto: 'Ver mi reserva', url: url(`/reserva/${r.codigo}`) },
      };

  // Aviso para quien cobra: la tallerista (si el taller es suyo) o Yutori.
  const detalle = [
    `**${r.nombre_menor ? `${r.nombre_menor} (${r.nombre})` : r.nombre}** · ${r.telefono} · ${r.plazas} ${r.plazas === 1 ? 'plaza' : 'plazas'}`,
    `${r.titulo}, ${cuando(r)}.`,
  ];
  const quienCobra: Email = r.tallerista_email
    ? {
        para: r.tallerista_email, asunto: `Nueva reserva: ${r.titulo}`, titulo: 'Tienes una nueva reserva',
        parrafos: [...detalle, 'Cuando recibas el pago, márcalo en tu enlace privado para confirmar la plaza.'],
        ...(r.codigo_enlace ? { boton: { texto: 'Ver mis apuntadas', url: url(`/t/${r.codigo_enlace}#apuntadas`) } } : {}),
      }
    : paraYutori(`Nueva reserva: ${r.titulo}`, 'Nueva reserva', detalle, r.taller_id ? `/panel/talleres/${r.taller_id}` : '/panel/clases');
  enviar(alumna, quienCobra);
}

export async function avisoPagoConfirmado(codigo: string) {
  const r = await reserva(codigo);
  if (!r) return;
  enviar({
    para: r.email, asunto: `Reserva confirmada: ${r.titulo}`, titulo: '¡Tu plaza está confirmada!',
    parrafos: [
      `Hemos recibido tu pago. **${r.titulo}**${r.nombre_menor ? ` para ${r.nombre_menor}` : ''}, ${cuando(r)}.`,
      `Te esperamos en ${negocio.direccion}, ${negocio.ciudad}.`,
    ],
    boton: { texto: 'Ver mi reserva', url: url(`/reserva/${r.codigo}`) },
  });
}

/** Pago con tarjeta al reservar: confirmación a la alumna y aviso a quien imparte (la tallerista) o a Yutori. */
export async function avisoReservaPagada(codigo: string) {
  const r = await reserva(codigo);
  if (!r) return;
  await avisoPagoConfirmado(codigo);
  const detalle = [
    `**${r.nombre_menor ? `${r.nombre_menor} (${r.nombre})` : r.nombre}** · ${r.telefono} · ${r.plazas} ${r.plazas === 1 ? 'plaza' : 'plazas'}`,
    `${r.titulo}, ${cuando(r)}. Pagada con tarjeta en la web.`,
  ];
  enviar(r.tallerista_email
    ? {
        para: r.tallerista_email, asunto: `Nueva reserva: ${r.titulo}`, titulo: 'Tienes una nueva reserva', parrafos: detalle,
        ...(r.codigo_enlace ? { boton: { texto: 'Ver mis apuntadas', url: url(`/t/${r.codigo_enlace}#apuntadas`) } } : {}),
      }
    : paraYutori(`Nueva reserva pagada: ${r.titulo}`, 'Nueva reserva pagada', detalle, r.taller_id ? `/panel/talleres/${r.taller_id}` : '/panel/clases'));
}

/** Plazas mensuales renovadas el día 26: cuándo y cómo se cobra, y hasta cuándo se puede cambiar. */
export async function avisoRenovadas(codigos: string[]) {
  for (const codigo of codigos) {
    const r = await uno<{ nombre: string; email: string; titulo: string; mes: string; importe_cent: number | null; metodo_pago: string; tarjeta: string | null }>(`
      SELECT r.nombre, r.email, c.nombre AS titulo, r.mes, r.importe_cent, r.metodo_pago, r.tarjeta
      FROM reservas r JOIN grupos g ON g.id = r.grupo_id JOIN clases c ON c.id = g.clase_id WHERE r.codigo = ?1`, codigo);
    if (!r) continue;
    const importe = r.importe_cent ? ` (${eurosCorto(r.importe_cent)})` : '';
    enviar({
      para: r.email, asunto: `Tu plaza de ${mesTexto(r.mes)}: ${r.titulo}`, titulo: `¡Hola, ${nombrePila(r.nombre)}! Seguimos en ${mesTexto(r.mes).split(' ')[0]}`,
      parrafos: [
        `Hemos renovado tu plaza de **${r.titulo}** para **${mesTexto(r.mes)}**.`,
        r.metodo_pago === 'tarjeta'
          ? `El día 1 te cobraremos la mensualidad${importe} en tu tarjeta${r.tarjeta ? ` ${r.tarjeta}` : ''}.`
          : `Puedes pagar la mensualidad${importe} en efectivo en el espacio a principios de mes.`,
        'Si prefieres cambiar la forma de pago, puedes hacerlo desde tu reserva.',
      ],
      boton: { texto: 'Ver mi reserva', url: url(`/reserva/${codigo}`) },
    });
  }
}

/** El cobro automático del día 1 no ha salido: la plaza se guarda y se avisa a la alumna y a Yutori. */
export async function avisoCobroFallido(codigo: string) {
  const r = await reserva(codigo);
  if (!r) return;
  enviar(
    {
      para: r.email, asunto: `No hemos podido cobrar tu plaza de ${r.titulo}`, titulo: `Hola, ${nombrePila(r.nombre)}`,
      parrafos: [
        `Hemos intentado cobrar tu plaza de **${r.titulo}** de ${mesTexto(r.mes!)} y el banco no lo ha aceptado.`,
        'Tu plaza sigue guardada. Puedes pagar con otra tarjeta desde tu reserva o en efectivo en el espacio.',
      ],
      boton: { texto: 'Ver mi reserva', url: url(`/reserva/${codigo}`) },
    },
    paraYutori(`Cobro fallido: ${r.nombre} · ${r.titulo}`, 'Un cobro automático ha fallado', [
      `**${r.nombre}** · ${r.telefono} · ${r.titulo}, ${mesTexto(r.mes!)}.`,
      'La plaza se mantiene. Puedes reintentar el cobro o marcarlo como pagado desde el panel.',
    ], '/panel/clases'),
  );
}

/** Se pagó una plaza que ya no estaba disponible (o dos veces): el dinero se ha devuelto. */
export async function avisoPagoDevuelto(codigo: string) {
  const r = await reserva(codigo);
  if (!r) return;
  enviar(
    {
      para: r.email, asunto: `Te hemos devuelto el pago: ${r.titulo}`, titulo: `Hola, ${nombrePila(r.nombre)}`,
      parrafos: [
        `Hemos recibido un pago para **${r.titulo}** cuando la plaza ya no estaba disponible, así que te lo hemos devuelto entero.`,
        'El banco puede tardar unos días en mostrarlo. Si tienes cualquier duda, escríbenos.',
      ],
    },
    paraYutori(`Pago devuelto: ${r.nombre} · ${r.titulo}`, 'Pago devuelto automáticamente', [
      `**${r.nombre}** · ${r.telefono} pagó ${r.titulo} cuando su plaza ya no estaba pendiente. Se le ha devuelto el dinero.`,
    ], '/panel/reservas'),
  );
}

/** Bono regalo pagado en la web: el bono a quien lo compra y el aviso a Yutori. */
export async function avisoBonoPagado(id: number) {
  const b = await uno<{ nombre: string; email: string; telefono: string | null; para_quien: string | null; tipo_bono: string; detalle: string;
    importe_cent: number | null; codigo_bono: string; caduca_bono: string }>(
    `SELECT nombre, email, telefono, para_quien, tipo_bono, detalle, importe_cent, codigo_bono, caduca_bono FROM solicitudes WHERE id = ?1`, id);
  if (!b) return;
  const que = b.tipo_bono === 'importe' ? `un bono de **${eurosCorto(b.importe_cent)}**` : `un bono para el taller **${b.detalle}**`;
  enviar(
    {
      para: b.email, asunto: 'Tu bono regalo de Yutori', titulo: `¡Gracias, ${nombrePila(b.nombre)}! Aquí tienes tu bono`,
      parrafos: [
        `Has regalado ${que}${b.para_quien ? ` para **${b.para_quien}**` : ''}.`,
        `Código del bono: **${b.codigo_bono}**. Es válido hasta el **${dia(b.caduca_bono)}**.`,
        'Puedes reenviar este email o imprimir el bono desde el botón. Para usarlo, solo hay que darnos el código al reservar.',
      ],
      boton: { texto: 'Ver el bono', url: url(`/bono/${b.codigo_bono}`) },
    },
    paraYutori(`Bono regalo pagado: ${b.codigo_bono}`, 'Bono regalo pagado en la web', [
      `**${b.nombre}** · ${b.telefono ?? ''} · ${b.email}`,
      `${b.tipo_bono === 'importe' ? eurosCorto(b.importe_cent) : b.detalle}${b.para_quien ? ` · para ${b.para_quien}` : ''} · válido hasta el ${dia(b.caduca_bono)}`,
    ], `/panel/solicitudes/${id}`),
  );
}

export function avisoPlazasLiberadas(lista: { codigo: string; nombre: string; email: string; titulo: string }[]) {
  enviar(...lista.map((l) => ({
    para: l.email, asunto: `Tu plaza se ha liberado: ${l.titulo}`, titulo: 'Tu plaza se ha liberado',
    parrafos: [
      `Hola, ${nombrePila(l.nombre)}. No recibimos el pago a tiempo y tu plaza en **${l.titulo}** ha quedado libre para otra persona.`,
      'Si todavía quieres venir, mira si quedan plazas o escríbenos.',
    ],
    boton: { texto: 'Ver mi reserva', url: url(`/reserva/${l.codigo}`) },
  })));
}

// ——— Privados y bonos ———

export async function avisoSolicitud(id: number) {
  const s = await uno<{ tipo: string; nombre: string; email: string; telefono: string | null; motivo: string | null; categoria: string | null;
    fecha_aprox: string | null; personas: number | null; tipo_bono: string | null; detalle: string | null; para_quien: string | null; mensaje: string | null }>(
    'SELECT s.*, COALESCE(s.tipos_taller, c.nombre) AS categoria FROM solicitudes s LEFT JOIN categorias c ON c.id = s.categoria_id WHERE s.id = ?1', id);
  if (!s) return;
  const privado = s.tipo === 'privado';
  enviar(
    {
      para: s.email,
      asunto: privado ? 'Hemos recibido vuestra petición · Yutori' : 'Hemos recibido tu petición de bono · Yutori',
      titulo: `¡Gracias, ${nombrePila(s.nombre)}!`,
      parrafos: privado
        ? ['Hemos recibido vuestra petición de taller privado. Miramos la disponibilidad de las artesanas y os escribimos con una propuesta de fecha, taller y precio.']
        : [`Hemos recibido tu petición de bono regalo (${s.detalle}). Te escribimos en breve para el pago y te enviamos el bono. Es válido durante 3 meses.`],
    },
    paraYutori(
      privado ? `Taller privado: ${s.motivo} · ${s.nombre}` : `Bono regalo: ${s.detalle} · ${s.nombre}`,
      privado ? 'Nueva petición de taller privado' : 'Nueva petición de bono regalo',
      [
        `**${s.nombre}** · ${s.telefono ?? ''} · ${s.email}`,
        privado
          ? [s.motivo, s.categoria, s.personas && `${s.personas} personas`, s.fecha_aprox && dia(s.fecha_aprox)].filter(Boolean).join(' · ')
          : `Bono ${s.tipo_bono === 'importe' ? 'por importe' : 'taller'}: ${s.detalle}${s.para_quien ? ` · para ${s.para_quien}` : ''}`,
        ...(s.mensaje ? [`“${s.mensaje}”`] : []),
      ],
      '/panel/solicitudes?estado=nueva',
    ),
  );
}

