export const legalUpdatedAt = "17 de outubro de 2026";
export const legalContactEmail = "privacidade@prismaplayer.com.br";

export type LegalSection = { title: string; body: string; items?: string[] };

/**
 * Documentos jurídicos da Prisma Player (versão 2 - global: LGPD/GDPR/CCPA).
 * Páginas: /terms, /privacy, /cookies.
 * ⚠️ PREENCHER antes da publicação final: razão social, CNPJ, endereço e comarca
 * marcados como [PREENCHER]. Revisão por advogado é obrigatória (checkpoint).
 */

export const termsSections: LegalSection[] = [
  {
    title: "1. Aceitação, escopo e elegibilidade",
    body: "Ao criar uma conta ou usar a Prisma Player, você concorda com estes Termos. Se não concordar, não use a plataforma. A Prisma Player oferece hospedagem de vídeos, player personalizável, embeds, métricas, testes A/B e ferramentas de otimização para páginas de vendas. O serviço destina-se a maiores de 18 anos; menores só podem usar com conhecimento e consentimento do responsável legal. Ao criar uma conta em nome de uma empresa, você declara ter autoridade para vinculá-la a estes Termos.",
  },
  {
    title: "2. Conta e segurança",
    body: "Você deve fornecer informações verdadeiras, proteger suas credenciais e é responsável por todas as atividades realizadas em sua conta. Notifique imediatamente usos não autorizados. Recomendamos (e podemos exigir em alguns casos) autenticação em dois fatores. Podemos bloquear acessos suspeitos ou abusivos para proteger a plataforma.",
  },
  {
    title: "3. Descrição do serviço e disponibilidade",
    body: "O serviço é fornecido \"no estado em que se encontra\", com esforço comercial razoável de disponibilidade. Não contratamos SLA específico nos planos padrão. Embeds dependem de provedores de CDN, navegadores e sites de terceiros, e podem falhar temporariamente por manutenção, eventos de força maior ou falhas fora do nosso controle.",
    items: [
      "Não garantimos aumento de vendas, conversões, receita ou desempenho de campanhas.",
      "Não garantimos disponibilidade contínua ou ausência de interrupções.",
      "Métricas e recomendações podem conter imprecisões e são apoio operacional, não promessa de resultado.",
      "Manutenções podem ocorrer com aviso prévio razoável quando possível.",
    ],
  },
  {
    title: "4. Seus vídeos e conteúdo",
    body: "Você mantém todos os direitos sobre vídeos, imagens, textos, headlines, criativos e dados que enviar (\"Conteúdo\"). Para operar o serviço, você nos concede uma licença limitada, não exclusiva e revogável de armazenar, copiar, transcodificar, cachear na borda, entregar via player e embed, gerar miniaturas e métricas do seu Conteúdo. Essa licença existe apenas enquanto o Conteúdo estiver na plataforma e cessa com a remoção, ressalvadas cópias técnicas residuais em backups por prazo limitado. Não usamos seu Conteúdo para treinar modelos de IA nem o licenciamos a terceiros.",
  },
  {
    title: "5. Papel de intermediário e responsabilidade pelo Conteúdo",
    body: "A Prisma Player é provedora de hospedagem e de meio técnico (nos termos dos arts. 18 e 19 do Marco Civil da Internet, Lei 12.965/2014). Não produzimos, não editamos, não revisamos previamente nem patrocinamos o Conteúdo dos clientes. Cada cliente é o único e exclusivo responsável pelo Conteúdo que publica, incluindo sua legalidade, veracidade e conformidade com direitos de terceiros. Nos tornaremos responsáveis por Conteúdo de terceiro apenas nas hipóteses legais, após ordem judicial específica (art. 19 do Marco Civil).",
    items: [
      "Não respondemos por vídeos, afirmações, ofertas ou páginas de venda criadas por clientes.",
      "Podemos remover ou despublicar Conteúdo mediante notificação válida, ordem judicial ou por risco à plataforma.",
      "Ferramentas anti-download e marca d'água são medidas de proteção, não garantia absoluta contra cópia.",
    ],
  },
  {
    title: "6. Notificações de direitos autorais e remoção (DMCA / Marco Civil)",
    body: "Se você é titular de direitos e identifica um player da Prisma Player veiculando material protegido sem autorização, envie notificação para " + legalContactEmail + " contendo: identificação da obra, URL do player em questão, seus dados de contato, declaração de boa-fé de que o uso não é autorizado e, sob as penas da lei aplicável, declaração de veracidade. Analisaremos e poderemos remover o material de forma preventiva. O cliente notificado pode apresentar contranotificação. Contas com notificações recorrentes de violação podem ser encerradas.",
  },
  {
    title: "7. Conduta proibida",
    body: "Ao usar a plataforma, é proibido:",
    items: [
      "Publicar conteúdo ilegal, obsceno, difamatório, que incite violência ou viole direitos de terceiros.",
      "Veicular material sem licença (música, imagens, filmes, marcas) ou que viole direitos de imagem e privacidade.",
      "Fazer afirmações enganosas ou fraudulentas, incluindo promessas de rendimento garantido, curas de saúde ou retornos de investimento irreais.",
      "Distribuir malware, phishing ou realizar engenharia social através dos players.",
      "Burlar limites técnicos, proteções anti-download, cotas ou rate limits; realizar scraping, engenharia reversa ou testes de carga sem autorização por escrito.",
      "Coletar dados de espectadores em desacordo com leis de privacidade aplicáveis.",
      "Revender o serviço sem autorização expressa ou atacar a infraestrutura da Prisma Player.",
    ],
  },
  {
    title: "8. Afirmações comerciais e conformidade das campanhas",
    body: "As campanhas publicadas com a Prisma Player são de responsabilidade integral de cada cliente. O cliente declara que suas ofertas, depoimentos, garantias e provas sociais cumprem as normas de publicidade e defesa do consumidor aplicáveis ao seu público (incluindo CONAR e CDC no Brasil, FTC Act nos Estados Unidos e legislações equivalentes na União Europeia e demais países). Isenta a Prisma Player de qualquer reclamação, sanção ou prejuízo decorrente do conteúdo de suas campanhas.",
  },
  {
    title: "9. Métricas, testes A/B e Prisma IA",
    body: "Métricas, testes A/B e sugestões geradas por IA são ferramentas de apoio. A IA processa configurações e trechos do seu Conteúdo por provedores especializados apenas para gerar as sugestões solicitadas; o resultado pode conter imprecisões. Decisões comerciais e a interpretação dos dados são suas. Nenhuma funcionalidade constitui aconselhamento jurídico, financeiro ou de marketing.",
  },
  {
    title: "10. Planos, limites e excedentes",
    body: "Cada plano possui limites de plays, armazenamento, membros e créditos de IA, exibidos na plataforma. Podemos medir o uso, cobrar excedentes conforme as regras do plano e aplicar upgrades, downgrades ou ajustes proporcionais. O monitoramento de consumo é responsabilidade do cliente.",
  },
  {
    title: "11. Pagamentos, assinatura e reembolso",
    body: "Assinaturas são cobradas de forma recorrente e automática (cartão via Stripe; Pix via AbacatePay) até o cancelamento, que pode ser feito a qualquer momento pelo painel, com efeito ao fim do período vigente. Moeda, valor e periodicidade são exibidos antes da contratação; avisos de reajuste são enviados com antecedência.",
    items: [
      "Consumidores brasileiros têm direito de arrependimento em até 7 dias da contratação (art. 49 do CDC); após consumo relevante do serviço (armazenamento, plays ou créditos utilizados), podemos deduzir proporcionalmente o valor usado.",
      "Chargebacks indevidos podem resultar em suspensão da conta e cobrança dos valores contestados.",
      "Impostos e obrigações fiscais sobre suas vendas são de sua responsabilidade.",
      "Não armazenamos dados completos de cartão: o processamento é feito pelos provedores de pagamento.",
    ],
  },
  {
    title: "12. Suspensão e encerramento",
    body: "Podemos suspender ou encerrar contas por violação destes Termos, inadimplência, risco à segurança, ordem judicial ou determinação legal, com comunicação quando razoável. Ao encerrar, seus players são despublicados e você pode exportar seus dados por um prazo razoável, observadas obrigações legais e técnicas; após esse prazo, Conteúdo e dados podem ser eliminados.",
  },
  {
    title: "13. Limitação de responsabilidade",
    body: "Na máxima extensão permitida pela lei aplicável, a Prisma Player não responde por danos indiretos, lucros cessantes, perda de dados do cliente (mantenha cópias próprias), perda de audiência ou receita, nem por atos de terceiros e provedores. Nossa responsabilidade contratual total, somada, é limitada aos valores pagos por você nos últimos 12 (doze) meses. Nada aqui exclui responsabilidades que não podem ser renunciadas pela lei do seu país ou estado - em especial direitos irrenunciáveis de consumidores.",
  },
  {
    title: "14. Indenização",
    body: "Você indeniza e isenta a Prisma Player de reclamações, processos, sanções, prejuízos e honorários advocatícios razoáveis decorrentes de: (a) seu Conteúdo; (b) violação destes Termos ou de direitos de terceiros; (c) coleta ou tratamento de dados de espectadores feita por você; (d) obrigações tributárias sobre suas vendas. Essa indenização não se aplica ao que for causado exclusivamente por culpa da Prisma Player.",
  },
  {
    title: "15. Propriedade intelectual da plataforma",
    body: "A marca Prisma Player, o software, o player, o design, a documentação e os materiais da plataforma são propriedade da Prisma Player. Você recebe apenas a licença de uso do serviço, conforme estes Termos. Não é permitido usar marcas, códigos ou materiais da plataforma fora do serviço sem autorização.",
  },
  {
    title: "16. Privacidade e dados de espectadores",
    body: "Nosso tratamento de dados pessoais está descrito na Política de Privacidade. Em relação aos dados de espectadores dos players, cada cliente atua como controlador dos dados que decide coletar (pixels, formulários, consentimentos), e a Prisma Player atua como operadora, fornecendo ferramentas como banner de consentimento, restrição por domínio e proteção anti-download. O cliente é responsável por informar seus visitantes e obter os consentimentos exigidos pelas leis aplicáveis (LGPD, GDPR, CCPA e equivalentes).",
  },
  {
    title: "17. Alterações dos Termos",
    body: "Podemos atualizar estes Termos para refletir novos recursos, mudanças operacionais ou exigências legais. Alterações relevantes serão comunicadas com pelo menos 30 dias de antecedência por e-mail ou aviso na plataforma. O uso contínuo após o prazo caracteriza aceitação; se não concordar, você pode encerrar a conta.",
  },
  {
    title: "18. Lei aplicável, foro e disposições gerais",
    body: "Estes Termos são regidos pelas leis da República Federativa do Brasil, sem prejuízo de normas imperativas do local do consumidor. Fica eleito o foro do domicílio da controladora, [PREENCHER: COMARCA/CIDADE], salvo se a lei aplicável garantir ao consumidor o foro do seu domicílio. Se qualquer cláusula for considerada inválida, as demais permanecem válidas (severabilidade). Não exercer um direito não significa renunciá-lo. Estes Termos, com a Política de Privacidade e a Política de Cookies, formam o acordo integral. Eventuais conflitos serão precedidos de tentativa de resolução amigável por 30 dias. Controladora: [PREENCHER: RAZÃO SOCIAL], CNPJ [PREENCHER], endereço [PREENCHER].",
  },
];

export const privacySections: LegalSection[] = [
  {
    title: "1. Resumo",
    body: "A Prisma Player hospeda e entrega vídeos de venda para clientes no mundo todo. Tratamos os dados da sua conta para operar o serviço; para dados de espectadores dos players, agimos por conta e ordem dos nossos clientes. Não vendemos dados pessoais. Você pode exercer seus direitos a qualquer momento pelo canal indicado nesta política.",
  },
  {
    title: "2. Controladora e encarregado (DPO)",
    body: "Controladora: [PREENCHER: RAZÃO SOCIAL], CNPJ [PREENCHER], endereço [PREENCHER]. Para exercício de direitos, dúvidas ou reclamações, fale com nosso encarregado pelo e-mail " + legalContactEmail + ". Atuamos como controladora dos dados da conta do cliente e como operadora dos dados de espectadores processados em nome dos clientes.",
  },
  {
    title: "3. Dados que tratamos",
    body: "Tratamos apenas os dados necessários para operar o serviço:",
    items: [
      "Conta: nome, e-mail, telefone (se informado), dados de equipe e de autenticação.",
      "Cobrança: processada por Stripe (cartão) e AbacatePay (Pix); não armazenamos o número completo do cartão.",
      "Conteúdo e configuração: vídeos enviados, títulos, configurações de player, domínios permitidos e textos de campanha.",
      "Espectadores dos players: endereço IP, país aproximado, tipo de dispositivo e navegador, identificadores técnicos de sessão e de navegador, progresso de visualização, interações (play, CTA) e eventos de conversão enviados pela página do cliente.",
      "Segurança: logs de acesso, tentativas de abuso e verificações antifraude.",
      "Comunicações: e-mails transacionais e, com seu consentimento, comunicados sobre o serviço.",
    ],
  },
  {
    title: "4. Finalidades e bases legais",
    body: "Tratamos dados pessoais com base na LGPD (art. 7º) e no GDPR (art. 6º):",
    items: [
      "Execução do contrato: entregar o serviço contratado (hospedagem, player, métricas, embeds).",
      "Cumprimento de obrigação legal: retenção fiscal, resposta a ordens judiciais e authorities.",
      "Legítimo interesse: segurança da plataforma, prevenção a fraude e pirataria, medição agregada e melhorias.",
      "Consentimento: comunicações de marketing e cookies e pixels onde exigido - retirável a qualquer momento.",
    ],
  },
  {
    title: "5. Cookies e tecnologias similares",
    body: "Usamos cookies e armazenamento local do navegador em categorias: essenciais (sessão da conta e prova de segurança do player), funcionais (retomada do vídeo, preferências), analytics e marketing. A Política completa, com a lista principal e como gerenciar, está em /cookies. Clientes podem ativar nas configurações do player um banner de consentimento para o público deles.",
  },
  {
    title: "6. Publicidade e medição (pixels e APIs)",
    body: "Conforme configurado por cada cliente, eventos do player podem ser enviados a plataformas de anúncios e medição (Google Analytics, Meta, TikTok, PostHog), com identificadores tratados por hash. Esses envios servem para medir audiência e conversões das campanhas do cliente. Espectadores podem desativar essas tecnologias pelas opções em /cookies e pelas ferramentas de opt-out das próprias plataformas.",
  },
  {
    title: "7. Compartilhamento com terceiros",
    body: "Compartilhamos dados apenas com fornecedores necessários à operação, sob contratos de proteção, e jamais vendemos dados pessoais. Categorias e exemplos atuais:",
    items: [
      "Pagamentos: Stripe, AbacatePay.",
      "Infraestrutura: Neon (banco de dados e autenticação), Cloudflare (armazenamento e CDN), Vercel (hospedagem).",
      "Medição e publicidade (conforme configuração do cliente): Google Analytics, Meta, TikTok, PostHog.",
      "E-mail transacional: Resend.",
      "Inteligência artificial: provedores de IA (como NVIDIA) para as funcionalidades de IA do serviço.",
      "Antifraude: verificação de IP contra listas de proxy/VPN (proxycheck.io).",
      "Autoridades e terceiros: somente quando exigido por lei ou para proteger direitos, após avaliação da legalidade.",
    ],
  },
  {
    title: "8. Transferência internacional",
    body: "Parte dos fornecedores processa dados fora do Brasil e do Espaço Econômico Europeu (ex.: EUA). Nesses casos, utilizamos garantias reconhecidas, como cláusulas contratuais padrão (SCCs), decisões de adequação e medidas técnicas suplementares de segurança, nos termos da LGPD, do GDPR e de normas equivalentes.",
  },
  {
    title: "9. Retenção e eliminação",
    body: "Mantemos dados pelo tempo necessário para as finalidades informadas: enquanto a conta estiver ativa e, após o encerramento, pelo prazo necessário para exportação e obrigações legais (incluindo retenção fiscal brasileira). Eventos de audiência têm períodos de retenção configuráveis por categoria, com mecanismos automáticos de expurgo. Ao fim do ciclo, dados são excluídos, anonimizados ou agregados de forma irreversível, ressalvadas obrigações legais.",
  },
  {
    title: "10. Seus direitos",
    body: "Você pode solicitar a qualquer momento pelo e-mail " + legalContactEmail + ":",
    items: [
      "LGPD (art. 18): confirmação do tratamento, acesso, correção, anonimização, portabilidade, eliminação, informação sobre compartilhamentos, informação sobre a possibilidade de não consentir e revogação do consentimento - resposta em até 15 dias (art. 19).",
      "GDPR (UE/Espanha): acesso, retificação, apagamento, restrição, portabilidade, oposição e reclamação à autoridade de controle (ex.: AEPD na Espanha) - resposta em até 30 dias, prorrogáveis com aviso.",
      "CCPA/CPRA (Califórnia): conhecer, excluir e corrigir dados, além do direito de não ter dados pessoais vendidos ou compartilhados para publicidade - não vendemos dados e respeitamos os sinais de Global Privacy Control (GPC).",
      "Espectadores de players: solicitações podem ser dirigidas ao site que publicou o vídeo (nosso cliente, controlador) ou a nós como operadora, que encaminharemos ao cliente responsável.",
    ],
  },
  {
    title: "11. Decisões automatizadas",
    body: "Não realizamos decisões automatizadas com efeitos jurídicos sobre titulares. Testes A/B distribuem versões de forma aleatória para fins de medição; sugestões de IA são recomendações não vinculantes revisáveis pelo cliente.",
  },
  {
    title: "12. Menores",
    body: "O serviço não é direcionado a menores de 18 anos. Não criamos perfis de crianças e adolescentes. Se identificarmos tratamento indevido de dados de menores, tomaremos medidas para removê-lo. Responsáveis podem solicitar a exclusão de dados de menores pelo canal do encarregado. Os clientes são responsáveis pela idade da audiência das campanhas que publicam.",
  },
  {
    title: "13. Segurança e incidentes",
    body: "Aplicamos controles apropriados: criptografia em tráfego, URLs de vídeo assinadas e de curta duração, isolamento de dados por conta, controle de acesso por papéis, registros de segurança e limites de requisições. Nenhum sistema é imune a riscos; em caso de incidente relevante com risco a titulares, notificaremos a ANPD (Brasil), as autoridades europeias aplicáveis e os afetados dentro dos prazos legais (inclusive 72 horas do GDPR quando cabível).",
  },
  {
    title: "14. Mudanças e histórico",
    body: "Esta política pode ser atualizada para refletir mudanças legais ou operacionais. Alterações relevantes serão comunicadas por e-mail ou aviso na plataforma, com indicação da data de vigência no topo.",
  },
];

export const cookieSections: LegalSection[] = [
  {
    title: "1. O que são cookies e tecnologias similares",
    body: "Cookies são pequenos arquivos que sites e players salvam no seu navegador. Também usamos armazenamento local (localStorage) para funções do player. Usamos essas tecnologias para o serviço funcionar, para medir audiência e - quando você permite - para publicidade.",
  },
  {
    title: "2. Cookies essenciais",
    body: "Sempre ativos, sem eles o serviço não funciona:",
    items: [
      "Sessão da conta: mantém você autenticado na Prisma Player.",
      "Prova de segurança do player (pp_embed): cookie técnico HttpOnly que valida que o player foi renderizado por um navegador real, prevenindo roubo automatizado de vídeos. Não rastreia pessoas.",
      "Preferências mínimas: idioma e segurança.",
    ],
  },
  {
    title: "3. Cookies funcionais",
    body: "Melhoram a experiência do espectador:",
    items: [
      "Retomada de vídeo: guarda o ponto onde você parou de assistir.",
      "Identificador técnico do navegador: distingue sessões para métricas de audiência e testes A/B, sem identificar quem você é.",
      "Preferências do player: volume, velocidade e escolhas de versão do teste A/B.",
    ],
  },
  {
    title: "4. Analytics (medição)",
    body: "Nos ajudam a entender, de forma agregada, como o site e os players são usados: Google Analytics e PostHog. Os dados servem para melhorar desempenho e produto. Podem ser desativados sem quebrar o serviço.",
  },
  {
    title: "5. Marketing e publicidade",
    body: "Conforme configurado pelo cliente que publica o vídeo e consentido por você, eventos do player podem ser enviados para plataformas de anúncios: Meta (Pixel e Conversions API) e TikTok (Events API). Identificadores são tratados por hash. Serve para medir e otimizar campanhas - nunca para vender seus dados.",
  },
  {
    title: "6. Como gerenciar seus cookies",
    body: "Você escolhe o que permite:",
    items: [
      "Banner de consentimento: clientes podem ativar no player um aviso com botões aceitar/recusar.",
      "Navegador: bloqueie ou limpe cookies nas configurações (Chrome, Safari, Edge, Firefox).",
      "Global Privacy Control (GPC): respeitamos o sinal como pedido de não compartilhamento (CCPA/CPRA).",
      "Opt-out das plataformas: use as ferramentas de controle da Meta, TikTok e Google.",
    ],
  },
  {
    title: "7. Políticas de terceiros",
    body: "Cada plataforma tem sua própria política: Google (policies.google.com/technologies/cookies), Meta (facebook.com/privacy/policies/cookies) e TikTok (tiktok.com/legal/page/row/cookie-policy). Recomendamos revisá-las.",
  },
  {
    title: "8. Contato e atualizações",
    body: "Dúvidas sobre cookies: " + legalContactEmail + ". Esta política pode ser atualizada; a data de vigência está no topo. Mudanças relevantes serão comunicadas no site.",
  },
];
