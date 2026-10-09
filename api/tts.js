// Função serverless da Vercel: recebe texto e devolve o áudio falado.
// Funciona com dois provedores de voz:
//   - Google Gemini (Google AI Studio)  -> usado quando GEMINI_API_KEY existe
//   - OpenAI                            -> usado quando só OPENAI_API_KEY existe
// As chaves ficam SÓ aqui (variáveis de ambiente), nunca na extensão.
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   GEMINI_API_KEY  -> chave do Google AI Studio (aistudio.google.com → Get API key)
//   OPENAI_API_KEY  -> (opcional) chave da OpenAI (sk-...)
//   APP_TOKEN       -> senha inventada por você; a extensão manda no cabeçalho X-App-Token
//   PROVEDOR        -> (opcional) "gemini" ou "openai" para forçar um deles

const MAX_TEXTO = 4000;
const MAX_INSTRUCOES = 1000;
const INSTRUCOES_PADRAO =
  "Fale em português do Brasil, com sotaque brasileiro natural, ritmo tranquilo e entonação expressiva, como um narrador de audiolivro.";

// ---------------- OpenAI ----------------
const OPENAI_MODELO = "gpt-4o-mini-tts";
const OPENAI_VOZES = [
  "alloy", "ash", "ballad", "coral", "echo", "fable", "onyx",
  "nova", "sage", "shimmer", "verse", "marin", "cedar",
];

// ---------------- Gemini ----------------
const GEMINI_MODELO = "gemini-3.8-flash-tts";
const GEMINI_TAXA = 16000; // 16 kHz: boa qualidade de voz e arquivo pequeno (limite de resposta da Vercel)
const GEMINI_VOZES = [
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe",
  "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib",
  "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima",
  "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
];
// A extensão usa os nomes de voz da OpenAI; aqui viram vozes equivalentes do Gemini.
const MAPA_VOZES = {
  marin: "Sulafat",      // feminina, calorosa
  cedar: "Charon",       // masculina, informativa
  coral: "Aoede",        // feminina, leve
  nova: "Leda",          // feminina, jovem
  shimmer: "Achernar",   // feminina, suave
  sage: "Vindemiatrix",  // feminina, gentil
  alloy: "Kore",         // firme
  ash: "Orus",           // masculina, firme
  ballad: "Algieba",     // masculina, suave
  echo: "Iapetus",       // masculina, clara
  fable: "Rasalgethi",   // narrador
  onyx: "Algenib",       // masculina, grave
  verse: "Puck",         // masculina, animada
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-App-Token");
}

function escolherProvedor(pedido) {
  const forcado = String(pedido || process.env.PROVEDOR || "").toLowerCase();
  if (forcado === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (forcado === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

// Monta um cabeçalho WAV para áudio PCM 16 bits mono.
function pcmParaWav(pcm, taxa) {
  const cab = Buffer.alloc(44);
  cab.write("RIFF", 0);
  cab.writeUInt32LE(36 + pcm.length, 4);
  cab.write("WAVE", 8);
  cab.write("fmt ", 12);
  cab.writeUInt32LE(16, 16);
  cab.writeUInt16LE(1, 20);          // PCM
  cab.writeUInt16LE(1, 22);          // mono
  cab.writeUInt32LE(taxa, 24);
  cab.writeUInt32LE(taxa * 2, 28);   // bytes por segundo
  cab.writeUInt16LE(2, 32);
  cab.writeUInt16LE(16, 34);
  cab.write("data", 36);
  cab.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([cab, pcm]);
}

class ErroProvedor extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

async function falarGemini(texto, voz, instrucoes) {
  const vozGemini = GEMINI_VOZES.includes(voz) ? voz : (MAPA_VOZES[voz] || "Sulafat");
  const resposta = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GEMINI_MODELO,
      input: [{
        type: "user_input",
        content: [{
          type: "text",
          text: texto,
          annotations: [{ type: "speech_metadata", style: instrucoes }],
        }],
      }],
      response_format: { type: "audio", mime_type: "audio/l16", sample_rate: GEMINI_TAXA },
      generation_config: { speech_config: [{ voice: vozGemini }] },
    }),
  });

  if (!resposta.ok) {
    let detalhe = "";
    try { detalhe = (await resposta.json())?.error?.message || ""; } catch {}
    detalhe = detalhe.replace(/AIza[0-9A-Za-z_\-]{10,}/g, "AIza***");
    if ((resposta.status === 400 && /api key/i.test(detalhe)) || resposta.status === 401 || resposta.status === 403) {
      throw new ErroProvedor(502,
        "A GEMINI_API_KEY configurada na Vercel é inválida ou sem permissão. Gere uma chave em aistudio.google.com (Get API key), atualize a variável e faça Redeploy.");
    }
    if (resposta.status === 429) {
      throw new ErroProvedor(429,
        "Limite gratuito do Gemini atingido por agora. Espere um minuto e tente de novo.");
    }
    throw new ErroProvedor(resposta.status, `Gemini recusou (${resposta.status}). ${detalhe}`.trim());
  }

  const json = await resposta.json();
  const blocos = [];
  for (const passo of json.steps || []) {
    if (passo.type !== "model_output") continue;
    for (const c of passo.content || []) if (c.type === "audio" && c.data) blocos.push(c.data);
  }
  if (!blocos.length) throw new ErroProvedor(502, "O Gemini não devolveu áudio para este trecho.");

  const bruto = Buffer.concat(blocos.map((b) => Buffer.from(b, "base64")));
  // Se já veio como WAV, devolve direto; senão é PCM puro e ganha o cabeçalho.
  const wav = bruto.subarray(0, 4).toString() === "RIFF" ? bruto : pcmParaWav(bruto, GEMINI_TAXA);
  return { audio: wav, tipo: "audio/wav" };
}

async function falarOpenAI(texto, voz, instrucoes) {
  const resposta = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODELO,
      voice: OPENAI_VOZES.includes(voz) ? voz : "marin",
      input: texto,
      instructions: instrucoes,
      response_format: "mp3",
    }),
  });

  if (!resposta.ok) {
    if (resposta.status === 401) {
      // Nunca repassar a mensagem da OpenAI aqui: ela inclui parte da chave usada.
      throw new ErroProvedor(502,
        "A OPENAI_API_KEY configurada na Vercel é inválida. Gere uma chave em platform.openai.com/api-keys (começa com sk-), atualize a variável e faça Redeploy.");
    }
    let detalhe = "";
    try { detalhe = (await resposta.json())?.error?.message || ""; } catch {}
    detalhe = detalhe.replace(/sk-[A-Za-z0-9_\-*]+/g, "sk-***");
    throw new ErroProvedor(resposta.status, `OpenAI recusou (${resposta.status}). ${detalhe}`.trim());
  }
  return { audio: Buffer.from(await resposta.arrayBuffer()), tipo: "audio/mpeg" };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  // GET: página de diagnóstico (não mostra nenhuma chave).
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      provedor: escolherProvedor() || "nenhum",
      gemini_configurado: Boolean(process.env.GEMINI_API_KEY),
      openai_configurado: Boolean(process.env.OPENAI_API_KEY),
      token_configurado: Boolean(process.env.APP_TOKEN),
    });
  }
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });

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

  const provedor = escolherProvedor(corpo.provedor);
  if (!provedor) {
    return res.status(500).json({
      erro: "Nenhuma chave de voz configurada na Vercel. Cadastre GEMINI_API_KEY (Google AI Studio) e faça Redeploy.",
    });
  }

  const texto = String(corpo.texto || "").trim();
  if (!texto) return res.status(400).json({ erro: "Texto vazio." });
  if (texto.length > MAX_TEXTO) {
    return res.status(400).json({ erro: `Texto maior que ${MAX_TEXTO} caracteres.` });
  }
  const voz = String(corpo.voz || "marin");
  const instrucoes = String(corpo.instrucoes || INSTRUCOES_PADRAO).slice(0, MAX_INSTRUCOES);

  try {
    const { audio, tipo } = provedor === "gemini"
      ? await falarGemini(texto, voz, instrucoes)
      : await falarOpenAI(texto, voz, instrucoes);
    res.setHeader("Content-Type", tipo);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Provedor", provedor);
    return res.status(200).send(audio);
  } catch (e) {
    if (e instanceof ErroProvedor) return res.status(e.status).json({ erro: e.message });
    return res.status(502).json({ erro: `Falha ao falar com ${provedor === "gemini" ? "o Gemini" : "a OpenAI"}: ${e.message}` });
  }
}
