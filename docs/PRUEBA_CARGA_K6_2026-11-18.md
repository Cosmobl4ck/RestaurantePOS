# Prueba de carga k6 — capacidad de usuarios concurrentes

Fecha: 2026-11-18
Servidor: Express en `localhost:3010` (un solo proceso Node, sin cluster)
Base de datos: Supabase remoto `dnqkeqvyqtfnhhxxvamw`
Usuario de sesión: `Supervisor1` (gerente, plan trial)
Sesiones: 200 cookies firmadas creadas directo en `app_sessions` (sin login, para no chocar con el rate limit de 10/min)
Mezcla: 40% `/mesas`, 25% `/kds/cocina/cola`, 15% `/caja`, 10% `/facturas`, 10% `/healthz`
Pensamiento por iteración: 1–3 s
Datos de prueba: 200 sesiones temporales, eliminadas al terminar (`sid like 'lt-%'`).

---

## 1. Resultado por nivel

| VUs | RPS | avg | p50 | p90 | p95 | p99 | max | errores |
|---|---|---|---|---|---|---|---|---|
| 25 | 9.8 | 0.69 s | 0.66 s | 0.84 s | 1.87 s | 2.16 s | 2.24 s | 0% |
| 50 | 19.6 | 0.67 s | 0.67 s | 0.87 s | 1.31 s | 1.68 s | 1.84 s | 0% |
| 100 | 36.5 | 0.81 s | 0.71 s | 1.01 s | 2.34 s | 2.94 s | 3.00 s | 0% |
| 200 | 55.0 | 3.37 s | 1.08 s | 7.77 s | 22.76 s | 24.17 s | 25.31 s | 0% |

El nivel de 25 VUs arrancó en frío (primeras hidrataciones de sesión y catálogo), por eso su p95 sale peor que el de 50.

**Lectura:** hasta 100 VUs no hay errores y el sistema responde. A 200 VUs **no falla ninguna petición**, pero la p95 se va a **22.8 s**: está saturado, no caído.

---

## 2. Dónde está el cuello de botella

Prueba aislada con 200 VUs y 20 s por escenario:

| Escenario | RPS | avg | p95 | max |
|---|---|---|---|---|
| Estático `/css/petronas.css` (sin sesión) | 526 | 32 ms | 94 ms | 167 ms |
| `/healthz` sin cookie (sin store de sesión) | 567 | 3 ms | 6 ms | 60 ms |
| `/healthz` con cookie (sesión Supabase) | 145 | 1063 ms | 2763 ms | 3138 ms |

Node puede hacer **~550 req/s**. El mismo endpoint con sesión baja a **145 req/s** y p95 de 2.8 s.

Causa: cada petición autenticada hace, contra Supabase remoto:
1. `SELECT` de la sesión (`app_sessions`).
2. `UPDATE` de `expires_at/updated_at` (`store.touch` de express-session).

Son 2 operaciones de BD por request, secuenciales, antes de llegar a la vista. A eso se suman las consultas propias de cada página.

---

## 3. Respuesta a "cuántos usuarios soporta"

| Objetivo | Usuarios concurrentes |
|---|---|
| Buena experiencia (p95 ≤ 2 s) | **50–75** |
| Límite usable (p95 ≤ 3 s) | **~100** |
| Sin errores pero saturado (p95 > 20 s) | **200** |

Números válidos para esta máquina, este Supabase remoto y esta mezcla de solo lectura. No es una cifra universal.

---

## 4. Recomendaciones (en orden de impacto)

1. **Sacar la sesión de Supabase del camino crítico.** Redis o store local con TTL, o caché en memoria por proceso. Es el 80% del problema.
2. **Evitar el `touch` por request.** Implementar `touch` como no-op (la sesión ya tiene 24 h fijas) o `resave:false` sin rolling. Baja de 2 a 1 operación de BD por request.
3. **Caché de licencia por proceso**, no por sesión, para no repetir `usuarios`/`restaurantes` cada 60 s por cada sesión.
4. **Cluster Node + sticky sessions** solo después de arreglar el store; hoy agregar procesos no ayuda porque el cuello está en la BD remota.
5. **Rate limit:** real users vienen de IPs distintas. La prueba usó `X-Forwarded-For` único por VU para no compartir el cubo de 3000/15 min.

---

## 5. Reproducir

- Scripts: `%TEMP%\opencode\prep-sessions.js`, `%TEMP%\opencode\load.js`, `%TEMP%\opencode\diag.js`
- Crudos: `%TEMP%\opencode\k6-raw.json`, `%TEMP%\opencode\k6-diag.json`
- k6: `C:\Users\cosmo\bin\k6.exe`
