# Affiliate Miner — Extensão Chrome (v2.6.2)

Minerador inteligente de produtos afiliados. Extrai produtos direto das lojas
(Mercado Livre, Shopee, Amazon, AliExpress, Shein) e **sincroniza automaticamente
com o app [Afiliate](https://afiliate.onrender.com)** via Firebase/Firestore.

## Como funciona a sincronização

A extensão e o app Afiliate compartilham o **mesmo projeto Firebase**
(`afiliateoficial2026`) e a **mesma base Firestore**. O fluxo é:

1. **Login** — a extensão autentica com Firebase Auth (REST) usando o mesmo
   e‑mail/senha do app. Gera `uid` + `idToken` reais.
2. **Mineração** — o `content.js` extrai os dados do produto na página da loja.
3. **Sync** — o `background.js` (service worker) grava no Firestore:
   - `products/{globalId}` — documento global do produto (schema `GlobalProduct`).
   - `products/{globalId}/priceHistory` — entrada de histórico de preço.
   - `users/{uid}/minedProducts/{globalId}` — referência pessoal (schema `MinedProductRef`).
   - `users/{uid}/dailyStats/{YYYY-MM-DD}` — contador diário de minerados.
4. **Leitura no app** — a aba **Meus Produtos** lê `users/{uid}/minedProducts`
   e cruza com `products/{id}` em tempo real (`onSnapshot`).

O `globalId` é gerado com o **mesmo algoritmo** dos dois lados
(`{plataforma}_{idNativo}`), garantindo deduplicação consistente.

## Instalação (modo desenvolvedor)

1. Baixe/clone esta pasta.
2. Abra `chrome://extensions`.
3. Ative o **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione a pasta.

## Estrutura

| Arquivo | Papel |
|---|---|
| `manifest.json` | Manifest V3, permissões e host_permissions |
| `popup.html` / `popup.css` / `popup.js` | Painel da extensão (login + dashboard) |
| `content.js` | Overlay flutuante nas lojas + motor de extração |
| `background.js` | Service worker: refresh de token + sync automático ao Firestore |

## Paleta de cores

Preto · Azul · Branco · Verde · Amarelo · Vermelho — aplicada à tela de login,
ao menu suspenso (popup) e ao overlay flutuante nas lojas.

---
_Extensão companheira do app Afiliate._
