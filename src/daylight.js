// Time-of-day model shared by the gallery (water + sky) and the studio (window light).
// Everything is a pure function of the hour (0..24), so the light changes continuously like a real day:
// night -> dawn glow -> day -> golden dusk -> night, with no switch between "modes".
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export function hoursNow() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 + d.getMilliseconds() / 3.6e6;
}

export function formatHours(h) {
  const t = ((h % 24) + 24) % 24;
  const hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

const NIGHT_H = [0.05, 0.08, 0.2], DAY_H = [0.96, 0.84, 0.7], DUSK_H = [1.0, 0.56, 0.36];
const NIGHT_Z = [0.01, 0.02, 0.07], DAY_Z = [0.5, 0.72, 0.9], TWI_Z = [0.36, 0.34, 0.6];
const NIGHT_D = [0.01, 0.05, 0.14], DAY_D = [0.04, 0.33, 0.52], TWI_D = [0.12, 0.17, 0.3];
const NIGHT_S = [0.03, 0.11, 0.24], DAY_S = [0.18, 0.62, 0.76], TWI_S = [0.34, 0.4, 0.5];
const SUN_C = [1.0, 0.88, 0.66], SUNSET_C = [1.0, 0.58, 0.32], MOON_C = [0.62, 0.72, 1.0];

export function skyAt(tod) {
  const a = ((tod - 6) / 24) * TAU; // 06:00 sunrise, 12:00 noon, 18:00 sunset
  const elev = Math.sin(a);
  const day = smooth(-0.12, 0.2, elev);
  const twi = Math.exp(-Math.pow(elev / 0.22, 2)); // warm glow close to the horizon, dawn and dusk
  const sunDir = norm([Math.cos(a) * 0.9, elev * 0.55 + 0.02, -0.55]);
  const moonDir = norm([-Math.cos(a) * 0.9, -elev * 0.55 + 0.02, -0.55]);

  let horizon = mix(NIGHT_H, DAY_H, day);
  horizon = mix(horizon, DUSK_H, twi * 0.8);
  let zenith = mix(NIGHT_Z, DAY_Z, day);
  zenith = mix(zenith, TWI_Z, twi * 0.55);
  let deep = mix(NIGHT_D, DAY_D, day);
  deep = mix(deep, TWI_D, twi * 0.3);
  let shallow = mix(NIGHT_S, DAY_S, day);
  shallow = mix(shallow, TWI_S, twi * 0.3);
  const sunCol = mix(SUN_C, SUNSET_C, twi);
  const lightCol = mix(MOON_C, sunCol, day);
  const lightDir = norm(mix(moonDir, sunDir, day));

  return {
    tod, elev, day, twi, sunDir, moonDir, horizon, zenith, deep, shallow, lightCol, lightDir,
    hemiSky: mix([0.11, 0.16, 0.33], [0.81, 0.9, 1.0], day),
    hemiGround: mix([0.04, 0.16, 0.29], [0.18, 0.56, 0.69], day),
    night: 1 - day
  };
}

// Moves the clock `tod` towards `target` (hours) at `speed` hours per second, always forward in time
// (so "night" is reached through dusk, and "day" through dawn), never jumping.
export function advanceClock(tod, target, dt, speed) {
  let f = (((target - tod) % 24) + 24) % 24; // forward distance 0..24
  if (f > 23.95) f = 0; // we are just a hair ahead of the target
  if (f < 1e-4) return target;
  return (tod + Math.min(f, speed * dt)) % 24;
}
