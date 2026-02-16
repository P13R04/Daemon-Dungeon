import os
from rembg import remove

SRC = r"c:\Users\Pierre Constantin\Desktop\Daemon_Dungeon\assets\avatar_frames"
DST = r"c:\Users\Pierre Constantin\Desktop\Daemon_Dungeon\assets\avatar_frames_cutout"
EXTS = {".png", ".jpg", ".jpeg", ".webp"}

os.makedirs(DST, exist_ok=True)

files = [f for f in os.listdir(SRC) if os.path.splitext(f)[1].lower() in EXTS]
print(f"Processing {len(files)} files...")

for fname in files:
    in_path = os.path.join(SRC, fname)
    out_path = os.path.join(DST, fname)
    with open(in_path, "rb") as handle:
        data = handle.read()
    out = remove(data)
    with open(out_path, "wb") as handle:
        handle.write(out)

print("Done. Output:", DST)
