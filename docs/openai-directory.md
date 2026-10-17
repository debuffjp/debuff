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
