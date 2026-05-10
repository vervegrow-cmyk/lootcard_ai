export type LanguagePreference = "zh" | "en";

export type ProjectStage =
  | "idle"
  | "customer_service"
  | "collecting"
  | "prompting"
  | "generating"
  | "selecting"
  | "revising"
  | "confirmed"
  | "payment"
  | "completed"
  | "draft_design"
  | "waiting_confirmation"
  | "modifying_design"
  | "creating_shopify_product"
  | "payment_stage";

export type ShippingType = "digital_download" | "physical_card_us" | "physical_card_cn";

export interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ImageOption {
  id: string;
  title: string;
  imageUrl: string;
  prompt: string;
  summary?: string;
  style?: string;
  provider?: string;
  model?: string;
}

export interface OrderDraftOption {
  id: "A" | "B" | "C";
  title: string;
  style: string;
  description: string;
  estimatedPrice: number;
  shippingType: ShippingType;
  prompt: string;
}

export interface CurrentOrderDraft {
  orderId?: string;
  orderNo?: string;
  discordUserId: string;
  stage:
    | "draft_options"
    | "option_selected"
    | "image_generated"
    | "waiting_confirmation"
    | "shopify_created"
    | "completed";
  originalMessage: string;
  options: OrderDraftOption[];
  selectedOption?: OrderDraftOption | null;
  imageUrl: string;
  productTitle: string;
  productDescription: string;
  price: string;
  shippingType: ShippingType;
  shopifyProductUrl: string;
  shopifyCheckoutUrl?: string;
  lastActiveAt?: string;
  language?: LanguagePreference;
}

export interface ProjectMemory {
  language: LanguagePreference;
  stage: ProjectStage;
  currentStage: ProjectStage;
  theme: string;
  character: string;
  style: string;
  rarity: string;
  quantity: string;
  physical_card: string;
  special_requirements: string;
  currentPrompt: string;
  currentProject: string;
  imageOptions: ImageOption[];
  selectedOption: string;
  selectedOptionTitle: string;
  selectedImageUrl: string;
  selectedDesignSummary: string;
  revisionHistory: string[];
  shopifyProductUrl: string;
  latestImageUrl: string;
  latestPrompt: string;
  latestDesignStyle: string;
  latestImageProvider: string;
  latestImageModel: string;
  latestProductTitle: string;
  latestProductDescription: string;
  latestPrice: string;
  latestShippingType: ShippingType;
  latestShopifyProductId: string;
  latestShopifyProductUrl: string;
  recentPurchaseContent: string;
  preferredStyles: string[];
  currentOrderDraft?: CurrentOrderDraft | null;
}

export interface DesignRequirements {
  theme: string;
  character: string;
  style: string;
  rarity: string;
  quantity: string;
  physical_card: string;
  special_requirements: string;
}

export interface ProductDraft {
  title: string;
  description: string;
  price: string;
  sku: string;
  tags: string[];
  imageUrl?: string;
  prompt?: string;
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

export interface SkillExecutionContext {
  discordUserId: string;
  username: string;
  message: string;
  language: LanguagePreference;
  memory: ProjectMemory;
  recentConversation: ConversationEntry[];
  project: ProjectContext | null;
  data?: Record<string, unknown>;
}

export interface SkillExecutionResult {
  reply: string;
  stage: ProjectStage;
  actions?: string[];
  memoryUpdate?: Partial<ProjectMemory>;
  data?: Record<string, unknown>;
  replyData?: Record<string, unknown>;
  prompt?: string;
  imageOptions?: ImageOption[];
  selectedOption?: ImageOption | null;
  product?: ProductDraft | null;
}

export const EMPTY_PROJECT_MEMORY: ProjectMemory = {
  language: "en",
  stage: "idle",
  currentStage: "idle",
  theme: "",
  character: "",
  style: "",
  rarity: "",
  quantity: "",
  physical_card: "",
  special_requirements: "",
  currentPrompt: "",
  currentProject: "",
  imageOptions: [],
  selectedOption: "",
  selectedOptionTitle: "",
  selectedImageUrl: "",
  selectedDesignSummary: "",
  revisionHistory: [],
  shopifyProductUrl: "",
  latestImageUrl: "",
  latestPrompt: "",
  latestDesignStyle: "",
  latestImageProvider: "",
  latestImageModel: "",
  latestProductTitle: "",
  latestProductDescription: "",
  latestPrice: "",
  latestShippingType: "physical_card_cn",
  latestShopifyProductId: "",
  latestShopifyProductUrl: "",
  recentPurchaseContent: "",
  preferredStyles: [],
  currentOrderDraft: null
};
