---
# Copiado de kit-agents (astro-cloudflare 1.0.0). No se edita aquí: se cambia en el kit y se vuelve a copiar.
name: pagina-panel
description: Crea páginas del panel de administración (listado con filtros, ficha editable, alta) en Astro con servidor. Úsala al añadir una sección nueva al panel/ERP/CRM o una acción sobre registros existentes.
---

# Página de panel (Astro + Cloudflare)

Un panel de administración se construye con tres tipos de página por cada entidad (clientes, reservas, empleados…):

| Ruta | Para qué |
|---|---|
| `/panel/<entidad>` | Listado con filtros |
| `/panel/<entidad>/[id]` | Ficha: ver, editar y acciones (cambiar estado, eliminar…) |
| `/panel/<entidad>/nueva` (o `nuevo`) | Alta |

## Reglas comunes

1. **Protección centralizada**: el acceso al panel lo controla el **middleware** para toda la ruta `/panel`.
   Nunca se protege página a página: una página nueva olvidada quedaría abierta.
2. **Con servidor**: `export const prerender = false;` y el layout del panel del proyecto.
3. **Sin caché compartida ni buscadores**: `Cache-Control: private, no-store` (mejor en el middleware) y
   `<meta name="robots" content="noindex, nofollow">` en el layout.

## Listado

- Filtros por **parámetros de URL** (`?estado=nueva`), para que se puedan guardar y compartir.
- Valida el filtro contra la lista de valores permitidos antes de usarlo en SQL:
  ```ts
  const estado = Astro.url.searchParams.get('estado');
  const filtro = estado && estado in ESTADOS ? estado : null;
  ```
- Marca el filtro activo con `aria-current`.
- Estado vacío explicado («No hay reservas con este estado»), nunca una tabla vacía sin texto.
- Tablas con `data-label` en cada celda para que en móvil se puedan mostrar como tarjetas.

## Ficha y acciones

- Cada acción es un `<form method="post">` con un campo oculto `accion` (`guardar`, `publicar`, `eliminar`…).
  El frontmatter decide qué hacer según su valor.
- Tras cada acción, **POST-redirect-GET** con un aviso: `Astro.redirect('/panel/<entidad>/<id>?ok=guardado', 303)`.
  El layout traduce `?ok=` a un mensaje («Cambios guardados.») con `role="status"`.
- Los cambios de estado se hacen con un `UPDATE ... WHERE id = ? AND estado IN (<estados de origen permitidos>)`,
  así no se pasa a un estado imposible aunque dos personas pulsen a la vez.
- Las acciones destructivas piden confirmación y se distinguen visualmente (botón de peligro).
- Si un `id` no existe, responde 404; no pintes una ficha vacía.

## Alta

- Mismos campos y validación que la edición: extráelos a un componente compartido
  (por ejemplo, `components/panel/Campos<Entidad>.astro`) para no duplicarlos.
- Tras guardar, vuelve al alta con `?ok=anadido` si es habitual añadir varios seguidos, o a la ficha creada.

## Antes de terminar

- Añade la sección al menú del layout del panel si es nueva.
- Comprueba la página en móvil (360 px).
