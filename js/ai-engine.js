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

        const formData = new FormData();
        formData.append('image',          preTexturedBlob, 'image.png');
        formData.append('mask',           maskBlob,        'mask.png');
        formData.append('prompt',         prompt);
        formData.append('negative_prompt', negative);
        formData.append('output_format',  'jpeg');
        formData.append('strength',       '0.28');   // Preserves texture orientation, adds shading/depth
        formData.append('grow_mask',      '3');

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
            if (resp.status === 401) throw new Error('Invalid Stability AI key.');
            if (resp.status === 402) throw new Error('Stability AI: No credits left.');
            throw new Error(`Stability AI error: ${txt.slice(0, 200)}`);
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
        if (this.hasStabilityToken()) {
            onProgress('🧠 AI rendering realistic lighting and shading (preserving perspective)...');

            const preTexturedBlob = await this.canvasToBlob(classicCanvas);
            const maskCanvas64    = this.buildBinaryMask(srcImageNode.maskCanvas, aiW, aiH);
            const maskBlob        = await this.canvasToBlob(maskCanvas64);

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
};

export default AI_ENGINE;
