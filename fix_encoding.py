import pathlib

files = [
    pathlib.Path(r"C:\Users\bpi\Documents\Claude Code\ife-bill-tracker-external\data\bills.json"),
    pathlib.Path(r"C:\Users\bpi\Documents\Claude Code\ife-bill-tracker-external\index.html"),
]

replacements = [
    ("person\ufffds prison",                  "person\u2019s prison"),
    ("Illinois\ufffd felony",                 "Illinois\u2019 felony"),
    ("8\ufffd40",                             "8\u201340"),
    ("16\ufffd80",                            "16\u201380"),
    ("person\ufffds actual",                  "person\u2019s actual"),
    ("Illinois\ufffd criminal code.\ufffd",   "Illinois\u2019 criminal code."),
    ("proportionately.\ufffd",                "proportionately."),
    ("aren\ufffdt",                           "aren\u2019t"),
    ("law\ufffds",                            "law\u2019s"),
]

for path in files:
    text = path.read_text(encoding="utf-8")
    for old, new in replacements:
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")
    print(f"Patched: {path.name}")

print("Done.")
