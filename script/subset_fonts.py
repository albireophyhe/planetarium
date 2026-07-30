#!/usr/bin/env python3
"""Build or verify renamed, app-specific IBM Plex Sans JP WOFF2 subsets.

IBM Plex uses the Reserved Font Name "Plex". Subsetting creates a Modified
Version under the SIL Open Font License, so the generated family is renamed
to "Planetarium Sans JP". The original copyright and license name records
remain in the font.

The reference environment is pinned in script/requirements-fonts.txt.
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
import unicodedata
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from tempfile import TemporaryDirectory

try:
    from fontTools import subset
    from fontTools.ttLib import TTFont
except ImportError as error:
    raise SystemExit(
        "Font build dependencies are missing. Create a Python 3.12.3 virtual "
        "environment and run `python -m pip install --requirement "
        "script/requirements-fonts.txt`."
    ) from error


TEXT_EXTENSIONS = {
    ".css",
    ".html",
    ".json",
    ".ts",
    ".tsx",
    ".webmanifest",
}

# Test and benchmark copy is not shipped to browsers. Including it in the
# glyph inventory silently grows both production font weights whenever an
# assertion gains new Japanese wording.
NON_RUNTIME_SOURCE_SUFFIXES = (
    ".bench.ts",
    ".bench.tsx",
    ".test.ts",
    ".test.tsx",
)

EXPECTED_PYTHON = (3, 12, 3)
EXPECTED_TOOL_VERSIONS = {
    "fonttools": "4.59.0",
    "Brotli": "1.2.0",
    "zopfli": "0.4.3",
}
FAMILY_NAME = "Planetarium Sans JP"
COMPACT_FAMILY_NAME = "PlanetariumSansJP"
FONT_ASSET_ROOT = Path("apps/web/src/assets/fonts")
FONT_GROUPS = {
    "Base": {
        "asset_prefix": "PlanetariumSansJP",
        "asset_url_prefix": "../assets/fonts",
        "description": "initial UI and catalogs",
        "stylesheet": Path("apps/web/src/styles/index.css"),
    },
    "Event": {
        "asset_prefix": "PlanetariumSansJP-Event",
        "asset_url_prefix": "../../assets/fonts",
        "description": "lazy event-only supplement",
        "stylesheet": Path(
            "apps/web/src/features/events/EventExplorer.css"
        ),
    },
    "Help": {
        "asset_prefix": "PlanetariumSansJP-Help",
        "asset_url_prefix": "../../assets/fonts",
        "description": "lazy help-only supplement",
        "stylesheet": Path(
            "apps/web/src/features/help/HelpDialog.css"
        ),
    },
}
PRESERVED_METADATA_NAME_IDS = {
    0,   # copyright
    5,   # upstream version
    7,   # trademark
    8,   # manufacturer
    9,   # designers
    11,  # vendor URL
    12,  # designer URL
    13,  # license description
    14,  # license URL
}
PRIMARY_NAME_IDS = {1, 3, 4, 6, 16, 20}

# IBM Plex Sans JP does not contain these codepoints. They intentionally fall
# through the CSS font stack instead of silently disappearing from the UI.
KNOWN_FALLBACK_CODEPOINTS = {
    0x1D45,  # MODIFIER LETTER SMALL ALPHA
    0x2212,  # MINUS SIGN
}

WEIGHTS = {
    "Regular": {
        "source": "IBMPlexSansJP-Regular.woff2",
        "subfamily": "Regular",
        "weight_class": 400,
    },
    "SemiBold": {
        "source": "IBMPlexSansJP-SemiBold.woff2",
        "subfamily": "SemiBold",
        "weight_class": 600,
    },
}


def validate_environment() -> list[str]:
    errors = []
    if sys.version_info[:3] != EXPECTED_PYTHON:
        errors.append(
            "Python "
            f"{'.'.join(map(str, EXPECTED_PYTHON))} is required; found "
            f"{sys.version.split()[0]}"
        )
    for package, expected in EXPECTED_TOOL_VERSIONS.items():
        try:
            actual = version(package)
        except PackageNotFoundError:
            errors.append(f"{package} {expected} is not installed")
            continue
        if actual != expected:
            errors.append(
                f"{package} {expected} is required; found {actual}"
            )
    return errors


def is_runtime_text_file(project_root: Path, path: Path) -> bool:
    return (
        path.is_file()
        and path.suffix in TEXT_EXTENSIONS
        and not path.name.endswith(NON_RUNTIME_SOURCE_SUFFIXES)
        and "test" not in path.relative_to(project_root).parts
    )


def characters_from_paths(
    project_root: Path,
    paths: list[Path],
) -> set[int]:
    codepoints = set()
    for path in sorted(set(paths)):
        if not is_runtime_text_file(project_root, path):
            continue
        for character in path.read_text(encoding="utf-8"):
            codepoint = ord(character)
            if codepoint >= 0x20 and codepoint not in {0x7F, 0xFEFF}:
                codepoints.add(codepoint)
    return codepoints


def source_character_inventories(
    project_root: Path,
) -> dict[str, set[int]]:
    web_source_root = project_root / "apps/web/src"
    event_source_roots = [
        web_source_root / "domain/events",
        web_source_root / "features/events",
    ]
    help_source_roots = [
        web_source_root / "features/help",
    ]
    lazy_source_roots = event_source_roots + help_source_roots

    def is_lazy_source(path: Path) -> bool:
        return any(root in path.parents for root in lazy_source_roots)

    base_paths = [
        project_root / "apps/web/index.html",
        project_root / "apps/web/public/manifest.webmanifest",
    ]
    base_paths.extend(
        path
        for path in web_source_root.rglob("*")
        if not is_lazy_source(path)
    )
    base_paths.extend((project_root / "shared/catalog").rglob("*"))

    event_paths = []
    for root in event_source_roots:
        event_paths.extend(root.rglob("*"))
    # Candidate data contains localized target labels which are rendered by
    # the lazy event explorer, so it participates in the event coverage
    # contract even though Vite distributes it outside the JavaScript graph.
    event_paths.extend((project_root / "shared/events").rglob("*"))
    help_paths = []
    for root in help_source_roots:
        help_paths.extend(root.rglob("*"))

    base_codepoints = set(range(0x20, 0x7F))
    base_codepoints.update(
        characters_from_paths(project_root, base_paths)
    )
    all_event_codepoints = characters_from_paths(
        project_root,
        event_paths,
    )
    all_help_codepoints = characters_from_paths(
        project_root,
        help_paths,
    )
    # Separate lazy features must each carry glyphs they share with one
    # another because opening either feature cannot depend on the other's CSS.
    # Both remain disjoint from the initial base inventory.
    event_only_codepoints = all_event_codepoints - base_codepoints
    help_only_codepoints = all_help_codepoints - base_codepoints
    return {
        "Base": base_codepoints,
        "Event": event_only_codepoints,
        "Help": help_only_codepoints,
    }


def name_values(font: TTFont, name_id: int) -> set[str]:
    values = set()
    for record in font["name"].names:
        if record.nameID != name_id:
            continue
        try:
            values.add(record.toUnicode())
        except UnicodeDecodeError:
            continue
    return values


def set_name(record, value: str) -> None:
    if record.isUnicode():
        record.string = value.encode("utf-16-be")
    else:
        record.string = value.encode("mac_roman", errors="replace")


def rename_font(font: TTFont, subfamily: str) -> None:
    full_name = (
        FAMILY_NAME
        if subfamily == "Regular"
        else f"{FAMILY_NAME} {subfamily}"
    )
    postscript_name = f"{COMPACT_FAMILY_NAME}-{subfamily}"
    source_version = next(
        iter(sorted(name_values(font, 5))),
        "Version unknown",
    )
    source_cid_name = next(
        iter(sorted(name_values(font, 20))),
        postscript_name,
    )
    cid_name = source_cid_name.replace(
        "IBMPlexSansJP",
        COMPACT_FAMILY_NAME,
    )
    if "plex" in cid_name.casefold():
        cid_name = postscript_name
    replacements = {
        1: FAMILY_NAME,
        2: subfamily,
        3: f"Planetarium;{postscript_name};{source_version};Modified",
        4: full_name,
        6: postscript_name,
        16: FAMILY_NAME,
        17: subfamily,
        # PostScript CID findfont name. It is a technical font identifier and
        # must not retain the upstream Reserved Font Name.
        20: cid_name,
    }

    for record in font["name"].names:
        replacement = replacements.get(record.nameID)
        if replacement is not None:
            set_name(record, replacement)


def build_subset(
    source: Path,
    destination: Path,
    codepoints: set[int],
    subfamily: str,
) -> None:
    options = subset.Options()
    options.canonical_order = True
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.name_legacy = True
    options.notdef_outline = True
    # FontTools cannot subset the source's informational `meta` table
    # (`dlng: ja`) and otherwise emits a warning before dropping it.
    options.drop_tables.append("meta")
    options.recalc_average_width = True
    options.recalc_bounds = True
    options.recalc_timestamp = False

    font = subset.load_font(str(source), options)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=sorted(codepoints))
    subsetter.subset(font)
    # Layout closure can retain a second Unicode mapping for a glyph needed
    # by the requested inventory (for example U+2039 alongside U+203A).
    # Prune those aliases so each generated face's declared unicode-range
    # remains an exact, non-overlapping description of its cmap.
    for cmap_table in font["cmap"].tables:
        cmap_table.cmap = {
            codepoint: glyph_name
            for codepoint, glyph_name in cmap_table.cmap.items()
            if codepoint in codepoints
        }
    rename_font(font, subfamily)
    destination.parent.mkdir(parents=True, exist_ok=True)
    subset.save_font(font, str(destination), options)


def validate_license(project_root: Path) -> list[str]:
    package_license = (
        project_root / "node_modules/@ibm/plex-sans-jp/LICENSE.txt"
    )
    distributed_license = (
        project_root
        / "apps/web/public/licenses/IBM-Plex-Sans-JP-OFL-1.1.txt"
    )
    errors = []
    for path in [package_license, distributed_license]:
        if not path.exists():
            errors.append(f"missing license file: {path}")
    if errors:
        return errors

    upstream = " ".join(
        package_license.read_text(encoding="utf-8").split()
    )
    distributed = " ".join(
        distributed_license.read_text(encoding="utf-8").split()
    )
    if upstream != distributed:
        errors.append(
            "distributed IBM Plex Sans JP license does not match the "
            "installed package license"
        )
    if 'Reserved Font Name "Plex"' not in distributed:
        errors.append(
            'distributed license must preserve Reserved Font Name "Plex"'
        )
    return errors


def validate_dependency(project_root: Path) -> list[str]:
    package_path = project_root / "apps/web/package.json"
    installed_path = (
        project_root / "node_modules/@ibm/plex-sans-jp/package.json"
    )
    errors = []
    try:
        package = json.loads(package_path.read_text(encoding="utf-8"))
        installed = json.loads(installed_path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        return [f"missing font dependency metadata: {error.filename}"]

    declared = package.get("devDependencies", {}).get(
        "@ibm/plex-sans-jp"
    )
    installed_version = installed.get("version")
    if declared != "3.0.0":
        errors.append(
            "@ibm/plex-sans-jp must be pinned exactly to 3.0.0 in "
            "apps/web/package.json"
        )
    if installed_version != declared:
        errors.append(
            "@ibm/plex-sans-jp installed version does not match the "
            f"declared version ({installed_version!r} != {declared!r})"
        )
    return errors


def font_block_markers(group: str) -> tuple[str, str]:
    identifier = group.casefold()
    return (
        f"/* planetarium-fonts:{identifier}:start */",
        f"/* planetarium-fonts:{identifier}:end */",
    )


def validate_css_marker_contract(project_root: Path) -> list[str]:
    errors = []
    for group, metadata in FONT_GROUPS.items():
        relative_path = metadata["stylesheet"]
        stylesheet_path = project_root / relative_path
        try:
            stylesheet = stylesheet_path.read_text(encoding="utf-8")
        except FileNotFoundError:
            errors.append(f"missing font stylesheet: {stylesheet_path}")
            continue
        start_marker, end_marker = font_block_markers(group)
        if stylesheet.splitlines()[:1] != [start_marker]:
            errors.append(
                f"{relative_path} must begin with {start_marker!r}"
            )
        if stylesheet.count(start_marker) != 1:
            errors.append(
                f"{relative_path} must contain exactly one "
                f"{start_marker!r}"
            )
        if stylesheet.count(end_marker) != 1:
            errors.append(
                f"{relative_path} must contain exactly one "
                f"{end_marker!r}"
            )
    return errors


def compact_unicode_ranges(codepoints: set[int]) -> list[str]:
    if not codepoints:
        return []
    ordered = sorted(codepoints)
    ranges = []
    start = previous = ordered[0]
    for codepoint in ordered[1:]:
        if codepoint == previous + 1:
            previous = codepoint
            continue
        ranges.append((start, previous))
        start = previous = codepoint
    ranges.append((start, previous))
    return [
        (
            f"U+{start:04X}"
            if start == end
            else f"U+{start:04X}-{end:04X}"
        )
        for start, end in ranges
    ]


def format_unicode_range_declaration(codepoints: set[int]) -> str:
    tokens = compact_unicode_ranges(codepoints)
    if not tokens:
        raise ValueError("a font face must cover at least one codepoint")
    lines = []
    current = "    "
    for index, token in enumerate(tokens):
        suffix = ";" if index == len(tokens) - 1 else ","
        item = f"{token}{suffix}"
        separator = "" if current == "    " else " "
        if len(current) + len(separator) + len(item) > 78:
            lines.append(current)
            current = f"    {item}"
        else:
            current += f"{separator}{item}"
    lines.append(current)
    return "\n".join(lines)


def font_stylesheet_block(
    group: str,
    supported_codepoints: set[int],
) -> str:
    metadata = FONT_GROUPS[group]
    start_marker, end_marker = font_block_markers(group)
    unicode_range = format_unicode_range_declaration(
        supported_codepoints
    )
    blocks = [
        start_marker,
        "/* Generated by script/subset_fonts.py. Do not edit. */",
    ]
    for weight, weight_metadata in WEIGHTS.items():
        filename = f"{metadata['asset_prefix']}-{weight}.woff2"
        blocks.append(
            "\n".join(
                [
                    "@font-face {",
                    "  font-display: swap;",
                    f'  font-family: "{FAMILY_NAME}";',
                    "  font-style: normal;",
                    (
                        "  font-weight: "
                        f"{weight_metadata['weight_class']};"
                    ),
                    (
                        f'  src: url("{metadata["asset_url_prefix"]}/'
                        f'{filename}") format("woff2");'
                    ),
                    "  unicode-range:",
                    unicode_range,
                    "}",
                ]
            )
        )
    blocks.append(end_marker)
    return "\n\n".join(blocks) + "\n"


def extract_font_stylesheet_block(
    stylesheet: str,
    group: str,
) -> str | None:
    start_marker, end_marker = font_block_markers(group)
    match = re.search(
        re.escape(start_marker)
        + r".*?"
        + re.escape(end_marker)
        + r"\n?",
        stylesheet,
        flags=re.DOTALL,
    )
    return match.group(0) if match else None


def write_font_stylesheet_block(
    stylesheet_path: Path,
    group: str,
    supported_codepoints: set[int],
) -> None:
    stylesheet = stylesheet_path.read_text(encoding="utf-8")
    current_block = extract_font_stylesheet_block(stylesheet, group)
    if current_block is None:
        raise ValueError(
            f"{stylesheet_path} is missing generated font markers"
        )
    expected_block = font_stylesheet_block(
        group,
        supported_codepoints,
    )
    stylesheet_path.write_text(
        stylesheet.replace(current_block, expected_block, 1),
        encoding="utf-8",
    )


def validate_font_stylesheet_block(
    stylesheet_path: Path,
    group: str,
    supported_codepoints: set[int],
) -> list[str]:
    try:
        stylesheet = stylesheet_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return [f"missing generated font stylesheet: {stylesheet_path}"]

    errors = []
    expected_block = font_stylesheet_block(group, supported_codepoints)
    actual_block = extract_font_stylesheet_block(stylesheet, group)
    if actual_block != expected_block:
        errors.append(
            f"{stylesheet_path} does not contain the exact generated CSS "
            f"block for "
            f"the {group.lower()} glyph inventory"
        )
    face_blocks = re.findall(
        r"@font-face\s*\{(?P<body>[^}]*)\}",
        actual_block or "",
        flags=re.DOTALL,
    )
    if len(face_blocks) != len(WEIGHTS):
        errors.append(
            f"{stylesheet_path.name} must contain exactly "
            f"{len(WEIGHTS)} @font-face blocks"
        )
    for weight, metadata in WEIGHTS.items():
        filename = (
            f"{FONT_GROUPS[group]['asset_prefix']}-{weight}.woff2"
        )
        matching = [
            block for block in face_blocks if filename in block
        ]
        if len(matching) != 1:
            errors.append(
                f"CSS must contain exactly one @font-face for {filename}"
            )
            continue
        block = matching[0]
        requirements = [
            f'font-family: "{FAMILY_NAME}"',
            "font-display: swap",
            "font-style: normal",
            f"font-weight: {metadata['weight_class']}",
            (
                f'url("{FONT_GROUPS[group]["asset_url_prefix"]}/'
                f'{filename}")'
            ),
            "unicode-range:",
        ]
        for requirement in requirements:
            if requirement not in block:
                errors.append(
                    f"{filename} @font-face is missing {requirement!r}"
                )
    return errors


def validate_font(
    source_path: Path,
    generated_path: Path,
    codepoints: set[int],
    font_label: str,
    subfamily: str,
    weight_class: int,
    budget: dict,
) -> tuple[list[str], set[int], set[int]]:
    errors = []
    source_font = TTFont(source_path)
    generated_font = TTFont(generated_path)
    source_cmap = set(source_font.getBestCmap())
    generated_cmap = set(generated_font.getBestCmap())
    expected_cmap = codepoints & source_cmap
    unsupported = codepoints - source_cmap

    missing_supported = expected_cmap - generated_cmap
    unexpected_codepoints = generated_cmap - expected_cmap
    if missing_supported:
        errors.append(
            f"{font_label}: {len(missing_supported)} source-supported "
            "codepoints are missing"
        )
    if unexpected_codepoints:
        formatted = ", ".join(
            f"U+{codepoint:04X}" for codepoint in sorted(
                unexpected_codepoints
            )
        )
        errors.append(
            f"{font_label}: generated cmap contains codepoints outside "
            f"the requested supported inventory ({formatted})"
        )
    unreviewed_fallbacks = unsupported - KNOWN_FALLBACK_CODEPOINTS
    if unreviewed_fallbacks:
        formatted = ", ".join(
            f"U+{codepoint:04X}" for codepoint in sorted(
                unreviewed_fallbacks
            )
        )
        errors.append(
            f"{font_label}: unsupported codepoints need an explicit "
            f"fallback decision: {formatted}"
        )

    expected_full_name = (
        FAMILY_NAME
        if subfamily == "Regular"
        else f"{FAMILY_NAME} {subfamily}"
    )
    postscript_name = f"{COMPACT_FAMILY_NAME}-{subfamily}"
    source_cid_name = next(
        iter(sorted(name_values(source_font, 20))),
        postscript_name,
    )
    expected_cid_name = source_cid_name.replace(
        "IBMPlexSansJP",
        COMPACT_FAMILY_NAME,
    )
    if "plex" in expected_cid_name.casefold():
        expected_cid_name = postscript_name
    expected_names = {
        1: {FAMILY_NAME},
        2: {subfamily},
        4: {expected_full_name},
        6: {postscript_name},
        16: {FAMILY_NAME},
        17: {subfamily},
        20: {expected_cid_name},
    }
    for name_id, expected in expected_names.items():
        actual = name_values(generated_font, name_id)
        if actual != expected:
            errors.append(
                f"{font_label}: name ID {name_id} is {sorted(actual)!r}; "
                f"expected {sorted(expected)!r}"
            )
    unique_ids = name_values(generated_font, 3)
    if not unique_ids or not all(
        postscript_name in value for value in unique_ids
    ):
        errors.append(
            f"{font_label}: name ID 3 does not identify the renamed font"
        )
    for name_id in PRIMARY_NAME_IDS:
        for value in name_values(generated_font, name_id):
            if "plex" in value.casefold():
                errors.append(
                    f"{font_label}: Reserved Font Name remains in primary "
                    f"name ID {name_id}: {value!r}"
                )

    for name_id in PRESERVED_METADATA_NAME_IDS:
        source_values = name_values(source_font, name_id)
        generated_values = name_values(generated_font, name_id)
        if generated_values != source_values:
            errors.append(
                f"{font_label}: upstream metadata name ID {name_id} "
                "changed during subsetting"
            )

    if generated_font.flavor != "woff2":
        errors.append(
            f"{font_label}: output flavor is {generated_font.flavor!r}"
        )
    actual_weight = generated_font["OS/2"].usWeightClass
    if actual_weight != weight_class:
        errors.append(
            f"{font_label}: OS/2 weight is {actual_weight}; "
            f"expected {weight_class}"
        )
    if (
        generated_font["head"].macStyle & 0b11
        or generated_font["post"].italicAngle != 0
    ):
        errors.append(
            f"{font_label}: output must remain upright with normal "
            "style flags"
        )

    raw = generated_path.stat().st_size
    compressed = len(
        gzip.compress(
            generated_path.read_bytes(),
            compresslevel=9,
            mtime=0,
        )
    )
    raw_limit = budget["perExtensionRawBytes"][".woff2"]
    gzip_limit = budget["perExtensionGzipBytes"][".woff2"]
    if raw > raw_limit:
        errors.append(
            f"{font_label}: raw size {raw} exceeds budget {raw_limit}"
        )
    if compressed > gzip_limit:
        errors.append(
            f"{font_label}: gzip size {compressed} exceeds budget "
            f"{gzip_limit}"
        )

    return errors, unsupported, generated_cmap


def describe_codepoints(codepoints: set[int]) -> str:
    return ", ".join(
        f"U+{codepoint:04X} "
        f"{unicodedata.name(chr(codepoint), 'UNNAMED')}"
        for codepoint in sorted(codepoints)
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Build deterministic Planetarium Sans JP WOFF2 subsets, or "
            "verify that the committed assets match current Web text."
        )
    )
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path(__file__).resolve().parent.parent,
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help=(
            "build into a temporary directory, validate metadata and "
            "coverage, then compare with the committed WOFF2 assets"
        ),
    )
    arguments = parser.parse_args()
    project_root = arguments.project_root.resolve()
    preflight_errors = validate_environment()
    preflight_errors.extend(validate_dependency(project_root))
    preflight_errors.extend(validate_license(project_root))
    preflight_errors.extend(validate_css_marker_contract(project_root))
    if preflight_errors:
        raise SystemExit(
            "Font build preflight failed:\n"
            + "\n".join(f"- {error}" for error in preflight_errors)
        )
    errors = []
    package_fonts = (
        project_root
        / "node_modules/@ibm/plex-sans-jp/fonts/complete/woff2/hinted"
    )
    output_root = project_root / FONT_ASSET_ROOT
    inventories = source_character_inventories(project_root)
    budget = json.loads(
        (
            project_root / "config/web-budgets.json"
        ).read_text(encoding="utf-8")
    )

    if arguments.check:
        temporary_directory = TemporaryDirectory(
            prefix="planetarium-fonts-"
        )
        build_root = Path(temporary_directory.name)
    else:
        temporary_directory = None
        build_root = output_root

    for group in FONT_GROUPS:
        if group == "Base":
            continue
        overlap = inventories["Base"] & inventories[group]
        if overlap:
            errors.append(
                f"base and {group.lower()} font inventories must be "
                f"disjoint: {describe_codepoints(overlap)}"
            )

    unsupported_codepoints = set()
    for group, group_metadata in FONT_GROUPS.items():
        codepoints = inventories[group]
        if not codepoints:
            errors.append(
                f"{group} font inventory must contain at least one "
                "codepoint"
            )
            continue
        group_cmaps = []
        group_unsupported = set()
        for weight, metadata in WEIGHTS.items():
            source = package_fonts / metadata["source"]
            if not source.exists():
                raise FileNotFoundError(
                    f"{source} is missing; run npm install before "
                    "subsetting"
                )
            filename = (
                f"{group_metadata['asset_prefix']}-{weight}.woff2"
            )
            destination = build_root / filename
            build_subset(
                source,
                destination,
                codepoints,
                metadata["subfamily"],
            )
            font_errors, unsupported, generated_cmap = validate_font(
                source,
                destination,
                codepoints,
                f"{group} {weight}",
                metadata["subfamily"],
                metadata["weight_class"],
                budget,
            )
            errors.extend(font_errors)
            group_unsupported.update(unsupported)
            group_cmaps.append(generated_cmap)
            unsupported_codepoints.update(unsupported)
            print(f"{filename} {destination.stat().st_size} bytes")
            if arguments.check:
                committed = output_root / destination.name
                if not committed.exists():
                    errors.append(f"missing committed font: {committed}")
                elif committed.read_bytes() != destination.read_bytes():
                    errors.append(
                        f"{committed.relative_to(project_root)} is stale; "
                        "run the subset command after all UI copy is final"
                    )

        supported_codepoints = codepoints - group_unsupported
        if any(cmap != supported_codepoints for cmap in group_cmaps):
            errors.append(
                f"{group} Regular and SemiBold cmap coverage must exactly "
                "match the supported source inventory"
            )

        stylesheet_destination = (
            project_root / group_metadata["stylesheet"]
        )
        if not arguments.check:
            write_font_stylesheet_block(
                stylesheet_destination,
                group,
                supported_codepoints,
            )
        errors.extend(
            validate_font_stylesheet_block(
                stylesheet_destination,
                group,
                supported_codepoints,
            )
        )
        print(
            f"{group} subset character inventory: "
            f"{len(codepoints)} requested / "
            f"{len(supported_codepoints)} supplied by IBM Plex Sans JP"
        )

    if unsupported_codepoints:
        print(
            "System fallback codepoints: "
            f"{describe_codepoints(unsupported_codepoints)}"
        )

    if temporary_directory is not None:
        temporary_directory.cleanup()
    if errors:
        raise SystemExit(
            "Font validation failed:\n"
            + "\n".join(f"- {error}" for error in errors)
        )
    if arguments.check:
        print("Committed font subsets are current and reproducible.")


if __name__ == "__main__":
    main()
