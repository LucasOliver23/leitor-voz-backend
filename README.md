# Leitor em Voz

Extensão para Chrome e Edge que lê o texto dos sites com voz natural do **Google Gemini** (`gemini-3.8-flash-tts`, com cota gratuita no Google AI Studio) ou da OpenAI (`gpt-4o-mini-tts`).

Se `GEMINI_API_KEY` estiver configurada, o backend usa o Gemini. Sem ela, usa a OpenAI.

```
leitor-voz/
├── backend/      → sobe na Vercel (guarda a chave da OpenAI)
│   └── api/tts.js
└── extensao/     → carrega no Chrome/Edge
```

## 1. Publicar o backend na Vercel

1. Suba a pasta `backend` para um repositório no GitHub (ex.: `leitor-voz-backend`).
2. Na Vercel: **Add New → Project**, importe o repositório.
3. Antes do deploy, em **Environment Variables**, crie:
   - `GEMINI_API_KEY` = chave do Google AI Studio (aistudio.google.com → Get API key)
   - `OPENAI_API_KEY` = (opcional) chave da OpenAI
   - `APP_TOKEN` = uma senha longa inventada por você
4. Clique em **Deploy**. O endereço do backend fica:
   `https://SEU-PROJETO.vercel.app/api/tts`

> Se mudar as variáveis depois, faça **Redeploy** para valerem.

## 2. Instalar a extensão

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta `extensao`.
4. A tela de configurações abre sozinha. Cole o endereço do backend e o `APP_TOKEN`, clique em **Testar voz** e depois em **Salvar**.

## 3. Usar

- Ícone da extensão → **Ler página** ou **Ler seleção**
- Botão direito no texto → **Ler seleção em voz**
- Atalhos: `Alt+Shift+L` ler · `Alt+Shift+P` pausar/continuar · `Alt+Shift+S` parar
- No popup dá para voltar/avançar trechos e mudar a velocidade durante a leitura.
- Trocar a voz vale a partir da próxima leitura.

## Dicas de voz

- As vozes `marin` e `cedar` são as mais naturais.
- O campo **instruções** controla o jeito de falar (tom, ritmo, emoção). Mantenha "português do Brasil" no texto para evitar sotaque estrangeiro.

## Custos

Cada leitura consome créditos da sua conta na OpenAI, cobrados por uso. Confira os preços atuais em platform.openai.com/pricing e, se quiser, defina um limite de gasto mensal no painel da OpenAI.

## Conferir se o backend está certo

Abra `https://SEU-PROJETO.vercel.app/api/tts` no navegador. Ele mostra qual provedor está ativo e quais variáveis estão configuradas, sem mostrar as chaves.
