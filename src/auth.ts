import type { ApiKeyCredential, AuthResult, ProviderAuthInteraction } from "@earendil-works/pi-ai";

export const API_KEY_AUTH_NAME = "Vancine API key";

export async function loginWithApiKey(interaction: ProviderAuthInteraction): Promise<ApiKeyCredential> {
  const entered = await interaction.prompt({
    type: "secret",
    message: "Vancine API key",
    placeholder: "sk-...",
  });
  const key = entered.trim();
  if (!key) {
    throw new Error("A Vancine API key is required");
  }
  return { type: "api_key", key };
}

export async function resolveApiKey(input: {
  credential?: ApiKeyCredential;
}): Promise<AuthResult | undefined> {
  const key = input.credential?.key?.trim();
  if (!key) {
    return undefined;
  }
  return {
    auth: { apiKey: key },
    source: "stored API key",
  };
}
