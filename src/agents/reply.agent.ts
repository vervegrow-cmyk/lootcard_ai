import { chatWithKimi } from "../services/kimi.service";
import { OrchestratorResult } from "../types/agent.types";
import { ConversationEntry, ProjectMemory } from "../types/skill.types";

const REPLY_SYSTEM_PROMPT = `
You are the final reply brain for CardForge Hermes Agent.
Your task is to turn the user's original message, the detected intent, the selected agent and skill, the structured tool result, and the current memory into a natural, accurate, and helpful final reply.

Rules:
1. If the user writes in Chinese, reply in Chinese.
2. If the user writes in English, reply in English.
3. Do not sound mechanical or repetitive.
4. Never say things like "I still remember your previous context."
5. Do not invent Shopify links.
6. Do not invent generated images.
7. If the intent is create_shopify_product_link but there is not enough confirmed design context, explain that naturally and guide the user to generate or confirm a design first.
8. If the intent is generate_images or direct_generate, actively move the image flow forward instead of asking vague follow-up questions.
9. If the tool failed, explain the actual reason.
10. Reply like a helpful human support and design consultant.
11. Follow replyInstruction with highest priority.
`.trim();

export async function generateFinalReply(input: {
  userMessage: string;
  memory?: ProjectMemory;
  intent?: string;
  targetAgent?: string;
  targetSkill?: string;
  skillResult?: unknown;
  history?: ConversationEntry[];
  replyInstruction?: string;
}): Promise<string> {
  return chatWithKimi({
    systemPrompt: REPLY_SYSTEM_PROMPT,
    userMessage: input.userMessage,
    memory: {
      ...(input.memory || {}),
      replyInstruction: input.replyInstruction || ""
    },
    intent: input.intent,
    targetAgent: input.targetAgent,
    targetSkill: input.targetSkill,
    skillResult: input.skillResult,
    history: (input.history || []).map((item) => ({
      role: item.role,
      content: item.content
    }))
  });
}

export class ReplyAgent {
  async generateReply(params: {
    userMessage: string;
    memory: ProjectMemory;
    history?: ConversationEntry[];
    result: OrchestratorResult;
  }): Promise<string> {
    return generateFinalReply({
      userMessage: params.userMessage,
      memory: params.memory,
      intent: params.result.intent,
      targetAgent: params.result.targetAgent,
      targetSkill: params.result.targetSkill,
      skillResult: params.result.skillResult,
      history: params.history,
      replyInstruction: params.result.replyInstruction
    });
  }
}

export const replyAgent = new ReplyAgent();
