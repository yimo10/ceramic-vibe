# Sound slots

Every sound in the site first looks for a recording here; if a slot is missing it plays a synthesised version. Add files, then list them in `manifest.json`:

```json
{
  "squish":  { "files": ["clay_squish_1.ogg", "clay_squish_2.ogg", "clay_squish_3.ogg"], "gain": 0.9 },
  "clay_loop": { "files": ["clay_wet_loop.ogg"] }
}
```
Use short files (under 1 s) for one-shots; several variants per slot are picked at random with a small random pitch. `*_loop` slots must be seamless loops (1-3 s). Use only CC0 / public-domain / licence-compatible files and list them in `CREDITS.md`.

| Slot | What it is | Search terms |
|---|---|---|
| `grab`, `release` | fingers pinch / let go of clay | "wet clay touch", "mud squeeze short" |
| `squish` | clay pressed, pinch-pot opens | "clay squish", "wet slap", "mud splat" |
| `clay_loop` | clay moving under fingers (loop) | "wet clay kneading loop", "mud squelch loop" |
| `lift_loop` | wall pulled up (loop) | "clay stretch", "wet slide" |
| `smooth_loop` | smoothing with a sponge (loop) | "sponge wet wipe" |
| `scrape_loop`, `scrape` | trimming tool scraping | "scraping clay", "wood scrape", "chisel scrape" |
| `brush_loop`, `brush` | brush painting | "paint brush stroke", "brush on ceramic" |
| `stamp`, `place` | pattern stamp tap, ornament pressed on | "stamp press soft", "wood tap" |
| `click`, `tool`, `pick`, `undo`, `tick` | interface | "UI click soft", "wood block tick" |
| `camOn`, `handFound`, `handLost` | camera / hand tracking | "soft notification", "UI up/down" |
| `chime`, `saved`, `star`, `ding` | step complete, saved, new piece | "bell chime", "glass ding", "ceramic ting" |
| `kiln`, `kilnDone` | firing roar (3 s), door unlatch | "furnace roar", "kiln fire", "fireplace crackle" |
| `glazePings` | glaze crackling as it cools | "ceramic crackle ping", "glass tinkle" |
| `tickdown`, `gong`, `lock` | countdown tick, time-up gong, studio lock | "clock tick", "gong", "heavy latch" |
| `hammer` | auction gavel | "gavel", "wood knock" |
| `bang`, `creak`, `clatter` | door slam, door creak, tools falling | "door slam", "door creak", "tools clatter" |

Free sources (check each file's licence): Kenney (kenney.nl, CC0), OpenGameArt (filter CC0), Freesound (filter CC0), Sonniss GDC bundles (royalty-free).
