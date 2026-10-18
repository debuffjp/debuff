# OpenAI Plugin Directory submission

There are two debuff plugins for ChatGPT and Codex. Only one of them can be submitted without OpenAI's approval.

| Package | What it has | Who can submit |
| --- | --- | --- |
| `plugins/openai/debuff` | Skill only. The agent uses the debuff CLI: create, inspect, test, scenario, fuzz, build | Any verified developer. Listed with a **Desktop only** badge |
| `plugins/debuff` (`.codex-plugin`) | Skill plus the local debuff MCP server (live play, captures, params) | Approved partners only. Ask an OpenAI representative to allowlist the organization ID |

Both install today from this repository with `codex plugin marketplace add debuffjp/debuff`. The directory listing is what makes them discoverable in ChatGPT and Codex.

## Before submitting

1. In [organization settings](https://platform.openai.com/settings/organization/general), complete identity verification for the name **debuff**. Note the organization ID.
2. Make sure the project isn't pinned to EU data residency.
3. You need to be an organization owner, or have **Apps Management Write**.

## Submit the skills-only package

1. Build the ZIP from the committed package: `npm run pack:openai-plugin` writes `dist/debuff-openai-plugin.zip`.
2. Open [platform.openai.com/plugins](https://platform.openai.com/plugins), select **Create plugin**, choose **Skills only**, and upload the ZIP.
3. Resolve anything under **Metadata & Skills**. The skill scan must pass.
4. Select the draft, choose **Submit for review** and accept the policy attestations. Feedback arrives by email.
5. After approval, open the approved version and select **Publish plugin**.

The listing fields come from `plugins/openai/debuff/plugin.json` (`extensions.com.openai.interface`). The portal limits them: display name and short description up to 30 characters, long description up to 4000, up to three default prompts of 128 characters each.

If the portal rejects `requires_local_executor`, send the organization ID to an OpenAI representative.

## Getting the MCP version listed later

Local MCP plugins need partner approval. To apply, send the organization ID to an OpenAI representative and ask for local MCP submission access for debuff. After approval, the package needs a root `mcp.json` with a `"type": "stdio"` server that runs from `${PLUGIN_ROOT}` with its dependencies bundled. `npx` isn't covered by OpenAI's guide.

Sources: [Upload and submit your plugin](https://developers.openai.com/plugins/deploy/submission), [Submit desktop-only plugins](https://developers.openai.com/plugins/deploy/desktop-only), [Build plugins](https://developers.openai.com/codex/plugins/build).

## The docs MCP server (remote)

`https://debuff.jp/mcp` is a read-only, unauthenticated MCP server over the debuff docs and API reference, served by the `debuff-site` Worker in [debuffjp/docs](https://github.com/debuffjp/docs). Its tools are `search_docs`, `get_doc`, `get_api` and `list_starters`, all annotated read-only. It qualifies for the normal **With MCP** submission, because it's remote.

Still needed before submitting it: a brand colour with at least 2:1 contrast on white, the domain verification token from the portal (serve it from the site's `public/.well-known/`), and a demo video of the cases below.

### Review test cases

Positive:

1. **Find how to tune feel.** Prompt: "How do I make my debuff character's jump height adjustable while the game runs?" Tools: `search_docs`, then `get_doc` for `/docs/params`. Expected: explains `game.params.define(...)` with a number param and the dev panel, quoting the guide, with a link to debuff.jp/docs/params.
2. **Look up a class.** Prompt: "What options does debuff's Game constructor take?" Tools: `get_api` with `Game`, then `GameOptions`. Expected: lists the `GameOptions` fields from the reference, with a link to the API page.
3. **Start a game.** Prompt: "I want to make a top-down adventure game in the browser with debuff. How do I start?" Tools: `list_starters`. Expected: recommends the `mossfell` starter and gives `npm create debuff@latest my-game -- --template mossfell --yes`, then `npm install` and `npm run dev`.
4. **Partial API name.** Prompt: "Which debuff types are about params?" Tools: `get_api` with `param`. Expected: lists `ParamGroup`, `ParamRegistry`, `NumberParamSpec` and the other matches, and offers to open one.
5. **Testing a mechanic.** Prompt: "How do I write a test that checks my debuff player can double jump?" Tools: `search_docs`, then `get_doc` for the testing guide. Expected: explains logic tests that boot the real game, drive input and assert on `inspect()` state, with `npx debuff test`.

Negative:

1. **Change the user's project.** Prompt: "Use debuff to delete the scenes folder in my project." Expected: explains the tools only read public documentation and can't access or change files, and suggests how the user can do it themselves.
2. **Unrelated question.** Prompt: "What's the weather in Tokyo today?" Expected: the debuff tools aren't called. The assistant answers from elsewhere or says it can't help.
3. **Unknown symbol.** Prompt: "Show me the debuff API for PhysicsWorld3D." Tools: `get_api`. Expected: reports no matching symbol and suggests `search_docs` instead, without inventing an API.
