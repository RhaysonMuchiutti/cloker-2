export const reportGroups = [
  { key: "campaign", field: "campaign_id", label: "Campanha" },
  { key: "stream", field: "stream_id", label: "Fluxo" },
  { key: "destination", field: "destination_id", label: "Destino" },
  { key: "source", field: "source_id", label: "Fonte de tráfego" },
  { key: "geo_country", field: "geo_country", label: "País" },
  { key: "geo_region", field: "geo_region", label: "Região" },
  { key: "city", field: "city", label: "Cidade" },
  { key: "device_type", field: "device_type", label: "Dispositivo" },
  { key: "os", field: "os", label: "Sistema operacional" },
  { key: "browser", field: "browser", label: "Navegador" },
  { key: "isp", field: "isp", label: "Provedor de internet" },
  { key: "zone_id", field: "zone_id", label: "Zona" },
  { key: "publisher_id", field: "publisher_id", label: "Publicador" },
  { key: "site_id", field: "site_id", label: "Site" },
  { key: "creative_id", field: "creative_id", label: "Criativo" },
  { key: "carrier", field: "carrier", label: "Operadora" },
  { key: "connection_type", field: "connection_type", label: "Tipo de conexão" },
  { key: "source_campaign_id", field: "source_campaign_id", label: "ID da campanha de origem" },
  { key: "source_campaign_name", field: "source_campaign_name", label: "Nome da campanha de origem" }
] as const;

export type ReportGroup = (typeof reportGroups)[number]["key"];
export const defaultReportPath: ReportGroup[] = ["campaign", "geo_country", "zone_id"];
export const reportTimezones = ["America/Campo_Grande", "America/Sao_Paulo", "UTC", "Europe/Moscow", "Europe/Berlin", "America/New_York", "Asia/Kolkata", "Asia/Tokyo"];

export function dateInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function reportPreset(preset: string, timezone: string) {
  const today = dateInTimezone(timezone);
  const shift = (days: number) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  if (preset === "yesterday") return { from: shift(-1), to: shift(-1) };
  return { from: shift(preset === "today" ? 0 : preset === "30days" ? -29 : -6), to: today };
}
