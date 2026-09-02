/**
 * Ingesta de HubSpot desde la terminal (útil para cargar Agosto en adelante
 * sin abrir la app, o para agendarlo en un cron).
 *
 *   npm run ingesta:hubspot -- --periodo 2026-08
 *   npm run ingesta:hubspot -- --periodo 2026-08 --ventana calendario --simulacion
 */
import "./_env";
import { createClient } from "@supabase/supabase-js";
import { buscarDeals, buscarDealsCreados, enriquecerConOwners, listarOwners } from "../src/lib/ingesta/hubspot";
import { ingestarDeals } from "../src/lib/ingesta/cargar";

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const periodoId = arg("periodo");
  if (!periodoId) throw new Error("Falta --periodo (ej. 2026-08)");

  const ventana = arg("ventana") === "calendario" ? "calendario" : "kpi_4_semanas";
  const simulacion = process.argv.includes("--simulacion");

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: periodo, error } = await db.from("periodos").select("*").eq("id", periodoId).single();
  if (error || !periodo) throw new Error(`Periodo ${periodoId} no existe.`);

  const desde = ventana === "calendario" ? periodo.cal_inicio : periodo.kpi_inicio;
  const hasta = ventana === "calendario" ? periodo.cal_fin : periodo.kpi_fin;
  console.log(`Periodo ${periodo.etiqueta} · ventana ${ventana} · ${desde} a ${hasta}`);

  const owners = await listarOwners();
  console.log(`  ${owners.length} propietarios en el portal`);

  const [cerrados, creados] = await Promise.all([
    buscarDeals(desde, hasta),
    buscarDealsCreados(desde, hasta),
  ]);
  console.log(`  ${cerrados.length} negocios cerrados · ${creados.length} creados en el rango`);

  const crudos = enriquecerConOwners([...cerrados, ...creados], owners);
  const r = await ingestarDeals(db, crudos, {
    tipo: "hubspot_api", periodoId, ventana, simulacion,
  });

  console.log(`\nIngesta #${r.ingestaId}${simulacion ? " (simulación)" : ""}`);
  console.log(`  filas leídas      ${r.filasLeidas}`);
  console.log(`  limpias           ${r.filasOk}`);
  console.log(`  marcadas          ${r.filasSanitizadas}`);
  console.log(`  duplicados        ${r.duplicados}`);
  console.log(`  sin asignar       ${r.sinAsignar}`);
  console.log(`  banderas          ${JSON.stringify(r.resumen.por_bandera)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
