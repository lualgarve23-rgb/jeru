#!/usr/bin/env python3
# Regenera os vídeos narrados do tour a partir dos slides dos HTMLs:
# edge-tts (pt-BR-AntonioNeural) por slide + ffmpeg (imagem estática pela
# duração da narração + respiro), concatenados em mp4 1600x1000 h264/aac.
import re, json, subprocess, tempfile, os, sys

BASE = "/home/ubuntu/jeruteste/gestao-loja/public/tour"
TOURS = ["obreiro", "secretario", "veneravel", "tesoureiro", "extras-secretaria"]
if len(sys.argv) > 1:
    TOURS = sys.argv[1:]
VOICE = "pt-BR-AntonioNeural"
PAUSA = 0.8  # respiro após cada narração


def dur(f):
    out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", f], capture_output=True, text=True)
    return float(out.stdout.strip())


for tour in TOURS:
    html = open(f"{BASE}/{tour}.html").read()
    slides = json.loads(re.search(r"const slides=(\[.*?\]);", html, re.S).group(1))
    with tempfile.TemporaryDirectory() as tmp:
        segs = []
        for i, sl in enumerate(slides):
            mp3 = f"{tmp}/{i}.mp3"
            texto = f"{sl['t']}. {sl['l']}"
            subprocess.run(["edge-tts", "--voice", VOICE, "--text", texto,
                            "--write-media", mp3], check=True,
                           capture_output=True)
            t = dur(mp3) + PAUSA
            seg = f"{tmp}/{i}.mp4"
            subprocess.run([
                "ffmpeg", "-y", "-loop", "1", "-i", f"{BASE}/{sl['img']}",
                "-i", mp3, "-t", f"{t:.2f}",
                "-vf", "scale=1600:1000,format=yuv420p", "-r", "30",
                "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                "-af", "apad", "-c:a", "aac", "-b:a", "128k",
                seg], check=True, capture_output=True)
            segs.append(seg)
        lista = f"{tmp}/lista.txt"
        with open(lista, "w") as f:
            for s in segs:
                f.write(f"file '{s}'\n")
        out = f"{BASE}/video/{tour}.mp4"
        subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0",
                        "-i", lista, "-c", "copy", out],
                       check=True, capture_output=True)
        print(tour, f"{dur(out):.1f}s", len(slides), "slides")
print("ok")
