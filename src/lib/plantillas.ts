// Plantillas de importación: qué columnas hacen falta para cada cosa, qué poner en cada una y un ejemplo.
// Sin dependencias: la página las enseña y el botón de descarga genera el CSV con ellas.

export type Columna = {
  nombre: string;
  obligatoria: 'sí' | 'no' | string;   // "sí", "no" o una condición ("solo si la clase es nueva")
  descripcion: string;
  ejemplo: string;
};

export type Plantilla = { titulo: string; columnas: Columna[] };

export const PLANTILLAS: Record<'talleristas' | 'solicitudes' | 'clases', Plantilla> = {
  talleristas: {
    titulo: 'tallerista',
    columnas: [
      { nombre: 'nombre', obligatoria: 'sí', descripcion: 'Nombre de la persona', ejemplo: 'Lucía Pérez' },
      { nombre: 'email', obligatoria: 'sí', descripcion: 'Email de contacto', ejemplo: 'lucia@ejemplo.com' },
      { nombre: 'propuesta', obligatoria: 'sí', descripcion: 'Qué ofrece, duración y precio aproximado', ejemplo: 'Grabado en tote bags, 2,5 h, unos 45 €' },
      { nombre: 'marca', obligatoria: 'no', descripcion: 'Nombre del proyecto o de la marca', ejemplo: 'Slowly Atelier' },
      { nombre: 'instagram', obligatoria: 'no', descripcion: 'Usuario de Instagram', ejemplo: '@slowly.atelier' },
      { nombre: 'telefono', obligatoria: 'no', descripcion: 'Teléfono de contacto', ejemplo: '600 000 000' },
      { nombre: 'categoria', obligatoria: 'no', descripcion: 'Tiene que coincidir con una categoría que ya exista', ejemplo: 'Grabado y estampación' },
      { nombre: 'ha_impartido', obligatoria: 'no', descripcion: 'Si ya ha dado talleres: sí o no', ejemplo: 'sí' },
      { nombre: 'autonoma', obligatoria: 'no', descripcion: 'Si es autónoma: sí o no', ejemplo: 'sí' },
      { nombre: 'estado', obligatoria: 'no', descripcion: 'Por defecto, aceptada. Otros: nueva, revision, reserva, descartada', ejemplo: 'aceptada' },
    ],
  },
  solicitudes: {
    titulo: 'petición de privado o bono',
    columnas: [
      { nombre: 'tipo', obligatoria: 'sí', descripcion: 'privado (taller privado) o bono (regalo)', ejemplo: 'privado' },
      { nombre: 'nombre', obligatoria: 'sí', descripcion: 'Nombre de quien pide', ejemplo: 'Julia Grupo' },
      { nombre: 'email', obligatoria: 'sí', descripcion: 'Email de contacto', ejemplo: 'julia@ejemplo.com' },
      { nombre: 'telefono', obligatoria: 'no', descripcion: 'Teléfono (para WhatsApp)', ejemplo: '633 333 331' },
      { nombre: 'motivo', obligatoria: 'no', descripcion: 'Solo privados: qué celebran', ejemplo: 'Despedida de soltera' },
      { nombre: 'categoria', obligatoria: 'no', descripcion: 'Tipo de taller que quieren, si lo saben', ejemplo: 'Velas y aromas' },
      { nombre: 'fecha_aprox', obligatoria: 'no', descripcion: 'Fecha aproximada: AAAA-MM-DD o DD/MM/AAAA', ejemplo: '21/11/2026' },
      { nombre: 'personas', obligatoria: 'no', descripcion: 'Número de personas', ejemplo: '10' },
      { nombre: 'tipo_bono', obligatoria: 'solo si es bono', descripcion: 'taller (un taller concreto) o importe (una cantidad)', ejemplo: 'importe' },
      { nombre: 'detalle', obligatoria: 'no', descripcion: 'Qué taller o qué importe del bono', ejemplo: '50 €' },
      { nombre: 'para_quien', obligatoria: 'no', descripcion: 'Para quién es el bono', ejemplo: 'Mi madre' },
      { nombre: 'mensaje', obligatoria: 'no', descripcion: 'Mensaje que escribieron', ejemplo: '¡Feliz cumpleaños!' },
      { nombre: 'estado', obligatoria: 'no', descripcion: 'Por defecto, nueva. Otros: en_curso, cerrada', ejemplo: 'nueva' },
    ],
  },
  clases: {
    titulo: 'horario de clase',
    columnas: [
      { nombre: 'clase', obligatoria: 'sí', descripcion: 'Nombre de la clase. Si ya existe, se añade el horario a esa clase', ejemplo: 'Punto por punto' },
      { nombre: 'tipo_clase', obligatoria: 'solo si la clase es nueva', descripcion: 'Cómo se llama el tipo de clase', ejemplo: 'Club de ganchillo' },
      { nombre: 'dia', obligatoria: 'sí', descripcion: 'lunes… domingo (o 1 a 7)', ejemplo: 'lunes' },
      { nombre: 'hora_inicio', obligatoria: 'sí', descripcion: 'Hora de inicio en formato HH:MM', ejemplo: '18:00' },
      { nombre: 'hora_fin', obligatoria: 'sí', descripcion: 'Hora de fin en formato HH:MM', ejemplo: '19:30' },
      { nombre: 'plazas', obligatoria: 'no', descripcion: 'Plazas del grupo. Por defecto, 8', ejemplo: '8' },
      { nombre: 'publico', obligatoria: 'no', descripcion: 'adultos o ninos. Por defecto, adultos', ejemplo: 'adultos' },
      { nombre: 'precio_mes', obligatoria: 'no', descripcion: 'Precio mensual en euros', ejemplo: '45' },
    ],
  },
};

/** CSV con las cabeceras y una fila de ejemplo. Separado por ";" (Excel en español) y con BOM para que se vean bien las tildes. */
export function plantillaCsv(tipo: keyof typeof PLANTILLAS) {
  const { columnas } = PLANTILLAS[tipo];
  const linea = (valores: string[]) => valores.map((v) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(';');
  return `﻿${linea(columnas.map((c) => c.nombre))}\r\n${linea(columnas.map((c) => c.ejemplo))}\r\n`;
}
