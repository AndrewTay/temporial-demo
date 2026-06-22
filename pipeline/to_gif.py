"""
Make a looping GIF from a rendered clip.  Input may be an .mp4 (read via imageio-ffmpeg)
or a directory of *.png frames.  Run with the A4D venv python (has imageio + PIL):

    A4D/.venv/Scripts/python.exe site/to_gif.py IN.mp4 OUT.gif [fps] [width]

Used by the demo server to turn an ActionMesh M5 clip into the GIF deliverable.
"""
import sys, os, glob
from PIL import Image


def load_frames(src):
    if os.path.isdir(src):
        for p in sorted(glob.glob(os.path.join(src, "*.png"))):
            yield Image.open(p).convert("RGB")
    else:
        import imageio.v2 as imageio
        rdr = imageio.get_reader(src)
        for fr in rdr:
            yield Image.fromarray(fr).convert("RGB")
        rdr.close()


def main():
    src = sys.argv[1]
    out = sys.argv[2]
    fps = float(sys.argv[3]) if len(sys.argv) > 3 else 15.0
    width = int(sys.argv[4]) if len(sys.argv) > 4 else 380

    frames = []
    for im in load_frames(src):
        if im.width != width:
            h = round(im.height * width / im.width)
            im = im.resize((width, h), Image.LANCZOS)
        # adaptive palette per frame keeps the textured coat readable
        frames.append(im.convert("P", palette=Image.ADAPTIVE, colors=256))
    if not frames:
        raise SystemExit(f"no frames in {src}")

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    frames[0].save(
        out, save_all=True, append_images=frames[1:],
        duration=int(1000 / fps), loop=0, optimize=True, disposal=2,
    )
    print(f"GIF {out}  ({len(frames)} frames, {width}px, {fps:g}fps, {os.path.getsize(out)//1024} KB)")


if __name__ == "__main__":
    main()
