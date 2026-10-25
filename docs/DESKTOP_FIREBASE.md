# Papotato instalado — Windows x64

A versão 0.4 inclui a interface no instalador Electron e usa Firebase Authentication + Firestore diretamente. Não depende do Railway nem do GitHub Pages para texto. O projeto compartilhado é `papotato-desktop-e9fa1a`, com banco em São Paulo, regras publicadas, e-mail/senha habilitado e faturamento desativado.

## Começar

1. Baixe [Papotato-Setup-0.5.0.exe](https://github.com/Harleyzinn/papotato-web/releases/download/desktop-v0.5.0/Papotato-Setup-0.5.0.exe) e instale no Windows 10/11 x64. O hash está na [página da release](https://github.com/Harleyzinn/papotato-web/releases/tag/desktop-v0.5.0).
2. Crie sua conta, crie uma comunidade e copie o código de convite. Seus amigos instalam o mesmo programa, criam suas contas e entram pelo código.
3. Texto, convites, canais privados, amigos, moderação e arquivos usam o banco compartilhado. Não há usuários ou mensagens de demonstração.
4. Entre em um canal de voz para testar os dispositivos e, depois, conectar a chamada.

O instalador ainda não tem certificado de assinatura de código. O Windows pode mostrar o editor como desconhecido. Não altere configurações de segurança do Windows para instalar. O arquivo pode ser conferido pelo SHA-256 publicado junto à release.

## Atualizações automáticas a partir da versão 0.5.0

**Quem está na 0.4.x precisa instalar a 0.5.0 uma vez**, pois as versões anteriores não têm atualizador. A conta, o histórico Firebase, o perfil local e a chave do anfitrião são preservados.

O aplicativo procura releases estáveis ao abrir (após 20 segundos) e a cada seis horas. Uma atualização disponível é baixada em segundo plano pelo `electron-updater`, a partir do repositório público GitHub, com verificação SHA-512 do pacote. Não há token GitHub dentro do instalador. O aviso mostra o progresso e oferece **Reiniciar e instalar** quando o download está pronto. O programa só instala após a confirmação; sair do aplicativo não instala automaticamente. Uma chamada ativa impede reiniciar para atualizar. Se o PC estiver hospedando, a confirmação também informa que a hospedagem será interrompida durante o reinício.

Use **Ajuda → Verificar atualizações** ou o botão nas configurações para verificar manualmente. Falhas de internet não bloqueiam o chat e permitem tentar novamente. O pacote continua sem assinatura de editor; a atualização usa HTTPS e os hashes dos artefatos publicados, sem afirmar que existe assinatura de código.

Para publicar versões futuras: atualize `package.json` e `desktop/package.json`, faça commit/push, crie a tag `desktop-vVERSAO` e envie a tag. O workflow `desktop.yml` testa, gera NSIS, `.blockmap`, `latest.yml` e `SHA256SUMS.txt`, envia todos os arquivos e só publica a release ao terminar. Esses arquivos devem permanecer juntos na release marcada como mais recente. O aplicativo lê o feed gerado pelo builder em `resources/app-update.yml`. Não distribua apenas o `.exe` sem `latest.yml` e o blockmap nas futuras releases.

Na 0.5.0, a verificação do LiveKit também consulta a configuração compartilhada no Firebase, corrigindo o bloqueio em instalações cujo arquivo local antigo não tinha URL de mídia. A espera pelo Render mostra andamento, evita entradas duplicadas e descarta uma conexão se o usuário cancelar a janela antes de o token chegar.

## Hospedar no computador do proprietário

Este computador foi provisionado para a conta `harleyzinn`. A chave de hospedagem fica **fora do projeto e do instalador**, em `%APPDATA%/PapotatoHost/credentials.bin`, criptografada pelo armazenamento seguro do Windows. Essa chave não é exportada com a configuração pública e não pode ser usada em outro computador apenas copiando o arquivo.

Ao abrir e entrar na conta proprietária, o programa pergunta se você quer:

- **Hospedar no meu PC**: inicia um emissor de tokens ligado apenas a `127.0.0.1`, abre um túnel HTTPS temporário Cloudflare e publica o endereço no Firestore. Os amigos descobrem o endereço automaticamente. Mantenha o Papotato e o computador ligados.
- **Usar Render**: encerra o emissor local e usa a URL HTTPS configurada para o serviço externo.
- **Agora não**: continua usando texto sem iniciar hospedagem.

O botão “Servidor de chamadas” permite mudar a escolha durante o uso. Os instaladores dos amigos não contêm a chave, não iniciam serviços e não mostram a pergunta de hospedagem. As regras do Firebase permitem somente à conta proprietária mudar o endereço compartilhado. Uma conexão inválida não concede permissões de administrador.

**O PC hospeda o autorizador, não a SFU.** Áudio, vídeo e tela continuam no LiveKit Cloud; o banco continua no Firebase. Se o emissor preferido falhar, o cliente tenta o outro endereço configurado. O Render Free já está provisionado como alternativa. A troca vale para novas entradas; chamadas já conectadas usam sua conexão com o LiveKit.

O conector Cloudflare é obtido da release oficial, com versão e SHA-256 fixados em `desktop/cloudflared.json`. Quick Tunnels são temporários, sem garantia de disponibilidade e voltados a desenvolvimento/testes; suportam até 200 requisições simultâneas. Aqui passam apenas pedidos de autorização, não o tráfego de mídia. Para hospedagem permanente, configure Render ou um túnel nomeado. [Documentação oficial](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

Para preparar ou atualizar **somente o computador anfitrião**, preencha `.env` local com `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` e `FIREBASE_HOST_OWNER_UID`; execute:

```powershell
npm ci
npm run desktop:host:setup
```

Nunca inclua `.env` ou `credentials.bin` na release. Se uma chave LiveKit tiver sido publicada no GitHub, substitua-a no painel LiveKit, atualize o `.env` e execute o provisionamento novamente. Apagar o valor do arquivo atual não remove o segredo do histórico público.

## Render gratuito como alternativa

O serviço [papotato-media](https://papotato-media.onrender.com/health) está publicado no workspace confirmado pelo proprietário, em Virginia, no plano **Free**, sem disco ou banco Render. O endereço `https://papotato-media.onrender.com/token` foi compartilhado pelo Firebase e já funciona nos aplicativos existentes. Feche e abra o programa para a tela de escolha carregar esse endereço. A versão 0.4.1 também o inclui como alternativa padrão e aguarda até 90 segundos pelo despertar do serviço após inatividade.

Não é necessária uma API key Render no aplicativo. A conexão de administração foi feita por OAuth; somente o servidor recebe as credenciais LiveKit. O serviço usa deploy manual para evitar builds de mudanças exclusivas do instalador. Para reproduzir em outro workspace, crie um Web Service **Free**, sem disco e sem plano pago, apontando para este repositório:

| Configuração | Valor |
| --- | --- |
| Runtime | Node |
| Build | `npm ci --omit=dev` |
| Start | `node server/firebase-media.js` |
| Health check | `/health` |
| `NODE_VERSION` | `24.14.1` |
| `FIREBASE_PROJECT_ID` | `papotato-desktop-e9fa1a` |
| `LIVEKIT_URL` | URL pública `wss://…livekit.cloud` |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Somente variáveis secretas do servidor |

Cadastre a URL `https://SEU-SERVICO.onrender.com/token` na escolha de hospedagem do proprietário. Não coloque o segredo em `VITE_*`, configuração Firebase ou instalador. O serviço valida o JWT do Firebase e consulta o canal com o próprio token do usuário: banimento, canal privado, associação e revogação são verificados pelas regras. Tokens LiveKit expiram em cinco minutos. Serviços gratuitos podem suspender por inatividade.

## Gratuito não significa ilimitado

Não há cotas globais extras do Papotato para quantidade de contas, mensagens, comunidades, arquivos ou participantes por chamada. Existem comprimentos de campos, limites técnicos e capacidade do computador/conexão. O aplicativo não ativa cobrança ou muda o plano automaticamente.

O Firestore gratuito tem 1 GiB armazenado, 50 mil leituras/dia, 20 mil escritas/dia, 20 mil exclusões/dia e franquia de tráfego. Autenticação e LiveKit também têm limites próprios. Atingir a franquia pode interromper o serviço. [Limites Firestore](https://firebase.google.com/docs/firestore/quotas), [limites LiveKit](https://docs.livekit.io/deploy/admin/quotas-and-limits/).

Arquivos são divididos em documentos Firestore de 128 KiB, com SHA-256 por parte e controle de acesso. Não é usado Firebase Storage, evitando exigir ativação de faturamento para esse recurso. Base64 e documentos aumentam o espaço e o consumo de operações: use o painel “Seus arquivos” para excluir anexos. O envio/download monta o arquivo na memória; arquivos grandes dependem da memória disponível e da franquia do projeto. Essa solução é adequada para pequenos grupos, não armazenamento de vídeos em grande escala.

## Compilar e testar

```powershell
npm ci
npm run check
npm run test:firebase
npm run desktop:dist
```

Requisitos de desenvolvimento: Node 24.14+, Java 21+ para emuladores, Windows x64 para gerar NSIS. Os amigos não precisam instalar Node ou Java. O artefato fica em `release/`. O workflow `desktop.yml` testa Firebase e compila em Windows por disparo manual ou tags `desktop-v*`.

Para outro projeto Firebase, altere a configuração **pública** em `desktop/firebase-default.json`, publique regras/índices com `firebase deploy --only firestore,auth --project SEU_ID`, cadastre o UID proprietário em `infrastructure/owner` por uma sessão administrativa e recompile. Nenhuma chave administrativa deve ser distribuída.

## Verificação realizada

- Build de produção e testes da API existente + emissor de tokens.
- Emuladores oficiais: três contas, convites atômicos, canal privado, moderação, bloqueios, reações, mensagens idempotentes, dois listeners e arquivo de 3 MiB; tentativas de forjar privilégios e endereço de hospedagem são recusadas.
- Firebase de produção: duas contas temporárias trocaram mensagens por convite em tempo real; os dados de QA foram removidos.
- Túnel público local: requisição anônima recusada; usuário Firebase real de teste recebeu token para seu canal de voz autorizado.
- LiveKit Cloud: duas sessões receberam áudio sintético não silencioso, câmera sintética e tela sintética. Não foi teste de dispositivos físicos ou entre dois computadores de amigos.

Render foi publicado e validado com `/health`, recusa de requisição anônima e emissão real de token LiveKit para um membro Firebase autorizado. O Render Free suspende após 15 minutos sem tráfego e pode levar cerca de um minuto para despertar; o primeiro ingresso pode demorar. Não há promessa de uso sem limites dos provedores nem de disponibilidade contínua de túneis temporários. [Limitações oficiais do plano gratuito](https://render.com/docs/free).
