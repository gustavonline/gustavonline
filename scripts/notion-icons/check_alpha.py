"""Read-only alpha inspection of the rounded blue tiles; never edits pixels."""
from collections import Counter
import json
import struct
import sys
import zlib
from pathlib import Path


def inspect(path):
    blob = Path(path).read_bytes()
    pos, compressed = 8, bytearray()
    while pos < len(blob):
        size = struct.unpack('>I', blob[pos:pos + 4])[0]
        kind, data = blob[pos + 4:pos + 8], blob[pos + 8:pos + 8 + size]
        pos += size + 12
        if kind == b'IHDR':
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', data)
        if kind == b'IDAT':
            compressed.extend(data)
    assert depth == 8 and color in (2, 6) and interlace == 0
    channels = 4 if color == 6 else 3
    stride = width * channels
    raw = zlib.decompress(compressed)
    previous = bytearray(stride)
    alpha_min, alpha_max, interior_count = 255, 0, 0
    outside_transparent = 0
    colors = Counter()
    for y in range(height):
        offset = y * (stride + 1)
        method, row = raw[offset], bytearray(raw[offset + 1:offset + stride + 1])
        for i in range(stride):
            left = row[i - channels] if i >= channels else 0
            up = previous[i]
            upper_left = previous[i - channels] if i >= channels else 0
            if method == 1:
                row[i] = (row[i] + left) & 255
            elif method == 2:
                row[i] = (row[i] + up) & 255
            elif method == 3:
                row[i] = (row[i] + ((left + up) // 2)) & 255
            elif method == 4:
                p = left + up - upper_left
                distances = [abs(p - left), abs(p - up), abs(p - upper_left)]
                prediction = [left, up, upper_left][distances.index(min(distances))]
                row[i] = (row[i] + prediction) & 255
            else:
                assert method == 0
        for x in range(width):
            alpha = row[x * channels + 3] if channels == 4 else 255
            # Broad interior rectangle spans the areas where the bad variants
            # had holes. Rounded external corners intentionally stay excluded.
            if width * .15 <= x < width * .85 and height * .15 <= y < height * .85:
                alpha_min = min(alpha_min, alpha)
                alpha_max = max(alpha_max, alpha)
                interior_count += 1
                colors[tuple(row[x * channels:x * channels + 3])] += 1
            if (x < width * .01 or x > width * .99) and (y < height * .01 or y > height * .99) and alpha == 0:
                outside_transparent += 1
        previous = row
    return dict(path=str(path), width=width, height=height, interior_samples=interior_count,
                interior_alpha_min=alpha_min, interior_alpha_max=alpha_max,
                transparent_corner_samples=outside_transparent, dominant_colors=colors.most_common(2),
                ok=alpha_min == 255 and outside_transparent > 0)


if __name__ == '__main__':
    results = [inspect(p) for p in sys.argv[1:]]
    print(json.dumps(results, indent=2))
    sys.exit(0 if results and all(r['ok'] for r in results) else 1)
