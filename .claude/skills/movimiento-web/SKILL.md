---
# Copiado de kit-agents (equipo-base 1.1.0). No se edita aquí: se cambia en el kit y se vuelve a copiar.
name: movimiento-web
description: Reglas y técnicas para animar interfaces web con buen gusto, accesibles y ligeras (microinteracciones, aparición al hacer scroll, transiciones entre páginas). Úsala siempre que vayas a añadir o revisar animaciones o transiciones.
---

# Movimiento en la web

## Principios

1. **El movimiento explica, no decora**: de dónde viene algo, qué ha cambiado, qué se puede tocar.
   Si no explica nada, sobra.
2. **Sutil**: desplazamientos de 8-24 px y escalas de 0,96 a 1. Lo exagerado cansa a la segunda visita.
3. **Accesible**: todo movimiento va dentro de `prefers-reduced-motion: no-preference`.
   Sin él, la página se ve y funciona igual de bien.
4. **Ligero**: solo `transform` y `opacity` (los anima la tarjeta gráfica). Nunca `width`, `height`, `top`,
   `left`, `margin` ni `box-shadow`, porque provocan tirones.

## Duraciones y curvas

| Tipo | Duración |
|---|---|
| Microinteracción (hover, pulsar, foco) | 120-200 ms |
| Aparición de un elemento | 300-500 ms |
| Transición entre páginas | 250-400 ms |

- Entrar: `cubic-bezier(0.2, 0.8, 0.2, 1)` (rápido al principio y suave al final).
- Salir: más corto que entrar y con `ease-in`.
- Define las duraciones y las curvas como variables (`--duracion-corta`, `--curva-salida`…) junto al resto de tokens.

## Patrón base

```css
@media (prefers-reduced-motion: no-preference) {
  .tarjeta { transition: transform var(--duracion-corta) var(--curva-salida); }
  .tarjeta:hover { transform: translateY(-4px); }
}
```

## Aparecer al hacer scroll (sin JavaScript)

```css
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .aparece {
      animation: aparecer linear both;
      animation-timeline: view();
      animation-range: entry 0% cover 30%;
    }
  }
}
@keyframes aparecer {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: none; }
}
```

- El contenido es **visible por defecto**. Solo se anima si el navegador lo admite (`@supports`).
  Nunca ocultes contenido esperando a que un script lo muestre.
- Escalonado: `animation-delay: calc(var(--i) * 60ms)`, con `style="--i: 2"` en cada elemento.

## Transiciones entre páginas (View Transitions)

En webs de varias páginas (como Astro sin router de cliente) basta con CSS:

```css
@media (prefers-reduced-motion: no-preference) {
  @view-transition { navigation: auto; }
}
```

- Para que un elemento «viaje» de una página a otra (la foto de una tarjeta que se convierte en la foto grande de la ficha),
  pon el mismo `view-transition-name` en los dos. Debe ser **único en cada página**: `view-transition-name: foto-<slug>`.
- Los navegadores que no lo admiten cambian de página como siempre: no hace falta nada más.

## Qué no hacer

- Secuestrar el scroll (scroll-jacking) o meter parallax pesado.
- Carruseles que avanzan solos.
- Animaciones de más de 600 ms en contenido que hay que leer o usar.
- Destellos de más de 3 por segundo (WCAG 2.3.1).
- Librerías de animación para lo que hace CSS.

## Comprobar

- Captura con `prefers-reduced-motion: reduce` (skill `capturas-pantalla`): todo tiene que verse.
- Captura con `--wait-for-timeout` para ver el estado final de las animaciones de entrada.
