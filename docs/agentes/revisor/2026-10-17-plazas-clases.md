# Revisión · plazas de clases (commit `e644382`, rama `claude/plazas-clases`)

**Fecha:** 2026-10-17 · **Agente:** revisor (solo lectura) · **Alcance:** `src/lib/clases.ts`, `src/pages/panel/clases.astro` y lo que los llama o comparte (`src/pages/clases.astro`, `src/pages/clases/pedir-plaza.astro`, `MENSUALES`, `SUELTAS`, `disponibilidadSueltas`, `liberarCaducadas`).

## Resumen

El arreglo está bien hecho: `reservarMensual` y `renovarMes` comprueban e insertan en una sola sentencia; con las dos reglas (mensual `M + 1 + max_d S(d) ≤ plazas`, suelta `M + S(d) + 1 ≤ plazas`) ninguna sesión pasa de `plazas`; y `ocupacionMes` usa las mismas piezas que `reservarMensual`. El SQL es válido en SQLite/D1 (`WITH … INSERT … SELECT`, `ROW_NUMBER()`, subconsulta escalar con `GROUP BY … LIMIT 1` y `COALESCE`; el `SELECT` se calcula antes de insertar). Casos límite correctos: grupo sin reservas, mes sin sueltas, plazas por debajo de las ocupadas, doble clic en «Renovar». El diff no cambia ningún texto visible.

## 🔴 Bloqueantes

### 1. El panel descarta `sinPlaza` y, si no cabe nadie, el aviso dice algo falso
- **Dónde:** `src/pages/panel/clases.astro:16` y `:50`.
- **Escenario:** grupo de 8 con 8 confirmadas en octubre; el 21/10 entran 3 nuevas para noviembre; el 22/10 Iris renueva → «5 alumnas renovadas…» y no sabe que 3 veteranas se han quedado fuera. Si no cabe ninguna, sale «No había alumnas nuevas que renovar: ya estaban todas apuntadas.», que es falso.
- **Arreglo:** texto de aviso de Iris antes del merge (propuesta: «{N} alumnas no caben en {mes}: el horario está completo.», mejor con nombres). Mientras no haya texto, como mínimo no mostrar «ya estaban todas apuntadas» cuando `sinPlaza > 0`.

## 🟡 Conviene arreglar

2. **`PICO_SUELTAS` cuenta sueltas de días ya pasados** (`src/lib/clases.ts:60-61`, usado en `:66` y `:137`). Del 1 al 19 una sesión ya dada puede bloquear una mensual. Arreglo: `AND s.fecha_sesion >= ?hoy` con `hoyEspana()` como parámetro, igual en `ocupacionMes` y `reservarMensual`.
3. **`renovarMes` no libera antes las caducadas** (`:168`; en el panel `liberarCaducadas()` va después del POST). Pendientes caducadas del destino cuentan como ocupadas. Arreglo: `await liberarCaducadas()` al principio, como en `reservarMensual`.
4. **Las renovadas no caducan nunca** (`:183`). Con el cupo estricto, una renovada que no vuelve cierra la plaza todo el mes. Decisión de Iris (p. ej. `caduca_en` el día 1 del mes destino).
5. **Alumnas de horarios desactivados se pierden sin aviso** (`:172`, `:178`): no entran en `sinPlaza`; además `confirmadasActual` (`panel/clases.astro:35-36`, `:58`) las sigue contando. Arreglo: devolverlas aparte para el mismo aviso; opcionalmente contar solo horarios activos.

## 🔵 Notas

6. `ORDER BY r.creado_en, r.id` (`:171`): cada renovación crea fila nueva con `creado_en = now`, así que una nueva del 21/10 queda por delante de veteranas renovadas el 25/10. Ordenar por la primera alta de la alumna en el grupo o suavizar el comentario.
7. Duplicados en el origen (`:170-176`): dos filas de la misma alumna gastan dos puestos y se renuevan las dos (ya pasaba). Deduplicar con `ROW_NUMBER() OVER (PARTITION BY grupo_id, lower(email), lower(nombre), COALESCE(nombre_menor,''))`.
8. `previstas` en sentencia aparte (`:178`): `sinPlaza` puede ser aproximado; solo informativo.
9. Se renueva en clases que la web no enseña (`:172`): falta `JOIN clases c … AND c.activa = 1` (y `MOSTRAR_NINOS`).
10. Rendimiento de `ocupacionMes` (`:64-68`): 2 subconsultas por grupo, también inactivos; `substr(fecha_sesion,1,7)` no usa índice. Irrelevante hoy; si crece, `WHERE g.activo = 1`, `BETWEEN` e índices nuevos.
11. Caducadas contadas en `/clases` y `pedir-plaza` (`pedir-plaza.astro:19`, `clases.astro:10`): `ocupacionMes` puede leer antes de `liberarCaducadas`. Arreglo: que `ocupacionMes` libere al empezar.
12. El `INSERT … SELECT` de la renovación no lleva `ORDER BY` (`:182-186`): añadir `ORDER BY c.grupo_id, c.fila`.

## Propuestas para Iris
- Texto del aviso cuando alguna alumna no cabe al renovar (🔴 1).
- Hasta cuándo se guarda la plaza a una renovada que no paga (🟡 4).

## Veredicto
**Listo tras arreglar los 🔴.** Del bloque 🟡, el 2 y el 3 son de una línea y conviene hacerlos en este PR.
