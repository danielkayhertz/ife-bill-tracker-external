import pathlib

files = [
    pathlib.Path(r"C:\Users\bpi\Documents\Claude Code\ife-bill-tracker-external\data\bills.json"),
    pathlib.Path(r"C:\Users\bpi\Documents\Claude Code\ife-bill-tracker-external\index.html"),
]

# Replace smart quotes / en-dashes with plain ASCII equivalents
# so GitHub Pages never garbles them regardless of encoding headers.
replacements = [
    ("\u2019", "'"),   # right single quote -> ASCII apostrophe
    ("\u2013", "-"),   # en-dash -> ASCII hyphen
]

for path in files:
    text = path.read_text(encoding="utf-8")
    count = 0
    for old, new in replacements:
        n = text.count(old)
        count += n
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")
    print(f"Patched: {path.name} ({count} replacements)")

print("Done.")
