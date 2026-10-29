# 2D 夹捏手与前臂素材记录

- 最终文件：`pinch-hand.png`。
- 生成方式：内置 `image_gen`；参考两张本地图片；首次生成后仅进行一次夹捏姿势修正。
- 本文件不修改旧 `assets/v2`、代码或 OBS 配置。
- PNG 尺寸：1246 × 1263。
- 色彩模式：RGBA。
- 文件大小：493,897 bytes。
- 构图：单只成人裸手、修长连续前臂，左下向右上；食指在上、拇指在下，C 形开口朝右，其余手指自然卷曲在后。
- 画风：细暖棕二维轮廓、奶油浅肤色、蜜桃色分层赛璐璐阴影，短甲与简洁指节；没有手套、皮革或三维塑料材质。
- 已以 `view_image` 查看参考图、首稿与最终 PNG。完整前臂和指尖均在画布内。

## 动画定位

建议以夹捏指尖之间的透明开口为接触锚点：

```js
{
  contact: { x: 0.89085, y: 0.20744 },
  contactPixels: { x: 1110, y: 262 },
  forearmDirection: "lower-left to upper-right",
  approximateScreenAngleDegrees: -45
}
```

这里 x、y 从图片左上角开始，分别除以实际宽 1246、高 1263。
只读扫描 x=1110 列：上方食指不透明区域止于 y=234，下方拇指不透明区域始于 y=290，因此取两者中点 y=262；该开口为透明像素。该点是视觉接触建议，不是自动追踪模型坐标。
前臂中心线约从归一化 (0.18, 0.84) 延伸到 (0.56, 0.46)，大致朝屏幕右上 45°。完整素材可在动画中镜像；镜像后的接触 x 应使用 `1 - 0.89085`。

## 透明通道只读检查

未进行脚本抠图、像素处理或图片重编码。

- alpha 范围：0–255。
- 完全透明像素：1,202,769 / 1,573,698，约 76.4%。
- alpha ≥ 128 主体边界：[36, 89, 1175, 1241]。
- 原始非零 alpha 边界：[0, 0, 1179, 1245]；存在极低 alpha 散点，左上角为 alpha=1，其余三角为0。可见背景仍透明，不以散点作为主体定位边界。
- 原始生成文件直接复制到交付素材路径，保留 alpha。

## 参考图片

1. 风格与成人手臂比例参考：`C:/Users/Mamba4live/Downloads/FEH5T6CaAAAO2nH.png`
2. 风格与夹捏手参考：`C:/Users/Mamba4live/Documents/xwechat_files/wxid_1297022969712_6f2a/temp/RWTemp/2026-07/006058e47474fa675db7f3480f9e0a1e/97a428b2130acdb2c3f51d96391e9a52.jpg`

## 首次生成提示词

```text
Use case: stylized-concept
Asset type: ONE original 2D anime / Live2D overlay prop sprite, an adult bare pinching hand with a long connected forearm.
Input images: Image 1 and Image 2 are STYLE AND ANATOMY REFERENCES ONLY. Follow their fine warm-brown hand-drawn outlines, pale cream skin, peach-pink two-to-three-level soft cel shading, elegant narrow adult proportions and simple clean knuckle details. Do not copy their white background. Do not depict a full person.
Subject and pose: Exactly one anatomically coherent adult bare hand with five fingers and its substantial continuous forearm, extending diagonally from the LOWER LEFT toward the UPPER RIGHT. Show the back of the hand or a graceful three-quarter side view. The INDEX finger forms the upper arm of a clear C-shaped cheek-pinching gesture, and the THUMB forms its lower arm. Both fingertips point toward the RIGHT side of the picture, facing each other with a small VISIBLE OPEN GAP where an imaginary cheek would be pinched; the fingers do not touch and do not form an OK ring. The other three fingers curl naturally back into the palm, without extra fingers. The pinch contact opening is near the upper-right / middle-right. The forearm must be long, elegant, connected and clearly visible, not just a detached wrist or tiny floating hand. Short natural nails, understated knuckle lines, smooth natural wrist transition.
Style and finish: STRICTLY TWO-DIMENSIONAL hand-drawn anime illustration matching the supplied references, refined clean line art, thin warm brown contours, creamy light skin and restrained peach cel-shaded shadow shapes, mostly flat fills, no volumetric 3D render. Professional Live2D accessory artwork.
Composition: Use a square or portrait canvas as best suits the long diagonal forearm. Entire fingertips and long forearm visible with sensible clean transparent margins; a softly finished lower forearm endpoint, not a bleeding cross-section. Favor accurate gesture and graceful proportion over decorative detail.
Background: TRUE TRANSPARENT PNG ALPHA, clean antialiased cutout. No white background, no checkerboard baked in, no scene or ground.
Avoid: no glove, sleeve, jewelry, bracelets, object being held, character, face, additional arm, text, logo, watermark, plastic or leather texture, photorealism, 3D shading, baked-in motion or impact effects.
```

首稿源文件：
`C:/Users/Mamba4live/.codex/generated_images/01a0c85a-d51d-7253-82c6-d4619fc7866b/exec-a0b23e2b-631d-41c5-9718-7f5d99c147a7.png`

首稿指尖开口偏大；唯一一次修正缩小间距，保留原画风和长前臂。

## 最终修正提示词

```text
Precise pose correction to Image 1 ONLY. Image 1 is the edit target. Images 2 and 3 remain style references. Preserve Image 1's exact 2D anime linework, pale cream skin, peach two-to-three-step cel shadows, long continuous adult bare forearm running from lower left to upper right, framing, proportions and TRUE TRANSPARENT PNG ALPHA background. Change only the index-finger and thumb gesture: curl the index fingertip downward toward the thumb and raise the thumb slightly so their facing pads are separated by a SMALL, CLEAR OPEN GAP about one fingertip-thickness (roughly 35–50 pixels at this image size). The C still opens to the RIGHT and is unmistakably a delicate cheek-pinching gesture, NOT a wide grabbing/claw gesture, NOT a closed OK ring. Keep both complete fingertips inside the frame. The upper digit must be the index finger and the lower digit the thumb, with the other three fingers naturally curled behind. No held object or cheek is drawn. Retain the same long graceful forearm. No 3D render, no photoreal texture, no gloves, no jewelry, no white/checkerboard background, no new objects or visual effects. Clean anti-aliased warm brown contours; no colored halo or stray outline flecks.
```

最终源文件：
`C:/Users/Mamba4live/.codex/generated_images/01a0c85a-d51d-7253-82c6-d4619fc7866b/exec-4a91db19-bfdf-4436-8cde-9ff9d7f42109.png`

素材将由主构建流程内联至最终单 HTML；源 PNG 仅作为开发资产。

