import os
import math
from PIL import Image, ImageDraw

def create_app_icon(size=512):
    # Create RGBA canvas
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Padding and squircle coordinates
    pad = int(size * 0.08)
    x0, y0 = pad, pad
    x1, y1 = size - pad, size - pad
    radius = int(size * 0.22)

    # Gradient background: Cyan (#06b6d4) to Blue (#2563eb)
    # We will draw a gradient inside the rounded rectangle mask
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=255)

    gradient = Image.new("RGBA", (size, size))
    c_start = (6, 182, 212)   # Cyan #06b6d4
    c_end = (37, 99, 235)     # Blue #2563eb

    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            r = int(c_start[0] * (1 - t) + c_end[0] * t)
            g = int(c_start[1] * (1 - t) + c_end[1] * t)
            b = int(c_start[2] * (1 - t) + c_end[2] * t)
            gradient.putpixel((x, y), (r, g, b, 255))

    img.paste(gradient, (0, 0), mask)

    # Draw the Pulse / Activity wave in dark navy/black (#090d16)
    draw_wave = ImageDraw.Draw(img)
    stroke_width = max(4, int(size * 0.065))
    wave_color = (9, 13, 22, 255) # Dark slate

    # Pulse wave points relative to size
    # Start on left, small step, pulse spike up, spike down, recover, line to right
    cx = size / 2
    cy = size / 2
    w_width = size * 0.52

    left_x = cx - w_width / 2
    right_x = cx + w_width / 2

    # Control points
    p1 = (left_x, cy)
    p2 = (cx - w_width * 0.25, cy)
    p3 = (cx - w_width * 0.12, cy - size * 0.18) # Peak up
    p4 = (cx + w_width * 0.08, cy + size * 0.20) # Valley down
    p5 = (cx + w_width * 0.22, cy)
    p6 = (right_x, cy)

    points = [p1, p2, p3, p4, p5, p6]
    for i in range(len(points) - 1):
        draw_wave.line([points[i], points[i+1]], fill=wave_color, width=stroke_width, joint="curve")

    # Round endpoints
    r_cap = stroke_width / 2
    for pt in [p1, p6]:
        draw_wave.ellipse([pt[0] - r_cap, pt[1] - r_cap, pt[0] + r_cap, pt[1] + r_cap], fill=wave_color)

    return img

def main():
    icon_512 = create_app_icon(512)
    
    out_dir = r"d:\projects\pc-checker\src-tauri\icons"
    os.makedirs(out_dir, exist_ok=True)
    
    # Save standard PNG sizes
    icon_512.save(os.path.join(out_dir, "icon.png"), "PNG")
    icon_512.resize((128, 128), Image.Resampling.LANCZOS).save(os.path.join(out_dir, "128x128.png"), "PNG")
    icon_512.resize((256, 256), Image.Resampling.LANCZOS).save(os.path.join(out_dir, "128x128@2x.png"), "PNG")
    icon_512.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(out_dir, "32x32.png"), "PNG")
    
    # Save multi-size ICO for Windows
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    icon_512.save(os.path.join(out_dir, "icon.ico"), format="ICO", sizes=ico_sizes)
    
    # Also save to public for web
    pub_dir = r"d:\projects\pc-checker\public"
    os.makedirs(pub_dir, exist_ok=True)
    icon_512.resize((64, 64), Image.Resampling.LANCZOS).save(os.path.join(pub_dir, "app-icon.png"), "PNG")
    icon_512.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(pub_dir, "favicon.ico"), format="ICO")
    print("Icons successfully generated!")

if __name__ == "__main__":
    main()
