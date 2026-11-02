# Seguridad · Plazas de clases (PICO_SUELTAS, reservarMensual y renovarMes)

**Fecha:** 2026-10-17 · **Agente:** seguridad (solo lectura)
**Alcance:** commits `e644382` (`src/lib/clases.ts`, `src/pages/panel/clases.astro`) y `d7288aa` (`package.json`, `package-lock.json`) de la rama `claude/plazas-clases`.

## Resumen

El cambio **no abre ninguna vía de inyección** y **no permite pasarse del cupo por concurrencia**: la invariante «en cada sesión, mensuales + sueltas ≤ plazas» queda protegida en las tres rutas que insertan (mensual, suelta y renovación), cada una en una sola sentencia. Se reprodujo en SQLite 3.45 la renovación (grupo de 3 plazas, 6 candidatas, 1 suelta → renueva 2; repetida dos veces más → 0).

Queda abierto un tema de **abuso y de que Iris se entere**: unas sueltas falsas del mes siguiente pueden dejar sin renovar, en silencio, a alumnas que ya pagaban.

Recuento: 🔴 0 · 🟡 1 · 🔵 5.

## 🟡 1. Sueltas falsas del mes siguiente dejan sin renovar a alumnas mensuales, y el panel no lo cuenta
- **Dónde:** `src/lib/clases.ts:60-61` (`PICO_SUELTAS`), `:186` (cupo de la renovación); `src/pages/panel/clases.astro:16`, `:48-51` (se descarta `sinPlaza`).
- **Escenario:** `pedir-plaza` acepta sueltas en las próximas 4 semanas, también del mes siguiente. Un atacante hace N sueltas falsas el mismo día del mes siguiente (cada una `pendiente` 24 h). Si Iris renueva en esas 24 h, el cupo baja de 8 a 8 − N y las N alumnas más nuevas no se renuevan; luego las sueltas caducan y esas plazas quedan libres para cualquiera desde el día 20. Con sueltas legítimas pasa lo mismo sin mala fe. Si no se renueva ninguna, el panel dice «No había alumnas nuevas que renovar: ya estaban todas apuntadas.», que es falso en ese caso.
- **Frente al diagnóstico del 16-10:** para el acaparamiento normal no empeora el coste (una suelta falsa bloquea un sitio solo ese día). Lo nuevo es la vía de la renovación.
- **Arreglo:** (1) mostrar `sinPlaza` en el panel, mejor con nombres (**necesita texto de Iris**); (2) en el pico de la renovación contar solo sueltas confirmadas, o impedir sueltas del mes siguiente hasta renovar o hasta `DIA_APERTURA`; (3) límite de reservas pendientes por email/teléfono (diagnóstico del 16-10).
- **¿Toca textos?:** sí, el aviso (1). (2) no.

## 🔵 Notas
1. **Inyección SQL: sin riesgo.** `MENSUALES`, `SUELTAS` y `PICO_SUELTAS` solo reciben literales del código; los datos van por `.bind()`. Sugerencia: comentario «solo literales del código; nunca datos de usuario». No toca textos.
2. **Concurrencia: el cupo aguanta.** Una sola sentencia por inserción, escrituras en serie en D1; doble clic en «Renovar» no duplica; con grupo por encima del cupo (p. ej. por `importar.ts:426`) el límite es negativo y no inserta. `previstas` (`:178`) va aparte, así que `sinPlaza` puede descuadrar con reservas simultáneas (solo informativo; `db().batch` si se quiere exacto). No toca textos.
3. **Consentimientos copiados en la renovación** (`:184`): igual que antes del commit. Si cambian las condiciones, convendría guardar el origen (`renovada_de`) o pedir nueva aceptación. No toca textos.
4. **Renovadas `pendiente` sin caducidad** (`:183`): igual que antes; ocupan plaza hasta que Iris cancela. Sugerencia: `caduca_en` el día `DIA_APERTURA`. No toca textos.
5. **El pico cuenta sueltas de días ya pasados** (`:61`): del 1 al 19 se deja de vender alguna plaza de más. Arreglo: `AND s.fecha_sesion >= hoyEspana()` en el mes actual. No toca textos.
6. **CSRF y acceso del POST «Renovar alumnas»: bien** (middleware, `checkOrigin`, `SameSite=Strict`, sin parámetros de usuario, idempotente). Opcional: redirigir con 303 tras el POST.

## Dependencias (`d7288aa`)
`@astrojs/check@^0.9.10` y `typescript@^6.0.3` solo en `devDependencies`, paquetes oficiales. 77 paquetes en el lockfile, todos de `registry.npmjs.org` con `integrity`, sin `hasInstallScript`. Nada llega al bundle del Worker. **Correcto.**

## Veredicto
**Se puede fusionar desde el punto de vista de seguridad.** Antes de usar «Renovar alumnas» en un mes real conviene resolver el 🟡 1: como mínimo, que Iris vea quién se queda sin plaza (necesita texto de Iris).
