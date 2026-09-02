/**
 * Carga histórica desde archivo (Julio, Agosto o lo que haya).
 *
 *   npm run ingesta:archivo -- --periodo 2026-07 --archivo data/entrada/deals-julio.csv
 *   npm run ingesta:archivo -- --periodo 2026-07 --archivo data/entrada/semaforo.xlsx
 *   npm run ingesta:archivo -- --archivo data/entrada/evaluacion-erick.pdf
 */
import "./_env";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { leerCsv, leerJson, leerSemaforo, leerEvaluacionPdf } from "../src/lib/ingesta/archivos";
import { ingestarDeals, ingestarSemaforo } from "../src/lib/ingesta/cargar";

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const ruta = arg("archivo");
  if (!ruta) throw new Error("Falta --archivo");
  const ext = extname(ruta).toLowerCase();
  const nombre = basename(ruta);
  const buffer = readFileSync(ruta);

  // El PDF no toca la base: solo reporta lo extraído.
  if (ext === ".pdf") {
    const e = await leerEvaluacionPdf(buffer);
    console.log(`Evaluación extraída de ${nombre}\n`);
    console.log(`  encabezado   ${e.vendedorTexto ?? "—"}`);
    console.log(`  diagnóstico  ${e.diagnostico ? `${e.diagnostico.length} caracteres` : "no encontrado"}`);
    console.log(`  brecha       ${e.brecha ? `${e.brecha.length} caracteres` : "no encontrada"}`);
    console.log(`  acciones     ${e.acciones.length}`);
    console.log(`  contexto     ${e.contexto ? "sí" : "no"}`);
    console.log(`  feedback     ${e.feedback ? "sí" : "no"}`);
    if (e.acciones.length > 0) {
      console.log("\n  Acciones detectadas:");
      e.acciones.forEach((a, i) => console.log(`    ${i + 1}. ${a}`));
    }
    console.log("\nRevísalo y captúralo como evaluación desde la app antes de publicarlo.");
    return;
  }

  const periodoId = arg("periodo");
  if (!periodoId) throw new Error("Falta --periodo (ej. 2026-07)");

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  if (ext === ".xlsx" || ext === ".xls") {
    const filas = await leerSemaforo(buffer);
    console.log(`Semáforo: ${filas.length} filas detectadas`);
    const r = await ingestarSemaforo(db, filas, { periodoId, archivoNombre: nombre });
    console.log(`  aplicadas    ${r.aplicadas}`);
    if (r.sinMapear.length > 0) console.log(`  sin mapear   ${r.sinMapear.join(", ")}`);
    return;
  }

  const contenido = buffer.toString("utf8");
  const { deals, filasLeidas } =
    ext === ".json" ? leerJson(contenido) : leerCsv(contenido);

  console.log(`${nombre}: ${filasLeidas} filas leídas, ${deals.length} negocios reconocidos`);

  const r = await ingestarDeals(db, deals, {
    tipo: ext === ".json" ? "json" : "csv",
    periodoId,
    archivoNombre: nombre,
  });

  console.log(`\nIngesta #${r.ingestaId}`);
  console.log(`  limpias      ${r.filasOk}`);
  console.log(`  marcadas     ${r.filasSanitizadas}`);
  console.log(`  duplicados   ${r.duplicados}`);
  console.log(`  sin asignar  ${r.sinAsignar}`);
  console.log(`  banderas     ${JSON.stringify(r.resumen.por_bandera)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
