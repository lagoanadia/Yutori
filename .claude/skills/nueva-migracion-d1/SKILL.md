---
# Copiado de kit-agents (astro-cloudflare 1.0.0). No se edita aquí: se cambia en el kit y se vuelve a copiar.
name: nueva-migracion-d1
description: Crea una migración de base de datos Cloudflare D1 (SQLite) con numeración correcta, convenciones de tipos y prueba en local. Úsala siempre que haya que crear o cambiar tablas, columnas, índices o datos iniciales.
---

# Nueva migración D1

## 1. Localiza las migraciones

- La carpeta está en `migrations_dir` del bloque `d1_databases` de `wrangler.jsonc` (normalmente `migrations/`).
- El nombre de la base de datos es su `database_name`.
- Mira el último archivo: la nueva migración lleva el **siguiente número con 4 cifras** y un nombre descriptivo
  en snake_case: `0009_pagos_online.sql`.

**Nunca edites una migración que ya existe.** Puede estar aplicada en producción: cualquier cambio va en una nueva.

## 2. Escribe el SQL

Encabeza el archivo con un comentario que explique **por qué** existe la migración.

Convenciones (salvo que el `CLAUDE.md` del proyecto diga otra cosa):

| Dato | Tipo | Ejemplo |
|---|---|---|
| Dinero | `INTEGER` en céntimos, columna `*_cent` | `precio_cent INTEGER` |
| Día | `TEXT` ISO `AAAA-MM-DD` | `fecha TEXT NOT NULL` |
| Momento | `TEXT` ISO UTC | `creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now'))` |
| Sí/no | `INTEGER` 0/1 | `activa INTEGER NOT NULL DEFAULT 1` |
| Estado | `TEXT` + `CHECK` | `estado TEXT NOT NULL DEFAULT 'nueva' CHECK (estado IN ('nueva', 'cerrada'))` |
| Lista pequeña | `TEXT` con JSON | `fotos TEXT NOT NULL DEFAULT '[]'` |
| Relación | `REFERENCES` | `cliente_id INTEGER REFERENCES clientes(id)` |

- Crea un índice para cada columna por la que se filtre u ordene a menudo (`estado`, `fecha`, claves ajenas).
- Datos iniciales idempotentes: `INSERT ... ON CONFLICT (...) DO NOTHING` o `DO UPDATE`.

## 3. Límites de SQLite y D1

- `ALTER TABLE` solo permite **añadir** columnas (`ADD COLUMN`) y renombrar. Una columna nueva `NOT NULL` necesita `DEFAULT`.
- Para cambiar un `CHECK`, un tipo o quitar una columna hay que **recrear la tabla**:
  ```sql
  PRAGMA defer_foreign_keys = true;
  CREATE TABLE reservas_nueva (...);           -- con la definición corregida
  INSERT INTO reservas_nueva (...) SELECT ... FROM reservas;
  DROP TABLE reservas;
  ALTER TABLE reservas_nueva RENAME TO reservas;
  -- vuelve a crear los índices de la tabla
  ```
- No uses `BEGIN TRANSACTION` / `COMMIT` en el archivo: D1 no lo admite y cada migración ya se aplica entera o nada.

## 4. Pruébala en local

```
npx wrangler d1 migrations apply <database_name> --local
npx wrangler d1 execute <database_name> --local --command "SELECT * FROM <tabla> LIMIT 5"
```

Usa los scripts de `package.json` si el proyecto los tiene (por ejemplo, `npm run db:migrar:local`).

## 5. Actualiza el código que depende de ella

- Tipos de TypeScript de las filas afectadas.
- Etiquetas legibles de los estados nuevos (si el proyecto tiene un mapa tipo `ESTADOS_*`).
- Las consultas que hacen `SELECT` de esas columnas.

## 6. Producción

Aplicar en remoto (`--remote`) **solo con permiso explícito** de la persona responsable, y después de hacer merge.
Indícalo en el resumen del PR: «Requiere aplicar la migración 0009 en remoto».
