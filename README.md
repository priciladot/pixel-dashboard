# Dashboard de Ventas y Evaluación de Desempeño — PIXEL.play

Portal interno donde cada vendedor consulta su evaluación mensual y sus métricas, y la dirección
(Pricila, Daniel, Noelia, Talento Humano) ve la información consolidada del área.

**Stack:** Next.js 15 (App Router, TypeScript) · TailwindCSS · Supabase (PostgreSQL + Auth + RLS).

---

## 1. Arquitectura

```
Navegador
   │  cookie de sesión (Supabase Auth)
   ▼
Next.js 15 ── middleware.ts ──────► refresca la sesión y bloquea rutas sin login
   │
   ├── Server Components ─────────► cliente Supabase CON la sesión del usuario
   │                                (toda lectura pasa por RLS)
   │
   └── Route handlers /api/ingesta ► verifican rol admin y luego usan el
                                     cliente service-role para escribir
   ▼
PostgreSQL (Supabase)
   ├── RLS por rol: admin · supervisor · vendedor
   ├── vistas de lectura con security_invoker (heredan el RLS)
   └── capa de sanitización: nada se descarta, lo incompleto se etiqueta
```

El control de acceso vive en la base de datos, no en la interfaz. Un vendedor con el token de la
app en la mano solo puede leer sus propias filas porque Postgres se lo impide.

### Roles

| Rol | Quién | Puede |
|---|---|---|
| `admin` | Pricila | Todo: dashboard maestro, todos los perfiles, ingesta y escritura |
| `supervisor` | Daniel, Noelia, Talento Humano | Lectura global: maestro y todos los perfiles. Sin escritura |
| `vendedor` | Erick, Diego, Roxana, Mar, Gaby | Solo su perfil, y solo evaluaciones **publicadas**. Puede mover el estatus de sus propias acciones |

### Convenciones del negocio, codificadas

- **IVA.** El semáforo comercial es CON IVA; HubSpot es SIN IVA. Factor **1.16**, en las funciones
  `con_iva()` / `sin_iva()` y en `src/lib/format.ts`.
- **Calendario de KPI.** El mes se divide en **4 semanas (S1–S4)**, no en mes calendario. Cada
  periodo guarda ambas ventanas (`kpi_inicio/kpi_fin` y `cal_inicio/cal_fin`) y toda pantalla
  declara cuál está usando. Julio 2026 = 25 jun al 22 jul; la semana del 23–29 jul es **Agosto S1**.
- **Fuente autoritativa.** El semáforo manda sobre las cifras de venta. HubSpot aporta embudo,
  ticket promedio, ciclo de cierre y atribución; nunca sobrescribe el dinero del semáforo.

---

## 2. Esquema de base de datos

| Tabla | Para qué |
|---|---|
| `profiles` | Perfil por usuario de Auth, con rol y `hubspot_owner_id` |
| `profile_alias` | Nombres como aparecen escritos en CSV/PDF/HubSpot, para mapear "María Gaytán Casillas" = "Mar" |
| `periodos` · `periodo_semanas` | Calendario de KPI: bloque de 4 semanas + ventana calendario |
| `objetivos` | Objetivo por vendedor y periodo (`confirmado` marca los reconstruidos) |
| `benchmarks` | Estándares universales: 500+ correos, 20–25 leads, 1,000+ actividades |
| `kpi_mensual` | Métricas consolidadas por vendedor/periodo/ventana. Es lo que alimenta los tableros |
| `periodo_resumen_area` | Cifra oficial del área (no la suma de las filas individuales) |
| `metas_anuales` | Meta anual, acumulado y ritmo lineal requerido |
| `evaluaciones` | Evaluación cualitativa: diagnóstico, contexto, feedback, calificación, estatus |
| `evaluacion_brecha` | §2 del reporte: Indicador · Valor · Estándar · Lectura, en la misma fila |
| `acciones` | §3 Plan de acción / Acciones pertinentes, con estatus por acción |
| `anexos` | §6 Anexos (rutas en Storage) |
| `contexto_mercado` | Hallazgos y estacionalidad reutilizables entre evaluaciones |
| `ingestas` | Bitácora de cada corrida: filas leídas, limpias, marcadas, resumen |
| `hubspot_deals` | Deals crudos + saneados, con `flags[]`, `calidad` y el `raw` original |
| `catalogo_perdida` | Las 5 categorías de pérdida ("Diferido" no puede cerrar como perdido) |
| `accesos_log` | Quién abrió el perfil de quién |

**Vistas:** `v_kpi_vendedor` (KPI + cumplimiento + semáforo), `v_resumen_periodo`,
`v_resumen_area` (cifra oficial con respaldo en la suma, visible solo a dirección),
`v_deals_por_revisar`, `v_hubspot_por_vendedor` (control cruzado contra el semáforo).

---

## 3. Instalación

```bash
npm install
cp .env.example .env.local     # y llena las llaves
```

### Migraciones

En el SQL Editor de Supabase, en orden:

1. `supabase/migrations/001_schema.sql` — tablas, funciones y vistas
2. `supabase/migrations/002_rls.sql` — RLS, políticas y el trigger de alta de perfil
3. Crea los usuarios en Auth: `npm run crear-usuarios` (imprime contraseñas temporales)
4. `supabase/migrations/003_seed.sql` — catálogos, calendario y línea base de Julio 2026

> **Antes del paso 3:** ajusta los correos en `scripts/crear-usuarios.ts` y en `003_seed.sql`.
> Los que vienen son placeholders y el seed empareja por correo.

```bash
npm run dev        # http://localhost:3000
```

### Despliegue en Vercel

Importa el repo, agrega las variables de `.env.example` y despliega. `SUPABASE_SERVICE_ROLE_KEY`
va **sin** el prefijo `NEXT_PUBLIC_`: solo la usan los route handlers y los scripts.

---

## 4. Carga de datos

### Histórico (Julio / Agosto)

Desde `/ingesta` en la app, o por terminal:

```bash
npm run ingesta:archivo -- --periodo 2026-07 --archivo data/entrada/deals-julio.csv
npm run ingesta:archivo -- --periodo 2026-07 --archivo data/entrada/semaforo-julio.xlsx
npm run ingesta:archivo -- --archivo data/entrada/evaluacion-erick.pdf
```

| Formato | Qué hace |
|---|---|
| `.csv` / `.tsv` | Exportación de HubSpot. Mapeo tolerante de encabezados (español/inglés, con o sin acentos) |
| `.json` | Array plano, `{results:[…]}` de HubSpot o volcado propio |
| `.xlsx` | Semáforo comercial. **Manda sobre las cifras de venta** y sobre los objetivos |
| `.pdf` | Reporte 1:1 ya generado. Extrae las 6 secciones y las devuelve **para revisión**; no escribe nada solo |

### HubSpot (Agosto en adelante)

```bash
npm run ingesta:hubspot -- --periodo 2026-08                 # escribe
npm run ingesta:hubspot -- --periodo 2026-08 --simulacion    # solo reporta
```

Filtra por **propietario del negocio** (owner) y por el **rango del periodo**, usando la ventana de
KPI de 4 semanas por omisión (`--ventana calendario` para el mes 1–31).

### Capa de sanitización

Los registros de Daniel y cualquier fila inconsistente de HubSpot **no rompen las métricas
maestras**: se guardan con su bandera, se etiquetan como `Sin asignar / Por revisar` y quedan fuera
de los agregados, no fuera de la base. Aparecen en "Calidad de los datos" del maestro.

| Bandera | Cuándo |
|---|---|
| `owner_sin_mapear` | El propietario existe en HubSpot pero no está en `profiles` ni en sus alias |
| `owner_vacio` | El negocio no tiene propietario |
| `monto_faltante` · `monto_invalido` | Sin importe, o negativo |
| `fecha_faltante` · `fuera_de_periodo` | Sin fechas, o la fecha cae fuera de la ventana del periodo |
| `duplicado` | Mismo `hubspot_id` más de una vez; se conserva la versión con menos problemas |
| `division_doble_conteo` | Fila "División" que repite el monto completo en ambas partes |
| `motivo_perdida_fuera_de_catalogo` | Motivo de pérdida que no está en las 5 categorías |
| `etapa_desconocida` | Sin etapa de pipeline |

Las filas marcadas como `por_revisar` quedan fuera de `agregarPorVendedor()`, así que el total del
área nunca se contamina.

---

## 5. Mapa de archivos

```
supabase/migrations/     001 esquema · 002 RLS · 003 catálogos y línea base
src/lib/
  supabase/              client (navegador) · server (sesión, RLS) · admin (service-role) · middleware
  auth.ts                perfil de sesión, guardias por rol
  queries.ts             capa de lectura — todo pasa por RLS
  format.ts              IVA, moneda, semáforo, lectura contra estándar
  ingesta/
    sanitizar.ts         normalización, mapeo de owner, banderas, dedupe, agregados
    hubspot.ts           API CRM v3: owners y búsqueda de deals por rango
    archivos.ts          parsers CSV/TSV · JSON · XLSX (semáforo) · PDF (evaluación)
    cargar.ts            orquestador: sanea, persiste, recalcula KPIs, cierra la bitácora
src/app/
  login/                 acceso con correo y contraseña
  (app)/maestro/         Dashboard Maestro — resumen, embudo, comparativa, calidad de datos
  (app)/vendedor/[id]/   Vista Individual — KPIs, brecha, acciones, feedback, histórico
  (app)/ingesta/         Panel de carga (solo admin)
  api/ingesta/           POST hubspot · POST archivo
scripts/                 crear-usuarios · ingest-hubspot · ingest-archivos
```

---

## 6. Notas de la línea base cargada

- Julio 2026 queda cargado con las cifras del semáforo: área **$5,758,989.07** de **$9,283,333.31**
  (**62%**), y el detalle por vendedor.
- Los **objetivos individuales de Julio están reconstruidos** a partir de venta ÷ % de cumplimiento
  reportado, porque el objetivo individual no venía en la fuente. Suman $9,293,038 contra los
  $9,283,333.31 del área (0.1% de diferencia por redondeo). Quedan con `confirmado = false` y la
  interfaz los marca con `*`. Sustitúyelos por los del semáforo cuando los tengas.
- El **desglose Existentes/Nuevos por vendedor** no venía en el reporte (salvo Diego, con
  Existentes en $0), así que esas filas quedan marcadas como `parcial`. El desglose del área sí está
  completo: Existentes $4,403,982.92 · Nuevos $1,355,006.15.
- **Pendiente conocido:** el conflicto del deal NINJA (ID 62622522403) con dos montos, $96,626 vs
  $38,080. La capa de sanitización lo va a marcar como `division_doble_conteo` en cuanto entre por
  la ingesta.

---

## 7. Conexión con HubSpot (portal real de PIXEL.play)

La migración `004_hubspot.sql` y el cliente de la API ya están apuntados a lo que **existe hoy** en
el portal; no hay que adivinar nombres de propiedades.

### Scopes de la App Privada

| Scope | Para qué |
|---|---|
| `crm.objects.deals.read` | Leer los negocios (obligatorio) |
| `crm.objects.owners.read` | Resolver el propietario de cada negocio (obligatorio) |
| `crm.schemas.deals.read` | Leer las definiciones de las propiedades personalizadas (obligatorio) |
| `crm.objects.contacts.read` | Cruzar contactos y depuración de leads (recomendado) |
| `crm.objects.companies.read` | Empresas relevantes del embudo (opcional) |

No hace falta ningún scope de escritura: la integración solo lee.

### Propiedades que consume

| Campo del dashboard | Propiedad en HubSpot |
|---|---|
| Tipo de cliente | `clasificacion_de_lead_cliente__prueba_gab_` — *Cliente Existente* y *Remarketing Existente* → **existente**; *Lead Nuevo* y *Remarketing Nuevo* → **nuevo** |
| Origen | `origen_del_lead` |
| Categoría de cierre | `categoria_de_cierre` — las 5 del catálogo + *No es pérdida — reclasificar* + *Criterio anterior / Sin categorizar* |
| Motivo detallado | `motivo_de_perdida_o_diferimiento__clonada_` (18 opciones) |
| Fecha de reactivación | `fecha_de_reactivacion` |

Dos ausencias que conviene tener presentes:

- **No hay propiedad de atribución a Marketing** en Deals. El campo `atribucion` queda en null y la
  atribución se sigue calculando fuera del CRM.
- **No hay propiedad que marque las divisiones.** El doble conteo se detecta por firma (mismo nombre
  de negocio + mismo monto) y se marca `posible_doble_conteo`, que **avisa sin descartar**: dos
  eventos iguales al mismo precio son posibles y esa decisión es tuya. Solo cuando la fuente marca
  explícitamente la fila como División (el CSV del semáforo) la repetición sale de los agregados.

### Mapa de propietarios

Cuatro personas tienen **dos cuentas** en HubSpot, una vieja y una vigente, y los negocios
históricos siguen colgados de la vieja. Por eso existe `hubspot_owner_map`: varios `owner_id`
apuntan a la misma persona.

| Persona | ID vigente | ID anterior |
|---|---|---|
| Pris | 26395721 | 20495620 |
| Daniel | 26405238 | 16977021 |
| Erick | 88208161 | 88181276 |
| Gaby | 414692018 | 204866184 |
| Mar | 618845046 | — |
| Diego | 90345924 | — |
| Roxana | 80956812 | — |
| Noelia | — | 79910864 |

Melissa Cortés (320958987) y la cuenta genérica "Pixel Play" (83888651) **no** están mapeadas a
propósito: sus negocios caen en *Sin asignar / Por revisar*, que es la lectura correcta.

### Sincronización automática

`vercel.json` define un cron diario a las **15:00 UTC = 9:00 a.m. de CDMX**, que llama a
`GET /api/cron/sincronizar`. La ruta exige `Authorization: Bearer $CRON_SECRET`; Vercel lo manda
solo. Sin `CRON_SECRET` configurado, la ruta se niega a ejecutar en lugar de quedar abierta.

```bash
# prueba manual, sin escribir nada
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://pixel-dashboard-delta.vercel.app/api/cron/sincronizar?simulacion=1"

# forzar un periodo, incluyendo el anterior (cierres tardíos)
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://pixel-dashboard-delta.vercel.app/api/cron/sincronizar?periodo=2026-08&anterior=1"
```

Cada corrida deja su registro en `ingestas` y se ve en `/ingesta`. En el plan **Hobby** de Vercel
los crons corren **una vez al día** y la función tiene 60 s de tope; en Pro puedes bajar a cada hora
y subir `maxDuration` a 300.

---

## 8. Conexión con Monday.com (ventas divididas)

HubSpot modela un deal con un solo owner y no trae varios datos operativos del evento. El tablero
de Monday **"Deals Ganados 2026 - HubSpot"** (`board_id 18408527402`) sí los tiene: división real de
montos cuando dos vendedores colaboran, tipo de negocio, producto, fechas de evento, viáticos.
`006_monday_cierres.sql` agrega `monday_cierres` (se guarda el tablero completo, columna por
columna, no solo lo de atribución) y la vista `v_deals_operativo`.

**Estructura real del tablero** (confirmada en la interfaz, no supuesta): cada fila es la porción
de **un solo vendedor** sobre un negocio, con tres columnas — `Estado de Proyecto` (Individual /
Compartida-Dividida), `Porcentaje de comisión` y `Propietario`. Un negocio dividido entre dos
personas son **dos filas** en Monday, no una fila con dos columnas de persona. La regla de
atribución, aplicada como columna generada en la base de datos (nunca calculada a mano en el
código):

```
Individual o 100%  ->  monto_atribuido = monto_total
Dividido            ->  monto_atribuido = monto_total × (porcentaje_comision / 100)
```

Si el tablero deja el porcentaje vacío en una fila Individual, la ingesta lo normaliza a 100 antes
de guardar (evita que quede en 0 por un campo sin llenar). Sin ninguna fila de Monday para un
`hubspot_id`, la atribución sigue siendo íntegra al owner de HubSpot — sin cambio respecto a antes.

### Qué más trae `monday_cierres`, además de la atribución

| Grupo | Columnas |
|---|---|
| Cruce con HubSpot | `hubspot_id` (llave de enlace con `hubspot_deals.hubspot_id`), `link_hubspot` |
| Cierre y origen | `tipo_negocio`, `como_llego`, `herramienta_venta`, `empresa`, `correo_cliente` |
| Fechas operativas | `inicio_evento`, `fin_evento`, `mes_evento`, `semana`, `dias_activacion` |
| Producto | `area_pixel_factory`, `marca_evento`, `productos`, `num_productos`, `num_activaciones`, `viaticos` |

`tipo_negocio` (New Business / Cliente existente en el tablero) se reduce a la misma dicotomía que
`hubspot_deals.tipo_cliente` (`existente` / `nuevo` / `por_revisar`, con la función ya compartida
`tipoCliente()` de `sanitizar.ts`) — así `v_deals_operativo` puede usarla para tapar el vacío que
HubSpot no llena en este pipeline (ver §4). El resto de las columnas no se transforma: se guarda tal
como viene, con `raw` de respaldo por si algo todavía no se mapea.

### Ids de columna — hay que confirmarlos, no son los reales todavía

Monday identifica cada columna por un id interno, no por el título visible, y cambia entre
tableros. Los defaults en `src/lib/ingesta/monday.ts` son un punto de partida razonable, **no los
ids reales de este tablero**. Con `MONDAY_API_TOKEN` ya configurado:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://pixel-dashboard-delta.vercel.app/api/cron/sincronizar-monday?columnas=1"
```

Esto regresa `{ id, title, type }` de cada columna real del tablero. Ajusta las variables
`MONDAY_COL_*` en `.env.local`/Vercel para las que no coincidan con el default.

### Sincronización

`vercel.json` agrega un segundo cron diario a las **15:30 UTC**, 30 minutos después del de HubSpot
para que `hubspot_deals` ya tenga los deals del día cuando se calcule la atribución. Llama a
`GET /api/cron/sincronizar-monday`, con la misma autenticación (`Authorization: Bearer $CRON_SECRET`
o `?secret=`) que el cron de HubSpot. El plan **Hobby** de Vercel permite hasta 2 cron jobs — este es
el segundo, no queda margen para un tercero sin subir de plan.

```bash
# prueba manual
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://pixel-dashboard-delta.vercel.app/api/cron/sincronizar-monday"
```

El nombre de "Propietario" que trae Monday se resuelve a `vendedor_id` con el mismo diccionario de
alias que usa el resto de la ingesta (`profiles`, `profile_alias`, `hubspot_owner_map`) — si Monday
trae un nombre que no coincide con ningún alias conocido, la fila se guarda igual (nada se
descarta) pero queda sin vendedor asignado, visible en el resumen de la corrida (`sin_asignar`). 
