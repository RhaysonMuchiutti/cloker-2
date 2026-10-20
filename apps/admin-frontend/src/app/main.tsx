import { uiValue } from "./locale";
import React, { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable
} from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams
} from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { z } from "zod";
import {
  Campaign,
  CampaignRequest,
  CampaignStructure,
  Destination,
  DestinationHealthcheckResult,
  DestinationCaps,
  DestinationRequest,
  DestinationSchedule,
  DistributionMode,
  HealthStatus,
  HealthHistoryRow,
  IngestionErrorRow,
  ListResponse,
  Metrics,
  PostbackLogRow,
  PostbackTemplate,
  PostbackTemplateRequest,
  OutboundPostbackJob,
  ReportRow,
  Status,
  Stream,
  StreamRequest,
  TrackingParam,
  api,
  AuthUser,
  setActingAsUserID
} from "./api";
import { incomingPostbackURL, generatePostbackSecret } from "./postbacks";
import { reportGroups, defaultReportPath, reportTimezones, reportPreset, ReportGroup } from "./reporting";
import "./styles.css";

const queryClient = new QueryClient();
z.setErrorMap((issue) => ({ message:
 issue.code === "too_small" ? "Preencha este campo respeitando o valor mínimo."
 : issue.code === "too_big" ? "O valor informado excede o limite."
 : issue.code === "invalid_type" ? "Informe um valor válido para este campo."
 : issue.code === "invalid_string" ? "Informe um texto ou endereço válido."
 : issue.code === "invalid_enum_value" ? "Selecione uma opção válida."
 : "Confira os dados informados."
}));

const RoutingSyncContext = React.createContext<((afterSave?: boolean) => Promise<void>) | null>(null);

function useRoutingSync() {
  const sync = useContext(RoutingSyncContext);
  if (!sync) {
    throw new Error("A sincronização de rotas está indisponível");
  }
  return sync;
}
const statusOptions: Status[] = ["active", "paused", "archived"];

const statusColors: Record<Status, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  paused: "bg-amber-50 text-amber-700 ring-amber-200",
  archived: "bg-zinc-100 text-zinc-600 ring-zinc-200"
};

function StatusIndicator({ status }: { status: Status }) {
  const paths: Record<Status, React.ReactNode> = {
    active: <path d="m8 5 11 7-11 7V5Z" />,
    paused: <><path d="M8 5v14M16 5v14" /></>,
    archived: <><path d="M4 7h16v13H4V7ZM3 4h18v3H3V4ZM9 12h6" /></>
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ring-1 ${statusColors[status]}`}>
      <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
        {paths[status]}
      </svg>
      <span className="capitalize">{uiValue(status)}</span>
    </span>
  );
}
const distributionOptions: DistributionMode[] = [
  "direct",
  "weighted",
  "fallback",
  "waterfall",
  "round_robin",
  "best_roi"
];
const conditionOperators = [
  "eq",
  "neq",
  "in",
  "not_in",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "gt",
  "gte",
  "lt",
  "lte",
  "exists",
  "not_exists",
  "regex"
];
const conditionFields = [
  "source_id",
  "source_click_id",
  "campaign_id",
  "stream_id",
  "destination_id",
  "ip",
  "geo_country",
  "geo_region",
  "city",
  "asn",
  "isp",
  "device_type",
  "os",
  "browser",
  "user_agent",
  "referrer",
  "sub1",
  "sub2",
  "sub3",
  "sub4",
  "sub5",
  "sub6",
  "sub7",
  "sub8",
  "sub9",
  "sub10",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "cost",
  "currency",
  "trafficback_depth",
  "query.country",
  "query.device",
  "query.browser",
  "query.zone",
  "query.placement",
  "query.offer",
  "query.campaign"
];
const weekdays = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun"
] as const;

type MetricKey = keyof Metrics;

function formatFixed(value: number) {
  return Number.isFinite(value) ? value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0,00";
}

function formatInteger(value: number) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("pt-BR") : "0";
}

function formatMetricValue(
  key: MetricKey,
  value: number
) {
  switch (key) {
    case "clicks":
    case "conversions":
    case "events":
      return formatInteger(value);
    case "roi":
      return `${formatFixed(value)}%`;
    case "revenue":
    case "cost":
    case "profit":
      return `$${formatFixed(value)}`;
    default:
      return formatFixed(value);
  }
}

function humanizeID(value: string) {
  return value
    .replace(/^cmp_demo_/, "")
    .replace(/^str_demo_/, "")
    .replace(/^dst_demo_/, "")
    .replace(/^src_demo_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateInputValue(value: Date) {
  return value.toISOString().slice(
    0,
    10
  );
}

function defaultReportPeriod() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 6);
  from.setUTCHours(
    0,
    0,
    0,
    0
  );
  return {
    from: dateInputValue(from),
    to: dateInputValue(to)
  };
}

function reportDateRange(
  from: string,
  to: string
) {
  return {
    from: new Date(`${from}T00:00:00.000Z`).toISOString(),
    to: new Date(`${to}T23:59:59.999Z`).toISOString(),
    timezone: "UTC"
  };
}

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [logoutError, setLogoutError] = useState("");
  const [actingAs, setActingAs] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;
    api.me().then(
      () => { if (active) setAuthenticated(true); },
      () => { if (active) setAuthenticated(false); }
    );
    return () => { active = false; };
  }, []);

  function onLogin() {
    setLogoutError("");
    setAuthenticated(true);
  }

  async function onLogout() {
    try {
      await api.logout();
      setActingAsUserID(null);
      setActingAs(null);
      queryClient.clear();
      setAuthenticated(false);
      setLogoutError("");
    } catch {
      setLogoutError("Não foi possível sair. Tente novamente.");
    }
  }

  async function onActAs(user: AuthUser | null) {
    await queryClient.cancelQueries();
    setActingAsUserID(user?.id ?? null);
    setActingAs(user);
    queryClient.clear();
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {logoutError ? <p role="alert" className="bg-red-50 p-2 text-red-700">{logoutError}</p> : null}
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={onLogin} />} />
          <Route
            path="/*"
            element={
              authenticated === null ? (
                <p>Carregando sessão…</p>
              ) : authenticated ? (
                <Layout onLogout={onLogout} actingAs={actingAs} onActAs={onActAs} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const navigate = useNavigate();
  const form = useForm<{ password: string }>({ defaultValues: { password: "" } });
  const login = useMutation({
    mutationFn: (values: { password: string }) => api.loginPassword(values.password),
    onSuccess: () => { onLogin(); navigate("/"); }
  });
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-100 px-4 text-zinc-950">
      <form className="w-full max-w-sm rounded-md border border-zinc-200 bg-white p-6 shadow-sm"
        onSubmit={form.handleSubmit((values) => login.mutate(values))}>
        <div className="text-2xl font-semibold">TraffoFlex</div>
        <p className="mt-2 text-sm text-zinc-600">Digite sua senha para acessar.</p>
        <label className="mt-6 block text-sm font-medium">Senha
          <input className="input mt-2" type="password" autoComplete="current-password" required
            {...form.register("password", { required: true })} />
        </label>
        {login.error ? <p className="mt-3 text-sm text-red-700" role="alert">Não foi possível entrar. Confira a senha e a conexão com a API.</p> : null}
        <button className="button-primary mt-6 w-full" type="submit" disabled={login.isPending}>
          {login.isPending ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}

function Layout({ onLogout, actingAs, onActAs }: {
  onLogout: () => void;
  actingAs: AuthUser | null;
  onActAs: (user: AuthUser | null) => Promise<void>;
}) {
  const [routingStatus, setRoutingStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [routingMessage, setRoutingMessage] = useState("");
  const [routingPending, setRoutingPending] = useState(0);
  const latestRoutingRequest = useRef(0);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: api.me
  });

  const syncRouting = async (afterSave = false) => {
    const requestID = ++latestRoutingRequest.current;
    setRoutingPending((current) => current + 1);
    setRoutingStatus("pending");
    setRoutingMessage("Atualizando as rotas…");
    try {
      await api.reloadTrafficCache();
      if (requestID === latestRoutingRequest.current) {
        setRoutingStatus("success");
        setRoutingMessage("Rotas atualizadas.");
      }
    } catch (error) {
      if (requestID === latestRoutingRequest.current) {
        setRoutingStatus("error");
        setRoutingMessage(`${afterSave ? "Alteração salva no MongoDB, mas não foi possível atualizar as rotas." : "Não foi possível atualizar as rotas."} Tente novamente aqui. ${error instanceof Error ? error.message : ""}`);
      }
    } finally {
      setRoutingPending((current) => current - 1);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-950">
      <aside className="fixed left-0 top-0 h-full w-64 border-r border-zinc-200 bg-white p-5">
        <div className="text-xl font-semibold">TraffoFlex</div>
        <div className="mt-2 text-xs text-zinc-500">{me.data?.email}</div>
        {actingAs ? (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">

            Acessando como {actingAs.email}
            <button className="mt-2 block underline" onClick={() => void onActAs(null)} type="button">

              Voltar aos meus dados
            </button>
          </div>
        ) : null}
        <nav className="mt-8 flex flex-col gap-1 text-sm">
          <NavLink to="/">Visão geral</NavLink>
          <NavLink to="/campaigns">Campanhas</NavLink>
          <NavLink to="/destinations">Destinos</NavLink>
          <NavLink to="/postbacks">Postbacks</NavLink>
          <NavLink to="/health-history">Histórico de disponibilidade</NavLink>
          <NavLink to="/reports">Relatórios</NavLink>
          {me.data?.role === "admin" ? <NavLink to="/ingestion">Entrada de dados</NavLink> : null}
          {me.data?.role === "admin" ? <NavLink to="/users">Usuários</NavLink> : null}
        </nav>
        <button className="button-secondary mt-8 w-full" onClick={onLogout} type="button">

          Sair
        </button>
      </aside>
      <main className="ml-64 p-6">
        <div className="mb-5 flex items-center justify-end gap-3">
          <span aria-live="polite" className={`text-sm ${routingStatus === "error" ? "text-red-700" : "text-zinc-600"}`}>
            {routingMessage}
          </span>
          <button
            className="button-secondary"
            disabled={routingPending > 0}
            onClick={() => void syncRouting()}
            type="button"
          >
            {routingPending > 0 ? "Atualizando…" : "Atualizar rotas"}
          </button>
        </div>
        <RoutingSyncContext.Provider value={syncRouting}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/campaigns/:campaignId/streams" element={<CampaignStreamsPage />} />
            <Route path="/destinations" element={<DestinationsPage />} />
            <Route path="/postbacks" element={<PostbacksPage />} />
            <Route path="/health-history" element={<HealthHistoryPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/ingestion" element={<IngestionPage />} />
            <Route path="/users" element={<UsersPage onActAs={onActAs} />} />
          </Routes>
        </RoutingSyncContext.Provider>
      </main>
    </div>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950" to={to}>
      {children}
    </Link>
  );
}

function Dashboard() {
  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: () => api.overview()
  });
  const campaigns = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api.campaigns({ limit: 500 })
  });
  const destinations = useQuery({
    queryKey: ["destinations"],
    queryFn: () => api.destinations()
  });

  return (
    <Page title="Visão geral">
      <MetricGrid metrics={overview.data} />
      <div className="mt-6 grid grid-cols-2 gap-4">
        <Panel title="Campanhas">
          <div className="text-3xl font-semibold">{campaigns.data?.total ?? 0}</div>
        </Panel>
        <Panel title="Destinos">
          <div className="text-3xl font-semibold">{destinations.data?.total ?? 0}</div>
        </Panel>
      </div>
    </Page>
  );
}

function UsersPage({ onActAs }: { onActAs: (user: AuthUser) => Promise<void> }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api.users()
  });
  const approve = useMutation({
    mutationFn: api.approveUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] })
  });
  const columns = useMemo<ColumnDef<AuthUser>[]>(
    () => [
      { header: "E-mail", accessorKey: "email" },
      { header: "Perfil", cell: ({ row }) => uiValue(row.original.role) },
      { header: "Status", cell: ({ row }) => uiValue(row.original.status) },
      {
        header: "Verificado",
        cell: ({ row }) => (row.original.email_verified ? "Sim" : "Não")
      },
      {
        header: "Ações",
        cell: ({ row }) =>
          row.original.approved ? (
            <ActionIconButton
              ariaLabel={`Abrir área de trabalho de ${row.original.email}`}
              icon="workspace"
              label="Abrir área de trabalho"
              onClick={() => {
                void onActAs(row.original).then(() => navigate("/"));
              }}
            />
          ) : (
            <ActionIconButton
              ariaLabel={`Aprovar ${row.original.email}`}
              icon="approve"
              label="Aprovar usuário"
              onClick={() => approve.mutate(row.original.id)}
            />
          )
      }
    ],
    [approve]
  );

  return (
    <Page title="Usuários">
      {approve.error ? <p className="mb-4 text-sm text-red-700">{approve.error.message}</p> : null}
      <DataTable columns={columns} data={users.data?.items ?? []} />
    </Page>
  );
}

const sourceOptionalMacros = [
  { label: "Região", param: "geo_region", macro: "[REGION]" },
  { label: "Cidade", param: "city", macro: "[CITY]" },
  { label: "ID do publicador", param: "publisher_id", macro: "[PUBLISHER_ID]" },
  { label: "ID do site", param: "site_id", macro: "[SITE_ID]" },
  { label: "ID do criativo", param: "creative_id", macro: "[CREATIVE_ID]" },
  { label: "Dispositivo", param: "device_type", macro: "[DEVICE]" },
  { label: "Navegador", param: "browser", macro: "[BROWSER]" },
  { label: "Sistema operacional", param: "os", macro: "[OS]" },
  { label: "Provedor de internet", param: "isp", macro: "[ISP]" },
  { label: "Operadora", param: "carrier", macro: "[CARRIER]" },
  { label: "Tipo de conexão", param: "source_connection_type", macro: "[CONNECTION_TYPE]" },
  { label: "ID da campanha de origem", param: "source_campaign_id", macro: "[CAMPAIGN_ID]" },
  { label: "Nome da campanha de origem", param: "source_campaign_name", macro: "[CAMPAIGN_NAME]" },
  { label: "IP de origem (dado bruto)", param: "source_ip", macro: "[IP]" }
] as const;

const legacyTrackingKeys: Record<string, string> = {
  zone_id: "sub1",
  publisher_id: "sub2",
  site_id: "sub3",
  creative_id: "sub4"
};

const defaultTrackingParams: TrackingParam[] = [
  { key: "zone_id", value: "[ZONE_ID]" },
  { key: "geo_country", value: "[COUNTRY]" },
  { key: "clickid", value: "[CLICK_ID]" },
  { key: "utm_content", value: "[CLICK_ID]" }
];

function localTrackerURL() {
  if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return "";
  }
  return `http://${window.location.hostname}:8080`;
}

function encodeTrackingParameter(value: string) {
  return encodeURIComponent(value.trim())
    .replace(/%7B/gi, "{")
    .replace(/%7D/gi, "}")
    .replace(/%5B/gi, "[")
    .replace(/%5D/gi, "]");
}

function campaignTrackingURL(baseURL: string, slug: string) {
  return `${baseURL.replace(/\/+$/, "")}/c/${encodeURIComponent(slug)}`;
}

function configuredTrackingParams(campaign: Campaign) {
  return campaign.tracking_params ?? defaultTrackingParams;
}

function trackingURL(baseURL: string, campaign: Campaign, params: TrackingParam[]) {
  if (!baseURL) {
    return "";
  }
  const query = params
    .filter((param) => param.value.trim() !== "")
    .map((param) => `${param.key}=${encodeTrackingParameter(param.value)}`)
    .join("&");
  const baseLink = campaignTrackingURL(baseURL, campaign.slug);
  return `${baseLink}${query ? `?${query}` : ""}`;
}

function CampaignCopyLinkAction({ campaign, baseURL }: { campaign: Campaign; baseURL: string }) {
  const [copyStatus, setCopyStatus] = useState("");
  const url = trackingURL(baseURL, campaign, configuredTrackingParams(campaign));
  return (
    <>
      <ActionIconButton
        ariaLabel={`Copiar URL de rastreamento de ${campaign.name}`}
        disabled={!url}
        icon="copy"
        label={copyStatus || (url ? "Copiar URL de rastreamento configurada" : "URL do rastreador indisponível")}
        onClick={() => {
          void navigator.clipboard.writeText(url).then(
            () => setCopyStatus("Copiado"),
            () => setCopyStatus("Falha ao copiar")
          );
        }}
      />
      <span aria-live="polite" className="sr-only">{copyStatus}</span>
    </>
  );
}

function CampaignLinkBuilder({ campaign, baseURL, onSaved }: {
  campaign: Campaign;
  baseURL: string;
  onSaved: (campaign: Campaign) => void;
}) {
  const initialParams = configuredTrackingParams(campaign);
  const initialValue = (key: string) => initialParams.find((param) => param.key === key)?.value ?? initialParams.find((param) => param.key === legacyTrackingKeys[key])?.value ?? "";
  const [zoneID, setZoneID] = useState(initialValue("zone_id") || initialValue("source_id"));
  const [country, setCountry] = useState(initialValue("geo_country"));
  const [clickID, setClickID] = useState(initialValue("clickid") || initialValue("utm_content"));
  const [cost, setCost] = useState(initialValue("cost"));
  const [macroValues, setMacroValues] = useState<Record<string, string>>(() => Object.fromEntries(sourceOptionalMacros.map(macro => [macro.param, initialValue(macro.param) || macro.macro])));
  const [optionalParams, setOptionalParams] = useState<string[]>(
    sourceOptionalMacros.filter((macro) => initialParams.some((param) => param.key === macro.param || param.key === legacyTrackingKeys[macro.param])).map((macro) => macro.param)
  );
  const [copyStatus, setCopyStatus] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const params: TrackingParam[] = [
    { key: "zone_id", value: zoneID },
    { key: "geo_country", value: country },
    { key: "clickid", value: clickID },
    { key: "utm_content", value: clickID },
    { key: "cost", value: cost }
  ];
  for (const macro of sourceOptionalMacros) {
    if (optionalParams.includes(macro.param)) {
      params.push({ key: macro.param, value: macroValues[macro.param] });
    }
  }
  const savedParams = params.filter((param) => param.value.trim() !== "");
  const dirty = JSON.stringify(savedParams) !== JSON.stringify(configuredTrackingParams(campaign));
  const url = trackingURL(baseURL, campaign, savedParams);
  const save = useMutation({
    mutationFn: () => api.updateTrackingParams(campaign.id, savedParams),
    onSuccess: (updated) => {
      onSaved(updated);
      setSaveStatus("Parâmetros salvos. O botão de copiar da tabela agora usa esta URL.");
    }
  });
  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-600">

        Copie esta URL para sua fonte de tráfego. As macros permanecem legíveis para que a fonte substitua seus valores.
      </p>
      {campaign.status !== "active" ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">

          Esta campanha está {uiValue(campaign.status)}; seu link de rastreamento só redirecionará após a ativação e a atualização das rotas.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-medium">

          ID da zona
          <input className="input mt-1" onChange={(event) => setZoneID(event.target.value)} value={zoneID} />
          <span className="mt-1 block text-xs font-normal text-zinc-500">zone_id</span>
        </label>
        <label className="block text-sm font-medium">

          País
          <input className="input mt-1" onChange={(event) => setCountry(event.target.value)} value={country} />
          <span className="mt-1 block text-xs font-normal text-zinc-500">geo_country</span>
        </label>
        <label className="block text-sm font-medium">

          ID do clique na rede de anúncios
          <input className="input mt-1" onChange={(event) => setClickID(event.target.value)} value={clickID} />
          <span className="mt-1 block text-xs font-normal text-zinc-500">clickid e utm_content</span>
        </label>
      </div>
      <div className="space-y-1 text-xs text-zinc-600">
        <p>O TraffoFlex gera seu próprio click_id para a URL de destino; o [CLICK_ID] da fonte é salvo como ID externo do clique.</p>
        <p>[COUNTRY] contém o nome do país. Regras que esperam um código de duas letras, como US, não corresponderão a esse valor.</p>
        {campaign.traffic_source_id ? (
          <p>A fonte de tráfego e a zona são separadas: a fonte vem da configuração da campanha, e a zona é salva como zone_id.</p>
        ) : null}
      </div>
      <label className="block text-sm font-medium">

        Macro de custo
        <input className="input mt-1 font-mono" onChange={event => setCost(event.target.value)} value={cost} placeholder="[CPV_PRICE]" />
        <span className="mt-1 block text-xs font-normal text-zinc-500">

          cost · Use a macro de preço aceita pela sua fonte, como [CPV_PRICE] no RichAds.
          {campaign.pricing_model === "cpm" ? " CPM: preço recebido ÷ 1000 por clique." : " CPC: preço recebido por clique."}
        </span>
      </label>
      <details className="rounded-md border border-zinc-200 p-3">
        <summary className="cursor-pointer text-sm font-medium">Macros opcionais da fonte</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {sourceOptionalMacros.map((macro) => (
            <div className="rounded border border-zinc-100 p-2" key={macro.param}>
              <label className="flex items-center gap-2 text-sm">
                <input checked={optionalParams.includes(macro.param)} onChange={(event) => setOptionalParams(current => event.target.checked ? [...current, macro.param] : current.filter(item => item !== macro.param))} type="checkbox" />
                {macro.label}
              </label>
              <input className="input mt-2 font-mono text-xs" aria-label={`${macro.label} macro`} disabled={!optionalParams.includes(macro.param)} value={macroValues[macro.param]} onChange={event => setMacroValues(current => ({ ...current, [macro.param]: event.target.value }))} />
              <code className="mt-1 block text-xs text-zinc-500">{macro.param}</code>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500">Use macros aceitas pela sua fonte de tráfego. Ajuste os valores opcionais quando os nomes das macros forem diferentes.</p>
        <p className="mt-3 text-xs text-zinc-500">

          O IP de origem é salvo como dado bruto e não é considerado o IP confiável do visitante.
        </p>
      </details>
      <label className="block text-sm font-medium">

        URL de rastreamento
        <textarea className="input mt-1 min-h-28 font-mono text-xs" onFocus={(event) => event.currentTarget.select()} readOnly value={url} />
      </label>
      <div className="flex items-center gap-3">
        <button
          className="button-secondary"
          disabled={!dirty || save.isPending}
          onClick={() => {
            setSaveStatus("");
            save.mutate();
          }}
          type="button"
        >
          {save.isPending ? "Salvando…" : "Salvar parâmetros"}
        </button>
        <button
          className="button-primary"
          disabled={!url}
          onClick={() => {
            void navigator.clipboard.writeText(url).then(
              () => setCopyStatus("Copiado para a área de transferência"),
              () => setCopyStatus("Falha ao copiar; selecione a URL acima")
            );
          }}
          type="button"
        >

          Copiar URL de rastreamento
        </button>
        <span aria-live="polite" className="text-sm text-zinc-600">{copyStatus}</span>
      </div>
      {dirty ? <p className="text-xs text-amber-700">Salve os parâmetros para atualizar o botão de copiar na lista de campanhas.</p> : null}
      {saveStatus ? <p role="status" className="text-sm text-green-700">{saveStatus}</p> : null}
      {save.error ? <p role="alert" className="text-sm text-red-700">Não foi possível salvar os parâmetros: {save.error.message}</p> : null}
    </div>
  );
}

function CampaignStructureCell({
  structure,
  kind,
  loading,
  failed
}: {
  structure?: CampaignStructure;
  kind: "streams" | "destinations";
  loading: boolean;
  failed: boolean;
}) {
  if (loading) {
    return <span className="text-sm text-zinc-500">Carregando…</span>;
  }
  if (failed) {
    return <span className="text-sm text-zinc-500">—</span>;
  }
  const count = kind === "streams" ? structure?.stream_count : structure?.destination_count;
  return <span className="font-semibold tabular-nums">{count ?? 0}</span>;
}

function CampaignsPage() {
  const queryClient = useQueryClient();
  const syncRouting = useRoutingSync();
  const navigate = useNavigate();
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [linkCampaign, setLinkCampaign] = useState<Campaign | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Campaign | null>(null);
  const [campaignTab, setCampaignTab] = useState<"current" | "archive">("current");
  const [campaignFormOpen, setCampaignFormOpen] = useState(false);
  const clientConfig = useQuery({
    queryKey: ["client-config"],
    queryFn: api.clientConfig
  });
  const trackerBaseURL = clientConfig.data?.tracker_base_url || localTrackerURL();
  const campaigns = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api.campaigns({ limit: 500 })
  });
  const structure = useQuery({
    queryKey: ["campaign-structure"],
    queryFn: api.campaignStructure
  });
  const structureByCampaign = new Map(
    (structure.data?.items ?? []).map((item) => [item.campaign_id, item])
  );
  const allCampaigns = campaigns.data?.items ?? [];
  const currentCampaigns = allCampaigns.filter((campaign) => campaign.status !== "archived");
  const archivedCampaigns = allCampaigns.filter((campaign) => campaign.status === "archived");
  const visibleCampaigns = campaignTab === "archive" ? archivedCampaigns : currentCampaigns;
  const createCampaign = useMutation({
    mutationFn: api.createCampaign,
    onSuccess: () => {
      setCampaignFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["campaign-structure"] });
      void syncRouting(true);
    }
  });
  const updateCampaign = useMutation({
    mutationFn: (data: CampaignRequest) =>
      api.updateCampaign(
        editingCampaign?.id ?? "",
        data
      ),
    onSuccess: () => {
      setEditingCampaign(null);
      setCampaignFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void syncRouting(true);
    }
  });
  const archiveCampaign = useMutation({
    mutationFn: (campaign: Campaign) => api.updateCampaign(
      campaign.id,
      campaignRequestWithStatus(campaign, "archived")
    ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void syncRouting(true);
    }
  });
  const restoreCampaign = useMutation({
    mutationFn: (campaign: Campaign) => api.updateCampaign(
      campaign.id,
      campaignRequestWithStatus(campaign, "paused")
    ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void syncRouting(true);
    }
  });
  const deleteCampaign = useMutation({
    mutationFn: api.deleteCampaign,
    onSuccess: () => {
      setDeleteCandidate(null);
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["campaign-structure"] });
      void syncRouting(true);
    }
  });
  const columns: ColumnDef<Campaign>[] = [
    { header: "Nome", accessorKey: "name" },
    {
      header: "Fluxos",
      cell: ({ row }) => (
        <CampaignStructureCell
          failed={structure.isError}
          kind="streams"
          loading={structure.isPending}
          structure={structureByCampaign.get(row.original.id)}
        />
      )
    },
    {
      header: "Destinos",
      cell: ({ row }) => (
        <CampaignStructureCell
          failed={structure.isError}
          kind="destinations"
          loading={structure.isPending}
          structure={structureByCampaign.get(row.original.id)}
        />
      )
    },
    { header: "Moeda", accessorKey: "currency" },
    { header: "Status", accessorKey: "status", cell: ({ row }) => <StatusIndicator status={row.original.status} /> },
    {
      header: "Ações",
      cell: ({ row }) => (
        <div className="flex gap-2">
          {row.original.status !== "archived" ? (
            <>
              <CampaignCopyLinkAction campaign={row.original} baseURL={trackerBaseURL} key={row.original.id} />
              <ActionIconButton
                ariaLabel={`Montar URL de rastreamento de ${row.original.name}`}
                icon="link"
                label="Montar URL de rastreamento"
                onClick={() => setLinkCampaign(row.original)}
              />
            </>
          ) : null}
          <ActionIconButton
            ariaLabel={`Ver fluxos de ${row.original.name}`}
            icon="streams"
            label="Ver fluxos"
            onClick={() => navigate(`/campaigns/${encodeURIComponent(row.original.id)}/streams`)}
          />
          <ActionIconButton
            ariaLabel={`Abrir relatório de ${row.original.name}`}
            icon="report"
            label="Abrir relatório da campanha"
            onClick={() => navigate(`/reports?campaign_id=${encodeURIComponent(row.original.id)}`)}
          />
          {row.original.status === "archived" ? (
            <>
              <ActionIconButton
                ariaLabel={`Restaurar campanha ${row.original.name} como pausada`}
                disabled={restoreCampaign.isPending}
                icon="restore"
                label="Restaurar como pausada"
                onClick={() => restoreCampaign.mutate(row.original)}
              />
              <ActionIconButton
                ariaLabel={`Excluir campanha arquivada ${row.original.name}`}
                danger
                icon="delete"
                label="Excluir campanha arquivada"
                onClick={() => setDeleteCandidate(row.original)}
              />
            </>
          ) : (
            <>
              <ActionIconButton
                ariaLabel={`Editar campanha ${row.original.name}`}
                icon="edit"
                label="Editar campanha"
                onClick={() => {
                  setEditingCampaign(row.original);
                  setCampaignFormOpen(true);
                }}
              />
              <ActionIconButton
                ariaLabel={`Arquivar campanha ${row.original.name}`}
                disabled={archiveCampaign.isPending}
                icon="archive"
                label="Arquivar campanha"
                onClick={() => archiveCampaign.mutate(row.original)}
              />
            </>
          )}
        </div>
      )
    }
  ];

  return (
    <Page title="Campanhas">
      {clientConfig.isError ? (
        <p className="mb-4 text-sm text-red-700">
          {trackerBaseURL ? "Não foi possível carregar o endereço configurado; exibindo o rastreador local. " : "A URL do rastreador está indisponível: "}
          {clientConfig.error.message}
        </p>
      ) : null}
      <Panel title="Lista de campanhas">
        <div className="mb-4 flex justify-end">
          <button
            className="button-primary"
            onClick={() => {
              setEditingCampaign(null);
              setCampaignFormOpen(true);
            }}
            type="button"
          >

            Criar campanha
          </button>
        </div>
        <div className="mb-4 flex gap-2 border-b border-zinc-200" role="tablist" aria-label="Status da campanha">
          <button
            aria-controls="campaigns-tab-panel"
            aria-selected={campaignTab === "current"}
            className={`px-3 py-2 text-sm ${campaignTab === "current" ? "border-b-2 border-zinc-900 font-semibold" : "text-zinc-500"}`}
            onClick={() => setCampaignTab("current")}
            id="campaigns-current-tab"
            role="tab"
            type="button"
          >

            Atuais ({currentCampaigns.length})
          </button>
          <button
            aria-controls="campaigns-tab-panel"
            aria-selected={campaignTab === "archive"}
            className={`px-3 py-2 text-sm ${campaignTab === "archive" ? "border-b-2 border-zinc-900 font-semibold" : "text-zinc-500"}`}
            onClick={() => setCampaignTab("archive")}
            id="campaigns-archive-tab"
            role="tab"
            type="button"
          >

            Arquivadas ({archivedCampaigns.length})
          </button>
        </div>
        {archiveCampaign.error || restoreCampaign.error || structure.error ? (
          <p role="alert" className="mb-3 text-sm text-red-700">
            {archiveCampaign.error?.message ?? restoreCampaign.error?.message ?? structure.error?.message}
          </p>
        ) : null}
        <div
          aria-labelledby={campaignTab === "current" ? "campaigns-current-tab" : "campaigns-archive-tab"}
          id="campaigns-tab-panel"
          role="tabpanel"
        >
          {campaigns.isPending ? <p className="text-sm text-zinc-500">Carregando campanhas…</p> : null}
          {campaigns.isError ? <p role="alert" className="text-sm text-red-700">{campaigns.error.message}</p> : null}
          {campaigns.isSuccess && visibleCampaigns.length === 0 ? (
            <p className="text-sm text-zinc-500">{campaignTab === "archive" ? "Nenhuma campanha arquivada." : "Nenhuma campanha atual."}</p>
          ) : null}
          {visibleCampaigns.length > 0 ? <DataTable columns={columns} data={visibleCampaigns} /> : null}
        </div>
      </Panel>
      <Modal
        onClose={() => {
          setCampaignFormOpen(false);
          setEditingCampaign(null);
        }}
        open={campaignFormOpen}
        title={editingCampaign ? "Editar campanha" : "Criar campanha"}
      >
        <CampaignForm
          initial={editingCampaign}
          key={editingCampaign?.id ?? "new-campaign"}
          onSubmit={(data) => {
            if (editingCampaign) {
              updateCampaign.mutate(data);
              return;
            }
            createCampaign.mutate(data);
          }}
          submitLabel={editingCampaign ? "Salvar" : "Criar"}
        />
      </Modal>
      <Modal
        onClose={() => setLinkCampaign(null)}
        open={linkCampaign !== null}
        title={linkCampaign ? `URL de rastreamento: ${linkCampaign.name}` : "URL de rastreamento"}
      >
        {linkCampaign ? (
          trackerBaseURL ? (
            <CampaignLinkBuilder
              baseURL={trackerBaseURL}
              campaign={linkCampaign}
              key={linkCampaign.id}
              onSaved={(updated) => {
                setLinkCampaign(updated);
                queryClient.setQueryData<ListResponse<Campaign>>(
                  ["campaigns"],
                  (current) => current ? {
                    ...current,
                    items: current.items.map((item) => item.id === updated.id ? updated : item)
                  } : current
                );
              }}
            />
          ) : (
            <div className="space-y-3 text-sm">
              <p>O endereço do rastreador está indisponível. Recarregue a configuração para montar a URL de rastreamento.</p>
              <button className="button-primary" onClick={() => void clientConfig.refetch()} type="button">

                Recarregar endereço do rastreador
              </button>
            </div>
          )
        ) : null}
      </Modal>
      <Modal
        onClose={() => setDeleteCandidate(null)}
        open={deleteCandidate !== null}
        title="Excluir campanha arquivada"
      >
        <div className="space-y-4 text-sm">
          <p>Excluir <strong>{deleteCandidate?.name}</strong>  permanentemente? Esta ação não pode ser desfeita.</p>
          <p className="text-zinc-600">Os fluxos vinculados e o histórico de análises permanecerão armazenados.</p>
          {deleteCampaign.error ? <p role="alert" className="text-red-700">{deleteCampaign.error.message}</p> : null}
          <div className="flex justify-end gap-2">
            <button className="button-secondary" onClick={() => setDeleteCandidate(null)} type="button">Cancelar</button>
            <button
              className="rounded-md bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800 disabled:opacity-50"
              disabled={deleteCampaign.isPending || deleteCandidate === null}
              onClick={() => {
                if (deleteCandidate) {
                  deleteCampaign.mutate(deleteCandidate.id);
                }
              }}
              type="button"
            >
              {deleteCampaign.isPending ? "Excluindo…" : "Excluir permanentemente"}
            </button>
          </div>
        </div>
      </Modal>
    </Page>
  );
}

function campaignRequestWithStatus(campaign: Campaign, status: Status): CampaignRequest {
  return {
    name: campaign.name,
    slug: campaign.slug,
    status,
    traffic_source_id: campaign.traffic_source_id,
    currency: campaign.currency,
    pricing_model: campaign.pricing_model ?? "cpc",
    default_action: campaign.default_action,
    trafficback_config: campaign.trafficback_config
  };
}

function CampaignStreamsPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const campaign = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: () => api.campaign(campaignId ?? ""),
    enabled: Boolean(campaignId)
  });

  return (
    <Page title="Fluxos">
      <Link className="button-secondary mb-4 inline-flex" to="/campaigns">

        ← Voltar às campanhas
      </Link>
      {campaign.isPending ? <p className="text-sm text-zinc-500">Carregando campanha…</p> : null}
      {campaign.isError ? (
        <p className="text-sm text-red-700">Não foi possível carregar a campanha: {campaign.error.message}</p>
      ) : null}
      {campaign.data ? (
        <Panel title={campaign.data.name}>
          <StreamsManager campaign={campaign.data} />
        </Panel>
      ) : null}
    </Page>
  );
}

function CampaignForm({
  initial,
  onSubmit,
  submitLabel
}: {
  initial?: Campaign | null;
  onSubmit: (data: CampaignRequest) => void;
  submitLabel: string;
}) {
  const [formError, setFormError] = useState("");
  const form = useForm<CampaignRequest>({
    defaultValues: {
      name: initial?.name ?? "",
      slug: initial?.slug ?? "",
      status: initial?.status ?? "paused",
      traffic_source_id: initial?.traffic_source_id ?? "",
      currency: initial?.currency ?? "USD",
      pricing_model: initial?.pricing_model ?? "cpc",
      default_action: initial?.default_action ?? "",
      trafficback_config: {
        enabled: initial?.trafficback_config?.enabled ?? false,
        url: initial?.trafficback_config?.url ?? "",
        max_depth: initial?.trafficback_config?.max_depth || 3
      }
    }
  });
  const trafficbackEnabled = form.watch("trafficback_config.enabled");
  return (
    <form
      className="space-y-3"
      onSubmit={form.handleSubmit((values) => {
        const payload = values.trafficback_config.enabled ? values : {
          ...values,
          trafficback_config: { enabled: false, url: "", max_depth: 0 }
        };
        const parsed = campaignSchema.safeParse(payload);
        if (!parsed.success) {
          setFormError(parsed.error.issues[0]?.message ?? "Campanha inválida");
          return;
        }
        setFormError("");
        onSubmit(payload);
      })}
    >
      {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
      <TextField label="Nome" register={form.register("name")} />
      <TextField label="Identificador da URL" register={form.register("slug")} />
      <TextField label="Moeda" register={form.register("currency")} />
      <label className="block text-sm font-medium">

        Modelo de cobrança
        <select className="input mt-1" {...form.register("pricing_model")}>
          <option value="cpc">CPC · por clique</option>
          <option value="cpm">CPM · por mil</option>
        </select>
      </label>
      <p className="text-xs text-zinc-500">
        {form.watch("pricing_model") === "cpm" ? "Custo por clique = custo recebido ÷ 1000." : "Custo por clique = custo recebido."}
        {" "}Defina a macro de custo no gerador de URL de rastreamento. As alterações valem para novos cliques.
      </p>
      <SelectField label="Status" options={statusOptions} register={form.register("status")} />
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" {...form.register("trafficback_config.enabled")} />

        Enviar tráfego para a URL de retorno quando não houver destino disponível
      </label>
      {trafficbackEnabled ? (
        <div className="space-y-3">
          <TextField label="URL de retorno de tráfego" register={form.register("trafficback_config.url")} />
          <TextField
            label="Máximo de retornos de tráfego"
            register={form.register("trafficback_config.max_depth", { valueAsNumber: true })}
            type="number"
          />
          <p className="text-xs text-zinc-500">

            Adicione trafficback_depth={"{trafficback_depth}"}  à URL se ela puder retornar a esta campanha.
          </p>
        </div>
      ) : null}
      <button className="button-primary" type="submit">
        {submitLabel}
      </button>
    </form>
  );
}

function StreamsManager({ campaign }: { campaign: Campaign }) {
  const queryClient = useQueryClient();
  const syncRouting = useRoutingSync();
  const [editingStream, setEditingStream] = useState<Stream | null>(null);
  const [streamFormOpen, setStreamFormOpen] = useState(false);
  const streams = useQuery({
    queryKey: [
      "streams",
      campaign.id
    ],
    queryFn: () => api.streams(campaign.id)
  });
  const destinations = useQuery({
    queryKey: ["destinations"],
    queryFn: () => api.destinations()
  });
  const createStream = useMutation({
    mutationFn: (data: StreamRequest) =>
      api.createStream(
        campaign.id,
        data
      ),
    onSuccess: () => {
      setStreamFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["campaign-structure"] });
      queryClient.invalidateQueries({
        queryKey: [
          "streams",
          campaign.id
        ]
      });
      void syncRouting(true);
    }
  });
  const updateStream = useMutation({
    mutationFn: (data: StreamRequest) =>
      api.updateStream(
        editingStream?.id ?? "",
        data
      ),
    onSuccess: () => {
      setEditingStream(null);
      setStreamFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["campaign-structure"] });
      queryClient.invalidateQueries({
        queryKey: [
          "streams",
          campaign.id
        ]
      });
      void syncRouting(true);
    }
  });
  const deleteStream = useMutation({
    mutationFn: api.deleteStream,
    onSuccess: () => {
      setEditingStream(null);
      setStreamFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["campaign-structure"] });
      queryClient.invalidateQueries({
        queryKey: [
          "streams",
          campaign.id
        ]
      });
      void syncRouting(true);
    }
  });
  const columns = useMemo<ColumnDef<Stream>[]>(
    () => [
      { header: "Nome", accessorKey: "name" },
      { header: "Prioridade", accessorKey: "priority" },
      { header: "Status", accessorKey: "status", cell: ({ row }) => <StatusIndicator status={row.original.status} /> },
      {
        header: "Regras",
        cell: ({ row }) => row.original.conditions.length
      },
      {
        header: "Distribuição",
        cell: ({ row }) => uiValue(row.original.distribution.mode)
      },
      {
        header: "Ações",
        cell: ({ row }) => (
          <div className="flex gap-2">
            <ActionIconButton
              ariaLabel={`Editar fluxo ${row.original.name}`}
              icon="edit"
              label="Editar fluxo"
              onClick={() => {
                setEditingStream(row.original);
                setStreamFormOpen(true);
              }}
            />
            <ActionIconButton
              ariaLabel={`Excluir fluxo ${row.original.name}`}
              danger
              icon="delete"
              label="Excluir fluxo"
              onClick={() => deleteStream.mutate(row.original.id)}
            />
          </div>
        )
      }
    ],
    [deleteStream]
  );

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          className="button-primary"
          onClick={() => {
            setEditingStream(null);
            setStreamFormOpen(true);
          }}
          type="button"
        >

          Adicionar fluxo
        </button>
      </div>
      <DataTable columns={columns} data={streams.data?.items ?? []} />
      <Modal
        onClose={() => {
          setStreamFormOpen(false);
          setEditingStream(null);
        }}
        open={streamFormOpen}
        title={editingStream ? "Editar fluxo" : "Criar fluxo"}
      >
        <StreamForm
          destinations={destinations.data?.items ?? []}
          initial={editingStream}
          key={editingStream?.id ?? "new-stream"}
          onCancel={() => {
            setStreamFormOpen(false);
            setEditingStream(null);
          }}
          onSubmit={(data) => {
            if (editingStream) {
              updateStream.mutate(data);
              return;
            }
            createStream.mutate(data);
          }}
          submitLabel={editingStream ? "Salvar fluxo" : "Adicionar fluxo"}
        />
      </Modal>
    </>
  );
}

function StreamForm({
  destinations,
  initial,
  onCancel,
  onSubmit,
  submitLabel
}: {
  destinations: Destination[];
  initial?: Stream | null;
  onCancel: () => void;
  onSubmit: (data: StreamRequest) => void;
  submitLabel: string;
}) {
  const [formError, setFormError] = useState("");
  const [conditions, setConditions] = useState(
    initial?.conditions ?? []
  );
  const [targets, setTargets] = useState(
    initial?.distribution.destinations ?? defaultTargets(destinations)
  );
  const [uniqueEnabled, setUniqueEnabled] = useState(
    initial?.distribution.unique_policy?.enabled ?? false
  );
  const form = useForm<StreamRequest>({
    defaultValues: {
      name: initial?.name ?? "",
      priority: initial?.priority ?? 10,
      status: initial?.status ?? "active",
      conditions: initial?.conditions ?? [],
      distribution: {
        mode: initial?.distribution.mode ?? "weighted",
        destinations: initial?.distribution.destinations ?? defaultTargets(destinations),
        unique_policy: {
          enabled: initial?.distribution.unique_policy?.enabled ?? false,
          user_key: initial?.distribution.unique_policy?.user_key ?? "source_click_id",
          history_window_hours: initial?.distribution.unique_policy?.history_window_hours ?? 168,
          exhausted_mode: initial?.distribution.unique_policy?.exhausted_mode ?? "allow_repeat",
          selection_strategy: initial?.distribution.unique_policy?.selection_strategy ?? "best_roi",
          roi_window_hours: initial?.distribution.unique_policy?.roi_window_hours ?? 24,
          min_clicks: initial?.distribution.unique_policy?.min_clicks ?? 100,
          fallback_strategy: initial?.distribution.unique_policy?.fallback_strategy ?? "round_robin"
        }
      }
    }
  });

  useEffect(
    () => {
      if (!initial && targets.length === 0 && destinations.length > 0) {
        setTargets(defaultTargets(destinations));
      }
    },
    [
      destinations,
      initial,
      targets.length
    ]
  );

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => {
        setFormError("");
        const payload: StreamRequest = {
          ...values,
          conditions: normalizedConditions(conditions),
          distribution: {
            ...values.distribution,
            destinations: normalizedTargets(targets),
            unique_policy: normalizedUniquePolicy(
              values.distribution.unique_policy,
              uniqueEnabled
            )
          }
        };
        try {
          streamSchema.parse(payload);
        } catch (err) {
          setFormError(err instanceof Error ? err.message : "Fluxo inválido");
          return;
        }
        onSubmit(payload);
      })}
    >
      {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Nome" register={form.register("name")} />
        <TextField
          label="Prioridade"
          register={form.register(
            "priority",
            { valueAsNumber: true }
          )}
          type="number"
        />
        <SelectField label="Status" options={statusOptions} register={form.register("status")} />
        <SelectField label="Distribuição" options={distributionOptions} register={form.register("distribution.mode")} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Regras</h3>
          <button
            className="button-secondary"
            onClick={() => setConditions([
              ...conditions,
              {
                field: "sub1",
                operator: "eq",
                value: ""
              }
            ])}
            type="button"
          >

            Adicionar regra
          </button>
        </div>
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs font-semibold uppercase text-zinc-500">
          <span>Campo</span>
          <span>Operador</span>
          <span>Valor</span>
          <span>Ação</span>
        </div>
        {conditions.map((condition, index) => (
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2" key={index}>
            <select
              className="input"
              onChange={(event) => updateCondition(
                conditions,
                setConditions,
                index,
                { field: event.target.value }
              )}
              value={condition.field}
            >
              {conditionFields.map((field) => (
                <option key={field} value={field}>
                  {uiValue(field)}
                </option>
              ))}
            </select>
            <select
              className="input"
              onChange={(event) => updateCondition(
                conditions,
                setConditions,
                index,
                { operator: event.target.value }
              )}
              value={condition.operator}
            >
              {conditionOperators.map((operator) => (
                <option key={operator} value={operator}>
                  {uiValue(operator)}
                </option>
              ))}
            </select>
            <input
              className="input"
              disabled={condition.operator === "exists" || condition.operator === "not_exists"}
              onChange={(event) => updateCondition(
                conditions,
                setConditions,
                index,
                { value: event.target.value }
              )}
              placeholder={condition.operator === "in" || condition.operator === "not_in" ? "a,b,c" : "valor"}
              value={condition.values?.join(",") ?? condition.value ?? ""}
            />
            <ActionIconButton
              ariaLabel={`Remover regra ${index + 1}`}
              danger
              icon="remove"
              label="Remover regra"
              onClick={() => setConditions(conditions.filter((_, itemIndex) => itemIndex !== index))}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Destinos</h3>
          <button
            className="button-secondary"
            onClick={() => setTargets([
              ...targets,
              {
                destination_id: destinations[0]?.id ?? "",
                weight: 100
              }
            ])}
            type="button"
          >

            Adicionar destino
          </button>
        </div>
        {targets.map((target, index) => (
          <div className="grid grid-cols-[1fr_96px_auto] gap-2" key={index}>
            <select
              className="input"
              onChange={(event) => updateTarget(
                targets,
                setTargets,
                index,
                { destination_id: event.target.value }
              )}
              value={target.destination_id}
            >
              <option value="">Selecionar destino</option>
              {destinations.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destination.name}
                </option>
              ))}
            </select>
            <input
              className="input"
              min={1}
              onChange={(event) => updateTarget(
                targets,
                setTargets,
                index,
                { weight: Number(event.target.value) }
              )}
              type="number"
              value={target.weight}
            />
            <ActionIconButton
              ariaLabel={`Remover destino ${index + 1} do fluxo`}
              danger
              icon="remove"
              label="Remover destino"
              onClick={() => setTargets(targets.filter((_, itemIndex) => itemIndex !== index))}
            />
          </div>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          checked={uniqueEnabled}
          onChange={(event) => setUniqueEnabled(event.target.checked)}
          type="checkbox"
        />

        Roteamento para destinos únicos
      </label>
      {uniqueEnabled ? (
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Chave do usuário" register={form.register("distribution.unique_policy.user_key")} />
          <TextField
            label="Janela do histórico (horas)"
            register={form.register(
              "distribution.unique_policy.history_window_hours",
              { valueAsNumber: true }
            )}
            type="number"
          />
          <SelectField
            label="Ao esgotar os destinos"
            options={[
              "allow_repeat",
              "no_destination"
            ]}
            register={form.register("distribution.unique_policy.exhausted_mode")}
          />
          <SelectField
            label="Estratégia de seleção"
            options={[
              "waterfall",
              "round_robin",
              "best_roi"
            ]}
            register={form.register("distribution.unique_policy.selection_strategy")}
          />
          <TextField
            label="Janela do ROI (horas)"
            register={form.register(
              "distribution.unique_policy.roi_window_hours",
              { valueAsNumber: true }
            )}
            type="number"
          />
          <TextField
            label="Mínimo de cliques"
            register={form.register(
              "distribution.unique_policy.min_clicks",
              { valueAsNumber: true }
            )}
            type="number"
          />
          <SelectField
            label="Estratégia alternativa"
            options={[
              "waterfall",
              "round_robin",
              "weighted"
            ]}
            register={form.register("distribution.unique_policy.fallback_strategy")}
          />
        </div>
      ) : null}

      <div className="flex gap-2">
        <button className="button-primary" type="submit">
          {submitLabel}
        </button>
        {initial ? (
          <button className="button-secondary" onClick={onCancel} type="button">

            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}

const destinationHealthColors: Record<HealthStatus, string> = {
  healthy: "bg-emerald-500",
  degraded: "bg-amber-500",
  unhealthy: "bg-red-500",
  unknown: "bg-zinc-400"
};

function DestinationHealthIndicator({ status }: { status: HealthStatus }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${destinationHealthColors[status]}`} aria-hidden="true" />
      <span className="capitalize">{uiValue(status)}</span>
    </span>
  );
}

function DestinationsPage() {
  const queryClient = useQueryClient();
  const syncRouting = useRoutingSync();
  const [editingDestination, setEditingDestination] = useState<Destination | null>(null);
  const [destinationFormOpen, setDestinationFormOpen] = useState(false);
  const [healthcheckResult, setHealthcheckResult] = useState<DestinationHealthcheckResult | null>(null);
  const destinations = useQuery({
    queryKey: ["destinations"],
    queryFn: () => api.destinations()
  });
  const createDestination = useMutation({
    mutationFn: api.createDestination,
    onSuccess: () => {
      setDestinationFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["destinations"] });
      void syncRouting(true);
    }
  });
  const updateDestination = useMutation({
    mutationFn: (data: DestinationRequest) =>
      api.updateDestination(
        editingDestination?.id ?? "",
        data
      ),
    onSuccess: () => {
      setEditingDestination(null);
      setDestinationFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["destinations"] });
      void syncRouting(true);
    }
  });
  const deleteDestination = useMutation({
    mutationFn: api.deleteDestination,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["destinations"] });
      void syncRouting(true);
    }
  });
  const triggerHealthcheck = useMutation({
    mutationFn: api.triggerDestinationHealthcheck,
    onMutate: () => setHealthcheckResult(null),
    onSuccess: (result) => {
      setHealthcheckResult(result);
      void queryClient.invalidateQueries({ queryKey: ["destinations"] });
    }
  });
  const columns = useMemo<ColumnDef<Destination>[]>(
    () => [
      { header: "Nome", accessorKey: "name" },
      { header: "URL", accessorKey: "url" },
      { header: "Manual", accessorKey: "manual_status", cell: ({ row }) => <StatusIndicator status={row.original.manual_status} /> },
      {
        header: "Disponibilidade",
        cell: ({ row }) => <DestinationHealthIndicator status={row.original.health_status} />
      },
      {
        header: "Ações",
        cell: ({ row }) => (
          <div className="flex gap-2">
            <ActionIconButton
              ariaLabel={`Verificar disponibilidade de ${row.original.name}`}
              disabled={triggerHealthcheck.isPending}
              icon="check"
              label="Verificar disponibilidade"
              onClick={() => triggerHealthcheck.mutate(row.original.id)}
            />
            <ActionIconButton
              ariaLabel={`Editar destino ${row.original.name}`}
              icon="edit"
              label="Editar destino"
              onClick={() => {
                setEditingDestination(row.original);
                setDestinationFormOpen(true);
              }}
            />
            <ActionIconButton
              ariaLabel={`Excluir destino ${row.original.name}`}
              danger
              icon="delete"
              label="Excluir destino"
              onClick={() => deleteDestination.mutate(row.original.id)}
            />
          </div>
        )
      }
    ],
    [
      deleteDestination,
      triggerHealthcheck
    ]
  );

  return (
    <Page title="Destinos">
      {healthcheckResult ? (
        <p className="mb-4 text-sm" aria-live="polite">

          Verificação {destinations.data?.items.find(destination => destination.id === healthcheckResult.destination_id)?.name ?? healthcheckResult.destination_id}: {uiValue(healthcheckResult.status)}
          {healthcheckResult.probe_status_code ? ` (HTTP ${healthcheckResult.probe_status_code})` : ""}
          {healthcheckResult.error ? ` — ${healthcheckResult.error}` : ""}. Falhas: {healthcheckResult.consecutive_failures}; sucessos: {healthcheckResult.consecutive_successes}.
        </p>
      ) : null}
      {triggerHealthcheck.isError ? (
        <p className="mb-4 text-sm text-red-700" aria-live="polite">Falha na verificação: {triggerHealthcheck.error.message}</p>
      ) : null}
      <Panel title="Lista de destinos">
        <div className="mb-4 flex justify-end">
          <button
            className="button-primary"
            onClick={() => {
              setEditingDestination(null);
              setDestinationFormOpen(true);
            }}
            type="button"
          >

            Criar destino
          </button>
        </div>
        <DataTable columns={columns} data={destinations.data?.items ?? []} />
      </Panel>
      <Modal
        onClose={() => {
          setDestinationFormOpen(false);
          setEditingDestination(null);
        }}
        open={destinationFormOpen}
        title={editingDestination ? "Editar destino" : "Criar destino"}
      >
        <DestinationForm
          initial={editingDestination}
          key={editingDestination?.id ?? "new-destination"}
          onSubmit={(data) => {
            if (editingDestination) {
              updateDestination.mutate(data);
              return;
            }
            createDestination.mutate(data);
          }}
          submitLabel={editingDestination ? "Salvar" : "Criar"}
        />
      </Modal>
    </Page>
  );
}

function DestinationForm({
  initial,
  onSubmit,
  submitLabel
}: {
  initial?: Destination | null;
  onSubmit: (data: DestinationRequest) => void;
  submitLabel: string;
}) {
  const [formError, setFormError] = useState("");
  const [schedule, setSchedule] = useState<DestinationSchedule>(
    initial?.schedule ?? { enabled: false }
  );
  const [caps, setCaps] = useState<DestinationCaps>(
    initial?.caps ?? { enabled: false }
  );
  const form = useForm<DestinationRequest>({
    defaultValues: {
      name: initial?.name ?? "",
      type: initial?.type ?? "url",
      url: initial?.url ?? "",
      healthcheck_url: initial?.healthcheck_url ?? "",
      manual_status: initial?.manual_status ?? "active",
      health_status: initial?.health_status ?? "unknown",
      redirect: { mode: initial?.redirect.mode ?? "http_302" },
      schedule: initial?.schedule ?? { enabled: false },
      caps: initial?.caps ?? { enabled: false }
    }
  });
  useEffect(
    () => {
      form.reset({
        name: initial?.name ?? "",
        type: initial?.type ?? "url",
        url: initial?.url ?? "",
        healthcheck_url: initial?.healthcheck_url ?? "",
        manual_status: initial?.manual_status ?? "active",
        health_status: initial?.health_status ?? "unknown",
        redirect: { mode: initial?.redirect.mode ?? "http_302" },
        schedule: initial?.schedule ?? { enabled: false },
        caps: initial?.caps ?? { enabled: false }
      });
      setSchedule(initial?.schedule ?? { enabled: false });
      setCaps(initial?.caps ?? { enabled: false });
      setFormError("");
    },
    [
      form,
      initial
    ]
  );
  return (
    <form
      className="space-y-3"
      onSubmit={form.handleSubmit((values) => {
        setFormError("");
        const payload = {
          ...values,
          schedule: normalizeSchedule(schedule),
          caps: normalizeCaps(caps)
        };
        try {
          destinationSchema.parse(payload);
        } catch (err) {
          setFormError(err instanceof Error ? err.message : "Destino inválido");
          return;
        }
        onSubmit(payload);
        form.reset();
      })}
    >
      {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
      <TextField label="Nome" register={form.register("name")} />
      <TextField label="URL" register={form.register("url")} />
      <TextField label="URL de verificação (opcional; obrigatória para URLs com macros ou verificações GET)" register={form.register("healthcheck_url")} />
      <SelectField label="Status manual" options={statusOptions} register={form.register("manual_status")} />
      <SelectField label="Redirecionamento" options={["http_302", "meta_refresh", "javascript", "interstitial"]} register={form.register("redirect.mode")} />
      <DestinationScheduleEditor schedule={schedule} setSchedule={setSchedule} />
      <DestinationCapsEditor caps={caps} setCaps={setCaps} />
      <button className="button-primary" type="submit">
        {submitLabel}
      </button>
    </form>
  );
}

function DestinationScheduleEditor({
  schedule,
  setSchedule
}: {
  schedule: DestinationSchedule;
  setSchedule: (schedule: DestinationSchedule) => void;
}) {
  const windows = schedule.windows ?? [];
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            checked={schedule.enabled}
            onChange={(event) => setSchedule({
              ...schedule,
              enabled: event.target.checked
            })}
            type="checkbox"
          />

          Agendamento
        </label>
        <button
          className="button-secondary"
          onClick={() => setSchedule({
            ...schedule,
            enabled: true,
            timezone: schedule.timezone || "Europe/Moscow",
            windows: [
              ...windows,
              {
                weekdays: [
                  "mon",
                  "tue",
                  "wed",
                  "thu",
                  "fri"
                ],
                start_time: "09:00",
                end_time: "18:00"
              }
            ]
          })}
          type="button"
        >

          Adicionar intervalo
        </button>
      </div>
      <FilterInput
        label="Fuso horário"
        onChange={(value) => setSchedule({
          ...schedule,
          timezone: value
        })}
        value={schedule.timezone ?? ""}
      />
      {windows.map((window, index) => (
        <div className="space-y-2 rounded-md bg-zinc-50 p-2" key={index}>
          <div className="grid grid-cols-2 gap-2">
            <FilterInput
              label="Início"
              onChange={(value) => updateScheduleWindow(
                schedule,
                setSchedule,
                index,
                { start_time: value }
              )}
              type="time"
              value={window.start_time}
            />
            <FilterInput
              label="Fim"
              onChange={(value) => updateScheduleWindow(
                schedule,
                setSchedule,
                index,
                { end_time: value }
              )}
              type="time"
              value={window.end_time}
            />
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weekdays.map((weekday) => (
              <label className="flex items-center gap-1 text-xs" key={weekday}>
                <input
                  checked={window.weekdays.includes(weekday)}
                  onChange={(event) => {
                    const nextWeekdays = event.target.checked
                      ? [
                        ...window.weekdays,
                        weekday
                      ]
                      : window.weekdays.filter((item) => item !== weekday);
                    updateScheduleWindow(
                      schedule,
                      setSchedule,
                      index,
                      { weekdays: nextWeekdays }
                    );
                  }}
                  type="checkbox"
                />
                {uiValue(weekday)}
              </label>
            ))}
          </div>
          <ActionIconButton
            ariaLabel={`Remover intervalo ${index + 1}`}
            danger
            icon="remove"
            label="Remover intervalo"
            onClick={() => setSchedule({
              ...schedule,
              windows: windows.filter((_, itemIndex) => itemIndex !== index)
            })}
          />
        </div>
      ))}
    </div>
  );
}

function DestinationCapsEditor({
  caps,
  setCaps
}: {
  caps: DestinationCaps;
  setCaps: (caps: DestinationCaps) => void;
}) {
  const rules = caps.rules ?? [];
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            checked={caps.enabled}
            onChange={(event) => setCaps({
              ...caps,
              enabled: event.target.checked
            })}
            type="checkbox"
          />

          Limites
        </label>
        <button
          className="button-secondary"
          onClick={() => setCaps({
            ...caps,
            enabled: true,
            rules: [
              ...rules,
              {
                metric: "clicks",
                window_hours: 24,
                limit: 1000
              }
            ]
          })}
          type="button"
        >

          Adicionar limite
        </button>
      </div>
      {rules.map((rule, index) => (
        <div className="grid grid-cols-[1fr_96px_96px_auto] gap-2" key={index}>
          <select
            className="input"
            onChange={(event) => updateCapRule(
              caps,
              setCaps,
              index,
              { metric: event.target.value as "clicks" | "cost" | "conversions" | "revenue" }
            )}
            value={rule.metric}
          >
            {[
              "clicks",
              "cost",
              "conversions",
              "revenue"
            ].map((metric) => (
              <option key={metric} value={metric}>
                {uiValue(metric)}
              </option>
            ))}
          </select>
          <input
            className="input"
            min={1}
            onChange={(event) => updateCapRule(
              caps,
              setCaps,
              index,
              { window_hours: Number(event.target.value) }
            )}
            type="number"
            value={rule.window_hours}
          />
          <input
            className="input"
            min={1}
            onChange={(event) => updateCapRule(
              caps,
              setCaps,
              index,
              { limit: Number(event.target.value) }
            )}
            type="number"
            value={rule.limit}
          />
          <ActionIconButton
            ariaLabel={`Remover regra de limite ${index + 1}`}
            danger
            icon="remove"
            label="Remover regra de limite"
            onClick={() => setCaps({
              ...caps,
              rules: rules.filter((_, itemIndex) => itemIndex !== index)
            })}
          />
        </div>
      ))}
    </div>
  );
}

type PostbackFormValues = {
  direction: "incoming" | "outgoing";
  name: string;
  network_id: string;
  network_name: string;
  secret: string;
  click_macro: string;
  transaction_macro: string;
  payout_macro: string;
  status_macro: string;
  currency: string;
  url: string;
  enabled: boolean;
  source_id: string;
  campaign_id: string;
};

function CopyablePostbackURL({ label, value, disabled = false }: { label: string; value: string; disabled?: boolean }) {
  const [message, setMessage] = useState("");
  useEffect(() => setMessage(""), [value]);
  return <div className="space-y-2">
    <label className="block text-sm font-medium">{label}</label>
    <textarea className="input min-h-20 w-full font-mono text-xs" readOnly value={value} aria-label={label} />
    <button type="button" className="button-secondary" disabled={!value || disabled} onClick={() => {
      void navigator.clipboard.writeText(value).then(() => setMessage("Copiado"), () => setMessage("Falha ao copiar. Selecione e copie a URL manualmente."));
    }}>Copiar URL</button>
    <span className="ml-2 text-xs text-zinc-600" aria-live="polite">{message}</span>
  </div>;
}

function PostbacksPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const [editing, setEditing] = useState<PostbackTemplate | null>(null);
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [logSearch, setLogSearch] = useState("");
  const [logFilters, setLogFilters] = useState({ from: "", to: "", id: "", order: "desc" as "asc" | "desc", limit: 100, offset: 0 });
  useEffect(() => {
    const timer = window.setTimeout(() => setLogFilters(current => ({ ...current, id: logSearch.trim(), offset: 0 })), 350);
    return () => window.clearTimeout(timer);
  }, [logSearch]);
  const validLogRange = !logFilters.from || !logFilters.to || logFilters.from <= logFilters.to;
  const logQuery = {
    ...logFilters,
    from: logFilters.from ? new Date(`${logFilters.from}T00:00:00.000Z`).toISOString() : undefined,
    to: logFilters.to ? new Date(`${logFilters.to}T23:59:59.999Z`).toISOString() : undefined
  };
  const templates = useQuery({ queryKey: ["postback-templates"], queryFn: () => api.postbackTemplates({ limit: 500 }) });
  const networks = useQuery({ queryKey: ["affiliate-networks"], queryFn: api.affiliateNetworks });
  const sources = useQuery({ queryKey: ["traffic-sources"], queryFn: () => api.trafficSources({ limit: 500 }) });
  const campaigns = useQuery({ queryKey: ["campaigns", "postback-scopes"], queryFn: () => api.campaigns({ limit: 500 }) });
  const clientConfig = useQuery({ queryKey: ["client-config"], queryFn: api.clientConfig });
  const logs = useQuery({ queryKey: ["postback-logs", logQuery], queryFn: () => api.postbackLogs(logQuery), refetchInterval: 10000, enabled: tab === "incoming" && validLogRange });
  const deliveries = useQuery({ queryKey: ["outbound-postback-jobs"], queryFn: api.outboundPostbackJobs, refetchInterval: 5000, enabled: tab === "outgoing" });
  const form = useForm<PostbackFormValues>();
  const values = form.watch();
  const defaultValues = (template: PostbackTemplate | null, direction: "incoming" | "outgoing"): PostbackFormValues => ({
    direction: template?.direction ?? direction,
    name: template?.name ?? "",
    network_id: template?.network_id ?? "",
    network_name: "",
    secret: template?.secret ?? generatePostbackSecret(),
    click_macro: template?.mapping.click_id ?? "cid",
    transaction_macro: template?.mapping.transaction_id ?? "",
    payout_macro: template?.mapping.payout ?? "sum",
    status_macro: template?.provider === "lospollos" ? "" : template?.mapping.status ?? "",
    currency: template?.mapping.currency ?? "USD",
    url: template?.url ?? "",
    enabled: template?.enabled ?? true,
    source_id: template?.source_id ?? "",
    campaign_id: template?.campaign_id ?? ""
  });
  const begin = (template: PostbackTemplate | null) => {
    setEditing(template);
    form.reset(defaultValues(template, template?.direction ?? tab));
    setFormError("");
    save.reset();
    setOpen(true);
  };
  const save = useMutation({
    mutationFn: async (data: PostbackFormValues) => {
      let networkID = data.direction === "incoming" ? data.network_id : "";
      if (data.direction === "incoming" && !networkID) {
        const existing = networks.data?.items.find(network => network.name.toLowerCase() === data.network_name.trim().toLowerCase());
        if (existing) networkID = existing.id;
        else {
          const slug = data.network_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `network-${crypto.randomUUID().slice(0, 8)}`;
          const network = await api.createAffiliateNetwork({ name: data.network_name, slug });
          networkID = network.id;
          form.setValue("network_id", networkID);
          await queryClient.invalidateQueries({ queryKey: ["affiliate-networks"] });
        }
      }
      const payload: PostbackTemplateRequest = {
        direction: data.direction,
        provider: data.direction === "incoming" ? "generic" : undefined,
        network_id: networkID,
        name: data.name.trim(),
        slug: editing?.slug ?? `postback-${crypto.randomUUID().slice(0, 8)}`,
        secret: data.direction === "incoming" ? data.secret.trim() : "",
        mapping: data.direction === "incoming" ? {
          ...editing?.mapping,
          click_id: data.click_macro.trim(),
          transaction_id: data.transaction_macro.trim() || data.click_macro.trim(),
          payout: data.payout_macro.trim(),
          currency: data.currency.trim().toUpperCase(),
          ...(data.status_macro.trim() ? { status: data.status_macro.trim() } : {})
        } : {},
        url: data.direction === "outgoing" ? data.url.trim() : "",
        enabled: data.direction === "outgoing" ? data.enabled : true,
        source_id: data.direction === "outgoing" ? data.source_id : "",
        campaign_id: data.direction === "outgoing" ? data.campaign_id : ""
      };
      if (data.direction === "incoming" && !data.status_macro.trim()) delete payload.mapping.status;
      return editing ? api.updatePostbackTemplate(editing.id, payload) : api.createPostbackTemplate(payload);
    },
    onSuccess: saved => {
      if (saved.direction === "outgoing") setOpen(false);
      else { setEditing(saved); form.reset(defaultValues(saved, "incoming")); }
      void queryClient.invalidateQueries({ queryKey: ["postback-templates"] });
    }
  });
  const remove = useMutation({ mutationFn: api.deletePostbackTemplate, onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["postback-templates"] }); } });
  const base = clientConfig.data?.postback_base_url ?? "";
  const preview = incomingPostbackURL(base, { network_id: values.network_id ?? "", secret: values.secret, mapping: { click_id: values.click_macro?.trim() ?? "cid", transaction_id: values.transaction_macro?.trim() ?? "", payout: values.payout_macro?.trim() ?? "sum", status: values.status_macro?.trim() ?? "", currency: values.currency?.trim().toUpperCase() ?? "USD" } });
  const templateColumns: ColumnDef<PostbackTemplate>[] = [
    { header: "Nome", accessorKey: "name" },
    { header: "Integração", cell: ({ row }) => row.original.direction === "outgoing" ? (row.original.enabled ? "Ativado" : "Pausado") : networks.data?.items.find(network => network.id === row.original.network_id)?.name ?? row.original.network_id },
    { header: "Abrangência", cell: ({ row }) => row.original.direction !== "outgoing" ? "Esta área de trabalho" : [sources.data?.items.find(source => source.id === row.original.source_id)?.name ?? row.original.source_id, campaigns.data?.items.find(campaign => campaign.id === row.original.campaign_id)?.name ?? row.original.campaign_id].filter(Boolean).join(" / ") || "Global (esta área de trabalho)" },
    { header: "Ações", cell: ({ row }) => <div className="flex gap-2">
      <ActionIconButton icon="edit" label="Configurar postback" onClick={() => begin(row.original)} />
      <ActionIconButton icon="delete" danger label="Excluir postback" onClick={() => { if (window.confirm(`Excluir ${row.original.name}?`)) remove.mutate(row.original.id); }} />
    </div> }
  ];
  const logColumns: ColumnDef<PostbackLogRow>[] = [
    { accessorKey: "created_at", header: () => <button type="button" className="inline-flex items-center gap-1 hover:text-zinc-900" aria-label={`Ordenar por data · ${logFilters.order === "desc" ? "mais recentes primeiro" : "mais antigos primeiro"}`} onClick={() => setLogFilters(current => ({ ...current, order: current.order === "desc" ? "asc" : "desc", offset: 0 }))}>Criado em {logFilters.order === "desc" ? "↓" : "↑"}</button>, cell: ({ row }) => <time dateTime={row.original.created_at} title={row.original.created_at}>{new Date(row.original.created_at).toLocaleString("pt-BR")}</time> },
    { header: "Postback", cell: ({ row }) => <span title={`ID da solicitação: ${row.original.postback_id}${row.original.template_id ? ` · ID da integração: ${row.original.template_id}` : ""}`}>{row.original.template_name || templates.data?.items.find(template => template.id === row.original.template_id)?.name || "Integração desconhecida"}</span> },
    { header: "Rede", cell: ({ row }) => <span title={row.original.network_id}>{networks.data?.items.find(network => network.id === row.original.network_id)?.name ?? row.original.network_id}</span> },
    { header: "Valor da conversão", cell: ({ row }) => row.original.payout == null ? "—" : <span className="whitespace-nowrap tabular-nums">{row.original.payout.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 8 })} {row.original.currency}</span> },
    { header: "Clique", accessorKey: "click_id" },
    { header: "Transação", accessorKey: "transaction_id" }, { header: "Status", cell: ({ row }) => uiValue(row.original.status) }, { header: "Erro", accessorKey: "error" }
  ];
  const deliveryColumns: ColumnDef<OutboundPostbackJob>[] = [
    { header: "Criado em", cell: ({ row }) => new Date(row.original.created_at).toLocaleString("pt-BR") },
    { header: "Postback", cell: ({ row }) => <span title={row.original.template_id}>{templates.data?.items.find(template => template.id === row.original.template_id)?.name ?? row.original.template_id}</span> },
    { header: "Clique", accessorKey: "click_id" }, { header: "Status", cell: ({ row }) => uiValue(row.original.status) },
    { header: "Tentativas", accessorKey: "attempts" }, { header: "HTTP", cell: ({ row }) => row.original.http_status || "—" }, { header: "Erro", accessorKey: "error" }
  ];
  const error = save.error || remove.error || templates.error || networks.error || clientConfig.error || (tab === "incoming" ? logs.error : deliveries.error || sources.error || campaigns.error);
  return <Page title="Postbacks">
    <p className="mb-4 text-sm text-zinc-600">Rede de afiliados → TraffoFlex → fonte de tráfego. Mantenha separados nosso ID de clique e o ID da fonte de tráfego.</p>
    <div className="mb-4 flex gap-2" role="tablist" aria-label="Direção do postback">
      <button type="button" role="tab" aria-selected={tab === "incoming"} className={tab === "incoming" ? "button-primary" : "button-secondary"} onClick={() => setTab("incoming")}>Entrada · redes de afiliados</button>
      <button type="button" role="tab" aria-selected={tab === "outgoing"} className={tab === "outgoing" ? "button-primary" : "button-secondary"} onClick={() => setTab("outgoing")}>Saída · fontes de tráfego</button>
    </div>
    {error ? <p className="mb-3 text-sm text-red-700" role="alert">{error instanceof Error ? error.message : "Não foi possível carregar os postbacks"}</p> : null}
    <Panel title={tab === "incoming" ? "Receber conversões" : "Enviar conversões"}>
      <p className="mb-3 text-sm text-zinc-600">{tab === "incoming" ? "Crie uma integração e copie sua URL de postback para as configurações da rede de afiliados." : "Envie conversões aprovadas por HTTP GET. Escolha uma fonte ou campanha, ou use Global para esta área de trabalho."}</p>
      <button type="button" className="button-primary mb-4" onClick={() => begin(null)}>Criar postback</button>
      <DataTable columns={templateColumns} data={templates.data?.items.filter(template => (template.direction ?? "incoming") === tab) ?? []} />
    </Panel>
    <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Configurar postback" : "Criar postback"}>
      <form className="space-y-4" onSubmit={form.handleSubmit(data => {
        const macroName = z.string().trim().regex(/^[a-z][a-z0-9_]*$/i);
        const optionalMacro = z.union([macroName, z.string().trim().length(0)]);
        const schema = z.object({ name: z.string().trim().min(1), secret: z.string().trim().min(1), click_macro: macroName, transaction_macro: optionalMacro, payout_macro: macroName, status_macro: optionalMacro, currency: z.string().trim().regex(/^[a-z]{3}$/i) });
        if (data.direction === "incoming" && (!schema.safeParse(data).success || (!data.network_id && !data.network_name.trim()))) { setFormError("Informe nome, rede de afiliados, segredo, código da moeda com três letras e macros válidas sem chaves."); return; }
        if (data.direction === "outgoing" && (!data.name.trim() || !data.url.trim())) { setFormError("Informe um nome e a URL de postback."); return; }
        setFormError("");
        save.mutate(data);
      })}>
        <TextField label="Nome" register={form.register("name")} />
        {values.direction === "incoming" ? <>
          <p className="text-sm text-zinc-600">Escolha uma rede de afiliados e informe as macros usadas para reportar conversões. Copie a URL gerada para as configurações de postback dessa rede.</p>
          <label className="block text-sm font-medium">Rede de afiliados<select className="input mt-1 w-full" {...form.register("network_id")}><option value="">Criar uma rede de afiliados</option>{networks.data?.items.map(network => <option key={network.id} value={network.id}>{network.name}</option>)}</select></label>
          {!values.network_id ? <TextField label="Nome da nova rede de afiliados" register={form.register("network_name")} /> : null}
          <TextField label="Segredo do postback" register={form.register("secret")} />
          <button type="button" className="button-secondary" onClick={() => form.setValue("secret", generatePostbackSecret(), { shouldDirty: true })}>Gerar segredo</button>
          <table className="w-full text-sm"><thead><tr><th className="text-left">Parâmetro</th><th className="text-left">Macro da rede de afiliados (sem chaves)</th></tr></thead><tbody>
            <tr><td>ID do clique</td><td><input className="input w-full" aria-label="Macro do ID do clique" {...form.register("click_macro")} /></td></tr>
            <tr><td>ID da transação</td><td><input className="input w-full" aria-label="Macro do ID da transação" {...form.register("transaction_macro")} /></td></tr>
            <tr><td>Valor da conversão</td><td><input className="input w-full" aria-label="Macro do valor da conversão" {...form.register("payout_macro")} /></td></tr>
            <tr><td>Status (opcional)</td><td><input className="input w-full" aria-label="Macro do status" placeholder="Vazio = aprovado" {...form.register("status_macro")} /></td></tr>
          </tbody></table>
          <TextField label="Moeda da conversão" register={form.register("currency")} />
          <p className="text-xs text-zinc-600">Para uma macro como &#123;cid&#125;, informe cid. Deixe o ID da transação vazio se a rede não tiver uma macro própria: será contada uma conversão por clique. Retornos com o mesmo ID de transação não somam receita novamente. O status vazio usa approved (aprovado).</p>
          {preview ? <CopyablePostbackURL label="URL de postback · copie para as configurações da rede de afiliados" value={preview} disabled={!editing || form.formState.isDirty} /> : <p className="text-sm text-zinc-600">Salve a integração para gerar a URL de postback.</p>}
          {preview && (!editing || form.formState.isDirty) ? <p className="text-sm text-amber-700">Salve a integração antes de copiar esta URL para que o segredo e a rede correspondam à configuração ativa.</p> : null}
          {!base ? <p className="text-sm text-red-700">O domínio público de postback está indisponível. Confira a configuração da API.</p> : null}
        </> : <>
          <label className="block text-sm font-medium">Fonte de tráfego<select className="input mt-1 w-full" {...form.register("source_id")}><option value="">Global · todas as fontes desta área de trabalho</option>{sources.data?.items.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
          <label className="block text-sm font-medium">Campanha<select className="input mt-1 w-full" {...form.register("campaign_id")}><option value="">Todas as campanhas</option>{campaigns.data?.items.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
          <TextField label="URL de postback" register={form.register("url")} />
          <p className="text-xs text-zinc-600">Exemplo: https://source.example/postback?clickid=&#123;source_click_id&#125;&amp;revenue=&#123;payout&#125;&amp;event_id=&#123;conversion_id&#125;</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...form.register("enabled")} />Ativado</label>
          <table className="w-full text-sm"><thead><tr><th className="text-left">Macro</th><th className="text-left">Valor</th></tr></thead><tbody>
            <tr><td><code>&#123;source_click_id&#125;</code></td><td>ID original do clique na fonte de tráfego. Use ao enviar informações de volta para essa fonte.</td></tr>
            <tr><td><code>&#123;click_id&#125; / &#123;cid&#125;</code></td><td>ID do clique no TraffoFlex.</td></tr>
            <tr><td><code>&#123;payout&#125; / &#123;sum&#125;</code></td><td>Valor da conversão na moeda informada.</td></tr>
            <tr><td><code>&#123;currency&#125;</code></td><td>Código da moeda.</td></tr>
            <tr><td><code>&#123;conversion_id&#125;</code></td><td>ID fixo do evento para deduplicação no destinatário.</td></tr>
            <tr><td><code>&#123;transaction_id&#125;, &#123;status&#125;, &#123;event_type&#125;, &#123;network_id&#125;</code></td><td>Detalhes da conversão.</td></tr>
            <tr><td><code>&#123;sub1&#125;…&#123;sub10&#125; / &#123;s1&#125;…&#123;s4&#125;</code></td><td>SubIDs salvos do clique.</td></tr>
          </tbody></table>
          <p className="text-sm text-zinc-600">As macros não diferenciam maiúsculas de minúsculas. Envie o identificador do clique da fonte em source_click_id na URL de rastreamento. Novas conversões aprovadas são enviadas em até cinco tentativas; conversões antigas não são reenviadas. O destinatário deve deduplicar por conversion_id ou Idempotency-Key.</p>
        </>}
        {formError || save.error ? <p role="alert" className="text-sm text-red-700">{formError || (save.error instanceof Error ? save.error.message : "Falha ao salvar")}</p> : null}
        <button className="button-primary" type="submit" disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar postback"}</button>
      </form>
    </Modal>
    {tab === "incoming" ? <Panel title="Registro de postbacks recebidos" className="mt-4">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="min-w-64 flex-1 text-sm font-medium">Buscar por ID<input className="input mt-1 w-full" type="search" placeholder="ID do postback, clique ou transação" value={logSearch} onChange={event => setLogSearch(event.target.value)} /></label>
        <label className="text-sm font-medium">De (UTC)<input className="input mt-1 block" type="date" value={logFilters.from} onChange={event => setLogFilters(current => ({ ...current, from: event.target.value, offset: 0 }))} /></label>
        <label className="text-sm font-medium">Até (UTC)<input className="input mt-1 block" type="date" value={logFilters.to} onChange={event => setLogFilters(current => ({ ...current, to: event.target.value, offset: 0 }))} /></label>
      </div>
      {!validLogRange ? <p className="mb-3 text-sm text-red-700" role="alert">A data inicial não pode ser posterior à data final.</p> : null}
      <DataTable columns={logColumns} data={logs.data?.items ?? []} />
      <div className="mt-3 flex items-center justify-between gap-3 text-sm text-zinc-600">
        <span>{logs.isFetching ? "Carregando…" : `${logs.data?.total ?? 0} postbacks`}</span>
        <div className="flex gap-2">
          <button type="button" className="button-secondary" disabled={logs.isFetching || !validLogRange || logFilters.offset === 0} onClick={() => setLogFilters(current => ({ ...current, offset: Math.max(0, current.offset - current.limit) }))}>Anterior</button>
          <button type="button" className="button-secondary" disabled={logs.isFetching || !validLogRange || logFilters.offset + logFilters.limit >= (logs.data?.total ?? 0)} onClick={() => setLogFilters(current => ({ ...current, offset: current.offset + current.limit }))}>Próximo</button>
        </div>
      </div>
    </Panel> : <Panel title="Registro de envios · últimos 100" className="mt-4">
      <p className="mb-3 text-sm text-zinc-600">Pendente → enviando → entregue. Falha indica que o destinatário não aceitou a solicitação após as tentativas ou faltam dados obrigatórios do clique.</p>
      <DataTable columns={deliveryColumns} data={deliveries.data?.items ?? []} />
    </Panel>}
  </Page>;
}

function HealthHistoryPage() {
  const [filters, setFilters] = useState({
    destination_id: "",
    current: "",
    limit: 100
  });
  const destinations = useQuery({
    queryKey: ["health-destination-lookup"],
    queryFn: () => api.destinations({ limit: 500 })
  });
  const history = useQuery({
    queryKey: [
      "health-history",
      filters
    ],
    queryFn: () => api.healthHistory(filters)
  });
  const columns = useMemo<ColumnDef<HealthHistoryRow>[]>(
    () => [
      {
        header: "Verificado em",
        cell: ({ row }) => new Date(row.original.checked_at).toLocaleString("pt-BR")
      },
      { header: "Destino", cell: ({ row }) => <span title={row.original.destination_id}>{destinations.data?.items.find(destination => destination.id === row.original.destination_id)?.name ?? row.original.destination_id}</span> },
      { header: "Anterior", cell: ({ row }) => uiValue(row.original.previous) },
      { header: "Atual", cell: ({ row }) => uiValue(row.original.current) },
      {
        header: "Erro",
        cell: ({ row }) => (
          <span className="break-words text-red-700">{row.original.error ?? ""}</span>
        )
      }
    ],
    [destinations.data]
  );

  return (
    <Page title="Histórico de disponibilidade">
      <Panel title="Alterações de disponibilidade dos destinos">
        <div className="mb-4 grid grid-cols-3 gap-3">
          <label className="grid gap-1 text-sm">Destino
            <select className="input" value={filters.destination_id} onChange={event => setFilters(current => ({ ...current, destination_id: event.target.value }))}>
              <option value="">Todos os destinos</option>
              {destinations.data?.items.map(destination => <option key={destination.id} value={destination.id}>{destination.name}</option>)}
            </select>
          </label>
          <FilterInput
            label="Atual"
            onChange={(value) => setFilters((current) => ({ ...current, current: value }))}
            value={filters.current}
          />
          <FilterInput
            label="Limite"
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                limit: Number(value) || 100
              }))
            }
            type="number"
            value={String(filters.limit)}
          />
        </div>
        <DataTable columns={columns} data={history.data?.items ?? []} />
      </Panel>
    </Page>
  );
}

function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = searchParams.toString();
  const timezone = searchParams.get("timezone") || "UTC";
  const preset = useMemo(() => {
    try { return reportPreset("7days", timezone); }
    catch { return reportPreset("7days", "UTC"); }
  }, [timezone]);
  const period = { from: searchParams.get("from") || preset.from, to: searchParams.get("to") || preset.to };
  const validPeriod = /^\d{4}-\d{2}-\d{2}$/.test(period.from) && /^\d{4}-\d{2}-\d{2}$/.test(period.to) && period.from <= period.to;
  const chosenPath = (searchParams.get("groups") || defaultReportPath.join(",")).split(",").filter(key => reportGroups.some(group => group.key === key));
  const path = [...new Set(chosenPath)].slice(0, 3) as ReportGroup[];
  if (!path.length) path.push("campaign");
  const trail = path.flatMap(key => {
    const item = reportGroups.find(group => group.key === key)!;
    const value = searchParams.get(`drill_${item.field}`);
    return value === null ? [] : [{ ...item, value }];
  });
  const level = Math.min(trail.length, path.length - 1);
  const currentGroup = reportGroups.find(group => group.key === path[level])!;
  const eventMode = ["trafficback", "health"].includes(searchParams.get("event") || "") ? searchParams.get("event")! : "";
  const limit = Number(searchParams.get("limit") || 100);
  const offset = Number(searchParams.get("offset") || 0);
  const sort = searchParams.get("sort") || "clicks";
  const order = searchParams.get("order") || "desc";
  const [search, setSearch] = useState("");
  const [chartMode, setChartMode] = useState<"money" | "volume" | "efficiency">("money");

  function updateURL(values: Record<string, string | null>, clearTrail = false) {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      if (clearTrail) reportGroups.forEach(group => next.delete(`drill_${group.field}`));
      Object.entries(values).forEach(([key, value]) => value === null ? next.delete(key) : next.set(key, value));
      if (!("offset" in values)) next.delete("offset");
      return next;
    });
  }

  const selectedFilters: Record<string, string> = {};
  for (const group of reportGroups) {
    const value = searchParams.get(group.field);
    if (value) selectedFilters[group.field] = value;
  }
  const segmentFilters: Record<string, string | number | undefined> = { ...selectedFilters, from: period.from, to: period.to, timezone };
  const emptyFields: string[] = [];
  for (const item of trail) {
    if (item.value === "") emptyFields.push(item.field);
    else segmentFilters[item.field] = item.value;
  }
  if (emptyFields.length) segmentFilters.empty = emptyFields.join(",");
  const tableFilters = { ...segmentFilters, sort, order, limit, offset, profit: searchParams.get("profit") || undefined, min_clicks: Number(searchParams.get("min_clicks") || 0) };
  const campaigns = useQuery({ queryKey: ["report-campaign-lookup"], queryFn: () => api.campaigns({ limit: 500 }) });
  const destinations = useQuery({ queryKey: ["report-destination-lookup"], queryFn: () => api.destinations({ limit: 500 }) });
  const sources = useQuery({ queryKey: ["report-source-lookup"], queryFn: () => api.trafficSources({ limit: 500 }) });
  const streams = useQuery({
    queryKey: ["report-stream-lookup", campaigns.data?.items.map(campaign => campaign.id).join(",") || ""],
    enabled: Boolean(campaigns.data),
    queryFn: async () => (await Promise.all((campaigns.data?.items ?? []).map(campaign => api.streams(campaign.id, { limit: 500 })))).flatMap(result => result.items)
  });
  const catalogs: Record<string, { id: string; name: string }[]> = {
    campaign_id: campaigns.data?.items ?? [], stream_id: streams.data ?? [], destination_id: destinations.data?.items ?? [], source_id: sources.data?.items ?? []
  };
  function displayValue(field: string, value: string) {
    return value === "" ? "Desconhecido" : catalogs[field]?.find(item => item.id === value)?.name || value;
  }
  const report = useQuery({
    queryKey: ["report-explorer", eventMode || currentGroup.key, tableFilters],
    enabled: validPeriod,
    queryFn: () => eventMode ? api.report(eventMode, segmentFilters) : api.groupedReport(currentGroup.key, tableFilters)
  });
  const overview = useQuery({ queryKey: ["report-overview", segmentFilters], enabled: validPeriod && !eventMode, queryFn: () => api.overview(segmentFilters) });
  const daily = useQuery({ queryKey: ["report-daily", segmentFilters], enabled: validPeriod && !eventMode, queryFn: () => api.dailyReport(segmentFilters) });
  const dataRows = useMemo(() => (report.data?.rows ?? []).map(row => ({
    ...row, name: eventMode ? humanizeID(row.name || row.id) : displayValue(currentGroup.field, row.id)
  })), [report.data, currentGroup.field, eventMode, campaigns.data, streams.data, destinations.data, sources.data]);
  const rows = useMemo(() => dataRows.filter(row => row.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [dataRows, search]);
  const total = report.data?.total ?? dataRows.length;

  const filterForm = useForm<Record<string, string>>({ defaultValues: { ...selectedFilters, ...period, timezone, profit: searchParams.get("profit") || "", min_clicks: searchParams.get("min_clicks") || "" } });
  useEffect(() => {
    const values: Record<string, string> = { from: period.from, to: period.to, timezone, profit: searchParams.get("profit") || "", min_clicks: searchParams.get("min_clicks") || "" };
    reportGroups.forEach(group => { values[group.field] = searchParams.get(group.field) || ""; });
    filterForm.reset(values);
  }, [urlState]);
  function applyFilters(values: Record<string, string>) {
    const validation = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).refine(value => value.from <= value.to).safeParse(values);
    if (!validation.success) { filterForm.setError("to", { message: "Escolha um período válido; a data inicial deve ser anterior ou igual à final." }); return; }
    if (values.stream_id && values.campaign_id && !streams.data?.some(stream => stream.id === values.stream_id && stream.campaign_id === values.campaign_id)) values.stream_id = "";
    const updates: Record<string, string | null> = { from: values.from, to: values.to, timezone: values.timezone, profit: values.profit || null, min_clicks: values.min_clicks || null };
    reportGroups.forEach(group => { updates[group.field] = values[group.field]?.trim() || null; });
    updateURL(updates, true);
  }
  function drill(row: ReportRow) {
    setSearch("");
    if (level < path.length - 1) updateURL({ [`drill_${currentGroup.field}`]: row.id });
    else if (row.id !== "") updateURL({ [currentGroup.field]: row.id });
    else updateURL({ [`drill_${currentGroup.field}`]: "" });
  }
  function selectPath(index: number, key: string) {
    const next = [...path];
    if (key) {
      const existing = next.indexOf(key as ReportGroup);
      if (existing >= 0 && existing !== index) next[existing] = next[index];
      next[index] = key as ReportGroup;
    }
    else next.splice(index);
    updateURL({ groups: [...new Set(next)].join(","), event: null }, true);
  }
  function setEvent(mode: string) {
    const updates: Record<string, string | null> = { event: mode || null };
    if (mode) reportGroups.filter(group => !(mode === "health" ? ["destination_id"] : ["campaign_id", "stream_id", "destination_id"]).includes(group.field)).forEach(group => { updates[group.field] = null; });
    updateURL(updates, true);
  }
  const money = (value: number) => `$${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
  const ratio = (top: number, bottom: number, multiplier = 1) => bottom ? top / bottom * multiplier : 0;
  const heading = (label: string, key: string) => () => <button type="button" className="whitespace-nowrap hover:text-zinc-950" aria-label={`Ordenar por ${label}`} onClick={() => updateURL({ sort: key, order: sort === key && order === "desc" ? "asc" : "desc" })}>{label} {sort === key ? (order === "desc" ? "↓" : "↑") : ""}</button>;
  const columns: ColumnDef<ReportRow>[] = eventMode ? [
    { header: eventMode === "health" ? "Status" : "Motivo", accessorKey: "name" },
    { header: "Eventos", cell: ({ row }) => formatInteger(row.original.metrics.events ?? 0) }
  ] : [
    { id: "name", header: heading(currentGroup.label, "name"), cell: ({ row }) => <button type="button" className="text-left font-medium text-indigo-700 hover:underline" title={`Filtrar ${currentGroup.label}: ${row.original.name}${level < path.length - 1 ? ` → ${reportGroups.find(group => group.key === path[level + 1])?.label}` : ""}`} onClick={() => drill(row.original)}>{row.original.name} <span aria-hidden="true">›</span></button> },
    { id: "clicks", header: heading("Cliques", "clicks"), cell: ({ row }) => formatInteger(row.original.metrics.clicks) },
    { id: "conversions", header: heading("Conversões", "conversions"), cell: ({ row }) => formatInteger(row.original.metrics.conversions) },
    { id: "cr", header: heading("CR", "cr"), cell: ({ row }) => `${formatFixed(ratio(row.original.metrics.conversions, row.original.metrics.clicks, 100))}%` },
    { id: "revenue", header: heading("Receita", "revenue"), cell: ({ row }) => money(row.original.metrics.revenue) },
    { id: "cost", header: heading("Custo", "cost"), cell: ({ row }) => money(row.original.metrics.cost) },
    { id: "profit", header: heading("Lucro", "profit"), cell: ({ row }) => <span className={row.original.metrics.profit >= 0 ? "text-emerald-700" : "text-red-700"}>{money(row.original.metrics.profit)}</span> },
    { id: "roi", header: heading("ROI", "roi"), cell: ({ row }) => <span className={row.original.metrics.roi >= 0 ? "text-emerald-700" : "text-red-700"}>{formatFixed(row.original.metrics.roi)}%</span> },
    { id: "cpc", header: heading("CPC", "cpc"), cell: ({ row }) => row.original.metrics.clicks ? money(ratio(row.original.metrics.cost, row.original.metrics.clicks)) : "—" },
    { id: "epc", header: heading("EPC", "epc"), cell: ({ row }) => row.original.metrics.clicks ? money(ratio(row.original.metrics.revenue, row.original.metrics.clicks)) : "—" },
    { id: "cpa", header: heading("CPA", "cpa"), cell: ({ row }) => row.original.metrics.conversions ? money(ratio(row.original.metrics.cost, row.original.metrics.conversions)) : "—" }
  ];
  const error = report.error || overview.error || daily.error || campaigns.error || streams.error || destinations.error || sources.error;
  return <Page title="Relatórios">
    <Panel title="Filtros">
      <form onSubmit={filterForm.handleSubmit(applyFilters)} className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">De<input className="input mt-1" type="date" {...filterForm.register("from")} /></label>
          <label className="text-sm font-medium">Até<input className="input mt-1" type="date" {...filterForm.register("to")} /></label>
          <label className="text-sm font-medium">Fuso horário<select className="input mt-1" {...filterForm.register("timezone")}>{reportTimezones.map(zone => <option key={zone}>{zone}</option>)}</select></label>
          {[["today", "Hoje"], ["yesterday", "Ontem"], ["7days", "Últimos 7 dias"], ["30days", "Últimos 30 dias"]].map(([key, label]) => <button key={key} type="button" className="button-secondary" onClick={() => { const range = reportPreset(key, filterForm.getValues("timezone")); filterForm.setValue("from", range.from); filterForm.setValue("to", range.to); void filterForm.handleSubmit(applyFilters)(); }}>{label}</button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {reportGroups.filter(group => group.field in catalogs && (!eventMode || (eventMode === "health" ? group.field === "destination_id" : group.field !== "source_id"))).map(group => <label key={group.field} className="text-sm font-medium">{group.label}<select className="input mt-1" {...filterForm.register(group.field)}><option value="">Todos</option>{selectedFilters[group.field] && !catalogs[group.field].some(item => item.id === selectedFilters[group.field]) ? <option value={selectedFilters[group.field]}>{selectedFilters[group.field]}</option> : null}{catalogs[group.field].filter(item => group.field !== "stream_id" || !filterForm.watch("campaign_id") || (item as Stream).campaign_id === filterForm.watch("campaign_id")).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}
        </div>
        {!eventMode ? <details className="rounded-md border border-zinc-200 p-3"><summary className="cursor-pointer text-sm font-medium">Localização, dispositivos e posicionamentos</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{reportGroups.filter(group => !(group.field in catalogs)).map(group => <label key={group.field} className="text-sm font-medium">{group.label}<input className="input mt-1" placeholder={`Qualquer ${group.label.toLowerCase()}`} {...filterForm.register(group.field)} /></label>)}</div></details> : null}
        <div className="flex items-center gap-3"><button className="button-primary" type="submit">Aplicar filtros</button><button className="button-secondary" type="button" onClick={() => { setSearchParams({ groups: path.join(",") }); setSearch(""); }}>Limpar filtros</button><span role="alert" className="text-sm text-red-700">{filterForm.formState.errors.to?.message || (!validPeriod ? "Período inválido" : "")}</span></div>
      </form>
    </Panel>
    <div className="my-4 flex flex-wrap gap-2" aria-label="Filtros ativos">
      {Object.entries(selectedFilters).map(([field, value]) => <button type="button" key={field} className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-sm" onClick={() => updateURL({ [field]: null })}>{reportGroups.find(group => group.field === field)?.label}: {displayValue(field, value)} ×</button>)}
    </div>
    {error ? <p role="alert" className="mb-4 text-sm text-red-700">{error instanceof Error ? error.message : "Não foi possível carregar o relatório"}</p> : null}
    {eventMode ? <p className="my-4 text-lg font-medium">{formatInteger(report.data?.summary.events ?? 0)} eventos</p> : <MetricGrid metrics={overview.data} />}
    <Panel title="Agrupamento e detalhamento" className="mt-6">
      <div className="flex flex-wrap items-end gap-3">
        {[0, 1, 2].map(index => <label key={index} className="text-sm font-medium">{index === 0 ? "Agrupar por" : "Depois por"}<select className="input mt-1" disabled={Boolean(eventMode) || index > path.length} aria-label={index === 0 ? "Agrupar por" : `Depois por ${index}`} value={path[index] || ""} onChange={event => selectPath(index, event.target.value)}>{index > 0 ? <option value="">Nenhum</option> : null}{reportGroups.map(group => <option key={group.key} value={group.key}>{group.label}</option>)}</select></label>)}
        <label className="ml-auto text-sm font-medium">Tipo de relatório<select className="input mt-1" value={eventMode} onChange={event => setEvent(event.target.value)}><option value="">Tráfego e conversões</option><option value="trafficback">Eventos de retorno de tráfego</option><option value="health">Eventos de disponibilidade</option></select></label>
      </div>
      {!eventMode ? <>
        <nav aria-label="Caminho do detalhamento" className="mt-4 flex flex-wrap items-center gap-2 text-sm"><button type="button" className="text-indigo-700 hover:underline" onClick={() => updateURL({}, true)}>Todos os grupos</button>{trail.map((item, index) => <React.Fragment key={item.field}><span>›</span><button type="button" className="rounded-md bg-indigo-50 px-2 py-1 text-indigo-800" onClick={() => { const updates: Record<string, null> = {}; trail.slice(index + 1).forEach(later => { updates[`drill_${later.field}`] = null; }); updateURL(updates); }}>{item.label}: {displayValue(item.field, item.value)}</button><button type="button" aria-label={`Remover detalhamento de ${item.label}`} className="text-zinc-500" onClick={() => { const updates: Record<string, null> = {}; trail.slice(index).forEach(later => { updates[`drill_${later.field}`] = null; }); updateURL(updates); }}>×</button></React.Fragment>)}</nav>
        <p className="mt-2 text-sm text-zinc-600">Clique em uma linha para filtrar este segmento{level < path.length - 1 ? ` e agrupar por ${reportGroups.find(group => group.key === path[level + 1])?.label.toLowerCase()}` : ""}.</p>
      </> : null}
    </Panel>
    <Panel title={eventMode ? "Eventos" : `Por ${currentGroup.label.toLowerCase()}`} className="mt-6">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">Buscar nesta página<input type="search" className="input mt-1" value={search} onChange={event => setSearch(event.target.value)} /></label>
        {!eventMode ? <><label className="text-sm font-medium">Linhas<select className="input mt-1" value={searchParams.get("profit") || ""} onChange={event => updateURL({ profit: event.target.value || null })}><option value="">Todos os resultados</option><option value="positive">Com lucro</option><option value="negative">Com prejuízo</option></select></label><label className="text-sm font-medium">Mínimo de cliques<input type="number" min="0" step="1" className="input mt-1 w-36" value={searchParams.get("min_clicks") || ""} onChange={event => updateURL({ min_clicks: event.target.value || null })} /></label></> : null}
        <button type="button" className="button-secondary ml-auto" disabled={report.isFetching || !validPeriod} onClick={() => { void report.refetch(); if (!eventMode) { void overview.refetch(); void daily.refetch(); } }}>Atualizar</button>
      </div>
      {report.isFetching ? <p role="status" className="mb-3 text-sm text-zinc-500">Carregando relatório…</p> : null}
      <div className="overflow-x-auto"><DataTable columns={columns} data={rows} /></div>
      {!report.isPending && rows.length === 0 ? <p className="py-8 text-center text-sm text-zinc-500">Nenhum resultado para estes filtros.</p> : null}
      {!eventMode ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>{total ? `${offset + 1}–${Math.min(offset + limit, total)} de ${total}` : "0 resultados"}  · Linhas correspondentes: receita {money(report.data?.summary.revenue ?? 0)}, custo {money(report.data?.summary.cost ?? 0)}, lucro {money(report.data?.summary.profit ?? 0)}</span>
        <div className="flex items-center gap-2"><label>Por página <select className="rounded border border-zinc-300 p-1" aria-label="Linhas por página" value={limit} onChange={event => updateURL({ limit: event.target.value })}>{[25, 50, 100, 250, 500].map(size => <option key={size}>{size}</option>)}</select></label><button className="button-secondary" type="button" disabled={offset === 0 || report.isFetching} onClick={() => updateURL({ offset: String(Math.max(0, offset - limit)) })}>Anterior</button><button className="button-secondary" type="button" disabled={offset + limit >= total || report.isFetching} onClick={() => updateURL({ offset: String(offset + limit) })}>Próximo</button></div>
      </div> : null}
    </Panel>
    {!eventMode ? <Panel title="Evolução diária deste segmento" className="mt-6">
      <div className="mb-4 flex gap-2">{(["money", "volume", "efficiency"] as const).map(mode => <button className={chartMode === mode ? "button-primary" : "button-secondary"} type="button" key={mode} onClick={() => setChartMode(mode)}>{uiValue(mode)}</button>)}</div>
      <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={daily.data?.rows ?? []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip />{chartMode === "money" ? <><Bar dataKey="metrics.revenue" fill="#0f766e" name="Receita" /><Bar dataKey="metrics.cost" fill="#f97316" name="Custo" /><Bar dataKey="metrics.profit" fill="#16a34a" name="Lucro" /></> : chartMode === "volume" ? <><Bar dataKey="metrics.clicks" fill="#2563eb" name="Cliques" /><Bar dataKey="metrics.conversions" fill="#16a34a" name="Conversões" /></> : <Bar dataKey="metrics.roi" fill="#7c3aed" name="ROI" />}</BarChart></ResponsiveContainer></div>
    </Panel> : null}
  </Page>;
}

function IngestionPage() {
  const errors = useQuery({
    queryKey: ["ingestion-errors"],
    queryFn: api.ingestionErrors
  });
  const columns = useMemo<ColumnDef<IngestionErrorRow>[]>(
    () => [
      {
        header: "Registrado em",
        cell: ({ row }) => new Date(row.original.observed_at).toLocaleString("pt-BR")
      },
      { header: "Tópico", accessorKey: "topic" },
      {
        header: "Erro",
        cell: ({ row }) => (
          <span className="break-words text-red-700">{row.original.error}</span>
        )
      },
      {
        header: "Mensagem bruta",
        cell: ({ row }) => (
          <code className="block max-w-xl break-words text-xs text-zinc-600">
            {row.original.raw_message}
          </code>
        )
      }
    ],
    []
  );

  return (
    <Page title="Entrada de dados">
      <Panel title="Erros na entrada de dados do Kafka">
        <DataTable columns={columns} data={errors.data?.rows ?? []} />
      </Panel>
    </Page>
  );
}

function MetricGrid({ metrics }: { metrics?: Metrics }) {
  const items: Array<[string, MetricKey, number]> = [
    [
      "Cliques",
      "clicks",
      metrics?.clicks ?? 0
    ],
    [
      "Conversões",
      "conversions",
      metrics?.conversions ?? 0
    ],
    [
      "Receita",
      "revenue",
      metrics?.revenue ?? 0
    ],
    [
      "Custo",
      "cost",
      metrics?.cost ?? 0
    ],
    [
      "Lucro",
      "profit",
      metrics?.profit ?? 0
    ],
    [
      "ROI",
      "roi",
      metrics?.roi ?? 0
    ]
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {items.map(([label, key, value]) => (
        <div className="rounded-md border border-zinc-200 bg-white p-4" key={label}>
          <div className="text-xs uppercase text-zinc-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold">
            {formatMetricValue(
              key,
              value
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

type ActionIcon = "workspace" | "approve" | "streams" | "report" | "edit" | "check" | "delete" | "remove" | "archive" | "restore" | "close" | "copy" | "link";

function ActionIconGraphic({ icon }: { icon: ActionIcon }) {
  const shapes: Record<ActionIcon, React.ReactNode> = {
    workspace: <><path d="M14 3h7v18h-7" /><path d="m10 8 4 4-4 4M14 12H3" /></>,
    approve: <path d="m4 12 5 5L20 6" />,
    streams: <><rect x="4" y="4" width="16" height="4" rx="1" /><rect x="4" y="10" width="16" height="4" rx="1" /><rect x="4" y="16" width="16" height="4" rx="1" /></>,
    report: <><path d="M4 20V4M4 20h16M8 16v-4M13 16V8M18 16V6" /></>,
    edit: <><path d="m4 20 4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z" /><path d="m14.5 7.5 3 3" /></>,
    check: <><path d="M3 12h4l3-7 4 14 3-7h4" /></>,
    delete: <><path d="M4 7h16M10 3h4M6 7l1 14h10l1-14M10 11v6M14 11v6" /></>,
    remove: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>,
    archive: <><path d="M4 7h16v13H4V7ZM3 4h18v3H3V4ZM12 10v7m-3-3 3 3 3-3" /></>,
    restore: <><path d="M4 7h16v13H4V7ZM3 4h18v3H3V4ZM12 17v-7m-3 3 3-3 3 3" /></>,
    close: <path d="M5 5l14 14M19 5 5 19" />,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" /></>
  };
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      {shapes[icon]}
    </svg>
  );
}

function ActionIconButton({
  icon,
  label,
  ariaLabel = label,
  onClick,
  danger = false,
  disabled = false,
  tooltipBelow = false
}: {
  icon: ActionIcon;
  label: string;
  ariaLabel?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  tooltipBelow?: boolean;
}) {
  const tooltipId = useId();
  return (
    <span className="group relative inline-flex">
      <button
        aria-describedby={tooltipId}
        aria-label={ariaLabel}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          danger
            ? "border-red-200 text-red-700 hover:bg-red-50 focus-visible:ring-red-600"
            : "border-zinc-200 text-zinc-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-blue-600"
        }`}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        <ActionIconGraphic icon={icon} />
      </button>
      <span
        className={`pointer-events-none invisible absolute left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${
          tooltipBelow ? "top-full mt-2" : "bottom-full mb-2"
        }`}
        id={tooltipId}
        role="tooltip"
      >
        {label}
      </span>
    </span>
  );
}

function DataTable<T>({ columns, data }: { columns: ColumnDef<T>[]; data: T[] }) {
  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel()
  });
  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr className="border-b border-zinc-200" key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <th className="px-3 py-2 font-medium text-zinc-600" key={header.id}>
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext()
                )}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr className="border-b border-zinc-100 last:border-b-0" key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td className="px-3 py-3 align-top" key={cell.id}>
                {flexRender(
                  cell.column.columnDef.cell,
                  cell.getContext()
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Panel({
  title,
  children,
  className = ""
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-md border border-zinc-200 bg-white p-4 ${className}`}>
      <h2 className="mb-4 text-sm font-semibold uppercase text-zinc-500">{title}</h2>
      {children}
    </section>
  );
}

function Modal({
  children,
  onClose,
  open,
  title
}: {
  children: React.ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  useEffect(
    () => {
      if (open) {
        setMounted(true);
        const timer = window.setTimeout(
          () => setVisible(true),
          24
        );
        return () => window.clearTimeout(timer);
      }
      setVisible(false);
      const timer = window.setTimeout(
        () => setMounted(false),
        220
      );
      return () => window.clearTimeout(timer);
    },
    [open]
  );
  if (!mounted) {
    return null;
  }
  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-950/40 px-4 py-8 transition-opacity duration-300 ease-out ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className={`w-full max-w-4xl rounded-md bg-white shadow-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-6 scale-[0.96] opacity-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
          <ActionIconButton
            icon="close"
            label="Fechar"
            onClick={onClose}
            tooltipBelow
          />
        </div>
        <div className="max-h-[calc(100vh-10rem)] overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  register,
  type = "text"
}: {
  label: string;
  register: ReturnType<typeof useForm>["register"] extends (name: infer Name) => infer Registration
    ? Registration
    : never;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input className="input mt-1" type={type} {...register} />
    </label>
  );
}

function SelectField({
  label,
  options,
  register
}: {
  label: string;
  options: string[];
  register: ReturnType<typeof useForm>["register"] extends (name: infer Name) => infer Registration
    ? Registration
    : never;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select className="input mt-1" {...register}>
        {options.map((option) => (
          <option key={option} value={option}>
            {uiValue(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterInput({
  label,
  onChange,
  type = "text",
  value
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        className="input mt-1"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function defaultTargets(destinations: Destination[]) {
  if (destinations.length === 0) {
    return [];
  }
  return [
    {
      destination_id: destinations[0].id,
      weight: 100
    }
  ];
}

function normalizedTargets(targets: StreamRequest["distribution"]["destinations"]) {
  return targets
    .filter((target) => target.destination_id.trim() !== "")
    .map((target) => ({
      destination_id: target.destination_id,
      weight: Number(target.weight)
    }));
}

function normalizedConditions(conditions: StreamRequest["conditions"]) {
  return conditions
    .filter((condition) => condition.field.trim() !== "")
    .map((condition) => {
      if (condition.operator === "exists" || condition.operator === "not_exists") {
        return {
          field: condition.field,
          operator: condition.operator
        };
      }
      if (condition.operator === "in" || condition.operator === "not_in") {
        return {
          field: condition.field,
          operator: condition.operator,
          values: splitCSV(condition.values?.join(",") ?? condition.value ?? "")
        };
      }
      return {
        field: condition.field,
        operator: condition.operator,
        value: condition.value ?? condition.values?.join(",") ?? ""
      };
    });
}

function normalizedUniquePolicy(
  policy: StreamRequest["distribution"]["unique_policy"],
  enabled: boolean
) {
  if (!enabled) {
    return { enabled: false };
  }
  return {
    enabled: true,
    user_key: policy?.user_key ?? "source_click_id",
    history_window_hours: Number(policy?.history_window_hours ?? 168),
    exhausted_mode: policy?.exhausted_mode ?? "allow_repeat",
    selection_strategy: policy?.selection_strategy ?? "best_roi",
    roi_window_hours: Number(policy?.roi_window_hours ?? 24),
    min_clicks: Number(policy?.min_clicks ?? 100),
    fallback_strategy: policy?.fallback_strategy ?? "round_robin"
  };
}

function splitCSV(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function updateCondition(
  conditions: StreamRequest["conditions"],
  setConditions: (conditions: StreamRequest["conditions"]) => void,
  index: number,
  patch: Partial<StreamRequest["conditions"][number]>
) {
  setConditions(conditions.map((condition, itemIndex) => {
    if (itemIndex !== index) {
      return condition;
    }
    const next = {
      ...condition,
      ...patch
    };
    if (patch.value !== undefined) {
      if (next.operator === "in" || next.operator === "not_in") {
        next.values = splitCSV(patch.value);
        next.value = undefined;
      } else {
        next.value = patch.value;
        next.values = undefined;
      }
    }
    if (patch.operator !== undefined) {
      if (patch.operator === "exists" || patch.operator === "not_exists") {
        next.value = undefined;
        next.values = undefined;
      } else if (patch.operator === "in" || patch.operator === "not_in") {
        next.values = splitCSV(next.value ?? next.values?.join(",") ?? "");
        next.value = undefined;
      } else {
        next.value = next.value ?? next.values?.join(",") ?? "";
        next.values = undefined;
      }
    }
    return next;
  }));
}

function updateTarget(
  targets: StreamRequest["distribution"]["destinations"],
  setTargets: (targets: StreamRequest["distribution"]["destinations"]) => void,
  index: number,
  patch: Partial<StreamRequest["distribution"]["destinations"][number]>
) {
  setTargets(targets.map((target, itemIndex) => {
    if (itemIndex !== index) {
      return target;
    }
    return {
      ...target,
      ...patch
    };
  }));
}

function normalizeSchedule(schedule: DestinationSchedule): DestinationSchedule {
  if (!schedule.enabled) {
    return { enabled: false };
  }
  return {
    enabled: true,
    timezone: schedule.timezone || "Europe/Moscow",
    windows: (schedule.windows ?? []).filter((window) => window.weekdays.length > 0)
  };
}

function updateScheduleWindow(
  schedule: DestinationSchedule,
  setSchedule: (schedule: DestinationSchedule) => void,
  index: number,
  patch: Partial<NonNullable<DestinationSchedule["windows"]>[number]>
) {
  const windows = schedule.windows ?? [];
  setSchedule({
    ...schedule,
    windows: windows.map((window, itemIndex) => {
      if (itemIndex !== index) {
        return window;
      }
      return {
        ...window,
        ...patch
      };
    })
  });
}

function normalizeCaps(caps: DestinationCaps): DestinationCaps {
  if (!caps.enabled) {
    return { enabled: false };
  }
  return {
    enabled: true,
    rules: (caps.rules ?? []).map((rule) => ({
      metric: rule.metric,
      window_hours: Number(rule.window_hours),
      limit: Number(rule.limit)
    }))
  };
}

function updateCapRule(
  caps: DestinationCaps,
  setCaps: (caps: DestinationCaps) => void,
  index: number,
  patch: Partial<NonNullable<DestinationCaps["rules"]>[number]>
) {
  const rules = caps.rules ?? [];
  setCaps({
    ...caps,
    rules: rules.map((rule, itemIndex) => {
      if (itemIndex !== index) {
        return rule;
      }
      return {
        ...rule,
        ...patch
      };
    })
  });
}

const campaignSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(3),
  status: z.enum([
    "active",
    "paused",
    "archived"
  ]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  pricing_model: z.enum(["cpc", "cpm"]),
  trafficback_config: z.object({
    enabled: z.boolean(),
    url: z.string(),
    max_depth: z.number()
  }).refine(
    (config) => !config.enabled || /^https?:\/\/[^\s/?#@]+(?:[/?#]|$)/i.test(config.url.trim()),
    "A URL de retorno deve ser um endereço completo HTTP ou HTTPS"
  ).refine(
    (config) => !config.enabled || (Number.isInteger(config.max_depth) && config.max_depth >= 1 && config.max_depth <= 10),
    "O máximo de retornos de tráfego deve estar entre 1 e 10"
  )
}).refine(
  (campaign) => campaign.status !== "active" || campaign.trafficback_config.enabled,
  "Uma campanha ativa exige uma URL de retorno de tráfego"
);

const streamSchema = z.object({
  name: z.string().min(1),
  priority: z.number().min(0),
  status: z.enum([
    "active",
    "paused",
    "archived"
  ]),
  conditions: z.array(z.object({
    field: z.string().min(1),
    operator: z.enum([
      "eq",
      "neq",
      "in",
      "not_in",
      "contains",
      "not_contains",
      "starts_with",
      "ends_with",
      "gt",
      "gte",
      "lt",
      "lte",
      "exists",
      "not_exists",
      "regex"
    ]),
    value: z.string().optional(),
    values: z.array(z.string()).optional()
  })),
  distribution: z.object({
    mode: z.enum([
      "direct",
      "weighted",
      "fallback",
      "waterfall",
      "round_robin",
      "best_roi"
    ]),
    destinations: z.array(z.object({
      destination_id: z.string().min(1),
      weight: z.number().positive()
    })).min(1),
    unique_policy: z.object({
      enabled: z.boolean(),
      user_key: z.string().optional(),
      history_window_hours: z.number().positive().optional(),
      exhausted_mode: z.enum([
        "allow_repeat",
        "no_destination"
      ]).optional(),
      selection_strategy: z.enum([
        "waterfall",
        "round_robin",
        "best_roi"
      ]).optional(),
      roi_window_hours: z.number().positive().optional(),
      min_clicks: z.number().min(0).optional(),
      fallback_strategy: z.enum([
        "waterfall",
        "round_robin",
        "weighted"
      ]).optional()
    }).optional()
  })
});

const destinationSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  url: z.string().url(),
  healthcheck_url: z.string().optional().refine(
    (value) => !value || (/^https?:\/\//i.test(value) && !/[{}]/.test(value)),
    "A URL de verificação deve usar HTTP(S) e não conter macros"
  ),
  manual_status: z.enum([
    "active",
    "paused",
    "archived"
  ]),
  health_status: z.enum([
    "healthy",
    "degraded",
    "unhealthy",
    "unknown"
  ]),
  redirect: z.object({
    mode: z.enum([
      "http_302",
      "meta_refresh",
      "javascript",
      "interstitial"
    ])
  }),
  schedule: z.object({
    enabled: z.boolean(),
    timezone: z.string().optional(),
    windows: z.array(z.object({
      weekdays: z.array(z.enum([
        "mon",
        "tue",
        "wed",
        "thu",
        "fri",
        "sat",
        "sun"
      ])),
      start_time: z.string(),
      end_time: z.string()
    })).optional()
  }),
  caps: z.object({
    enabled: z.boolean(),
    rules: z.array(z.object({
      metric: z.enum([
        "clicks",
        "cost",
        "conversions",
        "revenue"
      ]),
      window_hours: z.number().positive(),
      limit: z.number().positive()
    })).optional()
  })
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
