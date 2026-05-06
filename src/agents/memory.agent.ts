import { saveProjectSkill } from "../skills/memory/save-project.skill";
import { saveRevisionSkill } from "../skills/memory/save-revision.skill";
import { saveSelectionSkill } from "../skills/memory/save-selection.skill";
import { saveUserPreferenceSkill } from "../skills/memory/save-user-preference.skill";
import { OrchestratorResult } from "../types/agent.types";
import { ProjectMemory, SkillExecutionContext } from "../types/skill.types";

export class MemoryAgent {
  async persist(params: {
    discordUserId: string;
    username: string;
    message: string;
    language: "zh" | "en";
    memory: ProjectMemory;
    recentConversation: SkillExecutionContext["recentConversation"];
    project: SkillExecutionContext["project"];
    result: OrchestratorResult;
  }): Promise<void> {
    const nextMemory: ProjectMemory = {
      ...params.memory,
      ...params.result.memoryUpdate,
      language: params.result.language,
      stage: params.result.stage,
      imageOptions: params.result.imageOptions.length > 0 ? params.result.imageOptions : params.memory.imageOptions,
      currentProject: params.project?.projectId || params.memory.currentProject,
      shopifyProductUrl:
        (params.result.memoryUpdate.shopifyProductUrl as string | undefined) ||
        params.memory.shopifyProductUrl
    };

    const context: SkillExecutionContext = {
      discordUserId: params.discordUserId,
      username: params.username,
      message: params.message,
      language: params.language,
      memory: nextMemory,
      recentConversation: params.recentConversation,
      project: params.project
    };

    await saveUserPreferenceSkill.execute(context);
    await saveProjectSkill.execute(context);

    if (nextMemory.selectedOption) {
      await saveSelectionSkill.execute(context);
    }

    if (nextMemory.revisionHistory.length > 0) {
      await saveRevisionSkill.execute(context);
    }
  }
}

export const memoryWorkflowAgent = new MemoryAgent();
