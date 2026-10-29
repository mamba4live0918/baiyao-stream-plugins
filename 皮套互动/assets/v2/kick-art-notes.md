# 踢击运动鞋素材生成记录

- 最终文件：`kick-sneaker.png`
- 用途：皮套互动 V2 踢击道具；由主构建流程作为 data URL 内联到单 HTML。
- 生成方式：内置 `image_gen`，未使用 CLI、外部 API 或密钥。
- 生成日期：2026-09-22。
- 尺寸：1254 × 1254。
- 格式：PNG / RGBA。
- 文件大小：1,140,486 bytes。
- 造型：单只高帮运动鞋与短袜口，鞋跟朝左、鞋头朝右并略向镜头；奶油象牙白皮革和网面、紫色鞋带与鞋领、粉色镶边、厚底。
- 已使用 `view_image` 检查实际最终文件，无文字、品牌、人物、地板或烘焙冲击线。

## 透明通道只读检查

Pillow 只读取数据，没有修改像素或重编码文件：

- alpha 范围 0–255；四角均为 0。
- 完全透明像素：1,027,607 / 1,572,516（约 65.3%）。
- 部分透明像素：543,762；主体大多数为 alpha 253–254，边缘为抗锯齿。
- 原始非零 alpha 边界：[59, 21, 1234, 1254]；存在极低 alpha=1 的不可见散点，因此不以该边界代表可见鞋子。
- alpha ≥ 8 的主体边界：[155, 193, 1123, 1095]，主体宽约 77.2%，可见左右留白约 12.4% / 10.4%。
- 透明原图直接复制到工程，未用脚本抠图、加底或调整 alpha。

## 初次生成提示词

```text
Use case: stylized-concept
Asset type: transparent PNG game prop sprite for a playful exaggerated kick in a virtual-streamer overlay.
Primary request: Single isolated premium stylized 3D cartoon game prop sprite, one beautiful chunky high-top sneaker with a short sock/ankle only; no leg and no person.
Composition: Three-quarter side view, heel on LEFT, toe pointing RIGHT and slightly towards the viewer, sole slightly visible. Entire shoe inside the frame, generous 12% clean margins; shoe occupies about 75% of image width. Square, approximately 1024 × 1024.
Materials and palette: Pearl ivory leather and mesh panels, lavender-violet laces and padded collar, rose-pink piping/accent, deep-purple small outsole grooves, thick rounded creamy rubber sole. Meticulous stitching and material layering.
Style: Smooth soft cinematic shading, crisp dark-purple silhouette outline, cute proportions with professional detailed game-inventory illustration polish. Matches pearl-ivory soft-leather cartoon gloves with lilac padded cuffs.
Background: TRUE TRANSPARENT BACKGROUND AND ALPHA. Isolated cutout with clean anti-aliased edges.
Avoid: No brands, logos, text, watermark, face, motion lines or impact burst baked in. No ground plane, no floor shadow, no checkerboard baked into the image. No extra objects.
```

首稿源文件：
`C:/Users/Mamba4live/.codex/generated_images/01a0c85a-d51d-7253-82c6-d4619fc7866b/exec-30c38168-aa73-4ed4-8ad1-98bf2a395875.png`

首稿为真实透明图，但主体过满，因此仅做一次构图编辑。

## 最终构图编辑提示词

```text
Edit this transparent sneaker sprite. Change ONLY the framing: keep the exact same single sneaker design, three-quarter pose, heel LEFT and toe RIGHT, pearl-ivory leather and mesh, lavender-violet laces and collar, pink accents, sock, lighting, detailed textures, and clean dark-purple outline. Make the entire sneaker approximately 74–76% of the square canvas width, perfectly centered, with at least 12% genuinely transparent empty margin on LEFT and RIGHT and comfortable empty margin above and below. Do not zoom or crop tightly. Output a square PNG with TRUE TRANSPARENT ALPHA background. Do not add a ground plane, floor shadow, backdrop, checkerboard, effects, text, logos, or objects. Preserve the shoe's polished game-prop illustration quality. The requested change is more transparent canvas surrounding the unchanged sneaker, not a new sneaker.
```

最终源文件：
`C:/Users/Mamba4live/.codex/generated_images/01a0c85a-d51d-7253-82c6-d4619fc7866b/exec-3229cca8-c750-4e25-9015-d5933e7fe371.png`

原始生成文件保留。当前工程文件为最终源文件的逐字节复制。

