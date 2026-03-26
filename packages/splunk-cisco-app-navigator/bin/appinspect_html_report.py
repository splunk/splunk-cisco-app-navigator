#!/usr/bin/env python3
"""Convert splunk-appinspect JSON output into a self-contained HTML report."""
import json, sys, html, os
from datetime import datetime, timezone

def severity_order(r):
    order = {"failure": 0, "error": 1, "warning": 2, "manual_check": 3, "not_applicable": 4, "skipped": 5, "success": 6}
    return order.get(r, 99)

def badge(result):
    colors = {
        "success": ("#065f46", "#d1fae5"), "failure": ("#991b1b", "#fee2e2"),
        "error": ("#92400e", "#fef3c7"), "warning": ("#92400e", "#fef3c7"),
        "manual_check": ("#1e3a5f", "#dbeafe"), "not_applicable": ("#374151", "#f3f4f6"),
        "skipped": ("#374151", "#f3f4f6"),
    }
    fg, bg = colors.get(result, ("#374151", "#f3f4f6"))
    label = result.replace("_", " ").title()
    return f'<span class="badge" style="background:{bg};color:{fg}">{label}</span>'

def build_html(data):
    reports = data if isinstance(data, list) else [data]
    report = reports[0]
    summary = report.get("summary", {})
    run_params = report.get("run_parameters", {})
    app_name = run_params.get("app_name", "Unknown")
    app_version = run_params.get("app_version", "")
    ts = report.get("run_timestamp", "")

    counts = {
        "success": summary.get("success", 0), "failure": summary.get("failure", 0),
        "error": summary.get("error", 0), "warning": summary.get("warning", 0),
        "manual_check": summary.get("manual_check", 0),
        "not_applicable": summary.get("not_applicable", 0), "skipped": summary.get("skipped", 0),
    }
    total = sum(counts.values())
    pass_fail = "PASS" if counts["failure"] == 0 and counts["error"] == 0 else "FAIL"
    pf_color = "#065f46" if pass_fail == "PASS" else "#991b1b"
    pf_bg = "#d1fae5" if pass_fail == "PASS" else "#fee2e2"

    groups = {}
    for g in report.get("groups", []):
        gname = g.get("name", "Other")
        gdesc = g.get("description", "")
        for check in g.get("checks", []):
            result = check.get("result", "skipped")
            entry = {
                "name": check.get("name", ""),
                "description": check.get("description", ""),
                "result": result,
                "messages": [m.get("message", "") for m in check.get("messages", [])],
                "tags": check.get("tags", []),
            }
            groups.setdefault(gname, {"description": gdesc, "checks": []})["checks"].append(entry)

    for g in groups.values():
        g["checks"].sort(key=lambda c: severity_order(c["result"]))

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    rows_summary = "".join(
        f'<td><span class="stat-num">{counts[k]}</span><br><span class="stat-label">{k.replace("_"," ").title()}</span></td>'
        for k in ["failure", "error", "warning", "manual_check", "success", "not_applicable", "skipped"]
    )

    filter_btns = "".join(
        f'<button class="filter-btn" data-filter="{k}" onclick="toggleFilter(\'{k}\')">'
        f'{k.replace("_"," ").title()} ({counts[k]})</button>'
        for k in ["failure", "error", "warning", "manual_check", "success", "not_applicable", "skipped"]
        if counts[k] > 0
    )

    group_html = ""
    for gname, gdata in groups.items():
        checks_html = ""
        for c in gdata["checks"]:
            msgs = ""
            if c["messages"]:
                msg_items = "".join(f"<li>{html.escape(m)}</li>" for m in c["messages"])
                msgs = f'<ul class="messages">{msg_items}</ul>'
            tags_html = " ".join(f'<span class="tag">{html.escape(t)}</span>' for t in c["tags"])
            checks_html += f'''<tr class="check-row" data-result="{c["result"]}">
                <td>{badge(c["result"])}</td>
                <td><strong>{html.escape(c["name"])}</strong><br>
                    <span class="check-desc">{html.escape(c["description"])}</span>
                    {msgs}</td>
                <td class="tags-cell">{tags_html}</td></tr>'''
        group_html += f'''<div class="group">
            <h3>{html.escape(gname)}</h3>
            <p class="group-desc">{html.escape(gdata["description"])}</p>
            <table class="checks"><thead><tr><th style="width:120px">Result</th>
                <th>Check</th><th style="width:200px">Tags</th></tr></thead>
                <tbody>{checks_html}</tbody></table></div>'''

    return f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>AppInspect Report — {html.escape(app_name)} {html.escape(app_version)}</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  background:#f9fafb;color:#1f2937;line-height:1.5;padding:2rem}}
.container{{max-width:1200px;margin:0 auto}}
h1{{font-size:1.5rem;margin-bottom:.25rem}}
h3{{font-size:1.1rem;margin-bottom:.5rem;color:#111827}}
.meta{{color:#6b7280;font-size:.875rem;margin-bottom:1.5rem}}
.pf-badge{{display:inline-block;padding:.25rem .75rem;border-radius:6px;font-weight:700;
  font-size:1rem;background:{pf_bg};color:{pf_color};margin-bottom:1rem}}
.summary-table{{width:100%;border-collapse:collapse;margin-bottom:1.5rem;text-align:center}}
.summary-table td{{padding:.75rem;border:1px solid #e5e7eb;background:#fff}}
.stat-num{{font-size:1.5rem;font-weight:700}}
.stat-label{{font-size:.75rem;color:#6b7280;text-transform:uppercase}}
.filter-bar{{margin-bottom:1.5rem;display:flex;gap:.5rem;flex-wrap:wrap}}
.filter-btn{{padding:.35rem .75rem;border:1px solid #d1d5db;border-radius:6px;background:#fff;
  cursor:pointer;font-size:.8rem;transition:all .15s}}
.filter-btn:hover{{background:#f3f4f6}}
.filter-btn.active{{background:#1f2937;color:#fff;border-color:#1f2937}}
.group{{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:1.25rem;margin-bottom:1.25rem}}
.group-desc{{color:#6b7280;font-size:.85rem;margin-bottom:.75rem}}
.checks{{width:100%;border-collapse:collapse}}
.checks th{{text-align:left;padding:.5rem .75rem;background:#f9fafb;border-bottom:2px solid #e5e7eb;
  font-size:.8rem;color:#6b7280;text-transform:uppercase}}
.checks td{{padding:.5rem .75rem;border-bottom:1px solid #f3f4f6;vertical-align:top;font-size:.875rem}}
.check-desc{{color:#6b7280;font-size:.8rem}}
.messages{{margin-top:.35rem;padding-left:1.25rem;font-size:.8rem;color:#92400e}}
.badge{{display:inline-block;padding:.15rem .5rem;border-radius:4px;font-size:.75rem;font-weight:600;
  white-space:nowrap}}
.tag{{display:inline-block;padding:.1rem .4rem;border-radius:3px;font-size:.7rem;
  background:#f3f4f6;color:#6b7280;margin-right:.25rem}}
.tags-cell{{font-size:.75rem}}
.check-row.hidden{{display:none}}
</style></head><body>
<div class="container">
<h1>AppInspect Report</h1>
<p class="meta">{html.escape(app_name)} v{html.escape(app_version)} &middot; {html.escape(ts or now)}
  &middot; {total} checks</p>
<div class="pf-badge">{pass_fail}</div>
<table class="summary-table"><tr>{rows_summary}</tr></table>
<div class="filter-bar"><button class="filter-btn active" data-filter="all"
  onclick="toggleFilter('all')">Show All ({total})</button>{filter_btns}</div>
{group_html}
<p class="meta" style="margin-top:2rem;text-align:center">Generated {now}</p>
</div>
<script>
let active = new Set(["all"]);
function toggleFilter(f) {{
  if (f === "all") {{ active.clear(); active.add("all"); }}
  else {{ active.delete("all"); active.has(f) ? active.delete(f) : active.add(f);
    if (active.size === 0) active.add("all"); }}
  document.querySelectorAll(".filter-btn").forEach(b =>
    b.classList.toggle("active", active.has(b.dataset.filter)));
  document.querySelectorAll(".check-row").forEach(r => {{
    const show = active.has("all") || active.has(r.dataset.result);
    r.classList.toggle("hidden", !show);
  }});
}}
</script></body></html>'''

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: appinspect_html_report.py <input.json> <output.html>", file=sys.stderr)
        sys.exit(1)
    with open(sys.argv[1], "r") as f:
        data = json.load(f)
    report_html = build_html(data)
    os.makedirs(os.path.dirname(sys.argv[2]) or ".", exist_ok=True)
    with open(sys.argv[2], "w") as f:
        f.write(report_html)
    print(f"  ✓ HTML report: {sys.argv[2]}")
