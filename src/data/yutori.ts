// Datos del negocio. Lo marcado con TODO es de ejemplo: sustituir por los datos reales de Iris.

export const negocio = {
  nombre: 'Yutori',
  subtitulo: 'Espacio Creativo',
  lema: 'Talleres y clases para aprender, crear y disfrutar. Un espacio tranquilo para desconectar creando con las manos.',
  direccion: 'Plaza Pontevedra 14, 1-1º-B2',
  ciudad: '15003 A Coruña',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Yutori+Espacio+Creativo+Plaza+Pontevedra+14+A+Coru%C3%B1a',
  email: 'yutori.espaciocreativo@gmail.com',
  instagram: 'https://www.instagram.com/yutori.espaciocreativo/',
  instagramUsuario: '@yutori.espaciocreativo',
  // Cómo se paga a Yutori (clases y talleres propios). TODO: p. ej. 'Bizum al 600 000 000 (Yutori)'.
  pagoYutori: '',
  // Prototipo: Google no debe mostrar la web. Cambiar a true el día que se publique con su dominio.
  indexar: false,
};

// Titular de la web para los textos legales. TODO: datos reales (los pide la LSSI).
export const titular = {
  nombre: '', // nombre y apellidos o razón social
  nif: '',
  // Fecha de la última revisión de los textos legales.
  revision: '13 de octubre de 2026',
};

// Nota de Google Maps a 13/10/2026. Actualizar de vez en cuando.
export const resenasGoogle = { nota: '5,0', total: 32 };

// Reseñas reales de Google elegidas el 13/10/2026 (texto tal cual, nombre abreviado).
export const resenas: { texto: string; autora: string; cuando: string }[] = [
  {
    texto: 'Espacio de 10. Hice varias formaciones (taller de creación joyas, de ambientadores y el de realizar una corona de Adviento). Me lo he pasado genial, las profesionales que los imparten son encantadoras y súper atentas. El ambiente es estupendo. Una forma excelente de desconectar y aprender cosas nuevas. También tienen un pequeño espacio con velas y joyas artesanales por si te apetece comprar algún regalo.',
    autora: 'S. S.',
    cuando: 'Reseña de Google',
  },
  {
    texto: '¡Hice el taller de velas con Iris y fue simplemente genial! El sitio es super agradable y muy acogedor para hacer los talleres, sin duda alguna lo recomiendo. ¡Repetiremos seguro!',
    autora: 'COCOLOCO Pets',
    cuando: 'Reseña de Google',
  },
  {
    texto: 'He ido al taller de Joyas Bar Charm y ha sido increíble. No me lo pude haber pasado mejor. ¡Menudos artistas! Estoy segura de que volveré a hacer otros talleres.',
    autora: 'Aida C.',
    cuando: 'Reseña de Google',
  },
];

// «Antes de reservar», en la página de talleres. El de la política lleva enlace a /condiciones.
export const detallesTalleres: { titulo: string; texto: string | string[]; enlace?: string }[] = [
  { titulo: 'Plazas limitadas', texto: 'Grupos pequeños para una mejor atención.' },
  { titulo: 'Materiales', texto: 'En nuestros talleres los materiales están siempre incluidos.' },
  { titulo: 'Sin experiencia previa', texto: 'No es necesario tener conocimientos para poder realizar nuestros talleres.' },
  {
    titulo: 'Política de reservas y cancelaciones',
    texto: [
      'Tu plaza queda confirmada con el pago.',
      'Los talleres de otras artesanas se pagan directamente a ellas.',
      'Más de 7 días antes: reembolso o cambio al próximo taller.',
      'Menos de 7 días: puedes ceder tu plaza.',
    ],
    enlace: '/condiciones',
  },
];

export function duracion(inicio: string, fin: string) {
  const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const total = min(fin) - min(inicio);
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  return `${horas} h${resto ? ` ${resto} min` : ''}`;
}

/** Enlace para escribir a Yutori por email (de momento no se usa WhatsApp para el espacio). */
export const emailUrl = (asunto = '') =>
  `mailto:${negocio.email}${asunto ? `?subject=${encodeURIComponent(asunto)}` : ''}`;

export type Grupo = { dia: string; inicio: string; fin: string };

export type Publico = {
  para: 'Adultos' | 'Niños';
  precioMes: string;
  precioSuelta?: string; // solo adultos
  grupos: Grupo[];
};

export type Clase = {
  id: string;
  nombre: string;
  tipo: string;
  colabora?: string;
  descripcion: string;
  temas: string[];
  kitIncluido: boolean;
  modalidades?: string[];
  publicos: Publico[];
};

export const PLAZAS_CLASE = 8;

// Mostrar las clases infantiles (Iris las anuncia en Instagram, aún sin alumnos).
export const MOSTRAR_NINOS = true;

// Textos y precios del curso 2026/27, tal como los publica Iris en Instagram.
export const clases: Clase[] = [
  {
    id: 'ganchillo',
    nombre: 'Punto por punto',
    tipo: 'Club de ganchillo',
    descripcion: 'Un curso pensado para empezar desde cero o seguir avanzando poco a poco, mientras das forma a proyectos hechos por ti.',
    temas: ['Puntos básicos', 'Nuevas técnicas', 'Lectura de patrones', 'Proyectos paso a paso'],
    kitIncluido: true,
    publicos: [
      {
        para: 'Adultos',
        precioMes: '55 €/mes',
        precioSuelta: '20 €',
        grupos: [
          { dia: 'Lunes', inicio: '18:00', fin: '19:30' },
          { dia: 'Lunes', inicio: '19:30', fin: '21:00' },
          { dia: 'Viernes', inicio: '10:30', fin: '12:00' },
        ],
      },
      { para: 'Niños', precioMes: '40 €/mes', grupos: [{ dia: 'Lunes', inicio: '17:00', fin: '18:00' }] },
    ],
  },
  {
    id: 'acuarela',
    nombre: 'Aguadas',
    tipo: 'Clases de acuarela',
    colabora: 'Yutori x ALO',
    descripcion: 'Conoce técnicas de acuarela a través de la práctica y la experimentación en tu propio proyecto. Un punto de encuentro semanal para aprender, desconectar, relajarse, conocer gente y expresarse a través de la acuarela.',
    temas: ['Técnicas de acuarela', 'Experimentación', 'Tu propio proyecto'],
    kitIncluido: false,
    publicos: [
      {
        para: 'Adultos',
        precioMes: '55 €/mes',
        precioSuelta: '20 €',
        grupos: [
          { dia: 'Martes', inicio: '18:00', fin: '19:30' },
          { dia: 'Martes', inicio: '19:30', fin: '21:00' },
        ],
      },
      { para: 'Niños', precioMes: '40 €/mes', grupos: [{ dia: 'Martes', inicio: '17:00', fin: '18:00' }] },
    ],
  },
  {
    id: 'costura',
    nombre: 'Atelier textil',
    tipo: 'Costura y bordado',
    descripcion: 'Un espacio reducido para desarrollar tus proyectos textiles con acompañamiento cercano y sin prisas.',
    temas: ['Costura', 'Bordado', 'Pintura textil', 'Intervención de prendas'],
    kitIncluido: true,
    modalidades: ['Con máquina', 'Sin máquina'],
    publicos: [
      {
        para: 'Adultos',
        precioMes: '50-60 €/mes', // TODO: confirmar qué precio corresponde a cada modalidad
        precioSuelta: '20 €',
        grupos: [
          { dia: 'Miércoles', inicio: '10:00', fin: '12:00' },
          { dia: 'Jueves', inicio: '18:00', fin: '20:00' },
          { dia: 'Jueves', inicio: '20:00', fin: '22:00' },
        ],
      },
      { para: 'Niños', precioMes: '45 €/mes', grupos: [{ dia: 'Jueves', inicio: '16:30', fin: '18:00' }] },
    ],
  },
];

export const publicosVisibles = (c: Clase) => c.publicos.filter((p) => MOSTRAR_NINOS || p.para === 'Adultos');

export const politicaTalleres = [
  'Para reservar plaza en cualquiera de los talleres es necesario el pago del mismo.',
  'Si cancelas por causa de fuerza mayor con más de 7 días de antelación, podrás elegir entre el reembolso o guardar la reserva para el próximo taller.',
  'Si cancelas con menos de 7 días de antelación, podrás ceder tu plaza a otra persona.',
  'Si cancelamos nosotros, podrás elegir entre el reembolso o guardar la reserva para el próximo taller.',
  'Consulta las condiciones particulares de cada taller.',
];

export const politicaClases = [
  'Las clases se abonan en el momento de la reserva.',
  'Si cancelas con más de 24 horas de antelación, podrás recuperar tu clase en el mismo mes (clases mensuales) o en otro momento (clases sueltas), siempre que haya disponibilidad.',
  'Si cancelas con menos de 24 horas de antelación, la clase se dará por consumida.',
];

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function fechaLarga(iso: string) {
  const [a, m, d] = iso.split('-').map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DIAS[dia]} ${d} de ${MESES[m - 1]}`;
}
