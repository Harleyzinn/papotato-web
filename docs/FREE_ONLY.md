# Papotato — somente planos gratuitos

**Regra desta instalação: não cadastrar cartão, não contratar assinatura, não comprar créditos, não ativar recarga e não migrar para um plano pago.** Nenhum serviço pago foi contratado pelo agente.

O código agora usa um perfil econômico obrigatório. Isso reduz o consumo, mas **não verifica nem altera o faturamento das contas externas**. A condição de custo zero depende de manter os provedores nos planos gratuitos corretos, sem meio de pagamento. Não use uma conta já paga supondo que o app impedirá cobranças.

## Serviços escolhidos e franquias

Verificado em **25/10/2026**, nas fontes oficiais:

| Serviço       | Plano permitido                    | Franquia/condição                                                                                               |
| ------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| GitHub Pages  | Repositório público no GitHub Free | Frontend estático, sem backend                                                                                  |
| Railway       | **Free**, sem cartão               | US$ 1 de créditos gratuitos por mês; até 0,5 GB RAM, uma réplica e 0,5 GB de volume                             |
| LiveKit Cloud | **Build**, sem cartão              | 5.000 minutos-participante e 50 GB de saída por mês; franquias compartilhadas entre projetos gratuitos da conta |

Railway começa com um Trial de até 30 dias/US$ 5 em créditos gratuitos e depois passa para Free, que possui a franquia mensal menor. **Hobby não é gratuito**; Ship/Scale do LiveKit também não. Não selecione esses planos.

No LiveKit Build, a franquia é um teto: novas operações falham ao esgotá-la, em vez de cobrar excedente. Na Railway, a franquia pequena pode não manter o processo ativo o mês inteiro; falta de crédito pode interromper o serviço. Não há promessa de disponibilidade 24 horas ou retenção indefinida. A documentação informa retenção limitada de volumes após expiração: mantenha backups fora do provedor.

Quatro pessoas em uma chamada por uma hora consomem **240 minutos-participante**. O tráfego de vídeo/tela pode esgotar a franquia antes dos minutos. Não crie projetos extras para tentar multiplicar a franquia compartilhada.

Fontes: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Railway preços](https://railway.com/pricing), [Railway Trial/Free](https://docs.railway.com/pricing/free-trial), [Railway planos e retenção](https://docs.railway.com/pricing/plans), [LiveKit Build e limites rígidos](https://docs.livekit.io/deploy/admin/quotas-and-limits/).

## Limites aplicados pelo Papotato 0.3

São limites do aplicativo, definidos em `server/limits.js`, independentes das franquias do provedor:

| Recurso                          | Limite                                                                    |
| -------------------------------- | ------------------------------------------------------------------------- |
| Pessoas por chamada              | **4**, imposto ao criar a sala na SFU                                     |
| Câmera                           | Alvo 480p/15 fps, encoding de até 500 kbps no cliente                     |
| Tela                             | 480p por padrão, opção 720p; 10 fps e encoding de até 900 kbps no cliente |
| Arquivo individual               | **2 MiB**, validado no servidor                                           |
| Anexos por usuário               | **16 MiB**                                                                |
| Anexos de toda a instalação      | **64 MiB**                                                                |
| Downloads de anexos              | **256 MiB por mês UTC**, contador persistente compartilhado               |
| Banco SQLite                     | Teto configurado de **128 MiB**; WAL com checkpoints frequentes           |
| Contas                           | 32                                                                        |
| Comunidades + conversas privadas | 24                                                                        |
| Canais por comunidade            | 16                                                                        |
| Mensagens persistentes           | 20.000, incluindo mensagens excluídas com tombstone                       |

O tráfego contado é o tamanho integral dos anexos servidos pela API, reservado antes do envio; não representa todo tráfego HTTP/WebSocket da hospedagem. Interromper o download não devolve essa reserva. A cota reinicia na mudança de mês UTC. Excluir um arquivo libera armazenamento, mas não desconta bytes já servidos.

Os alvos de encoding reduzem uso do cliente oficial, sem garantir qualidade ou medir a fatura da SFU. Um cliente modificado pode solicitar outras configurações. O bloqueio financeiro real continua sendo o plano Build gratuito do provedor.

Ao atingir uma cota, o app responde com erro claro. Não compra recursos, não apaga histórico para ocultar o limite e não aumenta franquias automaticamente. **Configurações → Perfil gratuito** mostra anexos/contadores reais da instalação. O dono do arquivo pode excluí-lo com confirmação para liberar espaço, mesmo após sair/ser removido da comunidade; isso não concede acesso às conversas. Os links/imagens desse arquivo passam a ficar indisponíveis.

## O que você precisa fazer uma vez

O GitHub já está conectado e o frontend está publicado em [Papotato](https://harleyzinn.github.io/papotato-web/). Não há acesso autenticado às suas contas Railway/LiveKit, e elas não foram criadas pelo agente.

1. **Railway:** crie uma conta sem cartão, verifique que ela está em Trial/Free e instale/conecte a integração Railway nesta conversa, ou siga o painel manualmente. Vincule seu GitHub para a verificação gratuita. Não aceite Hobby se a verificação/rede do Trial for limitada; isso é uma dependência externa, não motivo para pagar automaticamente.
2. Crie um serviço a partir de `Harleyzinn/papotato-web`, usando o Dockerfile. Monte um volume em `/app/data`, mantenha uma réplica e configure as variáveis de `.env.free.example` no serviço. Se houver problema de proprietário do volume, siga a explicação de bootstrap em [GITHUB_PAGES.md](GITHUB_PAGES.md).
3. **LiveKit:** crie um projeto **Build**, sem cartão. Copie URL WSS, chave e segredo para as variáveis privadas da API na Railway. Não envie o segredo no chat nem coloque valores privados em `VITE_*`.
4. Gere o domínio HTTPS da API e confirme `/api/health`: deve informar `costPolicy.mode=free-only`, versão 0.3 e `mediaConfigured=true`. O campo `providerPlanVerifiedByApp=false` é intencional: o app não afirma ter consultado sua assinatura.
5. No GitHub `papotato-web → Settings → Secrets and variables → Actions → Variables`, defina **somente** `VITE_API_URL=https://SEU-DOMINIO-DA-API`. Execute o workflow **Publish Papotato on GitHub Pages**.
6. Confira no navegador, entre com duas contas em redes diferentes e confirme fala, câmera e tela recebidas. Esse teste físico/entre redes ainda não foi realizado na entrega.

Não é necessário comprar domínio: os subdomínios gratuitos dos provedores são suficientes, quando disponíveis à conta. Se o provedor exigir cartão ou plano pago no seu cadastro, pare a configuração e informe isso; não prossiga com cobrança.

## Disponibilidade e alternativas

Nenhum plano gratuito garante uso ilimitado. Quando uma franquia impedir o uso, a regra é esperar a renovação ou operar a API/SFU no próprio computador/rede, com as limitações de energia, internet, HTTPS, NAT e TURN documentadas. Não há fallback para P2P sem relay nem simulação de chamada.

Escolhi manter o backend existente no Railway Free porque ele já oferece contas, autorização, anexos e Socket.IO persistentes. Migrar todos os recursos para outro banco/serviço sem uma conta conectada acrescentaria uma implementação não validada, sem resolver o acesso externo. Essa escolha não promete que o crédito mensal será suficiente: o consumo precisa ser observado no painel, com o serviço ainda no plano Free.

## Testes da versão 0.3

`npm run check`: **14 testes passando**, incluindo o limite de 2 MiB, esgotamento dos 16 MiB por usuário, exclusão autorizada/liberação de espaço, impedir outro membro de excluir arquivo alheio, contador mensal de downloads persistido após reabrir o banco, manter cotas de meses diferentes separadas e permitir ao autor recuperar sua quota após banimento. Banco cheio devolve erro 507 sem apagar a mensagem de teste existente.

Build e publicação do frontend não equivalem a provisionar a API/SFU públicas. A tela publicada continua informando os cadastros/conexões pendentes, agora com instruções estritamente gratuitas.
