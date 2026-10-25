# Papotato no GitHub Pages

O Pages entrega o frontend estático. Contas, banco, mensagens, anexos e chamadas dependem dos serviços externos abaixo. Publicar o HTML não os cria. Sem `VITE_API_URL`, o site mostra explicitamente que o servidor compartilhado ainda precisa ser configurado.

Repositório web: [Harleyzinn/papotato-web](https://github.com/Harleyzinn/papotato-web). URL prevista: `https://harleyzinn.github.io/papotato-web/`. Consulte o status de entrega para confirmação da publicação.

## Configuração que falta para conversar com amigos

### 1. Publicar a API persistente

É possível usar uma VPS Linux, Railway ou outro host de processos Node/WebSocket com volume persistente. Para aproveitar toda a estrutura existente, esta versão mantém Express + SQLite + Socket.IO, evitando substituir recursos reais por uma migração incompleta para Firebase/Supabase. O frontend já funciona com a API em domínio diferente.

Na Railway:

1. Instale/conecte a integração Railway na conversa para que o agente possa acessar sua conta, ou entre no painel [Railway](https://railway.com) e crie um projeto **Deploy from GitHub repo**, selecionando `Harleyzinn/papotato-web`.
2. A configuração `railway.json` seleciona o Dockerfile e `/api/health`. Anexe um volume persistente exatamente em `/app/data`. Não use apenas o disco efêmero do serviço.
3. Defina as variáveis abaixo **no serviço da API**. Gere um domínio HTTPS público para ele.
4. Uma única réplica do app deve acessar o SQLite. Verifique health check e logs antes de abrir o site aos amigos.

```dotenv
NODE_ENV=production
API_ONLY=true
DATA_DIR=/app/data
APP_ORIGIN=https://harleyzinn.github.io
APP_PUBLIC_URL=https://harleyzinn.github.io/papotato-web/
TRUST_PROXY=1
LIVEKIT_URL=wss://SEU-PROJETO.livekit.cloud
LIVEKIT_API_KEY=CHAVE_APENAS_NO_SERVIDOR
LIVEKIT_API_SECRET=SEGREDO_APENAS_NO_SERVIDOR
```

O app respeita `PORT` fornecida pelo host. `APP_ORIGIN` não inclui caminho; `APP_PUBLIC_URL` inclui o subdiretório, usado nos convites. `TRUST_PROXY=1` pressupõe uma única camada confiável de proxy; não exponha a porta Node diretamente à internet. O health check confirma banco e configuração, não recepção de mídia.

**Permissões do volume Railway:** o Dockerfile normalmente roda como usuário `node`. Volumes Railway podem ser montados com proprietário root. Se necessário, configure `RAILWAY_RUN_UID=0`; o entrypoint `server/bootstrap.js` confere se `DATA_DIR` é exatamente o mount declarado pela Railway, ajusta o proprietário apenas desse diretório e imediatamente reduz uid/gid para 1000, antes de carregar o servidor. O processo do aplicativo não permanece como root. Esse fluxo não foi executado num contêiner neste Windows; verifique os logs da implantação. Referência: [Volumes e permissões Railway](https://docs.railway.com/volumes).

Os planos/limites do provedor devem ser verificados antes de ativar cobrança. Nenhuma assinatura, cartão ou serviço pago foi contratado na entrega.

### 2. Configurar mídia pública

Crie um projeto no [LiveKit Cloud](https://cloud.livekit.io) e coloque URL, chave e segredo **somente na API**, como acima. Não use o servidor de tokens de desenvolvimento em produção. A API do Papotato verifica associação/canal e emite tokens de cinco minutos.

Alternativamente, use uma SFU própria conforme [DEPLOYMENT.md](DEPLOYMENT.md), com IP público, certificados, STUN e TURN/TLS. Railway não é a configuração de referência para hospedar a SFU UDP: use LiveKit Cloud ou uma VM apropriada. O teste entre duas redes, incluindo relay TURN, continua obrigatório para validar a conectividade real.

### 3. Ligar o frontend à API

No GitHub, abra **papotato-web → Settings → Secrets and variables → Actions → Variables** e crie:

```text
VITE_API_URL=https://DOMINIO-PUBLICO-DA-API
```

É uma URL pública, sem senha/chave, sem `/api` no final e sem query string. **Não crie variáveis VITE com segredos.** Todo valor VITE é incorporado ao JavaScript público.

Em **Settings → Pages**, mantenha **Source: GitHub Actions**. Execute **Actions → Publish Papotato on GitHub Pages → Run workflow**. O workflow calcula o base path do repositório, roda testes, compila, verifica recursos e publica `dist/` pelo mecanismo oficial de Pages.

O repositório original privado continua com cópia do código. O deploy automático é habilitado para o repositório público; para Pages em um repositório privado com plano compatível, defina `ENABLE_PAGES=true` e ative Pages nele.

### 4. Confirmar que está utilizável

1. Acesse a URL final do Pages. Ela deve chegar ao cadastro/login, não à tela de infraestrutura pendente.
2. Crie duas contas em dispositivos diferentes, gere um convite e confirme que ele contém `/papotato-web/?invite=...`.
3. Envie mensagens, reabra a página, baixe um anexo e teste uma conversa privada.
4. Use redes diferentes para áudio, câmera e captura real de tela. Confirme recepção de verdade; o indicador “Conectado” sozinho não basta.
5. Teste reconexão e encerramento dos dispositivos. Só então compartilhe com sua turma como aplicação pronta.

## Segurança das sessões entre domínios

O cliente usa bearer em `Authorization`, com token aleatório guardado em `sessionStorage` para sobreviver a uma recarga na mesma aba. Não depende de cookies de terceiros, não grava tokens em links/convites e não envia segredos administrativos para o navegador. Fechar a aba encerra a persistência local; novo login pode ser necessário. O banco armazena somente o hash do token.

REST aceita somente a origem configurada no CORS; sockets verificam origem, sessão e acesso a cada canal. Arquivos privados são buscados com autenticação e renderizados por object URLs, que são liberadas ao desmontar. Logout/revogação invalida os hashes e avisa outros clientes conectados. O frontend deve ser servido por uma origem confiável; JavaScript injetado na mesma origem ainda representa risco, como em qualquer app com tokens no navegador.

## Build local equivalente ao Pages

```powershell
npm ci
$env:VITE_API_URL='https://DOMINIO-PUBLICO-DA-API'
$env:VITE_BASE_PATH='/papotato-web/'
npm run build:pages
npm run check:pages
```

`404.html` replica o entrypoint como fallback; os recursos usam o base path. Os links de convite usam query string na raiz do app, portanto recarga e acesso direto não dependem de roteamento no servidor do Pages. A interface não inventa páginas com caminhos que o serviço não oferece.

Documentação oficial usada: [Vite no Pages](https://vite.dev/guide/static-deploy), [Pages e planos](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [cookies entre sites](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies), [autenticação LiveKit](https://docs.livekit.io/frontends/build/authentication/).
