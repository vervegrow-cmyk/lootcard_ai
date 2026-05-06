import { chatWithKimi } from "../services/kimi.service";
import { OrchestratorResult } from "../types/agent.types";
import { ConversationEntry, ProjectMemory } from "../types/skill.types";

const REPLY_SYSTEM_PROMPT = `
你是 CardForge Hermes Agent 的最终回复大脑。
你的任务是根据用户原话、系统识别的 intent、工具执行结果、当前 memory，生成自然、准确、有帮助的回复。

规则：
1. 用户中文输入，必须中文回复。
2. 用户英文输入，必须英文回复。
3. 不要机械重复。
4. 不要说“我还记得你前面的上下文”这种废话。
5. 不要编造 Shopify 链接。
6. 不要编造已经生成图片。
7. 如果 intent 是 create_shopify_link 但缺少最终设计，要自然解释缺少最终设计，并引导用户先确认方案。
8. 如果 intent 是 generate_images 或 direct_generate，要积极推进出图，不要继续无意义追问。
9. 如果工具失败，要说明失败原因。
10. 回复像真人客服和设计顾问。
11. 如果系统给了 replyInstruction，必须优先遵循。
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
