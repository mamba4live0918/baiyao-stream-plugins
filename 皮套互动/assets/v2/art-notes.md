# 皮套互动 V2 手套素材生成记录

日期：2026-09-22。生成方式：内置 image_gen；未使用 CLI、API 密钥或外部抠图。
图片是产品内置道具；不包含速度线、文字或冲击效果，动画由产品代码绘制。
本文件只记录本子任务的两张手套；鞋子由其他子任务提供。

| 文件 | 尺寸 | 大小（bytes） | 完全透明像素 |
| --- | --- | --- | --- |
| slap-glove.png | 1254 × 1254 | 1,368,775 | 837,784 |
| pinch-glove.png | 1254 × 1254 | 1,163,828 | 973,667 |

两张均为 PNG Format32bppArgb。使用只读像素检查确认存在真实 alpha 透明背景，并经 view_image 检查整体轮廓、手势、材料和透明区域。未裁切、抠图、缩放或处理原图。生成工具实际尺寸与提示的约 1024 方图有差异。提示要求约 12% 留白，实际边缘留白较小，但道具完整且未被裁切。产品可按需要使用 CSS 缩放与定位。

## slap-glove.png

预览检查：一只五指张开手套，掌心朝观众、指尖右上，手腕左下。珍珠白皮革、细缝线、紫罗兰软袖口和粉色滚边；不含击打特效。

来源：C:/Users/Mamba4live/.codex/generated_images/01a0c84d-9637-7813-9468-dbd49ae7c2d1/exec-248df374-b47c-4784-91ef-9b67e814f867.png

完整生成 prompt：

```text
Use case: illustration-story. Asset type: isolated premium stylized 3D cartoon game prop sprite for an anime-stream interactive overlay. Refined appealing high-end 3D cartoon render with an exaggerated playful readable silhouette, soft cute chunky proportions, pearl ivory soft leather glove, subtle warm cream highlights, cool lavender shadows, lilac-violet padded cuff with thin rose-pink piping, crisp dark-purple contour, detailed stitched seams, soft realistic material shading. One single isolated prop, square approximately 1024x1024, 12% clear margin on every side, fully visible object. GENUINELY TRANSPARENT PNG BACKGROUND with alpha channel: every pixel beyond the hand silhouette is transparent. No baked checkerboard, no solid background, no ground plane, no cast shadow, no ambient backdrop, no logo, no text, no watermark, no motion effects or impact graphics. This is a reusable animation prop, not an illustration scene. Primary request: one open five-finger gloved hand ready for an exaggerated playful slap. Palm faces viewer in slight 3/4 perspective, fingers pointing up-right, wrist and cuff emerge from bottom-left, palm centered. Exactly five anatomically coherent fingers including the thumb, convincingly separated with soft cushion-like fingertips and a large friendly palm. Clearly an open slap hand, not a fist, not a wave icon. No extra hands or arms.
```

## pinch-glove.png

预览检查：一只向右张开的 C 形夹捏手套，上食指和下拇指有明确空隙，另三指收在掌内；没有 OK 闭环、脸、人物或被夹物。与拍打手套采用相同材质和配色。

来源：C:/Users/Mamba4live/.codex/generated_images/01a0c84d-9637-7813-9468-dbd49ae7c2d1/exec-e4b43bc3-db6e-4f99-8c58-45c8bc38537a.png

完整生成 prompt：

```text
Use case: illustration-story. Asset type: isolated premium stylized 3D cartoon game prop sprite for an anime-stream interactive overlay. Refined appealing high-end 3D cartoon render with an exaggerated playful readable silhouette, soft cute chunky proportions, pearl ivory soft leather glove, subtle warm cream highlights, cool lavender shadows, lilac-violet padded cuff with thin rose-pink piping, crisp dark-purple contour, detailed stitched seams, soft realistic material shading. One single isolated prop, square approximately 1024x1024, 12% clear margin on every side, fully visible object. GENUINELY TRANSPARENT PNG BACKGROUND with alpha channel: every pixel beyond the hand silhouette is transparent. No baked checkerboard, no solid background, no ground plane, no cast shadow, no ambient backdrop, no logo, no text, no watermark, no motion effects or impact graphics. This is a reusable animation prop, not an illustration scene. Primary request: one gloved hand making a VERY CLEAR PINCHING C-SHAPE, shown from the side / three-quarter view. Wrist and lavender cuff enter from LEFT. Index finger extends horizontally to the RIGHT and curves gently DOWN. Thumb extends horizontally to the RIGHT and curves gently UP. Index fingertip and thumb tip face each other, remaining visibly separated by a generous clear empty transparent GAP, ready to pinch a cheek later. The upper index finger and lower thumb outline a broad open letter C, open mouth faces RIGHT. Finger contact tips are close to image right-of-center, with empty background beyond them. Three remaining fingers curl into the left-side palm. Exactly five anatomically coherent fingers. NOT an OK ring: tips must never touch. No face, no character, no object being held, no cheek, no second hand. Exaggerated playful rubbery squeeze gesture, polished cute game prop.
```

