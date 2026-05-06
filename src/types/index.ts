export type ProjectStage =
  | "idle"
  | "prompting"
  | "generating"
  | "selecting"
  | "revising"
  | "confirmed"
  | "payment";

export type LanguagePreference = "zh" | "en";

export type HermesIntent =
  | "answer_question"
  | "polish_prompt"
  | "generate_images"
  | "select_image"
  | "revise_image"
  | "create_shopify_product"
  | "language_preference";

export type HermesAction =
  | "reply"
  | "polish_prompt"
  | "generate_images"
  | "select_image"
  | "revise_image"
  | "create_shopify_product";

export interface CardRequirements {
  theme: string;
  character: string;
  style: string;
  rarity: string;
  quantity: string;
  physical_card: string;
  special_requirements: string;
}

export interface ImageOption {
  id: string;
  title: string;
  imageUrl: string;
  prompt: string;
}

export interface ShopifyProductDraft {
  title: string;
  description: string;
  price: string;
  sku: string;
  tags: string[];
}

export interface ProjectContext {
  projectId: string;
  status: ProjectStage;
  originalPrompt: string;
  currentPrompt: string;
  selectedOptionId?: string | null;
  finalDesignSummary?: string | null;
  shopifyProductId?: string | null;
  shopifyProductUrl?: string | null;
}

export interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface DiscordInboundMessage {
  discordUserId: string;
  username: string;
  channelId: string;
  content: string;
}

export interface ShopifyProductResult {
  id: string;
  handle: string;
  url: string;
  title: string;
  price: string;
  sku: string;
}

export interface FeedbackOptimization {
  optimized_prompt: string;
  change_summary: string;
}

export interface PromptPolishResult {
  polished_prompt: string;
  explanation: string;
}

export interface HermesMemory {
  language: LanguagePreference;
  stage: ProjectStage;
  theme: string;
  character: string;
  style: string;
  rarity: string;
  quantity: string;
  physical_card: string;
  special_requirements: string;
  currentPrompt: string;
  selectedOption: string;
  selectedOptionTitle: string;
  selectedImageUrl: string;
  selectedDesignSummary: string;
  revisionHistory: string[];
}

export interface UserMemorySnapshot {
  discordUserId: string;
  username: string;
  profile: string;
  memory: HermesMemory;
}

export interface HermesInput {
  discordUserId: string;
  username: string;
  message: string;
  memory: HermesMemory;
  recentConversation: ConversationEntry[];
}

export interface HermesResult {
  intent: HermesIntent;
  action: HermesAction;
  stage: ProjectStage;
  language: LanguagePreference;
  reply: string;
  memory_update: Partial<HermesMemory>;
  prompt: string;
  image_options: ImageOption[];
  selected_option: ImageOption | null;
  product: ShopifyProductDraft | null;
  project?: ProjectContext | null;
}

export const EMPTY_REQUIREMENTS: CardRequirements = {
  theme: "",
  character: "",
  style: "",
  rarity: "",
  quantity: "",
  physical_card: "",
  special_requirements: ""
};

export const EMPTY_HERMES_MEMORY: HermesMemory = {
  language: "en",
  stage: "idle",
  theme: "",
  character: "",
  style: "",
  rarity: "",
  quantity: "",
  physical_card: "",
  special_requirements: "",
  currentPrompt: "",
  selectedOption: "",
  selectedOptionTitle: "",
  selectedImageUrl: "",
  selectedDesignSummary: "",
  revisionHistory: []
};

export function memoryToRequirements(memory: HermesMemory): CardRequirements {
  return {
    theme: memory.theme,
    character: memory.character,
    style: memory.style,
    rarity: memory.rarity,
    quantity: memory.quantity,
    physical_card: memory.physical_card,
    special_requirements: memory.special_requirements
  };
}
