import type { AppLocale } from "./types";

export const uiMessages = {
  "pt-BR": {
    language: "Idioma", account: "Conta", administration: "Administração", logout: "Sair",
    videos: "Meus vídeos", abTests: "Testes A/B", security: "Segurança", conversions: "Conversões",
    intelligence: "Inteligência", settings: "Configurações", plan: "Plano", help: "Ajuda",
  },
  "en-US": {
    language: "Language", account: "Account", administration: "Administration", logout: "Sign out",
    videos: "My videos", abTests: "A/B tests", security: "Security", conversions: "Conversions",
    intelligence: "Intelligence", settings: "Settings", plan: "Plan", help: "Help",
  },
  "es-ES": {
    language: "Idioma", account: "Cuenta", administration: "Administración", logout: "Cerrar sesión",
    videos: "Mis videos", abTests: "Pruebas A/B", security: "Seguridad", conversions: "Conversiones",
    intelligence: "Inteligencia", settings: "Configuración", plan: "Plan", help: "Ayuda",
  },
} as const;

export type UiKey = keyof typeof uiMessages["pt-BR"];
export function message(locale: AppLocale, key: UiKey) { return uiMessages[locale][key]; }

const en: Record<string, string> = {
  "R$ 97": "$19", "R$ 197": "$39", "R$ 397": "$79",
  "Idioma": "Language", "Conta": "Account", "Administração": "Administration", "Sair": "Sign out",
  "Meus vídeos": "My videos", "Testes A/B": "A/B tests", "Segurança": "Security", "Conversões": "Conversions",
  "Inteligência": "Intelligence", "Configurações": "Settings", "Plano": "Plan", "Ajuda": "Help",
  "Abrir menu": "Open menu", "Fechar menu": "Close menu", "Expandir barra lateral": "Expand sidebar", "Recolher barra lateral": "Collapse sidebar",
  "Plano e pagamentos": "Plan and payments", "Planos Prisma": "Prisma plans", "Plano ativo": "Active plan", "Escolha seu acesso": "Choose your access",
  "Teste grátis, assinatura e créditos da Prisma IA em um só lugar.": "Free trial, subscription and Prisma AI credits in one place.",
  "Todas as funcionalidades de personalização e conversão": "All personalization and conversion features",
  "Analytics completo, retenção e funil da VSL": "Complete analytics, retention and VSL funnel",
  "Testes A/B de vídeos e proteção por domínio": "Video A/B testing and domain protection",
  "Pixels e integrações de conversão": "Pixels and conversion integrations",
  "Mais escolhido": "Most popular", "Escolher dentro do app": "Choose inside the app", "Criar conta grátis": "Create free account", "Já tenho conta": "I already have an account",
  "Toda a tecnologia.": "All the technology.", "O plano certo para seu volume.": "The right plan for your scale.",
  "Crie sua conta, teste tudo por 14 dias e assine somente quando fizer sentido.": "Create your account, try everything for 14 days, and subscribe only when it makes sense.",
  "14 dias grátis, sem cartão": "14 days free, no card required", "/mês": "/month", "plays incluídos": "plays included", "GB na biblioteca": "GB in your library",
  "Créditos Prisma IA": "Prisma AI credits", "créditos": "credits", "Saldo atual": "Current balance", "Os créditos não expiram.": "Credits do not expire.",
  "Visão geral": "Overview", "Retenção": "Retention", "Funil": "Funnel", "Público": "Audience", "Tecnologia": "Technology", "Origem": "Source", "Ao vivo": "Live",
  "Ask IA": "Ask AI", "Nova conversa": "New conversation", "Histórico": "History", "conversas": "conversations", "Suas análises aparecerão aqui.": "Your analyses will appear here.",
  "Como posso ajudar sua VSL?": "How can I help your VSL?", "Eu leio as métricas reais e sugiro próximos passos.": "I read real metrics and suggest the next best steps.",
  "Especialista em VSL": "VSL specialist", "Testes sugeridos": "Suggested tests", "Analisando retenção, funil e sinais de campanha...": "Analyzing retention, funnel and campaign signals...",
  "Todos os vídeos": "All videos", "Nova VSL": "New VSL", "Adicionar vídeo": "Add video", "Nova pasta": "New folder", "Upload": "Upload", "Publicados": "Published", "Rascunhos": "Drafts", "Processando": "Processing",
  "Buscar por nome da VSL": "Search VSL by name", "Criado em": "Created on", "Plays": "Plays", "Ações": "Actions", "Editar e personalizar": "Edit and customize", "Ver Analytics": "View analytics", "Copiar código embed": "Copy embed code", "Abrir player": "Open player",
  "Personalização": "Customization", "Estilo": "Style", "Progresso inteligente": "Smart progress", "Headlines": "Headlines", "Mini-ganchos": "Mini-hooks", "Filtro de tráfego": "Traffic filter", "Botões de ação": "Action buttons", "Continuar assistindo": "Continue watching", "Legendas": "Captions", "Anti-download": "Anti-download", "Opções de reprodução": "Playback options",
  "Prévia ao vivo": "Live preview", "Timeline": "Timeline", "Vídeo": "Video", "Salvar": "Save", "Salvo": "Saved", "Apagar": "Delete", "Voltar aos vídeos": "Back to videos",
  "Perfil e preferências": "Profile and preferences", "Dados pessoais": "Personal details", "Nome completo": "Full name", "Telefone": "Phone", "E-mail": "Email", "Notificações": "Notifications", "Salvar alterações": "Save changes",
  "Equipe": "Team", "Membros": "Members", "Convidar membro": "Invite member", "Administrador": "Administrator", "Analista": "Analyst", "Visualizador": "Viewer", "Proprietário": "Owner",
};

const es: Record<string, string> = {
  "R$ 97": "18 €", "R$ 197": "36 €", "R$ 397": "72 €",
  "Idioma": "Idioma", "Conta": "Cuenta", "Administração": "Administración", "Sair": "Cerrar sesión",
  "Meus vídeos": "Mis videos", "Testes A/B": "Pruebas A/B", "Segurança": "Seguridad", "Conversões": "Conversiones",
  "Inteligência": "Inteligencia", "Configurações": "Configuración", "Plano": "Plan", "Ajuda": "Ayuda",
  "Abrir menu": "Abrir menú", "Fechar menu": "Cerrar menú", "Expandir barra lateral": "Expandir barra lateral", "Recolher barra lateral": "Contraer barra lateral",
  "Plano e pagamentos": "Plan y pagos", "Planos Prisma": "Planes Prisma", "Plano ativo": "Plan activo", "Escolha seu acesso": "Elige tu acceso",
  "Teste grátis, assinatura e créditos da Prisma IA em um só lugar.": "Prueba gratis, suscripción y créditos de Prisma IA en un solo lugar.",
  "Todas as funcionalidades de personalização e conversão": "Todas las funciones de personalización y conversión",
  "Analytics completo, retenção e funil da VSL": "Analytics completo, retención y embudo de la VSL",
  "Testes A/B de vídeos e proteção por domínio": "Pruebas A/B de video y protección por dominio",
  "Pixels e integrações de conversão": "Píxeles e integraciones de conversión",
  "Mais escolhido": "Más elegido", "Escolher dentro do app": "Elegir dentro de la app", "Criar conta grátis": "Crear cuenta gratis", "Já tenho conta": "Ya tengo una cuenta",
  "Toda a tecnologia.": "Toda la tecnología.", "O plano certo para seu volume.": "El plan adecuado para tu volumen.",
  "Crie sua conta, teste tudo por 14 dias e assine somente quando fizer sentido.": "Crea tu cuenta, prueba todo durante 14 días y suscríbete solo cuando tenga sentido.",
  "14 dias grátis, sem cartão": "14 días gratis, sin tarjeta", "/mês": "/mes", "plays incluídos": "reproducciones incluidas", "GB na biblioteca": "GB en la biblioteca",
  "Créditos Prisma IA": "Créditos Prisma IA", "créditos": "créditos", "Saldo atual": "Saldo actual", "Os créditos não expiram.": "Los créditos no caducan.",
  "Visão geral": "Resumen", "Retenção": "Retención", "Funil": "Embudo", "Público": "Audiencia", "Tecnologia": "Tecnología", "Origem": "Origen", "Ao vivo": "En vivo",
  "Ask IA": "Preguntar a IA", "Nova conversa": "Nueva conversación", "Histórico": "Historial", "conversas": "conversaciones", "Suas análises aparecerão aqui.": "Tus análisis aparecerán aquí.",
  "Como posso ajudar sua VSL?": "¿Cómo puedo ayudar a tu VSL?", "Eu leio as métricas reais e sugiro próximos passos.": "Leo métricas reales y sugiero los próximos pasos.",
  "Especialista em VSL": "Especialista en VSL", "Testes sugeridos": "Pruebas sugeridas", "Analisando retenção, funil e sinais de campanha...": "Analizando retención, embudo y señales de campaña...",
  "Todos os vídeos": "Todos los videos", "Nova VSL": "Nueva VSL", "Adicionar vídeo": "Añadir video", "Nova pasta": "Nueva carpeta", "Upload": "Subir", "Publicados": "Publicados", "Rascunhos": "Borradores", "Processando": "Procesando",
  "Buscar por nome da VSL": "Buscar VSL por nombre", "Criado em": "Creado el", "Plays": "Reproducciones", "Ações": "Acciones", "Editar e personalizar": "Editar y personalizar", "Ver Analytics": "Ver analytics", "Copiar código embed": "Copiar código embed", "Abrir player": "Abrir player",
  "Personalização": "Personalización", "Estilo": "Estilo", "Progresso inteligente": "Progreso inteligente", "Headlines": "Titulares", "Mini-ganchos": "Mini-ganchos", "Filtro de tráfego": "Filtro de tráfico", "Botões de ação": "Botones de acción", "Continuar assistindo": "Continuar viendo", "Legendas": "Subtítulos", "Anti-download": "Antidescarga", "Opções de reprodução": "Opciones de reproducción",
  "Prévia ao vivo": "Vista previa en vivo", "Timeline": "Línea de tiempo", "Vídeo": "Video", "Salvar": "Guardar", "Salvo": "Guardado", "Apagar": "Eliminar", "Voltar aos vídeos": "Volver a los videos",
  "Perfil e preferências": "Perfil y preferencias", "Dados pessoais": "Datos personales", "Nome completo": "Nombre completo", "Telefone": "Teléfono", "E-mail": "Correo electrónico", "Notificações": "Notificaciones", "Salvar alterações": "Guardar cambios",
  "Equipe": "Equipo", "Membros": "Miembros", "Convidar membro": "Invitar miembro", "Administrador": "Administrador", "Analista": "Analista", "Visualizador": "Lector", "Proprietário": "Propietario",
};

export const legacyTranslations: Record<Exclude<AppLocale, "pt-BR">, Record<string, string>> = { "en-US": en, "es-ES": es };
