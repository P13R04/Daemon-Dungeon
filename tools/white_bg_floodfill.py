import os
from collections import deque
from PIL import Image

SRC = r"c:\Users\Pierre Constantin\Desktop\Daemon_Dungeon\assets\avatar_frames"
DST = r"c:\Users\Pierre Constantin\Desktop\Daemon_Dungeon\assets\avatar_frames_cutout2"
EXTS = {".png", ".jpg", ".jpeg", ".webp"}

# Tolerances for "near white" (0-255). Higher = more aggressive removal.
# - BG: remove more outer white
# - FRINGE: clean white halo along edges
# - HOLES: remove small interior white regions (e.g., inside horns)
TOL_BG = 135
TOL_FRINGE = 100
TOL_HOLES = 55
HOLE_MAX_AREA_RATIO = 0.06

# Per-file overrides for stubborn frames.
OVERRIDES = {
    "supérieur_03.png": {
        "TOL_BG": 140,
        "TOL_FRINGE": 110,
        "TOL_HOLES": 50,
        "HOLE_MAX_AREA_RATIO": 0.06,
    },
}

os.makedirs(DST, exist_ok=True)

files = [f for f in os.listdir(SRC) if os.path.splitext(f)[1].lower() in EXTS]
print(f"Processing {len(files)} files...")


def is_near_white(r, g, b, tol):
    return r >= 255 - tol and g >= 255 - tol and b >= 255 - tol


def flood_fill_bg(img, tol_bg):
    w, h = img.size
    rgba = img.convert("RGBA")
    px = rgba.load()

    visited = [[False] * h for _ in range(w)]
    q = deque()

    # Seed from borders only, so interior whites are preserved
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))

    while q:
        x, y = q.popleft()
        if x < 0 or x >= w or y < 0 or y >= h or visited[x][y]:
            continue
        visited[x][y] = True

        r, g, b, a = px[x, y]
        if is_near_white(r, g, b, tol_bg):
            # Mark background as transparent
            px[x, y] = (r, g, b, 0)
            # Continue flood fill
            q.append((x + 1, y))
            q.append((x - 1, y))
            q.append((x, y + 1))
            q.append((x, y - 1))
            q.append((x + 1, y + 1))
            q.append((x - 1, y + 1))
            q.append((x + 1, y - 1))
            q.append((x - 1, y - 1))

    return rgba


def remove_white_fringe(rgba, tol_fringe):
    w, h = rgba.size
    px = rgba.load()

    def has_transparent_neighbor(x, y):
        for nx, ny in (
            (x - 1, y),
            (x + 1, y),
            (x, y - 1),
            (x, y + 1),
            (x - 1, y - 1),
            (x + 1, y - 1),
            (x - 1, y + 1),
            (x + 1, y + 1),
        ):
            if 0 <= nx < w and 0 <= ny < h:
                if px[nx, ny][3] == 0:
                    return True
        return False

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0 and is_near_white(r, g, b, tol_fringe) and has_transparent_neighbor(x, y):
                px[x, y] = (r, g, b, 0)

    return rgba


def remove_white_holes(rgba, tol_holes, hole_max_area_ratio):
    w, h = rgba.size
    px = rgba.load()
    visited = [[False] * h for _ in range(w)]
    max_area = int(w * h * hole_max_area_ratio)

    for y in range(h):
        for x in range(w):
            if visited[x][y]:
                continue
            r, g, b, a = px[x, y]
            if a == 0 or not is_near_white(r, g, b, tol_holes):
                continue

            # Flood fill this white component
            q = deque([(x, y)])
            component = []
            touches_border = False
            visited[x][y] = True

            while q:
                cx, cy = q.popleft()
                component.append((cx, cy))
                if cx == 0 or cy == 0 or cx == w - 1 or cy == h - 1:
                    touches_border = True

                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
                        rr, gg, bb, aa = px[nx, ny]
                        if aa > 0 and is_near_white(rr, gg, bb, tol_holes):
                            visited[nx][ny] = True
                            q.append((nx, ny))

            if not touches_border and len(component) <= max_area:
                for cx, cy in component:
                    rr, gg, bb, aa = px[cx, cy]
                    px[cx, cy] = (rr, gg, bb, 0)

    return rgba


for fname in files:
    in_path = os.path.join(SRC, fname)
    out_path = os.path.join(DST, fname)
    overrides = OVERRIDES.get(fname, {})
    tol_bg = overrides.get("TOL_BG", TOL_BG)
    tol_fringe = overrides.get("TOL_FRINGE", TOL_FRINGE)
    tol_holes = overrides.get("TOL_HOLES", TOL_HOLES)
    hole_ratio = overrides.get("HOLE_MAX_AREA_RATIO", HOLE_MAX_AREA_RATIO)
    img = Image.open(in_path)
    out = flood_fill_bg(img, tol_bg)
    out = remove_white_fringe(out, tol_fringe)
    out = remove_white_holes(out, tol_holes, hole_ratio)
    out.save(out_path)

print("Done. Output:", DST)
