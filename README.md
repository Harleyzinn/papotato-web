# Papotato

**Papotato = papo + potato.** Comunicação entre amigos, em português: texto persistente, comunidades e chamadas com uma SFU LiveKit real. Identidade própria em verde menta, símbolo de batata em forma de conversa e temas Jardim à noite, Luz da manhã e Ameixa. Sem contas ou conversas pré-carregadas.

**Estado:** implementação funcional local com testes de API e transporte de mídia. Não publicada em um domínio. Não foi validada entre redes diferentes. O escopo completo solicitado ainda tem pendências, listadas em [docs/STATUS.md](docs/STATUS.md).

## Início rápido no Windows x64

Pré-requisito: Node.js 24.14.1 ou mais recente e Git.

```powershell
npm ci
npm run setup:media
```

O helper baixa LiveKit **1.13.11** do repositório oficial, verifica SHA-256 contra o arquivo de checksums da mesma versão e cria chaves aleatórias em `.env` e `data/livekit-local.yaml`. Não contrata serviço e não envia esses arquivos ao Git. Não sobrescreve um `.env` existente. Os checksums verificam integridade; não são uma assinatura independente do fornecedor.

Em um terminal:

```powershell
npm run media
```

Em outro:

```powershell
npm run dev
```

Abra [localhost:3000](http://localhost:3000). O LiveKit local usa sinalização em 7880, fallback TCP em 7881 e mídia UDP em 50000–50100. A versão Windows informa que monitoramento automático de capacidade por CPU não é suportado.

1. Crie sua conta (senha de no mínimo 12 caracteres).
2. Crie uma comunidade no botão `+` da barra lateral.
3. Clique em **Convidar amigos**, gere o link e compartilhe-o você mesmo.
4. Outra conta abre o convite, entra e conversa em `#geral`.
5. Ambos escolhem **Sala de estar**, testam/ativam seus dispositivos e entram.
6. Na chamada: **Microfone**, **Câmera**, **Tela** e os seletores de dispositivos. A tela e a câmera podem ser transmitidas simultaneamente. Clique em um participante/transmissão para ampliar.

**Um convite localhost funciona somente no mesmo computador.** Para seus amigos em outras redes, publique app e SFU conforme [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Trocar apenas o link pelo IP do computador não configura HTTPS, ICE ou TURN.

## Docker Compose local

Instale Docker Engine/Compose (não estavam disponíveis no ambiente de entrega). Copie `.env.example` para `.env`, use chaves próprias e execute:

```sh
docker compose up --build
```

O perfil Compose usa HTTP local e cookies sem `Secure` deliberadamente; só expõe app e sinalização ao loopback. O frontend recebe `LIVEKIT_URL=ws://localhost:7880`, enquanto o backend usa `LIVEKIT_INTERNAL_URL=http://livekit:7880`. Para outro dispositivo, os endereços e a configuração de ICE precisam mudar. **Não use esse perfil diretamente na internet.** A configuração Compose foi revisada, mas não executada neste Windows.

## Comandos

| Comando                                    | Finalidade                                                 |
| ------------------------------------------ | ---------------------------------------------------------- |
| `npm run dev`                              | API + Socket.IO + Vite em uma origem                       |
| `npm run build`                            | Build React para `dist/`                                   |
| `npm start`                                | Servidor; use `NODE_ENV=production` para servir o build    |
| `npm run check`                            | Build e testes de API                                      |
| `npm run test:media`                       | Dois clientes SDK e transporte de mídia gerada; requer SFU |
| `npm run backup -- C:/backups/roda.sqlite` | Snapshot consistente do banco e anexos                     |

Migrações SQL idempotentes em `server/migration.sql`, executadas automaticamente ao abrir o banco. Alterações futuras de esquema devem receber novas migrações versionadas; a tabela `migrations` registra a versão inicial. Os dados locais ficam em `data/roda.sqlite`; o perfil Compose usa volume `roda-data`.

## Arquitetura

- React 19 + Vite, CSS responsivo, Markdown sem HTML bruto. Lucide para ícones; logo em SVG próprio.
- Express 5 e Socket.IO em uma origem. REST persiste e autoriza as operações; sockets entregam mudanças e presença efêmera. Reconectar recarrega o histórico. UUID estável e unicidade no banco tornam reenvio idempotente.
- SQLite real, WAL, chaves estrangeiras e transações. Anexos armazenados como BLOB no próprio banco: backup inclui os arquivos.
- Senhas com scrypt/salt aleatório; sessões de 7 dias com tokens aleatórios, somente hash no banco e cookies HttpOnly/SameSite=Lax. Cookies Secure em produção; revogação invalida REST e sockets.
- LiveKit distribui voz, câmera e tela. Tokens de 5 minutos vinculados ao usuário e canal autorizado. A SFU faz o fan-out; o cliente não mantém uma conexão P2P independente para cada amigo.
- Um processo de app e uma SFU. Escalar horizontalmente exige coordenar banco, rate limits, presença e adapter do Socket.IO. Não há esse suporte nesta versão.
- SMTP não configurado e adaptador de e-mail ainda não implementado. Recuperação/verificação não são simuladas.

As escolhas de mídia seguem a [documentação de implantação e portas do LiveKit](https://docs.livekit.io/transport/self-hosting/ports-firewall/), [grants e expiração](https://docs.livekit.io/frontends/reference/tokens-grants/), [componentes React](https://docs.livekit.io/reference/components/react/) e [salas Socket.IO](https://socket.io/docs/v4/rooms/). API de backup: [Node SQLite](https://nodejs.org/api/sqlite.html). Essas fontes oficiais foram consultadas na implementação; as versões instaladas estão fixadas no lockfile.

## Limites e privacidade

- **8 participantes por chamada**, imposto pela SFU. Teste realizado com 2; capacidade para 8 não foi submetida a carga.
- Câmera com alvo 720p/30 fps, limite de encoding 1,5 Mbps. Tela 480p/720p/1080p selecionável, 15 fps e limite de encoding 2,5 Mbps. Simulcast, dynacast e adaptação de assinatura habilitados. São alvos, sujeitos a hardware/rede.
- Até 4.000 caracteres por mensagem; páginas de 50 mensagens. Anexos até 8 MiB, total de 100 MiB por conta. Armazenamento compartilhado não possui quota global.
- 240 operações API/minuto/IP; autenticação limitada a 30 operações/15 min/IP; no máximo 10 mensagens/10 s/usuário. Convites: 1–168 horas e 1–100 usos.
- Áudio da tela depende do navegador, sistema e fonte selecionada. Não há gravação, atalhos globais ou promessa de E2EE.
- HTTPS/WSS + DTLS-SRTP protegem o transporte em produção. Administrador do servidor e infraestrutura de mídia continuam em posição de acessar dados. Histórico e anexos não são cifrados no banco.
- Tokens já emitidos em LiveKit self-hosted podem continuar válidos até expirar (5 minutos), inclusive após expulsão/revogação. O app tenta remover o participante ativo; falha de conexão com a SFU é registrada como `media_disconnect_failed`. Não há revogação criptográfica instantânea desses tokens nesta versão.
- Prévia de links não faz requisições no backend. HTML/SVG anexado é download, não documento executável. Arquivos não passam por antivírus. Use downloads somente de pessoas confiáveis.

## Backup e restauração

Faça backups regulares com `npm run backup -- DESTINO`. Não copie apenas o `.sqlite` enquanto estiver em WAL. Proteja o backup como dado privado. Para restaurar, pare o app, preserve uma cópia da instalação atual, substitua `data/roda.sqlite` pelo snapshot e remova os antigos arquivos `roda.sqlite-wal`/`roda.sqlite-shm` **somente com todos os processos que acessam esse banco parados**. Reinicie e confira `/api/health` e histórico. O backup foi criado e aberto com sucesso na validação local; restauração operacional completa/recuperação de desastre não foi ensaiada.

## Verificação e pendências

Consulte [docs/STATUS.md](docs/STATUS.md) para cobertura, testes e funcionalidades não implementadas. O log de entrega não deve ser interpretado como validação de dispositivos físicos, TURN ou duas redes.
