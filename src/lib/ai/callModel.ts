/**
 * Web callModel seam — posts the agent's model request to the Supabase `/ask`
 * Edge Function (the proxy that holds the Anthropic key, enforces the per-tier
 * monthly question quota, and picks the runtime model).
 *
 * Analyzer counterpart of the app's src/lib/ai/callModel.ts: identical request
 * body and AskError mapping, but dependency-free for the browser — no Expo
 * config, and instead of importing a Supabase client it takes a
 * `getAccessToken` function. Wire that to the analyzer's shared client at the
 * CALL SITE, e.g.:
 *
 *   createProxyCallModel(async () =>
 *     (await supabase.auth.getSession()).data.session?.access_token ?? null)
 *
 * The proxy URL defaults to the shared ELEMENT | 08 Supabase project and can be
 * overridden at build time via VITE_ASK_URL.
 */
import type { CallModel, CallModelRequest, ModelResponse } from './agent';

export type AskErrorKind = 'signin' | 'network' | 'proxy' | 'unavailable' | 'quota' | 'not_pro';

export class AskError extends Error {
  kind: AskErrorKind;
  constructor(kind: AskErrorKind, message?: string) {
    super(message ?? kind);
    this.kind = kind;
    this.name = 'AskError';
  }
}

const DEFAULT_ASK_URL = 'https://gtgoqdaapnzwkrvanaab.supabase.co/functions/v1/ask';

function proxyUrl(): string {
  const override = import.meta.env.VITE_ASK_URL as string | undefined;
  return override && override.trim() ? override.trim() : DEFAULT_ASK_URL;
}

/** Build the callModel used in production (web). */
export function createProxyCallModel(getAccessToken: () => Promise<string | null>): CallModel {
  return async (req: CallModelRequest): Promise<ModelResponse> => {
    const url = proxyUrl();

    const token = await getAccessToken();
    if (!token) throw new AskError('signin', 'Sign in to use the assistant.');

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          system: req.system,
          messages: req.messages,
          tools: req.tools,
          meter: req.meter === true,
        }),
      });
    } catch {
      throw new AskError('network', 'Could not reach the assistant.');
    }

    if (res.status === 402) throw new AskError('not_pro');
    if (res.status === 429) throw new AskError('quota');
    // The function returns 404 if it is not deployed.
    if (res.status === 404) throw new AskError('unavailable');
    if (!res.ok) throw new AskError('proxy', `Assistant error (${res.status}).`);

    const json = (await res.json()) as ModelResponse;
    if (!json || !Array.isArray(json.content)) throw new AskError('proxy', 'Malformed response.');
    return json;
  };
}
