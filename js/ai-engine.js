/**
 * AI Engine - Classic Perspective Tiling + AI Enhancement Pipeline
 * 
 * Strategy:
 *  1. Apply the uploaded texture classically with full perspective homography mapping
 *     (using the exact same perspective planes / pins defined by the user on the node).
 *  2. Send the pre-textured perspective-correct image to Stability AI (strength 0.3)
 *     so the AI adds photorealistic lighting/shadows but keeps the perspective layout.
 *  3. Fall back to classic composite if the AI token is missing or fails.
 */

const AI_ENGINE = {

    // ─── Token Management ────────────────────────────────────────────────────
    getToken()          { return localStorage.getItem('hf_api_token') || ''; },
    setToken(t)         { localStorage.setItem('hf_api_token', t.trim()); },
    hasToken()          { return !!this.getToken(); },
    getStabilityToken() { return localStorage.getItem('stability_api_token') || ''; },
    setStabilityToken(t){ localStorage.setItem('stability_api_token', t.trim()); },
    hasStabilityToken() { return !!this.getStabilityToken(); },
    getFalToken()       { return localStorage.getItem('fal_api_token') || ''; },
    setFalToken(t)      { localStorage.setItem('fal_api_token', t.trim()); },
    hasFalToken()       { return !!this.getFalToken(); },

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

    // ─── Solver: Homography 8-parameter matrix ────────────────────────────────
    solveHomography(src, dst) {
        const A = [];
        const B = [];
        for (let i = 0; i < 4; i++) {
            const x = src[i].x;
            const y = src[i].y;
            const u = dst[i].x;
            const v = dst[i].y;
            A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
            B.push(u);
            A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
            B.push(v);
        }
        const n = 8;
        for (let i = 0; i < n; i++) {
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
            }
            const tempA = A[i]; A[i] = A[maxRow]; A[maxRow] = tempA;
            const tempB = B[i]; B[i] = B[maxRow]; B[maxRow] = tempB;
            for (let k = i + 1; k < n; k++) {
                const factor = A[k][i] / A[i][i];
                B[k] -= factor * B[i];
                for (let j = i; j < n; j++) A[k][j] -= factor * A[i][j];
            }
        }
        const C = new Array(8);
        for (let i = n - 1; i >= 0; i--) {
            let sum = 0;
            for (let j = i + 1; j < n; j++) sum += A[i][j] * C[j];
            C[i] = (B[i] - sum) / A[i][i];
        }
        return C;
    },

    isPointInQuad(pt, quad) {
        const px = pt.x, py = pt.y;
        let inside = false;
        for (let i = 0, j = 3; i < 4; j = i++) {
            const xi = quad[i].x, yi = quad[i].y;
            const xj = quad[j].x, yj = quad[j].y;
            const intersect = ((yi > py) !== (yj > py))
                && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    },

    // ─── STEP 1: Perspective-Correct Tiling ──────────────────────────────────
    /**
     * Projects the texture mapping coordinates onto the source image's masked area
     * using the homography matrices solved from the perspective pins/planes.
     */
    async classicTextureComposite(srcImg, texImg, srcImageNode, materialNode, outW, outH) {
        const c   = document.createElement('canvas');
        c.width   = outW; c.height = outH;
        const ctx = c.getContext('2d');

        // Draw source image at target output resolution
        ctx.drawImage(srcImg, 0, 0, outW, outH);
        const srcData = ctx.getImageData(0, 0, outW, outH);
        const srcPx   = srcData.data;

        // Get selection mask scaled to target
        const maskCanvas = srcImageNode.maskCanvas;
        const maskC   = document.createElement('canvas');
        maskC.width   = outW; maskC.height = outH;
        const maskCtx = maskC.getContext('2d');
        maskCtx.fillStyle = '#000';
        maskCtx.fillRect(0, 0, outW, outH);
        if (maskCanvas && maskCanvas.width > 0) {
            maskCtx.drawImage(maskCanvas, 0, 0, outW, outH);
        }
        const maskData = maskCtx.getImageData(0, 0, outW, outH).data;

        const texW = texImg.naturalWidth  || texImg.width;
        const texH = texImg.naturalHeight || texImg.height;

        // Create texture canvas to read pixel data
        const texCanvas = document.createElement('canvas');
        texCanvas.width = texW;
        texCanvas.height = texH;
        const texCtx = texCanvas.getContext('2d');
        texCtx.drawImage(texImg, 0, 0);
        const texPixels = texCtx.getImageData(0, 0, texW, texH).data;

        // Scale factors for perspective plane translation
        const scaleX = outW / srcImageNode.width;
        const scaleY = outH / srcImageNode.height;

        const texCorners = [
            { x: 0, y: 0 },
            { x: texW, y: 0 },
            { x: texW, y: texH },
            { x: 0, y: texH }
        ];

        // Solve homography matrix for each perspective plane
        let planes = [];
        if (srcImageNode.perspectivePlanes && srcImageNode.perspectivePlanes.length > 0) {
            planes = srcImageNode.perspectivePlanes.map(plane => {
                const scaledPoints = plane.points.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));
                const C = this.solveHomography(scaledPoints, texCorners);
                return { points: scaledPoints, C };
            });
        } else if (srcImageNode.perspectiveQuad) {
            const scaledPoints = srcImageNode.perspectiveQuad.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));
            planes = [{
                points: scaledPoints,
                C: this.solveHomography(scaledPoints, texCorners)
            }];
        }

        // Auto-projection fallback bounds
        let xMin = outW, xMax = 0, yMin = outH, yMax = 0;
        for (let i = 0; i < maskData.length; i += 4) {
            if (maskData[i + 3] > 5) {
                const px = (i / 4) % outW;
                const py = Math.floor((i / 4) / outW);
                if (px < xMin) xMin = px;
                if (px > xMax) xMax = px;
                if (py < yMin) yMin = py;
                if (py > yMax) yMax = py;
            }
        }
        if (xMax <= xMin) { xMin = 0; xMax = outW; yMin = 0; yMax = outH; }
        const mWidth = xMax - xMin;

        // Sampler parameters
        const tScale = materialNode.textureScale || 1.0;
        const pMode  = materialNode.projectionMode || 'auto';

        // Calculate average luminance of original masked region for shadow preservation
        let sumLum = 0, count = 0;
        for (let i = 0; i < srcPx.length; i += 4) {
            if (maskData[i + 3] > 1) {
                sumLum += (0.299 * srcPx[i] + 0.587 * srcPx[i+1] + 0.114 * srcPx[i+2]);
                count++;
            }
        }
        const avgLum = count > 0 ? (sumLum / count) : 128;

        // Perform spatial perspective warp pixel-by-pixel
        const out = srcData;
        for (let i = 0; i < srcPx.length; i += 4) {
            const origAlpha = maskData[i + 3];
            if (origAlpha > 1) {
                const r = srcPx[i];
                const g = srcPx[i + 1];
                const b = srcPx[i + 2];
                const x = (i / 4) % outW;
                const y = Math.floor((i / 4) / outW);

                let sTu = 0, sTv = 0;

                // 1. Perspective projection mapping (using the pins)
                if (planes.length > 0) {
                    let chosenPlane = null;
                    for (const plane of planes) {
                        if (this.isPointInQuad({ x, y }, plane.points)) {
                            chosenPlane = plane;
                            break;
                        }
                    }
                    if (!chosenPlane) {
                        let minD = Infinity;
                        for (const plane of planes) {
                            const cx = (plane.points[0].x + plane.points[1].x + plane.points[2].x + plane.points[3].x) / 4;
                            const cy = (plane.points[0].y + plane.points[1].y + plane.points[2].y + plane.points[3].y) / 4;
                            const d = Math.hypot(x - cx, y - cy);
                            if (d < minD) { minD = d; chosenPlane = plane; }
                        }
                    }
                    const C = chosenPlane.C;
                    const denom = C[6] * x + C[7] * y + 1;
                    const tu = Math.abs(denom) > 1e-5 ? ((C[0] * x + C[1] * y + C[2]) / denom) : x;
                    const tv = Math.abs(denom) > 1e-5 ? ((C[3] * x + C[4] * y + C[5]) / denom) : y;
                    sTu = tu * tScale;
                    sTv = tv * tScale;
                } else {
                    // 2. Fallback auto projection slants
                    const t = mWidth > 0 ? (x - xMin) / mWidth : 0.5;
                    let tu = t;
                    let tv = mWidth > 0 ? ((y - yMin) / mWidth) * (texW / texH) : 0;

                    if (pMode === 'curved') {
                        const theta = Math.max(-0.98, Math.min(0.98, t * 2 - 1));
                        tu = (Math.asin(theta) / (Math.PI / 2) + 1) / 2;
                    } else if (pMode === 'slanted-left') {
                        tu = Math.pow(t, 1.45);
                        tv += ((x - (xMin + xMax)/2) / mWidth) * -0.1 * (texW / texH);
                    } else if (pMode === 'slanted-right') {
                        tu = 1 - Math.pow(1 - t, 1.45);
                        tv += ((x - (xMin + xMax)/2) / mWidth) * 0.1 * (texW / texH);
                    }
                    sTu = tu * texW * tScale;
                    sTv = tv * texH * tScale;
                }

                // Sample texture pixel
                let tx = Math.floor(sTu) % texW;
                let ty = Math.floor(sTv) % texH;
                if (tx < 0) tx += texW;
                if (ty < 0) ty += texH;

                const texIdx = (ty * texW + tx) * 4;
                const tr = texPixels[texIdx];
                const tg = texPixels[texIdx + 1];
                const tb = texPixels[texIdx + 2];

                // Preserved light modulation
                const origY  = 0.299 * r + 0.587 * g + 0.114 * b;
                const factor = origY / (avgLum || 1.0);

                let nr = tr * factor;
                let ng = tg * factor;
                let nb = tb * factor;

                // Highlight preservation
                if (origY > 200) {
                    const hw = (origY - 200) / 55;
                    nr = nr * (1 - hw) + r * hw;
                    ng = ng * (1 - hw) + g * hw;
                    nb = nb * (1 - hw) + b * hw;
                }

                const blend = origAlpha / 255;
                out.data[i]   = Math.min(255, Math.max(0, nr * blend + r * (1 - blend)));
                out.data[i+1] = Math.min(255, Math.max(0, ng * blend + g * (1 - blend)));
                out.data[i+2] = Math.min(255, Math.max(0, nb * blend + b * (1 - blend)));
            }
        }
        ctx.putImageData(out, 0, 0);
        return c;
    },

    // ─── Build binary mask ───────────────────────────────────────────────────
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

    // ─── STEP 2: Stability AI – enhance lighting and depth ───────────────────
    async stabilityEnhance(preTexturedBlob, maskBlob) {
        const token = this.getStabilityToken();

        const prompt = [
            'photorealistic architectural render',
            'realistic shadows and lighting on the textured wall surface',
            'perfectly blended textures with ambient occlusion',
            'architectural visual style',
            '8k, high quality',
        ].join(', ');

        const negative = [
            'blurry', 'flat texture', 'deformed geometry', 'text', 'watermark', 'bad shading'
        ].join(', ');

        return await this.callStabilityAI(preTexturedBlob, maskBlob, prompt);
    },

    // ─── Strategy A: Fal.ai Inpainting (SDXL Fast - CORS supported via direct keys) ───
    async callFalInpainting(imageDataUrl, maskDataUrl, prompt) {
        const token = this.getFalToken();
        if (!token) throw new Error('No Fal.ai token set');

        // Submit to queue
        const submitResp = await fetch('https://queue.fal.run/fal-ai/fast-sdxl/inpainting', {
            method: 'POST',
            headers: {
                'Authorization': `Key ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image_url: imageDataUrl,
                mask_url: maskDataUrl,
                prompt: prompt,
                negative_prompt: 'blurry, low quality, deformed, flat texture, watermark, text',
                strength: 0.30,           // Keeps pre-warped texture pattern intact
                num_inference_steps: 28,
                guidance_scale: 7.5
            })
        });

        if (!submitResp.ok) {
            const txt = await submitResp.text();
            throw new Error(`Fal.ai submission failed (${submitResp.status}): ${txt.slice(0, 200)}`);
        }

        const submitResult = await submitResp.json();
        const requestId = submitResult.request_id;
        if (!requestId) throw new Error('Fal.ai queue did not return a request ID.');

        // Poll status url
        const statusUrl = `https://queue.fal.run/fal-ai/fast-sdxl/inpainting/requests/${requestId}`;
        
        for (let i = 0; i < 45; i++) { // Max 45 seconds polling
            await new Promise(res => setTimeout(res, 1000));
            const pollResp = await fetch(statusUrl, {
                headers: { 'Authorization': `Key ${token}` }
            });
            if (!pollResp.ok) continue;

            const pollResult = await pollResp.json();
            if (pollResult.status === 'COMPLETED') {
                const imgUrl = pollResult.images?.[0]?.url;
                if (!imgUrl) throw new Error('Fal.ai returned completion but no image.');
                
                const imgResp = await fetch(imgUrl);
                return await imgResp.blob();
            }
            if (pollResult.status === 'FAILED') {
                throw new Error('Fal.ai queue task failed: ' + JSON.stringify(pollResult.error || 'Unknown error'));
            }
        }
        throw new Error('Fal.ai request timed out.');
    },

    // ─── Strategy B: Stability AI ────────────────────────────────────────────
    async callStabilityAI(imgBlob, maskBlob, prompt) {
        const token = this.getStabilityToken();

        const formData = new FormData();
        formData.append('image',          imgBlob,  'image.png');
        formData.append('mask',           maskBlob, 'mask.png');
        formData.append('prompt',         prompt);
        formData.append('negative_prompt','blurry, distorted, cartoonish, low resolution, watermark, text, deformed');
        formData.append('output_format',  'jpeg');
        formData.append('strength',       '0.28');  // 0.28 = blend, add depth and shadows
        formData.append('grow_mask',      '3');

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
            if (resp.status === 401) throw new Error('Invalid Stability AI key.');
            if (resp.status === 402) throw new Error('Stability AI: No credits left.');
            throw new Error(`Stability AI error: ${txt.slice(0, 200)}`);
        }
        return await resp.blob();
    },

    // ─── Strategy C: HF Router (fallback) ────────────────────────────────────
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

        onProgress('Loading images...');
        const [srcImg, texImg] = await Promise.all([
            this.loadImage(srcUrl),
            this.loadImage(texUrl),
        ]);

        const rawW = srcImg.naturalWidth  || srcImg.width;
        const rawH = srcImg.naturalHeight || srcImg.height;
        const scale = Math.min(1024 / rawW, 1024 / rawH, 1);
        const aiW = Math.round(rawW * scale / 64) * 64 || 512;
        const aiH = Math.round(rawH * scale / 64) * 64 || 512;

        // 1. Perspective Tiling (Classic Warping using the pins!)
        onProgress('Warping texture to perspective planes...');
        const classicCanvas = await this.classicTextureComposite(
            srcImg, texImg, srcImageNode, materialNode, aiW, aiH
        );

        // 2. AI Enhancement
        // ── Option A: Fal.ai (SDXL Fast / FLUX.1 Fill) ──
        if (this.hasFalToken()) {
            onProgress('🧠 AI (Fal.ai): rendering realistic lighting, shadows, and perspective...');
            const preTexturedDataUrl = classicCanvas.toDataURL('image/jpeg', 0.90);
            const maskCanvas64       = this.buildBinaryMask(srcImageNode.maskCanvas, aiW, aiH);
            const maskDataUrl        = maskCanvas64.toDataURL('image/png');
            const prompt             = await this.generatePrompt(materialNode);

            try {
                const aiResultBlob = await this.callFalInpainting(preTexturedDataUrl, maskDataUrl, prompt);
                onProgress('Compositing final result...');
                return await this.compositeOnOriginal(srcUrl, srcImageNode.maskCanvas, aiResultBlob);
            } catch (err) {
                console.warn('Fal.ai failed, falling back:', err.message);
                onProgress('Fal.ai failed – falling back...');
            }
        }

        // ── Option B: Stability AI ──
        if (this.hasStabilityToken()) {
            onProgress('🧠 AI (Stability): rendering realistic lighting and shading (preserving perspective)...');

            const preTexturedBlob = await this.canvasToBlob(classicCanvas);
            const maskCanvas64    = this.buildBinaryMask(srcImageNode.maskCanvas, aiW, aiH);
            const maskBlob        = await this.canvasToBlob(maskCanvas64);
            const prompt             = await this.generatePrompt(materialNode);

            try {
                const aiResultBlob = await this.stabilityEnhance(preTexturedBlob, maskBlob);
                onProgress('Compositing final result...');
                return await this.compositeOnOriginal(srcUrl, srcImageNode.maskCanvas, aiResultBlob);
            } catch (err) {
                console.warn('AI enhancement failed:', err.message);
                onProgress('AI failed – returning warped texture result...');
            }
        }

        // Fallback directly to classic perspective composite if AI is disabled or fails
        onProgress('Compositing classic warped result...');
        const classicBlob = await this.canvasToBlob(classicCanvas, 'image/jpeg');
        return await this.compositeOnOriginal(srcUrl, srcImageNode.maskCanvas, classicBlob);
    }
}

export default AI_ENGINE;
