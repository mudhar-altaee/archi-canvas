/**
 * AI Engine - Stability AI Inpainting Integration
 * Uses Stability AI's REST API (CORS supported, 25 free credits on signup)
 * Also supports HF Router as fallback
 */

const AI_ENGINE = {

    // ─── Token Management ───────────────────────────────────────────────────
    getToken()             { return localStorage.getItem('hf_api_token') || ''; },
    setToken(t)            { localStorage.setItem('hf_api_token', t.trim()); },
    hasToken()             { return !!this.getToken(); },
    getStabilityToken()    { return localStorage.getItem('stability_api_token') || ''; },
    setStabilityToken(t)   { localStorage.setItem('stability_api_token', t.trim()); },
    hasStabilityToken()    { return !!this.getStabilityToken(); },

    // ─── Check mask has actual painted pixels ────────────────────────────────
    maskHasContent(maskCanvas) {
        if (!maskCanvas || maskCanvas.width === 0) return false;
        const ctx  = maskCanvas.getContext('2d');
        const data = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 10) return true;  // any non-transparent pixel
        }
        return false;
    },

    // ─── Prompt: analyze dominant color of the material image ───────────────
    /**
     * Samples the material image's dominant color to enrich the text prompt
     * so the AI knows the actual color of the material.
     */
    async analyzeMaterialColor(materialNode) {
        return new Promise((resolve) => {
            const url = materialNode.getValue();
            if (!url) { resolve('neutral'); return; }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const c = document.createElement('canvas');
                c.width = 32; c.height = 32;
                c.getContext('2d').drawImage(img, 0, 0, 32, 32);
                const d = c.getContext('2d').getImageData(0, 0, 32, 32).data;
                let r = 0, g = 0, b = 0, cnt = 0;
                for (let i = 0; i < d.length; i += 4) {
                    r += d[i]; g += d[i+1]; b += d[i+2]; cnt++;
                }
                r = Math.round(r / cnt);
                g = Math.round(g / cnt);
                b = Math.round(b / cnt);

                // Map dominant color to name
                const max = Math.max(r, g, b);
                let colorName = 'neutral';
                if (max === r && r > 140 && r > g * 1.3) colorName = 'red';
                else if (max === r && r > 160 && g > 100) colorName = 'orange';
                else if (r > 200 && g > 200 && b > 200)  colorName = 'white';
                else if (r < 80  && g < 80  && b < 80)   colorName = 'dark gray';
                else if (r > 150 && g > 120 && b < 80)   colorName = 'beige';
                else if (max === b && b > 120)             colorName = 'blue';
                else if (r > 100 && g > 80 && b < 60)    colorName = 'brown';
                else if (r > 180 && g > 160 && b > 100)  colorName = 'cream';
                resolve(colorName);
            };
            img.onerror = () => resolve('neutral');
            img.src = url;
        });
    },

    // ─── Prompt Generation ──────────────────────────────────────────────────
    async generatePrompt(materialNode) {
        const url      = materialNode.getValue() || '';
        const filename = url.split('/').pop().split('?')[0].toLowerCase();
        const color    = await this.analyzeMaterialColor(materialNode);

        let matType = 'smooth wall surface';
        let extras  = '';

        if (/brick|طابوق|طوب/.test(filename)) {
            matType = 'brick wall';
            extras  = 'visible individual bricks, regular mortar joints, textured surface';
        } else if (/marble|رخام/.test(filename)) {
            matType = 'marble wall';
            extras  = 'polished surface, natural stone veining, reflective finish';
        } else if (/wood|خشب|parquet/.test(filename)) {
            matType = 'wood cladding wall';
            extras  = 'natural wood grain, horizontal planks, warm texture';
        } else if (/porcelain|porcela|بورسلين/.test(filename)) {
            matType = 'large-format porcelain tile wall';
            extras  = 'glossy smooth surface, thin grout lines, modern finish';
        } else if (/tile|سيراميك|ceramic/.test(filename)) {
            matType = 'ceramic tile wall';
            extras  = 'regular tile grid pattern, grout lines visible';
        } else if (/concrete|خرسانة/.test(filename)) {
            matType = 'raw concrete wall';
            extras  = 'rough texture, exposed aggregate, brutalist finish';
        } else if (/stone|حجر/.test(filename)) {
            matType = 'natural stone wall';
            extras  = 'rough irregular stone blocks, rustic appearance';
        } else if (/metal|معدن|steel/.test(filename)) {
            matType = 'metal panel wall';
            extras  = 'industrial finish, brushed surface, modern facade';
        } else if (/plaster|جبس/.test(filename)) {
            matType = 'smooth plastered wall';
            extras  = 'clean flat surface, matte finish';
        }

        // Strong directive prompt for Stability AI
        return `architectural visualization, building facade with ${color} ${matType}, ${extras}, photorealistic render, high quality, 8k resolution, professional architecture photography, dramatic lighting, the entire masked area is covered with this material`;
    },

    // ─── Image / Mask Canvas Helpers ────────────────────────────────────────
    async urlToScaledCanvas(url, maxW, maxH) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                // Stability AI works best with multiples of 64
                let w = img.naturalWidth;
                let h = img.naturalHeight;
                const scale = Math.min(maxW / w, maxH / h, 1);
                w = Math.round(w * scale / 64) * 64;
                h = Math.round(h * scale / 64) * 64;
                if (w < 64) w = 64;
                if (h < 64) h = 64;
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                c.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve({ canvas: c, w, h });
            };
            img.onerror = () => reject(new Error('Failed to load source image'));
            img.src = url;
        });
    },

    canvasToBlob(canvas, type = 'image/png') {
        return new Promise((resolve, reject) =>
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), type)
        );
    },

    canvasToBase64(canvas) {
        return canvas.toDataURL('image/png').replace(/^data:image\/\w+;base64,/, '');
    },

    /**
     * Build mask: white = repaint area, black = keep area
     * Also "grows" the mask slightly (dilates) to ensure full coverage at edges
     */
    buildMaskCanvas(maskCanvas, targetW, targetH) {
        const c   = document.createElement('canvas');
        c.width   = targetW; c.height = targetH;
        const ctx = c.getContext('2d');

        // Fill black first (keep everything by default)
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, targetW, targetH);

        // Draw the user's mask scaled to target
        if (maskCanvas && maskCanvas.width > 0) {
            ctx.drawImage(maskCanvas, 0, 0, targetW, targetH);
        }

        // Convert: alpha channel → binary white/black
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

    // ─── Strategy A: Stability AI ────────────────────────────────────────────
    async callStabilityAI(imgBlob, maskBlob, prompt) {
        const token = this.getStabilityToken();

        const formData = new FormData();
        formData.append('image',          imgBlob,  'image.png');
        formData.append('mask',           maskBlob, 'mask.png');
        formData.append('prompt',         prompt);
        formData.append('negative_prompt','blurry, distorted, cartoonish, low resolution, watermark, text, deformed');
        formData.append('output_format',  'jpeg');
        formData.append('strength',       '0.99');  // 0.99 = strong transformation
        formData.append('grow_mask',      '5');     // dilate mask edges by 5px for clean blending

        const resp = await fetch(
            'https://api.stability.ai/v2beta/stable-image/edit/inpaint',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'image/*',
                },
                body: formData,
            }
        );

        if (!resp.ok) {
            const txt = await resp.text();
            if (resp.status === 401) throw new Error('Invalid Stability AI key. Please check your API key in AI Settings.');
            if (resp.status === 402) throw new Error('Stability AI: Insufficient credits. Please top up at platform.stability.ai.');
            throw new Error(`Stability AI error ${resp.status}: ${txt.slice(0, 300)}`);
        }
        return await resp.blob();
    },

    // ─── Strategy B: HF Router (fallback) ────────────────────────────────────
    async callHFRouter(imgBase64, maskBase64, prompt) {
        const token = this.getToken();
        const resp  = await fetch(
            'https://router.huggingface.co/hf-inference/models/stable-diffusion-v1-5/stable-diffusion-inpainting',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(120_000),
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: {
                        image:               imgBase64,
                        mask_image:          maskBase64,
                        strength:            0.99,
                        num_inference_steps: 25,
                        guidance_scale:      8.0,
                        negative_prompt:     'blurry, distorted, low quality, cartoon, unrealistic, deformed',
                    }
                })
            }
        );

        if (resp.status === 503) {
            const body = await resp.json().catch(() => ({}));
            const wait = Math.ceil(body.estimated_time || 30);
            throw new Error(`AI model warming up (est. ${wait}s). Please try again in a moment.`);
        }
        if (resp.status === 401) throw new Error('Invalid Hugging Face token. Update it in AI Settings.');
        if (!resp.ok) {
            const txt = await resp.text();
            throw new Error(`HF API error ${resp.status}: ${txt.slice(0, 200)}`);
        }
        return await resp.blob();
    },

    // ─── Composite AI result onto full-resolution original ───────────────────
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

                    // Original
                    ctx.drawImage(origImg, 0, 0, W, H);
                    const origData = ctx.getImageData(0, 0, W, H);

                    // Mask (scaled to full-res)
                    const mc = document.createElement('canvas');
                    mc.width = W; mc.height = H;
                    if (maskCanvas && maskCanvas.width > 0) {
                        mc.getContext('2d').drawImage(maskCanvas, 0, 0, W, H);
                    }
                    const maskData = mc.getContext('2d').getImageData(0, 0, W, H).data;

                    // AI result (scaled to full-res)
                    const ac = document.createElement('canvas');
                    ac.width = W; ac.height = H;
                    ac.getContext('2d').drawImage(aiImg, 0, 0, W, H);
                    const aiData = ac.getContext('2d').getImageData(0, 0, W, H).data;

                    // Blend: masked area → AI result; rest → original
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
                } catch (e) { reject(e); }
            };

            origImg.onload  = onBoth; aiImg.onload  = onBoth;
            origImg.onerror = reject; aiImg.onerror = reject;
            origImg.src = originalUrl;
            aiImg.src   = aiDataUrl;
        });
    },

    // ─── Full Pipeline ────────────────────────────────────────────────────────
    async applyMaterial(srcImageNode, materialNode, onProgress) {
        onProgress('Checking selection mask...');

        const srcUrl = srcImageNode.getValue();
        if (!srcUrl) throw new Error('Source image is empty.');

        // ── Critical: Validate mask has painted pixels ──
        if (!srcImageNode.maskCanvas || !this.maskHasContent(srcImageNode.maskCanvas)) {
            throw new Error(
                'No selection found!\n\n' +
                'Please use the Brush (🖌) or Lasso (⬡) tools to paint the area\n' +
                'you want to apply the material to, then press Play again.'
            );
        }

        onProgress('Analyzing material...');
        const prompt = await this.generatePrompt(materialNode);

        onProgress('Scaling image for AI (multiples of 64px)...');
        const { canvas: imgCanvas, w: aiW, h: aiH } = await this.urlToScaledCanvas(srcUrl, 1024, 1024);
        const maskCanvas64 = this.buildMaskCanvas(srcImageNode.maskCanvas, aiW, aiH);

        // ── Stability AI path ──
        if (this.hasStabilityToken()) {
            onProgress(`🧠 AI generating: "${prompt.split(',')[0]}"...`);
            const imgBlob  = await this.canvasToBlob(imgCanvas);
            const maskBlob = await this.canvasToBlob(maskCanvas64);
            const result   = await this.callStabilityAI(imgBlob, maskBlob, prompt);
            onProgress('Compositing result on full-resolution image...');
            return await this.compositeOnOriginal(srcUrl, srcImageNode.maskCanvas, result);
        }

        // ── HF Router fallback ──
        if (this.hasToken()) {
            onProgress(`🧠 AI generating (HF): "${prompt.split(',')[0]}"...`);
            const imgB64  = this.canvasToBase64(imgCanvas);
            const maskB64 = this.canvasToBase64(maskCanvas64);
            const result  = await this.callHFRouter(imgB64, maskB64, prompt);
            onProgress('Compositing result...');
            return await this.compositeOnOriginal(srcUrl, srcImageNode.maskCanvas, result);
        }

        throw new Error('No AI token found. Open AI Settings to add a Stability AI or Hugging Face token.');
    }
};

export default AI_ENGINE;
