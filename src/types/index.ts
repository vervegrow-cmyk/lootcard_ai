export type ProjectStage =
  | "inquiry"
  | "collecting"
  | "generating"
  | "selecting"
  | "revising"
  | "confirmed"
  | "payment"
  | "completed";

export interface CardRequirements {
  theme: string;
  character: string;
  style: string;
  rarity: string;
  card_text: string;
  quantity: string;
  physical_card: string;
  special_requirements: string;
}

export interface StyleOption {
  style_id: string;
  style_name: string;
  design_summary: string;
  image_prompt: string;
  suggested_title: string;
  image_url?: string;
}

export interface ShopifyProductDraft {
  title: string;
  description: string;
  price: string;
  sku: string;
  tags: string[];
}

export interface AgentResult {
  action: "chat" | "show_style_options" | "revise_design" | "create_shopify_product";
  reply: string;
  stage: ProjectStage;
  requirements: CardRequirements;
  style_options: StyleOption[];
  product: ShopifyProductDraft | null;
}

export interface ProjectContext {
  projectId: string;
  status: ProjectStage;
  originalPrompt: string;
  currentPrompt: string;
  selectedStyleId?: string | null;
  finalDesignSummary?: string | null;
  shopifyProductId?: string | null;
  shopifyProductUrl?: string | null;
}

export interface UserMemorySnapshot {
  discordUserId: string;
  username: string;
  profile: string;
  stage: ProjectStage;
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

export const EMPTY_REQUIREMENTS: CardRequirements = {
  theme: "",
  character: "",
  style: "",
  rarity: "",
  card_text: "",
  quantity: "",
  physical_card: "",
  special_requirements: ""
};
