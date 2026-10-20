// Display labels only: API values, routes and tracking macros remain unchanged.
const labels: Record<string, string> = {
 money: "Valores", volume: "Volume", efficiency: "Eficiência",
 active: "Ativo", paused: "Pausado", archived: "Arquivado", healthy: "Disponível",
 degraded: "Instável", unhealthy: "Indisponível", unknown: "Desconhecido",
 admin: "Administrador", user: "Usuário", pending_approval: "Aguardando aprovação",
 pending: "Pendente", sending: "Enviando", delivered: "Entregue", failed: "Falhou",
 approved: "Aprovado", rejected: "Rejeitado", direct: "Direto", weighted: "Por peso",
 fallback: "Alternativo", waterfall: "Em sequência", round_robin: "Alternado",
 best_roi: "Melhor ROI", allow_repeat: "Permitir repetição", no_destination: "Sem destino",
 http_302: "HTTP 302", meta_refresh: "Atualização por meta tag", javascript: "JavaScript",
 interstitial: "Página intermediária", clicks: "Cliques", cost: "Custo", conversions: "Conversões",
 revenue: "Receita", eq: "Igual a", neq: "Diferente de", in: "Está na lista",
 not_in: "Não está na lista", contains: "Contém", not_contains: "Não contém",
 starts_with: "Começa com", ends_with: "Termina com", gt: "Maior que",
 gte: "Maior ou igual a", lt: "Menor que", lte: "Menor ou igual a",
 exists: "Existe", not_exists: "Não existe", regex: "Expressão regular",
 mon: "Seg", tue: "Ter", wed: "Qua", thu: "Qui", fri: "Sex", sat: "Sáb", sun: "Dom",
 source_click_id: "ID do clique na fonte", ip: "IP", geo_country: "País", geo_region: "Região",
 city: "Cidade", asn: "ASN", isp: "Provedor de internet", device_type: "Dispositivo",
 os: "Sistema operacional", browser: "Navegador", user_agent: "Identificação do navegador",
 referrer: "Página de origem", currency: "Moeda", trafficback_depth: "Quantidade de retornos",
 "query.country": "País (parâmetro)", "query.device": "Dispositivo (parâmetro)",
 "query.browser": "Navegador (parâmetro)", "query.zone": "Zona (parâmetro)",
 "query.placement": "Posicionamento (parâmetro)", "query.offer": "Oferta (parâmetro)",
 "query.campaign": "Campanha (parâmetro)"
};
export function uiValue(value: string): string { return labels[value] ?? value; }
export function apiErrorMessage(status: number, detail?: string): string {
 const known: Record<string, string> = {
  "invalid auth token": "Senha incorreta ou sessão expirada.",
  "authentication required": "Entre para continuar.",
  "forbidden": "Você não tem permissão para esta ação.",
  "too many invalid otp attempts": "Muitas tentativas. Aguarde um minuto.",
  "otp request rate limited": "Muitas tentativas. Aguarde um minuto.",
  "user pending admin approval": "Usuário aguardando aprovação."
 };
 if (detail && known[detail]) return known[detail];
 if (status === 401) return "Senha incorreta ou sessão expirada.";
 if (status === 403) return "Acesso não autorizado. Confira as permissões.";
 if (status === 429) return "Muitas tentativas. Aguarde um minuto e tente novamente.";
 if (status === 404) return "Recurso não encontrado. Confira a conexão com a API.";
 if (status === 405) return "A solicitação não chegou à API. Confira o encaminhamento do painel.";
 if (status >= 500) return "O serviço está indisponível. Tente novamente em instantes.";
 return `Não foi possível concluir a solicitação (código ${status}). Confira os dados informados.`;
}
