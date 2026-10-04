import { Card } from "@/components/ui";
import { dinero } from "@/lib/format";
import type { ResumenOperativoMonday } from "@/lib/queries";

const EXISTENTES = ["Contacto existente", "Remarketing"];
const NUEVOS = ["Recomendación", "Equipo Comercial", "WhatsApp", "Instagram", "Facebook", "Mail", "Ads", "Patagon", "Prospección"];

/**
 * Participación por Canales de Origen (Existentes vs. Nuevos) -- lista fija
 * de canales (aunque un canal tenga 0 negocios ese periodo, se muestra en
 * $0 en vez de desaparecer). Cualquier canal que Monday traiga y no esté en
 * la lista fija (ej. "Llamada") se agrega como fila extra en vez de
 * descartarse, y los negocios sin canal capturado / sin fila en Monday van
 * en un bloque "Sin clasificar": así el GRAN TOTAL cuadra siempre con la
 * Venta oficial del periodo. % de participación es contra ese gran total.
 */
export function ParticipacionPorCanal({
  porCanal, etiqueta, sinCanal, soloHubspot,
}: {
  porCanal: ResumenOperativoMonday["porCanal"];
  etiqueta: string;
  sinCanal?: { deals: number; monto_con_iva: number };
  soloHubspot?: { deals: number; monto_con_iva: number };
}) {
  const porCanalNormalizado = new Map(porCanal.map((c) => [c.canal.trim().toLowerCase(), c]));
  const buscar = (nombre: string) => porCanalNormalizado.get(nombre.trim().toLowerCase()) ?? { canal: nombre, deals: 0, monto_con_iva: 0 };

  const nombresFijos = new Set([...EXISTENTES, ...NUEVOS].map((n) => n.toLowerCase()));
  const extras = porCanal.filter((c) => !nombresFijos.has(c.canal.trim().toLowerCase()));
  const extrasExistentes = extras.filter((c) => EXISTENTES.some((e) => e.toLowerCase() === c.canal.trim().toLowerCase()));
  const extrasNuevos = extras.filter((c) => !extrasExistentes.includes(c));

  const filasExistentes = [...EXISTENTES.map(buscar), ...extrasExistentes];
  const filasNuevos = [...NUEVOS.map(buscar), ...extrasNuevos];
  const filasSinClasificar: ResumenOperativoMonday["porCanal"] = [];
  if (sinCanal && sinCanal.monto_con_iva > 0) filasSinClasificar.push({ canal: "Sin canal capturado en Monday", deals: sinCanal.deals, monto_con_iva: sinCanal.monto_con_iva });
  if (soloHubspot && soloHubspot.monto_con_iva > 0) filasSinClasificar.push({ canal: "Solo en HubSpot (sin registro en Monday)", deals: soloHubspot.deals, monto_con_iva: soloHubspot.monto_con_iva });

  const granTotal = [...filasExistentes, ...filasNuevos, ...filasSinClasificar].reduce((acc, f) => acc + f.monto_con_iva, 0);
  const pct = (monto: number) => (granTotal > 0 ? (monto / granTotal) * 100 : 0);

  const totalExistentes = filasExistentes.reduce((acc, f) => acc + f.monto_con_iva, 0);
  const dealsExistentes = filasExistentes.reduce((acc, f) => acc + f.deals, 0);
  const totalNuevos = filasNuevos.reduce((acc, f) => acc + f.monto_con_iva, 0);
  const dealsNuevos = filasNuevos.reduce((acc, f) => acc + f.deals, 0);
  const totalSinClasificar = filasSinClasificar.reduce((acc, f) => acc + f.monto_con_iva, 0);
  const dealsSinClasificar = filasSinClasificar.reduce((acc, f) => acc + f.deals, 0);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <BloqueCanal titulo="Existentes" filas={filasExistentes} totalDeals={dealsExistentes} totalMonto={totalExistentes} pct={pct} />
      <BloqueCanal titulo="Nuevos" filas={filasNuevos} totalDeals={dealsNuevos} totalMonto={totalNuevos} pct={pct} />
      {filasSinClasificar.length > 0 && (
        <BloqueCanal titulo="Sin clasificar" filas={filasSinClasificar} totalDeals={dealsSinClasificar} totalMonto={totalSinClasificar} pct={pct} />
      )}
      <p className="text-[11px] text-ink-muted lg:col-span-2">
        {etiqueta} -- gran total {dinero(granTotal)} (Existentes + Nuevos{filasSinClasificar.length > 0 ? " + Sin clasificar" : ""}); coincide con la Venta oficial del periodo.
        % de participación contra ese gran total. Cantidad = número de negocios; un negocio dividido entre dos vendedores cuenta una vez por cada uno.
      </p>
    </div>
  );
}

function BloqueCanal({
  titulo, filas, totalDeals, totalMonto, pct,
}: {
  titulo: string;
  filas: ResumenOperativoMonday["porCanal"];
  totalDeals: number;
  totalMonto: number;
  pct: (monto: number) => number;
}) {
  return (
    <Card className="overflow-hidden">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="bg-ink px-4 py-2.5 text-left text-[12px] font-semibold text-white">{titulo}</th>
            <th className="bg-ink px-4 py-2.5 text-right text-[11px] font-medium text-white/80">Cantidad</th>
            <th className="bg-ink px-4 py-2.5 text-right text-[11px] font-medium text-white/80">Monto</th>
            <th className="bg-[#f2c94c] px-4 py-2.5 text-right text-[11px] font-semibold text-ink">% participación</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.canal} className="border-b border-line/70">
              <td className="px-4 py-2.5 text-ink">{f.canal}</td>
              <td className="px-4 py-2.5 tabular text-right text-ink-soft">{f.deals}</td>
              <td className="px-4 py-2.5 tabular text-right text-ink-soft">{dinero(f.monto_con_iva)}</td>
              <td className="px-4 py-2.5 tabular text-right text-ink-soft">{pct(f.monto_con_iva).toFixed(2)}%</td>
            </tr>
          ))}
          <tr className="bg-[#fdf6b2] font-semibold">
            <td className="px-4 py-2.5 text-ink">TOTAL</td>
            <td className="px-4 py-2.5 tabular text-right text-ink">{totalDeals}</td>
            <td className="px-4 py-2.5 tabular text-right text-ink">{dinero(totalMonto)}</td>
            <td className="px-4 py-2.5 tabular text-right text-ink">{pct(totalMonto).toFixed(2)}%</td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}
