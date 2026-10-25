# Papotato 0.2 — preparação para GitHub Pages

## Mudanças

- Frontend estático com base path configurável, favicon correto, fallback 404 e workflow oficial de Pages. Repositório público de publicação separado do original privado.
- API configurável por `VITE_API_URL`, origem CORS explícita, sessões bearer em `sessionStorage`, handshake Socket.IO autenticado e revogação notificada ao cliente. Compatibilidade com cookies mantida na API.
- Convites incluem o caminho público do app. Assets e limpeza de query não voltam à raiz incorreta do domínio.
- Anexos privados usam requisição autenticada e object URL; imagens, players e downloads funcionam sem cookies de terceiros e sem tokens nos links. Correção de referência ao input de upload após operações assíncronas.
- Controles LiveKit carregados sob demanda. JavaScript inicial caiu de aproximadamente 1.123 KB para 438 KB, antes de gzip; payload de mídia de aproximadamente 690 KB é carregado ao abrir a pré-entrada. Build ainda avisa sobre esse chunk grande de mídia, de forma esperada.
- Tema padrão ardósia/dourado batata, logo atualizado, foco/feedback no compositor, transições e animações respeitando redução de movimento.
- Rascunhos de texto persistem por usuário/canal/aba. Canal antigo deixa de aceitar composição durante troca de comunidade. Recarregar espaços recupera seleção válida.
- Health check identifica uma API Papotato compatível e configurações de mídia completas. Se faltar API pública ou ela não responder, existe estado explícito e recuperável, sem contas ou chamadas simuladas.
- `railway.json`, documentação de configuração e bootstrap de volume com redução de privilégios. Infraestrutura Railway/LiveKit pública não foi criada, pois não há conexão a essas contas.

## Validação

- `npm run check`: build e **12 testes passando**.
- Novo teste com duas contas bearer em origem diferente: preflight/CORS, rejeitar origem estranha, sessão sem cookie, privacidade de token/hash, convites com subdiretório, anexos autenticados, entrega efetiva de mensagens por sockets e revogação da sessão.
- `npm run build:pages` e `npm run check:pages`: caminhos de script/CSS/favicon, arquivos presentes, fallback e `.nojekyll` validados.
- Build de produção servido em `localhost:4173/papotato-web/`, API real em `localhost:3000`: cadastro, comunidade, envio e recarga do histórico verificados no navegador integrado. Dados de QA isolados em diretório ignorado pelo Git.
- Teste de mídia sintética com dois clientes e SFU local já existe em `npm run test:media`; seus resultados anteriores e os limites físicos/rede estão no relatório histórico. Chamadas físicas e duas redes continuam sem validação.
- Não há Docker neste ambiente para executar a imagem/volume. A visualização do navegador integrado é estreita; os breakpoints de desktop foram revisados, mas não houve sessão de navegador em viewport desktop independente nesta versão.

## Condição de entrega

Um frontend publicado com API pendente **não** é o produto multiplayer pronto para amigos. A conclusão desse objetivo exige publicar a API persistente, configurar a SFU pública, definir `VITE_API_URL` no GitHub e validar duas redes. Veja [GITHUB_PAGES.md](GITHUB_PAGES.md) para os passos exatos. Funcionalidades avançadas ainda não implementadas na versão anterior continuam listadas em [STATUS.md](STATUS.md).
