import {
  ConversationEntry,
  ImageOption,
  LanguagePreference,
  ProductDraft,
  ProjectMemory,
  ProjectStage,
  SkillExecutionResult
} from "./skill.types";

export type OrchestratorIntent =
  | "prompt_polish"
  | "design_start"
  | "design_collect"
  | "direct_generate"
  | "generate_images"
  | "select_image"
  | "revise_image"
  | "confirm_design"
  | "create_shopify_product_link"
  | "language_preference";

export type TargetAgent = "design" | "prompt" | "shopify" | "memory";

export type TargetSkill =
  | "collect-requirements"
  | "generate-style-options"
  | "generate-images"
  | "revise-image"
  | "select-design"
  | "polish-prompt"
  | "translate-prompt"
  | "expand-prompt"
  | "image-prompt"
  | "create-product"
  | "create-shopify-product"
  | "create-product-link"
  | "create-checkout-link"
  | "send-payment-link"
  | "save-user-preference"
  | "save-project"
  | "save-selection"
  | "save-revision";

export interface OrchestratorInput {
  discordUserId: string;
  username: string;
  message: string;
  memory: ProjectMemory;
  recentConversation: ConversationEntry[];
}

export interface OrchestratorPlan {
  intent: OrchestratorIntent;
  targetAgent: TargetAgent;
  targetSkill: TargetSkill;
  action: string;
  language: LanguagePreference;
  stage: ProjectStage;
  actions: string[];
  memoryUpdate: Partial<ProjectMemory>;
  replyInstruction: string;
  data: Record<string, unknown>;
}

export interface OrchestratorResult extends OrchestratorPlan {
  skillResult?: SkillExecutionResult;
  prompt?: string;
  imageOptions: ImageOption[];
  selectedOption: ImageOption | null;
  product: ProductDraft | null;
}
