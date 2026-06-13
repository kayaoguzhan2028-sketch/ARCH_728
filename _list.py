import os

base = r"c:\Users\ozika\Local Sites\arch728\app\public\wp-content\themes\arch728\standalone\2026-images\2026-p8\svg"

for root, dirs, files in os.walk(base):
    rel = os.path.relpath(root, base)
    print("DIR:", rel.encode('unicode_escape').decode())
    for f in files:
        print("  FILE:", f.encode('unicode_escape').decode())
