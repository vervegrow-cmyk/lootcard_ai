export async function chatWithKimi(params: {
  systemPrompt: string;
  userMessage: string;
  memory?: unknown;
  intent?: string;
  targetAgent?: string;
  targetSkill?: string;
  skillResult?: unknown;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const apiKey = process.env.KIMI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing required KIMI_API_KEY.");
  }

  const baseUrl = (process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1").replace(/\/+$/, "");
  const endpoint = `${baseUrl}/chat/completions`;
  const model = process.env.KIMI_MODEL || "moonshot-v1-8k";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: params.systemPrompt },
        ...(params.history || []),
        {
          role: "user",
          content: JSON.stringify(
            {
              userMessage: params.userMessage,
              memory: params.memory,
              intent: params.intent,
              targetAgent: params.targetAgent,
              targetSkill: params.targetSkill,
              skillResult: params.skillResult
            },
            null,
            2
          )
        }
      ],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kimi request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error("Kimi returned an empty reply.");
  }

  return reply;
}
