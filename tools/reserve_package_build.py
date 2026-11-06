"""Reserve one repository-wide build number using a GitHub workflow run.

The offset and workflow filename are permanent sequence identities. Never reset
them or use a fork's counter. Numbers are spent when a run is created, even if
the runner or the later local build fails.
"""

import argparse
import json
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path


REPOSITORY = "splunk/splunk-cisco-app-navigator"
WORKFLOW = "reserve-build-number.yml"
OFFSET = 99
PREFIX = "Reserve Navigator build v1 "


class ReservationError(RuntimeError):
    pass


def github(method, endpoint, payload=None):
    command = ["gh", "api", "--hostname", "github.com", "--method", method,
               f"repos/{REPOSITORY}/{endpoint}".rstrip("/")]
    if payload is not None:
        command += ["--input", "-"]
    try:
        result = subprocess.run(command, input=json.dumps(payload) if payload else None,
                                capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ReservationError("GitHub request failed or timed out; no local number was assigned.") from error
    if result.returncode:
        # gh stderr can contain account/network details. Do not echo it.
        raise ReservationError(
            "Cannot reserve a build number on github.com/splunk/splunk-cisco-app-navigator. "
            "Check gh authentication, Actions write access, connectivity, and that "
            "reserve-build-number.yml is active on the default branch. No local fallback is allowed."
        )
    try:
        data = json.loads(result.stdout) if result.stdout.strip() else None
        if data is not None and not isinstance(data, dict):
            raise ValueError("expected an object")
        return data
    except ValueError as error:
        raise ReservationError("GitHub returned invalid reservation metadata.") from error


def reserve_build(local_floor, receipt_dir):
    if not shutil.which("gh"):
        raise ReservationError("GitHub CLI is required: brew install gh; then gh auth login --hostname github.com.")
    repository = github("GET", "")
    workflow = github("GET", f"actions/workflows/{WORKFLOW}")
    if (not isinstance(repository, dict) or not isinstance(workflow, dict)
            or repository.get("full_name", "").lower() != REPOSITORY.lower()
            or not isinstance(repository.get("default_branch"), str)
            or not repository.get("default_branch")
            or type(workflow.get("id")) is not int
            or workflow.get("path") != f".github/workflows/{WORKFLOW}"
            or workflow.get("state") != "active"):
        raise ReservationError("The canonical build-number workflow is unavailable or inactive.")
    request_id = uuid.uuid4().hex
    title = PREFIX + request_id
    print("Reserving a shared build number on GitHub ...", file=sys.stderr)
    # Submit exactly once. A lost response may still have spent a number.
    github("POST", f"actions/workflows/{WORKFLOW}/dispatches",
           {"ref": repository["default_branch"], "inputs": {"request_id": request_id}})
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        matches = []
        # Bounded pagination tolerates many simultaneous developers. An unseen
        # reservation fails closed rather than submitting a duplicate request.
        for page in range(1, 6):
            data = github("GET", f"actions/workflows/{WORKFLOW}/runs?event=workflow_dispatch&per_page=100&page={page}")
            runs = data.get("workflow_runs") if isinstance(data, dict) else None
            if not isinstance(runs, list) or any(not isinstance(run, dict) for run in runs):
                raise ReservationError("Invalid build reservation list from GitHub.")
            matches.extend(run for run in runs if run.get("display_title") == title)
            if len(runs) < 100 or matches:
                break
        if matches:
            if len(matches) != 1:
                raise ReservationError("Ambiguous build reservation; no number will be reused.")
            run = matches[0]
            sequence = run.get("run_number")
            if (run.get("workflow_id") != workflow.get("id")
                    or run.get("event") != "workflow_dispatch"
                    or type(sequence) is not int or sequence < 1
                    or type(run.get("id")) is not int):
                raise ReservationError("Invalid build reservation identity.")
            number = OFFSET + sequence
            url = f"https://github.com/{REPOSITORY}/actions/runs/{run['id']}"
            receipt_dir.mkdir(parents=True, exist_ok=True)
            receipt = {"build": number, "request_id": request_id,
                       "usable": number > local_floor,
                       "workflow_id": workflow["id"], "run_id": run["id"],
                       "run_number": sequence, "url": url}
            with (receipt_dir / f"{number}.json").open("x", encoding="utf-8") as handle:
                json.dump(receipt, handle, indent=2)
            if number <= local_floor:
                raise ReservationError(
                    f"Reserved build {number} is not above existing build {local_floor}. "
                    "The allocator migration baseline needs owner review; refusing to invent another number."
                )
            print(f"Reserved build {number}: {url}", file=sys.stderr)
            return number
        time.sleep(2)
    raise ReservationError(f"Reservation {request_id} was not visible within 120 seconds; retry as a new build. Numbers may be skipped.")


def claim_build(number, receipt_dir):
    """Require a reservation and consume it once before a package attempt."""
    try:
        receipt = json.loads((receipt_dir / f"{number}.json").read_text(encoding="utf-8"))
        sequence = receipt.get("run_number")
        valid = (type(sequence) is int and sequence > 0
                 and receipt.get("usable") is True
                 and receipt.get("build") == number == OFFSET + sequence
                 and type(receipt.get("run_id")) is int
                 and type(receipt.get("workflow_id")) is int)
    except (OSError, ValueError, AttributeError) as error:
        raise ReservationError("Missing build reservation; run ./build.sh or make package without an APP_BUILD override.") from error
    if not valid:
        raise ReservationError("Invalid build reservation; refusing a manually selected number.")
    try:
        with (receipt_dir / f"{number}.claimed").open("x", encoding="utf-8") as handle:
            json.dump(receipt, handle)
    except FileExistsError as error:
        raise ReservationError("This build reservation was already used; start a new build to reserve another number.") from error


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--claim", type=int)
    parser.add_argument("--receipts", required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.claim is not None:
            claim_build(args.claim, args.receipts)
        else:
            print(reserve_build(0, args.receipts))
    except (ReservationError, OSError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
