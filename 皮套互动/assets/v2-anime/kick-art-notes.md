# 踢动作美术说明（V2 anime）

使用内置 image_gen 工具分别生成两张 PNG，参考图只提供肤色与线稿风格；未编辑参考手部、未修改 VTS/OBS 或任何动作代码。每张首轮生成后经 view_image 检查，未使用修正次数。

## 已交付素材

| 文件 | 实际尺寸 | PNG 格式 | 全透明像素比例 | 建议接触点（原图比例） |
| --- | --- | --- | --- | --- |
| kick-shoe.png | 1254 × 1254 | RGBA，8 bit/channel | 78.92% | x=0.9350, y=0.1344 |
| kick-barefoot.png | 1254 × 1254 | RGBA，8 bit/channel | 77.78% | x=0.9003, y=0.0933 |

两图均为真正 alpha 透明背景，无白底、棋盘格、文字、标志或额外动效。完整小腿与脚踝连续，朝右上伸出。白鞋薄底、淡灰紫后跟／边缘点缀；赤脚为脚背与侧面三分之四视角。保留原始生成 alpha，未抠图、调色、裁切或缩放。

接触点取可见主体（alpha ≥128）沿右上方 x-y 最大投影的前缘均值，再除以原图宽高；用于鞋头／前趾向右上接触。像素点分别为鞋 (1172.5,168.5)、赤脚 (1129,117)。这是美术对齐锚点，不是 VTS 网格碰撞点。水平镜像时接触点应同步变成 (1-x,y)。如果动画整体转向，请让素材和接触点使用相同变换。

主体边界（alpha ≥128，像素，含端点）：
- 鞋：[62,146]–[1191,1110]
- 赤脚：[63,105]–[1202,1162]

视觉检查：细暖棕线、浅象牙肤色、桃色块状阴影；两图小腿占比与朝向接近，但脚尖位置和鞋／裸足轮廓不同，接入时必须分别使用锚点。素材中没有受伤、血液、人物脸或躯干。

只读验证采用 PNG IHDR 和 RGBA 解码统计，并用 view_image 分别检查；素材未经过程序图像编辑。

## 参考图

- C:/Users/Mamba4live/Downloads/FEH5T6DakAMLLSC.png
- C:/Users/Mamba4live/Downloads/FEH5T6CaAAAO2nH.png

## 最终提示词

### kick-shoe.png

Use case: stylized-concept. Asset type: a single original 2D anime Live2D overlay accessory sprite. Image 1 and Image 2 are STYLE REFERENCES ONLY for pale ivory skin, delicate warm dark-brown lineart, and subtle peach 2-3-tone cel shading; create a NEW original leg pose, do not modify the reference arms. True TRANSPARENT ALPHA background, absolutely no opaque white backdrop and no drawn checkerboard. Flat hand-drawn anime illustration, restrained gradients, fine clean lineart, natural slender ADULT anatomy. Composition: one foot connected continuously to a short-to-medium lower leg/calf segment in a dynamic playful side/front kick; lower calf begins at lower-left around normalized (0.18,0.88), ankle near (0.42,0.52), foot extends to the right and slightly upward, leading front tip around (0.84,0.40). Square composition, all toes/shoe and entire calf segment visible with generous transparent margins. Calf base is a clean rounded graphic ending like the supplied arm accessory references, without exposed cross-section. Three-quarter side view, top/outer edge of foot visible. No face, person, thigh, torso or body beyond calf; no injury, no motion effects, no shadows outside the sprite, no text, no logo. NOT 3D, no realistic skin/leather texture, no plastic shine, no photo render, no bulky toy proportions. Subject: a refined simple white anime court sneaker worn on the foot, naturally joined to the pale bare calf. Slim sole, clean elegant panel lines and readable white laces. Small muted dusty-purple accent at heel and sole edge only. Bare ankle or tiny plain low ankle sock. No brand. It should look like a tasteful anime drawing to match the hand references, not a product render.

### kick-barefoot.png

Use case: stylized-concept. Asset type: a single original 2D anime Live2D overlay accessory sprite. Image 1 and Image 2 are STYLE REFERENCES ONLY for pale ivory skin, delicate warm dark-brown lineart, and subtle peach 2-3-tone cel shading; create a NEW original leg pose, do not modify the reference arms. True TRANSPARENT ALPHA background, absolutely no opaque white backdrop and no drawn checkerboard. Flat hand-drawn anime illustration, restrained gradients, fine clean lineart, natural slender ADULT anatomy. Composition: one foot connected continuously to a short-to-medium lower leg/calf segment in a dynamic playful side/front kick; lower calf begins at lower-left around normalized (0.18,0.88), ankle near (0.42,0.52), foot extends to the right and slightly upward, leading front tip around (0.84,0.40). Square composition, all toes/shoe and entire calf segment visible with generous transparent margins. Calf base is a clean rounded graphic ending like the supplied arm accessory references, without exposed cross-section. Three-quarter side view, top/outer edge of foot visible. No face, person, thigh, torso or body beyond calf; no injury, no motion effects, no shadows outside the sprite, no text, no logo. NOT 3D, no realistic skin/leather texture, no plastic shine, no photo render, no bulky toy proportions. Subject: a BARE FOOT and lower calf in the described kick pose. Normal believable adult foot anatomy with a natural continuous ankle, five natural toes and simple clean toenails, slight toe flex. Show top and outer side of the foot; NO sole-centered view or extreme foot close-up. No jewellery, no shoe, no sock. Keep the calf a substantial visible part of the sprite; maintain same visual scale and pose as a court-sneaker variant.

## 原始生成文件

- C:/Users/Mamba4live/.codex/generated_images/01a0c84c-5047-7eb1-9704-db4145b564e9/exec-c5a72c57-935d-4103-b6be-9f5677c0f18c.png
- C:/Users/Mamba4live/.codex/generated_images/01a0c84c-5047-7eb1-9704-db4145b564e9/exec-f98c2709-1e95-4ee0-9a94-1a192c4d026a.png

