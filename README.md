# FilmFix

Minimal AI photo restoration for a small set of personal photographs. The browser
keeps the source preview and generated versions in current-page memory only. The
server sends temporary uploads to the OpenAI Responses API and returns a PNG
result; this app does not create accounts, persist files, or run batch jobs.

After the first result, select **Refine** to open a blank follow-up prompt. You
can add up to four optional JPEG, PNG, or WebP reference images and create
versions such as `v1`, `v2`, and `v3`. Selecting an earlier version before
refining creates a new branch while retaining every previous version. Prompt
history remains available in the generation details. Use **Reset session** or
leave the page to clear this browser-local session.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and add a server-only OpenAI API key:

   ```text
   OPENAI_API_KEY=your_key_here
   ```

   Do not add the key to client-side code or commit `.env.local`. Your OpenAI
   organization may need verification before GPT Image models can be used.

3. Start the development server:

   ```bash
   npm run dev
   ```

   Open <http://localhost:3000>.

## Commands

```bash
npm run lint
npx tsc --noEmit
npm run build
```

The OpenAI request uses `openai.responses.create` with the image-generation tool,
PNG output, and no automatic retries. Follow-up requests use the selected
version's `previous_response_id` for multi-turn continuity. Supported source and
reference uploads are JPEG, PNG, and WebP up to 50 MiB each; a refinement accepts
at most four references. Returned token usage and cost are shown only when the
response contains enough fields for an honest estimate.

The app does not persist generated images or response IDs in browser storage.
Responses API lineage relies on OpenAI-side response retention, which is governed
by your account and API data-retention settings.

End-to-end image generation requires a real API key and may incur OpenAI usage
charges. Without one, the missing-key error can be checked locally but the
authenticated edit response cannot be exercised.