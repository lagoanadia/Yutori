// Datos del negocio. Lo marcado con TODO es de ejemplo: sustituir por los datos reales de Iris.

export const negocio = {
  nombre: 'Yutori',
  subtitulo: 'Espacio Creativo',
  lema: 'Clases creativas para aprender, crear y disfrutar',
  direccion: 'Plaza Pontevedra 14, 1º-B2',
  ciudad: '15003 A Coruña',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Yutori+Espacio+Creativo+Plaza+Pontevedra+14+A+Coru%C3%B1a',
  email: 'yutori.espaciocreativo@gmail.com',
  instagram: 'https://www.instagram.com/yutori.espaciocreativo/',
  instagramUsuario: '@yutori.espaciocreativo',
  whatsapp: '', // TODO: número de Iris en formato 34XXXXXXXXX
  // Prototipo: Google no debe mostrar la web. Cambiar a true el día que se publique con su dominio.
  indexar: false,
};

// Nota de Google Maps a 13/10/2026. Actualizar de vez en cuando.
export const resenasGoogle = { nota: '5,0', total: 32 };

// TODO: 3 reseñas reales que elija Iris (texto tal cual y nombre con la inicial del apellido).
export const resenas: { texto: string; autora: string }[] = [];

export const detallesTalleres: { titulo: string; texto: string; pendiente?: boolean }[] = [
  { titulo: 'Plazas limitadas', texto: 'Grupos pequeños: las clases tienen un máximo de 8 personas y cada taller indica sus plazas.' },
  { titulo: 'Duración', texto: 'La mayoría de talleres duran entre 2 y 3 horas. Cada ficha indica el horario exacto.' },
  { titulo: 'Reserva y pago', texto: 'Tu plaza queda confirmada con el pago. Los talleres de otras artesanas se pagan directamente a ellas.' },
  { titulo: 'Materiales', texto: 'Cada taller indica si los materiales están incluidos.', pendiente: true }, // TODO: confirmar con Iris
  { titulo: 'Edad', texto: 'Talleres pensados para personas adultas.', pendiente: true }, // TODO: confirmar edad mínima con Iris
  { titulo: 'Cancelaciones', texto: 'Más de 7 días antes: reembolso o cambio al próximo taller. Menos de 7 días: puedes ceder tu plaza.' },
];

export function duracion(inicio: string, fin: string) {
  const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const total = min(fin) - min(inicio);
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  return `${horas} h${resto ? ` ${resto} min` : ''}`;
}

export const whatsappUrl =(texto = 'Hola Yutori, tengo una pregunta') =>
  negocio.whatsapp ? `https://wa.me/${negocio.whatsapp}?text=${encodeURIComponent(texto)}` : '#';

export type Grupo = { dia: string; inicio: string; fin: string };

export type Clase = {
  id: string;
  nombre: string;
  tipo: string;
  descripcion: string;
  grupos: Grupo[];
  modalidades?: string[];
  precioMes: string;
  precioSuelta: string;
};

export const PLAZAS_CLASE = 8;

export const clases: Clase[] = [
  {
    id: 'ganchillo',
    nombre: 'Punto por punto',
    tipo: 'Club de ganchillo',
    descripcion: 'Aprende ganchillo desde cero o sigue avanzando con tus proyectos, a tu ritmo y en buena compañía.', // TODO: texto de Iris
    grupos: [
      { dia: 'Lunes', inicio: '18:00', fin: '19:30' },
      { dia: 'Lunes', inicio: '19:30', fin: '21:00' },
      { dia: 'Viernes', inicio: '10:30', fin: '12:00' },
    ],
    precioMes: 'XX €/mes', // TODO
    precioSuelta: 'XX €', // TODO
  },
  {
    id: 'acuarela',
    nombre: 'Aguadas',
    tipo: 'Clases de acuarela',
    descripcion: 'Técnicas de acuarela para soltar la mano y disfrutar del color, con ejercicios guiados en cada clase.', // TODO: texto de Iris
    grupos: [
      { dia: 'Martes', inicio: '18:00', fin: '19:30' },
      { dia: 'Martes', inicio: '19:30', fin: '21:00' },
    ],
    precioMes: 'XX €/mes', // TODO
    precioSuelta: 'XX €', // TODO
  },
  {
    id: 'costura',
    nombre: 'Atelier textil',
    tipo: 'Costura y bordado',
    descripcion: 'Costura y bordado para crear tus propias prendas y piezas, con máquina o a mano.', // TODO: texto de Iris
    grupos: [
      { dia: 'Miércoles', inicio: '10:00', fin: '12:00' },
      { dia: 'Jueves', inicio: '18:00', fin: '20:00' },
      { dia: 'Jueves', inicio: '20:00', fin: '22:00' },
    ],
    modalidades: ['Con máquina', 'Sin máquina'],
    precioMes: 'XX €/mes', // TODO
    precioSuelta: 'XX €', // TODO
  },
];

export type Taller = {
  id: string;
  titulo: string;
  imparte: string;
  fecha: string; // AAAA-MM-DD
  inicio: string;
  fin: string;
  precio: string;
  plazas: number;
  libres: number;
  evento?: boolean;
  texto: string;
  materiales?: string;
};

// TODO: talleres de ejemplo. En el bloque 3 vendrán de la base de datos.
export const talleres: Taller[] = [
  {
    id: 'grabado-tote-bags',
    titulo: 'Grabado y estampación en tote bags',
    imparte: 'Slowly Atelier',
    fecha: '2026-10-17',
    inicio: '10:30',
    fin: '13:00',
    precio: 'XX €',
    plazas: 8,
    libres: 3,
    texto: 'Diseña, graba y estampa tu propia bolsa de tela.',
    materiales: 'Todos los materiales incluidos',
  },
  {
    id: 'lamparas-origami',
    titulo: 'Lámparas de origami',
    imparte: 'Slowly Atelier',
    fecha: '2026-10-25',
    inicio: '16:00',
    fin: '18:00',
    precio: 'XX €',
    plazas: 8,
    libres: 0,
    texto: 'Diseña y crea tu propia lámpara de papel.',
    materiales: 'Todos los materiales incluidos',
  },
  {
    id: 'taller-halloween',
    titulo: 'Taller de Halloween',
    imparte: 'Yutori',
    fecha: '2026-10-31',
    inicio: '11:00',
    fin: '13:00',
    precio: 'XX €',
    plazas: 8,
    libres: 5,
    evento: true,
    texto: 'Un taller especial para celebrar Halloween creando con las manos.',
  },
];

export const categorias = [
  'Acuarela y pintura',
  'Ganchillo y punto',
  'Costura y bordado',
  'Velas y aromas',
  'Grabado y estampación',
  'Papel y origami',
  'Otra',
];

export const politicaTalleres = [
  'Para reservar plaza en cualquiera de los talleres es necesario el pago del mismo.',
  'Si cancelas por causa de fuerza mayor con más de 7 días de antelación, podrás elegir entre el reembolso o guardar la reserva para el próximo taller.',
  'Si cancelas con menos de 7 días de antelación, podrás ceder tu plaza a otra persona.',
  'Si cancelamos nosotros, podrás elegir entre el reembolso o guardar la reserva para el próximo taller.',
  'Consulta las condiciones particulares de cada taller.',
];

export const politicaClases = [
  'Las clases mensuales se abonan entre los días 1 y 5 de cada mes.',
  'Las clases puntuales se abonan en el momento de la reserva.',
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
