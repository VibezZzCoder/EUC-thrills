# EUC Thrills

**One wheel. Total freedom. Ride anywhere.**

> **Play:** [https://vibezzzcoder.github.io/EUC-thrills/](https://vibezzzcoder.github.io/EUC-thrills/)
>
> **Source:** [github.com/VibezZzCoder/EUC-thrills](https://github.com/VibezZzCoder/EUC-thrills) — an original work by [VibezZzCoder](https://github.com/VibezZzCoder)
>
> **Devlogs:** [@EdwinRodMen on YouTube](https://www.youtube.com/@EdwinRodMen)
>
> **Spin-off:** the title screen links to [EUC NYC](https://vibezzzcoder.github.io/euc-nyc/), the WebGPU Manhattan spin-off ([github.com/VibezZzCoder/euc-nyc](https://github.com/VibezZzCoder/euc-nyc)).
>
> **Play offline:** the whole game as one file you download and double-click, from the [Releases page](https://github.com/VibezZzCoder/EUC-thrills/releases) — for computers; on a phone, play at the link above.

![EUC Thrills in Ultra graphics — a Police chase across the town's brick plaza: Cool Rider rides toward the camera while Officer Dorkins, paddle out, closes in a few metres behind; the screen reads "He is right behind you" and SURVIVE 4:56, the speed readout shows 28 mph with 45 km/h beside it, and behind them stand warehouses, a green apartment block, the brick water tower and two parked vans, with bollards and trees on the plaza and the rider's long shadow on the brick](https://vibezzzcoder.github.io/EUC-thrills/media/euc-thrills-gameplay.jpg)

An open-source arcade riding game about electric unicycles, played in the
browser. You ride a suspension wheel through a generated town — streets, a
park, a river ford, a gravel trail and an industrial yard, with people and
vans on the roads. The wheel behaves like a real one: you lean to go, it
beeps near its top speed and lets go if you ignore the beeps, and a hard
carve can ground a pedal. Four more places are built by hand: the
**Original city**, **BelVar Circuit**, **Switchback Park** and **Wheelhouse
Wharf**, a harbour island built to jump, with launch pads and rooftop gaps.

## Modes

- **Start ride** — free ride in whatever place is loaded, no clock, nothing to fail.
- **2–4 Players** — up to four riders on one desktop screen, each in their own pane: free ride, a three-lap race, Knockabout, Trick Run or a Police chase, with one of you or the CPU as the cop.
- **Time trial** — the start line and five more checkpoints, pure elapsed time, and a ghost of your best to ride against.
- **Track Day** — lap **BelVar Circuit** or **Switchback Park** with sector splits; your best lap becomes the ghost at once.
- **Trick Run** — ninety seconds at Switchback Park, points for the tricks you land off its nine features.
- **Knockabout** — carry a paddle round the town or a generated route and knock down its yellow targets.
- **Police chase** — Officer Dorkins and two patrols hunt you through the town; stay free for five minutes.
- **Fresh route** — generate a new town from a route name or at random, or pick one of the hand-built places.

Records are kept per place and per mode; a couch session saves no records.

## Riders

Eleven riders, chosen from the line under the title buttons. Ten differ only
in looks and crash sound; The Drunkard rides his own way on purpose. Eight
are real people, here with their permission and credited by their public
handle; the full terms are in [`NOTICE.md`](NOTICE.md).

- **Cool Rider** — black moto gear with reflective blue panels; fictional, his style drawn from the author's, credit [@edwin_rodmen](https://www.instagram.com/edwin_rodmen/).
- **Trollina** — magenta hair and a skater dress over tights; fictional, born from a joke drawing.
- **Red Rider** — red-over-black armour on a red saddled wheel modelled on his own; credit [@r3d__rider](https://www.instagram.com/r3d__rider/).
- **Adonisb2** — black kit under neon-green guards on a blocky off-road wheel; credit [@adonisjg_v11](https://www.tiktok.com/@adonisjg_v11).
- **Maribel Vargas** — aqua-and-coral race kit with her own logo; BelVar Circuit is named after her; credit [@baymv_](https://www.instagram.com/baymv_).
- **Wheel in Motion** — blue-and-yellow jersey with his channel's mark; credit [Wheel In Motion](https://www.youtube.com/@RealWheelInMotion).
- **The Drunkard** — a fictional parody rider in a two-can beer hat who weaves when you let go of the steering; based on nobody.
- **FloWithZo** — silver race suit, pewter lid and big white knee armour; credit [@flowithzo_euc](https://www.instagram.com/flowithzo_euc).
- **Seal on a Wheel** — black kit, a grey sweatshirt tied at the waist, a cyan wheel trimmed pink; credit [@seal_on_a_wheel](https://www.instagram.com/seal_on_a_wheel).
- **Wyldist** — turquoise Hawaiian shirt and a red "50" helmet; credit [@wyldist](https://www.instagram.com/wyldist/).
- **Gnarwheel** — black hoodie with his white brush logo and a chin camera; credit [@\_gnarwheel\_](https://www.instagram.com/_gnarwheel_/).

## Controls

Keyboard, gamepad and touch all work at the same time.

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Accelerate | `W` / `↑` | Left stick up, right trigger or D-pad up | Stick up |
| Brake, reverse from a stop | `S` / `↓` | Left stick down, left trigger or D-pad down | Stick down |
| Carve | `A` `D` / `←` `→` | Left stick or D-pad | Stick left or right |
| Hop | `Space` | A | **HOP** |
| Crouch, charge a bigger hop | hold `Shift` | hold LB | hold **CHARGE** |
| 180° spin | Hop again in the air | A again in the air | **HOP** again in the air |
| One-foot air | Hold `Space` through take-off | Hold A through take-off | Hold **HOP** through take-off |
| Swing the paddle | `F` | RB | **SWING** |
| Quick reset | `R` | X | **RESET** |
| Next camera view (eleven, from Chase to an aerial Director) | `C` | Y | **VIEW** |
| Mute | `M` | — | — |
| Pause | `Esc` | Start | **II** |

Every key except `Esc` can be changed in **Settings → Controls**. Pad names
are the Xbox layout; a PlayStation pad uses the same positions. **Settings →
Display → Default camera** picks the view a ride starts in; the
[player guide](PLAYER_GUIDE.md) describes all eleven.

## Phone and home screen

The touch controls appear on their own on a touchscreen, in portrait or
landscape, with a left-handed layout and a size slider in Settings. The game
installs as a web app from the browser's share or menu (**Add to Home
Screen** in Safari on iOS, **⋮ → Add to Home screen** in Chrome); it is a
launcher and loads from the network each time it opens. Phones start on
Medium quality.

## Requirements

A current browser with WebGL2 and hardware acceleration — Chrome, Edge,
Firefox or Safari on a desktop, laptop, phone or tablet. Settings and best
times are saved in your own browser; there is no account, no server and no
analytics, and the game loads nothing but its own files. **Quality** in
Settings is the first thing to turn down on a slow device and changes nothing
about how the wheel rides, though a lower level thins a generated town's crowd
and traffic; **Ultra** is an optional fourth level for riding
alone that wants a capable graphics chip.

## Building from source

`src/` is the game as TypeScript with its tests beside it, `tests/` the
browser suite, and `docs/` the built game GitHub Pages serves. `npm install`,
then `npm run dev` to play your working copy, `npm run typecheck`, `npm test
-- <file>` or `--group=<name>` for headless tests, `npm run test:browser --
<spec>` for browser cases (once: `npx playwright install chromium`), and
`npm run build`. The repository is a per-release snapshot of a private working
tree; [`CONTRIBUTING.md`](CONTRIBUTING.md) says how a pull request lands.

## Licence

Code is **MIT** ([`LICENSE`](LICENSE)); original game assets are
**CC BY 4.0**. The real riders' names, likenesses, logos and contributed
recordings are theirs, used here with permission, and no licence in this
project covers them. [`NOTICE.md`](NOTICE.md) lists every exclusion and every
credit.

The full player guide — riding, every mode, the riders, controls, settings
and saving — is [`PLAYER_GUIDE.md`](PLAYER_GUIDE.md). Release notes are on
the [Releases page](https://github.com/VibezZzCoder/EUC-thrills/releases).
