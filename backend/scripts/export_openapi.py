"""Writes the API's OpenAPI schema to a file for the frontend type generator.

Usage: uv run python scripts/export_openapi.py ../frontend/openapi.json
"""

import json
import sys
from pathlib import Path

from app.main import create_app

JSON_INDENT = 2


def export_openapi(output_path: Path) -> None:
    schema = create_app().openapi()
    output_path.write_text(json.dumps(schema, indent=JSON_INDENT) + "\n")


if __name__ == "__main__":
    export_openapi(Path(sys.argv[1]))
