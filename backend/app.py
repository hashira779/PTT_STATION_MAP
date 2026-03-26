import io
import json
import os

import pandas as pd
from flask import Flask, jsonify, render_template, request, send_file

app = Flask(__name__)

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")

FILE_MAPPING = {
    "default": "markers.json",
    "admin": "markers_admin.json",
    "admin_fleet": "markers_admin_fleet.json",
}

SCHEDULE_CONFIG_FILE = os.path.join(DATA_DIR, "schedule_config.json")
DEFAULT_SCHEDULE_CONFIG = {
    "default_schedule_key": "16h",
    "schedules": {
        "24h": {
            "key": "24h",
            "label": "Open 24h",
            "is24h": True,
            "openHour": 0,
            "openMinute": 0,
            "closeHour": 0,
            "closeMinute": 0,
        },
        "16h": {
            "key": "16h",
            "label": "Open 5:00 AM - 3:30 PM",
            "is24h": False,
            "openHour": 5,
            "openMinute": 0,
            "closeHour": 15,
            "closeMinute": 30,
        },
    },
    "groups": [
        {"code": "COCO", "name": "COCO", "schedule_key": "24h"},
        {"code": "DODO", "name": "DODO", "schedule_key": "16h"},
    ],
}
ARRAY_FIELDS = ["description", "product", "other_product", "service", "promotion"]
SPECIAL_STATUSES = {"under construct", "brand change", "off fleet card"}
STATUS_ALIASES = {"16": "16h", "24": "24h"}


def normalize_id(value):
    return str(value).strip()


def normalize_schedule_key(value):
    if value is None:
        return ""
    key = str(value).strip()
    return STATUS_ALIASES.get(key.lower(), key)


def markers_file_path(file_key):
    filename = FILE_MAPPING.get(file_key)
    if not filename:
        return None
    return os.path.join(DATA_DIR, filename)


def ensure_marker_defaults(marker):
    for field in ARRAY_FIELDS:
        if marker.get(field) is None:
            marker[field] = []
    marker.setdefault("schedule_group_code", "")
    marker.setdefault("schedule_key", "")
    marker.setdefault("status", "")
    if isinstance(marker.get("schedule_key"), str):
        marker["schedule_key"] = normalize_schedule_key(marker["schedule_key"])
    if isinstance(marker.get("status"), str):
        marker["status"] = normalize_schedule_key(marker["status"])
    return marker


def is_special_status(value):
    return normalize_schedule_key(value).lower() in SPECIAL_STATUSES


def get_default_schedule_key(schedule_config):
    requested = normalize_schedule_key(schedule_config.get("default_schedule_key") or "")
    if requested in schedule_config["schedules"]:
        return requested
    return next(iter(schedule_config["schedules"]), "16h")


def normalize_station_schedule_fields(station, schedule_config=None):
    ensure_marker_defaults(station)

    schedule_key = normalize_schedule_key(station.get("schedule_key") or "")
    status = normalize_schedule_key(station.get("status") or "")

    if not schedule_key and status and not is_special_status(status):
        schedule_key = status

    station["schedule_key"] = schedule_key
    station["status"] = status.lower() if is_special_status(status) else ""

    if schedule_config and schedule_key and schedule_key not in schedule_config["schedules"]:
        raise ValueError(f"Unknown schedule '{schedule_key}'.")

    return station


def read_json_file(file_key):
    filepath = markers_file_path(file_key)
    if not filepath:
        return None, "Invalid file key provided."
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        return {"STATION": []}, None
    except json.JSONDecodeError:
        return None, "Error decoding JSON from file."

    if "STATION" not in data or not isinstance(data["STATION"], list):
        return None, "JSON format error: Missing 'STATION' key."

    data["STATION"] = [ensure_marker_defaults(station) for station in data["STATION"]]
    return data, None


def write_json_file(file_key, data):
    filepath = markers_file_path(file_key)
    if not filepath:
        return False, "Invalid file key provided."
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        return True, None
    except Exception as exc:
        return False, str(exc)


def normalize_schedule_config(config):
    config = config or {}
    schedules = config.get("schedules") or {}
    groups = config.get("groups") or []

    normalized_schedules = {}
    for raw_key, schedule in schedules.items():
        key = normalize_schedule_key(schedule.get("key") or raw_key)
        normalized_schedules[key] = {
            "key": key,
            "label": schedule.get("label") or key,
            "is24h": bool(schedule.get("is24h", False)),
            "openHour": int(schedule.get("openHour", 0)),
            "openMinute": int(schedule.get("openMinute", 0)),
            "closeHour": int(schedule.get("closeHour", 0)),
            "closeMinute": int(schedule.get("closeMinute", 0)),
        }

    normalized_groups = []
    seen_codes = set()
    for group in groups:
        code = normalize_id(group.get("code", "")).upper()
        if not code or code in seen_codes:
            continue
        seen_codes.add(code)
        normalized_groups.append(
            {
                "code": code,
                "name": group.get("name") or code,
                "schedule_key": normalize_schedule_key(group.get("schedule_key") or ""),
            }
        )

    default_schedule_key = normalize_schedule_key(config.get("default_schedule_key") or "")
    if default_schedule_key not in normalized_schedules:
        default_schedule_key = next(iter(normalized_schedules), "16h")

    normalized_groups = [
        {
            **group,
            "schedule_key": group["schedule_key"] if group["schedule_key"] in normalized_schedules else "",
        }
        for group in normalized_groups
    ]

    return {
        "default_schedule_key": default_schedule_key,
        "schedules": normalized_schedules,
        "groups": normalized_groups,
    }


def read_schedule_config():
    try:
        with open(SCHEDULE_CONFIG_FILE, "r", encoding="utf-8") as f:
            config = json.load(f)
    except FileNotFoundError:
        return normalize_schedule_config(DEFAULT_SCHEDULE_CONFIG), None
    except json.JSONDecodeError:
        return None, "Error decoding schedule configuration."

    return normalize_schedule_config(config), None


def write_schedule_config(config):
    try:
        with open(SCHEDULE_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(normalize_schedule_config(config), f, indent=4, ensure_ascii=False)
        return True, None
    except Exception as exc:
        return False, str(exc)


def schedule_exists(schedule_key, schedule_config):
    return normalize_schedule_key(schedule_key) in schedule_config["schedules"]


def station_uses_schedule(station, schedule_key):
    normalized_key = normalize_schedule_key(schedule_key)
    direct_schedule = normalize_schedule_key(station.get("schedule_key") or "")
    legacy_status = normalize_schedule_key(station.get("status") or "")
    return direct_schedule == normalized_key or (
        legacy_status == normalized_key and not is_special_status(legacy_status)
    )


def apply_group_code_to_station(station, group_code):
    station["schedule_group_code"] = normalize_id(group_code).upper() if group_code else ""
    return station


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/schedule-config", methods=["GET"])
def get_schedule_config():
    config, error = read_schedule_config()
    if error:
        return jsonify({"error": error}), 500
    return jsonify(config)


@app.route("/api/schedule-config/schedules", methods=["POST"])
def create_schedule():
    payload = request.get_json() or {}
    config, error = read_schedule_config()
    if error:
        return jsonify({"error": error}), 500

    key = normalize_schedule_key(payload.get("key"))
    if not key:
        return jsonify({"error": "Schedule key is required."}), 400
    if key in config["schedules"]:
        return jsonify({"error": f"Schedule '{key}' already exists."}), 409

    schedule = {
        "key": key,
        "label": payload.get("label") or key,
        "is24h": bool(payload.get("is24h", False)),
        "openHour": int(payload.get("openHour", 0)),
        "openMinute": int(payload.get("openMinute", 0)),
        "closeHour": int(payload.get("closeHour", 0)),
        "closeMinute": int(payload.get("closeMinute", 0)),
    }
    config["schedules"][key] = schedule
    success, write_error = write_schedule_config(config)
    if not success:
        return jsonify({"error": write_error}), 500
    return jsonify(schedule), 201


@app.route("/api/schedule-config/schedules/<string:schedule_key>", methods=["PUT"])
def update_schedule(schedule_key):
    payload = request.get_json() or {}
    config, error = read_schedule_config()
    if error:
        return jsonify({"error": error}), 500

    key = normalize_schedule_key(schedule_key)
    if key not in config["schedules"]:
        return jsonify({"error": "Schedule not found."}), 404

    config["schedules"][key].update(
        {
            "label": payload.get("label") or config["schedules"][key]["label"],
            "is24h": bool(payload.get("is24h", config["schedules"][key].get("is24h", False))),
            "openHour": int(payload.get("openHour", config["schedules"][key].get("openHour", 0))),
            "openMinute": int(payload.get("openMinute", config["schedules"][key].get("openMinute", 0))),
            "closeHour": int(payload.get("closeHour", config["schedules"][key].get("closeHour", 0))),
            "closeMinute": int(payload.get("closeMinute", config["schedules"][key].get("closeMinute", 0))),
        }
    )
    success, write_error = write_schedule_config(config)
    if not success:
        return jsonify({"error": write_error}), 500
    return jsonify(config["schedules"][key])


@app.route("/api/schedule-config/schedules/<string:schedule_key>", methods=["DELETE"])
def delete_schedule(schedule_key):
    config, error = read_schedule_config()
    if error:
        return jsonify({"error": error}), 500

    key = normalize_schedule_key(schedule_key)
    if key not in config["schedules"]:
        return jsonify({"error": "Schedule not found."}), 404

    groups_using_key = [g["code"] for g in config["groups"] if normalize_schedule_key(g.get("schedule_key")) == key]
    if groups_using_key:
        return jsonify({"error": f"Schedule is used by groups: {', '.join(groups_using_key)}"}), 400

    stations_using_key = []
    for file_name, mapped_file in FILE_MAPPING.items():
        data, read_error = read_json_file(file_name)
        if read_error:
            continue
        for station in data["STATION"]:
            if station_uses_schedule(station, key):
                stations_using_key.append(f"{mapped_file}:{station.get('id')}")

    if stations_using_key:
        preview = ", ".join(stations_using_key[:10])
        suffix = "" if len(stations_using_key) <= 10 else f" (+{len(stations_using_key) - 10} more)"
        return jsonify({"error": f"Schedule is used by stations: {preview}{suffix}"}), 400

    del config["schedules"][key]
    if config.get("default_schedule_key") == key:
        config["default_schedule_key"] = next(iter(config["schedules"]), "")
    success, write_error = write_schedule_config(config)
    if not success:
        return jsonify({"error": write_error}), 500
    return jsonify({"message": f"Deleted schedule '{key}'."})


@app.route("/api/schedule-config/groups", methods=["POST"])
def create_group():
    payload = request.get_json() or {}
    config, error = read_schedule_config()
    if error:
        return jsonify({"error": error}), 500

    code = normalize_id(payload.get("code", "")).upper()
    schedule_key = normalize_schedule_key(payload.get("schedule_key"))
    if not code:
        return jsonify({"error": "Group code is required."}), 400
    if schedule_key and not schedule_exists(schedule_key, config):
        return jsonify({"error": f"Unknown schedule '{schedule_key}'."}), 400
    if any(group["code"] == code for group in config["groups"]):
        return jsonify({"error": f"Group '{code}' already exists."}), 409

    group = {"code": code, "name": payload.get("name") or code, "schedule_key": schedule_key}
    config["groups"].append(group)
    success, write_error = write_schedule_config(config)
    if not success:
        return jsonify({"error": write_error}), 500
    return jsonify(group), 201


@app.route("/api/schedule-config/groups/<string:group_code>", methods=["PUT"])
def update_group(group_code):
    payload = request.get_json() or {}
    config, error = read_schedule_config()
    if error:
        return jsonify({"error": error}), 500

    code = normalize_id(group_code).upper()
    group = next((g for g in config["groups"] if g["code"] == code), None)
    if not group:
        return jsonify({"error": "Group not found."}), 404

    if "schedule_key" in payload and payload.get("schedule_key") and not schedule_exists(payload.get("schedule_key"), config):
        return jsonify({"error": f"Unknown schedule '{payload.get('schedule_key')}'."}), 400

    group["name"] = payload.get("name") or group["name"]
    if "schedule_key" in payload:
        group["schedule_key"] = normalize_schedule_key(payload.get("schedule_key") or "")
    success, write_error = write_schedule_config(config)
    if not success:
        return jsonify({"error": write_error}), 500
    return jsonify(group)


@app.route("/api/schedule-config/groups/<string:group_code>", methods=["DELETE"])
def delete_group(group_code):
    code = normalize_id(group_code).upper()
    config, error = read_schedule_config()
    if error:
        return jsonify({"error": error}), 500

    original_count = len(config["groups"])
    config["groups"] = [group for group in config["groups"] if group["code"] != code]
    if len(config["groups"]) == original_count:
        return jsonify({"error": "Group not found."}), 404

    success, write_error = write_schedule_config(config)
    if not success:
        return jsonify({"error": write_error}), 500

    # Clear group code from all stations automatically.
    for file_key in FILE_MAPPING:
        data, read_error = read_json_file(file_key)
        if read_error:
            continue
        changed = False
        for station in data["STATION"]:
            if normalize_id(station.get("schedule_group_code", "")).upper() == code:
                station["schedule_group_code"] = ""
                changed = True
        if changed:
            write_json_file(file_key, data)

    return jsonify({"message": f"Deleted group '{code}' and cleared assigned stations."})


@app.route("/api/markers/<string:file_key>/bulk_group_update", methods=["POST"])
def bulk_group_update(file_key):
    """Fast endpoint to assign a schedule group code to multiple stations at once."""
    req_data = request.get_json() or {}
    ids_to_update = req_data.get("ids", [])
    group_code = req_data.get("group_code", "")

    if not ids_to_update:
        return jsonify({"error": "No IDs provided."}), 400

    config, config_error = read_schedule_config()
    if config_error:
        return jsonify({"error": config_error}), 500

    normalized_group = normalize_id(group_code).upper() if group_code else ""
    if normalized_group and not any(g["code"] == normalized_group for g in config["groups"]):
        return jsonify({"error": f"Unknown group '{normalized_group}'."}), 400

    data, error = read_json_file(file_key)
    if error:
        return jsonify({"error": error}), 500

    id_set = {normalize_id(id_value) for id_value in ids_to_update}
    updated_ids = []
    for station in data["STATION"]:
        if normalize_id(station.get("id")) in id_set:
            station["schedule_group_code"] = normalized_group
            updated_ids.append(normalize_id(station.get("id")))

    success, write_error = write_json_file(file_key, data)
    if not success:
        return jsonify({"error": f"Write failed: {write_error}"}), 500

    return jsonify({
        "message": f"Group {'cleared' if not normalized_group else 'set to ' + normalized_group} for {len(updated_ids)} station(s).",
        "updated_count": len(updated_ids),
        "updated_ids": updated_ids,
        "group_code": normalized_group,
    })


@app.route("/api/markers/<string:file_key>/bulk_array_update", methods=["POST"])
def bulk_array_update(file_key):
    req_data = request.get_json() or {}
    ids_to_update = req_data.get("ids", [])
    field = req_data.get("field")
    action = req_data.get("action")
    values = req_data.get("values", [])

    if not all([ids_to_update, field, action, values]):
        return jsonify({"error": "Missing required parameters: ids, field, action, values."}), 400
    if not isinstance(values, list):
        return jsonify({"error": "'values' must be a list."}), 400

    valid_fields = ["description", "product", "other_product", "service"]
    if field not in valid_fields:
        return jsonify({"error": f"Invalid field. Must be one of {valid_fields}"}), 400

    data, error = read_json_file(file_key)
    if error:
        return jsonify({"error": error}), 500

    updated_ids = set()
    id_set = {normalize_id(id_value) for id_value in ids_to_update}

    for station in data["STATION"]:
        if normalize_id(station.get("id")) not in id_set:
            continue
        target_list = station.setdefault(field, [])
        if not isinstance(target_list, list):
            station[field] = target_list = []

        for value in values:
            if action == "remove" and value in target_list:
                target_list.remove(value)
                updated_ids.add(normalize_id(station.get("id")))
            elif action == "add" and value not in target_list:
                target_list.append(value)
                updated_ids.add(normalize_id(station.get("id")))

    success, write_error = write_json_file(file_key, data)
    if not success:
        return jsonify({"error": f"Write failed: {write_error}"}), 500

    return jsonify(
        {
            "message": f"Action '{action}' completed on field '{field}'.",
            "updated_count": len(updated_ids),
            "updated_ids": list(updated_ids),
        }
    )


@app.route("/api/export/<string:file_key>")
def export_to_excel(file_key):
    data, error = read_json_file(file_key)
    if error:
        return jsonify({"error": error}), 500

    station_list = data.get("STATION", [])
    df = pd.DataFrame(station_list)
    for column in ARRAY_FIELDS:
        if column in df.columns:
            df[column] = df[column].apply(lambda x: ", ".join(map(str, x)) if isinstance(x, list) else x)

    output = io.BytesIO()
    writer = pd.ExcelWriter(output, engine="openpyxl")
    df.to_excel(writer, index=False, sheet_name="Stations")
    writer.close()
    output.seek(0)
    return send_file(
        output,
        as_attachment=True,
        download_name=f"{file_key}_stations.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.route("/api/markers/<string:file_key>", methods=["GET"])
def get_markers(file_key):
    data, error = read_json_file(file_key)
    if error:
        return jsonify({"error": error}), 500
    return jsonify(data.get("STATION", []))


@app.route("/api/markers/<string:file_key>", methods=["PATCH"])
def update_multiple_markers(file_key):
    updates = request.get_json() or []
    data, error = read_json_file(file_key)
    if error:
        return jsonify({"error": error}), 500

    config, config_error = read_schedule_config()
    if config_error:
        return jsonify({"error": config_error}), 500

    stations_map = {normalize_id(station.get("id")): station for station in data["STATION"]}
    updated_ids, not_found_ids = [], []

    for item in updates:
        marker_id = normalize_id(item.get("id"))
        changes = item.get("changes", {})
        station = stations_map.get(marker_id)
        if not station:
            not_found_ids.append(item.get("id"))
            continue

        if "schedule_group_code" in changes and changes["schedule_group_code"]:
            group_code = normalize_id(changes["schedule_group_code"]).upper()
            if not any(group["code"] == group_code for group in config["groups"]):
                return jsonify({"error": f"Unknown group '{group_code}'."}), 400
            changes["schedule_group_code"] = group_code
        elif "schedule_group_code" in changes:
            changes["schedule_group_code"] = ""

        if "schedule_key" in changes and isinstance(changes["schedule_key"], str):
            changes["schedule_key"] = normalize_schedule_key(changes["schedule_key"])
            if changes["schedule_key"] and not schedule_exists(changes["schedule_key"], config):
                return jsonify({"error": f"Unknown schedule '{changes['schedule_key']}'."}), 400

        if "status" in changes and isinstance(changes["status"], str):
            changes["status"] = normalize_schedule_key(changes["status"])
            if changes["status"] and not is_special_status(changes["status"]):
                if schedule_exists(changes["status"], config):
                    changes["schedule_key"] = changes["status"]
                    changes["status"] = ""
                else:
                    return jsonify({"error": f"Unknown special status '{changes['status']}'."}), 400

        station.update(changes)
        try:
            normalize_station_schedule_fields(station, config)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        updated_ids.append(item.get("id"))

    success, write_error = write_json_file(file_key, data)
    if not success:
        return jsonify({"error": write_error}), 500
    return jsonify({"updated_ids": updated_ids, "not_found_ids": not_found_ids})


@app.route("/api/markers/<string:file_key>", methods=["POST"])
def add_marker(file_key):
    new_marker = ensure_marker_defaults(request.get_json() or {})
    data, error = read_json_file(file_key)
    if error:
        return jsonify({"error": error}), 500

    config, config_error = read_schedule_config()
    if config_error:
        return jsonify({"error": config_error}), 500

    if new_marker.get("schedule_group_code"):
        code = normalize_id(new_marker["schedule_group_code"]).upper()
        if not any(group["code"] == code for group in config["groups"]):
            return jsonify({"error": f"Unknown group '{code}'."}), 400
        new_marker["schedule_group_code"] = code

    try:
        normalize_station_schedule_fields(new_marker, config)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    data["STATION"].append(new_marker)
    success, write_error = write_json_file(file_key, data)
    if not success:
        return jsonify({"error": write_error}), 500
    return jsonify(new_marker), 201


@app.route("/api/markers/<string:file_key>/<string:marker_id>", methods=["PUT"])
def update_marker(file_key, marker_id):
    update_data = ensure_marker_defaults(request.get_json() or {})
    data, error = read_json_file(file_key)
    if error:
        return jsonify({"error": error}), 500

    config, config_error = read_schedule_config()
    if config_error:
        return jsonify({"error": config_error}), 500

    if update_data.get("schedule_group_code"):
        code = normalize_id(update_data["schedule_group_code"]).upper()
        if not any(group["code"] == code for group in config["groups"]):
            return jsonify({"error": f"Unknown group '{code}'."}), 400
        update_data["schedule_group_code"] = code

    try:
        normalize_station_schedule_fields(update_data, config)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    target_id = normalize_id(marker_id)
    updated_marker = None
    for index, marker in enumerate(data["STATION"]):
        if normalize_id(marker.get("id")) == target_id:
            data["STATION"][index] = update_data
            updated_marker = update_data
            break

    if updated_marker is None:
        return jsonify({"error": "Not found"}), 404

    success, write_error = write_json_file(file_key, data)
    if not success:
        return jsonify({"error": write_error}), 500
    return jsonify(updated_marker)


@app.route("/api/markers/<string:file_key>/<string:marker_id>", methods=["DELETE"])
def delete_marker(file_key, marker_id):
    data, error = read_json_file(file_key)
    if error:
        return jsonify({"error": error}), 500

    original_count = len(data["STATION"])
    marker_id = normalize_id(marker_id)
    data["STATION"] = [marker for marker in data["STATION"] if normalize_id(marker.get("id")) != marker_id]
    if len(data["STATION"]) == original_count:
        return jsonify({"error": "Not Found"}), 404

    success, write_error = write_json_file(file_key, data)
    if not success:
        return jsonify({"error": write_error}), 500
    return jsonify({"message": "Deleted"})


@app.route("/api/markers/<string:file_key>/bulk_delete", methods=["POST"])
def bulk_delete_markers(file_key):
    req_data = request.get_json() or {}
    ids_to_delete = req_data.get("ids", [])
    if not ids_to_delete:
        return jsonify({"error": "No IDs provided."}), 400

    data, error = read_json_file(file_key)
    if error:
        return jsonify({"error": error}), 500

    id_set = {normalize_id(id_value) for id_value in ids_to_delete}
    existing_ids = {normalize_id(station.get("id")) for station in data["STATION"]}
    deleted_ids = [id_value for id_value in ids_to_delete if normalize_id(id_value) in existing_ids]
    not_found_ids = [id_value for id_value in ids_to_delete if normalize_id(id_value) not in existing_ids]
    data["STATION"] = [marker for marker in data["STATION"] if normalize_id(marker.get("id")) not in id_set]

    success, write_error = write_json_file(file_key, data)
    if not success:
        return jsonify({"error": f"Write failed: {write_error}"}), 500

    return jsonify(
        {
            "message": f"Deleted {len(deleted_ids)} station(s).",
            "deleted_count": len(deleted_ids),
            "deleted_ids": deleted_ids,
            "not_found_ids": not_found_ids,
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=7000, debug=True)

