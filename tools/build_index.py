"""Build the neuron index used by the game (and later by a DNN player).

Reads gamedata/ and writes:
  neurons.js    -> window.NEURONS = [...]   (loaded by index.html; works from file://)
  neurons.json  -> same data as plain JSON (for Python / DNN tooling)

Each response array is sorted ascending, and imageNNNN.jpg is the image at that
rank, so the last files are a neuron's favourite images.

Neurons are skipped when:
  - their image count differs from their response count (we can't tell which
    images the responses belong to);
  - they are V4 or IT and their favourite images are mostly stripes/gratings.
    The game tells players that stripes mean "Lines" (V1), so a stripe-loving
    V4 ("Patterns") or IT ("Things") neuron would contradict the instructions.
    Stripe-loving V1 neurons are kept, because they match the instructions;
  - their favourite images are nearly blank (a single flat color), which gives
    the player nothing to look at.

Run from the project root:  python tools/build_index.py
"""
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "gamedata"
TOP_K = 9      # favourite images shown each round
BOTTOM_K = 6   # least-favourite images, shown as a hint / in the reveal

# Stripe filter thresholds on the median stripe score of a neuron's top images.
# Chosen by eye from contact sheets: above these, favourites are clearly
# gratings or bar stimuli; below, they are dot textures, letters or objects.
STRIPE_LIMIT = {"V4": 0.72, "IT": 0.64}
BLANK_STD = 8.0  # median grey-level std below this = nearly flat images

_WINDOW = np.outer(np.hanning(128), np.hanning(128))


def stripe_score(path):
    """Share of an image's spectral power in its 16 strongest frequencies.

    Gratings and stripes put almost all their power in one or two spatial
    frequencies, so they score near 1; natural images spread it out (~0.1-0.4).
    Also returns the grey-level std, used to spot flat, blank images.
    """
    g = np.asarray(Image.open(path).convert("L").resize((128, 128)), float)
    std = g.std()
    g = (g - g.mean()) * _WINDOW
    power = np.abs(np.fft.fftshift(np.fft.fft2(g))) ** 2
    power[62:67, 62:67] = 0  # drop DC / very low frequencies
    s = np.sort(power.ravel())[::-1]
    return s[:16].sum() / max(s.sum(), 1e-9), std


def neuron_sources():
    for region in ("IT", "V1"):
        for resp in sorted((DATA / f"{region}responses" / "tuning_curve_responses").glob("*.npy")):
            num = re.search(r"neuron(\d+)", resp.stem).group(1)
            img_dir = DATA / f"{region}images" / "tuning_curve_images" / f"images_neuron{num}"
            yield region, f"{region}_{num}", resp, img_dir
    for resp in sorted((DATA / "V4Responses").glob("*.npy")):
        key = resp.stem[len("responses_"):]          # e.g. 190923_neuron0
        yield "V4", f"V4_{key}", resp, DATA / "V4images" / f"images_{key}"


def main():
    neurons, skipped = [], []
    for region, nid, resp_path, img_dir in neuron_sources():
        r = np.load(resp_path, allow_pickle=False)
        if not img_dir.is_dir():
            skipped.append((nid, "no image folder"))
            continue
        files = sorted(p.name for p in img_dir.glob("*.jpg"))
        if len(files) != len(r):
            skipped.append((nid, f"{len(files)} images vs {len(r)} responses"))
            continue
        if not np.all(np.diff(r) >= 0):
            skipped.append((nid, "responses not sorted"))
            continue
        top = files[-TOP_K:][::-1]  # strongest first
        scores, stds = zip(*(stripe_score(img_dir / f) for f in top))
        stripes, flatness = float(np.median(scores)), float(np.median(stds))
        if region in STRIPE_LIMIT and stripes > STRIPE_LIMIT[region]:
            skipped.append((nid, f"favourites are stripes (score {stripes:.2f})"))
            continue
        if flatness < BLANK_STD:
            skipped.append((nid, f"favourites are nearly blank (std {flatness:.1f})"))
            continue

        rel = img_dir.relative_to(ROOT).as_posix()
        num = int(re.search(r"(\d+)$", nid).group(1))  # IT_4 -> 4, V4_201025_neuron77 -> 77
        session = re.search(r"_(\d{6})_neuron", nid)
        top_resp = r[-TOP_K:][::-1]
        neurons.append({
            "id": nid,
            "region": region,
            "num": num,                                   # neuron number within its file set
            "session": session.group(1) if session else None,  # V4 recording date (YYMMDD)
            "dir": rel,
            "n": len(r),
            "top": top,
            "bottom": files[:BOTTOM_K],         # weakest first
            "top_resp": [round(float(x), 3) for x in top_resp],      # matches "top"
            "bottom_resp": [round(float(x), 3) for x in r[:BOTTOM_K]],  # matches "bottom"
            "mean_top": round(float(top_resp.mean()), 3),
            "mean_all": round(float(r.mean()), 3),
            "stripe_score": round(stripes, 3),
        })

    (ROOT / "neurons.json").write_text(json.dumps(neurons, indent=1))
    (ROOT / "neurons.js").write_text("window.NEURONS = " + json.dumps(neurons) + ";\n")

    counts = {g: sum(n["region"] == g for n in neurons) for g in ("V1", "V4", "IT")}
    print(f"wrote {len(neurons)} neurons {counts}; skipped {len(skipped)}")
    reasons = {}
    for nid, why in skipped:
        reasons.setdefault(f"{nid.split('_')[0]} {why.split(' (')[0]}", []).append(nid)
    for why, ids in reasons.items():
        print(f"  {len(ids):3d}  {why}")


if __name__ == "__main__":
    main()
