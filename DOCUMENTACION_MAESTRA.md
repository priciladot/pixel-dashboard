# Documentación Maestra del Ecosistema — Pixel Dashboard

**Estado:** v3 — 2026-09-21 (agrega el módulo de Marketing; julio/agosto ya verificados contra la nueva regla de dinero; zona horaria ya corregida en el código)
**Alcance:** Todo lo confirmado e implementado hasta esta fecha. No incluye nada especulativo; donde algo quedó como "decisión mía sin confirmar explícita", se marca así.

---

## 1. Módulo de HubSpot y CRM (equipo comercial)

### 1.1 Negocios (Deals)
- Tabla `hubspot_deals`: `hubspot_id`, `vendedor_id` (resuelto por owner), `periodo_id`, `monto_sin_iva`, `monto_con_iva`, `cerrado_ganado`, `fecha_cierre`, `fecha_creacion`, `tipo_cliente` (hoy casi siempre `"por_revisar"` — HubSpot no lo clasifica de forma confiable; la clasificación Existente/Nuevo real vive en Monday vía "¿Cómo llegó?", no en este campo).
- `periodo_id` sigue el calendario de `periodos` (formato `YYYY-MM`), con dos ventanas posibles: `kpi_4_semanas` (S1–S4, ventana operativa de 4 semanas) y `calendario` (mes natural 1–31). **Nunca se mezclan** — cada cálculo declara explícitamente cuál usa.

### 1.2 Actividades y tareas
- Tabla `hubspot_engagements` (`tipo`: `call` | `email` | `meeting` | `note` | `task`), con `deal_id_ref`, `contact_id_ref`, `company_id_ref`, `vendedor_id` (resuelto por `owner_hubspot_id`), `asunto`, `estado`, `fecha` (para tareas, `fecha` = `hs_timestamp` = fecha de **vencimiento**, no de creación).
- La búsqueda de actividades por sincronización filtra por `hs_timestamp` dentro del rango del periodo que se está sincronizando. **Limitación mitigada:** si una tarea se reagenda fuera de ese rango, la corrida normal ya no la vuelve a encontrar con ese filtro — fix aplicado: cada sincronización también refresca **por id** las tareas ya guardadas como abiertas dentro del periodo en curso, para corregir el reagendado en la misma corrida.
- Enriquecimiento de tareas para Disciplina Comercial: si la tarea no tiene negocio asociado (común, ej. asunto "remark"), el correo del contacto se resuelve directo por `contact_id_ref` contra `hubspot_contacts`. La sincronización también trae y guarda esos contactos citados directo en actividades.

### 1.3 Disciplina Comercial (ritmo semanal S1–S4)
Por cada semana del periodo (`periodo_semanas`), para el vendedor:
- **Estatus de cierre**: monto vendido en la semana vs. 1/4 de la meta mensual (`objetivos.objetivo_total / 4`). Cumplido / en progreso (≥70%) / no alcanzado.
- **Estatus CRM**: tareas completadas / asignadas en la semana. Cumplido (100%) / en progreso (≥50%) / no alcanzado.
- **Estatus de volumen**: negocios creados esta semana vs. la semana anterior. Mismos umbrales 100%/70%.
- **Estatus general**: el peor de los tres anteriores (no_alcanzado > en_progreso > cumplido).
- Semanas futuras quedan en `"pendiente"` (no se evalúan como fracaso ni éxito contra un 0).
- **Racha**: semanas consecutivas "cumplido", contando hacia atrás desde hoy, se rompe en el primer "no cumplido".
- Alerta adicional de disciplina: 0 notas CRM esta semana, notas por debajo de la semana anterior, o negocios estancados 5+ días.

### 1.4 Leads: Marketing vs. Ventas
- Objeto separado `hubspot_leads` (`etapa`, `fecha_creacion`, `deal_id_ref`, `vendedor_id`).
- **Regla de atribución a Marketing** (confirmada explícitamente): solo cuentan como leads de Marketing los que llegaron por **Redes sociales** o **Showroom** — se excluyen Remarketing y Contacto existente (cartera existente, no adquisición nueva).
- El panel de Marketing separa "leads calificados reales" (conteo real vía HubSpot/Monday) de "leads calificados" (autoreporte semanal) — ver Sección 3.2, KPI 1, para el detalle completo de esta distinción.

### 1.5 Clasificación de canal (Existentes vs. Nuevos)
- `CANALES_CARTERA_EXISTENTE = {"contacto existente", "remarketing"}` (case-insensitive). Cualquier otro canal capturado = Nuevo. Sin canal capturado = `"sin_canal"` (nunca se inventa).
- Alias de captura conocidos en Monday: `"Adds"` (typo) se normaliza a `"Ads"` antes de agrupar.
- Lista fija de canales para "Participación por Canales de Origen": Existentes = [Contacto existente, Remarketing]; Nuevos = [Recomendación, Equipo Comercial, WhatsApp, Instagram, Facebook, Mail, Ads, Patagon, Prospección].

### 1.6 Duplicados de Monday (item archivado nunca purgado)
Patrón real (Mar, Gaby): el mismo `(vendedor, hubspot_id)` aparece más de una vez en `monday_cierres` con `elemento_id` distintos — uno real y completo, y una copia vieja/vacía que nunca se archivó del todo. **Regla de dedup, aplicada en todos los cálculos de dinero y canal**: se conserva una sola fila por combinación `(vendedor_id, hubspot_id)`. Una división real de comisión es entre **dos vendedores distintos**, cada uno con su propia fila — nunca el mismo vendedor repetido. Ver Sección 10 para el protocolo de purga.

---

## 2. Integración de Plataformas (HubSpot + Monday + Lompi/WhatsApp + Odoo)

| Plataforma | Rol exacto en el flujo |
|---|---|
| **HubSpot** | Sistema fuente de negocios (deals), pipeline, actividades/tareas, leads, contactos e historial de etapas. Alimenta la facturación (Odoo) con el **monto completo** del deal — no conoce ni aplica splits por vendedor. |
| **Monday** | Donde el equipo comercial registra cada cierre a mano: monto **ya repartido por vendedor** cuando el negocio es compartido, canal de origen, tipo de negocio, % de comisión. Captura **sin IVA** (×1.16 al leerlo). **Es la fuente oficial de comisiones.** |
| **Lompi (WhatsApp)** | Auditor externo que **empuja** datos por webhook — sin API propia para pedir una corrida bajo demanda. Auditorías (`lompi_auditorias`) + pendientes (`lompi_pendientes`, diff contra lo abierto). Vendedor por teléfono normalizado (`profiles.telefono`). |
| **Odoo** | Recibe la facturación completa desde HubSpot — no distingue splits por vendedor; esa división vive únicamente en Monday. (Confirmado: se maneja por proceso administrativo/externo, fuera de este dashboard.) |

### 2.1 Regla oficial para resolver disparidades entre plataformas
**Confirmada explícitamente el 2026-09-21, es la regla vigente:**

> La decisión se toma **negocio por negocio**, nunca comparando sumas totales agregadas de cada plataforma.
>
> - Si Monday tiene una fila para `(vendedor, hubspot_id)` → **manda Monday** (respeta el split real de comisión, ej. CIE 50/50 Gaby/Pris: HubSpot factura completo para Odoo, pero Monday ya trae la fila de cada quien con su mitad).
> - Si Monday **no tiene ninguna fila** para ese `(vendedor, hubspot_id)` — negocio ganado que nunca se registró ahí — se usa el monto de HubSpot para **ese negocio puntual** (queda reflejado en el Foco Rojo `ganado_sin_monday`).

Por qué se abandonó la regla anterior (MAX de los totales agregados): funcionaba cuando a una plataforma le faltaba un negocio completo, pero en un negocio **dividido** sobrevaloraba a quien Monday le atribuye menos, porque no distingue "me falta un negocio completo" de "este negocio ya está bien dividido, solo que mi mitad es menor al total que HubSpot le atribuye completo a mi compañero".

### 2.2 Sin montos congelados a mano
No existe (ni debe volver a existir como solución permanente) un mecanismo de "monto confirmado" que se congele indefinidamente. Todo se recalcula automáticamente en cada sincronización con la regla 2.1.

### 2.3 Verificación de julio y agosto 2026 (histórico) — ya realizada
Se corrió la nueva regla de la Sección 2.1 contra los datos reales de julio y agosto para confirmar que no introdujo ningún desfase respecto a lo ya sabido:

| Mes | Total con la regla nueva | Total confirmado en `ventas_historico_mensual` (Ventas Totales) |
|---|---|---|
| Julio 2026 | $2,041,356.11 | $5,761,077.07 |
| Agosto 2026 | $7,042,598.20 | $7,466,543.10 |

**La diferencia en ambos meses es anterior a hoy y no la causó el cambio de regla** — corresponde a que julio/agosto fueron los meses de arranque del sistema de sincronización (HubSpot/Monday), con cobertura todavía incompleta en esas fechas; esto ya se sabía desde antes de esta sesión de auditoría (por eso Ventas Totales usa el número confirmado a mano y congelado para meses ya cerrados, no el cálculo en vivo — ver Sección 5.2). Si alguien navega directo al Semáforo/Comparativa de julio o agosto (no a Ventas Totales), va a ver el número más bajo de la izquierda — es sabido y preexistente, no un bug nuevo. Septiembre (el primer mes con cobertura completa) sí cuadra exacto contra los montos que Pris confirmó.

---

## 3. Módulo de Marketing (equipo de Dana)

### 3.1 Roles y equipo
- `esMarketing(p)` = `rol === "marketing" || rol === "marketing_lead"`.
- `esMarketingLead(p)` = `rol === "marketing_lead" || esDireccion(p)` — ve el panel de equipo la lead (Dana) **o** dirección de ventas (admin/supervisor). `marketing_lead` **nunca** cuenta como `esDireccion()` — es una categoría separada del área comercial, a propósito.
- Equipo real: **Dana = marketing_lead** (única); **Xuan, Santiago, Melissa, Alan = marketing** (4 miembros, cada uno ve solo su propio panel).
- Vendedor se mapea a Monday por `profiles.monday_person_id` (id numérico de persona, no por nombre/alias de texto — a propósito, para evitar el mismo bug de acentos/duplicados que ya salió del lado de ventas).
- Acceso a `/mkt` (panel de equipo): `admin`, `supervisor` o `marketing_lead`. Un miembro normal de Marketing no puede entrar ahí, solo a su propio `/mkt/[id]`.

### 3.2 Panel de Gerente de Marketing (los 5 KPIs de Dana, a nivel área/mes)
Visible solo en el perfil de quien tiene `rol = "marketing_lead"`.

1. **Generación de Leads Calificados (SQL)** — meta ≥80%. Fuente real: tablero Monday "🏵️Leads" (`marketing_calificacion_leads`, `calificados = SQL + Venta`). **Distinción importante y ya documentada en el código para evitar confusión**: existe además una cuota semanal **auto-reportada** a mano por el equipo (`marketing_kpis`, "Leads calificados generados") que se muestra aparte como referencia — el código aclara explícitamente que "no tienen por qué coincidir" con el % real.
2. **CPL / Conversión del Funnel Digital** — meta ≥20% MQL→SQL. MQL real de la misma fuente que el punto 1 (columna `mql`). Conversión = calificados reales ÷ MQL reales (puede pasar de 100% por desfase de tiempo entre cuándo entra el MQL y cuándo se crea el negocio). Gasto: captura manual mensual por plataforma (`marketing_gasto_ads_plataforma`, dictada por Dana). CPL = gasto total ÷ calificados reales.
3. **ROAS por plataforma** — meta: ROI positivo (verde si ≥1x). Ventas atribuidas = negocios ganados cuyo "¿Cómo llegó?" mapea a la plataforma (Ads/Adds/Llamada/Formulario → Google Ads; Facebook/Instagram → Meta). Pinterest y TikTok hoy en 0 porque no hay ningún cierre atribuido todavía (no significa que no haya inversión ahí).
4. **Cumplimiento del Calendario** — meta ≥95%. Se calcula con 4 KPIs puntuales de `marketing_kpis` (piezas entregadas en tiempo de Santiago y Xuan, tiempos de respuesta de Melissa). **Alan no tiene KPI de cumplimiento definido todavía en Monday — se marca explícitamente "pendiente", nunca se le inventa un número.** Nota técnica para el desarrollador: existe una tabla dedicada `marketing_cumplimiento_calendario` (pensada para el tablero "✅Campañas MKT") que hoy **no está conectada** al cálculo real — queda huérfana, documentado aquí para no perder el hilo si se retoma.
5. **Crecimiento de Ecosistema Digital** — tendencia creciente mes a mes por red social. Fuente: `marketing_seguidores`, capturas manuales de Dana (sin integración con las APIs de cada red). Compara cada toma contra la toma anterior de esa misma red, no contra "el mes pasado" como concepto calendario.

### 3.3 Ritmo semanal, Coach y rachas de Marketing
- `disciplinaMarketing()` — calcado de `disciplinaComercial()` (Sección 1.3), pero **no recalcula umbrales propios**: usa directamente el semáforo (Verde/Amarillo/Rojo) que Monday ya trae por KPI, y lo agrega por semana. Estatus semanal: Cumplido (toda la semana Verde) / En progreso (hay Amarillo, ningún Rojo) / No alcanzado (algún Rojo). Racha = semanas "cumplido" consecutivas hacia atrás, igual criterio que ventas. A diferencia de ventas, no existe el concepto de "semana futura pendiente" (solo hay filas de semanas que Monday ya capturó).
- `diagnosticoMarketingCoach()`: por cada KPI en Amarillo/Rojo de la semana vigente, arma un mensaje con la brecha real y una táctica — el emparejamiento KPI↔táctica es por patrón de texto sobre el nombre real del KPI (no un catálogo fijo de ids), para no romperse si Monday agrega KPIs nuevos. Alan (único que corre pauta pagada) recibe tácticas específicas de ajuste de presupuesto/segmentación en vez de sugerencias de contenido orgánico.
- **Numeración de semanas**: Marketing no calcula "Semana N" por fórmula de fechas — usa el texto que Monday ya trae, porque los meses no siempre tienen 4 semanas parejas alineadas al calendario. La "semana vigente" es la de número más alto que ya tenga captura ese mes.

### 3.4 Tareas y Notas de gestión de Marketing
- `marketing_tareas`: pendientes asignadas a mano por la lead/dirección (`cuota_mensual`, `cuota_semanal`, `suelta`), con `dias_para_vencer` (negativo = atrasada).
- `marketing_notas` (mismo patrón que `notas_gestion_ventas`, ver Sección 7.3): **lectura** para la propia persona o para `es_marketing_lead()` (Dana o dirección); **escritura** restringida solo a `es_marketing_lead()` — un miembro normal de Marketing no puede crear ni editar sus propias notas.

### 3.5 UI — `MarketingTorreDeControl`
Mismo patrón dual equipo/individual que el de ventas. Vista individual (`/mkt/[id]`), en este orden: (1) Notas de gestión — a propósito primero, para dar contexto antes de ver KPIs; (2) Panel de Gerente (solo si es Dana); (3) Pendientes y tareas; (4) KPIs de la semana; (5) Coach de Marketing; (6) Ritmo semanal S1-S4; (7) Histórico de 3 meses; (8) Métricas por canal.

### 3.6 Fuentes de datos y limitaciones conocidas
- Ingesta automatizada vía Monday API: tablero "Registro de KPIs - Marketing" (→ `marketing_kpis`) y dos tableros de canal con columna de persona real, "Individual Engagement" y "CTR Individual" (→ `marketing_metricas_canal`). Otros tableros de canal (ADS, Pinterest, etc.) no tienen columna de persona todavía — su atribución por individuo no está resuelta.
- Se sincroniza junto con ventas, 2 veces al día, dentro del mismo `sincronizarTodo()` — y también con el botón manual "🔄 Sincronizar Marketing" en `/mkt`.
- **Varias piezas dependen de captura manual sin sincronización automática** (leads/MQL reales, gasto de ads, seguidores) — si nadie las actualiza, quedan desactualizadas sin más aviso que "Sin dato". Es una dependencia operativa real, igual que las metas mensuales de ventas (Sección 5.2).

---

## 4. Dashboards Maestros

### 4.1 `/maestro` — vista general de control
- Acceso restringido a `admin`/`supervisor` (`requiereRol("admin", "supervisor")`) — pantalla de Dirección.
- `<Filtros>`: **Mes** (periodo), **Vendedor** (dropdown, solo si `mostrarFiltroVendedor`), **Ventana** (`kpi_4_semanas` / `calendario`), **Alcance** (Mensual / Anual-YTD, solo visible sin vendedor filtrado), **Vista** (mensual/trimestral).
- Botón "🔄 Sincronizar HubSpot": visible solo para `admin` — dispara el mismo `sincronizarTodo()` del cron automático, sobre el periodo que la pantalla realmente está mostrando.

### 4.2 Alternancia entre vista de equipo y vista individual
- Al filtrar un vendedor desde el dropdown de `/maestro` (`?vendedor=xxx`) se renderiza la **misma** `TorreDeControl` que usa `/vendedor/[id]`. Consecuencia de diseño: cualquier componente cuya visibilidad dependa de "qué vendedor se está viendo" debe montarse **dentro** de `TorreDeControl`, no solo en la página `/vendedor/[id]`.
- `/vendedor/[id]` (autoservicio): `vendedorIdForzado` siempre viene de `persona.id`, validado por RLS — nunca de un parámetro manipulable por el usuario.

### 4.3 Accesos y permisos de Dirección
`esDireccion(perfil)` = `admin` **o** `supervisor` — ve todo el equipo comercial vía RLS: `/maestro` completo, todas las notas de gestión, todos los anuncios (bypass total, Sección 6). **Daniel tiene rol `supervisor`** — cuenta como Dirección a nivel de permisos, aunque operativamente se le trata como un vendedor más (metas, semáforo, montos).

### 4.4 Centro de Mando del área (vista de equipo, sin vendedor filtrado)
Unificado con la misma fuente que el Semáforo (antes leía una tabla separada, `periodo_resumen_area`, desalineada). Vista Mensual: `reporteSemaforoComercial().total`. Vista Anual (Alcance=Anual): acumulado del año vía `comparativoVentasAnual()`.

---

## 5. Vistas Anuales y Mensuales

### 5.1 Selector "Alcance" (Mensual / Anual-YTD)
En `/maestro`, solo visible sin vendedor filtrado — alterna entre el mes seleccionado y el acumulado del año sin perder detalle por vendedor.

### 5.2 Comparativo 2026 vs. 2025 y meses cerrados vs. mes en curso
- 2025 vive como snapshot manual (cifras dadas directamente por Pris — no hay sincronización histórica para ese año).
- 2026 combina `ventas_historico_mensual` para meses **ya cerrados** (fijos, confirmados a mano en su momento) + el **mes en curso recalculado en vivo** con `resultadoRealPorVendedor()` (nunca congelado, cambia con cada cierre nuevo).

### 5.3 Meta Anual y "Llevamos" (metas no planas)
- `metas_anuales` + `ventas_historico_mensual.meta_con_iva` — la meta mensual **no es pareja**, Pris la ajusta mes a mes.
- **"Llevamos"** = acumulado real del año ÷ suma de las metas mensuales de los meses **ya transcurridos** (no la meta anual completa).
- Regla de "mes con datos reales": `venta_sin_iva > 0`, no solo la existencia de la fila (hay meses futuros con fila solo para guardar su meta de antemano).

### 5.4 Desglose de venta por vendedor — acumulado anual
`ventas_vendedor_anual`: % de participación de cada vendedor contra el total del año, con IVA.

---

## 6. Sistema de Avisos y Anuncios

### 6.1 Configuración (`src/lib/anuncios.ts`)
Cada anuncio: `id`, `titulo`, `entrada`, `niveles` (temperatura: caliente/tibio/frío), `reglas`, `cierre`, `audiencia` (por `AppRole`), `correos` (lista opcional), `vigenteDesde`/`vigenteHasta` en ISO con offset de CDMX (`-06:00`).

### 6.2 `anunciosVigentes(rol, correo, ahora, verTodos)`
Filtra por rol + correo + rango `[vigenteDesde, vigenteHasta)`. Con `verTodos = true` se ignora el filtro de audiencia/correo por completo.

### 6.3 Componente `AnuncioTemporal`
- La vigencia se resuelve en un `useEffect`, no en el render inicial (depende de la hora del navegador; calcularla de entrada podría desajustar la hidratación servidor/cliente). El primer render siempre es `null`.
- Botón "Ocultar" por anuncio → `localStorage` bajo `anuncio-oculto:<id>`, con `try/catch` en cada acceso.
- Sin anuncios vigentes u ocultos todos, no renderiza nada.

### 6.4 Audiencia según rol — historial de la corrección
1. Primera versión: visibilidad calculada con el rol del **perfil visto** (`persona.rol`) → Dirección nunca veía el banner al revisar el perfil de un vendedor.
2. Corrección validada: visibilidad con el rol de **quien inició sesión** (`sesion.rol`), con bypass `verTodos` para Dirección — ve todo, en cualquier vista, incluida la previsualización desde `/maestro`. `TorreDeControl` recibe `sesionRol`/`sesionCorreo` como props desde ambas páginas que la montan.

### 6.5 Anuncio vigente actual
"Cómo calificar tus leads" — audiencia `["vendedor", "supervisor"]` (Daniel incluido), vigente 2026-09-21 a 2026-09-28, expira solo sin despliegue.

---

## 7. Alertas, Focos Rojos y Notas de Gestión

### 7.1 Focos Rojos de auditoría e higiene (`alertasHigiene`, equipo comercial)
- **`ganado_sin_monday`**: negocio ganado en HubSpot sin ninguna fila en Monday.
- **`monday_sin_canal`**: negocio en Monday sin "¿Cómo llegó?" capturado. Corregido: se ignora si existe otra fila del mismo `hubspot_id` que sí trae el canal.
- **`sin_atencion`**: negocio abierto sin actividad real en N días. Acumulativo, cruza periodos.

### 7.2 Pendientes de Lompi (WhatsApp)
Racha de días "al día con WhatsApp"; badge de última vez que Lompi mandó datos (verde <24h, ámbar 24-48h, rojo 48h+); lista de pendientes con antigüedad, 3+ días se listan aparte. Limitación conocida (del lado de Lompi, no de este código): el tipo "Pendiente por Auditoria" parece reenviar el mismo lote sin re-evaluar.

### 7.3 Notas de gestión (llamadas de atención / reconocimientos)
- Registro **permanente**, sin fecha límite ni estatus de "cumplida".
- Dos tablas paralelas: `marketing_notas` (equipo de Dana) y `notas_gestion_ventas` (equipo comercial).
- Visibles para el **propio dueño de la nota** y para **Dirección** (en ventas, Dirección = `es_direccion()`; en Marketing, quien escribe/lee todas es `es_marketing_lead()` — Dana o dirección de ventas).
- Siempre en la parte **más alta** del dashboard individual — confirmado, incluso en la vista del propio dueño.
- No sustituyen un acta administrativa formal (proceso fuera del dashboard); solo dejan constancia digital del antecedente.

---

## 8. Lógica de Dashboard, Montos y Comisiones (equipo comercial)

### 8.1 IVA
Todo monto visible es **con IVA (16%)**, aunque Monday captura sin IVA. Conversión ×1.16 en `v_deals_operativo`.

### 8.2 Fuente única de verdad para dinero
`resultadoRealPorVendedor(periodoId)` es la **única** función que calcula el resultado real por vendedor (regla 2.1) — la usan el Semáforo Maestro, la Comparativa de desempeño, el Centro de Mando, Ventas Totales del mes en curso y Participación por Canales.

### 8.3 Semáforo Comercial (`metas_semaforo`)
3 niveles (Verde/Amarillo/Rojo) por vendedor y mes, separados en Existentes/Nuevos, más Punto de Equilibrio individual — con IVA.

### 8.4 Comisiones
Rigen por Monday (`porcentaje_comision`, `monto_atribuido`). HubSpot solo entra para negocios que Monday nunca registró.

### 8.5 Visibilidad por perfil (roles)
`AppRole = "admin" | "supervisor" | "vendedor" | "marketing" | "marketing_lead"`. Ventas: `esDireccion` = admin/supervisor (Daniel incluido). Marketing: separado, nunca se mezcla con `esDireccion()` (ver Sección 3.1).

### 8.6 Zona horaria — ya corregida en el código
Todo cálculo de "hoy"/"mes en curso" usa **America/Mexico_City**, no UTC. Se creó `src/lib/fecha.ts` con tres helpers (`hoyCDMX()`, `fechaHoyCDMX()`, `inicioDiaCDMX()`) y se corrigieron **todos** los puntos detectados: `periodoActivoDe`, la racha de Lompi, el Acelerador Semanal, `comparativoVentasAnual` (mes en curso), el desglose anual por vendedor, `semanaActualYVecinas`, `disciplinaComercial`, `proyeccionPipeline`, `tareasMarketing`, la etiqueta "En curso/Pasada/Próxima" de Disciplina Comercial en la UI, la táctica de la semana del Coach Comercial, y las 4 rutas de cron (`sincronizar-todo` — la única activa según `vercel.json` — y las 3 heredadas ya desconectadas del cron automático, actualizadas por consistencia). Los usos de `new Date().toISOString()` que comparan **timestamps completos** (no fechas de calendario) se dejaron igual a propósito — ahí no hay desfase posible, un instante UTC es el mismo instante sin importar la zona horaria.

---

## 9. Protocolo Obligatorio de Carga y Cambios Futuros

Regla fija para **todo** cambio de código o de datos en este proyecto, sin excepción:

1. **Explicar el impacto** — antes de tocar nada: qué cambia, qué NO cambia, con qué datos reales se verificó el diagnóstico, qué alternativas se consideraron.
2. **Esperar aprobación explícita de Pris** — nunca ejecutar un cambio de regla de negocio, permiso por rol o fuente de verdad de un monto sin confirmación previa. Ante ambigüedad o disparidad entre plataformas: **preguntar antes de decidir**.
3. **Ejecutar** — código + migración (si aplica) + push + verificación de que el deploy realmente terminó.
4. **Verificar consistencia contra datos reales** — antes de reportar "listo", correr el cálculo nuevo contra la base de datos/HubSpot/Monday en vivo y mostrar los números resultantes. Reportar con evidencia concreta, nunca con un simple "ya quedó".

Confirmado como política permanente: esta misma ruta de verificación aplica a **todos** los cambios futuros del dashboard, sin importar qué tan pequeños parezcan.

---

## 10. Protocolo específico de purga de datos (Monday u otra fuente)

1. **Nunca se borra ni purga nada de Monday ni de la base de datos sin autorización previa, punto por punto.**
2. Antes de purgar cualquier fila identificada como duplicado/archivo, se entrega primero un **listado detallado por vendedor** (elemento_id, hubspot_id, montos, fechas de cada copia) para que Pris autorice **una por una**.
3. Solo después de esa autorización explícita, fila por fila, se ejecuta el borrado.
4. Después de purgar, se vuelve a correr el cálculo de dinero/canal afectado contra datos reales y se reporta el resultado.

---

## 11. Estado de ejecución de los pendientes

1. ~~Vaciar `resultado_confirmado_vendedor`~~ — pendiente de esta misma sesión de trabajo, después de cerrar esta documentación.
2. ~~Auditoría de zona horaria~~ — **ya ejecutada**, ver Sección 8.6.
3. ~~Validación de julio/agosto~~ — **ya ejecutada**, ver Sección 2.3.
4. **Purga de items archivados de Monday** — sigue el protocolo de la Sección 10 (listado por vendedor primero, autorización uno por uno). Listado entregado por separado tras esta documentación.
5. **Deal de CIE en HubSpot** — sigue facturándose completo para Odoo sin reflejar el split; Monday ya lo tiene bien dividido. No se ha decidido si conviene reflejar el split también en HubSpot (opción ofrecida, sin respuesta aún).

---

*Fin del documento v3.*
