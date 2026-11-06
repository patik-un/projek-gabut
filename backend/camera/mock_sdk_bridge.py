#!/usr/bin/env python3
import base64
import json
import os
import sys


TEST_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4n"
    "ICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIy"
    "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAYACADASIAAhEBAxEB/8QAHwAAAQUBAQEB"
    "AQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKB"
    "kaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1"
    "dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl"
    "5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcF"
    "BAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5"
    "OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0"
    "tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDlaKKK988A"
    "KKKKACiiigAooooA/9k="
)


def respond(data, newline=False):
    sys.stdout.write(json.dumps(data) + ("\n" if newline else ""))
    sys.stdout.flush()


def handle_request(raw_request, newline=False):
    request = json.loads(raw_request or "{}")
    command = request.get("command")

    if command == "status":
        respond({
            "success": True,
            "connected": True,
            "message": "Mock SDK camera connected",
            "camera": {"model": "Mock Camera"},
            "capabilities": {
                "preview": True,
                "capture": True,
                "settings": True,
            },
        }, newline)
        return

    if command == "preview":
        respond({
            "success": True,
            "image_base64": base64.b64encode(TEST_JPEG).decode("ascii"),
        }, newline)
        return

    if command == "capture":
        output_path = request.get("output_path")
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        with open(output_path, "wb") as file:
            file.write(TEST_JPEG)

        respond({"success": True, "output_path": output_path}, newline)
        return

    if command == "settings":
        respond({"success": True, "settings": request.get("settings") or {}}, newline)
        return

    respond({"success": False, "message": f"Unknown command: {command}"}, newline)


def main():
    if "--server" in sys.argv:
        for line in sys.stdin:
            handle_request(line, newline=True)
        return

    handle_request(sys.stdin.read())


if __name__ == "__main__":
    main()
