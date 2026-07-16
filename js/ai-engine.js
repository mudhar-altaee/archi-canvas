/**
 * AI Engine - Stability AI Inpainting Integration
 * Uses Stability AI's REST API which:
 *  - Supports CORS from browsers ✅
 *  - Has a reliable inpainting endpoint ✅  
 *  - Gives 25 free credits on signup (enough for ~25 inpainting operations) ✅
 *  - Also supports Hugging Face token as fallback via router endpoint ✅
 *
 * Fallback chain:
 *  1. Stability AI (api.stability.ai) - best quality, CORS OK
 *  2. HF Router (router.huggingface.co) - free with HF token, CORS OK
 */

const AI_ENGINE = {

    // ─── Token Management ───────────────────────────────────────────────────
    getToken()       { return localStorage.getItem('hf_api_token') || ''; },
    setToken(token)  { localStorage.setItem('hf_api_token', token.trim()); },
    hasToken()       { return !!this.getToken(); },

    getStabilityToken()       { return localStorage.getItem('stability_api_token') || ''; },
    setStabilityToken(token)  { localStorage.setItem('stability_api_token', token.trim()); },
    hasStabilityToken()       { return !!this.getStabilityToken(); },

    // ─── Prompt Generation ──────────────────────────────────────────────────
    generatePrompt(materialNode) {
        const url      = materialNode.getValue() || '';
        const filename = url.split('/').pop().split('?')[0].toLowerCase();

        let mat = 'smooth plastered architectural wall';
        if (/brick|طابوق|طوب/.test(filename))
            mat = 'red clay brick wall with mortar joints, architectural render';
        else if (/marble|رخام/.test(filename))
            mat = 'white polished marble with fine gray veining';
        else if (/wood|خشب|parquet/.test(filename))
            mat = 'natural wood paneling with visible grain texture';
        else if (/porcelain|porcela|بورسلين/.test(filename))
            mat = 'large format glossy porcelain tile, clean grout lines';
        else if (/tile|سيراميك|ceramic/.test(filename))
            mat = 'ceramic wall tile with regular grout pattern';
        else if (/concrete|خرسانة/.test(filename))
            mat = 'exposed raw concrete wall surface';
        else if (/stone|حجر/.test(filename))
            mat = 'natural stone wall cladding, rough textured';
        else if (/metal|معدن|steel/.test(filename))
            mat = 'brushed stainless steel metal panel facade';

        return `${mat}, photorealistic architectural visualization, professional render, 8k, high detail`;
    },

    // ─── Image / Mask → Scaled Canvas Helpers ──────────────────────────────
    async urlToScaledCanvas(url, maxW, maxH) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
                const w = Math.round(img.naturalWidth  * scale);
                const h = Math.round(img.naturalHeight * scale);
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                c.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve({ canvas: c, w, h });
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = url;
        });
    },

    canvasToBlob(canvas, type = 'image/png', quality = 1) {
        return new Promise((resolve, reject) =>
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), type, quality)
        );
    },

    canvasToBase64(canvas) {
        return canvas.toDataURL('image/png').replace(/^data:image\/\w+;base64,/, '');
    },

    /**
     * Build the mask canvas: white = repaint, black = keep (binary PNG)
     */
    buildMaskCanvas(maskCanvas, targetW, targetH) {
        const c   = document.createElement('canvas');
        c.width   = targetW; c.height = targetH;
        const ctx = c.getContext('2d');
        if (maskCanvas && maskCanvas.width > 0) {
            ctx.drawImage(maskCanvas, 0, 0, targetW, targetH);
        }
        const imgData = ctx.getImageData(0, 0, targetW, targetH);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
            const val = d[i + 3] > 10 ? 255 : 0;
            d[i] = d[i+1] = d[i+2] = val;
            d[i+3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
        return c;
    },

    // ─── Strategy A: Stability AI REST API (best, free 25 credits on signup) ─
    async callStabilityAI(imgBlob, maskBlob, prompt) {
        const token = this.getStabilityToken();

        const formData = new FormData();
        formData.append('image',  imgBlob,  'image.png');
        formData.append('mask',   maskBlob, 'mask.png');
        formData.append('prompt', prompt);
        formData.append('output_format', 'png');

        const resp = await fetch('https://api.stability.ai/v2beta/stable-image/edit/inpaint', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'image/*',
            },
            body: formData,
        });

        if (!resp.ok) {
            const txt = await resp.text();
            throw new Error(`Stability AI error ${resp.status}: ${txt.slice(0, 200)}`);
        }
        return await resp.blob();
    },

    // ─── Strategy B: HF Router (free with HF token, supports CORS) ──────────
    async callHFRouter(imgBase64, maskBase64, prompt) {
        const token = this.getToken();

        // Use the HF router endpoint for inpainting
        const resp = await fetch(
            'https://router.huggingface.co/hf-inference/models/stable-diffusion-v1-5/stable-diffusion-inpainting',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(120_000), // 2 min timeout for cold start
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: {
                        image:       imgBase64,
                        mask_image:  maskBase64,
                        strength:               0.95,
                        num_inference_steps:    20,
                        guidance_scale:         7.5,
                        negative_prompt: 'blurry, distorted, low quality, cartoon, unrealistic',
                    }
                })
            }
        );

        if (resp.status === 503) {
            const body = await resp.json().catch(() => ({}));
            const waitSec = body.estimated_time || 20;
            throw new Error(`Model loading (est. ${Math.ceil(waitSec)}s). Please try again in a moment.`);
        }
        if (resp.status === 401) throw new Error('Invalid Hugging Face token. Update it in AI Settings.');
        if (!resp.ok) {
            const txt = await resp.text();
            throw new Error(`HF API error ${resp.status}: ${txt.slice(0, 200)}`);
        }
        return await resp.blob();
    },

    // ─── Composite AI result onto full-resolution original image ────────────
    async compositeOnOriginal(originalUrl, maskCanvas, aiResultBlob) {
        const aiDataUrl = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = rej;
            r.readAsDataURL(aiResultBlob);
        });

        return new Promise((resolve, reject) => {
            const origImg = new Image();
            const aiImg   = new Image();
            origImg.crossOrigin = 'anonymous';
            aiImg.crossOrigin   = 'anonymous';
            let loaded = 0;

            const onBoth = () => {
                loaded++;
                if (loaded < 2) return;
                try {
                    const W = origImg.naturalWidth  || origImg.width;
                    const H = origImg.naturalHeight || origImg.height;
                    const c   = document.createElement('canvas');
                    c.width = W; c.height = H;
                    const ctx = c.getContext('2d');

                    // Draw original
                    ctx.drawImage(origImg, 0, 0, W, H);
                    const origData = ctx.getImageData(0, 0, W, H);

                    // Scale mask
                    const mc = document.createElement('canvas');
                    mc.width = W; mc.height = H;
                    if (maskCanvas && maskCanvas.width > 0) {
                        mc.getContext('2d').drawImage(maskCanvas, 0, 0, W, H);
                    }
                    const maskData = mc.getContext('2d').getImageData(0, 0, W, H).data;

                    // Scale AI result
                    const ac = document.createElement('canvas');
                    ac.width = W; ac.height = H;
                    ac.getContext('2d').drawImage(aiImg, 0, 0, W, H);
                    const aiData = ac.getContext('2d').getImageData(0, 0, W, H).data;

                    // Blend in masked region
                    const out = origData;
                    for (let i = 0; i < maskData.length; i += 4) {
                        const a = maskData[i + 3];
                        if (a > 10) {
                            const blend = a / 255;
                            out.data[i]     = aiData[i]     * blend + out.data[i]     * (1 - blend);
                            out.data[i + 1] = aiData[i + 1] * blend + out.data[i + 1] * (1 - blend);
                            out.data[i + 2] = aiData[i + 2] * blend + out.data[i + 2] * (1 - blend);
                        }
                    }
                    ctx.putImageData(out, 0, 0);
                    resolve(c.toDataURL('image/jpeg', 0.95));
                } catch (e) { reject(e); }
            };

            origImg.onload  = onBoth; aiImg.onload  = onBoth;
            origImg.onerror = reject; aiImg.onerror = reject;
            origImg.src = originalUrl;
            aiImg.src   = aiDataUrl;
        });
    },

    // ─── Full Pipeline ──────────────────────────────────────────────────────
    async applyMaterial(srcImageNode, materialNode, onProgress) {
        onProgress('Preparing images...');

        const srcUrl = srcImageNode.getValue();
        if (!srcUrl)                  throw new Error('Source image is empty');
        if (!srcImageNode.maskCanvas) throw new Error('No selection mask found. Draw a selection first!');

        const prompt = this.generatePrompt(materialNode);
        onProgress('Scaling image to AI size (512×512)...');

        // Scale to 512×512 max (SD inpainting standard)
        const { canvas: imgCanvas, w: aiW, h: aiH } = await this.urlToScaledCanvas(srcUrl, 512, 512);
        const maskCanvas512 = this.buildMaskCanvas(srcImageNode.maskCanvas, aiW, aiH);

        // Try Stability AI first (if token present)
        if (this.hasStabilityToken()) {
            onProgress(`AI (Stability): "${prompt.split(',')[0]}"...`);
            const imgBlob  = await this.canvasToBlob(imgCanvas);
            const maskBlob = await this.canvasToBlob(maskCanvas512);
            const result   = await this.callStabilityAI(imgBlob, maskBlob, prompt);
            onProgress('Compositing result...');
            return await this.compositeOnOriginal(srcUrl, srcImageNode.maskCanvas, result);
        }

        // Fallback: HF Router
        if (this.hasToken()) {
            onProgress(`AI (HF): "${prompt.split(',')[0]}"...`);
            const imgB64  = this.canvasToBase64(imgCanvas);
            const maskB64 = this.canvasToBase64(maskCanvas512);
            const result  = await this.callHFRouter(imgB64, maskB64, prompt);
            onProgress('Compositing result...');
            return await this.compositeOnOriginal(srcUrl, srcImageNode.maskCanvas, result);
        }

        throw new Error('No AI token configured. Open AI Settings to add a token.');
    }
};

export default AI_ENGINE;
