import { reporteSemaforoComercial, type FilaSemaforoComercial } from "@/lib/queries";
import { Card } from "@/components/ui";
import { dinero } from "@/lib/format";

const COLOR_SEMAFORO: Record<"verde" | "amarillo" | "rojo", { bg: string; color: string }> = {
  verde: { bg: "#e9f7e9", color: "#0ca30c" },
  amarillo: { bg: "#fdf4e0", color: "#8a6100" },
  rojo: { bg: "#fdecec", color: "#d03b3b" },
};

function CeldaMonto({ valor }: { valor: number }) {
  return <td className="px-3 py-2.5 tabular text-ink-soft">{dinero(valor)}</td>;
}

function CeldaResultado({ valor, semaforo }: { valor: number; semaforo: "verde" | "amarillo" | "rojo" }) {
  const s = COLOR_SEMAFORO[semaforo];
  return (
    <td className="px-3 py-2.5 tabular font-medium" style={{ backgroundColor: s.bg, color: s.color }}>
      {dinero(valor)}
    </td>
  );
}

/**
 * Reporte Semanal y Semáforos de Desempeño Comercial -- Dashboard Maestro.
 * 3 niveles de meta (Verde/Amarillo/Rojo) por Existentes y por Nuevos,
 * Punto de Equilibrio individual, y el acumulado del mes. Solo aparece
 * para los vendedores que ya tienen sus metas capturadas en
 * `metas_semaforo` para el periodo -- si un vendedor no tiene fila ahí,
 * no se le inventa un semáforo.
 */
export async function ReporteSemaforoComercial({ periodoId, etiquetaPeriodo }: { periodoId: string; etiquetaPeriodo: string }) {
  const { filas, total } = await reporteSemaforoComercial(periodoId);

  if (filas.length === 0) {
    return (
      <Card className="px-5 py-6 text-center text-[13px] text-ink-soft">
        Sin metas de semáforo capturadas para {etiquetaPeriodo} -- necesita al menos una fila en "metas_semaforo" para este periodo.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1400px] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-line text-center text-[10px] uppercase tracking-wide text-ink-muted">
              <th className="px-3 py-2 text-left font-medium" rowSpan={2}>Vendedor</th>
              <th className="border-l border-line px-3 py-2 font-semibold text-ink" colSpan={4}>Existentes</th>
              <th className="border-l border-line px-3 py-2 font-semibold text-ink" colSpan={4}>Nuevos</th>
              <th className="border-l border-line px-3 py-2 font-semibold text-ink" colSpan={1}>Punto de equilibrio</th>
              <th className="border-l border-line px-3 py-2 font-semibold text-ink" colSpan={4}>Acumulado del mes</th>
            </tr>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-wide text-ink-muted">
              <th className="border-l border-line px-3 py-2 font-medium">Verde</th>
              <th className="px-3 py-2 font-medium">Amarillo</th>
              <th className="px-3 py-2 font-medium">Rojo</th>
              <th className="px-3 py-2 font-medium">Resultados</th>
              <th className="border-l border-line px-3 py-2 font-medium">Verde</th>
              <th className="px-3 py-2 font-medium">Amarillo</th>
              <th className="px-3 py-2 font-medium">Rojo</th>
              <th className="px-3 py-2 font-medium">Resultados</th>
              <th className="border-l border-line px-3 py-2 font-medium">Restante para PE</th>
              <th className="border-l border-line px-3 py-2 font-medium">Objetivo</th>
              <th className="px-3 py-2 font-medium">Punto de equilibrio</th>
              <th className="px-3 py-2 font-medium">Resultado</th>
              <th className="px-3 py-2 font-medium">Resta</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <FilaTabla key={f.vendedorId} f={f} />
            ))}
            <FilaTabla f={total} esTotal />
          </tbody>
        </table>
      </div>
      <p className="border-t border-line bg-surface-sunk px-4 py-3 text-[11px] leading-relaxed text-ink-muted">
"Resultados" y "Resultado" (acumulado del mes) salen del monto real que Monday tiene atribuido a cada vendedor (con IVA), deduplicado por negocio --
        un mismo negocio no cuenta dos veces aunque tenga varias filas archivadas en Monday. Puede diferir del total oficial de HubSpot cuando Monday
        atribuye manualmente un monto combinado a un cierre. Existentes = "¿Cómo llegó?" Contacto existente/Remarketing; todo lo demás cuenta como
        Nuevos. Rojo = por debajo del umbral Amarillo.
      </p>
    </Card>
  );
}

function FilaTabla({ f, esTotal }: { f: FilaSemaforoComercial; esTotal?: boolean }) {
  return (
    <tr className={`border-b border-line/70 last:border-0 ${esTotal ? "bg-surface-sunk font-semibold" : ""}`}>
      <td className={`px-3 py-2.5 text-ink ${esTotal ? "font-semibold" : "font-medium"}`}>{f.nombre}</td>
      <CeldaMonto valor={f.existentesVerde} />
      <CeldaMonto valor={f.existentesAmarillo} />
      <td className="px-3 py-2.5 tabular text-ink-muted">{`< ${dinero(f.existentesAmarillo)}`}</td>
      <CeldaResultado valor={f.resultadoExistentes} semaforo={f.semaforoExistentes} />
      <CeldaMonto valor={f.nuevosVerde} />
      <CeldaMonto valor={f.nuevosAmarillo} />
      <td className="px-3 py-2.5 tabular text-ink-muted">{`< ${dinero(f.nuevosAmarillo)}`}</td>
      <CeldaResultado valor={f.resultadoNuevos} semaforo={f.semaforoNuevos} />
      <CeldaMonto valor={f.restantePE} />
      <CeldaMonto valor={f.objetivo} />
      <CeldaMonto valor={f.puntoEquilibrio} />
      <CeldaMonto valor={f.resultado} />
      <td className="px-3 py-2.5 tabular font-medium" style={{ color: f.resta > 0 ? "#d03b3b" : "#0ca30c" }}>
        {dinero(f.resta)}
      </td>
    </tr>
  );
}
