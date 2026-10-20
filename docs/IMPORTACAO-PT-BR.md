# Importação do TraffoFlex

Origem: https://github.com/devflex-pro/traffo-flex
Commit importado: `607f40ecfb6058b91bc11f876f940082604779d1`
Destino: https://github.com/RhaysonMuchiutti/cloker-2

## Conteúdo

Base original com painel React, API Go, serviço de tráfego, postbacks,
MongoDB, ClickHouse, Docker Compose e workflow de testes.
Licença MIT preservada e commit original registrado acima. O histórico de commits do autor não foi importado; o commit inicial do destino foi preservado.

## Execução e domínios

O guia original está no README e em docs. Para construir a base localmente:

```bash
cp .env.example .env
docker compose -f deploy/docker-compose.yml up --build
```

A configuração de produção usa três nomes DNS distintos apontados para o servidor:
TRACKER_DOMAIN (tráfego), POSTBACK_DOMAIN (conversões) e APP_DOMAIN (painel).
Isso é apontamento de domínios; não é um serviço de nameservers ou gestão de zonas DNS.

## Produção

O instalador e o Compose de produção originais continuam usando imagens
`ghcr.io/devflex-pro/traffo-flex-*`. Eles executam versões publicadas pelo autor,
não alterações feitas neste repositório. O workflow de release calcula o nome
das imagens a partir deste repositório; antes de usar imagens próprias,
é necessário publicar uma versão e adaptar o instalador/Compose para essas imagens.
Nenhum deploy ou configuração de DNS foi realizado nesta importação.

O projeto é apresentado pelo autor como MVP e exige revisão antes de produção.
Não há nesta importação implementação adicional de cloaking específico para Meta.

## Login por senha fixa

A tela de login usa apenas senha, sem confirmação por e-mail.
Na API, configure AUTH_ADMIN_PASSWORD com pelo menos 12 caracteres,
AUTH_ADMIN_EMAIL para identificar a conta administradora e AUTH_JWT_SECRET
com um segredo aleatório. Nenhuma senha é gravada no código ou no frontend.
Com AUTH_ADMIN_PASSWORD definido, os endpoints de OTP ficam desativados
e o envio de e-mail não é exigido. A API e o MongoDB continuam necessários.
O painel precisa encaminhar /api para a API (porta padrão 8070).
