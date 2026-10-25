# Entrega e verificação — 25/10/2026

Este é o relatório histórico da primeira versão. Para o estado atual do frontend Pages, sessões entre domínios, novos testes e publicação, consulte [RELEASE-0.2.md](RELEASE-0.2.md) e [GITHUB_PAGES.md](GITHUB_PAGES.md).

## Implementado

- Cadastro/login/logout reais, scrypt, cookies seguros em produção, expiração e revogação de sessões. Sem envio fictício de e-mail.
- Perfil com nome, bio, estado e status personalizado. Presença vem de sockets; lista atualiza a cada 20 segundos. Invisível aparece offline.
- Comunidades, associação persistente, proprietário/admin/membro, convites com validade/usos/revogação e transação de consumo. Canais de texto/voz e privados com allowlist por ID.
- Solicitar/aceitar/recusar/cancelar amizade e bloquear. Conversa privada com um ou até sete amigos selecionados; texto e sala de chamada privados. Não há convites para essas conversas. Bloqueio impede seu acesso de ambos os lados; em comunidades compartilhadas, mensagens continuam visíveis.
- Histórico persistente com paginação, busca autorizada, editar, excluir (tombstone), resposta, reação de coração no frontend (quatro emojis na API), fixação, Markdown e blocos de código, digitação, leitura e contadores ao carregar canais. Contadores de canais inativos não atualizam em tempo real nesta versão.
- Upload real, validação de assinatura para formatos reconhecidos, download protegido por associação/canal. Prévia de PNG/JPEG/WebP e players para MP3/OGG/MP4. Outros formatos são download. Sem fetch de prévia de URL pelo servidor. Quotas por arquivo/conta.
- Voz/vídeo/tela reais via LiveKit. Seleção e prévia de dispositivos antes de entrar, microfone/câmera/tela, câmera e tela simultâneas, grade/destaque/tela cheia, múltiplas telas, volumes locais, silenciar reprodução, saída de áudio quando suportada, alvo de qualidade de tela, simulcast e adaptação. Estados de conexão, erros de dispositivos e reconexão do SDK.
- A chamada permanece montada ao navegar; janela minimizável mantém controles e existe barra de chamada na sidebar desktop. No celular, reabra a sidebar para ampliar uma chamada minimizada.
- PT-BR nos fluxos e controles próprios; nomes de dispositivos/mensagens nativas do navegador/SDK podem depender do ambiente.
- Temas persistentes, fonte/densidade, redução de movimento, foco visível, formulários rotulados, diálogos modais nativos e atalhos dentro da página. Notificação do sistema somente após ação contextual; Não perturbe a desativa.
- Expulsão/banimento/desbanimento, promover/remover admin, transferência de propriedade com confirmação por nome, registro administrativo e denúncias visíveis a administradores. Proprietário não pode ser expulso por terceiros.
- Autorização de leitura/escrita/convites/sockets/arquivos/tokens no servidor, validação de entrada, limits por IP/usuário, UUID idempotente, tratamento de erro, health check, backup, Dockerfile/Compose, configuração de referência STUN/TURN/HTTPS e CI.

## Testado neste ambiente

Windows x64, Node 24.14.1, LiveKit 1.13.11, SQLite do Node (a API ainda emite aviso experimental).

**`npm run check`: 11 testes passando**, sendo nove subtestes e duas suítes externas contadas pelo runner:

1. Cadastro real e cookies; não expor hash de sessão/senha.
2. Origem, login inválido e autorização de comunidade.
3. Limites/revogação de convites.
4. Isolamento de canal privado e impedir administração por membro.
5. Persistência em nova conexão ao banco, UUID idempotente, edição autorizada, resposta, busca, reações e fixação.
6. Amizades, aceitar e bloquear solicitações.
7. Dois clientes Socket.IO independentes, recusa de assinatura privada e entrega efetiva da mensagem.
8. Revogar sessão, banir, negar acesso e impedir retorno por convite.
9. Falta de mídia retorna erro explícito.
10. Conversa privada exige amizade, é idempotente e não permite intruso/convite.
11. Anexo acessível ao membro, negado ao intruso/anônimo/bloqueado e limite de tamanho.

**`npm run test:media`: passou.** Dois clientes nativos independentes obtiveram tokens pela API real, entraram na mesma sala e publicaram áudio gerado de 440 Hz, vídeo gerado e faixa com source `screen_share` simultaneamente. Em ambos, foram decodificados quadros de todas as fontes; áudio com amostras não silenciosas. Em uma execução: sessão A recebeu 340 quadros de áudio (217 não silenciosos), 36 de câmera e 7 de tela; sessão B recebeu 1.035 de áudio (215 não silenciosos), 67 de câmera e 10 de tela. Contagens variam. Streams, tracks, sources e salas foram fechados ao concluir. **São mídias sintéticas sobre WebRTC/SFU reais, não captura de microfone, câmera ou desktop físico.**

**Navegador:** cadastro, criação de comunidade, envio com Markdown, recarga do histórico, menu de ações de mensagem, pré-entrada sem dispositivos, conexão à SFU e saída da chamada verificados em viewport estreito no navegador integrado. Não houve captura física de mídia nesse fluxo. Conta de QA `verificacao_roda` e comunidade `Laboratório da Roda` foram criadas localmente para esse teste; não são seeds nem fazem parte do repositório. A senha da conta de QA não é uma credencial de produção.

**Dependências:** auditoria npm sem vulnerabilidades conhecidas no momento da execução. Build Vite passou. Backup consistente criado e aberto.

**CI remoto:** [GitHub Actions — execução 40213517925](https://github.com/Harleyzinn/roda-comunicacao/actions/runs/40213517925) concluiu com sucesso: instalação reproduzível, build, testes e auditoria de dependências de produção. O teste de mídia foi executado localmente, não nesse workflow.

## Não validado

- Fala/escuta humana, câmera física, seletor nativo de tela, áudio de sistema e retirada física/ocupação/negação de dispositivos.
- Recepção de captura real de tela por um navegador em outra rede. Não há segunda rede ou participante humano disponível.
- TURN/relay e TLS de produção: fornecida configuração, sem domínio/certificados/host para executar o teste.
- Interrupção de rede durante chamada e retomada de tracks. O SDK oferece reconexão; isso não equivale a teste deste produto.
- Carga de oito pessoas, múltiplas telas reais, Safari/iOS/Android, leitores de tela e percurso completo de teclado. Só revisão de CSS responsivo e observação em viewport estreito; desktop não recebeu captura separada.
- Docker Compose e imagem Docker não foram executados neste ambiente. O workflow remoto passou nos checks descritos acima.

## Pendências do pedido original

Não há implementação de: verificação/recuperação de e-mail ou adaptador SMTP, troca de senha, avatar/imagem de comunidade enviados pelo usuário, edição/remoção de comunidade/canais, categorias e reordenação manual, cargos personalizados/moderador dedicado/matriz granular de permissões (inclusive transmitir), suspensão temporária, mute/remoção só da sala por moderador, menções com notificações a usuário/cargo, painel exclusivo de fixadas, preferência de privacidade persistida no servidor, central de notificações no app, sons de eventos, push-to-talk, estatística de RTT/latência ou E2EE.

Tema/fonte/densidade/notificações ficam por navegador. Preferências de perfil ficam no banco. O compartilhamento de tela é permitido a todo membro autorizado da sala. Existem três cargos fixos, não uma matriz completa. Banimento remove o membro da comunidade inteira, com tentativa de removê-lo das salas ativas; não substitui a ferramenta ainda pendente de moderar uma sala individual.

Bloqueio de DM impede novas operações e entregas de texto, mas uma chamada já estabelecida entre as pessoas não é encerrada automaticamente pelo bloqueio. Use Sair; moderação de comunidade/encerramento administrativo da SFU são os controles existentes. Tokens emitidos podem ser reutilizados por até cinco minutos na SFU self-hosted, conforme explicado no README.

As funcionalidades extras (enquetes, eventos, tópicos, emojis personalizados, favoritos) não foram implementadas. O produto não deve ser anunciado como equivalente completo ao Discord nem como pronto para produção pública sem validar a implantação e resolver as lacunas relevantes ao uso pretendido.

## Etapas executáveis

1. Concluído: identidade, ambiente, documentação oficial e arquitetura.
2. Concluído localmente: contas → convites → comunidade → histórico → SFU e transporte de mídia entre dois clientes.
3. Concluído: funções complementares acima, build, testes, documentação operacional e versionamento.
4. Dependência externa: domínio, host persistente e SFU pública com TURN/TLS; teste com um amigo em rede móvel.
5. Trabalho de produto pendente: funcionalidades listadas acima, conforme a prioridade do uso real.
