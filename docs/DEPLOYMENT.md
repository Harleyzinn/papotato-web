# Publicação para amigos em outras redes

Nenhum serviço pago foi contratado. Não existem credenciais de VPS, DNS ou LiveKit Cloud no ambiente. GitHub hospeda código e CI; não hospeda esta API ou SFU.

## Opção A: app em Linux + LiveKit Cloud

1. Provisione um host/contêiner com volume persistente para SQLite. Uma instância Linux de 2 vCPU/2 GiB é um ponto de partida para o app, sujeito a teste de carga.
2. Crie um projeto LiveKit Cloud com autorização de cobrança quando aplicável. Copie URL WSS, chave e segredo para o servidor; não para o frontend/repositório.
3. Configure as variáveis abaixo. Use HTTPS e domínio sob seu controle.
4. Execute `npm ci`, `npm run build`; mantenha `NODE_ENV=production npm start` sob systemd ou plataforma de contêineres. Para a imagem Docker, mantenha o CMD padrão `server/index.js`, sem o override local do Compose.
5. Configure proxy Caddy/Nginx com suporte a WebSocket na porta 3000. Exponha somente o proxy; mantenha 3000 privada. Use `TRUST_PROXY=1` exclusivamente quando houver exatamente um proxy confiável e o app não puder ser acessado diretamente.

```dotenv
NODE_ENV=production
PORT=3000
DATA_DIR=/var/lib/roda
APP_ORIGIN=https://roda.seudominio.com
TRUST_PROXY=1
LIVEKIT_URL=wss://seu-projeto.livekit.cloud
LIVEKIT_API_KEY=chave-no-servidor
LIVEKIT_API_SECRET=segredo-no-servidor
```

O LiveKit Cloud fornece a infraestrutura de conectividade de mídia, incluindo relay; confirme a cobertura e os limites do plano escolhido. O app usa a própria autenticação, não a de Sites/Base44.

## Opção B: app + SFU self-hosted

Use Linux com endereço IPv4 público e largura de banda adequada. A versão Windows é apenas para desenvolvimento aqui. Consulte o [guia oficial de VM](https://docs.livekit.io/transport/self-hosting/vm/) e prefira o gerador oficial de implantação LiveKit para certificados, rede e renovação.

Arquivos de referência:

- `infra/livekit.production.example.yaml`: SFU, STUN e TURN UDP/TLS integrados.
- `infra/Caddyfile.example`: HTTPS/WSS para app e sinalização.
- `Dockerfile`: build e usuário sem privilégios.

Substitua todos os domínios de exemplo. Atribua DNS aos IPs públicos reais. A SFU em contêiner deve usar rede do host em Linux para anunciar os candidatos ICE corretamente. Configure `LIVEKIT_KEYS` no ambiente do serviço LiveKit (`chave: segredo`, com segredo aleatório de ao menos 32 caracteres). No app, use o mesmo par. `LIVEKIT_INTERNAL_URL` pode apontar a sinalização HTTP em rede privada, enquanto `LIVEKIT_URL` deve continuar WSS público alcançável pelos navegadores.

Abra, conforme a configuração:

| Porta       | Protocolo | Destino                       |
| ----------- | --------- | ----------------------------- |
| 80/443      | TCP       | ACME/HTTPS/WSS do proxy       |
| 7881        | TCP       | Fallback de mídia LiveKit     |
| 50000–50100 | UDP       | ICE/mídia SFU                 |
| 3478        | UDP       | TURN integrado                |
| 5349        | TCP/TLS   | TURN TLS integrado no exemplo |

Certificado TURN precisa ser válido para `turn.seudominio.com`, com chave e cadeia montadas na SFU. Renove os certificados e reinicie/recarregue de acordo com a implantação LiveKit. A configuração de referência usa TURN TLS 5349. Redes que permitem apenas saída TCP 443 exigem TURN/TLS em **443**, com IP dedicado ou a topologia oficialmente suportada; não tente encaminhar TURN com um proxy HTTP comum. Portanto, o exemplo 5349 não garante conectividade em toda rede restritiva.

Nunca publique as chaves locais `devkey`/`secret` da documentação de desenvolvimento. Não use `--dev` em produção. Não anuncie `localhost`, IP de VPN ou IP privado nos candidatos externos. O serviço local iniciado nesta entrega pode detectar uma interface VPN; isso não valida conectividade externa.

## Aceitação antes de convidar amigos

1. Verifique `/api/health`, cookies Secure, cadastro, login e WebSocket via domínio público.
2. Use contas diferentes em dois dispositivos: uma conexão residencial e uma rede móvel.
3. Confirme fala nos dois sentidos, imagens reais das duas câmeras, câmera + tela simultâneas e encerramento pelo botão do navegador.
4. Valide uma conexão forçada a relay (`iceTransportPolicy: 'relay'` em um cliente de diagnóstico), confira os pares ICE selecionados e os logs TURN. Esse teste não foi realizado aqui.
5. Interrompa temporariamente a rede e verifique reconexão, ausência de mensagens duplicadas e limpeza dos dispositivos ao sair.
6. Teste permissões negadas, dispositivo removido/ocupado, Safari/iOS e Android. Não presuma áudio do sistema nesses ambientes.
7. Ensaie backup/restauração, quotas e carga para o número de amigos pretendido.

## Custos

O código e a SFU self-hosted não exigem licença paga para esta execução. Existem custos de máquina, domínio, armazenamento, backups e tráfego. LiveKit Cloud possui cobrança e limites próprios; consulte [preços oficiais](https://livekit.io/pricing) antes de contratar. Nenhum valor foi fixado porque nenhum plano ou provedor foi selecionado/verificado.

Com 8 pessoas publicando câmera de até 1,5 Mbps e assinando todas, o pior caso ingênuo de fan-out se aproxima de 84 Mbps de saída, mais áudio/telas/overhead; adaptação e camadas podem reduzir isso. É estimativa de planejamento, não medição. Uma tela de 2,5 Mbps vista por 7 pessoas acrescenta até 17,5 Mbps de saída. Não dimensione apenas pelo tamanho do JavaScript.

## Operação

Backups consistentes com `scripts/backup.mjs`, retenção e teste de restauração periódicos. Volume SQLite é obrigatório: não use filesystem efêmero. Monitore `/api/health` e saúde da SFU separadamente; `mediaConfigured` significa variáveis presentes, não teste de conectividade. Não registre tokens, senhas ou conteúdo das conversas. Os logs padrão LiveKit incluem identificadores de sala/participante; proteja-os e defina retenção. Rotação de chaves e encerramento de salas são responsabilidades do operador.
