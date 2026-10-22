# FilmFix Audit Context

This document records the product intentions and implementation choices behind
the FilmFix photo restoration app. It is written for an auditing agent. Treat
the stated intentions as review criteria, not as proof that the implementation
already satisfies every point.

## Product Intent

FilmFix is a deliberately small tool for restoring approximately 15-20
personal photographs through this workflow:

1. Select one local photograph.
2. Inspect its preview, filename, dimensions, and file size.
3. Choose restoration settings and edit the restoration prompt.
4. Explicitly submit the image for restoration.
5. Compare the original and returned image.
6. Optionally refine any selected result with a blank follow-up prompt and up to
  four reference images, creating an in-memory version such as `v2`.
7. Download the selected PNG and inspect generation metadata, prompt history,
  and cost when it can be calculated honestly.

The intended operation is restoration of the supplied photograph, not creation
of an unrelated image. The default prompt asks the model to preserve identity,
composition, clothing, objects, architecture, lighting, and scene details while
repairing damage, grain, faded color, contrast, and shadows.

## Deliberate Scope

Included:

- JPEG, PNG, and WebP uploads.
- One source image plus up to four optional reference images per refinement.
- Browser-local preview before submission.
- OpenAI Responses API image generation through a server route.
- Ephemeral `v1`, `v2`, and later versions, including branches from a selected
  earlier version, for the lifetime of the current page.
- Sunburst and Flare model choices.
- Auto, low, medium, high, xhigh, and max quality choices.
- Auto and three documented standard output sizes.
- PNG output.
- Browser download of the generated result.
- Safe user-facing handling for configuration, validation, network, API,
  rate-limit, and malformed-response failures.

Explicitly excluded:

- Accounts, authentication, databases, galleries, analytics, and persistent
  image storage.
- Batch processing, automatic regeneration, polling, streaming, and automatic
  retries.
- Editing controls beyond the restoration/refinement prompts, request settings,
  and optional reference images.
- OpenAI Files API uploads.

## Architecture Choices

- Framework: Next.js App Router with TypeScript and a Node.js route handler.
- Client boundary: `app/page.tsx` is interactive because it owns browser file
  state, object URLs, form controls, elapsed time, ephemeral version state, and
  result display.
- Server boundary: `app/api/restore/route.ts` reads multipart form data,
  validates it, reads `OPENAI_API_KEY`, calls OpenAI, maps errors, and returns
  JSON.
- OpenAI client: the official `openai` JavaScript SDK.
- Edit method: `openai.responses.create` with the `image_generation` tool. A
  follow-up includes the selected version's `previous_response_id` so the API
  can continue its lineage.
- Temporary upload: the server converts source and reference image bytes into
  data URLs for the Responses request. No local file or OpenAI Files API record
  is created.
- Retry policy: `maxRetries: 0` is set explicitly on the SDK client.
- Response: the first `image_generation_call.result` value and its response ID
  are returned as a PNG data URL and opaque lineage identifier.

## Server Contract

`POST /api/restore` expects multipart fields named:

- `image`
- `prompt`
- `model`
- `size`
- `quality`
- `previousResponseId` (optional)
- `referenceImage` (zero to four repeated optional file fields)

The server rejects missing fields, empty or oversized images, unsupported MIME
types, more than four reference images, malformed response-lineage IDs, empty
or overlong prompts, and values outside the allowlists. The app limit is 50 MiB
per image. Successful responses contain the generated PNG data URL, response ID,
and metadata for model, size, quality, format, server duration, optional usage,
and optional cost.

The API key is read only from the non-public `OPENAI_API_KEY` environment
variable. No key, raw request body, or upstream error message is intentionally
returned to the browser. Development diagnostics expose only an error class
name. Authentication failures are reported as a safe upstream configuration
failure; rate limits and spending limits remain distinguishable.

## Cost Intent

Cost is an estimate, never a fixed invented per-image price. The pricing module
uses the documented rates selected for this app:

- Text input: $5 per million tokens.
- Image input: $8 per million tokens.
- Image output: $30 per million tokens.

The UI shows a cost only when the response provides all three token categories
needed for that calculation. Partial or absent usage remains explicitly
unavailable. The normalized usage and cost are for inspection, not billing.

## Client-Side Behavior

- Selecting or dropping a file creates a browser object URL but does not call
  the server.
- Object URLs are revoked when replaced, cleared, or the page unmounts.
- Generated version data, prompts, metadata, and response IDs live in React
  state only. Resetting the session or terminating the page clears them.
- Selecting any version changes the restored side of the comparison. Refining
  an older selected version creates a retained branch from that version.
- Refine clears the active prompt and reference-image drop area while prior
  prompts remain available as read-only generation history.
- Client validation mirrors the server's format and size checks for quick
  feedback; server validation remains authoritative.
- The submit button is disabled without a file and during the single request.
- The UI displays elapsed seconds and notes that image generation can take up
  to about two minutes.
- The returned image is rendered beside the original on larger screens and
  stacked on smaller screens.
- Output natural dimensions are read from the loaded image. The download name
  is based on the original filename with `-restored.png` appended.
- Local-only refers to browser storage. Responses API lineage is retained by
  OpenAI according to the account/API data-retention settings needed for
  `previous_response_id` continuation.

## Verification Already Performed

- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- An empty local `POST /api/restore` without an API key returned HTTP 503 with
  the safe message `The server is missing OPENAI_API_KEY.`.
- No real API key was available, so an authenticated OpenAI Responses request,
  actual image response, response lineage, upstream usage shape, and end-to-end
  refinement were not exercised.

## Review Priorities

An auditing agent should pay particular attention to:

1. Whether the OpenAI SDK and model/quality/size values still match the current
   official API contract.
2. Whether a client bundle can reach `OPENAI_API_KEY` or import server-only
   OpenAI code.
3. Whether multipart parsing and the 50 MiB guard can be bypassed or cause
   excessive memory use.
4. Whether MIME validation should be strengthened with file signature checks
   for the app's deployment threat model.
5. Whether the returned data URL creates an unacceptable memory or response
   size risk for larger generated images.
6. Whether all upstream error paths remain safe, actionable, and free of secret
   request details.
7. Whether incomplete or changed usage fields could produce a misleading cost.
8. Whether the local object URL lifecycle, duplicate-submit prevention, and
   download behavior remain correct after UI changes.
9. Whether local-only assumptions are still valid before deploying this as a
   multi-user service. The current app has no application-level authentication,
   quotas, or persistent audit trail by design.

## Relevant Files

- `app/page.tsx`: interactive workflow and result presentation.
- `app/api/restore/route.ts`: HTTP boundary and safe error mapping.
- `lib/restore.ts`: allowlists, validation, Responses API call, response parsing.
- `lib/pricing.ts`: usage normalization and cost estimate.
- `app/globals.css`: responsive visual system.
- `README.md`: setup and operational notes.
- `.env.example`: server-only configuration shape without a real secret.