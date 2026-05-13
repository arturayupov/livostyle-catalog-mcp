# livostyle-catalog-mcp

> **MCP server** giving any AI agent (Claude Desktop · Cursor · Cline · Cowork) live access to **2,766+ women's fashion products** from [Livostyle.com](https://livostyle.com).
> Drop-in shopping context for shopping agents, outfit recommenders, fashion chatbots.

[![npm version](https://img.shields.io/npm/v/livostyle-catalog-mcp.svg?color=cb3837)](https://www.npmjs.com/package/livostyle-catalog-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/Model_Context_Protocol-compatible-blue)](https://modelcontextprotocol.io)
[![Glama MCP server](https://glama.ai/mcp/servers/arturayupov/livostyle-catalog-mcp/badges/score.svg)](https://glama.ai/mcp/servers/arturayupov/livostyle-catalog-mcp)

## Install

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "livostyle-catalog": {
      "command": "npx",
      "args": ["-y", "livostyle-catalog-mcp"]
    }
  }
}
```

Restart Claude. The Livostyle tools appear in the tool list — your Claude can now recommend outfits and search a real fashion catalog.

### Cursor / Cline / Cowork

Same JSON config — drop into the MCP-server section of your client's settings.

## What it does

Six tools that any LLM agent can call:

| Tool | Purpose |
|---|---|
| `search_products`   | Free-text search with filters (price, rating, type, tag, in-stock). Returns ranked product list. |
| `get_product`       | Full product details — all variants, sizes, colors, prices, images, reviews. |
| `list_collections`  | Browse 158 curated collections (Wedding Guest, Vacation, Coachella, Boho, …). |
| `get_collection`    | Products in a specific collection. |
| `recommend_outfit`  | Generate complete outfit suggestion matched to occasion + budget + season. |
| `catalog_stats`     | Live catalog stats (counts, ratings, top categories). |

## Examples (what an agent can do)

```
User: "Find me a floral midi dress under $50 with at least 5 reviews"
→ Agent calls search_products(query: "floral midi", max_price_usd: 50, min_rating: 4.5)
→ Returns 3 ranked picks with prices, ratings, links

User: "What should I wear to a garden wedding in summer? Budget $100."
→ Agent calls recommend_outfit(occasion: "garden wedding guest", budget_usd: 100, season: "summer")
→ Returns 3 complete outfit suggestions with reasoning

User: "Show me everything in the Coachella collection"
→ Agent calls get_collection(handle: "coachella-outfits")
→ Returns 475+ festival-ready picks
```

## Data source

Live catalog from [Livostyle.com](https://livostyle.com), mirrored weekly via GitHub Actions to:

- 🐙 **GitHub**: [arturayupov/womens-fashion-catalog-open-data](https://github.com/arturayupov/womens-fashion-catalog-open-data)
- 🤗 **Hugging Face**: [arturayupov/womens-fashion-catalog](https://huggingface.co/datasets/arturayupov/womens-fashion-catalog)
- 📦 **NPM** (this package): [livostyle-catalog-mcp](https://www.npmjs.com/package/livostyle-catalog-mcp)

The MCP server fetches `products.json` from the GitHub mirror on first use, caches in memory, refreshes every 6 hours.

## What's in the catalog

- **2,766+** active women's fashion products
- **158** curated collections
- **4.76** avg rating, 15,937 total reviews
- 99% products with 5+ reviews · 99% with 4+ images
- Price range: $18–$120 USD
- US shipping, free over $97, 7-day returns
- Categories: Dresses, Tops, Bottoms, Outerwear, Swimwear, Activewear, Two-Piece Sets, Accessories, Shoes, Jewelry, …

## License

MIT — see [LICENSE](./LICENSE). Free for commercial use, AI training, research. Attribution appreciated.

## Why this exists

We're in the **AI shopping era**. ChatGPT, Claude, Perplexity, Gemini are becoming the new search bar. Stores that publish their catalogs as MCP servers get drop-in distribution to every agentic shopping client. This is our experiment in being there first.

If you build something with it, drop us a line at info@arcada.store — we may feature your project.

## Contact

- **Email**: info@arcada.store
- **Site**: https://livostyle.com
- **Issues**: [GitHub Issues](https://github.com/arturayupov/livostyle-catalog-mcp/issues)
