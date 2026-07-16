/**
 * AI Engine - Hugging Face Inpainting Integration
 * Uses the official @huggingface/inference JS library (via CDN) to handle CORS correctly.
 * Images are sent as Blobs (binary) - not base64 JSON - which is what the HF API expects.
 */

// ── Import official HF library from CDN (handles CORS automatically) ────────
import { HfInference } from 'https://esm.run/@huggingface/inference';

const AI_ENGINE = {

    // ─── Token Management ───────────────────────────────────────────────────
    getToken()       { return localStorage.getItem('hf_api_token') || ''; },
    setToken(token)  { localStorage.setItem('hf_api_token', token.trim()); },
    hasToken()       { return !!this.getToken(); },

    // ─── Prompt Generation ──────────────────────────────────────────────────
    generatePrompt(materialNode) {
        const url      = materialNode.getValue() || '';
        const filename = url.split('/').pop().split('?')[0].toLowerCase();

        let mat = 'smooth plastered wall, natural daylight, architectural photo';
        if (/brick|طابوق|طوب/.test(filename))
            mat = 'red clay brick wall, mortar joints, architectural photorealistic render';
        else if (/marble|رخام/.test(filename))
            mat = 'polished white marble, fine veining, architectural interior';
        else if (/wood|خشب|parquet/.test(filename))
            mat = 'natural wood texture, horizontal planks, warm interior light';
        else if (/porcelain|porcela|بورسلين/.test(filename))
            mat = 'glossy porcelain tile, large format, clean grout lines, modern interior';
        else if (/tile|سيراميك|ceramic/.test(filename))
            mat = 'ceramic tile surface, architectural visualization, photorealistic';
        else if (/concrete|خرسانة/.test(filename))
            mat = 'raw concrete wall, brutalist architecture, high detail render';
        else if (/stone|حجر/.test(filename))
            mat = 'natural stone cladding, rough texture, exterior wall';
        else if (/metal|معدن|steel/.test(filename))
            mat = 'brushed metal panel, industrial architecture, modern facade';

        return `${mat}, photorealistic, 8k, high resolution, professional architectural photography, seamless texture`;
    },

    // ─── Image → Blob Helpers ───────────────────────────────────────────────
    /**
     * Loads an image URL and returns a Blob (binary PNG) scaled to maxSize.
     * HF API expects Blob, not base64.
     */
    async imageUrlToBlob(url, maxSize = 512) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight, 1);
                const w = Math.round(img.naturalWidth  * scale);
                const h = Math.round(img.naturalHeight * scale);
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                c.getContext('2d').drawImage(img, 0, 0, w, h);
                c.toBlob(blob => blob ? resolve({ blob, w, h }) : reject(new Error('Canvas toBlob failed')), 'image/png');
            };
            img.onerror = () => reject(new Error('Failed to load image: ' + url.slice(0, 60)));
            img.src = url;
        });
    },

    /**
     * Converts mask canvas alpha channel to a white/black PNG Blob (white = repaint, black = keep).
     * Scaled to target dimensions to match the source image blob.
     */
    async maskCanvasToBlob(maskCanvas, targetW, targetH) {
        return new Promise((resolve, reject) => {
            const c   = document.createElement('canvas');
            c.width   = targetW;
            c.height  = targetH;
            const ctx = c.getContext('2d');

            // Draw mask scaled to target size
            if (maskCanvas && maskCanvas.width > 0 && maskCanvas.height > 0) {
                ctx.drawImage(maskCanvas, 0, 0, targetW, targetH);
            }

            // Convert alpha → white/black (HF expects white = inpaint area)
            const imgData = ctx.getImageData(0, 0, targetW, targetH);
            const d = imgData.data;
            for (let i = 0; i < d.length; i += 4) {
                const val = d[i + 3] > 10 ? 255 : 0;
                d[i] = d[i+1] = d[i+2] = val;
                d[i+3] = 255;
            }
            ctx.putImageData(imgData, 0, 0);

            c.toBlob(blob => blob ? resolve(blob) : reject(new Error('Mask toBlob failed')), 'image/png');
        });
    },

    // ─── Core AI Call ───────────────────────────────────────────────────────
    /**
     * Calls HF Inpainting via official @huggingface/inference library.
     * Uses imageToImage with mask_image parameter.
     */
    async callHFInpainting(imageBlob, maskBlob, prompt) {
        const token = this.getToken();
        const hf    = new HfInference(token);

        // Use the stable diffusion inpainting model
        const resultBlob = await hf.imageToImage({
            model: 'stable-diffusion-v1-5/stable-diffusion-inpainting',
            inputs: imageBlob,
            parameters: {
                prompt,
                mask_image: maskBlob,
                strength:              0.98,
                num_inference_steps:   25,
                guidance_scale:        7.5,
                negative_prompt:       'blurry, distorted, low quality, cartoon, unrealistic, watermark, text, tiling artifacts',
            }
        });

        return resultBlob; // Blob
    },

    // ─── Blob → DataURL helper ──────────────────────────────────────────────
    blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },

    // ─── Composite AI result back onto original full-res image ──────────────
    async compositeOnOriginal(originalUrl, maskCanvas, aiResultBlob) {
        const aiDataUrl = await this.blobToDataUrl(aiResultBlob);

        return new Promise((resolve, reject) => {
            const origImg = new Image();
            const aiImg   = new Image();
            origImg.crossOrigin = 'anonymous';
            aiImg.crossOrigin   = 'anonymous';
            let loaded = 0;

            const onBothLoaded = () => {
                loaded++;
                if (loaded < 2) return;
                try {
                    const W = origImg.naturalWidth  || origImg.width;
                    const H = origImg.naturalHeight || origImg.height;

                    const c   = document.createElement('canvas');
                    c.width   = W; c.height = H;
                    const ctx = c.getContext('2d');
                    ctx.drawImage(origImg, 0, 0, W, H);
                    const origData = ctx.getImageData(0, 0, W, H);

                    // Scale mask to full-res
                    const maskC   = document.createElement('canvas');
                    maskC.width   = W; maskC.height = H;
                    const maskCtx = maskC.getContext('2d');
                    if (maskCanvas && maskCanvas.width > 0) {
                        maskCtx.drawImage(maskCanvas, 0, 0, W, H);
                    }
                    const maskData = maskCtx.getImageData(0, 0, W, H).data;

                    // Scale AI result to full-res
                    const aiC   = document.createElement('canvas');
                    aiC.width   = W; aiC.height = H;
                    aiC.getContext('2d').drawImage(aiImg, 0, 0, W, H);
                    const aiData = aiC.getContext('2d').getImageData(0, 0, W, H).data;

                    // Blend: where mask alpha > 0, use AI result; elsewhere keep original
                    const out = origData;
                    for (let i = 0; i < maskData.length; i += 4) {
                        const alpha = maskData[i + 3];
                        if (alpha > 10) {
                            const blend = alpha / 255;
                            out.data[i]     = aiData[i]     * blend + out.data[i]     * (1 - blend);
                            out.data[i + 1] = aiData[i + 1] * blend + out.data[i + 1] * (1 - blend);
                            out.data[i + 2] = aiData[i + 2] * blend + out.data[i + 2] * (1 - blend);
                        }
                    }
                    ctx.putImageData(out, 0, 0);
                    resolve(c.toDataURL('image/jpeg', 0.95));
                } catch (err) { reject(err); }
            };

            origImg.onload  = onBothLoaded;
            aiImg.onload    = onBothLoaded;
            origImg.onerror = reject;
            aiImg.onerror   = reject;
            origImg.src     = originalUrl;
            aiImg.src       = aiDataUrl;
        });
    },

    // ─── Full Pipeline ──────────────────────────────────────────────────────
    /**
     * Main entry point: applies material texture to the selected region using AI.
     * @param {Object}   srcImageNode   - The building/room image node (has maskCanvas)
     * @param {Object}   materialNode   - The material/texture node
     * @param {Function} onProgress     - Callback(statusString) for UI updates
     * @returns {Promise<string>}       - Final composited image as data URL
     */
    async applyMaterial(srcImageNode, materialNode, onProgress) {
        onProgress('Preparing images...');

        const srcUrl = srcImageNode.getValue();
        if (!srcUrl)                              throw new Error('Source image is empty');
        if (!srcImageNode.maskCanvas)             throw new Error('No mask found - please draw a selection first');

        // 1. Scale source image to 512×512 Blob (AI max input)
        onProgress('Scaling source image...');
        const { blob: imgBlob, w: aiW, h: aiH } = await this.imageUrlToBlob(srcUrl, 512);

        // 2. Scale mask to same dimensions as Blob
        onProgress('Processing selection mask...');
        const maskBlob = await this.maskCanvasToBlob(srcImageNode.maskCanvas, aiW, aiH);

        // 3. Generate contextual prompt from material filename
        const prompt = this.generatePrompt(materialNode);
        onProgress(`Sending to AI: "${prompt.split(',')[0]}"...`);

        // 4. Call HF Inpainting (official library - handles CORS)
        const aiResultBlob = await this.callHFInpainting(imgBlob, maskBlob, prompt);

        // 5. Composite AI result back onto original full-resolution image
        onProgress('Compositing result on original image...');
        const finalUrl = await this.compositeOnOriginal(srcUrl, srcImageNode.maskCanvas, aiResultBlob);

        onProgress('Done! ✨');
        return finalUrl;
    }
};

export default AI_ENGINE;
