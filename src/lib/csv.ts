// Lectura de CSV sin dependencias. Entiende los dos separadores habituales de Excel en español (";") y de Google/inglés (","),
// comillas dobles ("texto con ; dentro") y saltos de línea de Windows o de Mac.

/** Cabeceras en minúsculas, sin acentos y con guiones bajos: "Fecha límite" → "fecha_limite". */
export function normalizar(texto: string) {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export type Fila = Record<string, string>;

/** Convierte el texto de un CSV en filas. La primera línea son las cabeceras. */
export function parsearCsv(texto: string): Fila[] {
  const limpio = texto.replace(/^﻿/, ''); // Excel suele añadir un BOM invisible al principio
  const primeraLinea = limpio.split(/\r?\n/)[0] ?? '';
  // Lo que se pega desde una hoja de cálculo llega separado por tabuladores; un CSV, por ";" o ",".
  const separador = [';', ',', '\t'].reduce((mejor, s) =>
    primeraLinea.split(s).length > primeraLinea.split(mejor).length ? s : mejor,
  ';');

  // Recorremos el texto carácter a carácter: así sabemos si estamos dentro de unas comillas.
  const matriz: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let dentroDeComillas = false;

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (dentroDeComillas) {
      if (c === '"' && limpio[i + 1] === '"') { campo += '"'; i++; } // "" dentro de comillas = una comilla
      else if (c === '"') dentroDeComillas = false;
      else campo += c;
    } else if (c === '"') {
      dentroDeComillas = true;
    } else if (c === separador) {
      fila.push(campo); campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++; // \r\n cuenta como un solo salto
      fila.push(campo); matriz.push(fila); fila = []; campo = '';
    } else {
      campo += c;
    }
  }
  fila.push(campo);
  matriz.push(fila);

  const [cabecera, ...cuerpo] = matriz.filter((f) => f.some((c) => c.trim() !== ''));
  if (!cabecera) return [];
  const claves = cabecera.map(normalizar);
  return cuerpo.map((f) => Object.fromEntries(claves.map((k, i) => [k, (f[i] ?? '').trim()])));
}
