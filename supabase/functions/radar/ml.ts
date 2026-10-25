// Cliente da API oficial do Mercado Livre (fetch injetável para testes).

export const API = "https://api.mercadolibre.com";
export const SITE = "MLB";

export type Fetch = typeof fetch;

export class ErroML extends Error {
  constructor(public status: number, public corpo: string, msg: string) {
    super(msg);
  }
}

export type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number;
  scope?: string;
};

function esperar(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function criarClienteML(opts: { fetch?: Fetch; clientId: string; clientSecret: string; pausaMs?: number }) {
  const f = opts.fetch ?? fetch;
  const pausa = opts.pausaMs ?? 800;

  async function pedir(url: string, init: RequestInit, tentativas = 2): Promise<Response> {
    let ultimo: unknown;
    for (let t = 0; t < tentativas; t++) {
      try {
        const r = await f(url, { ...init, signal: AbortSignal.timeout(15_000) });
        if ((r.status === 429 || r.status >= 500) && t < tentativas - 1) {
          await r.body?.cancel();
          await esperar(pausa * (t + 1));
          continue;
        }
        return r;
      } catch (e) {
        ultimo = e;
        if (t < tentativas - 1) await esperar(pausa * (t + 1));
      }
    }
    throw ultimo instanceof Error ? ultimo : new Error(String(ultimo));
  }

  async function token(corpo: Record<string, string>): Promise<Tokens> {
    const r = await pedir(`${API}/oauth/token`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: opts.clientId, client_secret: opts.clientSecret, ...corpo }).toString(),
    }, 1);
    const texto = await r.text();
    if (!r.ok) throw new ErroML(r.status, texto, `token recusado (${r.status}): ${texto.slice(0, 200)}`);
    const j = JSON.parse(texto);
    if (!j.access_token || !j.refresh_token) {
      throw new ErroML(r.status, texto, "resposta de token sem access_token/refresh_token (offline_access marcado no app?)");
    }
    return j as Tokens;
  }

  async function getJson<T = unknown>(caminho: string, accessToken: string): Promise<T> {
    const r = await pedir(`${API}${caminho}`, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } });
    const texto = await r.text();
    if (!r.ok) throw new ErroML(r.status, texto, `GET ${caminho.split("?")[0]} → ${r.status}: ${texto.slice(0, 160)}`);
    return JSON.parse(texto) as T;
  }

  return {
    trocarCodigo: (code: string, redirectUri: string, codeVerifier: string) =>
      token({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: codeVerifier }),
    renovar: (refreshToken: string) => token({ grant_type: "refresh_token", refresh_token: refreshToken }),

    categoria: (id: string, at: string) => getJson<{ id: string; name: string }>(`/categories/${id}`, at),

    maisVendidos: async (categoria: string, at: string) => {
      const j = await getJson<{ content?: { id: string; position: number; type: string }[] }>(
        `/highlights/${SITE}/category/${categoria}`,
        at,
      );
      return j.content ?? [];
    },

    // Até 20 ids por chamada.
    itens: async (ids: string[], at: string) => {
      if (ids.length === 0) return [];
      const j = await getJson<{ code: number; body: Record<string, unknown> }[]>(
        `/items?ids=${ids.map(encodeURIComponent).join(",")}&attributes=id,title,price,permalink,catalog_product_id`,
        at,
      );
      return j.filter((x) => x.code === 200).map((x) => x.body);
    },

    produto: (id: string, at: string) => getJson<Record<string, unknown>>(`/products/${encodeURIComponent(id)}`, at),

    itensDoProduto: async (id: string, at: string) => {
      const j = await getJson<{ results?: Record<string, unknown>[] }>(`/products/${encodeURIComponent(id)}/items?limit=1`, at);
      return j.results ?? [];
    },

    tendencias: async (categoria: string, at: string) => {
      const j = await getJson<{ keyword: string; url?: string }[]>(`/trends/${SITE}/${categoria}`, at);
      return Array.isArray(j) ? j : [];
    },
  };
}

export type ClienteML = ReturnType<typeof criarClienteML>;
