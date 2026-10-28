import { Card, Seccion, SemaforoBadge } from "@/components/ui";
import { dinero, num, pct } from "@/lib/format";
import type { DisciplinaComercial, EstatusReto, FilaSemaforoComercial } from "@/lib/queries";
import type { Semaforo } from "@/lib/types";

const ETIQUETA_ESTATUS: Record<EstatusReto, string> = {
  cumplido: "Cumplido",
  en_progreso: "En progreso",
  no_alcanzado: "No alcanzado",
  sin_dato: "Sin dato",
  pendiente: "Pendiente",
};

interface Props {
  periodoEtiqueta: string;
  /** Fila del Semáforo Comercial de este vendedor (metas y resultado real), si tiene metas capturadas. */
  fila: FilaSemaforoComercial | null;
  semaforoMes: Semaforo;
  disciplina: DisciplinaComercial | null;
  actividad: {
    negociosCreados: number | null;
    negociosGanados: number | null;
    correos: number | null;
    llamadas: number | null;
    reuniones: number | null;
  };
  tareas: { total: number; atrasadas: number };
  registrosPorRevisar: number;
}

function Tarjeta({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">KPI {numero}</p>
      <h3 className="mt-0.5 text-[13px] font-semibold leading-snug text-ink">{titulo}</h3>
      <div className="mt-3 space-y-1.5 text-[13px] text-ink-soft">{children}</div>
    </Card>
  );
}

function Linea({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span>{etiqueta}</span>
      <span className="font-medium text-ink">{valor}</span>
    </div>
  );
}

/**
 * "¿Cómo voy en mis KPIs mensuales?" -- los 5 KPIs del rol. Solo el KPI 1 tiene
 * una meta numérica (100% de la meta mensual); los KPIs 2-5 dicen "cumplimiento
 * demostrado" y NO tienen escala aprobada, así que aquí se muestran como
 * indicadores del periodo, sin calificación. Cuando el dato no se puede medir
 * con confianza se dice "sin información suficiente" en vez de inventarlo.
 */
export function MisKpisMensuales({ periodoEtiqueta, fila, semaforoMes, disciplina, actividad, tareas, registrosPorRevisar }: Props) {
  const semana = disciplina?.semanas.find((s) => s.esSemanaActual) ?? null;
  const cumplimiento = fila && fila.objetivo > 0 ? (fila.resultado / fila.objetivo) * 100 : null;

  return (
    <Seccion
      titulo="📊 ¿Cómo voy en mis KPIs mensuales?"
      descripcion={`${periodoEtiqueta} · Los KPIs 2 a 5 son indicadores de apoyo, todavía sin calificación.`}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Tarjeta numero={1} titulo="Cumplimiento constante de la meta comercial mensual (meta: 100%)">
          {fila ? (
            <>
              <div className="flex items-center gap-2">
                <SemaforoBadge estado={semaforoMes} compacto />
                <span className="text-[20px] font-semibold text-ink">{pct(cumplimiento)}</span>
                <span className="text-[12px] text-ink-muted">de {dinero(fila.objetivo)}</span>
              </div>
              <Linea etiqueta="Vendido (con IVA)" valor={dinero(fila.resultado)} />
              <Linea
                etiqueta="Existentes"
                valor={`${dinero(fila.resultadoExistentes)} de ${dinero(fila.existentesVerde)} · ${fila.semaforoExistentes}`}
              />
              <Linea
                etiqueta="Nuevos"
                valor={`${dinero(fila.resultadoNuevos)} de ${dinero(fila.nuevosVerde)} · ${fila.semaforoNuevos}`}
              />
              <Linea etiqueta="Falta para la meta" valor={dinero(Math.max(0, fila.resta))} />
              <Linea etiqueta="Falta para el punto de equilibrio" valor={dinero(fila.restantePE)} />
              {semana && semana.metaCierreSemana != null && (
                <Linea
                  etiqueta={`Esta semana (${semana.etiqueta})`}
                  valor={`${dinero(semana.montoVendido)} de ${dinero(semana.metaCierreSemana)} · ${ETIQUETA_ESTATUS[semana.estatusCierre]}`}
                />
              )}
            </>
          ) : (
            <p>Meta del mes sin capturar: aún no se puede calcular tu cumplimiento.</p>
          )}
        </Tarjeta>

        <Tarjeta numero={2} titulo="Dominio del proceso comercial y del flujo de ventas">
          <p>
            Sin información suficiente: el historial de etapas del dashboard está incompleto, así que aquí no se
            puede confirmar si avanzas tus negocios en la secuencia correcta. Se revisa directamente en HubSpot.
          </p>
        </Tarjeta>

        <Tarjeta numero={3} titulo="Manejo autónomo de clientes y seguimiento de oportunidades">
          <Linea etiqueta="Correos enviados (periodo)" valor={num(actividad.correos)} />
          <Linea etiqueta="Llamadas" valor={num(actividad.llamadas)} />
          <Linea etiqueta="Reuniones" valor={num(actividad.reuniones)} />
          {semana && (
            <Linea
              etiqueta="Tareas de esta semana completadas"
              valor={`${num(semana.tareasCompletadas)} de ${num(semana.tareasAsignadas)}`}
            />
          )}
          <Linea etiqueta="Tareas atrasadas hoy" valor={num(tareas.atrasadas)} />
          <p className="pt-1 text-[12px] text-ink-muted">
            Lo que haces por WhatsApp no se mide aquí; estos números no lo incluyen.
          </p>
        </Tarjeta>

        <Tarjeta numero={4} titulo="Registro ordenado y constante de oportunidades en el sistema comercial">
          {semana && <Linea etiqueta="Notas en HubSpot esta semana" valor={num(semana.notas)} />}
          <Linea etiqueta="Tareas abiertas hoy" valor={num(tareas.total)} />
          <Linea etiqueta="Negocios con datos por corregir" valor={num(registrosPorRevisar)} />
          <p className="pt-1 text-[12px] text-ink-muted">
            Una parte de las actividades no queda asignada a una persona en HubSpot, por eso este indicador puede
            quedarse corto.
          </p>
        </Tarjeta>

        <Tarjeta numero={5} titulo="Generación de oportunidades y avance de negociaciones de forma independiente">
          <Linea etiqueta="Negocios creados (periodo)" valor={num(actividad.negociosCreados)} />
          <Linea etiqueta="Negocios ganados (periodo)" valor={num(actividad.negociosGanados)} />
          {semana && (
            <Linea
              etiqueta="Creados esta semana"
              valor={
                semana.negociosCreadosSemanaAnterior == null
                  ? num(semana.negociosCreados)
                  : `${num(semana.negociosCreados)} (semana anterior: ${num(semana.negociosCreadosSemanaAnterior)})`
              }
            />
          )}
          <p className="pt-1 text-[12px] text-ink-muted">
            Aquí cuentan todos los negocios creados, incluidos los de remarketing y clientes recurrentes. Aún no se
            separa quién originó cada oportunidad.
          </p>
        </Tarjeta>
      </div>
    </Seccion>
  );
}
