export const DEFAULT_PROMPT =
  "Restore this photograph conservatively and faithfully. The source image is the authority: preserve the exact identity, facial structure, facial proportions, expression, age, pose, hairstyle, clothing, objects, architecture, composition, perspective, lighting direction, and scene. NEVER redesign, reconstruct, beautify, or reinterpret a face. If facial information is degraded, blurry, obscured, or missing, preserve the original shapes and proportions and make only minimal corrections supported by visible source information. Do not invent facial features or replace uncertain areas with plausible-looking features. A slightly degraded or imperfect face is preferable to an altered face.\n\nRepair genuine photographic degradation such as fading, color casts, dust, scratches, damaged shadows, uneven tones, and loss of contrast. Recover natural detail only where it is supported by the original image. Do not oversharpen, smooth skin, remove natural photographic texture, or create artificial detail.\n\nKeep colors restrained, neutral, and physically plausible. Avoid increased saturation, cinematic color grading, orange or yellow casts, teal/orange grading, exaggerated skin tones, or artificially warm lighting. Preserve the original lighting and white balance unless there is clear evidence of fading or color shift. The result should look like the same photograph carefully restored, not a newly generated or enhanced photograph.";


export const BWGRAIN_PROMPT =
  "Naturally colorize this black-and-white photograph while preserving it as faithfully as possible. The source image is the authority: preserve the exact identity, facial structure, facial proportions, expression, age, pose, hairstyle, clothing, objects, architecture, composition, perspective, lighting, shadows, and scene. NEVER redesign, reconstruct, beautify, or reinterpret a face. If facial information is degraded, blurry, obscured, or missing, do not invent or replace facial features. Preserve the original shapes and proportions even when they remain imperfect. A degraded face is preferable to an altered face.\n\nAdd subtle, realistic, historically plausible color based only on information supported by the photograph. Keep saturation low to moderate and natural. Use neutral white balance and realistic skin tones. Avoid orange, yellow, sepia, golden, cinematic, or otherwise stylized color grading. Do not make colors brighter or more vivid simply because the image is being colorized. Preserve the original lighting and tonal relationships.\n\nDo NOT restore, clean, or remove the photograph's existing grain, scratches, dust, fading, blur, damage, or other visible artifacts. Keep the original photographic texture and imperfections intact. Do not oversharpen, smooth skin, add artificial detail, or modernize the appearance. The result should look like the original photograph naturally colorized, with its original age and physical character preserved.";


export const BLACK_AND_WHITE_COLORIZE_PROMPT =
  "Restore and naturally colorize this black-and-white photograph with an extremely faithful, conservative approach. The source image is the authority: preserve the exact identity, facial structure, facial proportions, expression, age, pose, hairstyle, clothing, objects, architecture, composition, perspective, lighting direction, shadows, and scene. NEVER redesign, reconstruct, beautify, or reinterpret a face. If facial information is degraded, blurry, obscured, or missing, preserve the original shapes and proportions and make only minimal corrections supported by visible source information. Do not invent facial features or replace uncertain areas with plausible-looking features. A degraded or imperfect face is preferable to an altered face.\n\nRepair genuine photographic degradation such as severe fading, dust, scratches, damaged shadows, uneven tones, and loss of contrast. Recover detail only where it is clearly supported by the source. Do not oversharpen, smooth skin, or generate artificial facial detail.\n\nAdd subtle, realistic, historically plausible color. Keep saturation restrained and natural, with neutral white balance and realistic skin tones. Avoid orange, yellow, sepia, golden, cinematic, teal/orange, or artificially warm color grading. Do not increase saturation or brightness merely to make the image look more modern. Preserve the original lighting and tonal relationships.\n\nThis is restoration and colorization, not reinterpretation or new image generation. The final image should look like the same original photograph after careful professional restoration and conservative colorization, not like a newly generated photograph.";


export const RESTORE_PRESERVE_GRAIN_PROMPT =
  "Restore this photograph conservatively and faithfully while preserving its original film character and imperfections. The source image is the authority: preserve the exact identity, facial structure, facial proportions, expression, age, pose, hairstyle, clothing, objects, architecture, composition, perspective, lighting direction, shadows, and scene. NEVER redesign, reconstruct, beautify, or reinterpret a face. If facial information is degraded, blurry, obscured, or missing, preserve the original shapes and proportions and make only minimal corrections supported by visible source information. Do not invent facial features or replace uncertain areas with plausible-looking features. A degraded or imperfect face is preferable to an altered face.\n\nCorrect genuine degradation such as fading, color casts, uneven tones, low contrast, and damaged shadows while preserving the photograph's original grain, scratches, dust, texture, softness, and other visible photographic artifacts. Do not clean up, remove, suppress, or artificially regenerate these characteristics. Preserve the original film grain structure and overall photographic texture.\n\nKeep colors restrained, neutral, and physically plausible. Avoid increased saturation, orange or yellow casts, sepia, golden tones, cinematic color grading, teal/orange grading, or artificially warm lighting. Preserve the original white balance and lighting character unless there is clear evidence of fading or color shift. Do not make the image look newer, brighter, sharper, or more colorful than the source warrants.\n\nThis is restoration, not reinterpretation or new image generation. Do not oversharpen, smooth skin, beautify faces, add artificial detail, or modernize the photograph. The result should look like the same photograph carefully restored while retaining its original age, film character, and imperfections.";

// V2 prompts. Instead of long lists of what not to do, each one names the
// only changes allowed and says everything else stays as in the source. They
// also protect blurred backgrounds, which the model tends to "sharpen" by
// inventing detail, and stay short so the orchestrating model's rewrite keeps
// the important parts.

const V2_PASS_THROUGH =
  "When calling the image tool, pass all of these instructions through in full; do not shorten or soften them.";

const V2_UNCHANGED = `Everything else must match the source exactly:
- People: same face shape, eyes, nose, mouth, expression, age, skin texture, hair, pose and clothing. If a face is small, soft, out of focus or partly damaged, leave it just as soft. Do not redraw, sharpen, clarify or beautify it.
- Background: anything blurred, out of focus, hazy or low in detail (trees, foliage, grass, crowds, buildings, city streets, sky, bokeh) stays equally blurred. Do not add leaves, branches, windows, signs, people, edges or texture.
- Composition, crop, framing, perspective, depth of field, lighting direction and shadows stay the same.
- Sharpness stays the same everywhere: no sharpening, upscaled-looking detail, denoising, skin smoothing or HDR look.`;

export const DEFAULT_PROMPT_V2 = `Edit this photograph as a careful darkroom restoration of the same print, not a new image. The result should line up with the original almost pixel for pixel.

Allowed changes, and nothing more:
- Correct fading, color casts, low contrast and uneven exposure.
- Remove dust, specks, scratches, creases, tears and stains, filling each one to match its immediate surroundings at the same sharpness.

${V2_UNCHANGED}

Color: neutral, true to the scene, moderate natural saturation. No warm, orange, golden, teal-orange or cinematic grading.

If you are unsure whether something is damage or part of the scene, leave it unchanged.

${V2_PASS_THROUGH}`;

export const RESTORE_PRESERVE_GRAIN_PROMPT_V2 = `Edit this photograph as a careful color and tone correction of the same print, not a new image. The result should line up with the original almost pixel for pixel.

Allowed changes, and nothing more:
- Correct fading, color casts, low contrast and uneven exposure.

Keep all physical character exactly as it is: film grain, dust, specks, scratches, creases, stains, softness and blur all stay in place. Do not clean, remove or regenerate them.

${V2_UNCHANGED}

Color: neutral, true to the scene, moderate natural saturation. No warm, orange, golden, sepia, teal-orange or cinematic grading. The photo should not look newer than it is.

${V2_PASS_THROUGH}`;

export const BLACK_AND_WHITE_COLORIZE_PROMPT_V2 = `Edit this black-and-white photograph by restoring damage and adding natural color to the same image, not by creating a new one. The result should line up with the original almost pixel for pixel.

Allowed changes, and nothing more:
- Remove dust, specks, scratches, creases, tears and stains, filling each one to match its immediate surroundings at the same sharpness.
- Gently correct faded or uneven contrast.
- Add color. Treat it like hand-tinting: each area keeps the brightness and shading it has in the source, and only gains a hue.

${V2_UNCHANGED}

Color: realistic and historically plausible, with low to moderate saturation, neutral white balance and natural skin tones. No warm, orange, golden, sepia, teal-orange or cinematic grading, and no extra brightness.

If you are unsure whether something is damage or part of the scene, leave it unchanged.

${V2_PASS_THROUGH}`;

export const BWGRAIN_PROMPT_V2 = `Edit this black-and-white photograph by adding natural color to the same image, not by creating a new one. The result should line up with the original almost pixel for pixel.

Allowed changes, and nothing more:
- Add color. Treat it like hand-tinting: each area keeps the brightness and shading it has in the source, and only gains a hue.

Keep all physical character exactly as it is: film grain, dust, specks, scratches, creases, stains, fading, softness and blur all stay in place. Do not clean, restore or regenerate them.

${V2_UNCHANGED}

Color: realistic and historically plausible, with low to moderate saturation, neutral white balance and natural skin tones. No warm, orange, golden, sepia, teal-orange or cinematic grading, and no extra brightness. The photo should keep its age.

${V2_PASS_THROUGH}`;
