/**
 * AI Engine - Hugging Face Inpainting Integration
 * Applies materials to architectural surfaces using AI (like Vectary Canvas)
 * Model: stable-diffusion-v1-5/stable-diffusion-inpainting
 */

const AI_ENGINE = {

    // ─── Token Management ────────────────────────────────────────────────
    getToken() {
        return localStorage.getItem('hf_api_token') || '';
    },

    setToken(token) {
        localStorage.setItem('hf_api_token', token.trim());
    },

    hasToken() {
        return !!this.getToken();
    },

    // ─── Prompt Generation ───────────────────────────────────────────────
    /**
     * Generates an AI prompt from the material node's image filename and dominant color
     */
    generatePrompt(materialNode, srcImageNode) {
        const url = materialNode.getValue() || '';
        const filename = url.split('/').pop().split('?')[0].toLowerCase();

        // Detect material type from filename
        let materialType = 'architectural surface texture';
        if (/brick|طابوق|طوب/.test(filename))          materialType = 'brick wall texture, red clay bricks with mortar joints';
        else if (/marble|رخام/.test(filename))          materialType = 'polished marble stone texture, veined surface';
        else if (/wood|خشب|parquet/.test(filename))    materialType = 'wood texture, natural grain pattern';
        else if (/porcelain|porcela|بورسلين/.test(filename)) materialType = 'porcelain tile texture, glossy smooth surface';
        else if (/tile|سيراميك|ceramic/.test(filename)) materialType = 'ceramic tile texture, clean grout lines';
        else if (/concrete|خرسانة/.test(filename))     materialType = 'raw concrete surface texture';
        else if (/stone|حجر/.test(filename))           materialType = 'natural stone cladding texture';
        else if (/metal|معدن|steel/.test(filename))    materialType = 'metal panel texture, industrial finish';
        else if (/plaster|جبس/.test(filename))         materialType = 'smooth plaster wall texture';

        return `${materialType}, architectural visualization, photorealistic render, seamless pattern, professional interior photography, high quality, detailed, 8k`;
    },

    // ─── Image → Base64 Helpers ──────────────────────────────────────────
    /**
     * Converts an image node's URL to a scaled base64 PNG (max 512×512 for API efficiency)
     */
    async imageUrlToBase64(url, maxSize = 512) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight, 1);
                const w = Math.round(img.naturalWidth * scale);
                const h = Math.round(img.naturalHeight * scale);
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                c.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve({ dataUrl: c.toDataURL('image/png'), w, h });
            };
            img.onerror = reject;
            img.src = url;
        });
    },

    /**
     * Converts a mask canvas to a scaled base64 PNG (white = fill, black = keep)
     * The HF inpainting model expects: white pixels = area to repaint
     */
    async maskCanvasToBase64(maskCanvas, targetW, targetH) {
        const c = document.createElement('canvas');
        c.width = targetW; c.height = targetH;
        const ctx = c.getContext('2d');

        // Draw mask scaled to target size
        if (maskCanvas.width > 0 && maskCanvas.height > 0) {
            ctx.drawImage(maskCanvas, 0, 0, targetW, targetH);
        }

        // Convert alpha channel to white/black mask
        const imgData = ctx.getImageData(0, 0, targetW, targetH);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            const val = alpha > 10 ? 255 : 0;
            data[i] = val;
            data[i + 1] = val;
            data[i + 2] = val;
            data[i + 3] = 255; // fully opaque mask
        }
        ctx.putImageData(imgData, 0, 0);
        return c.toDataURL('image/png');
    },

    /**
     * Strips "data:image/png;base64," prefix and returns raw base64 string
     */
    stripPrefix(dataUrl) {
        return dataUrl.replace(/^data:image\/\w+;base64,/, '');
    },

    // ─── Core AI Call ─────────────────────────────────────────────────────
    /**
     * Calls Hugging Face Inpainting API
     * @param {string} imageBase64   - Original image (base64, no prefix)
     * @param {string} maskBase64    - Mask image (base64, no prefix, white=repaint)
     * @param {string} prompt        - Text description of the material to apply
     * @returns {Promise<string>}    - Result image as a data URL
     */
    async callInpaintingAPI(imageBase64, maskBase64, prompt) {
        const token = this.getToken();
        if (!token) throw new Error('No HF token set');

        const MODEL = 'https://api-inference.huggingface.co/models/stable-diffusion-v1-5/stable-diffusion-inpainting';

        const response = await fetch(MODEL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    image: imageBase64,
                    mask_image: maskBase64,
                    strength: 0.98,
                    num_inference_steps: 25,
                    guidance_scale: 7.5,
                    negative_prompt: 'blurry, distorted, low quality, cartoon, unrealistic, watermark, text',
                }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            // Model may be loading (503) - give user a clear message
            if (response.status === 503) {
                throw new Error('AI model is warming up (30-60 seconds). Please try again in a moment.');
            }
            if (response.status === 401) {
                throw new Error('Invalid Hugging Face token. Please check your API key in AI Settings.');
            }
            throw new Error(`API error ${response.status}: ${errText.slice(0, 200)}`);
        }

        // Response is binary image blob
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },

    // ─── Full Pipeline ────────────────────────────────────────────────────
    /**
     * Main entry point: applies material to masked region of srcImageNode using AI
     * @param {Object} srcImageNode     - The building/room image node
     * @param {Object} materialNode     - The material/texture image node
     * @param {Function} onProgress     - Callback(message) for status updates
     * @returns {Promise<string>}       - Final composited image as data URL
     */
    async applyMaterial(srcImageNode, materialNode, onProgress) {
        onProgress('Preparing images for AI...');

        const srcUrl = srcImageNode.getValue();
        if (!srcUrl) throw new Error('Source image is empty');

        // 1. Scale original image to 512×512 (API requirement)
        const { dataUrl: scaledImgUrl, w: aiW, h: aiH } = await this.imageUrlToBase64(srcUrl, 512);

        // 2. Scale mask to same dimensions
        onProgress('Processing selection mask...');
        const maskBase64Url = await this.maskCanvasToBase64(srcImageNode.maskCanvas, aiW, aiH);

        // 3. Generate prompt from material filename
        const prompt = this.generatePrompt(materialNode, srcImageNode);
        onProgress(`Sending to AI: "${prompt.split(',')[0]}"...`);

        // 4. Call AI API
        const imageB64 = this.stripPrefix(scaledImgUrl);
        const maskB64  = this.stripPrefix(maskBase64Url);
        const aiResultUrl = await this.callInpaintingAPI(imageB64, maskB64, prompt);

        // 5. Composite: paste AI result onto original full-res image only in masked area
        onProgress('Compositing result onto original image...');
        const finalUrl = await this.compositeOnOriginal(srcUrl, srcImageNode.maskCanvas, aiResultUrl, aiW, aiH);

        onProgress('Done!');
        return finalUrl;
    },

    /**
     * Composites the AI result (at AI resolution) back onto the original full-res image
     * using the mask, so unmasked areas stay pixel-perfect from the original.
     */
    async compositeOnOriginal(originalUrl, maskCanvas, aiResultUrl, aiW, aiH) {
        return new Promise((resolve, reject) => {
            const origImg   = new Image();
            const aiImg     = new Image();
            origImg.crossOrigin = 'anonymous';
            aiImg.crossOrigin   = 'anonymous';
            let loaded = 0;

            const onBothLoaded = () => {
                loaded++;
                if (loaded < 2) return;
                try {
                    const W = origImg.naturalWidth  || origImg.width;
                    const H = origImg.naturalHeight || origImg.height;

                    const c = document.createElement('canvas');
                    c.width = W; c.height = H;
                    const ctx = c.getContext('2d');

                    // 1. Draw original
                    ctx.drawImage(origImg, 0, 0, W, H);

                    // 2. Draw AI result ONLY inside the mask using globalCompositeOperation
                    //    - Save current pixels as "destination"
                    //    - Draw mask as clipping region
                    //    - Then draw AI result scaled to full res

                    // Get mask data (scaled to W×H)
                    const maskC = document.createElement('canvas');
                    maskC.width = W; maskC.height = H;
                    const maskCtx = maskC.getContext('2d');
                    if (maskCanvas.width > 0) {
                        maskCtx.drawImage(maskCanvas, 0, 0, W, H);
                    }
                    const maskData = maskCtx.getImageData(0, 0, W, H).data;

                    // Get original data
                    const origData = ctx.getImageData(0, 0, W, H);

                    // Draw AI result onto temp canvas (scaled to W×H)
                    const aiC = document.createElement('canvas');
                    aiC.width = W; aiC.height = H;
                    aiC.getContext('2d').drawImage(aiImg, 0, 0, W, H);
                    const aiData = aiC.getContext('2d').getImageData(0, 0, W, H).data;

                    // Blend: where mask alpha > 0, use AI; elsewhere use original
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
                } catch (err) {
                    reject(err);
                }
            };

            origImg.onload = onBothLoaded;
            aiImg.onload   = onBothLoaded;
            origImg.onerror = reject;
            aiImg.onerror   = reject;
            origImg.src = originalUrl;
            aiImg.src   = aiResultUrl;
        });
    }
};

export default AI_ENGINE;
