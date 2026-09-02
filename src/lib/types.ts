export type AppRole = "admin" | "supervisor" | "vendedor";
export type Ventana = "kpi_4_semanas" | "calendario";
export type Calidad = "ok" | "parcial" | "por_revisar";
export type Semaforo = "verde" | "amarillo" | "naranja" | "rojo" | "sin_dato";

export interface Perfil {
  id: string;
  email: string;
  nombre_completo: string;
  nombre_corto: string;
  rol: AppRole;
  puesto: string | null;
  hubspot_owner_id: string | null;
  activo: boolean;
  fecha_ingreso: string | null;
  avatar_url: string | null;
}

export interface Periodo {
  id: string;
  etiqueta: string;
  anio: number;
  mes: number;
  kpi_inicio: string;
  kpi_fin: string;
  cal_inicio: string;
  cal_fin: string;
  cerrado: boolean;
}

/** Fila de la vista v_kpi_vendedor. */
export interface KpiVendedor {
  id: number;
  vendedor_id: string;
  nombre_corto: string;
  nombre_completo: string;
  rol: AppRole;
  periodo_id: string;
  periodo_etiqueta: string;
  anio: number;
  mes: number;
  ventana: Ventana;
  venta_existentes_iva: number | null;
  venta_nuevos_iva: number | null;
  venta_total_iva: number;
  venta_total_sin_iva: number;
  objetivo_total: number | null;
  objetivo_confirmado: boolean | null;
  cumplimiento_pct: number | null;
  semaforo: Semaforo;
  pct_existentes: number | null;
  tasa_conversion_pct: number | null;
  conversion_es_reportada: boolean;
  leads_registrados: number | null;
  leads_relevantes: number | null;
  deals_creados: number | null;
  deals_ganados: number | null;
  deals_perdidos: number | null;
  correos_enviados: number | null;
  llamadas: number | null;
  reuniones: number | null;
  actividades_totales: number | null;
  tareas_abiertas: number | null;
  ticket_promedio_sin_iva: number | null;
  ciclo_cierre_dias: number | null;
  fuente: string;
  calidad: Calidad;
  notas: string | null;
  actualizado_en: string;
}

/** Fila de la vista v_resumen_area. */
export interface ResumenArea {
  periodo_id: string;
  periodo_etiqueta: string;
  anio: number;
  mes: number;
  cerrado: boolean;
  ventana: Ventana;
  objetivo_total_iva: number | null;
  venta_total_iva: number | null;
  venta_existentes_iva: number | null;
  venta_nuevos_iva: number | null;
  cumplimiento_pct: number | null;
  leads_registrados: number | null;
  leads_relevantes: number | null;
  leads_con_deal: number | null;
  deals_ganados: number | null;
  ganado_sin_iva: number | null;
  deals_marketing: number | null;
  monto_marketing_sin_iva: number | null;
  tareas_abiertas: number | null;
  vendedores: number | null;
  registros_por_revisar: number | null;
  ciclo_cierre_promedio: number | null;
  cifra_oficial: boolean;
  notas: string | null;
}

export interface Benchmark {
  indicador: string;
  valor_min: number | null;
  valor_max: number | null;
  unidad: string | null;
  descripcion: string | null;
}

export interface Evaluacion {
  id: number;
  vendedor_id: string;
  periodo_id: string;
  estatus: "borrador" | "publicada";
  calificacion: number | null;
  diagnostico: string | null;
  contexto_mercado: string | null;
  feedback: string | null;
  ventana_declarada: Ventana;
  autor_id: string | null;
  archivo_origen: string | null;
  publicada_en: string | null;
}

export interface FilaBrecha {
  id: number;
  evaluacion_id: number;
  orden: number;
  indicador: string;
  valor_vendedor: string | null;
  estandar_esperado: string | null;
  lectura: string | null;
}

export interface Accion {
  id: number;
  evaluacion_id: number;
  orden: number;
  descripcion: string;
  meta_numerica: string | null;
  fecha_limite: string | null;
  estatus: "pendiente" | "en_curso" | "cumplida" | "no_cumplida";
}

export interface ContextoMercado {
  id: number;
  periodo_id: string | null;
  titulo: string;
  cuerpo: string;
}
