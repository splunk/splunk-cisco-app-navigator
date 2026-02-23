#!/usr/bin/env python3
"""Extract full chat history from VS Code Copilot chat session JSONL file.

Uses ijson for streaming parse of the large (~159 MB) first JSON line,
falling back to stdlib json if ijson is unavailable.
"""

import json
import os
import sys
import re
import time
from datetime import datetime

JSONL_PATH = os.path.expanduser(
    "~/Library/Application Support/Code/User/workspaceStorage/"
    "cd45dc9b918efc9d6be657240494fda4/chatSessions/"
    "1414a323-9f62-4746-b35c-464fbc994304.jsonl"
)

OUTPUT_PATH = os.path.expanduser(
    "~/repo/cisco_control_center_app/docs/chat_history_recovered.md"
)


def extract_text_from_response(response_parts):
    """Extract readable text from response parts."""
    if not isinstance(response_parts, list):
        return ""
    texts = []
    for part in response_parts:
        if not isinstance(part, dict):
            continue
        kind = part.get("kind")
        value = part.get("value")

        if kind == "markdownContent":
            if isinstance(value, dict):
                texts.append(value.get("value", ""))
            elif isinstance(value, str):
                texts.append(value)
        elif kind == "textEditGroup":
            if isinstance(value, dict):
                uri = value.get("uri", {})
                if isinstance(uri, dict):
                    path = uri.get("path", uri.get("fsPath", ""))
                elif isinstance(uri, str):
                    path = uri
                else:
                    path = str(uri)
                edits = value.get("edits", [])
                texts.append(f"\n**[Code Edit: {path} ({len(edits)} changes)]**\n")
        elif kind == "markdownVuln":
            if isinstance(value, dict):
                texts.append(value.get("value", ""))
            elif isinstance(value, str):
                texts.append(value)
        elif kind == "codeblockUri":
            if isinstance(value, dict):
                uri = value.get("uri", "")
                texts.append(f"\n**[File: {uri}]**\n")
        elif kind == "progressMessage":
            pass
        elif kind == "confirmation":
            if isinstance(value, dict):
                title = value.get("title", "")
                texts.append(f"\n**[Confirmation: {title}]**\n")
        elif kind == "toolInvocation" or kind == "tool":
            if isinstance(value, dict):
                tool_name = value.get("toolName", value.get("name", "unknown"))
                texts.append(f"\n**[Tool: {tool_name}]**\n")
        else:
            if isinstance(value, str) and value.strip():
                texts.append(value)
            elif isinstance(value, dict) and "value" in value:
                v = value["value"]
                if isinstance(v, str) and v.strip():
                    texts.append(v)

    return "\n".join(texts)


def main():
    print(f"Reading: {JSONL_PATH}")
    fsize = os.path.getsize(JSONL_PATH)
    print(f"File size: {fsize / 1024 / 1024:.1f} MB")

    t0 = time.time()
    print("Parsing JSON (this may take a minute for 159 MB)...")
    sys.stdout.flush()

    with open(JSONL_PATH, "r") as f:
        first_line = f.readline()

    obj = json.loads(first_line)
    session = obj["v"]
    elapsed = time.time() - t0
    print(f"Parsed in {elapsed:.1f}s")

    title = session.get("customTitle", "Untitled")
    creation_ts = session.get("creationDate", 0)
    requests = session.get("requests", [])

    try:
        created = datetime.fromtimestamp(creation_ts / 1000).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
    except Exception:
        created = str(creation_ts)

    print(f"Title: {title}")
    print(f"Created: {created}")
    print(f"Total requests: {len(requests)}")
    sys.stdout.flush()

    out = open(OUTPUT_PATH, "w")

    out.write(f"# Chat History: {title}\n\n")
    out.write(f"**Session ID:** 1414a323-9f62-4746-b35c-464fbc994304\n")
    out.write(f"**Created:** {created}\n")
    out.write(f"**Total Exchanges:** {len(requests)}\n\n---\n\n")

    for i, req in enumerate(requests):
        if (i + 1) % 25 == 0:
            print(f"  Processing exchange {i + 1}/{len(requests)}...")
            sys.stdout.flush()

        msg = req.get("message", {})
        user_text = msg.get("text", "")

        ts = req.get("timestamp", 0)
        try:
            time_str = datetime.fromtimestamp(ts / 1000).strftime(
                "%Y-%m-%d %H:%M:%S"
            )
        except Exception:
            time_str = ""

        out.write(f"## Exchange {i + 1}\n")
        if time_str:
            out.write(f"*{time_str}*\n")
        out.write("\n")

        if user_text:
            out.write("### User\n\n")
            out.write(user_text)
            out.write("\n\n")

        response = req.get("response", [])
        if response:
            resp_text = extract_text_from_response(response)
            if resp_text.strip():
                out.write("### Assistant\n\n")
                out.write(resp_text)
                out.write("\n\n")

        out.write("---\n\n")

    out.close()

    file_size = os.path.getsize(OUTPUT_PATH)
    total = time.time() - t0
    print(f"\nDone in {total:.1f}s")
    print(f"Written to: {OUTPUT_PATH}")
    print(f"Output size: {file_size / 1024:.1f} KB")
    print(f"Extracted {len(requests)} exchanges")


if __name__ == "__main__":
    main()
