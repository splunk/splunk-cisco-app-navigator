#!/usr/bin/env python3
"""Register the old chat session into the current workspace's state database."""

import sqlite3
import json
import os

DB_PATH = os.path.expanduser(
    "~/Library/Application Support/Code/User/workspaceStorage/"
    "bf1e6d462fd0c056ff4bc8b3761f13d7/state.vscdb"
)

SESSION_ENTRY = {
    "sessionId": "1414a323-9f62-4746-b35c-464fbc994304",
    "title": "Creating a Splunk React UI App: Splunk Cisco App Navigator",
    "lastMessageDate": 1771857598750,
    "timing": {
        "created": 1771639304888,
        "lastRequestStarted": 1771857598750,
        "lastRequestEnded": 1771858348645,
    },
    "initialLocation": "panel",
    "hasPendingEdits": False,
    "isEmpty": False,
    "isExternal": False,
    "lastResponseState": 3,
}


def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute(
        "SELECT value FROM ItemTable WHERE key = 'chat.ChatSessionStore.index'"
    )
    row = cursor.fetchone()
    index = json.loads(row[0])

    session_id = SESSION_ENTRY["sessionId"]
    index["entries"][session_id] = SESSION_ENTRY

    new_value = json.dumps(index)
    cursor.execute(
        "UPDATE ItemTable SET value = ? WHERE key = 'chat.ChatSessionStore.index'",
        (new_value,),
    )
    conn.commit()

    # Verify
    cursor.execute(
        "SELECT value FROM ItemTable WHERE key = 'chat.ChatSessionStore.index'"
    )
    result = json.loads(cursor.fetchone()[0])
    print(f"Sessions registered: {len(result['entries'])}")
    for sid, info in result["entries"].items():
        print(f"  - {info['title']} ({sid[:12]}...)")

    conn.close()
    print("\nDone! Session registered in state database.")


if __name__ == "__main__":
    main()
