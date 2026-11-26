# 手势陶艺 · Gesture Pottery (v3)

Vite + Three.js + MediaPipe 手部追踪。桌面浏览器或手机横屏均可。

## 运行
```
npm install
npm run dev      # 自动下载手部模型到 public/，然后打开终端里显示的地址
npm run build    # 生成可上传的 dist/
```
摄像头需要 https 或 localhost。

## v2 改动
1. 水池首页默认为空，不再有示例花瓶（只显示提示语）。
2. “创作陶艺”为首页底部居中的白色按钮。
3. 白天/夜晚/实时：24 小时光照连续渐变（约 15 秒走完一天）。可用 `?time=18.5` 固定时刻。
4. 摄像头窗口默认更大（⤢ 可切换 220/300/420px）。
5. 手势延迟：One Euro 滤波参数、捏合 1 帧确认、速度预测、60fps 摄像头请求。
6. 工作室：暖色窗光 + 台灯 + 光柱 + 木桌/墙面纹理，光色随真实时间变化。
7. 提拉：塑形阶段选“提拉”，捏住并向上移动即可把泥拉高；底部可选 碗/盘/杯/瓶 基础形状再用按压/提拉修整。
8. 上釉：笔刷大小滑块。
9. 釉色“自定义”会弹出取色器。
10. 新“装饰”阶段：质感（原胎、冰裂、结晶、盐釉、火山气泡、流淌釉）与纹饰（纹样：笔触描绘，可调大小/密度；立体小饰品：拖到器物上）。纹样面板由“纹样”按钮打开。

## 手势
- 塑形/上釉阶段：捏合 = 当前工具（提拉/按压/拉伸），食指指向 = 上釉。
- 装饰阶段：食指指向 = 画纹样；捏合 = 拖动立体饰品。
- 鼠标：左键 = 当前工具，Shift/右键 = 反向（按压⇄拉伸）。

旧版保存的作品会自动迁移。

## v3 改动（代码里所有改动处都以 `[v3]` 注释标出）
1. **手势更顺滑稳定**（`gestures.js`、`camera.js`、`studio.js`）：每个渲染帧按速度外推手的位置（相机约 30 帧/秒，指针 60 帧/秒）；
   丢帧时保持上一个手势 0.3 秒；用手的位置而不是左右手标签来分配手槽（标签偶尔会跳变）；捏合比例做了平滑；
   阴影贴图降到 1024、渲染分辨率上限 1.5，帧率持续偏低时自动降分辨率。
2. **烧窑动画 + 二维码**（`kiln.js`、`qr.js`、`server/`）：点“存入水池”后播放红砖窑动画（入窑→关门→烧制升温→开门），
   之后显示成品图，右下角是二维码；手机扫码打开下载页即可保存照片。可点“跳过”。
   - 二维码内容是一个链接，所以需要一个很小的“分享服务”把照片存起来。`npm run dev`、`npm run preview` 已内置；
     正式上线用 `npm run build && npm run serve`（可设 `PORT`、`PUBLIC_BASE=https://你的域名`）。
   - 本机测试时手机要和电脑连同一个 Wi-Fi（服务会自动把 localhost 换成电脑的局域网地址）。
   - 分享服务不可用时，成品图照常显示、可下载，只是没有二维码。照片保存在 `server/shared/`，30 天后自动清理。
3. **拉伸更圆滑**（`clay.js`）：影响范围核至少覆盖 2 列/2 行并在 3σ 处平滑归零；软限位代替硬截断；每次变形后在行和列两个方向做局部松弛；
   提拉后会把拉起的肩部磨圆；按压/拉伸开头 0.18 秒缓入。
4. **实心泥团**（`clay.js`、`meshbuild.js`）：初始是一团封顶的、略不规则的泥球；用“按压”按顶部会按开成捏塑碗（`openClay`），也可以直接提拉；
   泥团阶段不论转盘是否转动都是局部捏塑。碗/盘/杯/瓶预设仍然是空心器皿。
5. **三种模式严格隔离**（`studio.js`、`gestures.js`）：塑形只认“捏合”，上釉和纹样只认“只伸出食指”，立体饰品只认“捏合拖动”，质感不用手势。
   四层保障：分类器只产出本模式手势；`handAction` 只映射本模式手势；切换模式会结束正在进行的动作并让手“解除武装”（先松开一次才生效）；
   `processPointers` 丢弃不属于本模式的动作。摄像头窗口会显示当前模式和手势是否生效（●/○）。


## v5 改动（改动处以 `[v5]` 标出）

1. **鼠标中键环绕视角**（参照 Blender）：中键拖动 = 环绕；Shift+中键 = 平移；Ctrl+中键 = 缩放；滚轮缩放；双击中键或点右上角“重置视角”复位。
2. **上釉笔刷最小值**降为原来的 1/5（0.03 → 0.006），小笔刷的步长也相应调细，线条不会断。
3. **笔刷浓度（不透明度）滑杆**：5%~100%。低于 100% 时整条笔画先画在独立图层再按浓度叠上去，同一笔来回涂不会越涂越深。
4. （初始泥料 / 碗盘杯瓶质感：等待参考图，尚未修改。）
5. **图文分步引导弹窗**（`src/tour.js`）：7 步，首次进入自动弹出，“说明”按钮可再次打开；窄屏横屏时图文左右排列。
6. **可折叠横向工艺时间轴**，两种模式：
   - **自由创作**：原版，所有工具随时可用。
   - **古法制瓷**：拉坯（互动）→ 阴干（动画）→ 修坯（指向刮几下，约 4 笔后修整完成）→ 素烧（窑动画，约 900°C）→ 装饰（釉下彩：彩绘 + 纹样）→ 施釉（粗陶 / 冰裂釉 / 结晶釉 / 铁结晶釉 / 盐釉 / 流动釉，选择后不显示效果）→ 釉烧（砖窑动画，约 1280°C）→ 冷却出窑（出窑发光渐退，釉面显现，可旋转查看并保存）。
   - 新增“铁结晶釉”质感（深褐黑底，兔毫纹和银色油滴斑）。
   - 古法模式不会改变自由模式的任何行为；切回自由模式会恢复进入前的釉面。

> 测试说明：开发环境里无法运行真实 WebGL，我用“假 three.js”在无头浏览器里把页面逻辑完整走了一遍（含整条古法流程和保存），没有报错；但 3D 外观（光照、釉面观感、发光强度）没有实际看过，需要你在浏览器里确认。

## v6 changes

- **Glaze colour panel** is shown only in the Glaze stage (hidden while shaping and decorating); the side panel disappears when empty.
- **Tutorial** is image-first: animated pictures, one short line each, and "Step 1 … Step 6" badges (camera, shaping, patterns, glazing, modes, view). Intro slide is unnumbered.
- **Shaping speed**: push / pull / stretch now ramp up over `SHAPE_RAMP_S` (0.7 s) and move at `PUSH_RATE` (0.24), both constants at the top of `src/studio.js`.
- **View controls**: only middle-drag = orbit and wheel = zoom remain (Shift pan, Ctrl zoom, double-click reset removed). The **Reset view** button is now a prominent accent button.
- **Glaze brush**: strokes are stabilised, joined with a Catmull-Rom curve, resampled at a fixed distance (45 % of brush sigma, below the radius) and stamped with a soft-edged brush onto a private layer, so they are continuous at any speed. The opacity slider still caps the colour.
- **Initial clay**: matte brown, wide low lumpy dome with a fold groove; new default finish "Wet clay" (fingerprint ridges, creases, tiny red grains). Ancient mode uses it before drying, then switches to the paler raw look.

## v7 changes

- Tutorial texts and pictures: Step 1 points an arrow at the "Turn on camera" button; Step 2 pinch (thumb + index) deforms the pot; Step 3 index finger draws a line along its path; Step 5 shows the Free / Ancient choice; Step 6 "hold the middle mouse button and drag to rotate the view".
- Free Creation uses the smooth porcelain glaze again by default; every glaze type (incl. iron-crystal) is listed in the Glaze stage and previews at once.
- Ancient Craft body looks per step (matte, no brown crease lines): throwing = brown clay, air-drying = grey-beige, trimming = paler with fine scratches, bisque = near white.

## v8 changes

- Fixed the white pot flipping between matte and glossy (the initial material parameters did not match the default glaze finish).
- Camera-device placeholder and the Free / Ancient labels in the tutorial now follow the language.
- Ancient Craft bodies are clearly different: air-dried = darker grey-beige, trimmed = warm cream-tan, bisque = near white.
- "← Previous step" button (Ancient Craft bottom bar) on the trimming, decoration and glazing steps.
- Trimming: an animated finger guide, a visible loop trimming tool that follows the finger/mouse, scrape shavings.
- Tutorial hand pictures are the supplied anatomically correct images (OK/pinch and index point).
- Studio details: wainscot, second shelf, plant, bucket and sponge, tools, slip splashes, hanging tools.
- Soft clay: pressing/pulling keeps volume (a soft swell around the dent) and the surface squishes with a damped spring wobble (`SOFT_*` constants at the top of `src/clay.js`).

## v9 changes

- Clay is firm wheel clay again: the jelly spring-back and the surrounding swell were removed (`deform` is back to the plain, smoothed push/pull).
- Trimming: bigger loop tool (waits beside the pot until you start), a shallow groove is really cut, curled clay shavings fly off, fall onto the wheel and fade; each stroke makes the blank visibly cleaner and shows "✓ n/4"; finishing gives a big shaving burst and a ✨ message.
- Free Creation and Ancient Craft each keep their own surface (finish + paint); switching modes no longer mixes clay looks or leaks paint (the shape is shared).
- Glazes redrawn after the reference photos: crackle (curved plates + bright cracks), crystalline (celadon ground, radial crystal flowers), salt (sandy orange-peel, bubbles, rust patches), runny (fat two-tone tongues), iron-crystal (silver-blue feathers on black), new Glossy glaze (deep gloss, speckled band low on the body). The "Raw clay body / bisque" option is gone from the glazing choices; Glossy glaze replaces it in Ancient Craft.
- Fixed a colour bug that made Crystalline / Glossy grounds come out dark.

## v10
- The coach card / goal-pot guidance was removed again (judged poor). Kept: synthesised sound with a 🔊 mute button.
- Trimming now needs 2 strokes instead of 4 (half the time).
- Lift (pull) tool: pulled clay now flows into a smooth tapering wall (`Clay.liftBlend`) instead of a stepped shoulder; the cut top edge is rounded.
- Gestures: a pinch now needs the thumb and index tips to actually touch (3D distance incl. depth, threshold 0.27 of palm instead of 0.44) and must hold 2 frames; hand-detection confidence raised slightly.
- Skeleton: landmarks are smoothed with a One Euro filter before drawing (no more jitter); pointer filter a bit steadier.
- Trimming is time-based: about 5 s of real scraping (5 ticks of 1 s) finishes the blank.
- Glaze list (both modes) ordered: crackle, crystalline, salt, running, iron-crystal, glossy; 'Flowing/Dripping' renamed Running glaze. Crackle (larger plates, fading cracks), crystalline (big overlapping solid flowers), iron (longer greyer feathers) and running (wider tongues) textures redrawn.
- Redrawn after real 3D screenshots: salt (glossy olive-cream glaze, brown pools with bubbles, speckled foot, small bumps), crystalline (saturated ground, soft ray-fan flowers, no outlines), running (white porcelain body, wider tongues, streaky rim band), iron (varied silver/teal/tan feathers), gloss (smooth, no speckles, very glossy).

## v10 — opening pixel cutscene
- `src/cutscene.js`: ~14 s pixel-art scene (assistant knocks, the master potter jumps off the sofa, scrambles for tools, "Almost done! Give me ten more minutes!"), drawn with canvas rectangles, bilingual, dither fade-out into the studio. Skip button, or Esc / Space / Enter. The walkthrough opens only after it.
- Plays on every visit. Disable with `?nocut` in the URL or `localStorage['gp-cut-off']='1'`.

## v11 — session modes, embedded tutorial, scoring (rest of the approved plan)
- **Choose first**: on entry pick *Timed challenge* or *Relaxed creation*. Timed plays the original cutscene (assistant knocks, the master asks for ten more minutes); Relaxed plays a separate prologue (the master calmly preparing for an exhibition: one empty pedestal left). Both are skippable; `gp-cut-off=1` disables both.
- **Tutorial**: six in-context steps (camera, shape, tools, glaze, orbit, mode) with a soft glow and one instruction at a time; no modal; Skip any time. Time spent in it is not counted. Shown once (`gp-tut-seen`); Help re-opens the old tour.
- **Craft group** (switch any time in the timeline): Ancient craft (fixed 7‑step process) / Free creation. Switching keeps your pot and resumes the ancient step.
- **Experience group**: Timed = 10:00 countdown (paused during tutorial, automatic kiln/dry steps, dialogs, hidden tab), assistant reminder at 1:00 "Master Potter! The auction is about to begin!", editing locks at 0, pixel auction ending per score band. "Hand in" ends early (my addition). Relaxed = no clock, only a live score preview.
- **Score** (`src/session.js`): shape 40% (form, symmetry, smoothness, wall), glaze 30% (coverage, effect, details), process 30% (ancient steps reached / free-mode parts). Saved with the work.
- Dev hooks: `localStorage gp-sess-auto=timed|relaxed`, `gp-tlimit=<seconds>`, `gp-cut-off=1`, `gp-tut-seen=1`.

## v12 — story sounds, one tutorial, mode split
- **Story sounds** (`sfx.js`, synthesised, follow the mute button): gibberish talk blips per speaker (assistant, master, narrator; never readable speech), footsteps, jump + surprise, door creak, snoring, tool clatter, scene whooshes, sparkle.
- **One tutorial**: the separate illustrated tour dialog (`tour.js`, `#helpDlg`) is gone. The Help button replays the embedded tutorial (its time is not counted in a Timed run). The camera step is skipped if the camera is already on.
- **Mode split**: *Timed challenge* = traditional process only (the Free/Ancient switch is replaced by a fixed label; its tutorial has 5 steps ending with the timeline). *Relaxed creation* = Free creation and Traditional process, switchable any time.

## v13 — trimming keeps the shape, vivid ink, transparent glaze, more sound
- **Trimming never changes the shape**: the tool only scrapes (shavings, tint). No smoothing, groove or deformation at any point; the dry → trim → bisque steps leave the radii identical (checked by test).
- **Vivid underglaze**: on unglazed bodies (clay / dry / trimmed / bisque / raw) painted colours and pattern inks are boosted in saturation, and the bisque wash is thinner (0.62 → 0.28), so decoration reads clearly.
- **Transparent glaze** (`clear`, first in the Ancient glaze list, also in Free): a glassy veil of exactly 30 % opacity (= 70 % transparent) whatever colour is chosen; painted patterns show through.
- **Sound**: door "bang" when the assistant arrives, a voice alert (two-tone bell + gibberish babble) for the one-minute reminder, and a soft generative ambient bed (Am–F–C–G pads + sparse pentatonic plucks) during the session; it stops at the auction ending. All follow the mute button.
- Dev hook: add `?dbg` to the studio URL to expose `window.__gp`.

## v14 — pixel cabinet replaces the pool; back from the finished pot; door sequence
- **Home page = endless pixel-art display cabinet** (`index.html`, `src/gallery.js`, `src/pixelart.js`). The Three.js pool, water/sky shaders and day/night clock are removed. Saved works (newest first) appear in glass compartments as 48×48 pixel art made from the work's photo (6 colour steps, extra saturation, dark outline). Rows of empty compartments are added whenever you scroll to the bottom, so the cabinet never ends; the first empty slot is a "+ New piece" link. A work saved in the studio drops into the cabinet with a bounce and sparkles. Click a piece to preview / edit / delete.
- **Back button in the traditional process**: now also on the finished pot. "Previous step" returns to glazing (the glaze comes off, underglaze stays) and further back to decoration / trimming / throwing. After the work has been **saved**, the finished pot can no longer be taken back.
- **Opening cutscene order**: door creak → door hits the wall (BANG, dust, screen shake) → only then the master jumps up in surprise → the assistant speaks.

## v15 — audio engine (mixer, recorded-sound slots, interaction + Timed-challenge sounds)
- **One engine** (`src/sfx.js`) for studio, cutscenes and cabinet (the old `audio.js` is gone). Buses: music / effects / voice / interface → compressor-limiter → master, plus a small room reverb. The music ducks under dialogue, alerts, the gong and the gavel. Audio pauses while the tab is hidden.
- **Volume panel** (🎚 next to the speaker button): master / music / effects sliders + mute, remembered. Open any page with `?sound` to get a **sound test panel** that lists every effect (and the five continuous ones) so you can audition them.
- **Style mix**: pixel cutscenes and the auction scene use retro 8-bit square/triangle voices (gibberish blips); the studio uses realistic clay / kiln / ceramic sounds.
- **Recorded sounds**: put free-licensed files in `public/audio/`, list them in `public/audio/manifest.json`, credit them in `CREDITS.md`. Every slot (names and search terms in `SLOTS.md`) plays a recording when present and a synthesised sound otherwise. No recordings are bundled yet.
- **Interaction sounds now wired**: pinch grab / release, wet-clay loop that follows how far the finger has sunk in, lifting loop that follows hand speed, pinch-pot opening squish, brush loop that follows speed, trimming scrape loop, pattern stamp taps, ornament placement, colour / glaze picks (pitch by position), tool and button clicks, undo / reset, step-complete bell (clicks when going back), camera on, hand found / lost, kiln roar with crackles + door unlatch, glaze "pings" while cooling, save chime.
- **Timed challenge**: ticks for the last 10 s (brighter in the last 3), bronze gong at zero, studio-lock thunk, gavel + a retro sting per result (sold high / sold / sold low / passed / no bids), score-bar ticks.

## v16 — quieter clay, cabinet music, no lifting, "Save to cabinet"
- All clay / tool / brush sounds (grab, release, squish, clay and scrape loops, brush, stamp, ornament) now run on their own `clay` bus at 60 % of the other effects. The background music is unchanged.
- The cabinet page has its own background music (warm C–Am–F–G pad with a slow music-box melody). It starts on the first click or key press, or at once when arriving from the studio; the mute button and the 🎚 sliders control it.
- The Lift tool is removed everywhere (button, gesture, hints, tutorial text). Shaping is Press / Stretch plus the preset shapes.
- Wording: "Save to pool" → "Save to cabinet" (also the auction ending button, the saved message and the Back links).

## v17 – Lift restored, Painting stage, texture opacity

- **Shape tools** are ordered Press → Stretch → Lift in every mode (Lift is back after the v16 removal; tutorial/help text updated).
- **Painting stage** (was "Glazing"): pigment colours + sub-tabs *Brush* and *Patterns*. Pattern stamping moved here from Decoration. In the traditional process, the underglaze step uses the same two tabs; the real *Glazing* step (choosing a fired glaze) keeps its name.
- **Decoration stage** now holds only *Texture* and *3D ornaments*; the texture list is no longer shown in Painting.
- **Texture opacity slider** (free creation): scales how strongly the texture/finish overlay covers the painted surface; saved with the work and undoable. Hidden in the traditional process, where the transparent glaze keeps its fixed ~70% see-through look.

## v18 – kiln sound + pixel flames

- Iron door close (scrape, clang, latch), fire (ignition whoomph, roar, crackles) and door open (latch, scrape, hot air) sounds are cued from the animation timeline (`playKiln(..., { onCue })`, sfx `kilnDoorClose/kilnFire/kilnDoorOpen`, each replaceable by a sample slot of the same name).
- Pixel-art flames burn in two stoke holes at the foot of the kiln and at the chimney top (`pixFlame` in `kiln.js`).
- (The pattern-panel re-layout and the glaze preview/opacity slider requested alongside were reverted at the user's request.)

## v19 – guide prompt, 2-round trimming, 10-tier auction, louder music

- Pattern panel: patterns first, pigment colours below (CSS `order`).
- On opening the studio a "Want a beginner guide?" prompt appears (`askTutorial`). The guide runs only on "yes", and once it has been shown (finished or skipped) the prompt never appears again; Help still replays it. Answering "no thanks" asks again next visit.
- Traditional trimming needs 2 rounds (`anc.trimNeed`, was 5).
- Auction scene: the player's pot is centre stage on a pedestal with a growing spotlight; the price board climbs a ten-tier ladder (¥500 … ¥600,000, `TIERS` in `sessionui.js`). Tier 1 = reserve not met (passed); tiers 2–10 are sales chosen from the total score 30–100 (`auctionTier`). The score card moved to the lower right.
- Auction sounds: `paddle`, `bid`, `priceUp(tier)` (rising pitch per tier) before the existing hammer + sting; each can be replaced by a sample slot of the same name.
- Music louder: default music level 0.55 → 0.85 and the ambient bed gain 0.2 → 0.34 (studio and cabinet share it); a previously saved music slider value is reset once.

## v20 – glaze texture only where painted; guide prompt fix

- Glaze-type textures (crackle, crystalline, salt, volcanic, running, iron, transparent, glossy) now appear immediately and **only on painted areas**. `Clay._mask()` derives a painted-area mask from the paint canvas (pixels that differ from the bare clay colour); the glaze overlay, its bump relief and its shine (clear-coat / roughness maps, see `Clay._maps` and `Pot.applyFinish`) are all masked. Unpainted areas keep the body look.
- Traditional mode: the chosen glaze previews on the painted areas of the biscuit during painting and glazing (`Clay.setGlazeLayer`), and after the glaze firing it stays on the painted areas with the biscuit look elsewhere (`finish.base = 'bisque'`).
- Glossy glaze adds shine only (no colour fill), so it never recolours the painted pigments; other textures are drawn at ~85 % so painted colours stay visible.
- Bug fix: the "Want a beginner guide?" prompt never appeared for browsers that had already seen the old automatic guide (the old "seen" flag was reused). The flag is now `gp-guide-v2`, so everyone is asked once more.

## v21 – glaze brush (texture only where the glaze is brushed)

- Corrects v20: the glaze texture is no longer derived from the colour/pattern paint. A separate **glaze mask** (`Clay.gmask`, painted with `paintMaskStroke`, undoable, saved as `gmask` in the work record) records where glaze has been brushed.
- Decoration/painting step: colours and patterns only, no glaze texture. Glazing step (traditional) and Decoration → Texture (free): pick a glaze, then brush it on (action `gbrush`, pointing gesture, own size slider `#gBrush`); its colour/texture, relief and shine appear only under the strokes and immediately.
- After the glaze firing the glaze stays where it was brushed, the rest remains biscuit. Works saved before v21 with a glaze-type texture are loaded with the texture covering the whole pot.

## v22 – auto-advance after trimming, glossy + volcanic glazes removed, wheel symmetry

- Traditional mode: when the 2nd trimming round completes, the process goes on to the bisque firing by itself after ~1.3 s (no Next click); Previous still works.
- The glossy glaze (identical to the transparent one) and the volcanic-bubble glaze are removed from both modes' lists; the transparent glaze is the default choice. Works saved earlier with those finishes still render.
- Raw clay on a spinning turntable: while pressing / stretching, `Clay.regularize` removes ~90 %/s of each row's deviation from its circular mean, so the lump gradually becomes rotationally symmetric (not when the wheel is paused, and not after trimming/firing).

## v23 – tense last-minute music, steadier hand painting

- Timed challenge: when the one-minute reminder fires, the ambient bed switches to a tense one (`sfx.ambientTense`): diminished/minor-third saw pad, heartbeat thump, ticking eighth-note ostinato, brighter filter and a higher level (~3x the calm RMS in my headless measurement). It runs until the session ends. The `?sound` test panel has "music: calm" and "music: tense" buttons.
- Hand painting: `placeHand` now uses a "lazy brush" while a brush / glaze-brush / pattern gesture is active: fingertip movements smaller than 0.7 % of the canvas height are ignored, real strokes drag the brush point along (it trails the fingertip by about that distance) and a light low-pass rounds corners; no velocity look-ahead while drawing. Hovering and non-drawing tools are unchanged. Tunables: `STABILIZE_FRAC`, `STABILIZE_SOFT` in `studio.js`. Simulation with 3 px / 8 Hz tremor: line roughness reduced about 2.6x, holding still gives a perfectly still brush.

## v4.10.0 改动（`[v24]`）
- 彩绘阶段显示画笔工具模型（笔杆+笔头，笔头颜色随釉色/颜料色，跟随落笔位置）。
- 颜料画笔与图案面板新增「立体效果：平 / 凸 / 凹」，以高度图绘制凸起或凹陷（撤销、存档同步）。
- 限时创作改为 8 分钟；最后一分钟的背景音乐由紧张版改为稍快节奏的轻快版（无心跳/锯齿音）。

## v4.10.1 改动（`[v25]`）
- 修复画笔模型方向：笔杆原先朝罐内倾斜、从背面穿出遮挡画面；现在笔尖落在可见的正面，笔杆向上并朝观察者一侧倾斜。
- 立体效果改名：「凸釉 / Raised glaze」「刻花 / Incised carving」。高度图加了柔化（圆润的堆釉线 / 刻痕截面），浮雕强度提高，并叠加明暗色调（凸起处偏亮、刻痕处偏深），不再是单纯的白线/黑线。

## v4.10.2 改动（`[v26]`）
- 画笔模型只在彩绘/装饰阶段（颜料画笔）显示，釉面阶段不再显示；笔头、笔杆更细更尖。
- 修坯工具方向：与画笔同样的反向问题，现在工具落在可见表面的交互点上，手柄朝外上方倾斜。
- 凸釉/刻花只保留形状效果：去掉颜色变化，改为烘焙的浮雕明暗（左上光）+ 更高的凹凸强度与更陡的边缘。

## v4.10.3 改动（`[v27]`）
- 凸釉 / 刻花功能暂时停用（界面隐藏，笔触与图案保持平面）；代码保留，`studio.js` 里 `RELIEF_ON = false`，并在 `style.css` 末尾隐藏了两行按钮，之后优化时恢复。

## v4.11.0 改动（`[v28]` 互动式新手教程）
教程重写为“边做边学”，每个手势都要真正做出来、被系统识别后才进入下一步：
- 手部检测 → 捏合（捏住并松开）→ 按压（压开泥团）→ 拉伸 → 提拉 →（自由创作）指向手势画笔 → 转动视角 / 切换模式（挑战赛为流程说明）。
- 气泡里有**实时读数**：当前识别到的手势名、拇指–食指“捏合进度条”（黑线 = 判定为捏合的位置）、任务进度条，以及随状态变化的提示（没看到手 / 手势不对 / 手不在陶泥上 / 泥团还没压开 / 请向上提…）。
- 通过条件来自真实效果：按压/拉伸/提拉/画笔各自在陶罐上真正起作用的时长；按压还要求泥团被压开。
- 练习在一团临时陶泥上进行，结束或跳过后恢复玩家原来的作品、阶段与撤销记录（“说明”按钮重看教程不会破坏作品）。
- 任何一步都可点“跳过这一步”；鼠标用户点“用鼠标”会跳过手势专属步骤，文字改为鼠标操作。传统工艺（挑战赛）里没有画笔步骤。
- 不使用任何示意图或预览图。

## v4.12.0 改动（`[v29]` 教程里的手指高亮）
- 教程练习时，摄像头小窗和场景里的手骨架上会高亮正在教的手指（`gestures.js` 的 `drawFocus`）：
  - 捏合：拇指尖和食指尖有脉动的橙色圆圈，中间连线；一旦被识别为捏合，变绿。
  - 指向：食指为绿色粗线；中指/无名指/小指伸直时标红（“收起它”），收起后变绿。
- 高亮只在教程的对应步骤出现，结束或跳过后自动关闭。动画手势示意图留待之后再加。

## v4.13.0 改动（`[v30]` 逐步引导式教程）
- **一次只出现一个提示**：每个大步骤拆成子步骤，上一个子步骤真正完成后才出现下一个；去掉了包住整个陶罐的黄色大圆圈，改为：按钮发光（只在“点按钮”这一步）、一个小圆点（目标位置）、一个方向箭头（动作那一步）。
- **必须先选工具**：按压 → 拉伸 → 提拉严格按顺序。每个工具的顺序是：①点工具按钮（不再替玩家自动选中；只认真实点击）→ ②把指尖移到圆点 → ③捏合 → ④沿箭头动作。没点按钮就不会出现捏合提示；中途换了别的工具会退回第①步。按压必须把泥团压开才能进入拉伸。
- **彩绘步骤（自由创作）**：点“彩绘” → 点“画笔” → 指尖移到陶罐 → 指向手势 → 画一笔。
- **先开摄像头**：第一步只让玩家打开摄像头，等摄像头和手部模型真正跑起来才继续；只有摄像头失败（被拒绝/没有设备/被占用/模型加载失败）或等了 15 秒仍没启动，才出现“改用鼠标”，之后整个教程改为鼠标文字。
- **不改变陶泥材质**：练习用的泥团沿用当前作品的材质，不再被重置成光滑釉；彩绘练习不再偷偷切换阶段。结束后恢复原作品、阶段、工具和撤销记录。
- 提示气泡不再盖住它指向的按钮或相邻按钮（底部工具栏时放在按钮上方）；提示行只在卡住约 5 秒后出现（“没看到手”除外）。

## v4.13.1 改动（`[v31]`）
- **提示框不再挡住陶罐和引导标记**：每次摆放都给候选位置打分（与陶罐范围、目标圆点、箭头、被指的按钮、摄像头小窗的重叠面积），选重叠最少的位置，并带迟滞避免来回跳。
- **捏合步骤文字更明确**：“把指尖放到圆点上（泥团顶部），**然后用拇指和食指捏合**”，下一步“现在捏合：拇指和食指指尖碰在一起”，动作步骤“保持捏合，向下压”。
- **中英文混杂**：原因是一次性写入的文字在切换语言时没有重画。现在以下内容会随语言切换重绘：新手教程气泡（含跳过/下一步/提示）、“需要新手引导吗？”对话框、创作方式选择界面、评分预览按钮、助手提醒、时间到提示。语言按钮上显示的“中文 / EN”是对方语言的名称，属于有意保留。

## v4.14.0 改动（`[v32]`）
- **提示框动态定位**：在整个视口上按网格给每个候选位置打分，选“离当前子步骤焦点最近、且不遮挡任何东西”的空位，并平滑滑过去（不抖动）。需要避开的：陶罐（按真实投影范围）、目标圆点和箭头、被指向的按钮及同一排邻近按钮、摄像头小窗（手部步骤必须看得见骨架）、顶栏、时间线、底部工具栏。
- **新增“转盘”教学步骤**（按压/拉伸/提拉之后，依次一次一个提示）：点“按压” → 转盘转动时向里推（整圈一起变形，保持圆润）→ 点“转盘”停下 → 转盘停止时再推（只有碰到的那一块变形，可做凹痕和不对称）→ 点“转盘”重新转起来 → 总结（转动 = 整圈均匀；停止 = 局部；提拉总是整圈）。结束或跳过后转盘恢复为玩家原来的状态。

## v4.15.0 改动（`[v33]` 师傅带路的教程）
- **师傅像素对话框**：新手引导和“要不要引导”的询问都由像素师傅说话（头像 + 打字机效果 + 说话声），台词全部改成师傅口吻、更短（中英双语，切换语言即时重绘）。
- **提示框只放在陶罐左边或右边的空白处**：按真实投影的陶罐范围划出左右两列，评分选离当前焦点最近、且不压住陶罐、圆点/箭头、被指的按钮及邻居、摄像头小窗、顶栏、时间线和工具栏的位置；平滑滑过去。
- **聚光遮罩**：整个画面轻微压暗，只在陶罐、被指的按钮、摄像头小窗（手势步骤）、时间线（流程说明）处挖洞；`pointer-events: none`，不会锁住视角或操作。
- **一次只教一个操作 + 看结果**：每个步骤的最后一个动作完成后，师傅会指着陶罐说出结果（“泥团被你压开了！”“壁变宽了！”“整圈壁一起升高了！”……）约 2.6 秒，再进入下一步。
- **转盘教学 = 左右对比的实时预览**：先点“按压”，推侧壁；对话框里出现两个小陶罐（顶视环形 + 侧面轮廓），左边“转盘开”整圈一起变形、保持圆；右边“转盘停”只在碰到的一点凹下去。两个小陶罐用同一次推压的真实数据实时计算，不是示意图。之后再让玩家真的点“转盘”停下、再推一次、再开回来。提拉总是整圈升高。
- **Help 按钮 → 章节菜单**：从头全部来一遍 / 摄像头与手势 / 按压·拉伸·提拉 / 转盘 / 画笔上色 / 视角与模式（当前用不了的章节会置灰）。无摄像头时重玩章节自动改用鼠标文字。

## v4.15.1（[v34]）

- 新手教程改为**完全以师傅视角**呈现：玩家就是师傅，师傅就是玩家。名牌改为“师傅（我）/ Master (me)”，所有台词（开场询问、章节菜单、每一步提示、结果句、提示气泡、结尾）都是师傅自己的第一人称心声，不再出现“徒弟 / Apprentice / 你 / you”。
- 中英文同步改写，切换语言仍即时重绘。
