/**
 * AI Engine - Classic Texture + AI Enhancement Pipeline
 *
 * Strategy:
 *  1. Apply the uploaded texture image classically (tile over masked region)
 *  2. Send the pre-textured image to Stability AI img2img (low strength = 0.3)
 *     so the AI PRESERVES the texture pattern but adds photorealistic lighting/shadows
 *  3. Composite back onto original using the mask
 *
 * This ensures the AI uses the ACTUAL uploaded texture, not a text description.
 */

const AI_ENGINE = {

    // ─── Token Management ────────────────────────────────────────────────────
    getToken()          { return localStorage.getItem('hf_api_token') || ''; },
    setToken(t)         { localStorage.setItem('hf_api_token', t.trim()); },
    hasToken()          { return !!this.getToken(); },
    getStabilityToken() { return localStorage.getItem('stability_api_token') || ''; },
    setStabilityToken(t){ localStorage.setItem('stability_api_token', t.trim()); },
    hasStabilityToken() { return !!this.getStabilityToken(); },

    // ─── Validate mask has painted pixels ────────────────────────────────────
    maskHasContent(maskCanvas) {
        if (!maskCanvas || maskCanvas.width === 0) return false;
        const data = maskCanvas.getContext('2d')
                               .getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 10) return true;
        }
        return false;
    },

    // ─── Load image URL → HTMLImageElement ───────────────────────────────────
    loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload  = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load: ' + url.slice(0, 80)));
            img.src = url;
        });
    },

    // ─── Canvas → Blob ────────────────────────────────────────────────────────
    canvasToBlob(canvas, type = 'image/png') {
        return new Promise((res, rej) =>
            canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), type)
        );
    },

    // ─── Blob → DataURL ───────────────────────────────────────────────────────
    blobToDataUrl(blob) {
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = rej;
            r.readAsDataURL(blob);
        });
    },

    // ─── STEP 1: Classic Texture Tiling ──────────────────────────────────────
    /**
     * Tiles the texture image over the masked region of the source image.
     * Returns a canvas that looks like the source image but with the texture
     * applied (flat tiling) only inside the masked area.
     *
     * The AI will then add depth, perspective, and lighting in Step 2.
     */
    async classicTextureComposite(srcImg, texImg, maskCanvas, outW, outH) {
        const c   = document.createElement('canvas');
        c.width   = outW; c.height = outH;
        const ctx = c.getContext('2d');

        // Draw source image at output resolution
        ctx.drawImage(srcImg, 0, 0, outW, outH);

        // Get source pixels
        const srcData = ctx.getImageData(0, 0, outW, outH);
        const srcPx   = srcData.data;

        // Get mask pixels (scaled to outW × outH)
        const maskC   = document.createElement('canvas');
        maskC.width   = outW; maskC.height = outH;
        const maskCtx = maskC.getContext('2d');
        maskCtx.fillStyle = '#000';
        maskCtx.fillRect(0, 0, outW, outH);
        if (maskCanvas && maskCanvas.width > 0) {
            maskCtx.drawImage(maskCanvas, 0, 0, outW, outH);
        }
        const maskData = maskCtx.getImageData(0, 0, outW, outH).data;

        // Build tiled texture canvas (texture tiles across full output)
        const texC   = document.createElement('canvas');
        texC.width   = outW; texC.height = outH;
        const texCtx = texC.getContext('2d');
        const tw = texImg.naturalWidth  || texImg.width;
        const th = texImg.naturalHeight || texImg.height;

        // Tile the texture to fill the entire output area
        for (let ty = 0; ty < outH; ty += th) {
            for (let tx = 0; tx < outW; tx += tw) {
                texCtx.drawImage(texImg, tx, ty, tw, th);
            }
        }
        const texData = texCtx.getImageData(0, 0, outW, outH).data;

        // Blend: inside mask → use texture (with shadow preservation), outside → keep source
        const out = srcData;
        for (let i = 0; i < maskData.length; i += 4) {
            const alpha = maskData[i + 3];
            if (alpha > 10) {
                const blend = alpha / 255;

                // Calculate source luminance for shadow/highlight preservation
                const srcR = srcPx[i], srcG = srcPx[i+1], srcB = srcPx[i+2];
                const lum  = (0.299 * srcR + 0.587 * srcG + 0.114 * srcB) / 128.0; // normalized around 1.0

                // Apply texture modulated by original luminance (keeps shadows realistic)
                const nr = Math.min(255, texData[i]   * lum);
                const ng = Math.min(255, texData[i+1] * lum);
                const nb = Math.min(255, texData[i+2] * lum);

                out.data[i]   = nr * blend + srcR * (1 - blend);
                out.data[i+1] = ng * blend + srcG * (1 - blend);
                out.data[i+2] = nb * blend + srcB * (1 - blend);
            }
        }
        ctx.putImageData(out, 0, 0);
        return c;
    },

    // ─── Build binary mask (white=repaint, black=keep) ───────────────────────
    buildBinaryMask(maskCanvas, w, h) {
        const c   = document.createElement('canvas');
        c.width   = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        if (maskCanvas && maskCanvas.width > 0) {
            ctx.drawImage(maskCanvas, 0, 0, w, h);
        }
        const d = ctx.getImageData(0, 0, w, h);
        for (let i = 0; i < d.data.length; i += 4) {
            const val = d.data[i+3] > 10 ? 255 : 0;
            d.data[i] = d.data[i+1] = d.data[i+2] = val;
            d.data[i+3] = 255;
        }
        ctx.putImageData(d, 0, 0);
        return c;
    },

    // ─── STEP 2: Stability AI – enhance photorealism of pre-textured image ───
    /**
     * Sends the classically-textured image to Stability AI inpainting
     * with LOW strength (0.3) - the AI preserves the texture but adds
     * photorealistic lighting, shadows, and perspective correction.
     */
    async stabilityEnhance(preTexturedBlob, maskBlob) {
        const token = this.getStabilityToken();

        const prompt = [
            'photorealistic architectural render',
            'natural daylight, soft ambient occlusion',
            'preserve the wall texture pattern exactly',
            'add realistic shadows and lighting to the wall surface',
            'professional architectural photography',
            '8k, high resolution',
        ].join(', ');

        const negative = [
            'blurry', 'distorted', 'changed material', 'different texture',
            'remove texture', 'smooth wall', 'plain wall',
            'low quality', 'cartoon', 'unrealistic',
        ].join(', ');

        const formData = new FormData();
        formData.append('image',          preTexturedBlob, 'image.png');
        formData.append('mask',           maskBlob,        'mask.png');
        formData.append('prompt',         prompt);
        formData.append('negative_prompt', negative);
        formData.append('output_format',  'jpeg');
        formData.append('strength',       '0.30');   // LOW: preserve texture, add realism
        formData.append('grow_mask',      '3');       // slight edge dilation

        const resp = await fetch(
            'https://api.stability.ai/v2beta/stable-image/edit/inpaint',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept':        'image/*',
                },
                body: formData,
            }
        );

        if (!resp.ok) {
            const txt = await resp.text();
            if (resp.status === 401) throw new Error('Invalid Stability AI key. Check AI Settings.');
            if (resp.status === 402) throw new Error('Stability AI: No credits left. Top up at platform.stability.ai.');
            throw new Error(`Stability AI error ${resp.status}: ${txt.slice(0, 300)}`);
        }
        return await resp.blob();
    },

    // ─── STEP 2 fallback: no AI – just return the classic composite ──────────
    // (Used when the user has no AI token, or as fallback on error)

    // ─── Composite result onto full-resolution original ───────────────────────
    async compositeOnOriginal(originalUrl, maskCanvas, resultBlob) {
        const resultDataUrl = await this.blobToDataUrl(resultBlob);

        return new Promise((resolve, reject) => {
            const origImg   = new Image();
            const resultImg = new Image();
            origImg.crossOrigin   = 'anonymous';
            resultImg.crossOrigin = 'anonymous';
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
                    ctx.drawImage(origImg, 0, 0, W, H);
                    const origData = ctx.getImageData(0, 0, W, H);

                    const mc = document.createElement('canvas');
                    mc.width = W; mc.height = H;
                    if (maskCanvas && maskCanvas.width > 0) {
                        mc.getContext('2d').drawImage(maskCanvas, 0, 0, W, H);
                    }
                    const maskData = mc.getContext('2d').getImageData(0, 0, W, H).data;

                    const ac = document.createElement('canvas');
                    ac.width = W; ac.height = H;
                    ac.getContext('2d').drawImage(resultImg, 0, 0, W, H);
                    const aiData = ac.getContext('2d').getImageData(0, 0, W, H).data;

                    const out = origData;
                    for (let i = 0; i < maskData.length; i += 4) {
                        const a = maskData[i + 3];
                        if (a > 10) {
                            const blend = a / 255;
                            out.data[i]   = aiData[i]   * blend + out.data[i]   * (1 - blend);
                            out.data[i+1] = aiData[i+1] * blend + out.data[i+1] * (1 - blend);
                            out.data[i+2] = aiData[i+2] * blend + out.data[i+2] * (1 - blend);
                        }
                    }
                    ctx.putImageData(out, 0, 0);
                    resolve(c.toDataURL('image/jpeg', 0.95));
                } catch (e) { reject(e); }
            };

            origImg.onload    = onBoth; resultImg.onload  = onBoth;
            origImg.onerror   = reject; resultImg.onerror = reject;
            origImg.src   = originalUrl;
            resultImg.src = resultDataUrl;
        });
    },

    // ─── MAIN PIPELINE ────────────────────────────────────────────────────────
    async applyMaterial(srcImageNode, materialNode, onProgress) {

        // 1. Validate
        onProgress('Checking selection...');
        const srcUrl = srcImageNode.getValue();
        const texUrl = materialNode.getValue();
        if (!srcUrl) throw new Error('Source image is empty.');
        if (!texUrl) throw new Error('Material/Texture image is empty.');
        if (!srcImageNode.maskCanvas || !this.maskHasContent(srcImageNode.maskCanvas)) {
            throw new Error(
                'No selection found!\n\n' +
                'Use the Brush 🖌 or Lasso ⬡ tools to paint the area\n' +
                'you want to apply the material to, then press Play again.'
            );
        }

        // 2. Load both images
        onProgress('Loading images...');
        const [srcImg, texImg] = await Promise.all([
            this.loadImage(srcUrl),
            this.loadImage(texUrl),
        ]);

        // Work at a resolution that's a multiple of 64 (required by SD models)
        // Keep it max 1024px wide/tall
        const rawW = srcImg.naturalWidth  || srcImg.width;
        const rawH = srcImg.naturalHeight || srcImg.height;
        const scale = Math.min(1024 / rawW, 1024 / rawH, 1);
        const aiW = Math.round(rawW * scale / 64) * 64 || 512;
        const aiH = Math.round(rawH * scale / 64) * 64 || 512;

        // 3. Classic texture tiling (this uses the actual uploaded texture image!)
        onProgress('Applying texture pattern (classic tiling)...');
        const classicCanvas = await this.classicTextureComposite(
            srcImg, texImg, srcImageNode.maskCanvas, aiW, aiH
        );

        // 4. AI Enhancement (low-strength = preserve texture, add realism)
        if (this.hasStabilityToken()) {
            onProgress('🧠 AI enhancing lighting & shadows (preserving your texture)...');

            const preTexturedBlob = await this.canvasToBlob(classicCanvas);
            const maskCanvas64    = this.buildBinaryMask(srcImageNode.maskCanvas, aiW, aiH);
            const maskBlob        = await this.canvasToBlob(maskCanvas64);

            try {
                const aiResultBlob = await this.stabilityEnhance(preTexturedBlob, maskBlob);
                onProgress('Compositing final result...');
                return await this.compositeOnOriginal(srcUrl, srcImageNode.maskCanvas, aiResultBlob);
            } catch (err) {
                console.warn('AI enhancement failed, returning classic result:', err.message);
                onProgress('AI failed – returning classic texture result...');
                // Fallback: return the classic result without AI enhancement
            }
        }

        // 5. No AI or AI failed → return classic composite directly
        onProgress('Compositing classic result on full-resolution image...');
        const classicBlob = await this.canvasToBlob(classicCanvas, 'image/jpeg');
        return await this.compositeOnOriginal(srcUrl, srcImageNode.maskCanvas, classicBlob);
    }
};

export default AI_ENGINE;
