import { Suspense } from "react";
import { notFound } from "next/navigation";
import { esDireccion, requiereSesion } from "@/lib/auth";
import { contextoMercado, evaluacionDe, historicoDe, perfilPorId, periodos } from "@/lib/queries";
import { Card, Seccion, Vacio } from "@/components/ui";
import { Filtros } from "@/components/Filtros";
import { Acciones } from "@/components/Acciones";
import { Historico } from "@/components/Historico";
import { TorreDeControl } from "@/components/TorreDeControl";
import { formatearRangoFechas } from "@/lib/format";
import type { Ventana } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function VistaVendedor({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periodo?: string; ventana?: string; vista?: string }>;
}) {
  const sesion = await requiereSesion();
  const { id } = await params;
  const sp = await searchParams;

  // El RLS ya impide leer el perfil de alguien más; si esto viene vacío es
  // porque el usuario no tiene derecho a verlo. Este mismo candado (RLS,
  // no la UI) es lo que impide que la Torre de Control de abajo muestre
  // datos de otro vendedor aunque alguien manipule la URL: vendedorIdForzado
  // siempre es persona.id, nunca un parámetro que el usuario controle.
  const persona = await perfilPorId(id);
  if (!persona) notFound();

  const propio = sesion.id === persona.id;
  const lista = await periodos();
  if (lista.length === 0) return <Vacio titulo="No hay periodos configurados" />;

  const periodoId = sp.periodo && lista.some((p) => p.id === sp.periodo) ? sp.periodo : lista[0].id;
  const ventana: Ventana = sp.ventana === "calendario" ? "calendario" : "kpi_4_semanas";
  const periodo = lista.find((p) => p.id === periodoId)!;

  const [evaluacion, contexto, hist] = await Promise.all([
    evaluacionDe(persona.id, periodoId),
    contextoMercado(periodoId),
    historicoDe(persona.id, ventana),
  ]);

  return (
    <>
      {/* Encabezado del colaborador ---------------------------------------- */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[20px] font-semibold tracking-tight text-ink">{persona.nombre_completo}</h1>
          </div>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            {persona.puesto ?? "Equipo comercial"} · {periodo.etiqueta} · Evaluando ventas cerradas del{" "}
            {formatearRangoFechas(
              ventana === "kpi_4_semanas" ? periodo.kpi_inicio : periodo.cal_inicio,
              ventana === "kpi_4_semanas" ? periodo.kpi_fin : periodo.cal_fin,
            )}
          </p>
          {!propio && esDireccion(sesion) && (
            <p className="mt-1 text-[11px] text-ink-muted">Vista de supervisión — este perfil no es el tuyo.</p>
          )}
        </div>
        <Suspense fallback={null}>
          <Filtros periodos={lista} mostrarVistaTiempo />
        </Suspense>
      </div>

      {/* Torre de Control -- mismos 4 Actos que /maestro, con el vendedor
          fijo en persona.id: no hay dropdown para cambiarlo (mostrarFiltroVendedor
          es false) y el candado real es el RLS de Supabase, no esta prop. */}
      <TorreDeControl
        periodoIdParam={sp.periodo}
        ventanaParam={sp.ventana}
        vistaParam={sp.vista}
        vendedorIdForzado={persona.id}
        mostrarFiltroVendedor={false}
        mostrarEncabezado={false}
      />

      {/* Evaluación cualitativa --------------------------------------------- */}
      {evaluacion && (
        <>
          {evaluacion.evaluacion.diagnostico && (
            <Seccion titulo="Diagnóstico del periodo">
              <Card className="px-5 py-4">
                <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink">
                  {evaluacion.evaluacion.diagnostico}
                </p>
              </Card>
            </Seccion>
          )}

          <Seccion
            titulo="Acciones pertinentes"
            descripcion={propio ? "Puedes mover el estatus de tus acciones conforme avances." : undefined}
          >
            <Acciones acciones={evaluacion.acciones} editable={propio} />
          </Seccion>

          {evaluacion.evaluacion.feedback && (
            <Seccion titulo="Retroalimentación mensual">
              <Card className="border-l-[3px] border-l-serie-1 px-5 py-4">
                <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink">
                  {evaluacion.evaluacion.feedback}
                </p>
                {evaluacion.evaluacion.calificacion != null && (
                  <p className="mt-3 border-t border-line pt-2.5 text-[12px] text-ink-soft">
                    Calificación del periodo:{" "}
                    <span className="tabular font-semibold text-ink">
                      {evaluacion.evaluacion.calificacion.toFixed(2)} / 5.00
                    </span>
                  </p>
                )}
              </Card>
            </Seccion>
          )}
        </>
      )}

      {/* Contexto de mercado ------------------------------------------------ */}
      {contexto.length > 0 && (
        <Seccion titulo="Contexto de mercado" descripcion="Lo que estaba pasando alrededor del número.">
          <div className="grid gap-3 sm:grid-cols-2">
            {contexto.map((c) => (
              <Card key={c.id} className="px-4 py-3.5">
                <p className="text-[13px] font-medium text-ink">{c.titulo}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{c.cuerpo}</p>
              </Card>
            ))}
          </div>
        </Seccion>
      )}

      {/* Histórico ---------------------------------------------------------- */}
      <Seccion titulo="Histórico de meses anteriores">
        <Historico filas={hist} vendedorId={persona.id} periodoActivo={periodoId} />
      </Seccion>
    </>
  );
}
