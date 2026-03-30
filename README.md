# TikFeed 🎬

Dashboard de inteligência do TikTok com feed automático, rotação de 20 API keys e estimativa de vendas.

---

## Estrutura

```
tikfeed/
├── server.js          ← servidor Express (API keys ficam aqui, seguras)
├── package.json       ← dependências
├── .gitignore
└── public/
    ├── index.html     ← frontend
    └── app.js         ← lógica do frontend
```

---

## Rodar localmente

```bash
npm install
npm start
# Acesse: http://localhost:3000
```

---

## Deploy no Railway

1. Suba esse repositório no GitHub
2. Acesse [railway.app](https://railway.app)
3. Clique em **New Project → Deploy from GitHub repo**
4. Selecione o repositório
5. Railway detecta automaticamente o `package.json` e roda `npm start`
6. Pronto! ✅

> Não precisa configurar nenhuma variável de ambiente — as keys já estão no `server.js`.

---

## APIs utilizadas

| API | Host RapidAPI | Uso |
|-----|--------------|-----|
| TikTok Scraper | `tiktok-scraper7.p.rapidapi.com` | Busca, trending, perfis |
| TikTok API | `tiktok-api23.p.rapidapi.com` | Trending, explore, ads, shop |

### Endpoints disponíveis no servidor

| Rota | Descrição |
|------|-----------|
| `GET /api/trending` | Feed trending (Scraper) |
| `GET /api/search?keywords=X` | Busca vídeos (Scraper) |
| `GET /api/user/posts?username=X` | Posts de um usuário |
| `GET /api/user/info?username=X` | Info de um usuário |
| `GET /api/tiktok/trending` | Feed trending (TikTok API) |
| `GET /api/tiktok/explore` | Explorar (TikTok API) |
| `GET /api/tiktok/ads/trending` | Ads em trending |
| `GET /api/tiktok/search?keywords=X` | Busca (TikTok API) |
| `GET /api/tiktok/products` | Top produtos |
| `GET /api/status` | Status das keys em tempo real |

---

## Funcionalidades

- ✅ Feed automático ao abrir (sem precisar pesquisar)
- ✅ Rotação automática de 20 keys (10 Scraper + 10 TikTok API)
- ✅ Fallback automático entre APIs
- ✅ Infinite scroll
- ✅ Auto-refresh a cada 30s
- ✅ Filtros: Shop, Viral, Trending, Novos
- ✅ Estimativa de vendas por vídeo
- ✅ Modal com métricas completas
- ✅ Seleção de região (BR, US, ID, GB, TH, VN, PH)
- ✅ Keys seguras no servidor (nunca expostas no frontend)
