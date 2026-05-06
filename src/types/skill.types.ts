export type LanguagePreference = "zh" | "en";

export type ProjectStage =
  | "idle"
  | "customer_service"
  | "collecting"
  | "generating"
  | "selecting"
  | "revising"
  | "confirmed"
  | "payment"
  | "completed";

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
}

export interface ProjectMemory {
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
  currentProject: string;
  imageOptions: ImageOption[];
  selectedOption: string;
  selectedOptionTitle: string;
  selectedImageUrl: string;
  selectedDesignSummary: string;
  revisionHistory: string[];
  shopifyProductUrl: string;
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
  shopifyProductUrl: ""
};
