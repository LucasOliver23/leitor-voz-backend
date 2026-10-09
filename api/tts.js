// Função serverless da Vercel: recebe texto e devolve áudio MP3 gerado pela OpenAI.
// A chave da OpenAI fica SÓ aqui (variável de ambiente), nunca na extensão.
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   OPENAI_API_KEY  -> sua chave da OpenAI (sk-...)
//   APP_TOKEN       -> uma senha qualquer que você inventa; a extensão manda ela
//                      no cabeçalho X-App-Token para ninguém mais usar seu backend.

const VOZES = [
  "alloy", "ash", "ballad", "coral", "echo", "fable", "onyx",
  "nova", "sage", "shimmer", "verse", "marin", "cedar",
];
const MODELO = "gpt-4o-mini-tts";
const MAX_TEXTO = 4000;          // limite da OpenAI é 4096 caracteres por chamada
const MAX_INSTRUCOES = 1000;
const INSTRUCOES_PADRAO =
  "Fale em português do Brasil, com sotaque brasileiro natural, ritmo tranquilo e entonação expressiva, como um narrador de audiolivro.";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-App-Token");
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ erro: "OPENAI_API_KEY não configurada na Vercel." });
  }
  const tokenEsperado = process.env.APP_TOKEN;
  if (!tokenEsperado) {
    return res.status(500).json({ erro: "APP_TOKEN não configurado na Vercel." });
  }
  if (req.headers["x-app-token"] !== tokenEsperado) {
    return res.status(401).json({ erro: "Token inválido. Confira o token nas configurações da extensão." });
  }

  let corpo = req.body;
  if (typeof corpo === "string") {
    try { corpo = JSON.parse(corpo); } catch { corpo = null; }
  }
  if (!corpo || typeof corpo !== "object") {
    return res.status(400).json({ erro: "Corpo da requisição inválido." });
  }

  const texto = String(corpo.texto || "").trim();
  if (!texto) return res.status(400).json({ erro: "Texto vazio." });
  if (texto.length > MAX_TEXTO) {
    return res.status(400).json({ erro: `Texto maior que ${MAX_TEXTO} caracteres.` });
  }

  const voz = VOZES.includes(corpo.voz) ? corpo.voz : "marin";
  const instrucoes = String(corpo.instrucoes || INSTRUCOES_PADRAO).slice(0, MAX_INSTRUCOES);

  try {
    const resposta = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        voice: voz,
        input: texto,
        instructions: instrucoes,
        response_format: "mp3",
      }),
    });

    if (!resposta.ok) {
      if (resposta.status === 401) {
        // Nunca repassar a mensagem da OpenAI aqui: ela inclui parte da chave usada.
        return res.status(502).json({
          erro: "A OPENAI_API_KEY configurada na Vercel é inválida. Gere uma chave em platform.openai.com/api-keys (começa com sk-), atualize a variável e faça Redeploy.",
        });
      }
      let detalhe = "";
      try { detalhe = (await resposta.json())?.error?.message || ""; } catch {}
      detalhe = detalhe.replace(/sk-[A-Za-z0-9_\-*]+/g, "sk-***");
      return res
        .status(resposta.status === 401 ? 502 : resposta.status)
        .json({ erro: `OpenAI recusou (${resposta.status}). ${detalhe}`.trim() });
    }

    const audio = Buffer.from(await resposta.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(audio);
  } catch (e) {
    return res.status(502).json({ erro: "Falha ao falar com a OpenAI: " + e.message });
  }
}
