require("dotenv").config();

const providers = [
  {
    name: "kimi",
    keyEnv: "KIMI_API_KEY",
    modelEnv: "KIMI_MODEL",
    defaultModel: "moonshot-v1-8k",
    endpoint: "https://api.moonshot.cn/v1/chat/completions",
    type: "openai-compatible"
  },
  {
    name: "anthropic",
    keyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    defaultModel: "claude-3-5-sonnet-20241022",
    endpoint: "https://api.anthropic.com/v1/messages",
    type: "anthropic"
  },
  {
    name: "openai",
    keyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4o-mini",
    endpoint: "https://api.openai.com/v1/chat/completions",
    type: "openai-compatible"
  },
  {
    name: "openrouter",
    keyEnv: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    defaultModel: "openai/gpt-4o-mini",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    type: "openai-compatible",
    extraHeaders: () => ({
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://github.com/vervegrow-cmyk/lootcard_ai",
      "X-Title": process.env.OPENROUTER_APP_NAME || "CardForge AI"
    })
  },
  {
    name: "deepseek",
    keyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL",
    defaultModel: "deepseek-chat",
    endpoint: "https://api.deepseek.com/chat/completions",
    type: "openai-compatible"
  },
  {
    name: "dashscope",
    keyEnv: "DASHSCOPE_API_KEY",
    modelEnv: "DASHSCOPE_MODEL",
    defaultModel: "qwen-plus",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    type: "openai-compatible"
  },
  {
    name: "zhipu",
    keyEnv: "ZHIPU_API_KEY",
    modelEnv: "ZHIPU_MODEL",
    defaultModel: "glm-4-flash",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    type: "openai-compatible"
  },
  {
    name: "google",
    keyEnv: "GOOGLE_API_KEY",
    modelEnv: "GOOGLE_MODEL",
    defaultModel: "gemini-1.5-flash",
    endpoint: "https://generativelanguage.googleapis.com",
    type: "google"
  },
  {
    name: "xai",
    keyEnv: "XAI_API_KEY",
    modelEnv: "XAI_MODEL",
    defaultModel: "grok-2-latest",
    endpoint: "https://api.x.ai/v1/chat/completions",
    type: "openai-compatible"
  }
];

function detectProviderOrder() {
  const configured = (process.env.AI_PROVIDER_ORDER || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (configured.length === 0) {
    return providers.map((provider) => provider.name);
  }

  const ordered = configured
    .map((name) => providers.find((provider) => provider.name === name))
    .filter(Boolean);

  const remaining = providers.filter(
    (provider) => !ordered.some((orderedProvider) => orderedProvider.name === provider.name)
  );

  return [...ordered, ...remaining].map((provider) => provider.name);
}

function detectSingleProviderArg() {
  const raw = (process.argv[2] || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }

  const exists = providers.some((provider) => provider.name === raw);
  if (!exists) {
    console.error(
      JSON.stringify(
        {
          status: "failed",
          category: "argument_error",
          errorMessage: `Unsupported provider "${raw}". Supported providers: ${providers
            .map((provider) => provider.name)
            .join(", ")}`
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  return raw;
}

function classifyError(status, body, errorCode, errorMessage) {
  const text = `${body || ""} ${errorMessage || ""}`.toLowerCase();

  if (errorCode === "EACCES" || errorCode === "ECONNREFUSED" || errorCode === "ETIMEDOUT") {
    return "network_error";
  }

  if (
    text.includes("fetch failed") ||
    text.includes("unable to connect") ||
    text.includes("network") ||
    text.includes("econnreset") ||
    text.includes("tls") ||
    text.includes("dns")
  ) {
    return "network_error";
  }

  if (status === 401 || status === 403 || text.includes("unauthorized") || text.includes("invalid api key")) {
    return "auth_error";
  }

  if (
    status === 402 ||
    status === 429 ||
    text.includes("quota") ||
    text.includes("insufficient") ||
    text.includes("balance") ||
    text.includes("credit") ||
    text.includes("billing")
  ) {
    return "quota_error";
  }

  if (text.includes("model") && (text.includes("not found") || text.includes("invalid"))) {
    return "model_error";
  }

  return "unknown_error";
}

async function callOpenAiCompatible(provider, apiKey, model) {
  return fetch(provider.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(provider.extraHeaders ? provider.extraHeaders() : {})
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: "Reply with plain text pong only." },
        { role: "user", content: "ping" }
      ]
    })
  });
}

async function callAnthropic(provider, apiKey, model) {
  return fetch(provider.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 16,
      messages: [{ role: "user", content: "ping" }]
    })
  });
}

async function callGoogle(provider, apiKey, model) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: "ping" }]
          }
        ]
      })
    }
  );
}

async function testProvider(provider) {
  const apiKey = (process.env[provider.keyEnv] || "").trim();
  const model = (process.env[provider.modelEnv] || provider.defaultModel).trim();

  if (!apiKey) {
    return {
      provider: provider.name,
      enabled: false,
      status: "skipped",
      reason: `missing ${provider.keyEnv}`
    };
  }

  try {
    let response;
    if (provider.type === "anthropic") {
      response = await callAnthropic(provider, apiKey, model);
    } else if (provider.type === "google") {
      response = await callGoogle(provider, apiKey, model);
    } else {
      response = await callOpenAiCompatible(provider, apiKey, model);
    }

    const body = await response.text();
    const category = response.ok
      ? "ok"
      : classifyError(response.status, body, null, `${response.status} ${response.statusText}`);

    return {
      provider: provider.name,
      enabled: true,
      status: response.ok ? "ok" : "failed",
      category,
      httpStatus: response.status,
      model,
      endpoint: provider.endpoint,
      bodyPreview: body.slice(0, 400)
    };
  } catch (error) {
    const category = classifyError(
      null,
      "",
      error && error.cause ? error.cause.code : null,
      error instanceof Error ? error.message : String(error)
    );

    return {
      provider: provider.name,
      enabled: true,
      status: "failed",
      category,
      model,
      endpoint: provider.endpoint,
      errorName: error && error.name ? error.name : null,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorCauseCode: error && error.cause ? error.cause.code : null,
      errorCauseMessage: error && error.cause ? error.cause.message : null
    };
  }
}

async function main() {
  const singleProvider = detectSingleProviderArg();
  const providerOrder = singleProvider ? [singleProvider] : detectProviderOrder();
  console.log(JSON.stringify({ providerOrder, singleProvider: singleProvider || null }, null, 2));

  const orderedProviders = providerOrder
    .map((name) => providers.find((provider) => provider.name === name))
    .filter(Boolean);

  for (const provider of orderedProviders) {
    const result = await testProvider(provider);
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        category: "script_error",
        errorMessage: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exit(1);
});
