-- =====================================================================
-- 014_fix_monto_atribuido_division.sql — El monto de una fila DIVIDIDA
-- ya es el monto atribuido, no el total del trato
-- =====================================================================
-- Bug real: la columna generada monto_atribuido calculaba
-- monto_total * (porcentaje_comision / 100), asumiendo que "Monto" en
-- Monday es el total del trato completo y porcentaje_comision el % que le
-- toca a esa fila. Confirmado con el dueño del tablero: NO es así -- en
-- una venta dividida, cada fila ya captura el monto que le corresponde a
-- esa persona ("Monto" = su parte, no el total). "Porcentaje de comisión"
-- es solo informativo (documenta qué fracción representa esa fila), no
-- un multiplicador a aplicar de nuevo. El total real del trato es la SUMA
-- de las filas divididas, no una de ellas repartida otra vez.
--
-- Esto estaba partiendo a la mitad (o al %) el monto real de CADA trato
-- dividido en todo el dashboard: Desglose de ventas, Origen y canal de
-- venta, y la alerta de auditoría "Monday sin canal" -- no solo en el
-- ejercicio de esta conversación.
-- =====================================================================

alter table public.monday_cierres drop column monto_atribuido;

alter table public.monday_cierres add column monto_atribuido numeric(14,2)
  generated always as (coalesce(monto_total, 0)) stored;

comment on column public.monday_cierres.monto_atribuido is
  'Monto que le corresponde a ESTA fila/vendedor -- igual a monto_total, porque en una venta dividida cada fila YA captura su propia parte (no el total del trato). porcentaje_comision es solo informativo, no se vuelve a aplicar aquí.';

comment on column public.monday_cierres.porcentaje_comision is
  '% que representa esta fila del trato completo -- informativo (para reportar "Individual" vs. "División X%"), NO es un multiplicador: monto_total en esta fila ya es la parte de este vendedor, no el total del trato.';
